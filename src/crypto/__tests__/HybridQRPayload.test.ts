/**
 * HybridQRPayload.test.ts
 * Vapor PWA - QR Payload Protocol Tests
 *
 * Tests v2 (hybrid), v3 (hybrid + libp2p - deprecated), and v4 (hybrid + frtun) payload encoding/decoding.
 * Verifies protocol compatibility and peer ID handling.
 */

import { describe, it, expect } from 'vitest';
import {
  VERSION_CLASSIC_ONLY,
  VERSION_HYBRID,
  VERSION_HYBRID_LIBP2P,
  VERSION_HYBRID_FRTUN,
  PAYLOAD_SIZES,
  generateQRPayload,
  encodePayload,
  decodePayload,
  encodeToBase64,
  decodeFromBase64,
  encodeToCompressedBase64,
  decodeFromCompressedBase64,
  isExpired,
  isHybrid,
  isLegacy,
  hasLibp2pPeerId,
  hasFrtunPeerId,
  isValid,
  type HybridQRPayload,
} from '../HybridQRPayload';
import { KEY_SIZES } from '../HybridKeyPair';

// Test fixtures
const createMockPublicKey = () => ({
  classical: crypto.getRandomValues(new Uint8Array(KEY_SIZES.CLASSICAL_PUBLIC_KEY)),
  pq: crypto.getRandomValues(new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY)),
});

const TEST_LIBP2P_PEER_ID = '12D3KooWRm8J3iL796zPFi2btZxKp6aW7XQ2CfWKxM1bZ8Jc4Xyz';
const TEST_FRTUN_PEER_ID = 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1lkjhgfdsa0987654321.peer';

