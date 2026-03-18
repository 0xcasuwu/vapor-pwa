/**
 * FrtunStream -- TCP-like bidirectional byte stream over the frtun overlay.
 *
 * Each stream is backed by a multiplexed stream in the WASM client. Data is
 * delivered in order and flow-controlled via the mux credit window.
 *
 * Streams also expose the Web Streams API (`ReadableStream` / `WritableStream`)
 * for interoperability with other browser APIs.
 */

import type { WasmClient } from './types';
import { FrtunError, FrtunErrorCode } from './types';

export class FrtunStream {
  /** Remote hostname this stream is connected to. */
  readonly hostname: string;
  /** Remote port this stream is connected to. */
  readonly port: number;
  /** The multiplexed stream identifier assigned by the WASM mux layer. */
  readonly streamId: number;

  private readonly wasmClient: WasmClient;
  private closed: boolean = false;
  private _readable: ReadableStream<Uint8Array> | null = null;
  private _writable: WritableStream<Uint8Array> | null = null;

  /**
   * @internal
   * Construct a new FrtunStream. This is called by `FrtunClient.openTcpStream()`.
   */
  constructor(
    wasmClient: WasmClient,
    streamId: number,
    hostname: string,
    port: number,
  ) {
    this.wasmClient = wasmClient;
    this.streamId = streamId;
    this.hostname = hostname;
    this.port = port;
  }

  /**
   * Write data to the stream.
   *
   * The returned promise resolves when the data has been accepted by the
   * underlying mux flow-control window. For large writes, data may be
   * buffered and sent in multiple frames.
   *
   * @param data - Bytes to send.
   * @throws {FrtunError} If the stream is closed or an I/O error occurs.
   */
  async write(data: Uint8Array): Promise<void> {
    if (this.closed) {
      throw new FrtunError(
        FrtunErrorCode.StreamError,
        `Cannot write to closed stream ${this.streamId}`,
      );
    }
    try {
      await this.wasmClient.stream_write(this.streamId, data);
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.StreamError,
        `Write failed on stream ${this.streamId}: ${String(err)}`,
      );
    }
  }

  /**
   * Read data from the stream.
   *
   * Returns the next chunk of bytes available, or `null` when the remote
   * side has closed the stream (EOF).
   *
   * @returns A `Uint8Array` of received bytes, or `null` on EOF.
   * @throws {FrtunError} If the stream is closed locally or an I/O error occurs.
   */
  async read(): Promise<Uint8Array | null> {
    if (this.closed) {
      return null;
    }
    try {
      const data = await this.wasmClient.stream_read(this.streamId);
      if (data === null) {
        // Remote closed the stream.
        return null;
      }
      return data;
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.StreamError,
        `Read failed on stream ${this.streamId}: ${String(err)}`,
      );
    }
  }

  /**
   * Upgrade this stream to TLS.
   *
   * Performs a TLS handshake over the existing stream using the provided
   * hostname for SNI and certificate verification. After this call
   * succeeds, all subsequent reads and writes are encrypted.
   *
   * @param hostname - The hostname to use for SNI and cert verification.
   * @throws {FrtunError} If the TLS handshake fails or the stream is closed.
   */
  async upgradeTls(hostname: string): Promise<void> {
    if (this.closed) {
      throw new FrtunError(
        FrtunErrorCode.TlsError,
        `Cannot upgrade closed stream ${this.streamId} to TLS`,
      );
    }
    try {
      await this.wasmClient.stream_upgrade_tls(this.streamId, hostname);
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.TlsError,
        `TLS upgrade failed on stream ${this.streamId}: ${String(err)}`,
      );
    }
  }

  /**
   * Close this stream.
   *
   * Sends a graceful close to the remote side. After calling this method
   * no more data can be written. Data may still be drained from the read
   * side until the remote also closes.
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.wasmClient.stream_close(this.streamId);
    } catch {
      // Best-effort close; ignore errors on already-closed streams.
    }
  }

  /** Whether this stream has been locally closed. */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Returns a `ReadableStream` that yields `Uint8Array` chunks.
   *
   * The stream is created lazily on first access and reads from the
   * underlying WASM stream. The readable stream is closed when EOF is
   * received from the remote side.
   */
  get readable(): ReadableStream<Uint8Array> {
    if (this._readable === null) {
      const self = this;
      this._readable = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = await self.read();
            if (chunk === null) {
              controller.close();
            } else {
              controller.enqueue(chunk);
            }
          } catch (err) {
            controller.error(err);
          }
        },
        cancel() {
          self.close();
        },
      });
    }
    return this._readable;
  }

  /**
   * Returns a `WritableStream` that accepts `Uint8Array` chunks.
   *
   * The stream is created lazily on first access and writes to the
   * underlying WASM stream. Closing the writable stream closes the
   * underlying frtun stream.
   */
  get writable(): WritableStream<Uint8Array> {
    if (this._writable === null) {
      const self = this;
      this._writable = new WritableStream<Uint8Array>({
        async write(chunk) {
          await self.write(chunk);
        },
        close() {
          self.close();
        },
        abort() {
          self.close();
        },
      });
    }
    return this._writable;
  }
}
