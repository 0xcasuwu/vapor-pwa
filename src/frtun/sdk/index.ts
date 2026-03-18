/**
 * @frtun/sdk -- Browser SDK for the frtun overlay network.
 *
 * This package provides a high-level TypeScript API for using the frtun
 * overlay network from the browser. It wraps the WASM bindings from
 * `frtun-wasm` and provides ergonomic APIs for:
 *
 * - **Connecting** to the overlay via WebSocket transport
 * - **Streaming** TCP-like bidirectional data through the virtual network
 * - **Datagrams** for UDP-like fire-and-forget messaging
 * - **Pub/Sub** via gossipsub topic subscriptions
 * - **fetch() polyfill** that transparently routes `*.peer` requests
 *
 * @example
 * ```ts
 * import { FrtunClient, installFetchPolyfill } from '@frtun/sdk';
 *
 * const client = await FrtunClient.create({
 *   transport: { method: 'wss', server: 'relay.example.com', port: 443, path: '/ws' },
 * });
 *
 * await client.connect();
 *
 * // Option A: Use the fetch polyfill for transparent overlay routing.
 * installFetchPolyfill(client);
 * const res = await fetch('https://my-service.peer/api/data');
 *
 * // Option B: Use streams directly.
 * const stream = await client.openTcpStream('my-service.peer', 443);
 * await stream.upgradeTls('my-service.peer');
 * await stream.write(new TextEncoder().encode('GET / HTTP/1.1\r\nHost: my-service.peer\r\n\r\n'));
 *
 * // Option C: Pub/Sub messaging.
 * const topic = await client.subscribeTopic('chat-room');
 * topic.onMessage((data, from) => console.log(`${from}: ${new TextDecoder().decode(data)}`));
 * await topic.publish(new TextEncoder().encode('Hello, overlay!'));
 * ```
 *
 * @packageDocumentation
 */

// Core client
export { FrtunClient } from './client';

// Stream and datagram
export { FrtunStream } from './stream';
export { FrtunDatagram } from './datagram';

// Pub/sub
export { TopicSubscription } from './topic';
export type { TopicMessageHandler } from './topic';

// Fetch polyfill
export { installFetchPolyfill, uninstallFetchPolyfill } from './fetch';

// Types
export type {
  FrtunConfig,
  TransportConfig,
  IdentityConfig,
  DnsConfig,
  StreamOptions,
  DatagramOptions,
  ConnectionState,
  FrtunEvents,
  SessionData,
  WorkerMessage,
  WasmModule,
  WasmClient,
} from './types';

export {
  FrtunError,
  FrtunErrorCode,
} from './types';

// Transport (advanced usage)
export { WebSocketTransport } from './transport/websocket';
export type { WebSocketTransportCallbacks, WebSocketState } from './transport/websocket';
export { WebRtcTransport } from './transport/webrtc';
export type { WebRtcTransportConfig, WebRtcTransportCallbacks, WebRtcState } from './transport/webrtc';

// Session (advanced usage)
export { SessionStore } from './session/store';
export { ReconnectManager } from './session/reconnect';
export type { ReconnectOptions } from './session/reconnect';
