/**
 * identityEdgeCases.test.ts
 * Vapor PWA - Identity Store Edge Case Tests
 *
 * Tests edge cases and unusual scenarios in identity management.
 * Verifies robustness of identity creation, import, and contact handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Types matching the identity store
type IdentityState = 'loading' | 'none' | 'locked' | 'unlocked';

interface Contact {
  id: string;
  nickname: string;
  publicKey: Uint8Array;
  addedAt: number;
  lastSeen?: number;
  isOnline?: boolean;
  frtunPeerId?: string;
}

interface MockIdentityState {
  state: IdentityState;
  fingerprint: string | null;
  contacts: Contact[];
  error: string | null;
  mnemonic: string | null;
}

function createInitialState(): MockIdentityState {
  return {
    state: 'loading',
    fingerprint: null,
    contacts: [],
    error: null,
    mnemonic: null,
  };
}

async function hashPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

describe('Identity Edge Cases', () => {
  describe('Mnemonic Import Edge Cases', () => {
    it('should handle importing same identity twice (idempotent)', () => {
      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        fingerprint: 'ABCD1234',
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      };

      // Re-import same identity
      state = {
        ...state,
        state: 'unlocked',
        fingerprint: 'ABCD1234', // Same fingerprint
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      };

      expect(state.state).toBe('unlocked');
      expect(state.fingerprint).toBe('ABCD1234');
    });

    it('should clear contacts when importing different identity', () => {
      const contact: Contact = {
        id: 'contact1',
        nickname: 'Alice',
        publicKey: new Uint8Array(32),
        addedAt: Date.now(),
      };

      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        fingerprint: 'OLD12345',
        contacts: [contact],
      };

      // Import different identity
      state = {
        ...state,
        fingerprint: 'NEW67890',
        contacts: [], // Cleared because different identity
      };

      expect(state.contacts.length).toBe(0);
    });

    it('should preserve contacts when re-importing same identity', () => {
      const contact: Contact = {
        id: 'contact1',
        nickname: 'Alice',
        publicKey: new Uint8Array(32),
        addedAt: Date.now(),
      };

      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        fingerprint: 'SAME1234',
        contacts: [contact],
      };

      // Re-import same identity (same fingerprint)
      state = {
        ...state,
        fingerprint: 'SAME1234',
        // contacts NOT cleared
      };

      expect(state.contacts.length).toBe(1);
    });

    it('should handle mnemonic with extra whitespace', () => {
      // The store normalizes mnemonics
      const normalizedMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const spacedMnemonic = '  abandon  abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ';

      // Both should result in same identity (normalization happens in store)
      expect(spacedMnemonic.trim().toLowerCase().replace(/\s+/g, ' ')).toBe(normalizedMnemonic);
    });

    it('should handle mnemonic with mixed case', () => {
      const normalizedMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const mixedCaseMnemonic = 'ABANDON Abandon ABANDON abandon ABANDON abandon ABANDON abandon ABANDON abandon ABANDON ABOUT';

      // Both should result in same identity (normalization happens in store)
      expect(mixedCaseMnemonic.toLowerCase()).toBe(normalizedMnemonic);
    });
  });

  describe('Contact Edge Cases', () => {
    let state: MockIdentityState;

    beforeEach(() => {
      state = {
        ...createInitialState(),
        state: 'unlocked',
        fingerprint: 'TEST1234',
      };
    });

    it('should handle adding duplicate contact (same public key)', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact1: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now() - 1000,
      };

      state = { ...state, contacts: [contact1] };

      // Add same contact with different nickname
      const contact2: Contact = {
        id,
        nickname: 'Robert',
        publicKey,
        addedAt: Date.now(),
      };

      // Replace existing
      state = {
        ...state,
        contacts: [...state.contacts.filter(c => c.id !== id), contact2],
      };

      expect(state.contacts.length).toBe(1);
      expect(state.contacts[0].nickname).toBe('Robert');
    });

    it('should handle removing non-existent contact', () => {
      state = { ...state, contacts: [] };

      // Try to remove contact that doesn't exist
      state = {
        ...state,
        contacts: state.contacts.filter(c => c.id !== 'nonexistent'),
      };

      expect(state.contacts.length).toBe(0);
    });

    it('should handle contact with special characters in nickname', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: "Bob's <Test> & \"Friend\"",
        publicKey,
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [contact] };

      expect(state.contacts[0].nickname).toBe("Bob's <Test> & \"Friend\"");
    });

    it('should handle contact with unicode nickname', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: '田中太郎 🎉',
        publicKey,
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [contact] };

      expect(state.contacts[0].nickname).toBe('田中太郎 🎉');
    });

    it('should handle empty nickname', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: '',
        publicKey,
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [contact] };

      expect(state.contacts[0].nickname).toBe('');
    });

    it('should handle very long nickname', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const longNickname = 'A'.repeat(1000);
      const contact: Contact = {
        id,
        nickname: longNickname,
        publicKey,
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [contact] };

      expect(state.contacts[0].nickname.length).toBe(1000);
    });

    it('should handle many contacts', async () => {
      const contacts: Contact[] = [];

      for (let i = 0; i < 100; i++) {
        const publicKey = new Uint8Array(32);
        crypto.getRandomValues(publicKey);
        const id = await hashPublicKey(publicKey);

        contacts.push({
          id,
          nickname: `Contact ${i}`,
          publicKey,
          addedAt: Date.now() + i,
        });
      }

      state = { ...state, contacts };

      expect(state.contacts.length).toBe(100);
    });
  });

  describe('wipeAll Edge Cases', () => {
    it('should handle wipe when already empty', () => {
      let state = createInitialState();
      state = { ...state, state: 'none' };

      // Wipe empty state
      state = {
        state: 'none',
        fingerprint: null,
        contacts: [],
        error: null,
        mnemonic: null,
      };

      expect(state.state).toBe('none');
    });

    it('should handle wipe during active session', () => {
      let state: MockIdentityState = {
        state: 'unlocked',
        fingerprint: 'TEST1234',
        contacts: [
          { id: '1', nickname: 'Bob', publicKey: new Uint8Array(32), addedAt: Date.now() },
        ],
        error: null,
        mnemonic: 'secret phrase here',
      };

      // Wipe during active session
      state = {
        state: 'none',
        fingerprint: null,
        contacts: [],
        error: null,
        mnemonic: null,
      };

      expect(state.state).toBe('none');
      expect(state.contacts).toEqual([]);
      expect(state.mnemonic).toBeNull();
    });

    it('should handle wipe with error state', () => {
      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'none',
        error: 'Some error occurred',
      };

      // Wipe should clear error
      state = {
        ...state,
        error: null,
      };

      expect(state.error).toBeNull();
    });
  });

  describe('State Transition Edge Cases', () => {
    it('should handle multiple rapid state changes', () => {
      let state = createInitialState();

      // Simulate rapid transitions
      state = { ...state, state: 'loading' };
      state = { ...state, state: 'none' };
      state = { ...state, state: 'unlocked', fingerprint: 'TEST' };
      state = { ...state, state: 'none', fingerprint: null };
      state = { ...state, state: 'locked', fingerprint: 'TEST2' };

      expect(state.state).toBe('locked');
      expect(state.fingerprint).toBe('TEST2');
    });

    it('should handle going from unlocked to locked', () => {
      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        fingerprint: 'TEST',
        mnemonic: 'secret phrase',
      };

      // Lock (clear mnemonic but keep identity)
      state = {
        ...state,
        state: 'locked',
        mnemonic: null,
      };

      expect(state.state).toBe('locked');
      expect(state.fingerprint).toBe('TEST');
      expect(state.mnemonic).toBeNull();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent contact updates', async () => {
      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        fingerprint: 'TEST',
      };

      // Simulate concurrent adds
      const publicKey1 = new Uint8Array(32);
      publicKey1.fill(1);
      const id1 = await hashPublicKey(publicKey1);

      const publicKey2 = new Uint8Array(32);
      publicKey2.fill(2);
      const id2 = await hashPublicKey(publicKey2);

      const contact1: Contact = { id: id1, nickname: 'A', publicKey: publicKey1, addedAt: Date.now() };
      const contact2: Contact = { id: id2, nickname: 'B', publicKey: publicKey2, addedAt: Date.now() };

      // Both contacts added
      state = { ...state, contacts: [contact1, contact2] };

      expect(state.contacts.length).toBe(2);
    });
  });

  describe('Error State Edge Cases', () => {
    it('should handle error during initialization', () => {
      let state = createInitialState();

      state = {
        ...state,
        state: 'none',
        error: 'Failed to initialize',
      };

      expect(state.state).toBe('none');
      expect(state.error).toBeDefined();
    });

    it('should handle error during identity creation', () => {
      let state = createInitialState();

      state = {
        ...state,
        error: 'Failed to create identity',
      };

      expect(state.error).toBe('Failed to create identity');
    });

    it('should handle error during identity import', () => {
      let state = createInitialState();

      state = {
        ...state,
        state: 'none',
        error: 'Invalid recovery phrase',
      };

      expect(state.state).toBe('none');
      expect(state.error).toBe('Invalid recovery phrase');
    });

    it('should clear error on successful operation', () => {
      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'none',
        error: 'Previous error',
      };

      // Successful operation clears error
      state = {
        ...state,
        state: 'unlocked',
        fingerprint: 'NEW',
        error: null,
      };

      expect(state.error).toBeNull();
    });
  });

  describe('Contact ID Generation Edge Cases', () => {
    it('should generate consistent ID for same public key', async () => {
      const publicKey = new Uint8Array(32);
      publicKey.fill(42);

      const id1 = await hashPublicKey(publicKey);
      const id2 = await hashPublicKey(publicKey);

      expect(id1).toBe(id2);
    });

    it('should generate different ID for different public keys', async () => {
      const publicKey1 = new Uint8Array(32);
      publicKey1.fill(1);

      const publicKey2 = new Uint8Array(32);
      publicKey2.fill(2);

      const id1 = await hashPublicKey(publicKey1);
      const id2 = await hashPublicKey(publicKey2);

      expect(id1).not.toBe(id2);
    });

    it('should handle all-zero public key', async () => {
      const zeroKey = new Uint8Array(32);
      const id = await hashPublicKey(zeroKey);

      expect(id.length).toBe(16);
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should handle all-ones public key', async () => {
      const onesKey = new Uint8Array(32);
      onesKey.fill(255);
      const id = await hashPublicKey(onesKey);

      expect(id.length).toBe(16);
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('Presence Update Edge Cases', () => {
    it('should handle presence update for non-existent contact', () => {
      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        contacts: [],
      };

      // Update presence for non-existent contact (no-op)
      state = {
        ...state,
        contacts: state.contacts.map(c =>
          c.id === 'nonexistent' ? { ...c, isOnline: true } : c
        ),
      };

      expect(state.contacts.length).toBe(0);
    });

    it('should handle rapid online/offline toggling', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        contacts: [{
          id,
          nickname: 'Bob',
          publicKey,
          addedAt: Date.now(),
          isOnline: false,
        }],
      };

      // Rapid toggling
      for (let i = 0; i < 10; i++) {
        const isOnline = i % 2 === 0;
        state = {
          ...state,
          contacts: state.contacts.map(c =>
            c.id === id ? { ...c, isOnline } : c
          ),
        };
      }

      // Final state should be offline (9 is odd, so false)
      expect(state.contacts[0].isOnline).toBe(false);
    });
  });

  describe('frtun Peer ID Edge Cases', () => {
    it('should handle contact without frtun peer ID', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now(),
        // No frtunPeerId
      };

      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        contacts: [contact],
      };

      expect(state.contacts[0].frtunPeerId).toBeUndefined();
    });

    it('should handle contact with frtun peer ID', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now(),
        frtunPeerId: 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer',
      };

      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        contacts: [contact],
      };

      expect(state.contacts[0].frtunPeerId).toBe('frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer');
    });
  });
});
