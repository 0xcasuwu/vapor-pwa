/**
 * SignalingPayload.test.ts
 * Vapor PWA - WebRTC Signaling Payload Tests
 *
 * Tests offer/answer QR encoding/decoding for the 3-code exchange.
 * Verifies SDP + KEM ciphertext bundling.
 */

import { describe, it, expect } from 'vitest';
import {
  SIGNALING_TYPE,
  createSignalingOffer,
  createSignalingAnswer,
  encodeSignalingPayload,
  decodeSignalingPayload,
  isValidSignalingPayload,
  isSignalingExpired,
  isSignalingPayload,
  getSignalingType,
} from '../SignalingPayload';
import { KEY_SIZES } from '../HybridKeyPair';

// Test data
const TEST_SDP_OFFER = 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=ice-ufrag:test\r\n';
const TEST_SDP_ANSWER = 'v=0\r\no=- 987654321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=ice-ufrag:answer\r\n';

// Create mock crypto data with correct sizes
const createMockKemCiphertext = (): Uint8Array => {
  const ct = new Uint8Array(KEY_SIZES.PQ_CIPHERTEXT); // 1088 bytes
  crypto.getRandomValues(ct);
  return ct;
};

const createMockClassicalPublicKey = (): Uint8Array => {
  const key = new Uint8Array(KEY_SIZES.CLASSICAL_PUBLIC_KEY); // 32 bytes
  crypto.getRandomValues(key);
  return key;
};

