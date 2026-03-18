/**
 * share.test.ts
 * Vapor PWA - URL Handling Utility Tests
 *
 * Tests the URL parsing utilities for invite links.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseInviteFromUrl,
  clearInviteFromUrl,
  hasPendingInvite,
} from '../share';

describe('Share Utilities', () => {
  // Store original location
  const originalLocation = window.location;

  beforeEach(() => {
    // Mock window.location
    // @ts-expect-error - mocking window.location
    delete window.location;
    // @ts-expect-error - setting mock
    window.location = {
      hash: '',
      pathname: '/vapor-pwa/',
    };

    // Mock history.replaceState
    vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original location
    // @ts-ignore - restoring original location object
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  describe('parseInviteFromUrl', () => {
    it('should parse valid join URL', () => {
      window.location.hash = '#/join/PAYLOAD123';

      const result = parseInviteFromUrl();

      expect(result).toBe('PAYLOAD123');
    });

    it('should URL decode payload', () => {
      window.location.hash = '#/join/test%20payload%2Bspecial';

      const result = parseInviteFromUrl();

      expect(result).toBe('test payload+special');
    });

    it('should handle base64 encoded payload', () => {
      const base64Payload = 'SGVsbG8gV29ybGQ=';
      window.location.hash = `#/join/${base64Payload}`;

      const result = parseInviteFromUrl();

      expect(result).toBe(base64Payload);
    });

    it('should handle URL-safe base64', () => {
      const urlSafeBase64 = 'SGVsbG8td29ybGRfMTIzKzQ1Ng==';
      window.location.hash = `#/join/${urlSafeBase64}`;

      const result = parseInviteFromUrl();

      expect(result).toBe(urlSafeBase64);
    });

    it('should return null for empty hash', () => {
      window.location.hash = '';

      const result = parseInviteFromUrl();

      expect(result).toBeNull();
    });

    it('should return null for wrong format', () => {
      window.location.hash = '#/other/path';

      const result = parseInviteFromUrl();

      expect(result).toBeNull();
    });

    it('should return null for plain hash', () => {
      window.location.hash = '#something';

      const result = parseInviteFromUrl();

      expect(result).toBeNull();
    });

    it('should return null for malformed join URL', () => {
      window.location.hash = '#/join/';

      const result = parseInviteFromUrl();

      // Regex requires at least one character after /join/
      expect(result).toBeNull();
    });

    it('should return null for invalid URI encoding', () => {
      // % not followed by hex digits
      window.location.hash = '#/join/%invalid';

      const result = parseInviteFromUrl();

      expect(result).toBeNull();
    });

    it('should handle complex payload with special characters', () => {
      const payload = 'abc123-_xyz.payload';
      window.location.hash = `#/join/${encodeURIComponent(payload)}`;

      const result = parseInviteFromUrl();

      expect(result).toBe(payload);
    });
  });

  describe('clearInviteFromUrl', () => {
    it('should clear join hash', () => {
      window.location.hash = '#/join/PAYLOAD';

      clearInviteFromUrl();

      expect(history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/vapor-pwa/'
      );
    });

    it('should not clear non-join hash', () => {
      window.location.hash = '#/other';

      clearInviteFromUrl();

      expect(history.replaceState).not.toHaveBeenCalled();
    });

    it('should not clear empty hash', () => {
      window.location.hash = '';

      clearInviteFromUrl();

      expect(history.replaceState).not.toHaveBeenCalled();
    });
  });

  describe('hasPendingInvite', () => {
    it('should return true when join URL present', () => {
      window.location.hash = '#/join/PAYLOAD';

      const result = hasPendingInvite();

      expect(result).toBe(true);
    });

    it('should return false when no join URL', () => {
      window.location.hash = '';

      const result = hasPendingInvite();

      expect(result).toBe(false);
    });

    it('should return false for other hash', () => {
      window.location.hash = '#/settings';

      const result = hasPendingInvite();

      expect(result).toBe(false);
    });
  });
});
