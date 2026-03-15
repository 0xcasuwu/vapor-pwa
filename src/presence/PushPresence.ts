/**
 * PushPresence.ts
 * Vapor PWA - Web Push Presence Service
 *
 * Implements AIM-style online presence detection using Web Push notifications.
 *
 * How it works:
 * 1. When you add a contact, you exchange push subscription endpoints via QR
 * 2. When you open Vapor, you send "online" push to all contacts
 * 3. When you close Vapor, you send "offline" push to all contacts
 * 4. Contacts see your status via green/gray dot in contacts list
 *
 * Privacy note: Push notifications go through browser servers (FCM/Mozilla/Apple).
 * The message content is encrypted, but timing metadata is visible to the provider.
 */

import { getOrCreateVapidKeys, vapidKeyToBase64Url } from './vapidKeys';
import type { PushSubscriptionData, Contact } from '../store/identityStore';

export interface PresenceMessage {
  type: 'online' | 'offline' | 'away';
  fingerprint: string;
  timestamp: number;
}

/**
 * Request notification permission and subscribe to push
 * Returns the subscription data to share with contacts
 */
export async function subscribeToPush(): Promise<PushSubscriptionData | null> {
  // Check if push is supported
  if (!('PushManager' in window)) {
    console.warn('[Presence] Push notifications not supported');
    return null;
  }

  // Check if service worker is ready
  const registration = await navigator.serviceWorker.ready;

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('[Presence] Notification permission denied');
    return null;
  }

  // Get VAPID public key
  const vapidKeys = await getOrCreateVapidKeys();
  const applicationServerKey = vapidKeyToBase64Url(vapidKeys.publicKey);

  // Subscribe to push
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(applicationServerKey).buffer as ArrayBuffer,
    });

    // Extract the subscription data
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('Invalid subscription data');
    }

    return {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    };
  } catch (error) {
    console.error('[Presence] Failed to subscribe:', error);
    return null;
  }
}

/**
 * Get existing push subscription if any
 */
export async function getExistingSubscription(): Promise<PushSubscriptionData | null> {
  if (!('PushManager' in window)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return null;
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return null;
    }

    return {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Send a presence notification to a contact
 *
 * Note: Web Push requires a server to send notifications because:
 * 1. The push endpoint is a server URL (FCM, Mozilla, Apple)
 * 2. Messages must be signed with VAPID private key
 * 3. Payload must be encrypted with the subscription's public key
 *
 * For a fully serverless approach, we'd need to do this client-side,
 * which is possible but requires implementing the Web Push protocol manually.
 */
export async function sendPresenceToContact(
  contact: Contact,
  message: PresenceMessage
): Promise<boolean> {
  if (!contact.pushSubscription) {
    console.log(`[Presence] Contact ${contact.nickname} has no push subscription`);
    return false;
  }

  try {
    // For now, we'll use a simple approach that works for development
    // In production, you'd need to implement the full Web Push protocol
    // or use a relay service

    // Get VAPID keys for signing (will be used for JWT signing in production)
    const _vapidKeys = await getOrCreateVapidKeys();
    void _vapidKeys; // Mark as intentionally unused for now

    // Create the encrypted payload using the contact's push subscription keys
    const payload = JSON.stringify(message);
    const encrypted = await encryptPushPayload(
      payload,
      contact.pushSubscription.keys.p256dh,
      contact.pushSubscription.keys.auth
    );

    // Send to push endpoint
    // Note: This requires CORS to be enabled on the push service, which isn't typical
    // In practice, you'd use a small relay server or service worker background sync
    const response = await fetch(contact.pushSubscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '60', // Message expires in 60 seconds
      },
      body: encrypted.buffer as ArrayBuffer,
    });

    return response.ok;
  } catch (error) {
    console.error(`[Presence] Failed to send to ${contact.nickname}:`, error);
    return false;
  }
}

/**
 * Broadcast presence to all contacts
 */
export async function broadcastPresence(
  contacts: Contact[],
  status: 'online' | 'offline' | 'away',
  fingerprint: string
): Promise<void> {
  const message: PresenceMessage = {
    type: status,
    fingerprint,
    timestamp: Date.now(),
  };

  // Send to all contacts with push subscriptions in parallel
  const contactsWithPush = contacts.filter(c => c.pushSubscription);

  if (contactsWithPush.length === 0) {
    console.log('[Presence] No contacts with push subscriptions');
    return;
  }

  console.log(`[Presence] Broadcasting ${status} to ${contactsWithPush.length} contacts`);

  await Promise.allSettled(
    contactsWithPush.map(contact => sendPresenceToContact(contact, message))
  );
}

/**
 * Encrypt push payload using Web Push encryption
 * This implements the aes128gcm content encoding specified in RFC 8291
 */
async function encryptPushPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<Uint8Array> {
  // Convert keys from base64url
  const clientPublicKey = urlBase64ToUint8Array(p256dhKey);
  const clientAuth = urlBase64ToUint8Array(authSecret);

  // Generate ephemeral key pair for ECDH
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Import client's public key
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKey.buffer as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    localKeyPair.privateKey,
    256
  );

  // Export local public key
  const localPublicKey = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);

  // Derive encryption key using HKDF
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveBits']
  );

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive IKM from auth secret
  const ikm = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: clientAuth.buffer as ArrayBuffer,
      info: new TextEncoder().encode('Content-Encoding: auth\0'),
    },
    sharedSecretKey,
    256
  );

  // Derive content encryption key
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cekKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    'HKDF',
    false,
    ['deriveBits']
  );

  const cek = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt.buffer as ArrayBuffer,
      info: cekInfo,
    },
    cekKey,
    128
  );

  // Derive nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt.buffer as ArrayBuffer,
      info: nonceInfo,
    },
    cekKey,
    96
  );

  // Encrypt payload with AES-GCM
  const encryptKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Add padding delimiter
  const paddedPayload = new Uint8Array([
    ...new TextEncoder().encode(payload),
    0x02, // Delimiter
  ]);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonce) },
    encryptKey,
    paddedPayload
  );

  // Build the aes128gcm message format
  const recordSize = 4096;
  const header = new Uint8Array(86);
  const view = new DataView(header.buffer);

  // Salt (16 bytes)
  header.set(salt, 0);

  // Record size (4 bytes, big-endian)
  view.setUint32(16, recordSize, false);

  // Key ID length (1 byte)
  header[20] = 65; // Length of uncompressed P-256 public key

  // Key ID (local public key, 65 bytes)
  header.set(new Uint8Array(localPublicKey), 21);

  // Combine header and encrypted data
  const result = new Uint8Array(header.length + encrypted.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(encrypted), header.length);

  return result;
}

/**
 * Convert base64url to Uint8Array
 */
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Initialize presence service
 * Call this when the app starts
 */
export async function initPresence(): Promise<PushSubscriptionData | null> {
  // Try to get existing subscription first
  let subscription = await getExistingSubscription();

  if (!subscription) {
    // Subscribe if permission was previously granted
    if (Notification.permission === 'granted') {
      subscription = await subscribeToPush();
    }
  }

  return subscription;
}
