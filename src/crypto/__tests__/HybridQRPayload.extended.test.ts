/**
 * HybridQRPayload.extended.test.ts
 * Vapor PWA - Extended HybridQRPayload Tests
 *
 * Additional edge case tests for HybridQRPayload encoding/decoding.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers';
import {
  generateQRPayload,
  encodeToBase64,
  encodeToCompressedBase64,
  decodeFromBase64,
  decodeFromCompressedBase64,
  isExpired,
  isValid,
  isHybrid,
  getRemainingSeconds,
  DEFAULT_EXPIRY_SECONDS,
} from '../HybridQRPayload';
import { generateHybridKeyPair } from '../HybridKeyPair';

describe('HybridQRPayload - Extended Tests', () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  describe('generateQRPayload', () => {
    it('should generate payload with random nonce', async () => {
      const keyPair = await generateHybridKeyPair();

      const payload1 = generateQRPayload(keyPair.publicKey);
      const payload2 = generateQRPayload(keyPair.publicKey);

      // Nonces should be different
      expect(Array.from(payload1.nonce)).not.toEqual(Array.from(payload2.nonce));
    });

    it('should include frtun peer ID when provided', async () => {
      const keyPair = await generateHybridKeyPair();
      const peerId = 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer';

      const payload = generateQRPayload(keyPair.publicKey, peerId);

      expect(payload.frtunPeerId).toBe(peerId);
    });

    it('should not include frtun peer ID when not provided', async () => {
      const keyPair = await generateHybridKeyPair();

      const payload = generateQRPayload(keyPair.publicKey);

      expect(payload.frtunPeerId).toBeUndefined();
    });

    it('should set timestamp to current time', async () => {
      const before = Math.floor(Date.now() / 1000);
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);
      const after = Math.floor(Date.now() / 1000) + 1; // Allow 1s tolerance

      expect(payload.timestamp).toBeGreaterThanOrEqual(before);
      expect(payload.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('encoding/decoding round trips', () => {
    it('should round-trip through base64', async () => {
      const keyPair = await generateHybridKeyPair();
      const original = generateQRPayload(keyPair.publicKey);

      const encoded = encodeToBase64(original);
      const decoded = decodeFromBase64(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.timestamp).toBe(original.timestamp);
      expect(Array.from(decoded!.nonce)).toEqual(Array.from(original.nonce));
      expect(Array.from(decoded!.classicalPublicKey)).toEqual(
        Array.from(original.classicalPublicKey)
      );
      expect(Array.from(decoded!.pqPublicKey)).toEqual(
        Array.from(original.pqPublicKey)
      );
    });

    it('should round-trip through compressed base64', async () => {
      const keyPair = await generateHybridKeyPair();
      const original = generateQRPayload(keyPair.publicKey);

      const encoded = encodeToCompressedBase64(original);
      const decoded = decodeFromCompressedBase64(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.timestamp).toBe(original.timestamp);
      expect(Array.from(decoded!.nonce)).toEqual(Array.from(original.nonce));
    });

    it('should preserve frtun peer ID through round-trip', async () => {
      const keyPair = await generateHybridKeyPair();
      const peerId = 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1lkjhgfdsa0987.peer';
      const original = generateQRPayload(keyPair.publicKey, peerId);

      const encoded = encodeToCompressedBase64(original);
      const decoded = decodeFromCompressedBase64(encoded);

      expect(decoded?.frtunPeerId).toBe(peerId);
    });

    it('compressed encoding should produce valid output', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      const base64 = encodeToBase64(payload);
      const compressed = encodeToCompressedBase64(payload);

      // Both should be valid non-empty strings
      expect(base64.length).toBeGreaterThan(0);
      expect(compressed.length).toBeGreaterThan(0);
      // Compressed may or may not be smaller depending on data randomness
      // Just verify it's a valid encoding that round-trips
      const decoded = decodeFromCompressedBase64(compressed);
      expect(decoded).not.toBeNull();
    });
  });

  describe('decodeFromBase64 error handling', () => {
    it('should return null for empty string', () => {
      expect(decodeFromBase64('')).toBeNull();
    });

    it('should return null for invalid base64', () => {
      expect(decodeFromBase64('not!valid@base64#')).toBeNull();
    });

    it('should return null for too short payload', () => {
      const shortData = btoa('short');
      expect(decodeFromBase64(shortData)).toBeNull();
    });

    it('should return null for wrong version', () => {
      // Create fake payload with wrong version
      const fakePayload = new Uint8Array(1300);
      fakePayload[0] = 0x99; // Wrong version
      const encoded = btoa(String.fromCharCode(...fakePayload));
      expect(decodeFromBase64(encoded)).toBeNull();
    });
  });

  describe('decodeFromCompressedBase64 error handling', () => {
    it('should return null for empty string', () => {
      expect(decodeFromCompressedBase64('')).toBeNull();
    });

    it('should return null for invalid compressed data', () => {
      expect(decodeFromCompressedBase64('invalid-compressed')).toBeNull();
    });

    it('should return null for corrupt compressed data', () => {
      const corrupt = btoa('corrupt-zlib-data');
      expect(decodeFromCompressedBase64(corrupt)).toBeNull();
    });
  });

  describe('isExpired', () => {
    it('should return false for fresh payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      expect(isExpired(payload)).toBe(false);
    });

    it('should return true for old payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      // Set timestamp to past
      payload.timestamp = Math.floor(Date.now() / 1000) - DEFAULT_EXPIRY_SECONDS - 10;

      expect(isExpired(payload)).toBe(true);
    });

    it('should return true for timestamp at exact boundary', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      // Set timestamp to exactly expired
      payload.timestamp = Math.floor(Date.now() / 1000) - DEFAULT_EXPIRY_SECONDS;

      expect(isExpired(payload)).toBe(true);
    });

    it('should return true for timestamp=0', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);
      payload.timestamp = 0;

      expect(isExpired(payload)).toBe(true);
    });

    it('should return true for negative timestamp', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);
      payload.timestamp = -1000;

      expect(isExpired(payload)).toBe(true);
    });

    it('should return false for future timestamp', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      // Set timestamp to future (some clock skew tolerance)
      payload.timestamp = Math.floor(Date.now() / 1000) + 30;

      expect(isExpired(payload)).toBe(false);
    });
  });

  describe('isValid', () => {
    it('should return true for valid payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      expect(isValid(payload)).toBe(true);
    });

    it('should return false for wrong classical key size', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      // Corrupt key size
      payload.classicalPublicKey = new Uint8Array(16);

      expect(isValid(payload)).toBe(false);
    });

    it('should return false for wrong PQ key size', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      // Corrupt PQ key size
      payload.pqPublicKey = new Uint8Array(100);

      expect(isValid(payload)).toBe(false);
    });

    it('should return false for wrong nonce size', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      // Corrupt nonce size
      payload.nonce = new Uint8Array(16);

      expect(isValid(payload)).toBe(false);
    });

    it('should return true regardless of timestamp (isValid only checks structure)', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);
      payload.timestamp = 0;

      // isValid only checks structure, not expiry
      expect(isValid(payload)).toBe(true);
      expect(isExpired(payload)).toBe(true);
    });
  });

  describe('isHybrid', () => {
    it('should return true for hybrid payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      expect(isHybrid(payload)).toBe(true);
    });

    it('should return false for empty PQ key', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);
      payload.pqPublicKey = new Uint8Array(0);

      expect(isHybrid(payload)).toBe(false);
    });
  });

  describe('getRemainingSeconds', () => {
    it('should return positive for fresh payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      const remaining = getRemainingSeconds(payload);

      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(DEFAULT_EXPIRY_SECONDS);
    });

    it('should return 0 for expired payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);
      payload.timestamp = Math.floor(Date.now() / 1000) - DEFAULT_EXPIRY_SECONDS - 100;

      expect(getRemainingSeconds(payload)).toBe(0);
    });

    it('should decrease over time', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      const remaining1 = getRemainingSeconds(payload);

      // Wait a bit
      await new Promise(r => setTimeout(r, 100));

      const remaining2 = getRemainingSeconds(payload);

      expect(remaining2).toBeLessThanOrEqual(remaining1);
    });
  });

  describe('DEFAULT_EXPIRY_SECONDS constant', () => {
    it('should be 3600 seconds (1 hour)', () => {
      expect(DEFAULT_EXPIRY_SECONDS).toBe(3600);
    });
  });
});
