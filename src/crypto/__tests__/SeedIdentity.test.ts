/**
 * SeedIdentity.test.ts
 * Vapor PWA - BIP-39 Seed Identity Tests
 *
 * Tests mnemonic generation, validation, and deterministic key derivation.
 * Ensures identity recovery works correctly across devices.
 */

import { describe, it, expect } from 'vitest';
import {
  generateMnemonic,
  validateMnemonic,
  deriveIdentityFromMnemonic,
  getIdentityFingerprint,
  formatMnemonicForDisplay,
  wipeKeys,
} from '../SeedIdentity';

// Test mnemonic (DO NOT use in production)
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('SeedIdentity', () => {
  describe('generateMnemonic', () => {
    it('should generate a 12-word mnemonic', async () => {
      const mnemonic = await generateMnemonic();
      const words = mnemonic.split(' ');

      expect(words.length).toBe(12);
    });

    it('should generate unique mnemonics', async () => {
      const mnemonic1 = await generateMnemonic();
      const mnemonic2 = await generateMnemonic();

      expect(mnemonic1).not.toBe(mnemonic2);
    });

    it('should generate valid mnemonics', async () => {
      const mnemonic = await generateMnemonic();
      const isValid = await validateMnemonic(mnemonic);

      expect(isValid).toBe(true);
    });
  });

  describe('validateMnemonic', () => {
    it('should accept valid 12-word mnemonic', async () => {
      const isValid = await validateMnemonic(TEST_MNEMONIC);
      expect(isValid).toBe(true);
    });

    it('should reject mnemonic with wrong word count', async () => {
      const shortMnemonic = 'abandon abandon abandon';
      const isValid = await validateMnemonic(shortMnemonic);
      expect(isValid).toBe(false);
    });

    it('should reject mnemonic with invalid words', async () => {
      const invalidMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon xyz123';
      const isValid = await validateMnemonic(invalidMnemonic);
      expect(isValid).toBe(false);
    });

    it('should reject mnemonic with invalid checksum', async () => {
      // Valid words but wrong checksum
      const badChecksum = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
      const isValid = await validateMnemonic(badChecksum);
      expect(isValid).toBe(false);
    });

    it('should normalize mnemonic (trim whitespace)', async () => {
      const spacedMnemonic = '  abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ';
      const isValid = await validateMnemonic(spacedMnemonic);
      expect(isValid).toBe(true);
    });

    it('should normalize mnemonic (lowercase)', async () => {
      const uppercaseMnemonic = 'ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABOUT';
      const isValid = await validateMnemonic(uppercaseMnemonic);
      expect(isValid).toBe(true);
    });

    it('should handle extra spaces between words', async () => {
      const extraSpaces = 'abandon  abandon   abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const isValid = await validateMnemonic(extraSpaces);
      expect(isValid).toBe(true);
    });
  });

  describe('deriveIdentityFromMnemonic', () => {
    it('should derive 32-byte public key', async () => {
      const keys = await deriveIdentityFromMnemonic(TEST_MNEMONIC);

      expect(keys.publicKey).toBeInstanceOf(Uint8Array);
      expect(keys.publicKey.length).toBe(32);
    }, 15000);

    it('should derive 32-byte private key', async () => {
      const keys = await deriveIdentityFromMnemonic(TEST_MNEMONIC);

      expect(keys.privateKey).toBeInstanceOf(Uint8Array);
      expect(keys.privateKey.length).toBe(32);
    }, 15000);

    it('should produce deterministic keys for same mnemonic', async () => {
      const keys1 = await deriveIdentityFromMnemonic(TEST_MNEMONIC);
      const keys2 = await deriveIdentityFromMnemonic(TEST_MNEMONIC);

      expect(Array.from(keys1.publicKey)).toEqual(Array.from(keys2.publicKey));
      expect(Array.from(keys1.privateKey)).toEqual(Array.from(keys2.privateKey));
    }, 30000);

    it('should produce different keys for different mnemonics', async () => {
      const mnemonic2 = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

      const keys1 = await deriveIdentityFromMnemonic(TEST_MNEMONIC);
      const keys2 = await deriveIdentityFromMnemonic(mnemonic2);

      expect(Array.from(keys1.publicKey)).not.toEqual(Array.from(keys2.publicKey));
      expect(Array.from(keys1.privateKey)).not.toEqual(Array.from(keys2.privateKey));
    }, 30000);

    it('should normalize mnemonic before derivation', async () => {
      const normalMnemonic = TEST_MNEMONIC;
      const spacedMnemonic = '  ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABOUT  ';

      const keys1 = await deriveIdentityFromMnemonic(normalMnemonic);
      const keys2 = await deriveIdentityFromMnemonic(spacedMnemonic);

      expect(Array.from(keys1.publicKey)).toEqual(Array.from(keys2.publicKey));
    }, 30000);

    it('should produce non-zero keys', async () => {
      const keys = await deriveIdentityFromMnemonic(TEST_MNEMONIC);

      const publicKeySum = keys.publicKey.reduce((a, b) => a + b, 0);
      const privateKeySum = keys.privateKey.reduce((a, b) => a + b, 0);

      expect(publicKeySum).toBeGreaterThan(0);
      expect(privateKeySum).toBeGreaterThan(0);
    }, 15000);
  });

  describe('getIdentityFingerprint', () => {
    it('should return 8-character uppercase hex string', async () => {
      const keys = await deriveIdentityFromMnemonic(TEST_MNEMONIC);
      const fingerprint = await getIdentityFingerprint(keys.publicKey);

      expect(fingerprint.length).toBe(8);
      expect(fingerprint).toMatch(/^[0-9A-F]{8}$/);
    }, 15000);

    it('should produce deterministic fingerprint', async () => {
      const keys = await deriveIdentityFromMnemonic(TEST_MNEMONIC);
      const fingerprint1 = await getIdentityFingerprint(keys.publicKey);
      const fingerprint2 = await getIdentityFingerprint(keys.publicKey);

      expect(fingerprint1).toBe(fingerprint2);
    }, 15000);

    it('should produce different fingerprints for different keys', async () => {
      const keys1 = await deriveIdentityFromMnemonic(TEST_MNEMONIC);
      const keys2 = await deriveIdentityFromMnemonic('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong');

      const fingerprint1 = await getIdentityFingerprint(keys1.publicKey);
      const fingerprint2 = await getIdentityFingerprint(keys2.publicKey);

      expect(fingerprint1).not.toBe(fingerprint2);
    }, 30000);
  });

  describe('formatMnemonicForDisplay', () => {
    it('should split mnemonic into groups of 4 words', () => {
      const groups = formatMnemonicForDisplay(TEST_MNEMONIC);

      expect(groups.length).toBe(3);
      expect(groups[0].split(' ').length).toBe(4);
      expect(groups[1].split(' ').length).toBe(4);
      expect(groups[2].split(' ').length).toBe(4);
    });

    it('should preserve all words', () => {
      const groups = formatMnemonicForDisplay(TEST_MNEMONIC);
      const reconstructed = groups.join(' ');

      expect(reconstructed).toBe(TEST_MNEMONIC);
    });
  });

  describe('wipeKeys', () => {
    it('should zero out private key', async () => {
      const keys = await deriveIdentityFromMnemonic(TEST_MNEMONIC);

      // Verify key is non-zero before wipe
      expect(keys.privateKey.some(b => b !== 0)).toBe(true);

      wipeKeys(keys);

      // All bytes should be zero after wipe
      expect(keys.privateKey.every(b => b === 0)).toBe(true);
    }, 15000);
  });
});
