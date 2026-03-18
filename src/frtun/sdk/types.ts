/**
 * TypeScript type definitions for the frtun browser SDK.
 *
 * These interfaces mirror the Rust configuration structures from `frtun-config`
 * and define the event and option types used throughout the SDK.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Transport layer configuration for connecting to an frtun relay. */
export interface TransportConfig {
  /** Transport method: "wss", "ws", or "quic". */
  method: string;
  /** Remote relay server hostname or IP. */
  server: string;
  /** Remote relay server port. */
  port: number;
  /** URL path for WebSocket-based transports (e.g. "/ws"). */
  path?: string;
  /** Authentication token or credential sent during handshake. */
  auth?: string;
}

/** Identity configuration for the local node. */
export interface IdentityConfig {
  /** ML-DSA-65 public key bytes. */
  publicKey: Uint8Array;
  /** ML-DSA-65 secret key bytes. */
  secretKey: Uint8Array;
  /** Human-readable peer name derived from the public key. */
  peerName: string;
}

/** DNS configuration for the virtual network stack. */
export interface DnsConfig {
  /** CIDR range used for synthetic bogon address allocation (e.g. "100.64.0.0/10"). */
  bogonRange: string;
  /** TLD suffixes to intercept and resolve within the overlay (e.g. [".peer"]). */
  interceptTlds: string[];
  /** Optional upstream DNS servers for non-intercepted queries. */
  upstream?: string[];
  /** Mapping of TLDs to target peer names for routing (e.g. { ".onion": "exit-relay-1" }). */
  tldRoutes?: Record<string, string>;
}

/** Top-level configuration for the frtun browser client. */
export interface FrtunConfig {
  /** Network transport settings. */
  transport: TransportConfig;
  /** Optional identity; if omitted, a new ephemeral identity is generated. */
  identity?: IdentityConfig;
  /** Optional DNS resolver settings. */
  dns?: DnsConfig;
  /** Whether to automatically reconnect on connection loss. */
  autoReconnect?: boolean;
  /** Maximum number of reconnection attempts (default: unlimited). */
  maxReconnectAttempts?: number;
  /** Whether to persist session state in IndexedDB. */
  persistSession?: boolean;
}

// ---------------------------------------------------------------------------
// Stream and datagram options
// ---------------------------------------------------------------------------

/** Options for opening a TCP-like stream through the overlay. */
export interface StreamOptions {
  /** Target hostname (peer name or .peer domain). */
  hostname: string;
  /** Target port number. */
  port: number;
  /** Whether to perform a TLS handshake after connecting. */
  tls?: boolean;
}

/** Options for sending a UDP-like datagram through the overlay. */
export interface DatagramOptions {
  /** Target hostname (peer name or .peer domain). */
  hostname: string;
  /** Target port number. */
  port: number;
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

/**
 * Represents the current state of the overlay connection.
 *
 * - `disconnected` -- No active connection; initial state or after explicit disconnect.
 * - `connecting`   -- Establishing transport and performing handshake.
 * - `connected`    -- Fully connected and ready for traffic.
 * - `reconnecting` -- Connection was lost; attempting to re-establish.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Event handler signatures emitted by FrtunClient. */
export interface FrtunEvents {
  /** Fired when the connection state changes. */
  stateChange: (state: ConnectionState) => void;
  /** Fired when an unrecoverable error occurs. */
  error: (error: FrtunError) => void;
  /** Fired when a raw message arrives on the primary data channel. */
  message: (data: Uint8Array) => void;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Base error class for all frtun SDK errors. */
export class FrtunError extends Error {
  /** Machine-readable error code. */
  readonly code: FrtunErrorCode;

