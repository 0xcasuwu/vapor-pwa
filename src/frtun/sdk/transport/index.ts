/**
 * Transport layer exports.
 *
 * Provides WebSocket (primary) and WebRTC (future) transport implementations
 * for connecting to the frtun overlay network from the browser.
 */

export { WebSocketTransport } from './websocket';
export type { WebSocketTransportCallbacks, WebSocketState } from './websocket';

export { WebRtcTransport } from './webrtc';
export type { WebRtcTransportConfig, WebRtcTransportCallbacks, WebRtcState } from './webrtc';
