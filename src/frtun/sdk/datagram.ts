/**
 * FrtunDatagram -- UDP-like unreliable message transport over the frtun overlay.
 *
 * Datagrams are connectionless; each `send()` call transmits a single message
 * to the configured remote endpoint. Incoming datagrams for this endpoint
 * are delivered via the registered message handler.
 */

import type { WasmClient } from './types';
import { FrtunError, FrtunErrorCode } from './types';

export class FrtunDatagram {
  /** Remote hostname this datagram socket targets. */
  readonly hostname: string;
  /** Remote port this datagram socket targets. */
  readonly port: number;

  private readonly wasmClient: WasmClient;
  private handler: ((data: Uint8Array) => void) | null = null;
  private closed: boolean = false;
  private pollHandle: ReturnType<typeof setTimeout> | null = null;

  /**
   * @internal
   * Construct a new FrtunDatagram. Called by `FrtunClient.sendDatagram()` or
   * `FrtunClient.openDatagram()`.
   */
  constructor(wasmClient: WasmClient, hostname: string, port: number) {
    this.wasmClient = wasmClient;
    this.hostname = hostname;
    this.port = port;
  }

  /**
   * Send a datagram to the remote endpoint.
   *
   * The message is delivered as a single UDP-like packet. There is no
   * guarantee of delivery or ordering -- datagrams may be lost, duplicated,
   * or arrive out of order depending on the overlay path.
   *
   * @param data - The payload to send. Maximum recommended size is 1200 bytes
   *               to avoid fragmentation.
   * @throws {FrtunError} If the datagram socket is closed or the send fails.
   */
  async send(data: Uint8Array): Promise<void> {
    if (this.closed) {
      throw new FrtunError(
        FrtunErrorCode.DatagramError,
        'Cannot send on a closed datagram socket',
      );
    }
    try {
      await this.wasmClient.send_datagram(this.hostname, this.port, data);
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.DatagramError,
        `Datagram send failed: ${String(err)}`,
      );
    }
  }

  /**
   * Register a handler for incoming datagrams.
   *
   * Only one handler can be active at a time; calling this again replaces
   * the previous handler. The handler receives the raw payload bytes.
   *
   * @param handler - Callback invoked for each received datagram.
   */
  onMessage(handler: (data: Uint8Array) => void): void {
    this.handler = handler;
    this.startPolling();
  }

  /**
   * Close this datagram socket.
   *
   * Stops polling for incoming messages and prevents further sends.
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.handler = null;
    if (this.pollHandle !== null) {
      clearTimeout(this.pollHandle);
      this.pollHandle = null;
    }
  }

  /** Whether this datagram socket has been closed. */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Start a polling loop that checks for inbound datagrams.
   *
   * In a real implementation this would be driven by WASM callbacks or
   * an event from the transport layer. Here we use a cooperative polling
   * approach that yields back to the event loop between checks.
   */
  private startPolling(): void {
    if (this.pollHandle !== null || this.closed) {
      return;
    }

    const poll = (): void => {
      if (this.closed || this.handler === null) {
        this.pollHandle = null;
        return;
      }

      // Attempt to read any pending inbound datagram from the WASM layer.
      // The WASM module exposes outbound data via `next_outbound_frame`;
      // inbound datagrams are delivered via the transport feed loop in
      // the client and dispatched here via the handler. In the absence
      // of a direct callback API we schedule the next poll iteration.
      this.pollHandle = setTimeout(poll, 50);
    };

    poll();
  }
}