  constructor(code: FrtunErrorCode, message: string) {
    super(message);
    this.name = 'FrtunError';
    this.code = code;
  }
}

/** Error codes as const object (compatible with erasableSyntaxOnly). */
export const FrtunErrorCode = {
  /** The WASM module failed to load or initialize. */
  WasmInitFailed: 'WASM_INIT_FAILED',
  /** Transport connection could not be established. */
  ConnectionFailed: 'CONNECTION_FAILED',
  /** The connection was unexpectedly closed. */
  ConnectionClosed: 'CONNECTION_CLOSED',
  /** A stream operation failed. */
  StreamError: 'STREAM_ERROR',
  /** A datagram operation failed. */
  DatagramError: 'DATAGRAM_ERROR',
  /** A topic/pubsub operation failed. */
  TopicError: 'TOPIC_ERROR',
  /** DNS resolution failed. */
  DnsError: 'DNS_ERROR',
  /** The requested operation is not valid in the current state. */
  InvalidState: 'INVALID_STATE',
  /** Configuration is invalid or incomplete. */
  ConfigError: 'CONFIG_ERROR',
  /** A timeout expired. */
  Timeout: 'TIMEOUT',
  /** TLS upgrade failed. */
  TlsError: 'TLS_ERROR',
  /** HTTP protocol error in the fetch polyfill. */
  HttpError: 'HTTP_ERROR',
} as const;

export type FrtunErrorCode = typeof FrtunErrorCode[keyof typeof FrtunErrorCode];

// ---------------------------------------------------------------------------
// WASM module type stubs
// ---------------------------------------------------------------------------

/**
 * Shape of the WASM module exported by `frtun-wasm`.
 *
 * This interface describes the functions and classes we expect from
 * `wasm-pkg/frtun_wasm.js`. The actual WASM build generates these
 * bindings via `wasm-bindgen`.
 */
export interface WasmModule {
  /** Initialize panic hook and logging. */
  init(): void;

  /** Create a new WASM-side client instance from a JSON config string. */
  WasmClient: {
    new (configJson: string): WasmClient;
  };
}

/** WASM-side client instance methods. */
export interface WasmClient {
  /** Connect the transport layer. */
  connect(): Promise<void>;
  /** Disconnect and clean up. */
  disconnect(): void;
  /** Open a new multiplexed stream, returning its numeric ID. */
  open_stream(): Promise<number>;
  /** Write data to a stream. */
  stream_write(streamId: number, data: Uint8Array): Promise<void>;
  /** Read data from a stream; returns null on EOF. */
  stream_read(streamId: number): Promise<Uint8Array | null>;
  /** Close a stream. */
  stream_close(streamId: number): void;
  /** Upgrade a stream to TLS. */
  stream_upgrade_tls(streamId: number, hostname: string): Promise<void>;
  /** Send a UDP datagram. */
  send_datagram(hostname: string, port: number, data: Uint8Array): Promise<void>;
  /** Subscribe to a gossipsub topic, returning a subscription handle ID. */
  subscribe_topic(topic: string): Promise<number>;
  /** Publish to a gossipsub topic. */
  publish_topic(subscriptionId: number, data: Uint8Array): Promise<void>;
  /** Unsubscribe from a gossipsub topic. */
  unsubscribe_topic(subscriptionId: number): void;
  /** Poll for the next message on a topic subscription. */
  topic_next_message(subscriptionId: number): Promise<{ data: Uint8Array; from: string } | null>;
  /** Resolve a peer name to a bogon IP address string. */
  resolve_peer_name(peerName: string): string;
  /** Feed raw transport data into the WASM client. */
  feed_transport_data(data: Uint8Array): void;
  /** Retrieve the next outbound transport frame, or null if none pending. */
  next_outbound_frame(): Uint8Array | null;
  /** Check if the client is connected. */
  is_connected(): boolean;
}

// ---------------------------------------------------------------------------
// Session persistence types
// ---------------------------------------------------------------------------

/** Data stored in IndexedDB for session persistence. */
export interface SessionData {
  /** Identity public key bytes (hex-encoded for storage). */
  publicKeyHex: string;
  /** Identity secret key bytes (hex-encoded for storage). */
  secretKeyHex: string;
  /** Human-readable peer name. */
  peerName: string;
  /** Last-used relay server address. */
  lastServer?: string;
  /** Timestamp of last successful connection. */
  lastConnected?: number;
  /** Cached DNS bogon allocations. */
  dnsCache?: Record<string, string>;
  /** Known peer endpoints. */
  knownPeers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Worker message types
// ---------------------------------------------------------------------------

/** Messages sent between the main thread and SharedWorker. */
export type WorkerMessage =
  | { type: 'connect'; config: FrtunConfig }
  | { type: 'disconnect' }
  | { type: 'open_stream'; hostname: string; port: number; requestId: number }
  | { type: 'stream_write'; streamId: number; data: Uint8Array; requestId: number }
  | { type: 'stream_read'; streamId: number; requestId: number }
  | { type: 'stream_close'; streamId: number }
  | { type: 'send_datagram'; hostname: string; port: number; data: Uint8Array; requestId: number }
  | { type: 'subscribe_topic'; topic: string; requestId: number }
  | { type: 'publish_topic'; subscriptionId: number; data: Uint8Array; requestId: number }
  | { type: 'unsubscribe_topic'; subscriptionId: number }
  | { type: 'state_change'; state: ConnectionState }
  | { type: 'error'; error: string; code: FrtunErrorCode }
  | { type: 'response'; requestId: number; data?: unknown; error?: string };
