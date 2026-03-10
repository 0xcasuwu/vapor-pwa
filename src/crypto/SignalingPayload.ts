/**
 * SignalingPayload.ts
 * Vapor PWA - WebRTC Signaling QR Payload
 *
 * Encodes WebRTC signaling data (offer/answer) into QR-compatible format
 * for the two-way QR handshake flow.
 *
 * Payload Types:
 * - Offer: Contains SDP offer + ML-KEM ciphertext + scanner's classical public key
 * - Answer: Contains SDP answer
 *
 * Both are compressed with pako for smaller QR codes.
 */

import pako from 'pako';
import { KEY_SIZES } from './HybridKeyPair';

// Signaling payload type identifiers
export const SIGNALING_TYPE = {
  OFFER: 0x10,
  ANSWER: 0x11,
} as const;

export interface SignalingOffer {
  type: typeof SIGNALING_TYPE.OFFER;
  sdp: string;                        // WebRTC SDP offer
  kemCiphertext: Uint8Array;          // 1088 bytes ML-KEM ciphertext
  classicalPublicKey: Uint8Array;     // 32 bytes scanner's X25519 public key
  timestamp: number;
}

export interface SignalingAnswer {
  type: typeof SIGNALING_TYPE.ANSWER;
  sdp: string;                        // WebRTC SDP answer
  timestamp: number;
}

export type SignalingPayload = SignalingOffer | SignalingAnswer;

/**
 * Create a signaling offer payload
 */
export function createSignalingOffer(
  sdp: string,
  kemCiphertext: Uint8Array,
  classicalPublicKey: Uint8Array
): SignalingOffer {
  return {
    type: SIGNALING_TYPE.OFFER,
    sdp,
    kemCiphertext,
    classicalPublicKey,
    timestamp: Date.now() / 1000,
  };
}

/**
 * Create a signaling answer payload
 */
export function createSignalingAnswer(sdp: string): SignalingAnswer {
  return {
    type: SIGNALING_TYPE.ANSWER,
    sdp,
    timestamp: Date.now() / 1000,
  };
}

/**
 * Encode signaling payload to compressed base64 for QR display
 */
export function encodeSignalingPayload(payload: SignalingPayload): string {
  // Use JSON for flexibility with SDP strings
  const jsonData: Record<string, unknown> = {
    t: payload.type,
    s: payload.sdp,
    ts: payload.timestamp,
  };

  if (payload.type === SIGNALING_TYPE.OFFER) {
    // Include binary data as base64
    jsonData.k = arrayToBase64(payload.kemCiphertext);
    jsonData.c = arrayToBase64(payload.classicalPublicKey);
  }

  const jsonString = JSON.stringify(jsonData);
  const compressed = pako.deflate(new TextEncoder().encode(jsonString));
  return arrayToBase64(compressed);
}

/**
 * Decode signaling payload from compressed base64
 */
export function decodeSignalingPayload(encoded: string): SignalingPayload | null {
  try {
    const compressed = base64ToArray(encoded);
    const decompressed = pako.inflate(compressed);
    const jsonString = new TextDecoder().decode(decompressed);
    const data = JSON.parse(jsonString);

    if (data.t === SIGNALING_TYPE.OFFER) {
      return {
        type: SIGNALING_TYPE.OFFER,
        sdp: data.s,
        kemCiphertext: base64ToArray(data.k),
        classicalPublicKey: base64ToArray(data.c),
        timestamp: data.ts,
      };
    } else if (data.t === SIGNALING_TYPE.ANSWER) {
      return {
        type: SIGNALING_TYPE.ANSWER,
        sdp: data.s,
        timestamp: data.ts,
      };
    }

    return null;
  } catch (err) {
    console.error('Failed to decode signaling payload:', err);
    return null;
  }
}

/**
 * Validate signaling payload structure
 */
export function isValidSignalingPayload(payload: SignalingPayload): boolean {
  if (!payload.sdp || typeof payload.sdp !== 'string') {
    return false;
  }

  if (payload.type === SIGNALING_TYPE.OFFER) {
    if (payload.kemCiphertext.length !== KEY_SIZES.PQ_CIPHERTEXT) {
      console.error(`Invalid KEM ciphertext size: ${payload.kemCiphertext.length}`);
      return false;
    }
    if (payload.classicalPublicKey.length !== KEY_SIZES.CLASSICAL_PUBLIC_KEY) {
      console.error(`Invalid classical public key size: ${payload.classicalPublicKey.length}`);
      return false;
    }
  }

  return true;
}

/**
 * Check if payload is expired (2 minute timeout for signaling)
 */
export function isSignalingExpired(payload: SignalingPayload): boolean {
  const now = Date.now() / 1000;
  const age = now - payload.timestamp;
  return age > 120; // 2 minute expiry for signaling
}

/**
 * Check if encoded string is a signaling payload (vs key exchange payload)
 */
export function isSignalingPayload(encoded: string): boolean {
  try {
    const payload = decodeSignalingPayload(encoded);
    return payload !== null &&
      (payload.type === SIGNALING_TYPE.OFFER || payload.type === SIGNALING_TYPE.ANSWER);
  } catch {
    return false;
  }
}

/**
 * Get payload type from encoded string
 */
export function getSignalingType(encoded: string): 'offer' | 'answer' | null {
  const payload = decodeSignalingPayload(encoded);
  if (!payload) return null;

  if (payload.type === SIGNALING_TYPE.OFFER) return 'offer';
  if (payload.type === SIGNALING_TYPE.ANSWER) return 'answer';
  return null;
}

// Helper functions for base64 conversion
function arrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
