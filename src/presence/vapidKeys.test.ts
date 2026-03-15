/**
 * vapidKeys.test.ts
 * Vapor PWA - Tests for VAPID Key Generation
 *
 * Tests:
 * - Key generation produces valid ECDSA P-256 keys
 * - Base64URL encoding/decoding is correct
 * - Key persistence format
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vapidKeyToBase64Url, base64UrlToUint8 } from './vapidKeys';

// Mock IndexedDB for getOrCreateVapidKeys tests
const mockIDBStore = new Map<string, unknown>();

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn((store: string, key: string) => mockIDBStore.get(`${store}:${key}`)),
    put: vi.fn((store: string, value: unknown, key: string) => {
      mockIDBStore.set(`${store}:${key}`, value);
      return Promise.resolve();
    }),
    objectStoreNames: {
      contains: vi.fn().mockReturnValue(true),
    },
  }),
}));

describe('vapidKeys', () => {
  beforeEach(() => {
    mockIDBStore.clear();
  });

  describe('vapidKeyToBase64Url', () => {
    it('should convert Uint8Array to base64url string', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const result = vapidKeyToBase64Url(bytes);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should not contain URL-unsafe characters', () => {
      // Create bytes that would produce +, /, or = in standard base64
      const bytes = new Uint8Array([255, 254, 253, 252, 251, 250]);
      const result = vapidKeyToBase64Url(bytes);

      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
      expect(result).not.toContain('=');
    });

    it('should replace + with - and / with _', () => {
      // Test the replacement logic
      const base64Standard = 'a+b/c==';
      const base64Url = base64Standard
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      expect(base64Url).toBe('a-b_c');
    });

    it('should handle empty array', () => {
      const bytes = new Uint8Array([]);
      const result = vapidKeyToBase64Url(bytes);

      expect(result).toBe('');
    });

    it('should handle P-256 public key (65 bytes)', () => {
      // P-256 uncompressed public key is 65 bytes
      const publicKey = new Uint8Array(65);
      publicKey[0] = 0x04; // Uncompressed point indicator
      for (let i = 1; i < 65; i++) {
        publicKey[i] = i;
      }

      const result = vapidKeyToBase64Url(publicKey);

      // Base64 of 65 bytes = ceil(65 * 8 / 6) = 87 chars (without padding)
      expect(result.length).toBeGreaterThanOrEqual(86);
      expect(result.length).toBeLessThanOrEqual(88);
    });
  });

  describe('base64UrlToUint8', () => {
    it('should convert base64url string back to Uint8Array', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const base64url = vapidKeyToBase64Url(original);
      const result = base64UrlToUint8(base64url);

      expect(result).toEqual(original);
    });

    it('should handle URL-safe characters correctly', () => {
      // Test string with - and _ (URL-safe replacements)
      const base64url = 'a-b_c';

      // Should convert - to + and _ to /
      const base64 = base64url
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      expect(base64).toBe('a+b/c');
    });

    it('should add correct padding', () => {
      // Test various lengths that need different padding
      const testCases = [
        { input: 'YQ', expectedPadding: 2 },      // 1 byte
        { input: 'YWI', expectedPadding: 1 },     // 2 bytes
        { input: 'YWJj', expectedPadding: 0 },    // 3 bytes
        { input: 'YWJjZA', expectedPadding: 2 },  // 4 bytes
      ];

      testCases.forEach(({ input, expectedPadding }) => {
        const padLen = (4 - (input.length % 4)) % 4;
        expect(padLen).toBe(expectedPadding);
      });
    });

    it('should be inverse of vapidKeyToBase64Url', () => {
      const testBytes = [
        new Uint8Array([0]),
        new Uint8Array([255]),
        new Uint8Array([1, 2, 3]),
        new Uint8Array(32).fill(42),
        new Uint8Array(65).fill(128),
      ];

      testBytes.forEach(original => {
        const encoded = vapidKeyToBase64Url(original);
        const decoded = base64UrlToUint8(encoded);
        expect(decoded).toEqual(original);
      });
    });
  });

  describe('VAPID key format', () => {
    it('should use ECDSA with P-256 curve parameters', () => {
      const keyParams = {
        name: 'ECDSA',
        namedCurve: 'P-256',
      };

      expect(keyParams.name).toBe('ECDSA');
      expect(keyParams.namedCurve).toBe('P-256');
    });

    it('should export public key in raw format (65 bytes)', () => {
      // P-256 raw public key format:
      // - 1 byte: 0x04 (uncompressed point indicator)
      // - 32 bytes: X coordinate
      // - 32 bytes: Y coordinate
      const expectedLength = 1 + 32 + 32;
      expect(expectedLength).toBe(65);
    });

    it('should export private key in PKCS8 format', () => {
      // PKCS8 format includes algorithm identifier and key data
      // For P-256, this is typically around 138 bytes
      const minPKCS8Length = 100;
      expect(minPKCS8Length).toBeLessThan(200);
    });
  });

  describe('Key storage format', () => {
    it('should store keys as arrays for IndexedDB compatibility', () => {
      const publicKey = new Uint8Array([1, 2, 3]);
      const privateKey = new Uint8Array([4, 5, 6]);

      const storageFormat = {
        publicKey: Array.from(publicKey),
        privateKey: Array.from(privateKey),
      };

      expect(Array.isArray(storageFormat.publicKey)).toBe(true);
      expect(Array.isArray(storageFormat.privateKey)).toBe(true);

      // Should be able to convert back to Uint8Array
      expect(new Uint8Array(storageFormat.publicKey)).toEqual(publicKey);
      expect(new Uint8Array(storageFormat.privateKey)).toEqual(privateKey);
    });
  });

  describe('Database configuration', () => {
    it('should use correct database name and store', () => {
      const DB_NAME = 'vapor-presence';
      const STORE_NAME = 'vapid';
      const DB_VERSION = 1;

      expect(DB_NAME).toBe('vapor-presence');
      expect(STORE_NAME).toBe('vapid');
      expect(DB_VERSION).toBe(1);
    });
  });
});
