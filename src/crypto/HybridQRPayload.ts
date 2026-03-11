/**
 * HybridQRPayload.ts
 * Vapor PWA - Post-Quantum QR Payload
 *
 * Protocol-compatible with Vapor iOS v2.
 *
 * Payload Format (v2):
 * - Version: 1 byte (0x02 for hybrid)
 * - Classical Public Key: 32 bytes (X25519)
 * - Post-Quantum Public Key: 1,184 bytes (ML-KEM-768)
 * - Nonce: 32 bytes (random)
 * - Timestamp: 8 bytes (float64, little-endian)
 * Total: 1,257 bytes
 *
 * For QR display, this is compressed and encoded as base64 (~1,000 characters)
 */

import pako from 'pako';
import type { HybridPublicKey } from './HybridKeyPair';
import { KEY_SIZES, getCombinedPublicKey } from './HybridKeyPair';

// Protocol constants (must match iOS)
export const VERSION_CLASSIC_ONLY = 0x01;
export const VERSION_HYBRID = 0x02;
// TODO: Restore to 60 seconds after testing
export const DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour for testing

// Payload sizes
export const PAYLOAD_SIZES = {
  VERSION: 1,
  NONCE: 32,
  TIMESTAMP: 8,
  HYBRID_TOTAL: 1 + 32 + 1184 + 32 + 8, // 1257 bytes
  LEGACY_TOTAL: 1 + 32 + 32 + 8,        // 73 bytes
} as const;

export interface HybridQRPayload {
  version: number;
  classicalPublicKey: Uint8Array;
  pqPublicKey: Uint8Array;
  nonce: Uint8Array;
  timestamp: number;
}

/**
 * Generate a new QR payload from a hybrid public key
 */
export function generateQRPayload(publicKey: HybridPublicKey): HybridQRPayload {
  // Generate secure random nonce
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);

  return {
    version: VERSION_HYBRID,
    classicalPublicKey: publicKey.classical,
    pqPublicKey: publicKey.pq,
    nonce,
    timestamp: Date.now() / 1000, // Unix timestamp in seconds
  };
}

/**
 * Encode payload to binary format
 * Format: version (1) + classical_pk (32) + pq_pk (1184) + nonce (32) + timestamp (8)
 */
export function encodePayload(payload: HybridQRPayload): Uint8Array {
  const buffer = new ArrayBuffer(PAYLOAD_SIZES.HYBRID_TOTAL);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;

  // Version (1 byte)
  view.setUint8(offset, payload.version);
  offset += 1;

  // Classical public key (32 bytes)
  bytes.set(payload.classicalPublicKey, offset);
  offset += KEY_SIZES.CLASSICAL_PUBLIC_KEY;

  // PQ public key (1184 bytes)
  bytes.set(payload.pqPublicKey, offset);
  offset += KEY_SIZES.PQ_PUBLIC_KEY;

  // Nonce (32 bytes)
  bytes.set(payload.nonce, offset);
  offset += PAYLOAD_SIZES.NONCE;

  // Timestamp (8 bytes, float64 little-endian)
  view.setFloat64(offset, payload.timestamp, true);

  return bytes;
}

/**
 * Decode payload from binary format
 */
export function decodePayload(data: Uint8Array): HybridQRPayload | null {
  if (data.length < 1) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint8(0);

  switch (version) {
    case VERSION_HYBRID:
      return decodeHybridPayload(data, view);
    case VERSION_CLASSIC_ONLY:
      return decodeLegacyPayload(data, view);
    default:
      return null;
  }
}

/**
 * Decode hybrid v2 payload
 */
function decodeHybridPayload(data: Uint8Array, view: DataView): HybridQRPayload | null {
  if (data.length !== PAYLOAD_SIZES.HYBRID_TOTAL) {
    console.error(`Invalid hybrid payload size: ${data.length}, expected ${PAYLOAD_SIZES.HYBRID_TOTAL}`);
    return null;
  }

  let offset = 1; // Skip version byte

  const classicalPublicKey = data.slice(offset, offset + KEY_SIZES.CLASSICAL_PUBLIC_KEY);
  offset += KEY_SIZES.CLASSICAL_PUBLIC_KEY;

  const pqPublicKey = data.slice(offset, offset + KEY_SIZES.PQ_PUBLIC_KEY);
  offset += KEY_SIZES.PQ_PUBLIC_KEY;

  const nonce = data.slice(offset, offset + PAYLOAD_SIZES.NONCE);
  offset += PAYLOAD_SIZES.NONCE;

  const timestamp = view.getFloat64(offset, true);

  return {
    version: VERSION_HYBRID,
    classicalPublicKey,
    pqPublicKey,
    nonce,
    timestamp,
  };
}

