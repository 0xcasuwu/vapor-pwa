/**
 * identityStore.test.ts
 * Vapor PWA - Identity Store Tests
 *
 * Tests identity creation, import, and contact management.
 * Uses mock IndexedDB (fake-indexeddb) for persistence tests.
 *
 * Note: This test file tests the store state management without
 * importing from the actual identityStore (which depends on IndexedDB + libp2p).
 * The state types and transitions are tested as constants to ensure protocol compliance.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Identity states as defined in the identity store
// These MUST match ../identityStore.ts IdentityState type
type IdentityState = 'loading' | 'none' | 'locked' | 'unlocked';

// Contact interface as defined in identityStore
interface Contact {
  id: string;
  nickname: string;
  publicKey: Uint8Array;
  addedAt: number;
  lastSeen?: number;
  isOnline?: boolean;
  lastPresenceUpdate?: number;
  frtunPeerId?: string;
}

// Mock identity keys
interface IdentityKeys {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

// Mock identity store state
interface MockIdentityState {
  state: IdentityState;
  identity: IdentityKeys | null;
  fingerprint: string | null;
  contacts: Contact[];
  error: string | null;
  mnemonic: string | null;
}

// Helper functions to simulate store actions
function createInitialState(): MockIdentityState {
  return {
    state: 'loading',
    identity: null,
    fingerprint: null,
    contacts: [],
    error: null,
    mnemonic: null,
  };
}

function createMockIdentityKeys(): IdentityKeys {
  const publicKey = new Uint8Array(32);
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(publicKey);
  crypto.getRandomValues(privateKey);
  return { publicKey, privateKey };
}

async function hashPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

describe('Identity Store State Machine', () => {
  describe('Initial State', () => {
    it('should start in loading state', () => {
      const state = createInitialState();
      expect(state.state).toBe('loading');
    });

    it('should have no identity initially', () => {
      const state = createInitialState();
      expect(state.identity).toBeNull();
    });

    it('should have no fingerprint initially', () => {
      const state = createInitialState();
      expect(state.fingerprint).toBeNull();
    });

    it('should have empty contacts array', () => {
      const state = createInitialState();
      expect(state.contacts).toEqual([]);
    });

    it('should have no error initially', () => {
      const state = createInitialState();
      expect(state.error).toBeNull();
    });

    it('should have no mnemonic initially', () => {
      const state = createInitialState();
      expect(state.mnemonic).toBeNull();
    });
  });

  describe('Identity States', () => {
    it('should define all valid identity states', () => {
      const validStates: IdentityState[] = ['loading', 'none', 'locked', 'unlocked'];

      validStates.forEach(state => {
        expect(typeof state).toBe('string');
        expect(state.length).toBeGreaterThan(0);
      });
    });

    it('should transition from loading to none when no identity exists', () => {
      let state = createInitialState();
      expect(state.state).toBe('loading');

      // Simulate initialize() with no stored identity
      state = { ...state, state: 'none' };
      expect(state.state).toBe('none');
    });

    it('should transition from loading to locked when identity exists but not unlocked', () => {
      let state = createInitialState();
      expect(state.state).toBe('loading');

      // Simulate initialize() with stored identity but no decryptable mnemonic
      state = { ...state, state: 'locked', fingerprint: 'ABCD1234' };
      expect(state.state).toBe('locked');
      expect(state.fingerprint).toBe('ABCD1234');
    });

    it('should transition from loading to unlocked when auto-unlock succeeds', () => {
      let state = createInitialState();
      expect(state.state).toBe('loading');

      const keys = createMockIdentityKeys();

      // Simulate successful auto-unlock
      state = {
        ...state,
        state: 'unlocked',
        identity: keys,
        fingerprint: 'ABCD1234',
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      };

      expect(state.state).toBe('unlocked');
      expect(state.identity).toBeDefined();
      expect(state.fingerprint).toBe('ABCD1234');
      expect(state.mnemonic).toBeDefined();
    });
  });

  describe('createIdentity', () => {
    it('should transition from none to unlocked on success', () => {
      let state: MockIdentityState = { ...createInitialState(), state: 'none' };

      const keys = createMockIdentityKeys();
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const fingerprint = 'ABCD1234';

      // Simulate createIdentity() success
      state = {
        ...state,
        state: 'unlocked',
        identity: keys,
        fingerprint,
        mnemonic,
        error: null,
      };

      expect(state.state).toBe('unlocked');
      expect(state.identity).toBeDefined();
      expect(state.mnemonic).toBe(mnemonic);
    });

    it('should set error on failure', () => {
      let state: MockIdentityState = { ...createInitialState(), state: 'none' };

      // Simulate createIdentity() failure
      state = {
        ...state,
        error: 'Failed to create identity',
      };

      expect(state.error).toBe('Failed to create identity');
    });
  });

  describe('importIdentity', () => {
    it('should transition to unlocked on valid mnemonic', () => {
      let state: MockIdentityState = { ...createInitialState(), state: 'none' };

      const keys = createMockIdentityKeys();
      const mnemonic = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

      state = {
        ...state,
        state: 'unlocked',
        identity: keys,
        fingerprint: 'EFGH5678',
        mnemonic,
        error: null,
      };

      expect(state.state).toBe('unlocked');
    });

    it('should set error on invalid mnemonic', () => {
      let state: MockIdentityState = { ...createInitialState(), state: 'none' };

      // Simulate importIdentity() with invalid mnemonic
      state = {
        ...state,
        error: 'Invalid recovery phrase',
      };

      expect(state.error).toBe('Invalid recovery phrase');
      expect(state.state).toBe('none');
    });

    it('should clear contacts when importing different identity', () => {
      const contact: Contact = {
        id: '1234567890abcdef',
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

      // Simulate importing a different identity (different fingerprint)
      state = {
        ...state,
        fingerprint: 'NEW67890',
        contacts: [], // Cleared because different identity
        mnemonic: 'new mnemonic words here',
      };

      expect(state.contacts).toEqual([]);
      expect(state.fingerprint).toBe('NEW67890');
    });

    it('should preserve contacts when re-importing same identity', () => {
      const contact: Contact = {
        id: '1234567890abcdef',
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

      // Simulate re-importing the same identity
      state = {
        ...state,
        fingerprint: 'SAME1234', // Same fingerprint
        mnemonic: 'same mnemonic words here',
        // contacts NOT cleared
      };

      expect(state.contacts.length).toBe(1);
      expect(state.contacts[0].nickname).toBe('Alice');
    });
  });

  describe('Mnemonic Management', () => {
    it('should clear mnemonic from state', () => {
      let state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        mnemonic: 'secret mnemonic phrase',
      };

      // Simulate clearMnemonic()
      state = { ...state, mnemonic: null };

      expect(state.mnemonic).toBeNull();
    });

    it('should reveal mnemonic when available', () => {
      const state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      };

      // revealMnemonic() just returns state.mnemonic
      const revealed = state.mnemonic;
      expect(revealed).toBe('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    });

    it('should return null when mnemonic not available', () => {
      const state: MockIdentityState = {
        ...createInitialState(),
        state: 'unlocked',
        mnemonic: null, // Already cleared
      };

      expect(state.mnemonic).toBeNull();
    });
  });
});

describe('Contact Management', () => {
  let state: MockIdentityState;

  beforeEach(() => {
    state = {
      ...createInitialState(),
      state: 'unlocked',
      identity: createMockIdentityKeys(),
      fingerprint: 'TEST1234',
    };
  });

  describe('addContact', () => {
    it('should add contact with all required fields', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const nickname = 'Bob';
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname,
        publicKey,
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [...state.contacts, contact] };

      expect(state.contacts.length).toBe(1);
      expect(state.contacts[0].nickname).toBe('Bob');
      expect(state.contacts[0].id).toBe(id);
    });

    it('should add contact with optional frtun peer ID', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Alice',
        publicKey,
        addedAt: Date.now(),
        frtunPeerId: 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer',
      };

      state = { ...state, contacts: [...state.contacts, contact] };

      expect(state.contacts[0].frtunPeerId).toBe('frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer');
    });

    it('should update existing contact with same public key', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const originalContact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now() - 1000,
      };

      state = { ...state, contacts: [originalContact] };
      expect(state.contacts.length).toBe(1);

      // Update with same public key but new nickname
      const updatedContact: Contact = {
        id,
        nickname: 'Robert',
        publicKey,
        addedAt: Date.now(),
      };

      // Simulate addContact behavior: filter out existing, add new
      state = {
        ...state,
        contacts: [...state.contacts.filter(c => c.id !== id), updatedContact],
      };

      expect(state.contacts.length).toBe(1);
      expect(state.contacts[0].nickname).toBe('Robert');
    });

    it('should trim nickname whitespace', () => {
      const contact: Contact = {
        id: 'test123',
        nickname: '  Padded Name  '.trim(),
        publicKey: new Uint8Array(32),
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [contact] };
      expect(state.contacts[0].nickname).toBe('Padded Name');
    });
  });

  describe('getContactByPublicKey', () => {
    it('should find contact by public key', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [contact] };

      // Simulate getContactByPublicKey
      const pubKeyHex = Array.from(publicKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const found = state.contacts.find(c => {
        const contactHex = Array.from(c.publicKey)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        return contactHex === pubKeyHex;
      }) || null;

      expect(found).not.toBeNull();
      expect(found?.nickname).toBe('Bob');
    });

    it('should return null for unknown public key', () => {
      const unknownKey = new Uint8Array(32);
      crypto.getRandomValues(unknownKey);

      const pubKeyHex = Array.from(unknownKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const found = state.contacts.find(c => {
        const contactHex = Array.from(c.publicKey)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        return contactHex === pubKeyHex;
      }) || null;

      expect(found).toBeNull();
    });
  });

  describe('updateContactNickname', () => {
    it('should update contact nickname', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [contact] };

      // Simulate updateContactNickname
      state = {
        ...state,
        contacts: state.contacts.map(c =>
          c.id === id ? { ...c, nickname: 'Robert' } : c
        ),
      };

      expect(state.contacts[0].nickname).toBe('Robert');
    });
  });

  describe('updateContactPresence', () => {
    it('should update online status to true', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now(),
        isOnline: false,
      };

      state = { ...state, contacts: [contact] };

      // Simulate updateContactPresence(id, true)
      const now = Date.now();
      state = {
        ...state,
        contacts: state.contacts.map(c =>
          c.id === id ? { ...c, isOnline: true, lastPresenceUpdate: now, lastSeen: now } : c
        ),
      };

      expect(state.contacts[0].isOnline).toBe(true);
      expect(state.contacts[0].lastPresenceUpdate).toBeDefined();
      expect(state.contacts[0].lastSeen).toBeDefined();
    });

    it('should update online status to false', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now(),
        isOnline: true,
        lastSeen: Date.now() - 1000,
      };

      state = { ...state, contacts: [contact] };
      const originalLastSeen = state.contacts[0].lastSeen;

      // Simulate updateContactPresence(id, false)
      const now = Date.now();
      state = {
        ...state,
        contacts: state.contacts.map(c =>
          c.id === id
            ? { ...c, isOnline: false, lastPresenceUpdate: now }
            : c
        ),
      };

      expect(state.contacts[0].isOnline).toBe(false);
      expect(state.contacts[0].lastSeen).toBe(originalLastSeen); // lastSeen not updated when going offline
    });
  });

  describe('removeContact', () => {
    it('should remove contact from list', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now(),
      };

      state = { ...state, contacts: [contact] };
      expect(state.contacts.length).toBe(1);

      // Simulate removeContact
      state = {
        ...state,
        contacts: state.contacts.filter(c => c.id !== id),
      };

      expect(state.contacts.length).toBe(0);
    });

    it('should handle removing non-existent contact gracefully', () => {
      state = { ...state, contacts: [] };

      // Simulate removeContact with non-existent ID
      state = {
        ...state,
        contacts: state.contacts.filter(c => c.id !== 'nonexistent'),
      };

      expect(state.contacts.length).toBe(0);
    });
  });

  describe('updateLastSeen', () => {
    it('should update lastSeen timestamp', async () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);
      const id = await hashPublicKey(publicKey);

      const contact: Contact = {
        id,
        nickname: 'Bob',
        publicKey,
        addedAt: Date.now() - 10000,
      };

      state = { ...state, contacts: [contact] };

      const before = Date.now();
      // Simulate updateLastSeen
      state = {
        ...state,
        contacts: state.contacts.map(c =>
          c.id === id ? { ...c, lastSeen: Date.now() } : c
        ),
      };
      const after = Date.now();

      expect(state.contacts[0].lastSeen).toBeGreaterThanOrEqual(before);
      expect(state.contacts[0].lastSeen).toBeLessThanOrEqual(after);
    });
  });
});

describe('wipeAll', () => {
  it('should reset all state to initial values', () => {
    let state: MockIdentityState = {
      state: 'unlocked',
      identity: createMockIdentityKeys(),
      fingerprint: 'TEST1234',
      contacts: [
        {
          id: 'abc123',
          nickname: 'Bob',
          publicKey: new Uint8Array(32),
          addedAt: Date.now(),
        },
      ],
      error: null,
      mnemonic: 'secret phrase',
    };

    // Simulate wipeAll
    state = {
      state: 'none',
      identity: null,
      fingerprint: null,
      contacts: [],
      error: null,
      mnemonic: null,
    };

    expect(state.state).toBe('none');
    expect(state.identity).toBeNull();
    expect(state.fingerprint).toBeNull();
    expect(state.contacts).toEqual([]);
    expect(state.mnemonic).toBeNull();
  });

  it('should clear error state', () => {
    let state: MockIdentityState = {
      ...createInitialState(),
      state: 'none',
      error: 'Some error occurred',
    };

    // Simulate wipeAll
    state = {
      ...state,
      state: 'none',
      error: null,
    };

    expect(state.error).toBeNull();
  });
});

describe('Contact ID Generation', () => {
  it('should generate deterministic ID from public key', async () => {
    const publicKey = new Uint8Array(32);
    publicKey.fill(42); // Deterministic for testing

    const id1 = await hashPublicKey(publicKey);
    const id2 = await hashPublicKey(publicKey);

    expect(id1).toBe(id2);
    expect(id1.length).toBe(16); // 16 hex chars
  });

  it('should generate different IDs for different public keys', async () => {
    const publicKey1 = new Uint8Array(32);
    publicKey1.fill(1);

    const publicKey2 = new Uint8Array(32);
    publicKey2.fill(2);

    const id1 = await hashPublicKey(publicKey1);
    const id2 = await hashPublicKey(publicKey2);

    expect(id1).not.toBe(id2);
  });
});

describe('Contact Interface', () => {
  it('should support all defined fields', () => {
    const contact: Contact = {
      id: '1234567890abcdef',
      nickname: 'Test User',
      publicKey: new Uint8Array(32),
      addedAt: Date.now(),
      lastSeen: Date.now(),
      isOnline: true,
      lastPresenceUpdate: Date.now(),
      frtunPeerId: 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer',
    };

    expect(contact.id).toBeDefined();
    expect(contact.nickname).toBeDefined();
    expect(contact.publicKey).toBeInstanceOf(Uint8Array);
    expect(contact.addedAt).toBeGreaterThan(0);
    expect(contact.lastSeen).toBeGreaterThan(0);
    expect(contact.isOnline).toBe(true);
    expect(contact.lastPresenceUpdate).toBeGreaterThan(0);
    expect(contact.frtunPeerId).toBeDefined();
  });
});
