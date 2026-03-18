/**
 * keys.ts
 * Vapor PWA - frtun Identity Key Derivation
 *
 * Derives frtun peer identity from the user's BIP-39 mnemonic.
 * Uses HKDF to derive a separate key domain from the mnemonic,
 * then generates the frtun peer name via the WASM module.
 *
 * The frtun peer name format is: frtun1<bech32m-data>.peer
 * Example: frtun1qp5d82s3w...xyz.peer
 */

import sodium from 'libsodium-wrappers';
import { KEY_DOMAIN } from './config';

/**
 * Frtun identity containing the secret seed and peer name.
 */
export interface FrtunIdentity {
  /** 32-byte secret seed for the frtun identity */
  secretSeed: Uint8Array;
  /** Bech32m-encoded peer name (e.g., "frtun1xxx.peer") */
  peerName: string;
}

/**
 * Derive an frtun identity from a BIP-39 mnemonic.
 *
 * Uses HKDF-SHA256 with a Vapor-specific domain separator to derive
 * a 32-byte seed, which is then used to generate the frtun peer name.
 *
 * The derivation is deterministic: same mnemonic = same peer name.
 *
 * @param mnemonic - BIP-39 mnemonic phrase (12+ words)
 * @returns FrtunIdentity with secretSeed and peerName
 */
export async function deriveFrtunIdentity(mnemonic: string): Promise<FrtunIdentity> {
  await sodium.ready;

  // Normalize mnemonic (lowercase, trimmed)
  const normalizedMnemonic = mnemonic.trim().toLowerCase();
  const mnemonicBytes = new TextEncoder().encode(normalizedMnemonic);

  // Use HKDF to derive frtun-specific key material
  // Salt is the domain separator to ensure isolation from X25519 keys
  const domainBytes = new TextEncoder().encode(KEY_DOMAIN);

  // HKDF-SHA256: extract phase
  const prk = await crypto.subtle.importKey(
    'raw',
    mnemonicBytes,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // HKDF-SHA256: expand phase - derive 32 bytes
  const secretSeed = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: domainBytes,
        info: new Uint8Array([]), // No additional context
      },
      prk,
      256 // 32 bytes
    )
  );

  // Generate peer name using the WASM module
  // The WASM does: BLAKE3(secretSeed) -> bech32m("frtun", hash) + ".peer"
  const peerName = await generatePeerNameFromSeed(secretSeed);

  return {
    secretSeed,
    peerName,
  };
}

/**
 * Generate a peer name from a 32-byte secret seed.
 *
 * This function calls into the frtun WASM module to generate
 * the bech32m-encoded peer name.
 *
 * @param seed - 32-byte secret seed
 * @returns Peer name string (e.g., "frtun1xxx.peer")
 */
async function generatePeerNameFromSeed(seed: Uint8Array): Promise<string> {
  // Dynamically import the WASM module to avoid circular dependencies
  const wasm = await import('./wasm-pkg/frtun_wasm');

  // The WASM generate_identity function takes a seed and returns:
  // { publicKey: Uint8Array, secretKey: Uint8Array, peerName: string }
  // But we want to derive from our seed, so we use peer_name_from_pubkey
  // with the BLAKE3 hash of the seed.

  // Actually, looking at lib.rs, generate_identity() generates a random identity.
  // peer_name_from_pubkey(pubkey) takes a public key and returns the peer name.
  // We need to hash our seed to get the "public key" equivalent.

  // The simplest approach: use sodium for BLAKE3 emulation via generic hash
  // Actually, let's use crypto.subtle for SHA-256 since we don't have BLAKE3 in browser
  // The WASM does BLAKE3 internally, but we can't call that from JS directly.

  // Looking at lib.rs more carefully:
  // - generate_identity() does: random 32 bytes -> BLAKE3 -> bech32m
  // - peer_name_from_pubkey(pubkey) does: BLAKE3(pubkey) -> bech32m

  // So we should call peer_name_from_pubkey with our derived seed as the "pubkey"
  const peerName = wasm.peer_name_from_pubkey(seed);
  return peerName;
}

/**
 * Validate that a string is a valid frtun peer name.
 *
 * Valid format: frtun1<bech32m-chars>.peer
 *
 * @param peerName - String to validate
 * @returns true if valid frtun peer name
 */
export function isValidPeerName(peerName: string): boolean {
  // Must start with "frtun1" and end with ".peer"
  if (!peerName.startsWith('frtun1') || !peerName.endsWith('.peer')) {
    return false;
  }

  // Extract bech32m data portion
  const data = peerName.slice(6, -5); // Remove "frtun1" prefix and ".peer" suffix

  // Bech32m uses lowercase alphanumeric except 1, b, i, o
  // Valid chars: 023456789acdefghjklmnpqrstuvwxyz
  const validChars = /^[023456789acdefghjklmnpqrstuvwxyz]+$/;
  if (!validChars.test(data)) {
    return false;
  }

  // Reasonable length (BLAKE3 hash is 32 bytes = ~52 chars in bech32m)
  return data.length >= 30 && data.length <= 80;
}
