/**
 * IndexedDB persistence layer for frtun session state.
 *
 * Stores identity keypairs, session tokens, known peer caches, and DNS
 * bogon allocations so they survive page reloads and browser restarts.
 *
 * The data is stored in a single IndexedDB database (`frtun-session`) with
 * a single object store (`state`) using a fixed key (`session`).
 */

import type { SessionData } from '../types';

/** IndexedDB database name. */
const DB_NAME = 'frtun-session';
/** IndexedDB database version. */
const DB_VERSION = 1;
/** Object store name. */
const STORE_NAME = 'state';
/** Fixed key for the session record. */
const SESSION_KEY = 'session';

export class SessionStore {
  private db: IDBDatabase | null = null;

  /**
   * Open (or create) the IndexedDB database.
   *
   * This must be called before any other methods. It is safe to call
   * multiple times; subsequent calls are no-ops if the database is
   * already open.
   *
   * @throws If IndexedDB is not available or the database cannot be opened.
   */
  async open(): Promise<void> {
    if (this.db) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;

        // Handle unexpected close (e.g. browser clearing storage).
        this.db.onclose = () => {
          this.db = null;
        };

        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message ?? 'unknown'}`));
      };
    });
  }

  /**
   * Load the persisted session data.
   *
   * @returns The stored session data, or `null` if no session has been saved.
   */
  async load(): Promise<SessionData | null> {
    this.assertOpen();

    return new Promise<SessionData | null>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(SESSION_KEY);

      request.onsuccess = () => {
        resolve(request.result as SessionData | null ?? null);
      };
      request.onerror = () => {
        reject(new Error(`Failed to load session: ${request.error?.message ?? 'unknown'}`));
      };
    });
  }

  /**
   * Save session data to IndexedDB.
   *
   * Overwrites any previously stored session.
   *
   * @param data - The session data to persist.
   */
  async save(data: SessionData): Promise<void> {
    this.assertOpen();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, SESSION_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new Error(`Failed to save session: ${request.error?.message ?? 'unknown'}`));
      };
    });
  }

  /**
   * Update only the DNS cache within the stored session.
   *
   * If no session exists yet, this is a no-op.
   *
   * @param dnsCache - The DNS cache mapping (peer name -> bogon IP).
   */
  async updateDnsCache(dnsCache: Record<string, string>): Promise<void> {
    const existing = await this.load();
    if (existing) {
      existing.dnsCache = dnsCache;
      await this.save(existing);
    }
  }

  /**
   * Update the last-connected server and timestamp.
   *
   * If no session exists yet, this is a no-op.
   *
   * @param server - The relay server address.
   * @param timestamp - The connection timestamp (ms since epoch).
   */
  async updateLastConnected(server: string, timestamp: number): Promise<void> {
    const existing = await this.load();
    if (existing) {
      existing.lastServer = server;
      existing.lastConnected = timestamp;
      await this.save(existing);
    }
  }

  /**
   * Update the known peers cache.
   *
   * @param knownPeers - Mapping of peer name to endpoint address.
   */
  async updateKnownPeers(knownPeers: Record<string, string>): Promise<void> {
    const existing = await this.load();
    if (existing) {
      existing.knownPeers = knownPeers;
      await this.save(existing);
    }
  }

  /**
   * Delete all stored session data.
   */
  async clear(): Promise<void> {
    this.assertOpen();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(SESSION_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new Error(`Failed to clear session: ${request.error?.message ?? 'unknown'}`));
      };
    });
  }

  /**
   * Close the IndexedDB connection.
   *
   * After calling this, `open()` must be called again before any other
   * operations.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /** Whether the database is currently open. */
  get isOpen(): boolean {
    return this.db !== null;
  }

  /** Throw if the database is not open. */
  private assertOpen(): void {
    if (!this.db) {
      throw new Error('SessionStore is not open; call open() first');
    }
  }
}
