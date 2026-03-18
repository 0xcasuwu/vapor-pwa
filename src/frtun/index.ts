/**
 * index.ts
 * Vapor PWA - frtun Module Public API
 *
 * Exposes the frtun overlay network functionality for Vapor PWA.
 * Replaces libp2p Circuit Relay with Subfrost-hosted WebSocket relays.
 */

// Client singleton and initialization
export {
  VaporFrtunClient,
  getFrtunClient,
  initializeFrtunClient,
  ensureFrtunConnected,
} from './client';

// Key derivation
export { deriveFrtunIdentity, isValidPeerName } from './keys';
export type { FrtunIdentity } from './keys';

// Presence (gossipsub)
export {
  startPresence,
  stopPresence,
  isRecentlyOnline,
  getPresenceTimeoutMs,
} from './presence';
export type { PresenceMessage, PresenceCallback } from './presence';

// Configuration
export { RELAY_SERVERS, TIMEOUTS, KEY_DOMAIN, PRESENCE_TOPIC, createFrtunConfig } from './config';

// Types
export type { VaporFrtunState, VaporFrtunEvents } from './client';
export type { ConnectionState, FrtunConfig } from './sdk/types';
export { FrtunError, FrtunErrorCode } from './sdk/types';

// SDK classes for advanced usage
export { FrtunClient } from './sdk/client';
export { FrtunStream } from './sdk/stream';
export { TopicSubscription } from './sdk/topic';
