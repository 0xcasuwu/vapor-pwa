/**
 * identityStore.ts
 * Vapor PWA - Identity and Contacts Persistent Storage
 *
 * Uses IndexedDB for persistent storage with encryption.
 * Stores:
 * - Identity (public key + encrypted private key)
 * - Contacts (nickname + public key + metadata)
 *
 * All sensitive data is encrypted with a key derived from the mnemonic.
 */

import { create } from 'zustand';
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import {
  generateMnemonic,
  validateMnemonic,
  deriveIdentityFromMnemonic,
  getIdentityFingerprint,
  type IdentityKeys,
} from '../crypto/SeedIdentity';
import { encrypt } from '../crypto/Encryption';
import {
  exportContacts as exportContactsToBlob,
  importContacts as importContactsFromFile,
  generateExportFilename,
  downloadBlob,
} from '../crypto/ContactExport';

// IndexedDB Schema
interface VaporDB extends DBSchema {
  identity: {
    key: 'current';
    value: {
      publicKey: Uint8Array;
      encryptedPrivateKey: Uint8Array;
      fingerprint: string;
      createdAt: number;
    };
  };
  contacts: {
    key: string; // contact id (hash of public key)
    value: Contact;
    indexes: { 'by-nickname': string; 'by-added': number };
  };
}

// Push subscription data for presence notifications
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface Contact {
  id: string;
  nickname: string;
  publicKey: Uint8Array;  // 32 bytes X25519
  addedAt: number;
  lastSeen?: number;
  // Presence fields
  pushSubscription?: PushSubscriptionData;  // For sending presence to this contact
  isOnline?: boolean;                        // Current online status
  lastPresenceUpdate?: number;               // When status last changed
}

type IdentityState = 'loading' | 'none' | 'locked' | 'unlocked';

interface IdentityStore {
  // State
  state: IdentityState;
  identity: IdentityKeys | null;
  fingerprint: string | null;
  contacts: Contact[];
  error: string | null;

  // Mnemonic (only available during setup/reveal)
  mnemonic: string | null;

  // Actions
  initialize: () => Promise<void>;
  createIdentity: () => Promise<string>;  // Returns mnemonic
  importIdentity: (mnemonic: string) => Promise<boolean>;
  revealMnemonic: () => string | null;
  clearMnemonic: () => void;

  // Contacts
  addContact: (publicKey: Uint8Array, nickname: string, pushSubscription?: PushSubscriptionData) => Promise<Contact>;
  updateContactNickname: (id: string, nickname: string) => Promise<void>;
  updateContactPushSubscription: (id: string, pushSubscription: PushSubscriptionData) => Promise<void>;
  updateContactPresence: (id: string, isOnline: boolean) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  getContactByPublicKey: (publicKey: Uint8Array) => Contact | null;
  updateLastSeen: (id: string) => Promise<void>;

  // Export/Import
  exportContacts: () => Promise<void>;
  importContacts: (file: File) => Promise<{ imported: number; skipped: number }>;
  getStorageKey: () => Uint8Array | null;

  // Danger zone
  wipeAll: () => Promise<void>;
}

const DB_NAME = 'vapor-identity';
const DB_VERSION = 1;

let db: IDBPDatabase<VaporDB> | null = null;
let storageKey: Uint8Array | null = null;

async function getDB(): Promise<IDBPDatabase<VaporDB>> {
  if (db) return db;

  db = await openDB<VaporDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Identity store
      if (!database.objectStoreNames.contains('identity')) {
        database.createObjectStore('identity');
      }

      // Contacts store
      if (!database.objectStoreNames.contains('contacts')) {
        const contactsStore = database.createObjectStore('contacts', { keyPath: 'id' });
        contactsStore.createIndex('by-nickname', 'nickname');
        contactsStore.createIndex('by-added', 'addedAt');
      }
    },
  });

  return db;
}

