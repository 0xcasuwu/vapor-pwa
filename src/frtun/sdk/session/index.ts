/**
 * Session management exports.
 *
 * Provides IndexedDB persistence and automatic reconnection for the
 * frtun browser SDK.
 */

export { SessionStore } from './store';
export { ReconnectManager } from './reconnect';
export type { ReconnectOptions } from './reconnect';
