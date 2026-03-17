/**
 * config.ts
 * Vapor PWA - libp2p Configuration
 *
 * Bootstrap peers and relay configuration for Circuit Relay v2.
 * Uses public libp2p/IPFS infrastructure only - no self-hosted relays.
 *
 * If public relays are down, Vapor reconnection is down.
 * This is an intentional design choice: we depend on decentralized infrastructure.
 */

/**
 * Public libp2p bootstrap peers
 * These are maintained by Protocol Labs and the IPFS community
 */
export const BOOTSTRAP_PEERS = [
  // Protocol Labs bootstrap nodes (DNS-based for reliability)
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',

  // Pinata bootstrap nodes
  '/dnsaddr/bootstrap.pinata.cloud/p2p/QmPCdVjpG59FkzAZkx8oJVCbNQ7RBpjVBaC9MFe4bScCgq',

  // Additional public nodes (WebSocket-enabled for browser compatibility)
  '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
  '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
];

/**
 * Known relay peers that support Circuit Relay v2
 * These will be tried first for faster connection establishment
 */
export const RELAY_PEERS = [
  // Public relay nodes - these support Circuit Relay v2
  // Note: Availability varies, the node will try multiple
];

/**
 * Connection timeout configurations
 */
export const TIMEOUTS = {
  /** Time to wait for bootstrap connection */
  BOOTSTRAP_CONNECT: 30_000,

  /** Time to wait for relay reservation */
  RELAY_RESERVATION: 15_000,

  /** Time to wait for peer dial via relay */
  PEER_DIAL: 30_000,

  /** Time to wait for signaling handshake */
  SIGNALING_HANDSHAKE: 20_000,

  /** Time to wait for WebRTC connection after signaling */
  WEBRTC_CONNECT: 15_000,
};

/**
 * Reconnection retry configuration
 */
export const RETRY_CONFIG = {
  /** Maximum number of relay connection attempts */
  MAX_RELAY_ATTEMPTS: 3,

  /** Delay between retry attempts (ms) */
  RETRY_DELAY: 2_000,

  /** Maximum number of peer dial attempts */
  MAX_DIAL_ATTEMPTS: 3,
};

/**
 * Vapor-specific protocol identifiers
 */
export const PROTOCOLS = {
  /** Protocol for SDP signaling exchange */
  SIGNALING: '/vapor/signaling/1.0.0',

  /** Protocol for presence announcements */
  PRESENCE: '/vapor/presence/1.0.0',
};

/**
 * HKDF domain separators for key derivation
 */
export const KEY_DOMAINS = {
  /** Domain for Ed25519 libp2p identity derivation */
  LIBP2P_IDENTITY: 'vapor-libp2p-identity-v1',

  /** Domain for X25519 Vapor identity (existing) */
  VAPOR_IDENTITY: 'vapor-identity-v1',
};
