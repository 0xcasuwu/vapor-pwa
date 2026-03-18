/**
 * client.ts
 * Vapor PWA - frtun Client Singleton
 *
 * Provides a singleton wrapper around FrtunClient for Vapor PWA.
 * Handles connection lifecycle, relay failover, and identity binding.
 */

import { FrtunClient } from './sdk/client';
import type { ConnectionState } from './sdk/types';
import { createFrtunConfig, nextRelayIndex, RELAY_SERVERS, TIMEOUTS } from './config';
import type { FrtunIdentity } from './keys';

/**
 * Vapor frtun client state.
 */
export type VaporFrtunState =
  | 'uninitialized'
  | 'initializing'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Event handlers for the Vapor frtun client.
 */
export interface VaporFrtunEvents {
  /** Connection state changed */
  stateChange: (state: VaporFrtunState) => void;
  /** An error occurred */
  error: (error: Error) => void;
  /** Successfully connected to relay */
  connected: () => void;
  /** Disconnected from relay */
  disconnected: () => void;
}

/**
 * Singleton frtun client instance.
 */
let instance: VaporFrtunClient | null = null;

/**
 * VaporFrtunClient wraps the frtun SDK client with Vapor-specific
 * functionality like relay failover and identity management.
 */
export class VaporFrtunClient {
  private client: FrtunClient | null = null;
  private identity: FrtunIdentity | null = null;
  private state: VaporFrtunState = 'uninitialized';
  private currentRelayIndex = 0;
  private listeners: Map<keyof VaporFrtunEvents, Set<VaporFrtunEvents[keyof VaporFrtunEvents]>> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): VaporFrtunClient {
    if (!instance) {
      instance = new VaporFrtunClient();
    }
    return instance;
  }

  /**
   * Initialize the client with an frtun identity.
   *
   * @param identity - The frtun identity derived from mnemonic
   */
  async initialize(identity: FrtunIdentity): Promise<void> {
    if (this.state !== 'uninitialized' && this.state !== 'error') {
      console.warn('[frtun] Client already initialized');
      return;
    }

    this.setState('initializing');
    this.identity = identity;

    try {
      const config = createFrtunConfig(this.currentRelayIndex);
      this.client = await FrtunClient.create(config);

      // Bind event handlers
      this.client.on('stateChange', (sdkState: ConnectionState) => {
        this.handleSdkStateChange(sdkState);
      });

      this.client.on('error', (error: Error) => {
        this.emit('error', error);
      });

      this.setState('disconnected');
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  /**
   * Connect to the overlay network.
   *
   * Attempts to connect to the primary relay, failing over to
   * secondary relays if needed.
   */
  async connect(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    if (this.state === 'connected') {
      return;
    }

    this.setState('connecting');

    // Try each relay with failover
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RELAY_SERVERS.length; attempt++) {
      try {
        await Promise.race([
          this.client.connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), TIMEOUTS.RELAY_CONNECT)
          ),
        ]);
        this.setState('connected');
        this.emit('connected');
        return;
      } catch (err) {
        lastError = err as Error;
        console.warn(
          `[frtun] Relay ${RELAY_SERVERS[this.currentRelayIndex].server} failed:`,
          err
        );

        // Try next relay
        this.currentRelayIndex = nextRelayIndex(this.currentRelayIndex);
        const config = createFrtunConfig(this.currentRelayIndex);
        this.client = await FrtunClient.create(config);
      }
    }

    this.setState('error');
    throw lastError || new Error('All relays failed');
  }

  /**
   * Disconnect from the overlay network.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
    }
    this.setState('disconnected');
    this.emit('disconnected');
  }

  /**
   * Get the underlying FrtunClient for advanced operations.
   */
  getClient(): FrtunClient | null {
    return this.client;
  }

  /**
   * Get the current frtun peer name.
   */
  getPeerName(): string | null {
    return this.identity?.peerName ?? null;
  }

  /**
   * Get the current connection state.
   */
  getState(): VaporFrtunState {
    return this.state;
  }

  /**
   * Check if connected to the overlay network.
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Register an event listener.
   */
  on<K extends keyof VaporFrtunEvents>(event: K, handler: VaporFrtunEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /**
   * Unregister an event listener.
   */
  off<K extends keyof VaporFrtunEvents>(event: K, handler: VaporFrtunEvents[K]): void {
    this.listeners.get(event)?.delete(handler);
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static reset(): void {
    if (instance) {
      instance.client = null;
      instance.identity = null;
      instance.state = 'uninitialized';
    }
    instance = null;
  }

  private setState(newState: VaporFrtunState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', newState);
    }
  }

  private handleSdkStateChange(sdkState: ConnectionState): void {
    switch (sdkState) {
      case 'connected':
        this.setState('connected');
        break;
      case 'connecting':
        this.setState('connecting');
        break;
      case 'reconnecting':
        this.setState('reconnecting');
        break;
      case 'disconnected':
        if (this.state !== 'uninitialized') {
          this.setState('disconnected');
        }
        break;
    }
  }

  private emit<K extends keyof VaporFrtunEvents>(
    event: K,
    ...args: Parameters<VaporFrtunEvents[K]>
  ): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as (...a: Parameters<VaporFrtunEvents[K]>) => void)(...args);
        } catch (err) {
          console.error(`[frtun] Event handler error:`, err);
        }
      }
    }
  }
}

/**
 * Get the singleton frtun client instance.
 */
export function getFrtunClient(): VaporFrtunClient {
  return VaporFrtunClient.getInstance();
}

/**
 * Initialize and connect the frtun client with the given identity.
 *
 * @param identity - FrtunIdentity derived from mnemonic
 * @returns The connected client
 */
export async function initializeFrtunClient(identity: FrtunIdentity): Promise<VaporFrtunClient> {
  const client = getFrtunClient();
  await client.initialize(identity);
  return client;
}

/**
 * Ensure the frtun client is connected.
 *
 * @returns The connected client
 * @throws If not initialized or connection fails
 */
export async function ensureFrtunConnected(): Promise<VaporFrtunClient> {
  const client = getFrtunClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  return client;
}
