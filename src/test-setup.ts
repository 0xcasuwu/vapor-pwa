/**
 * test-setup.ts
 * Vapor PWA - Test Setup
 *
 * Global test setup for Vitest.
 * Sets up mocks and polyfills needed for browser APIs in Node.js environment.
 */

import { vi } from 'vitest';

// Mock atob/btoa for base64 encoding (Node.js doesn't have these globally)
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

// Mock TextEncoder/TextDecoder if not available
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

// Mock File class for contact import tests
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends Blob {
    name: string;
    lastModified: number;
    webkitRelativePath: string;

    constructor(chunks: BlobPart[], name: string, options?: FilePropertyBag) {
      super(chunks, options);
      this.name = name;
      this.lastModified = options?.lastModified || Date.now();
      this.webkitRelativePath = '';
    }
  } as typeof File;
}

// Mock Notification API
globalThis.Notification = {
  permission: 'default',
  requestPermission: vi.fn().mockResolvedValue('granted'),
} as unknown as typeof Notification;
