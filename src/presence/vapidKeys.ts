/**
 * vapidKeys.ts
 * Vapor PWA - VAPID Key Generation for Web Push
 *
 * VAPID (Voluntary Application Server Identification) keys are used to
 * identify your application to push services (Google FCM, Mozilla, Apple).
 *
 * The public key is shared with contacts via QR code.
 * The private key is used to sign push messages.
 *
 * Keys are generated once per identity and stored in IndexedDB.
 */

import { openDB } from 'idb';

const DB_NAME = 'vapor-presence';
const DB_VERSION = 1;
const STORE_NAME = 'vapid';

interface VapidKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Get or create VAPID key pair
 * Keys are generated once and persisted in IndexedDB
 */
export async function getOrCreateVapidKeys(): Promise<VapidKeyPair> {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    },
  });

  // Try to get existing keys
  const existing = await db.get(STORE_NAME, 'keys');
  if (existing) {
    return {
      publicKey: new Uint8Array(existing.publicKey),
      privateKey: new Uint8Array(existing.privateKey),
    };
  }

  // Generate new ECDSA P-256 key pair for VAPID
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign', 'verify']
  );

  // Export keys to raw format
  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  const publicKey = new Uint8Array(publicKeyBuffer);
  const privateKey = new Uint8Array(privateKeyBuffer);

  // Store in IndexedDB
  await db.put(STORE_NAME, {
    publicKey: Array.from(publicKey),
    privateKey: Array.from(privateKey),
  }, 'keys');

  return { publicKey, privateKey };
}

/**
 * Convert VAPID public key to the base64url format needed for Push API
 */
export function vapidKeyToBase64Url(key: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < key.length; i++) {
    binary += String.fromCharCode(key[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Convert base64url back to Uint8Array
 */
export function base64UrlToUint8(base64url: string): Uint8Array {
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
 * Get the VAPID public key in base64url format for Push API
 */
export async function getVapidPublicKeyBase64(): Promise<string> {
  const keys = await getOrCreateVapidKeys();
  return vapidKeyToBase64Url(keys.publicKey);
}
