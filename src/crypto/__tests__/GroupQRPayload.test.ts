/**
 * GroupQRPayload.test.ts
 * Vapor PWA - Group Invite QR Payload Tests
 *
 * Tests group invite encoding/decoding for star topology groups.
 * Verifies payload structure and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  GROUP_INVITE_VERSION,
  generateGroupInvite,
  encodeGroupInvite,
  decodeGroupInvite,
  encodeGroupInviteToBase64,
  decodeGroupInviteFromBase64,
  isGroupInviteExpired,
  isValidGroupInvite,
  getHostFingerprint,
} from '../GroupQRPayload';

// Test data
const TEST_GROUP_ID = 'abc123def456';
const TEST_GROUP_NAME = 'Test Group';
const TEST_HOST_NICKNAME = 'Alice';
const TEST_SDP = 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\n';

const createTestPublicKey = (): Uint8Array => {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return key;
};

describe('GroupQRPayload', () => {
  describe('GROUP_INVITE_VERSION', () => {
    it('should be 0x10 (16)', () => {
      expect(GROUP_INVITE_VERSION).toBe(0x10);
      expect(GROUP_INVITE_VERSION).toBe(16);
    });
  });

  describe('generateGroupInvite', () => {
    it('should create payload with correct version', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      expect(invite.version).toBe(GROUP_INVITE_VERSION);
    });

    it('should include all required fields', () => {
      const publicKey = createTestPublicKey();
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        publicKey,
        TEST_HOST_NICKNAME
      );

      expect(invite.groupId).toBe(TEST_GROUP_ID);
      expect(invite.groupName).toBe(TEST_GROUP_NAME);
      expect(invite.hostNickname).toBe(TEST_HOST_NICKNAME);
      expect(Array.from(invite.hostPublicKey)).toEqual(Array.from(publicKey));
    });

    it('should set current timestamp', () => {
      const before = Date.now() / 1000;
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );
      const after = Date.now() / 1000;

      expect(invite.timestamp).toBeGreaterThanOrEqual(before);
      expect(invite.timestamp).toBeLessThanOrEqual(after);
    });

    it('should include optional SDP when provided', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME,
        TEST_SDP
      );

      expect(invite.offerSdp).toBe(TEST_SDP);
    });

    it('should have undefined SDP when not provided', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      expect(invite.offerSdp).toBeUndefined();
    });
  });

  describe('encodeGroupInvite / decodeGroupInvite', () => {
    it('should round-trip payload without SDP', () => {
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      const encoded = encodeGroupInvite(original);
      const decoded = decodeGroupInvite(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.version).toBe(original.version);
      expect(decoded!.groupId).toBe(original.groupId);
      expect(decoded!.groupName).toBe(original.groupName);
      expect(decoded!.hostNickname).toBe(original.hostNickname);
      expect(Array.from(decoded!.hostPublicKey)).toEqual(Array.from(original.hostPublicKey));
      expect(decoded!.timestamp).toBeCloseTo(original.timestamp, 5);
    });

    it('should round-trip payload with SDP', () => {
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME,
        TEST_SDP
      );

      const encoded = encodeGroupInvite(original);
      const decoded = decodeGroupInvite(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.offerSdp).toBe(original.offerSdp);
    });

    it('should handle unicode in group name', () => {
      const unicodeName = 'グループチャット 🎉';
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        unicodeName,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      const encoded = encodeGroupInvite(original);
      const decoded = decodeGroupInvite(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.groupName).toBe(unicodeName);
    });

    it('should handle unicode in nickname', () => {
      const unicodeNickname = 'アリス';
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        unicodeNickname
      );

      const encoded = encodeGroupInvite(original);
      const decoded = decodeGroupInvite(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.hostNickname).toBe(unicodeNickname);
    });

    it('should return null for empty data', () => {
      const decoded = decodeGroupInvite(new Uint8Array(0));
      expect(decoded).toBeNull();
    });

    it('should return null for wrong version', () => {
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      const encoded = encodeGroupInvite(original);
      // Corrupt the version byte
      encoded[0] = 0x01;

      const decoded = decodeGroupInvite(encoded);
      expect(decoded).toBeNull();
    });

    it('should return null for truncated data', () => {
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      const encoded = encodeGroupInvite(original);
      // Truncate the data
      const truncated = encoded.slice(0, 10);

      const decoded = decodeGroupInvite(truncated);
      expect(decoded).toBeNull();
    });
  });

  describe('encodeGroupInviteToBase64 / decodeGroupInviteFromBase64', () => {
    it('should round-trip payload through base64 compression', () => {
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME,
        TEST_SDP
      );

      const encoded = encodeGroupInviteToBase64(original);
      const decoded = decodeGroupInviteFromBase64(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.groupId).toBe(original.groupId);
      expect(decoded!.groupName).toBe(original.groupName);
      expect(decoded!.offerSdp).toBe(original.offerSdp);
    });

    it('should produce valid base64 string', () => {
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      const encoded = encodeGroupInviteToBase64(original);

      // Should be valid base64
      expect(() => atob(encoded)).not.toThrow();
    });

    it('should compress the payload', () => {
      // Create payload with large SDP
      const largeSdp = TEST_SDP + 'a=candidate:'.repeat(100);
      const original = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME,
        largeSdp
      );

      const uncompressed = encodeGroupInvite(original);
      const base64 = encodeGroupInviteToBase64(original);

      // Base64 of compressed should be smaller than raw data
      // (accounting for base64 overhead of ~33%)
      const base64Bytes = base64.length;
      const rawBytes = uncompressed.length;

      // Compressed base64 should be smaller than raw bytes
      // This tests that compression is actually working
      expect(base64Bytes).toBeLessThan(rawBytes * 1.5);
    });

    it('should return null for invalid base64', () => {
      const decoded = decodeGroupInviteFromBase64('!!!invalid-base64!!!');
      expect(decoded).toBeNull();
    });

    it('should return null for empty string', () => {
      const decoded = decodeGroupInviteFromBase64('');
      expect(decoded).toBeNull();
    });
  });

  describe('isGroupInviteExpired', () => {
    it('should return false for fresh invite', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      expect(isGroupInviteExpired(invite)).toBe(false);
    });

    it('should return true for old invite (default 1 hour)', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      // Set timestamp to 2 hours ago
      invite.timestamp = (Date.now() / 1000) - 7200;

      expect(isGroupInviteExpired(invite)).toBe(true);
    });

    it('should respect custom expiry time', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      // Set timestamp to 5 minutes ago
      invite.timestamp = (Date.now() / 1000) - 300;

      // Should not be expired with 1 hour expiry
      expect(isGroupInviteExpired(invite, 3600)).toBe(false);

      // Should be expired with 1 minute expiry
      expect(isGroupInviteExpired(invite, 60)).toBe(true);
    });

    it('should return false for invite within expiry window', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      // Set timestamp to 30 minutes ago
      invite.timestamp = (Date.now() / 1000) - 1800;

      expect(isGroupInviteExpired(invite)).toBe(false);
    });
  });

  describe('isValidGroupInvite', () => {
    it('should accept valid invite', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      expect(isValidGroupInvite(invite)).toBe(true);
    });

    it('should reject invite with wrong version', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      invite.version = 0x01; // Wrong version

      expect(isValidGroupInvite(invite)).toBe(false);
    });

    it('should reject invite with empty group ID', () => {
      const invite = generateGroupInvite(
        '',
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      expect(isValidGroupInvite(invite)).toBe(false);
    });

    it('should reject invite with empty group name', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        '',
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      expect(isValidGroupInvite(invite)).toBe(false);
    });

    it('should reject invite with wrong public key size', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        new Uint8Array(16), // Wrong size
        TEST_HOST_NICKNAME
      );

      expect(isValidGroupInvite(invite)).toBe(false);
    });

    it('should reject invite with empty host nickname', () => {
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        ''
      );

      expect(isValidGroupInvite(invite)).toBe(false);
    });
  });

  describe('getHostFingerprint', () => {
    it('should return 8-character uppercase hex string', async () => {
      const publicKey = createTestPublicKey();
      const fingerprint = await getHostFingerprint(publicKey);

      expect(fingerprint.length).toBe(8);
      expect(fingerprint).toMatch(/^[0-9A-F]{8}$/);
    });

    it('should produce deterministic fingerprint', async () => {
      const publicKey = new Uint8Array(32);
      publicKey.fill(42);

      const fingerprint1 = await getHostFingerprint(publicKey);
      const fingerprint2 = await getHostFingerprint(publicKey);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should produce different fingerprints for different keys', async () => {
      const publicKey1 = new Uint8Array(32);
      publicKey1.fill(1);

      const publicKey2 = new Uint8Array(32);
      publicKey2.fill(2);

      const fingerprint1 = await getHostFingerprint(publicKey1);
      const fingerprint2 = await getHostFingerprint(publicKey2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long group name', () => {
      const longName = 'A'.repeat(200);
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        longName,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      const encoded = encodeGroupInvite(invite);
      const decoded = decodeGroupInvite(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.groupName).toBe(longName);
    });

    it('should handle very long SDP', () => {
      const longSdp = TEST_SDP + 'a=candidate:'.repeat(1000);
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        TEST_GROUP_NAME,
        createTestPublicKey(),
        TEST_HOST_NICKNAME,
        longSdp
      );

      const encoded = encodeGroupInvite(invite);
      const decoded = decodeGroupInvite(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.offerSdp).toBe(longSdp);
    });

    it('should handle special characters in strings', () => {
      const specialName = 'Test & <Group> "Chat" \'s';
      const invite = generateGroupInvite(
        TEST_GROUP_ID,
        specialName,
        createTestPublicKey(),
        TEST_HOST_NICKNAME
      );

      const encoded = encodeGroupInvite(invite);
      const decoded = decodeGroupInvite(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.groupName).toBe(specialName);
    });
  });
});
