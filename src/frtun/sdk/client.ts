/**
 * FrtunClient -- main entry point for the frtun browser SDK.
 *
 * Wraps the WASM module (`frtun-wasm`) and provides an ergonomic async API
 * for connecting to the overlay network, opening streams, sending datagrams,
 * subscribing to gossipsub topics, and resolving peer names.
 *
 * @example
 * ```ts
 * const client = await FrtunClient.create({
 *   transport: { method: 'wss', server: 'relay.example.com', port: 443, path: '/ws' },
 * });
 * await client.connect();
 * const stream = await client.openTcpStream('my-service.peer', 80);
 * await stream.write(new TextEncoder().encode('GET / HTTP/1.1\r\nHost: my-service.peer\r\n\r\n'));
 * const response = await stream.read();
 * ```
 */

import type {
  FrtunConfig,
  FrtunEvents,
  ConnectionState,
  WasmModule,
  WasmClient,
} from './types';
import { FrtunError, FrtunErrorCode } from './types';
import { FrtunStream } from './stream';
import { FrtunDatagram } from './datagram';
import { TopicSubscription } from './topic';
import { WebSocketTransport } from './transport/websocket';
import { ReconnectManager } from './session/reconnect';
import { SessionStore } from './session/store';

export class FrtunClient {
  /** The loaded WASM module. */
  private wasm: WasmModule | null = null;
  /** The instantiated WASM client. */
  private wasmClient: WasmClient | null = null;
  /** Resolved configuration. */
  private config: FrtunConfig;
  /** Current connection state. */
  private state: ConnectionState = 'disconnected';
  /** Event listeners keyed by event name. */
  private listeners: { [K in keyof FrtunEvents]?: Set<FrtunEvents[K]> } = {};
  /** Transport manager. */
  private transport: WebSocketTransport | null = null;
  /** Reconnection manager. */
  private reconnectManager: ReconnectManager | null = null;
  /** Session persistence store. */
  private sessionStore: SessionStore | null = null;
  /** In-memory DNS cache mapping peer names to bogon IPs. */
  private dnsCache: Map<string, string> = new Map();
  /** Transport data pump interval handle. */
  private pumpHandle: ReturnType<typeof setInterval> | null = null;

  private constructor(config: FrtunConfig) {
    this.config = config;
  }

  /**
   * Create and initialize a new FrtunClient.
   *
   * This is the recommended way to obtain a client instance. It loads the
   * WASM module, optionally restores session state from IndexedDB, and
   * prepares the client for connection.
   *
   * @param config - A `FrtunConfig` object, or a TOML configuration string.
   * @returns A fully initialized `FrtunClient` ready for `.connect()`.
   * @throws {FrtunError} If the WASM module cannot be loaded or the config is invalid.
   */
  static async create(config: FrtunConfig | string): Promise<FrtunClient> {
    let resolvedConfig: FrtunConfig;

    if (typeof config === 'string') {
      resolvedConfig = FrtunClient.parseTomlConfig(config);
    } else {
      resolvedConfig = config;
    }

    FrtunClient.validateConfig(resolvedConfig);

    const client = new FrtunClient(resolvedConfig);

    // Load and initialize the WASM module.
    try {
      const wasmModule = await import('../wasm-pkg/frtun_wasm') as unknown as WasmModule;
      wasmModule.init();
      client.wasm = wasmModule;
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.WasmInitFailed,
        `Failed to load frtun WASM module: ${String(err)}`,
      );
    }

    // Set up session persistence if requested.
    if (resolvedConfig.persistSession) {
      client.sessionStore = new SessionStore();
      await client.sessionStore.open();

      // Restore cached DNS entries.
      const session = await client.sessionStore.load();
      if (session?.dnsCache) {
        for (const [name, ip] of Object.entries(session.dnsCache)) {
          client.dnsCache.set(name, ip);
        }
      }
    }

    // Set up reconnection if configured.
    if (resolvedConfig.autoReconnect !== false) {
      client.reconnectManager = new ReconnectManager({
        maxAttempts: resolvedConfig.maxReconnectAttempts,
        onReconnect: async () => {
          await client.connectInternal();
        },
        onStateChange: (reconnecting) => {
          if (reconnecting) {
            client.setState('reconnecting');
          }
        },
      });
    }

