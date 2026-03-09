/**
 * Encryption.ts
 * Vapor PWA - ChaCha20-Poly1305 Authenticated Encryption
 *
 * Uses libsodium for ChaCha20-Poly1305 AEAD encryption.
 * Protocol-compatible with Vapor iOS.
 *
 * Message Format:
 * - Nonce: 24 bytes (XChaCha20-Poly1305)
 * - Ciphertext: variable length
 * - Tag: 16 bytes (Poly1305)
 * Combined format: nonce || ciphertext || tag
 */

import sodium from 'libsodium-wrappers';

// Encryption constants
export const ENCRYPTION_SIZES = {
  KEY: 32,           // 256-bit key
  NONCE: 24,         // XChaCha20-Poly1305 uses 24-byte nonce
  TAG: 16,           // Poly1305 tag
  OVERHEAD: 24 + 16, // Total overhead per message: 40 bytes
} as const;

/**
 * Encrypt a message using XChaCha20-Poly1305
 *
 * @param plaintext - Message to encrypt (string or Uint8Array)
 * @param key - 32-byte symmetric key
 * @returns Combined ciphertext (nonce || ciphertext || tag)
 */
export async function encrypt(
  plaintext: string | Uint8Array,
  key: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;

  // Convert string to bytes if needed
  const plaintextBytes = typeof plaintext === 'string'
    ? sodium.from_string(plaintext)
    : plaintext;

  // Generate random nonce
  const nonce = sodium.randombytes_buf(ENCRYPTION_SIZES.NONCE);

  // Encrypt with XChaCha20-Poly1305
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    null, // No additional data
    null, // Secret nonce (not used)
    nonce,
    key
  );

  // Combine: nonce || ciphertext (tag is appended by libsodium)
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  return combined;
}

/**
 * Decrypt a message using XChaCha20-Poly1305
 *
 * @param combined - Combined ciphertext (nonce || ciphertext || tag)
 * @param key - 32-byte symmetric key
 * @returns Decrypted plaintext as string
 * @throws Error if decryption or authentication fails
 */
export async function decrypt(
  combined: Uint8Array,
  key: Uint8Array
): Promise<string> {
  await sodium.ready;

  if (combined.length < ENCRYPTION_SIZES.OVERHEAD) {
    throw new Error('Ciphertext too short');
  }

  // Extract nonce and ciphertext
  const nonce = combined.slice(0, ENCRYPTION_SIZES.NONCE);
  const ciphertext = combined.slice(ENCRYPTION_SIZES.NONCE);

  try {
    // Decrypt and verify
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null, // Secret nonce (not used)
      ciphertext,
      null, // No additional data
      nonce,
      key
    );

    return sodium.to_string(plaintext);
  } catch {
    throw new Error('Decryption failed: message tampered or wrong key');
  }
}

/**
 * Decrypt a message and return raw bytes
 *
 * @param combined - Combined ciphertext (nonce || ciphertext || tag)
 * @param key - 32-byte symmetric key
 * @returns Decrypted plaintext as Uint8Array
 */
export async function decryptBytes(
  combined: Uint8Array,
  key: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;

  if (combined.length < ENCRYPTION_SIZES.OVERHEAD) {
    throw new Error('Ciphertext too short');
  }

  const nonce = combined.slice(0, ENCRYPTION_SIZES.NONCE);
  const ciphertext = combined.slice(ENCRYPTION_SIZES.NONCE);

  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      key
    );
  } catch {
    throw new Error('Decryption failed: message tampered or wrong key');
  }
}

/**
 * Generate a random symmetric key
 */
export async function generateKey(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.randombytes_buf(ENCRYPTION_SIZES.KEY);
}

/**
 * Securely zero a key from memory (best effort in JS)
 */
export function destroyKey(key: Uint8Array): void {
  key.fill(0);
}