async function deriveStorageKey(mnemonic: string): Promise<Uint8Array> {
  // Derive a separate key for storage encryption
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

async function hashPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export const useIdentityStore = create<IdentityStore>((set, get) => ({
  state: 'loading',
  identity: null,
  fingerprint: null,
  contacts: [],
  error: null,
  mnemonic: null,

  /**
   * Initialize the store - check if identity exists
   */
  initialize: async () => {
    try {
      const database = await getDB();
      const stored = await database.get('identity', 'current');

      if (stored) {
        // Identity exists but is locked (we don't have the key yet)
        // For now, we auto-unlock since key is in memory from import
        // TODO: Add proper lock/unlock with password
        set({
          state: 'locked',
          fingerprint: stored.fingerprint,
        });
      } else {
        set({ state: 'none' });
      }
    } catch (error) {
      set({
        state: 'none',
        error: error instanceof Error ? error.message : 'Failed to initialize',
      });
    }
  },

  /**
   * Create a new identity with fresh mnemonic
   */
  createIdentity: async () => {
    try {
      const mnemonic = await generateMnemonic();
      const keys = await deriveIdentityFromMnemonic(mnemonic);
      const fingerprint = await getIdentityFingerprint(keys.publicKey);

      // Derive storage encryption key
      storageKey = await deriveStorageKey(mnemonic);

      // Encrypt private key for storage
      const encryptedPrivateKey = await encrypt(
        new TextDecoder().decode(keys.privateKey),
        storageKey
      );

      // Store in IndexedDB
      const database = await getDB();
      await database.put('identity', {
        publicKey: keys.publicKey,
        encryptedPrivateKey,
        fingerprint,
        createdAt: Date.now(),
      }, 'current');

      set({
        state: 'unlocked',
        identity: keys,
        fingerprint,
        mnemonic,
        error: null,
      });

      return mnemonic;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create identity',
      });
      throw error;
    }
  },

  /**
   * Import identity from mnemonic
   */
  importIdentity: async (mnemonic: string) => {
    try {
      const isValid = await validateMnemonic(mnemonic);
      if (!isValid) {
        set({ error: 'Invalid recovery phrase' });
        return false;
      }

      const keys = await deriveIdentityFromMnemonic(mnemonic);
      const fingerprint = await getIdentityFingerprint(keys.publicKey);

      // Derive storage encryption key
      storageKey = await deriveStorageKey(mnemonic);

      // Check if this is a re-import of existing identity
      const database = await getDB();
      const existing = await database.get('identity', 'current');

      if (existing && existing.fingerprint !== fingerprint) {
        // Different identity - clear old contacts
        const tx = database.transaction('contacts', 'readwrite');
        await tx.store.clear();
        await tx.done;
      }

      // Encrypt and store private key
      const encryptedPrivateKey = await encrypt(
        new TextDecoder().decode(keys.privateKey),
        storageKey
      );

      await database.put('identity', {
        publicKey: keys.publicKey,
        encryptedPrivateKey,
        fingerprint,
        createdAt: existing?.createdAt || Date.now(),
      }, 'current');

      // Load contacts
      const contacts = await database.getAll('contacts');

      set({
        state: 'unlocked',
        identity: keys,
        fingerprint,
        contacts,
        mnemonic,
        error: null,
      });

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to import identity',
      });
      return false;
    }
  },

  /**
   * Get mnemonic (only available after create/import)
   */
  revealMnemonic: () => {
    return get().mnemonic;
  },

  /**
   * Clear mnemonic from memory (after user confirms backup)
   */
  clearMnemonic: () => {
    set({ mnemonic: null });
  },

  /**
   * Add a new contact
   */
  addContact: async (publicKey: Uint8Array, nickname: string, pushSubscription?: PushSubscriptionData) => {
    const id = await hashPublicKey(publicKey);
    const contact: Contact = {
      id,
      nickname: nickname.trim(),
      publicKey,
      addedAt: Date.now(),
      pushSubscription,
    };

    const database = await getDB();
    await database.put('contacts', contact);

    const contacts = [...get().contacts.filter(c => c.id !== id), contact];
    set({ contacts });

    return contact;
  },

  /**
   * Update contact nickname
   */
  updateContactNickname: async (id: string, nickname: string) => {
    const database = await getDB();
    const contact = await database.get('contacts', id);

    if (contact) {
      contact.nickname = nickname.trim();
      await database.put('contacts', contact);

      const contacts = get().contacts.map(c =>
        c.id === id ? { ...c, nickname: nickname.trim() } : c
      );
      set({ contacts });
    }
  },

  /**
   * Remove a contact
   */
  removeContact: async (id: string) => {
    const database = await getDB();
    await database.delete('contacts', id);

    const contacts = get().contacts.filter(c => c.id !== id);
    set({ contacts });
  },

  /**
   * Find contact by public key
   */
  getContactByPublicKey: (publicKey: Uint8Array) => {
    const contacts = get().contacts;
    const pubKeyHex = Array.from(publicKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return contacts.find(c => {
      const contactHex = Array.from(c.publicKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      return contactHex === pubKeyHex;
    }) || null;
  },

  /**
   * Update last seen timestamp for contact
   */
  updateLastSeen: async (id: string) => {
    const database = await getDB();
    const contact = await database.get('contacts', id);

    if (contact) {
      contact.lastSeen = Date.now();
      await database.put('contacts', contact);

      const contacts = get().contacts.map(c =>
        c.id === id ? { ...c, lastSeen: Date.now() } : c
      );
      set({ contacts });
    }
  },

  /**
   * Update contact's push subscription
   */
  updateContactPushSubscription: async (id: string, pushSubscription: PushSubscriptionData) => {
    const database = await getDB();
    const contact = await database.get('contacts', id);

    if (contact) {
      contact.pushSubscription = pushSubscription;
      await database.put('contacts', contact);

      const contacts = get().contacts.map(c =>
        c.id === id ? { ...c, pushSubscription } : c
      );
      set({ contacts });
    }
  },

  /**
   * Update contact's online presence status
   */
  updateContactPresence: async (id: string, isOnline: boolean) => {
    const database = await getDB();
    const contact = await database.get('contacts', id);

    if (contact) {
      contact.isOnline = isOnline;
      contact.lastPresenceUpdate = Date.now();
      if (isOnline) {
        contact.lastSeen = Date.now();
      }
      await database.put('contacts', contact);

      const contacts = get().contacts.map(c =>
        c.id === id ? { ...c, isOnline, lastPresenceUpdate: Date.now(), lastSeen: isOnline ? Date.now() : c.lastSeen } : c
      );
      set({ contacts });
    }
  },

  /**
   * Export contacts to encrypted file and trigger download
   */
  exportContacts: async () => {
    const { contacts, fingerprint } = get();

    if (!storageKey) {
      throw new Error('Storage key not available. Please re-enter your seed phrase.');
    }

    if (!fingerprint) {
      throw new Error('No identity found.');
    }

    if (contacts.length === 0) {
      throw new Error('No contacts to export.');
    }

    const blob = await exportContactsToBlob(contacts, storageKey, fingerprint);
    const filename = generateExportFilename(fingerprint);
    downloadBlob(blob, filename);
  },

  /**
   * Import contacts from encrypted file
   */
  importContacts: async (file: File) => {
    if (!storageKey) {
      throw new Error('Storage key not available. Please re-enter your seed phrase.');
    }

    const result = await importContactsFromFile(file, storageKey);
    const database = await getDB();
    const currentContacts = get().contacts;

    let imported = 0;
    let skipped = 0;

    for (const importedContact of result.contacts) {
      // Check if contact already exists
      const existing = currentContacts.find(c => c.id === importedContact.id);

      if (existing) {
        // Update existing contact if import is newer
        if (importedContact.addedAt > existing.addedAt) {
          const updated: Contact = {
            ...existing,
            nickname: importedContact.nickname,
            pushSubscription: importedContact.pushSubscription,
          };
          await database.put('contacts', updated);
          imported++;
        } else {
          skipped++;
        }
      } else {
        // Add new contact
        const newContact: Contact = {
          id: importedContact.id,
          nickname: importedContact.nickname,
          publicKey: importedContact.publicKey,
          addedAt: importedContact.addedAt,
          lastSeen: importedContact.lastSeen,
          pushSubscription: importedContact.pushSubscription,
        };
        await database.put('contacts', newContact);
        imported++;
      }
    }

    // Reload contacts from database
    const updatedContacts = await database.getAll('contacts');
    set({ contacts: updatedContacts });

    return { imported, skipped };
  },

  /**
   * Get the storage key (for export/import operations)
   */
  getStorageKey: () => {
    return storageKey;
  },

  /**
   * Wipe all data (identity + contacts)
   */
  wipeAll: async () => {
    const database = await getDB();

    const tx = database.transaction(['identity', 'contacts'], 'readwrite');
    await tx.objectStore('identity').clear();
    await tx.objectStore('contacts').clear();
    await tx.done;

    storageKey?.fill(0);
    storageKey = null;

    set({
      state: 'none',
      identity: null,
      fingerprint: null,
      contacts: [],
      mnemonic: null,
      error: null,
    });
  },
}));