    return client;
  }

  /**
   * Connect to the overlay network.
   *
   * Establishes the transport connection to the configured relay and performs
   * the initial handshake. The client transitions through `connecting` to
   * `connected` state.
   *
   * @throws {FrtunError} If the connection cannot be established.
   */
  async connect(): Promise<void> {
    if (this.state === 'connected') {
      return;
    }
    if (this.state === 'connecting') {
      throw new FrtunError(
        FrtunErrorCode.InvalidState,
        'Connection already in progress',
      );
    }
    await this.connectInternal();
  }

  /**
   * Disconnect from the overlay network.
   *
   * Gracefully shuts down the transport connection, stops polling, and
   * transitions to `disconnected` state. If auto-reconnect is enabled,
   * it is cancelled.
   */
  async disconnect(): Promise<void> {
    if (this.reconnectManager) {
      this.reconnectManager.cancel();
    }
    this.stopPump();

    if (this.wasmClient) {
      try {
        this.wasmClient.disconnect();
      } catch {
        // Ignore errors during shutdown.
      }
    }

    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }

    this.setState('disconnected');
  }

  /**
   * Open a TCP-like bidirectional stream to a remote host.
   *
   * The stream is multiplexed over the existing transport connection.
   * If the hostname ends with `.peer`, it is resolved through the overlay
   * DNS system.
   *
   * @param hostname - Target hostname or peer name.
   * @param port - Target port number.
   * @returns A connected `FrtunStream`.
   * @throws {FrtunError} If the client is not connected or the stream cannot be opened.
   */
  async openTcpStream(hostname: string, port: number): Promise<FrtunStream> {
    this.assertConnected();

    try {
      const streamId = await this.wasmClient!.open_stream();
      return new FrtunStream(this.wasmClient!, streamId, hostname, port);
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.StreamError,
        `Failed to open stream to ${hostname}:${port}: ${String(err)}`,
      );
    }
  }

  /**
   * Send a single UDP-like datagram to a remote host.
   *
   * This is a fire-and-forget operation with no delivery guarantee.
   *
   * @param hostname - Target hostname or peer name.
   * @param port - Target port number.
   * @param data - Payload bytes to send.
   * @throws {FrtunError} If the client is not connected or the send fails.
   */
  async sendDatagram(hostname: string, port: number, data: Uint8Array): Promise<void> {
    this.assertConnected();

    try {
      await this.wasmClient!.send_datagram(hostname, port, data);
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.DatagramError,
        `Failed to send datagram to ${hostname}:${port}: ${String(err)}`,
      );
    }
  }

  /**
   * Create a reusable datagram socket to a remote host.
   *
   * @param hostname - Target hostname or peer name.
   * @param port - Target port number.
   * @returns A `FrtunDatagram` instance for sending and receiving datagrams.
   * @throws {FrtunError} If the client is not connected.
   */
  openDatagram(hostname: string, port: number): FrtunDatagram {
    this.assertConnected();
    return new FrtunDatagram(this.wasmClient!, hostname, port);
  }

  /**
   * Subscribe to a gossipsub topic.
   *
   * @param topic - The topic name to subscribe to.
   * @returns A `TopicSubscription` for publishing and receiving messages.
   * @throws {FrtunError} If the client is not connected or subscription fails.
   */
  async subscribeTopic(topic: string): Promise<TopicSubscription> {
    this.assertConnected();

    try {
      const subId = await this.wasmClient!.subscribe_topic(topic);
      return new TopicSubscription(this.wasmClient!, subId, topic);
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.TopicError,
        `Failed to subscribe to topic "${topic}": ${String(err)}`,
      );
    }
  }

  /**
   * Resolve a peer name to its synthetic bogon IP address.
   *
   * Peer names (e.g. "alice.peer") are resolved to IPs within the configured
   * bogon range (default 100.64.0.0/10). Results are cached in memory and
   * optionally persisted in IndexedDB.
   *
   * @param peerName - The peer name to resolve (e.g. "alice.peer").
   * @returns A bogon IPv4 address string (e.g. "100.64.0.42").
   * @throws {FrtunError} If the client is not initialized.
   */
  resolvePeerName(peerName: string): string {
    // Check cache first.
    const cached = this.dnsCache.get(peerName);
    if (cached !== undefined) {
      return cached;
    }

    if (!this.wasmClient) {
      throw new FrtunError(
        FrtunErrorCode.DnsError,
        'Client not initialized; cannot resolve peer name',
      );
    }

    try {
      const ip = this.wasmClient.resolve_peer_name(peerName);
      this.dnsCache.set(peerName, ip);

      // Persist to session store asynchronously.
      if (this.sessionStore) {
        const cacheObj: Record<string, string> = {};
        for (const [k, v] of this.dnsCache) {
          cacheObj[k] = v;
        }
        void this.sessionStore.updateDnsCache(cacheObj);
      }

      return ip;
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.DnsError,
        `Failed to resolve peer name "${peerName}": ${String(err)}`,
      );
    }
  }

  /** Get the current connection state. */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Register an event handler.
   *
   * @param event - The event name.
   * @param handler - The callback function.
   */
  on<K extends keyof FrtunEvents>(event: K, handler: FrtunEvents[K]): void {
    if (!this.listeners[event]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.listeners[event] = new Set() as any;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.listeners[event] as Set<any>).add(handler);
  }

  /**
   * Unregister an event handler.
   *
   * @param event - The event name.
   * @param handler - The callback function to remove.
   */
  off<K extends keyof FrtunEvents>(event: K, handler: FrtunEvents[K]): void {
    const set = this.listeners[event] as Set<FrtunEvents[K]> | undefined;
    if (set) {
      set.delete(handler);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Internal connect implementation shared between initial connect and reconnect. */
  private async connectInternal(): Promise<void> {
    this.setState('connecting');

    try {
      // Instantiate the WASM client with config.
      const configJson = JSON.stringify({
        transport: {
          method: this.config.transport.method,
          server: this.config.transport.server,
          port: this.config.transport.port,
          path: this.config.transport.path ?? null,
          auth: this.config.transport.auth ?? null,
        },
        dns: this.config.dns ? {
          bogon_range: this.config.dns.bogonRange,
          intercept_tlds: this.config.dns.interceptTlds,
        } : null,
      });

      this.wasmClient = new this.wasm!.WasmClient(configJson);

      // Set up WebSocket transport.
      const { method, server, port, path } = this.config.transport;
      const protocol = method === 'ws' ? 'ws' : 'wss';
      const wsPath = path ?? '/ws';
      const url = `${protocol}://${server}:${port}${wsPath}`;

      this.transport = new WebSocketTransport(url, {
        onMessage: (data: Uint8Array) => {
          // Feed transport data into the WASM client.
          if (this.wasmClient) {
            this.wasmClient.feed_transport_data(data);
          }
          this.emit('message', data);
        },
        onClose: () => {
          if (this.state === 'connected') {
            this.handleDisconnect();
          }
        },
        onError: (err: Error) => {
          this.emit('error', new FrtunError(
            FrtunErrorCode.ConnectionFailed,
            `Transport error: ${err.message}`,
          ));
        },
      });

      await this.transport.connect();

      // Tell the WASM client to perform its handshake.
      await this.wasmClient.connect();

      // Start the outbound frame pump.
      this.startPump();

      this.setState('connected');

      // Persist connection info.
      if (this.sessionStore) {
        void this.sessionStore.updateLastConnected(
          this.config.transport.server,
          Date.now(),
        );
      }
    } catch (err) {
      this.setState('disconnected');
      if (err instanceof FrtunError) {
        throw err;
      }
      throw new FrtunError(
        FrtunErrorCode.ConnectionFailed,
        `Connection failed: ${String(err)}`,
      );
    }
  }

  /**
   * Start the outbound frame pump.
   *
   * Periodically drains outbound frames from the WASM client and sends
   * them over the WebSocket transport.
   */
  private startPump(): void {
    this.stopPump();
    this.pumpHandle = setInterval(() => {
      this.pumpOutbound();
    }, 1);
  }

  /** Stop the outbound frame pump. */
  private stopPump(): void {
    if (this.pumpHandle !== null) {
      clearInterval(this.pumpHandle);
      this.pumpHandle = null;
    }
  }

  /** Drain all pending outbound frames from the WASM client. */
  private pumpOutbound(): void {
    if (!this.wasmClient || !this.transport) {
      return;
    }

    // Drain up to 64 frames per pump cycle to avoid starving the event loop.
    for (let i = 0; i < 64; i++) {
      try {
        const frame = this.wasmClient.next_outbound_frame();
        if (frame === null) {
          break;
        }
        this.transport.send(frame);
      } catch {
        break;
      }
    }
  }

  /** Handle an unexpected disconnection from the transport. */
  private handleDisconnect(): void {
    this.stopPump();

    if (this.reconnectManager && this.config.autoReconnect !== false) {
      this.setState('reconnecting');
      void this.reconnectManager.start();
    } else {
      this.setState('disconnected');
    }
  }

  /** Update state and emit the stateChange event. */
  private setState(newState: ConnectionState): void {
    if (this.state === newState) {
      return;
    }
    this.state = newState;
    this.emit('stateChange', newState);
  }

  /** Emit an event to all registered listeners. */
  private emit<K extends keyof FrtunEvents>(event: K, ...args: Parameters<FrtunEvents[K]>): void {
    const set = this.listeners[event] as Set<FrtunEvents[K]> | undefined;
    if (!set) {
      return;
    }
    for (const handler of set) {
      try {
        (handler as (...a: Parameters<FrtunEvents[K]>) => void)(...args);
      } catch {
        // Do not let a listener error break the emission loop.
      }
    }
  }

  /** Throw if the client is not in the connected state. */
  private assertConnected(): void {
    if (this.state !== 'connected' || !this.wasmClient) {
      throw new FrtunError(
        FrtunErrorCode.InvalidState,
        `Client is not connected (current state: ${this.state})`,
      );
    }
  }

  /**
   * Parse a TOML configuration string into a FrtunConfig.
   *
   * This is a minimal parser that extracts the transport, identity, and dns
   * sections. A full TOML parser is included in the WASM module.
   */
  private static parseTomlConfig(toml: string): FrtunConfig {
    // Extract key-value pairs with a simple regex-based approach.
    // For production use, the WASM side handles full TOML parsing; this is
    // a convenience for the common case.
    const get = (section: string, key: string): string | undefined => {
      const sectionRegex = new RegExp(
        `\\[${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]([\\s\\S]*?)(?=\\[|$)`,
      );
      const sectionMatch = toml.match(sectionRegex);
      if (!sectionMatch) return undefined;
      const kvRegex = new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]+)["']?`, 'm');
      const kvMatch = sectionMatch[1].match(kvRegex);
      return kvMatch ? kvMatch[1].trim() : undefined;
    };

    const method = get('transport', 'method');
    const server = get('transport', 'server');
    const portStr = get('transport', 'port');
    const path = get('transport', 'path');
    const auth = get('transport', 'auth');

    if (!method || !server) {
      throw new FrtunError(
        FrtunErrorCode.ConfigError,
        'TOML config must include [transport] with at least "method" and "server"',
      );
    }

    const config: FrtunConfig = {
      transport: {
        method,
        server,
        port: portStr ? parseInt(portStr, 10) : 443,
        path: path ?? undefined,
        auth: auth ?? undefined,
      },
    };

    // DNS section.
    const bogonRange = get('dns', 'bogon_range');
    if (bogonRange) {
      config.dns = {
        bogonRange,
        interceptTlds: ['.peer'],
      };
    }

    return config;
  }

  /** Validate a FrtunConfig, throwing on invalid values. */
  private static validateConfig(config: FrtunConfig): void {
    const validMethods = ['wss', 'ws', 'quic'];
    if (!validMethods.includes(config.transport.method)) {
      throw new FrtunError(
        FrtunErrorCode.ConfigError,
        `Invalid transport method "${config.transport.method}"; expected one of: ${validMethods.join(', ')}`,
      );
    }
    if (!config.transport.server) {
      throw new FrtunError(
        FrtunErrorCode.ConfigError,
        'transport.server is required',
      );
    }
    if (config.transport.port <= 0 || config.transport.port > 65535) {
      throw new FrtunError(
        FrtunErrorCode.ConfigError,
        `Invalid port number: ${config.transport.port}`,
      );
    }
  }
}
