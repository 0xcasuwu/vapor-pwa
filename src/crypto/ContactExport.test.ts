/**
 * ContactExport.test.ts
 * Vapor PWA - Tests for Encrypted Contact Export/Import
 *
 * Tests:
 * - Export produces encrypted blob
 * - Import decrypts and returns contacts
 * - Wrong key fails to decrypt
 * - Invalid file formats are rejected
 * - Round-trip preserves data integrity
 */

import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers';
import {
  exportContacts,
  importContacts,
  generateExportFilename,
} from './ContactExport';

// Test data
const mockContacts = [
  {
    id: 'contact-1',
    nickname: 'Alice',
    publicKey: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    addedAt: Date.now() - 86400000, // 1 day ago
    lastSeen: Date.now() - 3600000, // 1 hour ago
  },
  {
    id: 'contact-2',
    nickname: 'Bob',
    publicKey: new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16]),
    addedAt: Date.now() - 172800000, // 2 days ago
    pushSubscription: {
      endpoint: 'https://push.example.com/123',
      keys: {
        p256dh: 'test-p256dh-key',
        auth: 'test-auth-key',
      },
    },
  },
];

const mockFingerprint = 'ABC123DE';

describe('ContactExport', () => {
  let storageKey: Uint8Array;
  let wrongKey: Uint8Array;

  beforeAll(async () => {
    await sodium.ready;
    // Generate deterministic keys for testing
    storageKey = sodium.randombytes_buf(32);
    wrongKey = sodium.randombytes_buf(32);
  });

  describe('exportContacts', () => {
    it('should export contacts to an encrypted blob', async () => {
      const blob = await exportContacts(mockContacts, storageKey, mockFingerprint);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/octet-stream');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should produce different ciphertext for same data (random nonce)', async () => {
      const blob1 = await exportContacts(mockContacts, storageKey, mockFingerprint);
      const blob2 = await exportContacts(mockContacts, storageKey, mockFingerprint);

      const bytes1 = new Uint8Array(await blob1.arrayBuffer());
      const bytes2 = new Uint8Array(await blob2.arrayBuffer());

      // Different nonces mean different ciphertexts
      expect(bytes1).not.toEqual(bytes2);
    });

    it('should handle empty contacts array', async () => {
      const blob = await exportContacts([], storageKey, mockFingerprint);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('importContacts', () => {
    it('should decrypt and return contacts from exported file', async () => {
      const blob = await exportContacts(mockContacts, storageKey, mockFingerprint);
      const file = new File([blob], 'contacts.vapor');

      const result = await importContacts(file, storageKey);

      expect(result.contacts).toHaveLength(2);
      expect(result.sourceFingerprint).toBe(mockFingerprint);
      expect(result.exportedAt).toBeGreaterThan(0);
    });

    it('should preserve contact data integrity', async () => {
      const blob = await exportContacts(mockContacts, storageKey, mockFingerprint);
      const file = new File([blob], 'contacts.vapor');

      const result = await importContacts(file, storageKey);

      // Check first contact
      const alice = result.contacts.find(c => c.nickname === 'Alice');
      expect(alice).toBeDefined();
      expect(alice!.id).toBe('contact-1');
      expect(alice!.publicKey).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));

      // Check second contact with push subscription
      const bob = result.contacts.find(c => c.nickname === 'Bob');
      expect(bob).toBeDefined();
      expect(bob!.pushSubscription).toBeDefined();
      expect(bob!.pushSubscription!.endpoint).toBe('https://push.example.com/123');
    });

    it('should fail with wrong decryption key', async () => {
      const blob = await exportContacts(mockContacts, storageKey, mockFingerprint);
      const file = new File([blob], 'contacts.vapor');

      await expect(importContacts(file, wrongKey)).rejects.toThrow(
        'Failed to decrypt'
      );
    });

    it('should fail with invalid file format', async () => {
      const invalidData = new TextEncoder().encode('not valid json');
      const file = new File([invalidData], 'invalid.vapor');

      await expect(importContacts(file, storageKey)).rejects.toThrow();
    });

    it('should fail with tampered data', async () => {
      const blob = await exportContacts(mockContacts, storageKey, mockFingerprint);
      const bytes = new Uint8Array(await blob.arrayBuffer());

      // Tamper with the ciphertext
      bytes[bytes.length - 10] ^= 0xff;

      const tamperedFile = new File([bytes], 'tampered.vapor');

      await expect(importContacts(tamperedFile, storageKey)).rejects.toThrow();
    });
  });

  describe('generateExportFilename', () => {
    it('should generate filename with fingerprint and date', () => {
      const filename = generateExportFilename('ABC123DE');

      expect(filename).toMatch(/^vapor-contacts-ABC123DE-\d{4}-\d{2}-\d{2}\.vapor$/);
    });

    it('should use current date', () => {
      const today = new Date().toISOString().split('T')[0];
      const filename = generateExportFilename('TEST');

      expect(filename).toContain(today);
    });
  });

  describe('round-trip', () => {
    it('should preserve all contact fields through export/import cycle', async () => {
      const originalContacts = [
        {
          id: 'test-id-123',
          nickname: 'Test User',
          publicKey: new Uint8Array(32).fill(42),
          addedAt: 1700000000000,
          lastSeen: 1700001000000,
          pushSubscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
            keys: {
              p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0',
              auth: 'tBHItJI5svbpez7KI4CCXg',
            },
          },
        },
      ];

      const blob = await exportContacts(originalContacts, storageKey, 'ROUND');
      const file = new File([blob], 'test.vapor');
      const result = await importContacts(file, storageKey);

      const imported = result.contacts[0];
      const original = originalContacts[0];

      expect(imported.id).toBe(original.id);
      expect(imported.nickname).toBe(original.nickname);
      expect(imported.addedAt).toBe(original.addedAt);
      expect(imported.lastSeen).toBe(original.lastSeen);
      expect(imported.publicKey).toEqual(original.publicKey);
      expect(imported.pushSubscription).toEqual(original.pushSubscription);
    });

    it('should handle contacts without optional fields', async () => {
      const minimalContact = [
        {
          id: 'minimal',
          nickname: 'Minimal',
          publicKey: new Uint8Array([1, 2, 3]),
          addedAt: Date.now(),
        },
      ];

      const blob = await exportContacts(minimalContact, storageKey, 'MIN');
      const file = new File([blob], 'minimal.vapor');
      const result = await importContacts(file, storageKey);

      expect(result.contacts[0].id).toBe('minimal');
      expect(result.contacts[0].lastSeen).toBeUndefined();
      expect(result.contacts[0].pushSubscription).toBeUndefined();
    });
  });
});