/**
 * Decode legacy v1 payload (classical only)
 */
function decodeLegacyPayload(data: Uint8Array, view: DataView): HybridQRPayload | null {
  if (data.length !== PAYLOAD_SIZES.LEGACY_TOTAL) {
    console.error(`Invalid legacy payload size: ${data.length}, expected ${PAYLOAD_SIZES.LEGACY_TOTAL}`);
    return null;
  }

  let offset = 1; // Skip version byte

  const classicalPublicKey = data.slice(offset, offset + KEY_SIZES.CLASSICAL_PUBLIC_KEY);
  offset += KEY_SIZES.CLASSICAL_PUBLIC_KEY;

  const nonce = data.slice(offset, offset + PAYLOAD_SIZES.NONCE);
  offset += PAYLOAD_SIZES.NONCE;

  const timestamp = view.getFloat64(offset, true);

  // Return with empty PQ key (will trigger legacy mode)
  return {
    version: VERSION_CLASSIC_ONLY,
    classicalPublicKey,
    pqPublicKey: new Uint8Array(0),
    nonce,
    timestamp,
  };
}

/**
 * Encode payload to base64 string
 */
export function encodeToBase64(payload: HybridQRPayload): string {
  const bytes = encodePayload(payload);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Encode payload with compression for smaller QR codes
 * Uses DEFLATE compression (compatible with iOS LZFSE fallback)
 */
export function encodeToCompressedBase64(payload: HybridQRPayload): string {
  const bytes = encodePayload(payload);
  const compressed = pako.deflate(bytes);
  return btoa(String.fromCharCode(...compressed));
}

/**
 * Decode payload from base64 string
 */
export function decodeFromBase64(base64: string): HybridQRPayload | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return decodePayload(bytes);
  } catch {
    return null;
  }
}

/**
 * Decode payload from compressed base64
 */
export function decodeFromCompressedBase64(base64: string): HybridQRPayload | null {
  try {
    const binary = atob(base64);
    const compressed = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      compressed[i] = binary.charCodeAt(i);
    }

    // Try to decompress
    try {
      const decompressed = pako.inflate(compressed);
      return decodePayload(decompressed);
    } catch {
      // Fallback: try as uncompressed
      return decodePayload(compressed);
    }
  } catch {
    return null;
  }
}

/**
 * Check if payload has expired
 */
export function isExpired(payload: HybridQRPayload): boolean {
  const now = Date.now() / 1000;
  const age = now - payload.timestamp;
  return age > DEFAULT_EXPIRY_SECONDS;
}

/**
 * Get remaining seconds until expiry
 */
export function getRemainingSeconds(payload: HybridQRPayload): number {
  const now = Date.now() / 1000;
  const age = now - payload.timestamp;
  const remaining = DEFAULT_EXPIRY_SECONDS - age;
  return Math.max(0, Math.floor(remaining));
}

/**
 * Check if payload is hybrid (post-quantum)
 */
export function isHybrid(payload: HybridQRPayload): boolean {
  return payload.version === VERSION_HYBRID && payload.pqPublicKey.length > 0;
}

/**
 * Check if payload is legacy (classical only)
 */
export function isLegacy(payload: HybridQRPayload): boolean {
  return payload.version === VERSION_CLASSIC_ONLY || payload.pqPublicKey.length === 0;
}

/**
 * Validate payload structure
 */
export function isValid(payload: HybridQRPayload): boolean {
  // Validate classical key size
  if (payload.classicalPublicKey.length !== KEY_SIZES.CLASSICAL_PUBLIC_KEY) {
    return false;
  }

  // Validate nonce size
  if (payload.nonce.length !== PAYLOAD_SIZES.NONCE) {
    return false;
  }

  // Validate PQ key if hybrid
  if (isHybrid(payload) && payload.pqPublicKey.length !== KEY_SIZES.PQ_PUBLIC_KEY) {
    return false;
  }

  return true;
}

/**
 * Get combined public key data from payload
 */
export function getCombinedPublicKeyFromPayload(payload: HybridQRPayload): Uint8Array {
  return getCombinedPublicKey({
    classical: payload.classicalPublicKey,
    pq: payload.pqPublicKey,
  });
}
