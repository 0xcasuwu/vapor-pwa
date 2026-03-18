/**
 * SafetyNumber.test.ts
 * Vapor PWA - Safety Number Tests
 *
 * Tests MITM detection fingerprint generation.
 * Ensures both parties derive the same safety number.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSafetyNumber,
  generateNumericSafetyNumber,
  formatSafetyNumber,
} from '../SafetyNumber';

describe('SafetyNumber', () => {
  // Create test key pairs
  const createTestKey = (seed: number): Uint8Array => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = (seed * (i + 1)) % 256;
    }
    return key;
  };

  const aliceKey = createTestKey(42);
  const bobKey = createTestKey(123);

  describe('generateSafetyNumber', () => {
    it('should generate 6-word safety number', async () => {
      const safetyNumber = await generateSafetyNumber(aliceKey, bobKey);
      const words = safetyNumber.split('-');

      expect(words.length).toBe(6);
    });

    it('should produce consistent output for same keys', async () => {
      const number1 = await generateSafetyNumber(aliceKey, bobKey);
      const number2 = await generateSafetyNumber(aliceKey, bobKey);

      expect(number1).toBe(number2);
    });

    it('should be commutative (same result regardless of order)', async () => {
      // Alice computes with her key first
      const aliceComputes = await generateSafetyNumber(aliceKey, bobKey);
      // Bob computes with his key first
      const bobComputes = await generateSafetyNumber(bobKey, aliceKey);

      expect(aliceComputes).toBe(bobComputes);
    });

    it('should produce different numbers for different keys', async () => {
      const charlieKey = createTestKey(999);

      const aliceBob = await generateSafetyNumber(aliceKey, bobKey);
      const aliceCharlie = await generateSafetyNumber(aliceKey, charlieKey);

      expect(aliceBob).not.toBe(aliceCharlie);
    });

    it('should produce different numbers for completely different pairs', async () => {
      const charlieKey = createTestKey(999);
      const daveKey = createTestKey(777);

      const aliceBob = await generateSafetyNumber(aliceKey, bobKey);
      const charlieDave = await generateSafetyNumber(charlieKey, daveKey);

      expect(aliceBob).not.toBe(charlieDave);
    });

    it('should handle same key for both parties', async () => {
      // Edge case: what if someone tries to verify with themselves?
      const safetyNumber = await generateSafetyNumber(aliceKey, aliceKey);

      // Should still work (6 words)
      const words = safetyNumber.split('-');
      expect(words.length).toBe(6);
    });
  });

  describe('generateNumericSafetyNumber', () => {
    it('should generate 12 groups of 5 digits', async () => {
      const numericNumber = await generateNumericSafetyNumber(aliceKey, bobKey);
      const groups = numericNumber.split(' ');

      expect(groups.length).toBe(12);
      groups.forEach(group => {
        expect(group.length).toBe(5);
        expect(group).toMatch(/^\d{5}$/);
      });
    });

    it('should be commutative', async () => {
      const aliceComputes = await generateNumericSafetyNumber(aliceKey, bobKey);
      const bobComputes = await generateNumericSafetyNumber(bobKey, aliceKey);

      expect(aliceComputes).toBe(bobComputes);
    });

    it('should produce consistent output', async () => {
      const number1 = await generateNumericSafetyNumber(aliceKey, bobKey);
      const number2 = await generateNumericSafetyNumber(aliceKey, bobKey);

      expect(number1).toBe(number2);
    });

    it('should produce different numbers for different keys', async () => {
      const charlieKey = createTestKey(999);

      const aliceBob = await generateNumericSafetyNumber(aliceKey, bobKey);
      const aliceCharlie = await generateNumericSafetyNumber(aliceKey, charlieKey);

      expect(aliceBob).not.toBe(aliceCharlie);
    });
  });

  describe('formatSafetyNumber', () => {
    it('should capitalize each word', () => {
      const formatted = formatSafetyNumber('apple-river-mountain-sunset-ocean-forest');

      expect(formatted).toBe('Apple · River · Mountain · Sunset · Ocean · Forest');
    });

    it('should use middle dot separator', () => {
      const formatted = formatSafetyNumber('word-word-word');

      expect(formatted).toContain(' · ');
      expect(formatted).not.toContain('-');
    });

    it('should handle single word', () => {
      const formatted = formatSafetyNumber('apple');

      expect(formatted).toBe('Apple');
    });

    it('should preserve word content', () => {
      const safetyNumber = 'thunder-crystal-shadow-phoenix-dragon-garden';
      const formatted = formatSafetyNumber(safetyNumber);

      expect(formatted.toLowerCase().replace(/ · /g, '-')).toBe(safetyNumber);
    });
  });

  describe('Edge Cases', () => {
    it('should handle keys of different content', async () => {
      // All zeros
      const zeroKey = new Uint8Array(32);
      // All 0xFF
      const maxKey = new Uint8Array(32).fill(255);

      const safetyNumber = await generateSafetyNumber(zeroKey, maxKey);
      const words = safetyNumber.split('-');

      expect(words.length).toBe(6);
    });

    it('should handle sequential byte patterns', async () => {
      const seqKey1 = new Uint8Array(32);
      const seqKey2 = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        seqKey1[i] = i;
        seqKey2[i] = 255 - i;
      }

      const safetyNumber = await generateSafetyNumber(seqKey1, seqKey2);
      const words = safetyNumber.split('-');

      expect(words.length).toBe(6);
    });
  });
});