describe('SignalingPayload', () => {
  describe('SIGNALING_TYPE Constants', () => {
    it('should define OFFER as 0x10', () => {
      expect(SIGNALING_TYPE.OFFER).toBe(0x10);
    });

    it('should define ANSWER as 0x11', () => {
      expect(SIGNALING_TYPE.ANSWER).toBe(0x11);
    });
  });

  describe('createSignalingOffer', () => {
    it('should create offer with correct type', () => {
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );

      expect(offer.type).toBe(SIGNALING_TYPE.OFFER);
    });

    it('should include SDP', () => {
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );

      expect(offer.sdp).toBe(TEST_SDP_OFFER);
    });

    it('should include KEM ciphertext', () => {
      const kemCiphertext = createMockKemCiphertext();
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        kemCiphertext,
        createMockClassicalPublicKey()
      );

      expect(Array.from(offer.kemCiphertext)).toEqual(Array.from(kemCiphertext));
    });

    it('should include classical public key', () => {
      const classicalKey = createMockClassicalPublicKey();
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        classicalKey
      );

      expect(Array.from(offer.classicalPublicKey)).toEqual(Array.from(classicalKey));
    });

    it('should set current timestamp', () => {
      const before = Date.now() / 1000;
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );
      const after = Date.now() / 1000;

      expect(offer.timestamp).toBeGreaterThanOrEqual(before);
      expect(offer.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('createSignalingAnswer', () => {
    it('should create answer with correct type', () => {
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);

      expect(answer.type).toBe(SIGNALING_TYPE.ANSWER);
    });

    it('should include SDP', () => {
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);

      expect(answer.sdp).toBe(TEST_SDP_ANSWER);
    });

    it('should set current timestamp', () => {
      const before = Date.now() / 1000;
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);
      const after = Date.now() / 1000;

      expect(answer.timestamp).toBeGreaterThanOrEqual(before);
      expect(answer.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('encodeSignalingPayload / decodeSignalingPayload', () => {
    it('should round-trip offer payload', () => {
      const original = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );

      const encoded = encodeSignalingPayload(original);
      const decoded = decodeSignalingPayload(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.type).toBe(SIGNALING_TYPE.OFFER);
      expect(decoded!.sdp).toBe(original.sdp);
      if (decoded!.type === SIGNALING_TYPE.OFFER) {
        expect(Array.from(decoded!.kemCiphertext)).toEqual(Array.from(original.kemCiphertext));
        expect(Array.from(decoded!.classicalPublicKey)).toEqual(Array.from(original.classicalPublicKey));
      }
    });

    it('should round-trip answer payload', () => {
      const original = createSignalingAnswer(TEST_SDP_ANSWER);

      const encoded = encodeSignalingPayload(original);
      const decoded = decodeSignalingPayload(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.type).toBe(SIGNALING_TYPE.ANSWER);
      expect(decoded!.sdp).toBe(original.sdp);
    });

    it('should produce compressed base64 string', () => {
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );

      const encoded = encodeSignalingPayload(offer);

      // Should be valid base64
      expect(() => atob(encoded)).not.toThrow();
      // Should be reasonably sized (compressed)
      expect(encoded.length).toBeLessThan(3000);
    });

    it('should handle large SDP', () => {
      const largeSdp = TEST_SDP_OFFER + 'a=candidate:'.repeat(100);
      const offer = createSignalingOffer(
        largeSdp,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );

      const encoded = encodeSignalingPayload(offer);
      const decoded = decodeSignalingPayload(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.sdp).toBe(largeSdp);
    });

    it('should return null for invalid base64', () => {
      const decoded = decodeSignalingPayload('!!!invalid-base64!!!');
      expect(decoded).toBeNull();
    });

    it('should return null for empty string', () => {
      const decoded = decodeSignalingPayload('');
      expect(decoded).toBeNull();
    });

    it('should return null for non-signaling payload', () => {
      // Encode some random data
      const randomData = btoa('not a signaling payload');
      const decoded = decodeSignalingPayload(randomData);
      expect(decoded).toBeNull();
    });
  });

  describe('isValidSignalingPayload', () => {
    it('should accept valid offer', () => {
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );

      expect(isValidSignalingPayload(offer)).toBe(true);
    });

    it('should accept valid answer', () => {
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);

      expect(isValidSignalingPayload(answer)).toBe(true);
    });

    it('should reject offer with wrong KEM ciphertext size', () => {
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        new Uint8Array(100), // Wrong size
        createMockClassicalPublicKey()
      );

      expect(isValidSignalingPayload(offer)).toBe(false);
    });

    it('should reject offer with wrong classical key size', () => {
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        new Uint8Array(16) // Wrong size
      );

      expect(isValidSignalingPayload(offer)).toBe(false);
    });

    it('should reject payload with empty SDP', () => {
      const answer = createSignalingAnswer('');
      // Force empty SDP
      (answer as { sdp: string }).sdp = '';

      expect(isValidSignalingPayload(answer)).toBe(false);
    });
  });

  describe('isSignalingExpired', () => {
    it('should return false for fresh payload', () => {
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);

      expect(isSignalingExpired(answer)).toBe(false);
    });

    it('should return true for old payload', () => {
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);
      // Set timestamp to 2 hours ago (beyond 3600s expiry)
      answer.timestamp = (Date.now() / 1000) - 7200;

      expect(isSignalingExpired(answer)).toBe(true);
    });

    it('should return false for payload within expiry window', () => {
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);
      // Set timestamp to 30 minutes ago
      answer.timestamp = (Date.now() / 1000) - 1800;

      expect(isSignalingExpired(answer)).toBe(false);
    });
  });

  describe('isSignalingPayload', () => {
    it('should return true for encoded offer', () => {
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );
      const encoded = encodeSignalingPayload(offer);

      expect(isSignalingPayload(encoded)).toBe(true);
    });

    it('should return true for encoded answer', () => {
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);
      const encoded = encodeSignalingPayload(answer);

      expect(isSignalingPayload(encoded)).toBe(true);
    });

    it('should return false for random string', () => {
      expect(isSignalingPayload('random-string')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSignalingPayload('')).toBe(false);
    });
  });

  describe('getSignalingType', () => {
    it('should return "offer" for encoded offer', () => {
      const offer = createSignalingOffer(
        TEST_SDP_OFFER,
        createMockKemCiphertext(),
        createMockClassicalPublicKey()
      );
      const encoded = encodeSignalingPayload(offer);

      expect(getSignalingType(encoded)).toBe('offer');
    });

    it('should return "answer" for encoded answer', () => {
      const answer = createSignalingAnswer(TEST_SDP_ANSWER);
      const encoded = encodeSignalingPayload(answer);

      expect(getSignalingType(encoded)).toBe('answer');
    });

    it('should return null for invalid payload', () => {
      expect(getSignalingType('invalid')).toBeNull();
    });
  });
});