describe('HybridQRPayload', () => {
  describe('Protocol Constants', () => {
    it('should define v1 (classic only) as 0x01', () => {
      expect(VERSION_CLASSIC_ONLY).toBe(0x01);
    });

    it('should define v2 (hybrid) as 0x02', () => {
      expect(VERSION_HYBRID).toBe(0x02);
    });

    it('should define v3 (hybrid + libp2p) as 0x03', () => {
      expect(VERSION_HYBRID_LIBP2P).toBe(0x03);
    });

    it('should define v4 (hybrid + frtun) as 0x04', () => {
      expect(VERSION_HYBRID_FRTUN).toBe(0x04);
    });

    it('should define correct payload sizes', () => {
      expect(PAYLOAD_SIZES.VERSION).toBe(1);
      expect(PAYLOAD_SIZES.NONCE).toBe(32);
      expect(PAYLOAD_SIZES.TIMESTAMP).toBe(8);
      expect(PAYLOAD_SIZES.PEER_ID_LENGTH).toBe(1);
      expect(PAYLOAD_SIZES.MAX_PEER_ID).toBe(255);
    });
  });

  describe('generateQRPayload', () => {
    it('should generate v2 payload without peer ID', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);

      expect(payload.version).toBe(VERSION_HYBRID);
      expect(payload.frtunPeerId).toBeUndefined();
    });

    it('should generate v4 payload with frtun peer ID', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey, TEST_FRTUN_PEER_ID);

      expect(payload.version).toBe(VERSION_HYBRID_FRTUN);
      expect(payload.frtunPeerId).toBe(TEST_FRTUN_PEER_ID);
    });

    it('should generate 32-byte random nonce', () => {
      const publicKey = createMockPublicKey();
      const payload1 = generateQRPayload(publicKey);
      const payload2 = generateQRPayload(publicKey);

      expect(payload1.nonce.length).toBe(32);
      expect(payload2.nonce.length).toBe(32);
      // Nonces should be different (random)
      expect(Array.from(payload1.nonce)).not.toEqual(Array.from(payload2.nonce));
    });

    it('should set current timestamp', () => {
      const before = Date.now() / 1000;
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);
      const after = Date.now() / 1000;

      expect(payload.timestamp).toBeGreaterThanOrEqual(before);
      expect(payload.timestamp).toBeLessThanOrEqual(after);
    });

    it('should copy public keys correctly', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);

      expect(Array.from(payload.classicalPublicKey)).toEqual(Array.from(publicKey.classical));
      expect(Array.from(payload.pqPublicKey)).toEqual(Array.from(publicKey.pq));
    });
  });

  describe('encodePayload / decodePayload', () => {
    it('should encode and decode v2 payload', () => {
      const publicKey = createMockPublicKey();
      const original = generateQRPayload(publicKey);
      
      const encoded = encodePayload(original);
      const decoded = decodePayload(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(VERSION_HYBRID);
      expect(Array.from(decoded!.classicalPublicKey)).toEqual(Array.from(original.classicalPublicKey));
      expect(Array.from(decoded!.pqPublicKey)).toEqual(Array.from(original.pqPublicKey));
      expect(Array.from(decoded!.nonce)).toEqual(Array.from(original.nonce));
      expect(decoded!.timestamp).toBeCloseTo(original.timestamp, 2);
    });

    it('should encode and decode v4 payload with frtun peer ID', () => {
      const publicKey = createMockPublicKey();
      const original = generateQRPayload(publicKey, TEST_FRTUN_PEER_ID);

      const encoded = encodePayload(original);
      const decoded = decodePayload(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(VERSION_HYBRID_FRTUN);
      expect(decoded!.frtunPeerId).toBe(TEST_FRTUN_PEER_ID);
      expect(Array.from(decoded!.classicalPublicKey)).toEqual(Array.from(original.classicalPublicKey));
    });

    it('should encode v2 payload to correct size', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);
      
      const encoded = encodePayload(payload);
      
      expect(encoded.length).toBe(PAYLOAD_SIZES.HYBRID_TOTAL);
    });

    it('should encode v4 payload to correct size', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey, TEST_FRTUN_PEER_ID);

      const encoded = encodePayload(payload);

      // v4 size = base + 1 (length byte) + peer ID length
      const expectedSize = PAYLOAD_SIZES.HYBRID_LIBP2P_BASE + TEST_FRTUN_PEER_ID.length;
      expect(encoded.length).toBe(expectedSize);
    });

    it('should return null for empty data', () => {
      const decoded = decodePayload(new Uint8Array(0));
      expect(decoded).toBeNull();
    });

    it('should return null for invalid version', () => {
      const data = new Uint8Array(100);
      data[0] = 0x99; // Invalid version
      const decoded = decodePayload(data);
      expect(decoded).toBeNull();
    });

    it('should handle empty peer ID in v3', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey, '');
      
      // Empty string should still use v2 format (no peer ID)
      expect(payload.version).toBe(VERSION_HYBRID);
    });
  });

  describe('Base64 Encoding', () => {
    it('should encode and decode via base64', () => {
      const publicKey = createMockPublicKey();
      const original = generateQRPayload(publicKey);
      
      const base64 = encodeToBase64(original);
      const decoded = decodeFromBase64(base64);

      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(original.version);
    });

    it('should encode and decode via compressed base64', () => {
      const publicKey = createMockPublicKey();
      const original = generateQRPayload(publicKey, TEST_FRTUN_PEER_ID);

      const compressed = encodeToCompressedBase64(original);
      const decoded = decodeFromCompressedBase64(compressed);

      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(VERSION_HYBRID_FRTUN);
      expect(decoded!.frtunPeerId).toBe(TEST_FRTUN_PEER_ID);
    });

    it('should compress and decompress successfully', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);

      const compressed = encodeToCompressedBase64(payload);
      const decoded = decodeFromCompressedBase64(compressed);

      // Verify round-trip works correctly
      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(payload.version);
      expect(Array.from(decoded!.nonce)).toEqual(Array.from(payload.nonce));
    });

    it('should return null for invalid base64', () => {
      const decoded = decodeFromBase64('!!!invalid!!!');
      expect(decoded).toBeNull();
    });
  });

  describe('Payload Validation', () => {
    it('isValid should return true for valid v2 payload', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);
      
      expect(isValid(payload)).toBe(true);
    });

    it('isValid should return true for valid v4 payload', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey, TEST_FRTUN_PEER_ID);

      expect(isValid(payload)).toBe(true);
    });

    it('isValid should return false for invalid classical key size', () => {
      const payload: HybridQRPayload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(16), // Wrong size
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };
      
      expect(isValid(payload)).toBe(false);
    });

    it('isValid should return false for invalid nonce size', () => {
      const payload: HybridQRPayload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(KEY_SIZES.CLASSICAL_PUBLIC_KEY),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(16), // Wrong size
        timestamp: Date.now() / 1000,
      };
      
      expect(isValid(payload)).toBe(false);
    });
  });

  describe('Type Checking', () => {
    it('isHybrid should return true for v2 payload', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);
      
      expect(isHybrid(payload)).toBe(true);
    });

    it('isHybrid should return true for v4 payload', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey, TEST_FRTUN_PEER_ID);

      expect(isHybrid(payload)).toBe(true);
    });

    it('isLegacy should return true for v1 payload', () => {
      const payload: HybridQRPayload = {
        version: VERSION_CLASSIC_ONLY,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(0),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };
      
      expect(isLegacy(payload)).toBe(true);
    });

    it('hasLibp2pPeerId should return false for v2 payload', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);
      
      expect(hasLibp2pPeerId(payload)).toBe(false);
    });

    it('hasFrtunPeerId should return true for v4 payload', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey, TEST_FRTUN_PEER_ID);

      expect(hasFrtunPeerId(payload)).toBe(true);
    });

    it('hasLibp2pPeerId should return false for v3 payload with empty peer ID', () => {
      const payload: HybridQRPayload = {
        version: VERSION_HYBRID_LIBP2P,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
        libp2pPeerId: '',
      };
      
      expect(hasLibp2pPeerId(payload)).toBe(false);
    });
  });

  describe('Expiry', () => {
    it('isExpired should return false for fresh payload', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);

      expect(isExpired(payload)).toBe(false);
    });

    it('isExpired should return false for payload within 1 hour', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);
      // Set timestamp to 30 minutes ago (within 3600s expiry)
      payload.timestamp = (Date.now() / 1000) - 1800;

      expect(isExpired(payload)).toBe(false);
    });

    it('isExpired should return true for old payload', () => {
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey);
      // Set timestamp to 2 hours ago (beyond 3600s expiry)
      payload.timestamp = (Date.now() / 1000) - 7200;

      expect(isExpired(payload)).toBe(true);
    });
  });

  describe('Protocol Compatibility', () => {
    it('v4 decoder should handle v2 payloads', () => {
      const publicKey = createMockPublicKey();
      const v2Payload = generateQRPayload(publicKey);

      const encoded = encodePayload(v2Payload);
      const decoded = decodePayload(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(VERSION_HYBRID);
      expect(decoded!.frtunPeerId).toBeUndefined();
    });

    it('v4 payload should encode and decode correctly', () => {
      const publicKey = createMockPublicKey();
      const v4Payload = generateQRPayload(publicKey, TEST_FRTUN_PEER_ID);

      const compressed = encodeToCompressedBase64(v4Payload);
      const decoded = decodeFromCompressedBase64(compressed);

      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(VERSION_HYBRID_FRTUN);
      expect(decoded!.frtunPeerId).toBe(TEST_FRTUN_PEER_ID);
    });

    it('should handle frtun peer IDs with special characters', () => {
      const specialPeerId = 'frtun1test+special/chars==.peer';
      const publicKey = createMockPublicKey();
      const payload = generateQRPayload(publicKey, specialPeerId);

      const encoded = encodePayload(payload);
      const decoded = decodePayload(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.frtunPeerId).toBe(specialPeerId);
    });

    it('should decode legacy v3 libp2p payloads', () => {
      // Manually construct a v3 payload to test backward compatibility
      const payload: HybridQRPayload = {
        version: VERSION_HYBRID_LIBP2P,
        classicalPublicKey: new Uint8Array(KEY_SIZES.CLASSICAL_PUBLIC_KEY),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
        libp2pPeerId: TEST_LIBP2P_PEER_ID,
      };

      const encoded = encodePayload(payload);
      const decoded = decodePayload(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(VERSION_HYBRID_LIBP2P);
      expect(decoded!.libp2pPeerId).toBe(TEST_LIBP2P_PEER_ID);
    });
  });
});
