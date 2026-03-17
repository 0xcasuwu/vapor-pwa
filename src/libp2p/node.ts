/**
 * node.ts
 * Vapor PWA - libp2p Node Initialization
 *
 * Creates and manages the libp2p node for peer-to-peer connectivity.
 * Uses Circuit Relay v2 for browser-to-browser WebRTC signaling.
 *
 * The node connects to public bootstrap/relay infrastructure.
 * If public relays are down, reconnection is unavailable.
 */

import { createLibp2p } from 'libp2p';
import type { Libp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';
import { webSockets } from '@libp2p/websockets';
import { all } from '@libp2p/websockets/filters';
import { createFromPrivKey } from '@libp2p/peer-id-factory';
import type { PeerId } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';
import {
  BOOTSTRAP_PEERS,
  TIMEOUTS,
  RETRY_CONFIG,
  PROTOCOLS,
} from './config';
import { deriveEd25519KeyFromMnemonic, type Ed25519Keys } from './keys';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected_to_relay'
  | 'listening'
  | 'error';

export interface VaporNode {
  node: Libp2p;
  peerId: PeerId;
  status: ConnectionStatus;
  relayAddrs: string[];
}

// Singleton instance
let vaporNode: VaporNode | null = null;

/**
 * Initialize the libp2p node
 * Derives Ed25519 peer ID from mnemonic for deterministic identity
 */
export async function initializeNode(mnemonic: string): Promise<VaporNode> {
  if (vaporNode) {
    console.log('[libp2p] Node already initialized');
    return vaporNode;
  }

  console.log('[libp2p] Initializing node...');

  // Derive Ed25519 keys from mnemonic
  const ed25519Keys = await deriveEd25519KeyFromMnemonic(mnemonic);

  // Create peer ID from Ed25519 private key
  const peerId = await createPeerIdFromEd25519(ed25519Keys);
  console.log('[libp2p] Peer ID:', peerId.toString());

  // Create libp2p node
  const node = await createLibp2p({
    peerId,
    addresses: {
      listen: [
        // Listen via circuit relay (browsers can't bind to ports)
        '/p2p-circuit',
      ],
    },
    transports: [
      // WebRTC for direct browser-to-browser connections
      webRTC(),
      // Circuit Relay for signaling and fallback
      circuitRelayTransport({
        discoverRelays: 1, // Discover relay peers
      }),
      // WebSockets for connecting to bootstrap/relay nodes
      webSockets({
        filter: all, // Allow all WebSocket connections including insecure for local dev
      }),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
    },
    peerDiscovery: [
      bootstrap({
        list: BOOTSTRAP_PEERS,
        timeout: TIMEOUTS.BOOTSTRAP_CONNECT,
      }),
    ],
    connectionManager: {
      minConnections: 1,
      maxConnections: 10,
    },
  });

  vaporNode = {
    node,
    peerId,
    status: 'disconnected',
    relayAddrs: [],
  };

  // Set up event handlers
  setupEventHandlers(node);

  return vaporNode;
}

/**
 * Start the node and connect to relays
 */
export async function startNode(): Promise<void> {
  if (!vaporNode) {
    throw new Error('Node not initialized. Call initializeNode first.');
  }

  if (vaporNode.status !== 'disconnected') {
    console.log('[libp2p] Node already started');
    return;
  }

  console.log('[libp2p] Starting node...');
  vaporNode.status = 'connecting';

  try {
    await vaporNode.node.start();
    console.log('[libp2p] Node started');

    // Wait for relay connection
    await waitForRelayConnection();

    vaporNode.status = 'listening';
    vaporNode.relayAddrs = getRelayAddresses();
    console.log('[libp2p] Listening on relay addresses:', vaporNode.relayAddrs);
  } catch (error) {
    console.error('[libp2p] Failed to start node:', error);
    vaporNode.status = 'error';
    throw error;
  }
}

/**
 * Stop the node
 */
export async function stopNode(): Promise<void> {
  if (!vaporNode) {
    return;
  }

  console.log('[libp2p] Stopping node...');
  await vaporNode.node.stop();
  vaporNode.status = 'disconnected';
  vaporNode.relayAddrs = [];
  console.log('[libp2p] Node stopped');
}

/**
 * Get the current node instance
 */
export function getNode(): VaporNode | null {
  return vaporNode;
}

/**
 * Get the peer ID string (for sharing with contacts)
 */
export function getPeerIdString(): string | null {
  return vaporNode?.peerId.toString() ?? null;
}

/**
 * Get relay addresses for this peer (for contacts to dial)
 */
export function getRelayAddresses(): string[] {
  if (!vaporNode) {
    return [];
  }

  return vaporNode.node.getMultiaddrs()
    .filter(addr => addr.toString().includes('/p2p-circuit/'))
    .map(addr => addr.toString());
}

/**
 * Dial a peer by their peer ID through relay
 */
export async function dialPeer(
  peerIdString: string,
  relayAddr?: string
): Promise<void> {
  if (!vaporNode) {
    throw new Error('Node not initialized');
  }

  console.log('[libp2p] Dialing peer:', peerIdString);

  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts < RETRY_CONFIG.MAX_DIAL_ATTEMPTS) {
    try {
      // If we have a known relay address for the peer, use it
      if (relayAddr) {
        const addr = multiaddr(relayAddr);
        await vaporNode.node.dial(addr, {
          signal: AbortSignal.timeout(TIMEOUTS.PEER_DIAL),
        });
      } else {
        // Try to dial via peer ID (requires DHT or prior connection)
        const addr = multiaddr(`/p2p/${peerIdString}`);
        await vaporNode.node.dial(addr, {
          signal: AbortSignal.timeout(TIMEOUTS.PEER_DIAL),
        });
      }

      console.log('[libp2p] Connected to peer:', peerIdString);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempts++;
      console.warn(`[libp2p] Dial attempt ${attempts} failed:`, lastError.message);

      if (attempts < RETRY_CONFIG.MAX_DIAL_ATTEMPTS) {
        await sleep(RETRY_CONFIG.RETRY_DELAY);
      }
    }
  }

  throw new Error(`Failed to dial peer after ${attempts} attempts: ${lastError?.message}`);
}

