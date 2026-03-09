/**
 * HybridKeyPair.ts
 * Vapor PWA - Post-Quantum Hybrid Key Exchange
 *
 * Implements X25519 + ML-KEM-768 hybrid key exchange.
 * Protocol-compatible with Vapor iOS v2.
 *
 * Security Properties:
 * - If ML-KEM is broken: X25519 still provides ~128-bit classical security
 * - If X25519 is broken (quantum): ML-KEM provides ~128-bit post-quantum security
 * - Combined: Defense in depth against all known attacks
 */

import sodium from 'libsodium-wrappers';
import { MlKem768 } from 'mlkem';

// Key size constants (must match iOS implementation)
export const KEY_SIZES = {
  CLASSICAL_PUBLIC_KEY: 32,   // X25519
  CLASSICAL_PRIVATE_KEY: 32,  // X25519
  PQ_PUBLIC_KEY: 1184,        // ML-KEM-768
  PQ_PRIVATE_KEY: 2400,       // ML-KEM-768
  PQ_CIPHERTEXT: 1088,        // ML-KEM-768
  COMBINED_PUBLIC_KEY: 32 + 1184, // 1216 bytes
  SHARED_SECRET: 32,
} as const;

export interface HybridPublicKey {
  classical: Uint8Array;  // 32 bytes
  pq: Uint8Array;         // 1184 bytes
}

export interface HybridKeyPairData {
  publicKey: HybridPublicKey;
  privateKey: {
    classical: Uint8Array;  // 32 bytes
    pq: Uint8Array;         // 2400 bytes
  };
}

export interface EncapsulationResult {
  sharedSecret: Uint8Array;  // 32 bytes
  ciphertext: Uint8Array;    // 1088 bytes (ML-KEM ciphertext)
}

/**
 * Generate a new hybrid key pair (X25519 + ML-KEM-768)
 */
export async function generateHybridKeyPair(): Promise<HybridKeyPairData> {
  await sodium.ready;

  // Generate X25519 key pair
  const classicalKeyPair = sodium.crypto_box_keypair();

  // Generate ML-KEM-768 key pair
  const mlkem = new MlKem768();
  const [pqPublicKey, pqPrivateKey] = await mlkem.generateKeyPair();

  return {
    publicKey: {
      classical: classicalKeyPair.publicKey,
      pq: pqPublicKey,
    },
    privateKey: {
      classical: classicalKeyPair.privateKey,
      pq: pqPrivateKey,
    },
  };
}

/**
 * Get combined public key data for QR encoding
 * Format: [classical_pk (32 bytes)] || [pq_pk (1184 bytes)]
 */
export function getCombinedPublicKey(publicKey: HybridPublicKey): Uint8Array {
  const combined = new Uint8Array(KEY_SIZES.COMBINED_PUBLIC_KEY);
  combined.set(publicKey.classical, 0);
  combined.set(publicKey.pq, KEY_SIZES.CLASSICAL_PUBLIC_KEY);
  return combined;
}

/**
 * Parse combined public key data
 */
export function parseCombinedPublicKey(combined: Uint8Array): HybridPublicKey {
  if (combined.length !== KEY_SIZES.COMBINED_PUBLIC_KEY) {
    throw new Error(`Invalid combined public key size: ${combined.length}, expected ${KEY_SIZES.COMBINED_PUBLIC_KEY}`);
  }

  return {
    classical: combined.slice(0, KEY_SIZES.CLASSICAL_PUBLIC_KEY),
    pq: combined.slice(KEY_SIZES.CLASSICAL_PUBLIC_KEY),
  };
}

/**
 * Derive shared secret as initiator (encapsulating party)
 * Performs X25519 ECDH + ML-KEM encapsulation
 *
 * @param ourPrivateKey - Our private key
 * @param peerPublicKey - Peer's public key
 * @returns Combined shared secret and ML-KEM ciphertext
 */
export async function deriveSharedSecretAsInitiator(
  ourPrivateKey: HybridKeyPairData['privateKey'],
  peerPublicKey: HybridPublicKey
): Promise<EncapsulationResult> {
  await sodium.ready;

  // 1. Classical X25519 key agreement
  const classicalSharedSecret = sodium.crypto_scalarmult(
    ourPrivateKey.classical,
    peerPublicKey.classical
  );

  // 2. ML-KEM encapsulation
  const mlkem = new MlKem768();
  const [ciphertext, pqSharedSecret] = await mlkem.encap(peerPublicKey.pq);

  // 3. Combine secrets via HKDF
  const combinedSecret = await deriveHybridKey(classicalSharedSecret, pqSharedSecret);

  return {
    sharedSecret: combinedSecret,
    ciphertext: ciphertext,
  };
}

/**
 * Derive shared secret as responder (decapsulating party)
 * Performs X25519 ECDH + ML-KEM decapsulation
 *
 * @param ourKeyPair - Our full key pair
 * @param peerClassicalPublicKey - Peer's X25519 public key
 * @param ciphertext - ML-KEM ciphertext from peer
 * @returns Combined shared secret
 */
export async function deriveSharedSecretAsResponder(
  ourKeyPair: HybridKeyPairData,
  peerClassicalPublicKey: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;

  // 1. Classical X25519 key agreement
  const classicalSharedSecret = sodium.crypto_scalarmult(
    ourKeyPair.privateKey.classical,
    peerClassicalPublicKey
  );

  // 2. ML-KEM decapsulation
  const mlkem = new MlKem768();
  const pqSharedSecret = await mlkem.decap(ciphertext, ourKeyPair.privateKey.pq);

  // 3. Combine secrets via HKDF
  return deriveHybridKey(classicalSharedSecret, pqSharedSecret);
}

/**
 * Derive classical-only shared secret (for legacy v1 compatibility)
 * WARNING: Not quantum-resistant!
 */
export async function deriveClassicalOnlySecret(
  ourPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;

  const sharedSecret = sodium.crypto_scalarmult(ourPrivateKey, peerPublicKey);

  // Derive key with v1 domain separation
  return hkdf(sharedSecret, new Uint8Array(0), 'vapor-v1', 32);
}

/**
 * Combine classical and post-quantum shared secrets using HKDF
 * Uses "vapor-v2-hybrid" domain separation (must match iOS)
 */
async function deriveHybridKey(
  classicalSecret: Uint8Array,
  pqSecret: Uint8Array
): Promise<Uint8Array> {
  // Concatenate: classical || post-quantum
  const combined = new Uint8Array(classicalSecret.length + pqSecret.length);
  combined.set(classicalSecret, 0);
  combined.set(pqSecret, classicalSecret.length);

  // Derive final key using HKDF with domain separation
  return hkdf(combined, new Uint8Array(0), 'vapor-v2-hybrid', 32);
}

/**
 * HKDF-SHA256 implementation using Web Crypto API
 */
async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const infoBytes = encoder.encode(info);

  // Import IKM as raw key material
  const baseKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    'HKDF',
    false,
    ['deriveBits']
  );

  // Derive key material
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt.length > 0 ? salt : new Uint8Array(32),
      info: infoBytes,
    },
    baseKey,
    length * 8
  );

  return new Uint8Array(derivedBits);
}

/**
 * Securely zero memory (best effort in JavaScript)
 */
export function destroyKeyPair(keyPair: HybridKeyPairData): void {
  // Zero out private keys
  keyPair.privateKey.classical.fill(0);
  keyPair.privateKey.pq.fill(0);
  // Zero out public keys too (not strictly necessary, but good practice)
  keyPair.publicKey.classical.fill(0);
  keyPair.publicKey.pq.fill(0);
}
