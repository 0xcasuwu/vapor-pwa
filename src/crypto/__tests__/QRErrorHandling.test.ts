/**
 * QRErrorHandling.test.ts
 * Vapor PWA - QR Code Error Handling Tests
 *
 * Tests error paths for QR code parsing and validation.
 * Verifies graceful handling of invalid, expired, and malformed QR data.
 */

import { describe, it, expect } from 'vitest';
import {
  decodeFromBase64,
  decodeFromCompressedBase64,
  isExpired,
  isValid,
  isHybrid,
  VERSION_HYBRID,
  VERSION_HYBRID_LIBP2P,
  VERSION_CLASSIC_ONLY,
} from '../HybridQRPayload';
import {
  decodeSignalingPayload,
  isSignalingExpired,
  isValidSignalingPayload,
  isSignalingPayload,
  SIGNALING_TYPE,
} from '../SignalingPayload';
import {
  decodeGroupInviteFromBase64,
  isGroupInviteExpired,
  isValidGroupInvite,
  GROUP_INVITE_VERSION,
} from '../GroupQRPayload';
import { KEY_SIZES } from '../HybridKeyPair';

describe('QR Error Handling - HybridQRPayload', () => {
  describe('decodeFromBase64', () => {
    it('should return null for invalid base64', () => {
      const decoded = decodeFromBase64('!!!not-valid-base64!!!');
      expect(decoded).toBeNull();
    });

    it('should return null for empty string', () => {
      const decoded = decodeFromBase64('');
      expect(decoded).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      const decoded = decodeFromBase64('   ');
      expect(decoded).toBeNull();
    });

    it('should return null for valid base64 but wrong data', () => {
      // Valid base64, but not a QR payload
      const decoded = decodeFromBase64(btoa('Hello World'));
      expect(decoded).toBeNull();
    });

    it('should return null for truncated payload', () => {
      // Create valid base64 that decodes to truncated data
      const truncatedBytes = new Uint8Array([VERSION_HYBRID, 1, 2, 3]);
      const base64 = btoa(String.fromCharCode(...truncatedBytes));
      const decoded = decodeFromBase64(base64);
      expect(decoded).toBeNull();
    });

    it('should return null for unknown version', () => {
      // Create payload with invalid version
      const invalidVersion = 0xFF;
      const bytes = new Uint8Array(100);
      bytes[0] = invalidVersion;
      const base64 = btoa(String.fromCharCode(...bytes));
      const decoded = decodeFromBase64(base64);
      expect(decoded).toBeNull();
    });
  });

  describe('decodeFromCompressedBase64', () => {
    it('should return null for invalid base64', () => {
      const decoded = decodeFromCompressedBase64('###invalid###');
      expect(decoded).toBeNull();
    });

    it('should return null for empty string', () => {
      const decoded = decodeFromCompressedBase64('');
      expect(decoded).toBeNull();
    });

    it('should return null for valid base64 but invalid compression', () => {
      // Valid base64 that isn't valid pako-compressed data
      const decoded = decodeFromCompressedBase64(btoa('not compressed data'));
      expect(decoded).toBeNull();
    });
  });

  describe('isExpired', () => {
    it('should return true for timestamp far in the past', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: 0, // Unix epoch
      };

      expect(isExpired(payload)).toBe(true);
    });

    it('should return true for payload older than expiry', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: (Date.now() / 1000) - 7200, // 2 hours ago
      };

      expect(isExpired(payload)).toBe(true);
    });

    it('should return false for fresh payload', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };

      expect(isExpired(payload)).toBe(false);
    });
  });

  describe('isValid', () => {
    it('should reject payload with wrong classical key size', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(16), // Wrong size
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };

      expect(isValid(payload)).toBe(false);
    });

    it('should reject payload with wrong PQ key size', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(100), // Wrong size
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };

      expect(isValid(payload)).toBe(false);
    });

    it('should reject payload with wrong nonce size', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(16), // Wrong size
        timestamp: Date.now() / 1000,
      };

      expect(isValid(payload)).toBe(false);
    });

    it('should accept payload regardless of timestamp value (validation checks structure only)', () => {
      // isValid() checks structure (key sizes, nonce size) but NOT timestamp
      // Timestamp validation is done by isExpired() separately
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: 0, // This is valid for isValid(), but isExpired() would reject it
      };

      // isValid only checks structure
      expect(isValid(payload)).toBe(true);

      // isExpired catches timestamp issues
      expect(isExpired(payload)).toBe(true);
    });

    it('should accept valid hybrid payload', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };

      expect(isValid(payload)).toBe(true);
    });
  });

  describe('isHybrid', () => {
    it('should return true for VERSION_HYBRID', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };

      expect(isHybrid(payload)).toBe(true);
    });

    it('should return true for VERSION_HYBRID_LIBP2P', () => {
      const payload = {
        version: VERSION_HYBRID_LIBP2P,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
        libp2pPeerId: '12D3KooWTest',
      };

      expect(isHybrid(payload)).toBe(true);
    });

    it('should return false for VERSION_CLASSIC_ONLY', () => {
      const payload = {
        version: VERSION_CLASSIC_ONLY,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(0), // Legacy doesn't have PQ key
        nonce: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };

      expect(isHybrid(payload)).toBe(false);
    });
  });
});

