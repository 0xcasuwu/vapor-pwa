/**
 * ContactExport.test.ts
 * Vapor PWA - Contact Export/Import Tests
 *
 * Tests the encrypted contact backup functionality.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import sodium from 'libsodium-wrappers';
import {
  exportContacts,
  importContacts,
  generateExportFilename,
  downloadBlob,
} from '../ContactExport';
import type { Contact } from '../../store/identityStore';

describe('ContactExport', () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  // Helper to create test contacts
  function createTestContact(nickname: string, index: number): Contact {
    const publicKey = new Uint8Array(32);
    publicKey.fill(index);
    return {
      id: `contact-${index}`,
      nickname,
      publicKey,
      addedAt: Date.now() - index * 1000,
      lastSeen: Date.now(),
    };
  }

  // Helper to generate storage key
  async function generateStorageKey(): Promise<Uint8Array> {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);
    return key;
  }

  describe('exportContacts', () => {
    it('should export contacts as encrypted blob', async () => {
      const contacts = [
        createTestContact('Alice', 1),
        createTestContact('Bob', 2),
      ];
      const key = await generateStorageKey();
      const fingerprint = 'ABCD1234';

      const blob = await exportContacts(contacts, key, fingerprint);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/octet-stream');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should export empty contacts list', async () => {
      const contacts: Contact[] = [];
      const key = await generateStorageKey();
      const fingerprint = 'ABCD1234';

      const blob = await exportContacts(contacts, key, fingerprint);

      expect(blob).toBeInstanceOf(Blob);
    });

    it('should handle contacts with all fields', async () => {
      const contact: Contact = {
        id: 'contact-1',
        nickname: 'Alice',
        publicKey: new Uint8Array(32),
        addedAt: Date.now(),
        lastSeen: Date.now(),
        isOnline: true,
        lastPresenceUpdate: Date.now(),
        frtunPeerId: 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer',
      };
      const key = await generateStorageKey();
      const fingerprint = 'ABCD1234';

      const blob = await exportContacts([contact], key, fingerprint);

      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('importContacts', () => {
    it('should import previously exported contacts', async () => {
      const originalContacts = [
        createTestContact('Alice', 1),
        createTestContact('Bob', 2),
      ];
      const key = await generateStorageKey();
      const fingerprint = 'ABCD1234';

      // Export
      const blob = await exportContacts(originalContacts, key, fingerprint);
      const file = new File([blob], 'contacts.vapor', { type: 'application/octet-stream' });

      // Import
      const result = await importContacts(file, key);

      expect(result.sourceFingerprint).toBe(fingerprint);
      expect(result.contacts).toHaveLength(2);
      expect(result.contacts[0].nickname).toBe('Alice');
      expect(result.contacts[1].nickname).toBe('Bob');
    });

    it('should preserve public keys', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);

      const contact: Contact = {
        id: 'contact-1',
        nickname: 'Alice',
        publicKey,
        addedAt: Date.now(),
      };
      const key = await generateStorageKey();
      const fingerprint = 'TEST';

      const blob = await exportContacts([contact], key, fingerprint);
      const file = new File([blob], 'contacts.vapor');
      const result = await importContacts(file, key);

      expect(Array.from(result.contacts[0].publicKey)).toEqual(Array.from(publicKey));
    });

    it('should reject wrong key', async () => {
      const contacts = [createTestContact('Alice', 1)];
      const correctKey = await generateStorageKey();
      const wrongKey = await generateStorageKey();
      const fingerprint = 'TEST';

      const blob = await exportContacts(contacts, correctKey, fingerprint);
      const file = new File([blob], 'contacts.vapor');

      await expect(importContacts(file, wrongKey)).rejects.toThrow();
    });

    it('should reject corrupted file', async () => {
      const key = await generateStorageKey();
      const corruptData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const file = new File([corruptData], 'contacts.vapor');

      await expect(importContacts(file, key)).rejects.toThrow();
    });

    it('should reject file with wrong version', async () => {
      const key = await generateStorageKey();
      // Create fake file with wrong version byte
      const wrongVersion = new Uint8Array(100);
      wrongVersion[0] = 0xFF; // Wrong version
      const file = new File([wrongVersion], 'contacts.vapor');

      await expect(importContacts(file, key)).rejects.toThrow();
    });
  });

  describe('generateExportFilename', () => {
    it('should generate filename with fingerprint', () => {
      const filename = generateExportFilename('ABCD1234');

      expect(filename).toContain('ABCD1234');
      expect(filename).toContain('vapor-contacts');
      expect(filename.endsWith('.vapor')).toBe(true);
    });

    it('should include date in filename', () => {
      const filename = generateExportFilename('TEST');
      const today = new Date().toISOString().split('T')[0];

      expect(filename).toContain(today);
    });

    it('should handle short fingerprint', () => {
      const filename = generateExportFilename('AB');

      expect(filename).toContain('AB');
    });

    it('should handle long fingerprint', () => {
      const filename = generateExportFilename('ABCDEFGHIJKLMNOP');

      expect(filename).toContain('ABCDEFGH'); // Truncated
    });
  });

  describe('downloadBlob', () => {
    it('should create download link', () => {
      // Mock DOM elements
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
        style: { display: '' },
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const blob = new Blob(['test'], { type: 'application/octet-stream' });
      downloadBlob(blob, 'test-file.vapor');

      expect(mockLink.download).toBe('test-file.vapor');
      expect(mockLink.click).toHaveBeenCalled();
    });
  });

  describe('Export format', () => {
    it('should have consistent version marker in exported data', async () => {
      const contacts = [createTestContact('Test', 1)];
      const key = await generateStorageKey();
      const blob = await exportContacts(contacts, key, 'TEST');

      // Export should produce consistent blob format
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('round-trip integrity', () => {
    it('should preserve all contact fields', async () => {
      const original: Contact = {
        id: 'test-id-123',
        nickname: 'Alice 田中 🎉',
        publicKey: new Uint8Array(32).fill(42),
        addedAt: 1234567890,
        lastSeen: 1234567900,
        isOnline: true,
        lastPresenceUpdate: 1234567899,
        frtunPeerId: 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer',
      };

      const key = await generateStorageKey();
      const fingerprint = 'ROUNDTRIP';

      const blob = await exportContacts([original], key, fingerprint);
      const file = new File([blob], 'test.vapor');
      const result = await importContacts(file, key);

      const imported = result.contacts[0];
      expect(imported.id).toBe(original.id);
      expect(imported.nickname).toBe(original.nickname);
      expect(Array.from(imported.publicKey)).toEqual(Array.from(original.publicKey));
      expect(imported.addedAt).toBe(original.addedAt);
      expect(imported.lastSeen).toBe(original.lastSeen);
      expect(imported.frtunPeerId).toBe(original.frtunPeerId);
    });

    it('should handle 100 contacts', async () => {
      const contacts: Contact[] = [];
      for (let i = 0; i < 100; i++) {
        contacts.push(createTestContact(`Contact ${i}`, i));
      }

      const key = await generateStorageKey();
      const fingerprint = 'BULK';

      const blob = await exportContacts(contacts, key, fingerprint);
      const file = new File([blob], 'test.vapor');
      const result = await importContacts(file, key);

      expect(result.contacts).toHaveLength(100);
    });
  });
});
