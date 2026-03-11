/**
 * Encryption.test.ts
 * Tests for XChaCha20-Poly1305 authenticated encryption
 */

import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  decryptBytes,
  generateKey,
  destroyKey,
  ENCRYPTION_SIZES,
} from './Encryption';

describe('Encryption', () => {
  describe('generateKey', () => {
    it('generates a 32-byte key', async () => {
      const key = await generateKey();
      expect(key.length).toBe(ENCRYPTION_SIZES.KEY);
    });

    it('generates unique keys', async () => {
      const key1 = await generateKey();
      const key2 = await generateKey();
      expect(key1).not.toEqual(key2);
    });
  });

  describe('encrypt/decrypt', () => {
    it('round-trips string messages', async () => {
      const key = await generateKey();
      const message = 'Hello, Vapor!';

      const encrypted = await encrypt(message, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(message);
    });

    it('round-trips Uint8Array messages', async () => {
      const key = await generateKey();
      const message = new Uint8Array([1, 2, 3, 4, 5]);

      const encrypted = await encrypt(message, key);
      const decrypted = await decryptBytes(encrypted, key);

      expect(decrypted).toEqual(message);
    });

    it('round-trips empty messages', async () => {
      const key = await generateKey();
      const message = '';

      const encrypted = await encrypt(message, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(message);
    });

    it('round-trips unicode messages', async () => {
      const key = await generateKey();
      const message = '🔐 Secure message with émojis and ünïcödé!';

      const encrypted = await encrypt(message, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(message);
    });

    it('produces ciphertext with correct overhead', async () => {
      const key = await generateKey();
      const message = 'Test';
      const messageBytes = new TextEncoder().encode(message);

      const encrypted = await encrypt(message, key);

      // Should be: nonce (24) + plaintext length + tag (16)
      expect(encrypted.length).toBe(messageBytes.length + ENCRYPTION_SIZES.OVERHEAD);
    });

    it('produces different ciphertext for same message (random nonce)', async () => {
      const key = await generateKey();
      const message = 'Same message';

      const encrypted1 = await encrypt(message, key);
      const encrypted2 = await encrypt(message, key);

      expect(encrypted1).not.toEqual(encrypted2);
    });
  });

  describe('decryption failures', () => {
    it('fails with wrong key', async () => {
      const key1 = await generateKey();
      const key2 = await generateKey();
      const message = 'Secret';

      const encrypted = await encrypt(message, key1);

      await expect(decrypt(encrypted, key2)).rejects.toThrow('Decryption failed');
    });

    it('fails with tampered ciphertext', async () => {
      const key = await generateKey();
      const message = 'Secret';

      const encrypted = await encrypt(message, key);

      // Tamper with the ciphertext
      encrypted[30] ^= 0xff;

      await expect(decrypt(encrypted, key)).rejects.toThrow('Decryption failed');
    });

    it('fails with truncated ciphertext', async () => {
      const key = await generateKey();

      const tooShort = new Uint8Array(ENCRYPTION_SIZES.OVERHEAD - 1);

      await expect(decrypt(tooShort, key)).rejects.toThrow('Ciphertext too short');
    });
  });

  describe('destroyKey', () => {
    it('zeros key material', async () => {
      const key = await generateKey();

      // Verify key is not all zeros
      expect(key.some(b => b !== 0)).toBe(true);

      destroyKey(key);

      // All bytes should be zero
      expect(key.every(b => b === 0)).toBe(true);
    });
  });
});