describe('QR Error Handling - SignalingPayload', () => {
  describe('decodeSignalingPayload', () => {
    it('should return null for invalid base64', () => {
      const decoded = decodeSignalingPayload('###invalid###');
      expect(decoded).toBeNull();
    });

    it('should return null for empty string', () => {
      const decoded = decodeSignalingPayload('');
      expect(decoded).toBeNull();
    });

    it('should return null for non-signaling data', () => {
      // Valid base64 but not a signaling payload
      const decoded = decodeSignalingPayload(btoa('random data'));
      expect(decoded).toBeNull();
    });
  });

  describe('isSignalingPayload', () => {
    it('should return false for random string', () => {
      expect(isSignalingPayload('random-string')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSignalingPayload('')).toBe(false);
    });

    it('should return false for null-like values', () => {
      // @ts-expect-error - testing runtime behavior
      expect(isSignalingPayload(null)).toBe(false);
      // @ts-expect-error - testing runtime behavior
      expect(isSignalingPayload(undefined)).toBe(false);
    });
  });

  describe('isSignalingExpired', () => {
    it('should return true for very old timestamp', () => {
      const payload = {
        type: SIGNALING_TYPE.OFFER,
        sdp: 'v=0...',
        kemCiphertext: new Uint8Array(1088),
        classicalPublicKey: new Uint8Array(32),
        timestamp: 0, // Unix epoch
      };

      expect(isSignalingExpired(payload)).toBe(true);
    });
  });

  describe('isValidSignalingPayload', () => {
    it('should reject offer with empty SDP', () => {
      const payload = {
        type: SIGNALING_TYPE.OFFER,
        sdp: '',
        kemCiphertext: new Uint8Array(1088),
        classicalPublicKey: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };

      expect(isValidSignalingPayload(payload)).toBe(false);
    });

    it('should reject offer with wrong ciphertext size', () => {
      const payload = {
        type: SIGNALING_TYPE.OFFER,
        sdp: 'v=0...',
        kemCiphertext: new Uint8Array(100), // Wrong size
        classicalPublicKey: new Uint8Array(32),
        timestamp: Date.now() / 1000,
      };

      expect(isValidSignalingPayload(payload)).toBe(false);
    });

    it('should reject offer with wrong public key size', () => {
      const payload = {
        type: SIGNALING_TYPE.OFFER,
        sdp: 'v=0...',
        kemCiphertext: new Uint8Array(1088),
        classicalPublicKey: new Uint8Array(16), // Wrong size
        timestamp: Date.now() / 1000,
      };

      expect(isValidSignalingPayload(payload)).toBe(false);
    });

    it('should reject answer with empty SDP', () => {
      const payload = {
        type: SIGNALING_TYPE.ANSWER,
        sdp: '',
        timestamp: Date.now() / 1000,
      };

      expect(isValidSignalingPayload(payload)).toBe(false);
    });
  });
});