/**
 * Open a signaling stream to a connected peer
 */
export async function openSignalingStream(peerIdString: string) {
  if (!vaporNode) {
    throw new Error('Node not initialized');
  }

  const connections = vaporNode.node.getConnections();
  const connection = connections.find(
    conn => conn.remotePeer.toString() === peerIdString
  );

  if (!connection) {
    throw new Error('Not connected to peer');
  }

  const stream = await connection.newStream(PROTOCOLS.SIGNALING, {
    signal: AbortSignal.timeout(TIMEOUTS.SIGNALING_HANDSHAKE),
  });

  return stream;
}

/**
 * Register a handler for incoming signaling streams
 */
export function handleSignalingStreams(
  handler: (stream: any, peerId: string) => Promise<void>
): void {
  if (!vaporNode) {
    throw new Error('Node not initialized');
  }

  vaporNode.node.handle(PROTOCOLS.SIGNALING, async ({ stream, connection }) => {
    const peerId = connection.remotePeer.toString();
    console.log('[libp2p] Incoming signaling stream from:', peerId);
    await handler(stream, peerId);
  });
}

// Internal helpers

async function createPeerIdFromEd25519(keys: Ed25519Keys): Promise<PeerId> {
  // Import the key using @libp2p/crypto
  const { unmarshalPrivateKey } = await import('@libp2p/crypto/keys');

  // Ed25519 private key format for libp2p: type byte (0x08 for Ed25519) + length + key bytes
  // However, libp2p expects the full 64-byte Ed25519 key (seed + public)
  const fullKey = new Uint8Array(64);
  fullKey.set(keys.privateKey, 0);
  fullKey.set(keys.publicKey, 32);

  // Create protobuf-encoded key
  const keyType = 1; // Ed25519
  const keyData = fullKey;

  // Simple protobuf encoding for libp2p PrivateKey
  // Field 1 (type): varint
  // Field 2 (data): length-delimited bytes
  const encoded = new Uint8Array(2 + 1 + keyData.length);
  encoded[0] = 0x08; // Field 1, type varint
  encoded[1] = keyType;
  encoded[2] = 0x12; // Field 2, type length-delimited
  // This is simplified - for proper implementation use protobuf library

  try {
    const privateKey = await unmarshalPrivateKey(encoded);
    return createFromPrivKey(privateKey);
  } catch {
    // Fallback: use the peer-id-factory directly with raw bytes
    const { generateKeyPairFromSeed } = await import('@libp2p/crypto/keys');
    const keyPair = await generateKeyPairFromSeed('Ed25519', keys.privateKey);
    return createFromPrivKey(keyPair);
  }
}

function setupEventHandlers(node: Libp2p): void {
  node.addEventListener('peer:connect', (event) => {
    console.log('[libp2p] Peer connected:', event.detail.toString());
  });

  node.addEventListener('peer:disconnect', (event) => {
    console.log('[libp2p] Peer disconnected:', event.detail.toString());
  });

  node.addEventListener('self:peer:update', () => {
    if (vaporNode) {
      vaporNode.relayAddrs = getRelayAddresses();
      console.log('[libp2p] Addresses updated:', vaporNode.relayAddrs);
    }
  });
}

async function waitForRelayConnection(): Promise<void> {
  if (!vaporNode) {
    throw new Error('Node not initialized');
  }

  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUTS.RELAY_RESERVATION) {
    const addrs = getRelayAddresses();
    if (addrs.length > 0) {
      return;
    }
    await sleep(500);
  }

  console.warn('[libp2p] No relay addresses obtained within timeout');
  // Don't throw - the node may still work for dialing
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
