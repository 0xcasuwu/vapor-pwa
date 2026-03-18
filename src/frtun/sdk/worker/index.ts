/**
 * Worker exports.
 *
 * Provides SharedWorker (multi-tab connection sharing) and Service Worker
 * (fetch interception) implementations for the frtun browser SDK.
 *
 * These modules are typically registered as workers from the main thread
 * rather than imported directly:
 *
 * ```ts
 * // SharedWorker
 * const sw = new SharedWorker(
 *   new URL('./worker/shared.ts', import.meta.url),
 *   { type: 'module' },
 * );
 *
 * // Service Worker
 * navigator.serviceWorker.register(
 *   new URL('./worker/service.ts', import.meta.url),
 *   { type: 'module' },
 * );
 * ```
 *
 * The exports here are for programmatic access and testing.
 */

export { handleConnect as sharedWorkerHandleConnect } from './shared';
export { handlePeerFetch, handleOverlayResponse } from './service';
