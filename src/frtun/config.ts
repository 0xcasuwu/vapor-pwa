/**
 * config.ts
 * Vapor PWA - frtun Configuration
 *
 * Relay endpoints and connection configuration for the frtun overlay network.
 * Uses Subfrost-hosted WebSocket relays for peer-to-peer reconnection.
 */

import type { FrtunConfig } from './sdk/types';

/**
 * Subfrost-hosted relay servers.
 * Primary + two fallbacks for high availability.
 */
export const RELAY_SERVERS = [
  { server: 'wss.subfrost.io', port: 443, path: '/ws' },
  { server: 'wss-1.subfrost.io', port: 443, path: '/ws' },
  { server: 'wss-2.subfrost.io', port: 443, path: '/ws' },
] as const;

/**
 * Connection timeouts in milliseconds.
 */
export const TIMEOUTS = {
  /** Time to establish relay connection */
  RELAY_CONNECT: 30_000,
  /** Time to open a stream to a peer */
  STREAM_OPEN: 15_000,
  /** Time for handshake after stream opens */
  HANDSHAKE: 10_000,
} as const;

/**
 * Domain separator for key derivation.
 * Different from X25519 keys to ensure key separation.
 */
export const KEY_DOMAIN = 'vapor-frtun-identity-v1';

/**
 * Gossipsub topic for presence announcements.
 */
export const PRESENCE_TOPIC = 'vapor-presence-v1';

/**
 * Create a FrtunConfig for the given relay server index.
 *
 * @param relayIndex - Index into RELAY_SERVERS (0 = primary)
 * @returns FrtunConfig for the SDK
 */
export function createFrtunConfig(relayIndex = 0): FrtunConfig {
  const relay = RELAY_SERVERS[relayIndex % RELAY_SERVERS.length];

  return {
    transport: {
      method: 'wss',
      server: relay.server,
      port: relay.port,
      path: relay.path,
    },
    autoReconnect: true,
    maxReconnectAttempts: 5,
    persistSession: true,
    dns: {
      bogonRange: '100.64.0.0/10',
      interceptTlds: ['.peer'],
    },
  };
}

/**
 * Get the next relay server index for fallback.
 */
export function nextRelayIndex(current: number): number {
  return (current + 1) % RELAY_SERVERS.length;
}
