/**
 * presence.ts
 * Vapor PWA - Gossipsub Presence System
 *
 * Uses frtun's gossipsub to announce online presence to contacts.
 * Replaces the Web Push presence system from src/presence/.
 *
 * Protocol:
 * - Each peer subscribes to the "vapor-presence-v1" topic
 * - Online announcements: { type: 'online', peerId: string, timestamp: number }
 * - Offline announcements: { type: 'offline', peerId: string, timestamp: number }
 * - Heartbeat: online announcements sent every 30 seconds
 */

import { getFrtunClient } from './client';
import { PRESENCE_TOPIC } from './config';
import type { TopicSubscription } from './sdk/topic';

/**
 * Presence message types.
 */
export type PresenceType = 'online' | 'offline';

export interface PresenceMessage {
  type: PresenceType;
  peerId: string;
  timestamp: number;
}

/**
 * Callback for presence updates.
 */
export type PresenceCallback = (peerId: string, isOnline: boolean, timestamp: number) => void;

/**
 * Presence manager singleton.
 */
let presenceSubscription: TopicSubscription | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let presenceCallback: PresenceCallback | null = null;

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const PRESENCE_TIMEOUT_MS = 90_000;   // 90 seconds (3 missed heartbeats = offline)

/**
 * Start the presence system.
 *
 * Subscribes to the presence topic and begins sending heartbeats.
 *
 * @param onPresenceUpdate - Callback when a contact's presence changes
 */
export async function startPresence(onPresenceUpdate: PresenceCallback): Promise<void> {
  const frtunClient = getFrtunClient();
  const client = frtunClient.getClient();

  if (!client) {
    console.warn('[presence] frtun client not available');
    return;
  }

  const myPeerId = frtunClient.getPeerName();
  if (!myPeerId) {
    console.warn('[presence] No peer name available');
    return;
  }

  presenceCallback = onPresenceUpdate;

  try {
    // Subscribe to presence topic
    presenceSubscription = await client.subscribeTopic(PRESENCE_TOPIC);

    // Handle incoming presence messages
    presenceSubscription.onMessage((data: Uint8Array, fromPeerId: string) => {
      try {
        const message: PresenceMessage = JSON.parse(new TextDecoder().decode(data));
        handlePresenceMessage(message, fromPeerId);
      } catch (err) {
        console.warn('[presence] Failed to parse message:', err);
      }
    });

    // Announce online
    await announcePresence('online');

    // Start heartbeat
    heartbeatInterval = setInterval(() => {
      announcePresence('online').catch((err) => {
        console.warn('[presence] Heartbeat failed:', err);
      });
    }, HEARTBEAT_INTERVAL_MS);

    console.log('[presence] Started');
  } catch (err) {
    console.error('[presence] Failed to start:', err);
    throw err;
  }
}

/**
 * Stop the presence system.
 *
 * Announces offline and unsubscribes from the topic.
 */
export async function stopPresence(): Promise<void> {
  // Stop heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Announce offline
  try {
    await announcePresence('offline');
  } catch {
    // Ignore errors during shutdown
  }

  // Unsubscribe
  if (presenceSubscription) {
    try {
      await presenceSubscription.unsubscribe();
    } catch {
      // Ignore errors during shutdown
    }
    presenceSubscription = null;
  }

  presenceCallback = null;
  console.log('[presence] Stopped');
}

/**
 * Announce presence to the network.
 */
async function announcePresence(type: PresenceType): Promise<void> {
  if (!presenceSubscription) {
    return;
  }

  const frtunClient = getFrtunClient();
  const myPeerId = frtunClient.getPeerName();

  if (!myPeerId) {
    return;
  }

  const message: PresenceMessage = {
    type,
    peerId: myPeerId,
    timestamp: Date.now(),
  };

  const data = new TextEncoder().encode(JSON.stringify(message));
  await presenceSubscription.publish(data);
}

/**
 * Handle an incoming presence message.
 */
function handlePresenceMessage(message: PresenceMessage, _fromPeerId: string): void {
  // Validate message
  if (!message.type || !message.peerId || !message.timestamp) {
    return;
  }

  // Ignore our own messages
  const frtunClient = getFrtunClient();
  const myPeerId = frtunClient.getPeerName();
  if (message.peerId === myPeerId) {
    return;
  }

  // Check if message is too old (stale heartbeat)
  const age = Date.now() - message.timestamp;
  if (age > PRESENCE_TIMEOUT_MS) {
    return;
  }

  // Notify callback
  if (presenceCallback) {
    const isOnline = message.type === 'online';
    presenceCallback(message.peerId, isOnline, message.timestamp);
  }
}

/**
 * Check if a peer is online based on their last presence update.
 *
 * @param lastPresenceUpdate - Timestamp of last presence message
 * @returns true if considered online (within timeout window)
 */
export function isRecentlyOnline(lastPresenceUpdate: number | undefined): boolean {
  if (!lastPresenceUpdate) {
    return false;
  }

  const age = Date.now() - lastPresenceUpdate;
  return age < PRESENCE_TIMEOUT_MS;
}

/**
 * Get the presence timeout in milliseconds.
 */
export function getPresenceTimeoutMs(): number {
  return PRESENCE_TIMEOUT_MS;
}
