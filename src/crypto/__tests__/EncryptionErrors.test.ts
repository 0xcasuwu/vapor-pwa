/**
 * EncryptionErrors.test.ts
 * Vapor PWA - Encryption Error Handling Tests
 *
 * Tests error paths for XChaCha20-Poly1305 encryption.
 * Verifies failure modes for wrong keys, tampering, and malformed data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers';
import {
  encrypt,
  decrypt,
  decryptBytes,
  generateKey,
  destroyKey,
  ENCRYPTION_SIZES,
} from '../Encryption';

describe('Encryption Error Handling', () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  describe('decrypt with wrong key', () => {
    it('should throw error when decrypting with wrong key', async () => {
      const correctKey = await generateKey();
      const wrongKey = await generateKey();
      const plaintext = 'Secret message';

      const encrypted = await encrypt(plaintext, correctKey);

      await expect(decrypt(encrypted, wrongKey)).rejects.toThrow(
        'Decryption failed: message tampered or wrong key'
      );
    });

    it('should throw error when key is all zeros', async () => {
      const correctKey = await generateKey();
      const zeroKey = new Uint8Array(32);
      const plaintext = 'Secret message';

      const encrypted = await encrypt(plaintext, correctKey);

      await expect(decrypt(encrypted, zeroKey)).rejects.toThrow();
    });

    it('should throw error when keys differ by one byte', async () => {
      const correctKey = await generateKey();
      const plaintext = 'Secret message';

      const encrypted = await encrypt(plaintext, correctKey);

      // Flip one bit in the key
      const almostCorrectKey = new Uint8Array(correctKey);
      almostCorrectKey[0] ^= 0x01;

      await expect(decrypt(encrypted, almostCorrectKey)).rejects.toThrow();
    });
  });

  describe('decrypt with tampered ciphertext', () => {
    it('should throw error when ciphertext is modified', async () => {
      const key = await generateKey();
      const plaintext = 'Secret message';

      const encrypted = await encrypt(plaintext, key);

      // Tamper with the ciphertext (skip nonce)
      encrypted[ENCRYPTION_SIZES.NONCE + 5] ^= 0xFF;

      await expect(decrypt(encrypted, key)).rejects.toThrow(
        'Decryption failed: message tampered or wrong key'
      );
    });

    it('should throw error when nonce is modified', async () => {
      const key = await generateKey();
      const plaintext = 'Secret message';

      const encrypted = await encrypt(plaintext, key);

      // Tamper with the nonce
      encrypted[0] ^= 0xFF;

      await expect(decrypt(encrypted, key)).rejects.toThrow();
    });

    it('should throw error when auth tag is modified', async () => {
      const key = await generateKey();
      const plaintext = 'Secret message';

      const encrypted = await encrypt(plaintext, key);

      // Tamper with the last byte (auth tag)
      encrypted[encrypted.length - 1] ^= 0xFF;

      await expect(decrypt(encrypted, key)).rejects.toThrow();
    });
  });

  describe('decrypt with truncated data', () => {
    it('should throw error when data is too short', async () => {
      const key = await generateKey();

      // Data shorter than minimum overhead
      const truncated = new Uint8Array(ENCRYPTION_SIZES.OVERHEAD - 1);

      await expect(decrypt(truncated, key)).rejects.toThrow('Ciphertext too short');
    });

    it('should throw error when only nonce is present', async () => {
      const key = await generateKey();

      // Just the nonce, no ciphertext
      const onlyNonce = new Uint8Array(ENCRYPTION_SIZES.NONCE);

      await expect(decrypt(onlyNonce, key)).rejects.toThrow('Ciphertext too short');
    });

    it('should throw error when ciphertext is truncated', async () => {
      const key = await generateKey();
      const plaintext = 'Secret message that is reasonably long';

      const encrypted = await encrypt(plaintext, key);

      // Truncate to just nonce + a few bytes
      const truncated = encrypted.slice(0, ENCRYPTION_SIZES.OVERHEAD + 5);

      // This should fail auth check
      await expect(decrypt(truncated, key)).rejects.toThrow();
    });
  });

  describe('decryptBytes error handling', () => {
    it('should throw error with wrong key', async () => {
      const correctKey = await generateKey();
      const wrongKey = await generateKey();
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const encrypted = await encrypt(plaintext, correctKey);

      await expect(decryptBytes(encrypted, wrongKey)).rejects.toThrow();
    });

    it('should throw error with truncated data', async () => {
      const key = await generateKey();
      const truncated = new Uint8Array(10);

      await expect(decryptBytes(truncated, key)).rejects.toThrow('Ciphertext too short');
    });

    it('should throw error with tampered data', async () => {
      const key = await generateKey();
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const encrypted = await encrypt(plaintext, key);
      encrypted[encrypted.length - 2] ^= 0xFF; // Tamper

      await expect(decryptBytes(encrypted, key)).rejects.toThrow();
    });
  });

  describe('encrypt/decrypt edge cases', () => {
    it('should handle empty message', async () => {
      const key = await generateKey();
      const plaintext = '';

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe('');
    });

    it('should handle empty bytes', async () => {
      const key = await generateKey();
      const plaintext = new Uint8Array(0);

      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decryptBytes(encrypted, key);

      expect(decrypted.length).toBe(0);
    });

    it('should handle very large message', async () => {
      const key = await generateKey();
      // 1MB message
      const largeMessage = 'A'.repeat(1024 * 1024);

      const encrypted = await encrypt(largeMessage, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(largeMessage);
    });

    it('should handle unicode in message', async () => {
      const key = await generateKey();
      const unicodeMessage = '你好世界 🔐 مرحبا';

      const encrypted = await encrypt(unicodeMessage, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(unicodeMessage);
    });

    it('should handle binary data', async () => {
      const key = await generateKey();
      const binaryData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        binaryData[i] = i; // All possible byte values
      }

      const encrypted = await encrypt(binaryData, key);
      const decrypted = await decryptBytes(encrypted, key);

      expect(Array.from(decrypted)).toEqual(Array.from(binaryData));
    });
  });

  describe('generateKey', () => {
    it('should generate 32-byte key', async () => {
      const key = await generateKey();

      expect(key.length).toBe(ENCRYPTION_SIZES.KEY);
      expect(key.length).toBe(32);
    });

    it('should generate unique keys', async () => {
      const key1 = await generateKey();
      const key2 = await generateKey();

      expect(Array.from(key1)).not.toEqual(Array.from(key2));
    });

    it('should generate non-zero keys', async () => {
      const key = await generateKey();

      const sum = key.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0);
    });
  });

  describe('destroyKey', () => {
    it('should zero out key', async () => {
      const key = await generateKey();

      // Verify key is non-zero
      expect(key.some(b => b !== 0)).toBe(true);

      destroyKey(key);

      // All bytes should be zero
      expect(key.every(b => b === 0)).toBe(true);
    });

    it('should handle already zeroed key', () => {
      const key = new Uint8Array(32);

      // Should not throw
      expect(() => destroyKey(key)).not.toThrow();
    });
  });

  describe('ENCRYPTION_SIZES constants', () => {
    it('should define correct key size', () => {
      expect(ENCRYPTION_SIZES.KEY).toBe(32);
    });

    it('should define correct nonce size', () => {
      expect(ENCRYPTION_SIZES.NONCE).toBe(24);
    });

    it('should define correct tag size', () => {
      expect(ENCRYPTION_SIZES.TAG).toBe(16);
    });

    it('should define correct overhead', () => {
      expect(ENCRYPTION_SIZES.OVERHEAD).toBe(ENCRYPTION_SIZES.NONCE + ENCRYPTION_SIZES.TAG);
      expect(ENCRYPTION_SIZES.OVERHEAD).toBe(40);
    });
  });

  describe('Encryption output format', () => {
    it('should produce output with correct structure', async () => {
      const key = await generateKey();
      const plaintext = 'Test message';

      const encrypted = await encrypt(plaintext, key);

      // Output should be: nonce (24) + ciphertext (len + 16 for tag)
      const expectedMinLength = ENCRYPTION_SIZES.OVERHEAD + 1; // At least 1 byte of plaintext
      expect(encrypted.length).toBeGreaterThanOrEqual(expectedMinLength);

      // Nonce should be in first 24 bytes
      const nonce = encrypted.slice(0, ENCRYPTION_SIZES.NONCE);
      expect(nonce.length).toBe(24);
    });

    it('should produce unique ciphertexts for same plaintext', async () => {
      const key = await generateKey();
      const plaintext = 'Same message';

      const encrypted1 = await encrypt(plaintext, key);
      const encrypted2 = await encrypt(plaintext, key);

      // Same key and plaintext should produce different ciphertexts (due to random nonce)
      expect(Array.from(encrypted1)).not.toEqual(Array.from(encrypted2));
    });

    it('should produce same plaintext on decrypt', async () => {
      const key = await generateKey();
      const plaintext = 'Same message';

      const encrypted1 = await encrypt(plaintext, key);
      const encrypted2 = await encrypt(plaintext, key);

      const decrypted1 = await decrypt(encrypted1, key);
      const decrypted2 = await decrypt(encrypted2, key);

      // Both should decrypt to same plaintext
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
      expect(decrypted1).toBe(decrypted2);
    });
  });

  describe('Replay attack resistance', () => {
    it('should use random nonces', async () => {
      const key = await generateKey();
      const plaintext = 'Test';

      const nonces = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const encrypted = await encrypt(plaintext, key);
        const nonce = Array.from(encrypted.slice(0, ENCRYPTION_SIZES.NONCE))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        nonces.add(nonce);
      }

      // All nonces should be unique
      expect(nonces.size).toBe(100);
    });
  });
});
