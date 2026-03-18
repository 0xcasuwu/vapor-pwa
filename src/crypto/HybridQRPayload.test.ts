/**
 * HybridQRPayload.test.ts
 * Tests for QR payload encoding and decoding
 */

import { describe, it, expect } from 'vitest';
import {
  generateQRPayload,
  encodePayload,
  decodePayload,
  encodeToBase64,
  decodeFromBase64,
  encodeToCompressedBase64,
  decodeFromCompressedBase64,
  isExpired,
  getRemainingSeconds,
  isHybrid,
  isLegacy,
  isValid,
  VERSION_HYBRID,
  PAYLOAD_SIZES,
} from './HybridQRPayload';
import { generateHybridKeyPair } from './HybridKeyPair';

describe('HybridQRPayload', () => {
  describe('generateQRPayload', () => {
    it('creates valid hybrid payload from key pair', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      expect(payload.version).toBe(VERSION_HYBRID);
      expect(payload.classicalPublicKey).toEqual(keyPair.publicKey.classical);
      expect(payload.pqPublicKey).toEqual(keyPair.publicKey.pq);
      expect(payload.nonce.length).toBe(PAYLOAD_SIZES.NONCE);
      expect(payload.timestamp).toBeGreaterThan(0);
    });

    it('generates unique nonces', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload1 = generateQRPayload(keyPair.publicKey);
      const payload2 = generateQRPayload(keyPair.publicKey);

      expect(payload1.nonce).not.toEqual(payload2.nonce);
    });
  });

  describe('encodePayload / decodePayload', () => {
    it('round-trips hybrid payload correctly', async () => {
      const keyPair = await generateHybridKeyPair();
      const original = generateQRPayload(keyPair.publicKey);

      const encoded = encodePayload(original);
      expect(encoded.length).toBe(PAYLOAD_SIZES.HYBRID_TOTAL);

      const decoded = decodePayload(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(original.version);
      expect(decoded!.classicalPublicKey).toEqual(original.classicalPublicKey);
      expect(decoded!.pqPublicKey).toEqual(original.pqPublicKey);
      expect(decoded!.nonce).toEqual(original.nonce);
      expect(decoded!.timestamp).toBeCloseTo(original.timestamp, 5);
    });

    it('returns null for invalid data', () => {
      expect(decodePayload(new Uint8Array(0))).toBeNull();
      expect(decodePayload(new Uint8Array([0xff]))).toBeNull(); // Invalid version
      expect(decodePayload(new Uint8Array(50))).toBeNull(); // Wrong size
    });
  });

  describe('base64 encoding', () => {
    it('round-trips uncompressed base64', async () => {
      const keyPair = await generateHybridKeyPair();
      const original = generateQRPayload(keyPair.publicKey);

      const base64 = encodeToBase64(original);
      const decoded = decodeFromBase64(base64);

      expect(decoded).not.toBeNull();
      expect(decoded!.classicalPublicKey).toEqual(original.classicalPublicKey);
      expect(decoded!.pqPublicKey).toEqual(original.pqPublicKey);
    });

    it('round-trips compressed base64', async () => {
      const keyPair = await generateHybridKeyPair();
      const original = generateQRPayload(keyPair.publicKey);

      const compressed = encodeToCompressedBase64(original);
      const decoded = decodeFromCompressedBase64(compressed);

      expect(decoded).not.toBeNull();
      expect(decoded!.classicalPublicKey).toEqual(original.classicalPublicKey);
      expect(decoded!.pqPublicKey).toEqual(original.pqPublicKey);
    });

    it('compressed encoding produces reasonable size', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      const compressed = encodeToCompressedBase64(payload);

      // Compressed should be under 2000 chars for QR compatibility
      // Random crypto data doesn't compress well, so we just verify size is reasonable
      expect(compressed.length).toBeLessThan(2000);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it('handles invalid base64 gracefully', () => {
      expect(decodeFromBase64('!!!invalid!!!')).toBeNull();
      expect(decodeFromCompressedBase64('!!!invalid!!!')).toBeNull();
    });
  });

  describe('expiry', () => {
    it('isExpired returns false for fresh payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      expect(isExpired(payload)).toBe(false);
    });

    it('isExpired returns true for old payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      // Set timestamp beyond DEFAULT_EXPIRY_SECONDS (3600s = 1 hour)
      payload.timestamp = (Date.now() / 1000) - 7200; // 2 hours ago

      expect(isExpired(payload)).toBe(true);
    });

    it('getRemainingSeconds returns positive value for fresh payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      const remaining = getRemainingSeconds(payload);
      // DEFAULT_EXPIRY_SECONDS is 3600 (1 hour)
      expect(remaining).toBeGreaterThan(3595);
      expect(remaining).toBeLessThanOrEqual(3600);
    });

    it('getRemainingSeconds returns 0 for expired payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      // Set timestamp beyond DEFAULT_EXPIRY_SECONDS (3600s)
      payload.timestamp = (Date.now() / 1000) - 7200; // 2 hours ago

      expect(getRemainingSeconds(payload)).toBe(0);
    });
  });

  describe('type checks', () => {
    it('isHybrid returns true for hybrid payload', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      expect(isHybrid(payload)).toBe(true);
      expect(isLegacy(payload)).toBe(false);
    });

    it('isValid validates payload structure', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      expect(isValid(payload)).toBe(true);
    });

    it('isValid rejects invalid classical key size', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      payload.classicalPublicKey = new Uint8Array(16); // Wrong size

      expect(isValid(payload)).toBe(false);
    });

    it('isValid rejects invalid nonce size', async () => {
      const keyPair = await generateHybridKeyPair();
      const payload = generateQRPayload(keyPair.publicKey);

      payload.nonce = new Uint8Array(16); // Wrong size

      expect(isValid(payload)).toBe(false);
    });
  });
});
