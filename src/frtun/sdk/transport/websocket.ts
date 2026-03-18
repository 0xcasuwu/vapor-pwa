/**
 * WebSocket transport manager for the frtun overlay network.
 *
 * Manages a single WebSocket connection in binary (ArrayBuffer) mode with
 * connection state tracking, outbound message queuing during reconnection,
 * and periodic heartbeat pings.
 */

import { FrtunError, FrtunErrorCode } from '../types';

/** Configuration callbacks for the WebSocket transport. */
export interface WebSocketTransportCallbacks {
  /** Called when a binary message is received from the relay. */
  onMessage: (data: Uint8Array) => void;
  /** Called when the WebSocket connection is closed. */
  onClose: () => void;
  /** Called when a WebSocket error occurs. */
  onError: (error: Error) => void;
}

/** State of the WebSocket transport. */
export type WebSocketState = 'closed' | 'connecting' | 'open' | 'closing';

/** Default heartbeat interval in milliseconds. */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000;

/** Maximum number of queued messages during reconnection. */
const MAX_QUEUE_SIZE = 1024;

export class WebSocketTransport {
  /** WebSocket endpoint URL. */
  private readonly url: string;
  /** User callbacks. */
  private readonly callbacks: WebSocketTransportCallbacks;
  /** The underlying WebSocket instance. */
  private ws: WebSocket | null = null;
  /** Current transport state. */
  private _state: WebSocketState = 'closed';
  /** Outbound message queue used when the socket is temporarily unavailable. */
  private queue: Uint8Array[] = [];
  /** Heartbeat interval handle. */
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  /** Heartbeat interval in milliseconds. */
  private readonly heartbeatIntervalMs: number;
  /** Timestamp of the last received message (for heartbeat logic). */
  private lastReceivedAt: number = 0;

  /**
   * Create a new WebSocket transport.
   *
   * @param url - The WebSocket URL to connect to (e.g. "wss://relay.example.com:443/ws").
   * @param callbacks - Event callbacks for message, close, and error events.
   * @param heartbeatIntervalMs - Heartbeat ping interval in ms (default 25000).
   */
  constructor(
    url: string,
    callbacks: WebSocketTransportCallbacks,
    heartbeatIntervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
  ) {
    this.url = url;
    this.callbacks = callbacks;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
  }

  /** Current state of the transport. */
  get state(): WebSocketState {
    return this._state;
  }

  /**
   * Connect to the WebSocket endpoint.
   *
   * Returns a promise that resolves when the connection is established
   * or rejects if the connection fails.
   *
   * @throws {FrtunError} If the connection cannot be established.
   */
  connect(): Promise<void> {
    if (this._state === 'open') {
      return Promise.resolve();
    }
    if (this._state === 'connecting') {
      return Promise.reject(new FrtunError(
        FrtunErrorCode.InvalidState,
        'WebSocket connection already in progress',
      ));
    }

    this._state = 'connecting';

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = 'arraybuffer';
      } catch (err) {
        this._state = 'closed';
        reject(new FrtunError(
          FrtunErrorCode.ConnectionFailed,
          `Failed to create WebSocket: ${String(err)}`,
        ));
        return;
      }

      this.ws.onopen = () => {
        this._state = 'open';
        this.lastReceivedAt = Date.now();
        this.drainQueue();
        this.startHeartbeat();
        resolve();
      };

      this.ws.onerror = (event: Event) => {
        const err = new Error(
          `WebSocket error: ${event instanceof ErrorEvent ? event.message : 'unknown'}`,
        );
        if (this._state === 'connecting') {
          this._state = 'closed';
          reject(new FrtunError(
            FrtunErrorCode.ConnectionFailed,
            err.message,
          ));
        } else {
          this.callbacks.onError(err);
        }
      };

      this.ws.onclose = () => {
        const wasOpen = this._state === 'open';
        this._state = 'closed';
        this.stopHeartbeat();
        if (wasOpen) {
          this.callbacks.onClose();
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.lastReceivedAt = Date.now();
        if (event.data instanceof ArrayBuffer) {
          this.callbacks.onMessage(new Uint8Array(event.data));
        } else if (event.data instanceof Blob) {
          // Convert Blob to ArrayBuffer asynchronously.
          void event.data.arrayBuffer().then((buf) => {
            this.callbacks.onMessage(new Uint8Array(buf));
          });
        }
      };
    });
  }

  /**
   * Send binary data over the WebSocket.
   *
   * If the socket is not currently open, the message is queued (up to
   * `MAX_QUEUE_SIZE` messages). Queued messages are automatically sent
   * when the connection is restored.
   *
   * @param data - Binary data to send.
   */
  send(data: Uint8Array): void {
    if (this._state === 'open' && this.ws) {
      try {
        this.ws.send(data.buffer);
      } catch {
        // If send fails, queue the message.
        this.enqueue(data);
      }
    } else {
      this.enqueue(data);
    }
  }

  /**
   * Close the WebSocket connection.
   *
   * Performs a clean close with status code 1000 (Normal Closure).
   */
  close(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this._state = 'closing';
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch {
        // Ignore errors on close.
      }
      this.ws = null;
    }
    this._state = 'closed';
    this.queue = [];
  }

  /** Number of messages currently queued. */
  get queueSize(): number {
    return this.queue.length;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Add a message to the outbound queue, dropping oldest if at capacity. */
  private enqueue(data: Uint8Array): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      // Drop the oldest message to make room.
      this.queue.shift();
    }
    this.queue.push(data);
  }

  /** Flush the outbound queue through the open WebSocket. */
  private drainQueue(): void {
    if (this._state !== 'open' || !this.ws) {
      return;
    }
    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;
      try {
        this.ws.send(msg.buffer);
      } catch {
        // Re-queue on failure and stop draining.
        this.queue.unshift(msg);
        break;
      }
    }
  }

  /** Start the heartbeat interval. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatHandle = setInterval(() => {
      if (this._state !== 'open' || !this.ws) {
        return;
      }
      // If we haven't received anything in 2x the heartbeat interval,
      // the connection may be stale.
      const elapsed = Date.now() - this.lastReceivedAt;
      if (elapsed > this.heartbeatIntervalMs * 2) {
        // Force-close the stale connection; the onclose handler will
        // trigger reconnection logic.
        this.ws.close(4000, 'Heartbeat timeout');
        return;
      }

      // Send a small ping frame. The frtun protocol uses a Ping frame type
      // in the mux layer. For the WebSocket transport, we send a zero-length
      // binary message as a keepalive signal. The actual protocol-level ping
      // is handled by the WASM mux layer.
      try {
        this.ws.send(new ArrayBuffer(0));
      } catch {
        // Ignore send errors on heartbeat.
      }
    }, this.heartbeatIntervalMs);
  }

  /** Stop the heartbeat interval. */
  private stopHeartbeat(): void {
    if (this.heartbeatHandle !== null) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }
}
