/**
 * SeedIdentity.ts
 * Vapor PWA - BIP-39 Seed-Based Deterministic Identity
 *
 * Generates a 12-word mnemonic that derives deterministic X25519 keys.
 * This allows users to recover their identity on any device.
 *
 * Derivation Path:
 *   Mnemonic → PBKDF2 → Master Seed → HKDF → Identity Keys
 *
 * We use only classical keys for identity (X25519) because:
 * 1. ML-KEM keys are large (1184 bytes public)
 * 2. Session keys still use hybrid (X25519 + ML-KEM) for forward secrecy
 * 3. Identity just needs to be recognizable, not quantum-resistant long-term
 */

import sodium from 'libsodium-wrappers';
import { wordlist } from './bip39-wordlist';

const PBKDF2_ITERATIONS = 100000;

export interface IdentityKeys {
  publicKey: Uint8Array;   // 32 bytes X25519 public key
  privateKey: Uint8Array;  // 32 bytes X25519 private key (seed format)
}

/**
 * Generate a new 12-word mnemonic
 * Uses crypto.getRandomValues for entropy
 */
export async function generateMnemonic(): Promise<string> {
  // 128 bits of entropy = 12 words
  const entropy = new Uint8Array(16);
  crypto.getRandomValues(entropy);

  // Convert entropy to mnemonic words
  const bits = bytesToBits(entropy);

  // Add checksum (first 4 bits of SHA-256 hash)
  const checksumBits = await computeChecksum(entropy);
  const allBits = bits + checksumBits;

  // Split into 11-bit chunks, each maps to a word
  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    const chunk = allBits.slice(i * 11, (i + 1) * 11);
    const index = parseInt(chunk, 2);
    words.push(wordlist[index]);
  }

  return words.join(' ');
}

/**
 * Validate a mnemonic phrase
 */
export async function validateMnemonic(mnemonic: string): Promise<boolean> {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);

  if (words.length !== 12) {
    return false;
  }

  // Check all words are in wordlist
  for (const word of words) {
    if (!wordlist.includes(word)) {
      return false;
    }
  }

  // Verify checksum
  const indices = words.map(w => wordlist.indexOf(w));
  let bits = '';
  for (const index of indices) {
    bits += index.toString(2).padStart(11, '0');
  }

  // First 128 bits are entropy, last 4 are checksum
  const entropyBits = bits.slice(0, 128);
  const checksumBits = bits.slice(128);

  // Convert entropy bits back to bytes
  const entropy = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    entropy[i] = parseInt(entropyBits.slice(i * 8, (i + 1) * 8), 2);
  }

  // Compute expected checksum
  const expectedChecksum = await computeChecksum(entropy);

  return checksumBits === expectedChecksum;
}

/**
 * Derive identity keys from mnemonic
 * Uses PBKDF2 → libsodium for X25519 key derivation
 */
export async function deriveIdentityFromMnemonic(mnemonic: string): Promise<IdentityKeys> {
  await sodium.ready;

  const normalizedMnemonic = mnemonic.trim().toLowerCase();

  // BIP-39 style: mnemonic + "mnemonic" + passphrase (empty for us)
  const mnemonicBytes = new TextEncoder().encode(normalizedMnemonic);
  const saltBytes = new TextEncoder().encode('mnemonic');

  // Import mnemonic as key material for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    mnemonicBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive 64 bytes of seed material using PBKDF2
  const seedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-512',
    },
    keyMaterial,
    512 // 64 bytes
  );

  const masterSeed = new Uint8Array(seedBits);

  // Use HKDF to derive 32 bytes for the X25519 seed
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterSeed,
    'HKDF',
    false,
    ['deriveBits']
  );

  const privateKeyBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('vapor-identity-v1'),
      info: new TextEncoder().encode('x25519-identity-key'),
    },
    hkdfKey,
    256 // 32 bytes
  );

  const seed = new Uint8Array(privateKeyBits);

  // Use libsodium to derive X25519 keypair from seed
  // sodium.crypto_box_seed_keypair generates deterministic keypair from 32-byte seed
  const keyPair = sodium.crypto_box_seed_keypair(seed);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Get the fingerprint of an identity (for display)
 * Returns first 8 characters of hex-encoded public key hash
 */
export async function getIdentityFingerprint(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hash);
  return Array.from(hashArray.slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Format mnemonic for display (groups of 4 words)
 */
export function formatMnemonicForDisplay(mnemonic: string): string[] {
  const words = mnemonic.split(' ');
  const groups: string[] = [];
  for (let i = 0; i < words.length; i += 4) {
    groups.push(words.slice(i, i + 4).join(' '));
  }
  return groups;
}

// Helper functions
function bytesToBits(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(2).padStart(8, '0'))
    .join('');
}

async function computeChecksum(entropy: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', entropy.buffer as ArrayBuffer);
  const hashBits = bytesToBits(new Uint8Array(hash));
  // For 128-bit entropy, checksum is 4 bits
  return hashBits.slice(0, 4);
}

/**
 * Securely wipe key material from memory
 */
export function wipeKeys(keys: IdentityKeys): void {
  if (keys.privateKey) {
    keys.privateKey.fill(0);
  }
}
