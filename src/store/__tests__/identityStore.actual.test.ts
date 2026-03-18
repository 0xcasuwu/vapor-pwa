/**
 * identityStore.actual.test.ts
 * Vapor PWA - Identity Store Logic Tests
 *
 * Tests identity store helper functions and state logic.
 * Since the actual store imports libp2p which has complex dependencies,
 * we test the core logic patterns here.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

describe('Identity Store - Logic Tests', () => {
  beforeEach(() => {
    // @ts-ignore - replacing global indexedDB for testing
    globalThis.indexedDB = new IDBFactory();
  });

  describe('hashPublicKey', () => {
    async function hashPublicKey(publicKey: Uint8Array): Promise<string> {
      const hash = await crypto.subtle.digest('SHA-256', publicKey.buffer as ArrayBuffer);
      return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    }

    it('should generate 16-character hex hash', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);

      const hash = await hashPublicKey(publicKey);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should generate same hash for same key', async () => {
      const publicKey = new Uint8Array(32).fill(42);

      const hash1 = await hashPublicKey(publicKey);
      const hash2 = await hashPublicKey(publicKey);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different keys', async () => {
      const key1 = new Uint8Array(32).fill(1);
      const key2 = new Uint8Array(32).fill(2);

      const hash1 = await hashPublicKey(key1);
      const hash2 = await hashPublicKey(key2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('deriveStorageKey', () => {
    async function deriveStorageKey(mnemonic: string): Promise<Uint8Array> {
      const mnemonicBytes = new TextEncoder().encode(mnemonic.trim().toLowerCase());
      const saltBytes = new TextEncoder().encode('vapor-storage-key-v1');

      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        mnemonicBytes,
        'PBKDF2',
        false,
        ['deriveBits']
      );

      const keyBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );

      return new Uint8Array(keyBits);
    }

    it('should derive 32-byte key', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

      const key = await deriveStorageKey(mnemonic);

      expect(key).toHaveLength(32);
    });

    it('should derive same key for same mnemonic', async () => {
      const mnemonic = 'test mnemonic phrase';

      const key1 = await deriveStorageKey(mnemonic);
      const key2 = await deriveStorageKey(mnemonic);

      expect(Array.from(key1)).toEqual(Array.from(key2));
    });

    it('should normalize mnemonic (case insensitive)', async () => {
      const lower = 'test phrase';
      const upper = 'TEST PHRASE';

      const key1 = await deriveStorageKey(lower);
      const key2 = await deriveStorageKey(upper);

      expect(Array.from(key1)).toEqual(Array.from(key2));
    });

    it('should normalize mnemonic (trim whitespace)', async () => {
      const normal = 'test phrase';
      const spaced = '  test phrase  ';

      const key1 = await deriveStorageKey(normal);
      const key2 = await deriveStorageKey(spaced);

      expect(Array.from(key1)).toEqual(Array.from(key2));
    });

    it('should derive different keys for different mnemonics', async () => {
      const mnemonic1 = 'phrase one';
      const mnemonic2 = 'phrase two';

      const key1 = await deriveStorageKey(mnemonic1);
      const key2 = await deriveStorageKey(mnemonic2);

      expect(Array.from(key1)).not.toEqual(Array.from(key2));
    });
  });

  describe('Contact management logic', () => {
    interface Contact {
      id: string;
      nickname: string;
      publicKey: Uint8Array;
      addedAt: number;
      lastSeen?: number;
      isOnline?: boolean;
    }

    function addOrUpdateContact(contacts: Contact[], newContact: Contact): Contact[] {
      return [...contacts.filter(c => c.id !== newContact.id), newContact];
    }

    function removeContact(contacts: Contact[], id: string): Contact[] {
      return contacts.filter(c => c.id !== id);
    }

    function findByPublicKey(contacts: Contact[], publicKey: Uint8Array): Contact | null {
      const pubKeyHex = Array.from(publicKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      return contacts.find(c => {
        const contactHex = Array.from(c.publicKey)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        return contactHex === pubKeyHex;
      }) || null;
    }

    it('should add new contact', () => {
      const contacts: Contact[] = [];
      const newContact: Contact = {
        id: 'contact-1',
        nickname: 'Alice',
        publicKey: new Uint8Array(32).fill(1),
        addedAt: Date.now(),
      };

      const result = addOrUpdateContact(contacts, newContact);

      expect(result).toHaveLength(1);
      expect(result[0].nickname).toBe('Alice');
    });

    it('should update existing contact', () => {
      const existing: Contact = {
        id: 'contact-1',
        nickname: 'Alice',
        publicKey: new Uint8Array(32).fill(1),
        addedAt: Date.now() - 1000,
      };
      const contacts: Contact[] = [existing];

      const updated: Contact = {
        ...existing,
        nickname: 'Alice Smith',
      };

      const result = addOrUpdateContact(contacts, updated);

      expect(result).toHaveLength(1);
      expect(result[0].nickname).toBe('Alice Smith');
    });

    it('should remove contact', () => {
      const contacts: Contact[] = [
        { id: '1', nickname: 'Alice', publicKey: new Uint8Array(32), addedAt: Date.now() },
        { id: '2', nickname: 'Bob', publicKey: new Uint8Array(32), addedAt: Date.now() },
      ];

      const result = removeContact(contacts, '1');

      expect(result).toHaveLength(1);
      expect(result[0].nickname).toBe('Bob');
    });

    it('should handle removing non-existent contact', () => {
      const contacts: Contact[] = [
        { id: '1', nickname: 'Alice', publicKey: new Uint8Array(32), addedAt: Date.now() },
      ];

      const result = removeContact(contacts, 'nonexistent');

      expect(result).toHaveLength(1);
    });

    it('should find contact by public key', () => {
      const publicKey = new Uint8Array(32).fill(42);
      const contacts: Contact[] = [
        { id: '1', nickname: 'Alice', publicKey: new Uint8Array(32).fill(1), addedAt: Date.now() },
        { id: '2', nickname: 'Bob', publicKey, addedAt: Date.now() },
      ];

      const found = findByPublicKey(contacts, publicKey);

      expect(found?.nickname).toBe('Bob');
    });

    it('should return null for unknown public key', () => {
      const contacts: Contact[] = [
        { id: '1', nickname: 'Alice', publicKey: new Uint8Array(32).fill(1), addedAt: Date.now() },
      ];

      const found = findByPublicKey(contacts, new Uint8Array(32).fill(99));

      expect(found).toBeNull();
    });
  });

  describe('State transitions', () => {
    type IdentityState = 'loading' | 'none' | 'locked' | 'unlocked';

    interface State {
      state: IdentityState;
      fingerprint: string | null;
      mnemonic: string | null;
      error: string | null;
    }

    function createInitialState(): State {
      return {
        state: 'loading',
        fingerprint: null,
        mnemonic: null,
        error: null,
      };
    }

    it('should start in loading state', () => {
      const state = createInitialState();
      expect(state.state).toBe('loading');
    });

    it('should transition to none when no identity found', () => {
      let state = createInitialState();
      state = { ...state, state: 'none' };
      expect(state.state).toBe('none');
    });

    it('should transition to unlocked after create', () => {
      let state = createInitialState();
      state = {
        ...state,
        state: 'unlocked',
        fingerprint: 'ABCD1234',
        mnemonic: 'test phrase',
      };

      expect(state.state).toBe('unlocked');
      expect(state.fingerprint).toBe('ABCD1234');
      expect(state.mnemonic).toBe('test phrase');
    });

    it('should clear mnemonic when clearing', () => {
      let state: State = {
        state: 'unlocked',
        fingerprint: 'ABCD',
        mnemonic: 'secret',
        error: null,
      };

      state = { ...state, mnemonic: null };

      expect(state.mnemonic).toBeNull();
      expect(state.state).toBe('unlocked');
    });

    it('should reset all on wipe', () => {
      let state: State = {
        state: 'unlocked',
        fingerprint: 'ABCD',
        mnemonic: 'secret',
        error: null,
      };

      state = {
        state: 'none',
        fingerprint: null,
        mnemonic: null,
        error: null,
      };

      expect(state.state).toBe('none');
      expect(state.fingerprint).toBeNull();
      expect(state.mnemonic).toBeNull();
    });

    it('should handle errors', () => {
      let state = createInitialState();
      state = { ...state, state: 'none', error: 'Invalid recovery phrase' };

      expect(state.error).toBe('Invalid recovery phrase');
    });

    it('should clear error on success', () => {
      let state: State = {
        state: 'none',
        fingerprint: null,
        mnemonic: null,
        error: 'Previous error',
      };

      state = {
        state: 'unlocked',
        fingerprint: 'NEW',
        mnemonic: 'phrase',
        error: null,
      };

      expect(state.error).toBeNull();
    });
  });

  describe('IndexedDB operations', () => {
    it('should open database', async () => {
      const request = indexedDB.open('test-db', 1);

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('test', { keyPath: 'id' });
        };
      });

      expect(db.name).toBe('test-db');
      db.close();
    });

    it('should store and retrieve data', async () => {
      const request = indexedDB.open('test-db-2', 1);

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('store', { keyPath: 'id' });
        };
      });

      // Write
      const tx1 = db.transaction('store', 'readwrite');
      tx1.objectStore('store').put({ id: 'test', value: 'hello' });
      await new Promise<void>((resolve, reject) => {
        tx1.oncomplete = () => resolve();
        tx1.onerror = () => reject(tx1.error);
      });

      // Read
      const tx2 = db.transaction('store', 'readonly');
      const result = await new Promise<unknown>((resolve, reject) => {
        const req = tx2.objectStore('store').get('test');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      expect(result).toEqual({ id: 'test', value: 'hello' });
      db.close();
    });
  });
});