describe('QR Error Handling - GroupQRPayload', () => {
  describe('decodeGroupInviteFromBase64', () => {
    it('should return null for invalid base64', () => {
      const decoded = decodeGroupInviteFromBase64('###invalid###');
      expect(decoded).toBeNull();
    });

    it('should return null for empty string', () => {
      const decoded = decodeGroupInviteFromBase64('');
      expect(decoded).toBeNull();
    });

    it('should return null for wrong version', () => {
      // Create payload with wrong version in raw bytes
      const bytes = new Uint8Array(100);
      bytes[0] = 0x01; // Wrong version
      const base64 = btoa(String.fromCharCode(...bytes));
      const decoded = decodeGroupInviteFromBase64(base64);
      expect(decoded).toBeNull();
    });
  });

  describe('isGroupInviteExpired', () => {
    it('should return true for very old timestamp', () => {
      const payload = {
        version: GROUP_INVITE_VERSION,
        groupId: 'test123',
        groupName: 'Test',
        hostPublicKey: new Uint8Array(32),
        hostNickname: 'Host',
        timestamp: 0, // Unix epoch
      };

      expect(isGroupInviteExpired(payload)).toBe(true);
    });
  });

  describe('isValidGroupInvite', () => {
    it('should reject invite with wrong version', () => {
      const payload = {
        version: 0x01, // Wrong version
        groupId: 'test123',
        groupName: 'Test',
        hostPublicKey: new Uint8Array(32),
        hostNickname: 'Host',
        timestamp: Date.now() / 1000,
      };

      expect(isValidGroupInvite(payload)).toBe(false);
    });

    it('should reject invite with empty groupId', () => {
      const payload = {
        version: GROUP_INVITE_VERSION,
        groupId: '',
        groupName: 'Test',
        hostPublicKey: new Uint8Array(32),
        hostNickname: 'Host',
        timestamp: Date.now() / 1000,
      };

      expect(isValidGroupInvite(payload)).toBe(false);
    });

    it('should reject invite with empty groupName', () => {
      const payload = {
        version: GROUP_INVITE_VERSION,
        groupId: 'test123',
        groupName: '',
        hostPublicKey: new Uint8Array(32),
        hostNickname: 'Host',
        timestamp: Date.now() / 1000,
      };

      expect(isValidGroupInvite(payload)).toBe(false);
    });

    it('should reject invite with wrong public key size', () => {
      const payload = {
        version: GROUP_INVITE_VERSION,
        groupId: 'test123',
        groupName: 'Test',
        hostPublicKey: new Uint8Array(16), // Wrong size
        hostNickname: 'Host',
        timestamp: Date.now() / 1000,
      };

      expect(isValidGroupInvite(payload)).toBe(false);
    });

    it('should reject invite with empty hostNickname', () => {
      const payload = {
        version: GROUP_INVITE_VERSION,
        groupId: 'test123',
        groupName: 'Test',
        hostPublicKey: new Uint8Array(32),
        hostNickname: '',
        timestamp: Date.now() / 1000,
      };

      expect(isValidGroupInvite(payload)).toBe(false);
    });
  });
});

describe('QR Error Handling - Common Scenarios', () => {
  describe('Malformed Data', () => {
    it('should handle null bytes gracefully', () => {
      const nullBytes = new Uint8Array(100).fill(0);
      const base64 = btoa(String.fromCharCode(...nullBytes));

      expect(decodeFromBase64(base64)).toBeNull();
      expect(decodeSignalingPayload(base64)).toBeNull();
      expect(decodeGroupInviteFromBase64(base64)).toBeNull();
    });

    it('should handle very long strings gracefully', () => {
      const longString = 'A'.repeat(100000);

      // Should not throw, just return null
      expect(() => decodeFromBase64(longString)).not.toThrow();
      expect(decodeFromBase64(longString)).toBeNull();
    });

    it('should handle binary data in base64', () => {
      // Random binary data
      const randomBytes = new Uint8Array(500);
      crypto.getRandomValues(randomBytes);
      const base64 = btoa(String.fromCharCode(...randomBytes));

      // Should not throw, just return null
      expect(() => decodeFromBase64(base64)).not.toThrow();
      expect(() => decodeSignalingPayload(base64)).not.toThrow();
      expect(() => decodeGroupInviteFromBase64(base64)).not.toThrow();
    });
  });

  describe('Version Mismatch', () => {
    it('should reject future versions gracefully', () => {
      const futureVersionBytes = new Uint8Array(100);
      futureVersionBytes[0] = 0xFF; // Hypothetical future version
      const base64 = btoa(String.fromCharCode(...futureVersionBytes));

      expect(decodeFromBase64(base64)).toBeNull();
    });
  });

  describe('Expiry Edge Cases', () => {
    it('should handle negative timestamps', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: -1000, // Invalid negative timestamp
      };

      expect(isExpired(payload)).toBe(true);
    });

    it('should handle very large timestamps', () => {
      const payload = {
        version: VERSION_HYBRID,
        classicalPublicKey: new Uint8Array(32),
        pqPublicKey: new Uint8Array(KEY_SIZES.PQ_PUBLIC_KEY),
        nonce: new Uint8Array(32),
        timestamp: Number.MAX_SAFE_INTEGER, // Far future
      };

      // Far future timestamp is not expired
      expect(isExpired(payload)).toBe(false);
    });
  });
});
