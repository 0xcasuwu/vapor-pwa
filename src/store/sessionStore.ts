/**
 * sessionStore.ts
 * Vapor PWA - Session State Management
 *
 * Uses Zustand for lightweight, reactive state management.
 * Handles the full session lifecycle:
 * - Key pair generation
 * - QR payload management
 * - Key exchange (hybrid X25519 + ML-KEM-768)
 * - Two-way QR signaling for WebRTC
 * - Message encryption/decryption
 * - Session destruction
 *
 * Two-Way QR Flow:
 * 1. Alice generates initial QR (public keys)
 * 2. Bob scans, creates offer QR (WebRTC offer + KEM ciphertext)
 * 3. Alice scans offer QR, creates answer QR (WebRTC answer)
 * 4. Bob scans answer QR, connection established
 */

import { create } from 'zustand';
import type { HybridKeyPairData } from '../crypto/HybridKeyPair';
import {
  generateHybridKeyPair,
  deriveSharedSecretAsInitiator,
  deriveSharedSecretAsResponder,
  destroyKeyPair,
} from '../crypto/HybridKeyPair';
import type { HybridQRPayload } from '../crypto/HybridQRPayload';
import {
  generateQRPayload,
  encodeToCompressedBase64,
  decodeFromCompressedBase64,
  decodeFromBase64,
  isExpired,
  isValid,
  isHybrid,
  getRemainingSeconds,
} from '../crypto/HybridQRPayload';
import {
  createSignalingOffer,
  createSignalingAnswer,
  encodeSignalingPayload,
  decodeSignalingPayload,
  isSignalingPayload,
  isValidSignalingPayload,
  isSignalingExpired,
  SIGNALING_TYPE,
} from '../crypto/SignalingPayload';
import type { SignalingOffer, SignalingAnswer } from '../crypto/SignalingPayload';
import { encrypt, decrypt, destroyKey } from '../crypto/Encryption';
import type { ConnectionState, IceDiagnostics } from '../crypto/WebRTCChannel';
import { WebRTCChannel } from '../crypto/WebRTCChannel';
import { generateSafetyNumber, formatSafetyNumber } from '../crypto/SafetyNumber';
// getCombinedPublicKey removed - we use only classical keys for safety numbers

// frtun overlay network imports
import { getFrtunClient, ensureFrtunConnected, TIMEOUTS } from '../frtun';

export interface Message {
  id: string;
  content: string;
  sender: 'self' | 'peer';
  timestamp: number;
}

export type SessionState =
  | 'idle'                  // No session
  | 'generating'            // Generating initial QR code
  | 'waiting'               // Showing initial QR, waiting for scan
  | 'scanning'              // Scanning peer's QR
  | 'showing_offer'         // Bob: Showing offer QR for Alice to scan
  | 'waiting_for_answer'    // Bob: Waiting to scan Alice's answer QR
  | 'showing_answer'        // Alice: Showing answer QR for Bob to scan
  | 'connecting'            // WebRTC handshake in progress
  | 'active'                // Session established
  | 'error'                 // Error state
  // Reconnection states (frtun overlay network)
  | 'reconnecting_overlay'  // Connecting to frtun relay network
  | 'reconnecting_stream'   // Opening stream to peer
  | 'reconnecting_handshake' // Exchanging session keys
  | 'reconnecting_webrtc';  // Establishing direct WebRTC

// Role in the handshake
export type HandshakeRole = 'initiator' | 'responder' | null;

interface SessionStore {
  // State
  state: SessionState;
  role: HandshakeRole;
  error: string | null;
  messages: Message[];
  qrPayload: HybridQRPayload | null;
  qrString: string | null;
  signalingQrString: string | null;  // QR string for offer/answer
  qrExpirySeconds: number;
  connectionState: ConnectionState;
  isQuantumSecure: boolean;
  safetyNumber: string | null;        // Human-readable safety number for MITM verification
  safetyNumberVerified: boolean;      // Whether user has verified the safety number
  iceDiagnostics: IceDiagnostics | null;  // ICE connection diagnostics for debugging
  reconnectionProgress: string | null;    // Human-readable reconnection status
  peerFrtunPeerId: string | null;         // Peer's frtun peer ID for reconnection

  // Internal (not exposed directly)
  _keyPair: HybridKeyPairData | null;
  _peerPublicKeys: Uint8Array | null; // Store peer's public keys for safety number
  _sessionKey: Uint8Array | null;
  _webrtc: WebRTCChannel | null;
  _consumedNonces: Set<string>;
  _pendingKemCiphertext: Uint8Array | null;  // Store ciphertext when creating offer

  // Actions
  generateQR: () => Promise<void>;
  scanQR: (qrString: string) => Promise<{ offerQr: string } | { needsAnswerScan: true } | null>;
  sendMessage: (content: string) => Promise<boolean>;
  destroySession: () => void;
  updateQRExpiry: () => void;

  // Two-way QR signaling actions
  processOfferQR: (qrString: string) => Promise<{ answerQr: string } | null>;
  processAnswerQR: (qrString: string) => Promise<boolean>;

  // Safety number verification
  verifySafetyNumber: () => void;

  // Reconnection via frtun overlay network
  initiateReconnection: (
    contactId: string,
    peerPublicKey: Uint8Array,
    frtunPeerId: string
  ) => Promise<boolean>;
  handleIncomingReconnection: (
    peerId: string,
    offer: RTCSessionDescriptionInit
  ) => Promise<RTCSessionDescriptionInit>;

  // Legacy (kept for compatibility)
  completeSession: (answerJson: string) => Promise<void>;
  getWebRTCOffer: () => Promise<string | null>;
  handleWebRTCAnswer: (answerJson: string) => Promise<void>;
  handleICECandidate: (candidateJson: string) => Promise<void>;

  // Internal methods (exposed for WebRTC callbacks)
  _handleIncomingMessage: (data: Uint8Array) => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Initial state
  state: 'idle',
  role: null,
  error: null,
  messages: [],
  qrPayload: null,
  qrString: null,
  signalingQrString: null,
  qrExpirySeconds: 60,
  connectionState: 'disconnected',
  isQuantumSecure: false,
  safetyNumber: null,
  safetyNumberVerified: false,
  iceDiagnostics: null,
  reconnectionProgress: null,
  peerFrtunPeerId: null,

  _keyPair: null,
  _peerPublicKeys: null,
  _sessionKey: null,
  _webrtc: null,
  _consumedNonces: new Set(),
  _pendingKemCiphertext: null,

  /**
   * Generate a new QR code for session initiation (Alice's role)
   * Alice shows this QR, Bob scans it
   */
  generateQR: async () => {
    set({ state: 'generating', error: null, role: 'initiator' });

    try {
      // Generate hybrid key pair
      const keyPair = await generateHybridKeyPair();

      // Get frtun peer ID for reconnection capability (if available)
      const frtunClient = getFrtunClient();
      const frtunPeerId = frtunClient.getPeerName() ?? undefined;

      // Generate QR payload (v4 if we have frtun peer ID, v2 otherwise)
      const payload = generateQRPayload(keyPair.publicKey, frtunPeerId);

      // Encode for QR display (full hybrid payload with quantum-resistant keys)
      const qrString = encodeToCompressedBase64(payload);

      set({
        state: 'waiting',
        role: 'initiator',
        _keyPair: keyPair,
        qrPayload: payload,
        qrString,
        signalingQrString: null,
        qrExpirySeconds: 60,
        isQuantumSecure: true,
      });
    } catch (error) {
      set({
        state: 'error',
        error: error instanceof Error ? error.message : 'Failed to generate QR',
      });
    }
  },

  /**
   * Process a scanned QR code - handles both initial key exchange QR and signaling QRs
   *
   * Flow depends on QR type:
   * - Initial QR (public keys): Bob scans Alice's QR → returns offer QR string
   * - Offer QR (signaling): Alice scans Bob's offer → returns { needsAnswerScan: true }
   * - Answer QR (signaling): Bob scans Alice's answer → connection completes
   */
  scanQR: async (qrString: string) => {
    set({ state: 'scanning', error: null });

    try {
      // Check if this is a signaling payload (offer or answer)
      if (isSignalingPayload(qrString)) {
        const signalingPayload = decodeSignalingPayload(qrString);

        if (!signalingPayload) {
          throw new Error('Invalid signaling QR');
        }

        if (isSignalingExpired(signalingPayload)) {
          throw new Error('Signaling QR has expired');
        }

        if (signalingPayload.type === SIGNALING_TYPE.OFFER) {
          // Alice is scanning Bob's offer QR
          const result = await get().processOfferQR(qrString);
          if (result) {
            return { needsAnswerScan: true as const };
          }
          return null;
        } else if (signalingPayload.type === SIGNALING_TYPE.ANSWER) {
          // Bob is scanning Alice's answer QR
          const success = await get().processAnswerQR(qrString);
          if (success) {
            return { needsAnswerScan: true as const };
          }
          return null;
        }
      }

      // This is an initial key exchange QR (public keys)
      const payload = decodeFromCompressedBase64(qrString) || decodeFromBase64(qrString);

      if (!payload) {
        throw new Error('Invalid QR code format');
      }

      if (!isValid(payload)) {
        throw new Error('Invalid payload structure');
      }

      if (isExpired(payload)) {
        throw new Error('QR code has expired');
      }

      // Check nonce hasn't been used (replay protection)
      const nonceHex = Array.from(payload.nonce)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (get()._consumedNonces.has(nonceHex)) {
        throw new Error('QR code already used');
      }

      // Generate our key pair (Bob's)
      const ourKeyPair = await generateHybridKeyPair();

      if (!isHybrid(payload)) {
        throw new Error('Legacy mode not supported in PWA');
      }

      // Hybrid (post-quantum) mode - Bob encapsulates
      const result = await deriveSharedSecretAsInitiator(
        ourKeyPair.privateKey,
        { classical: payload.classicalPublicKey, pq: payload.pqPublicKey }
      );

      // Mark nonce as consumed
      get()._consumedNonces.add(nonceHex);

      // Store peer's (Alice's) classical public key for safety number generation
      // We use only classical keys for safety numbers since that's what both sides have
      const peerPublicKeys = payload.classicalPublicKey;

      // Capture peer's frtun peer ID if present (v4 payload) or libp2p peer ID (v3 payload)
      const peerFrtunPeerId = payload.frtunPeerId ?? payload.libp2pPeerId ?? null;

      // Initialize WebRTC as initiator (Bob creates the offer)
      const webrtc = new WebRTCChannel({
        onMessage: (data) => {
          get()._handleIncomingMessage(data);
        },
        onStateChange: async (state) => {
          set({ connectionState: state });
          if (state === 'connected') {
            // Generate safety number when connected
            // Use only classical keys for safety numbers (both sides have these)
            const { _keyPair, _peerPublicKeys } = get();
            if (_keyPair && _peerPublicKeys) {
              const localClassicalKey = _keyPair.publicKey.classical;
              const safetyNumber = await generateSafetyNumber(localClassicalKey, _peerPublicKeys);
              set({ state: 'active', safetyNumber: formatSafetyNumber(safetyNumber) });
            } else {
              set({ state: 'active' });
            }
          } else if (state === 'failed') {
            const diagnostics = get().iceDiagnostics;
            const errorDetail = diagnostics?.errorMessage || 'Connection failed';
            set({ state: 'error', error: errorDetail });
          }
        },
        onSignalingData: () => {
          // ICE candidates handled in signaling QR
        },
        onIceDiagnostics: (diagnostics) => {
          set({ iceDiagnostics: diagnostics });
        },
      });

      // Create WebRTC offer
      const offerJson = await webrtc.initAsInitiator();
      const offerData = JSON.parse(offerJson);

      // Create signaling offer payload with KEM ciphertext and our classical public key
      const signalingOffer = createSignalingOffer(
        offerData.sdp,
        result.ciphertext,
        ourKeyPair.publicKey.classical
      );

      const offerQr = encodeSignalingPayload(signalingOffer);

      set({
        state: 'showing_offer',
        role: 'responder',
        _keyPair: ourKeyPair,
        _peerPublicKeys: peerPublicKeys,
        _sessionKey: result.sharedSecret,
        _webrtc: webrtc,
        signalingQrString: offerQr,
        isQuantumSecure: true,
        peerFrtunPeerId,  // Store peer's frtun peer ID for reconnection
      });

      return { offerQr };
    } catch (error) {
      set({
        state: 'error',
        error: error instanceof Error ? error.message : 'Failed to process QR',
      });
      return null;
    }
  },

  /**
   * Process offer QR code (Alice scanning Bob's offer)
   * Alice receives Bob's WebRTC offer + KEM ciphertext, creates answer QR
   */
  processOfferQR: async (qrString: string) => {
    const keyPair = get()._keyPair;

    if (!keyPair) {
      set({ state: 'error', error: 'Please start over - no keys found' });
      return null;
    }

    try {
      const payload = decodeSignalingPayload(qrString) as SignalingOffer;

      if (!payload) {
        throw new Error('Invalid response code');
      }

      if (payload.type !== SIGNALING_TYPE.OFFER) {
        throw new Error('Wrong code type - expected response code');
      }

      if (!isValidSignalingPayload(payload)) {
        throw new Error('Invalid response code format');
      }

      if (isSignalingExpired(payload)) {
        throw new Error('Code has expired');
      }

      // Alice decapsulates using Bob's KEM ciphertext
      const sessionKey = await deriveSharedSecretAsResponder(
        keyPair,
        payload.classicalPublicKey,
        payload.kemCiphertext
      );

      // Store Bob's classical public key for safety number generation
      // We use only classical keys for safety numbers since that's what both sides have
      const peerPublicKeys = payload.classicalPublicKey;

      // Initialize WebRTC as responder
      const webrtc = new WebRTCChannel({
        onMessage: (data) => {
          get()._handleIncomingMessage(data);
        },
        onStateChange: async (state) => {
          set({ connectionState: state });
          if (state === 'connected') {
            // Generate safety number when connected
            // Use only classical keys for safety numbers (both sides have these)
            const { _keyPair, _peerPublicKeys } = get();
            if (_keyPair && _peerPublicKeys) {
              const localClassicalKey = _keyPair.publicKey.classical;
              const safetyNumber = await generateSafetyNumber(localClassicalKey, _peerPublicKeys);
              set({ state: 'active', safetyNumber: formatSafetyNumber(safetyNumber) });
            } else {
              set({ state: 'active' });
            }
          } else if (state === 'failed') {
            const diagnostics = get().iceDiagnostics;
            const errorDetail = diagnostics?.errorMessage || 'Connection failed';
            set({ state: 'error', error: errorDetail });
          }
        },
        onSignalingData: () => {},
        onIceDiagnostics: (diagnostics) => {
          set({ iceDiagnostics: diagnostics });
        },
      });

      // Create answer from offer
      const offerJson = JSON.stringify({ type: 'offer', sdp: payload.sdp });
      const answerJson = await webrtc.initAsResponder(offerJson);
      const answerData = JSON.parse(answerJson);

      // Create signaling answer payload
      const signalingAnswer = createSignalingAnswer(answerData.sdp);
      const answerQr = encodeSignalingPayload(signalingAnswer);

      set({
        state: 'showing_answer',
        _sessionKey: sessionKey,
        _peerPublicKeys: peerPublicKeys,
        _webrtc: webrtc,
        signalingQrString: answerQr,
        isQuantumSecure: true,
      });

      return { answerQr };
    } catch (error) {
      set({
        state: 'error',
        error: error instanceof Error ? error.message : 'Failed to process offer',
      });
      return null;
    }
  },

  /**
   * Process answer QR code (Bob scanning Alice's answer)
   * Bob receives Alice's WebRTC answer, completes connection
   */
  processAnswerQR: async (qrString: string) => {
    const webrtc = get()._webrtc;

    if (!webrtc) {
      set({ state: 'error', error: 'Please start over - connection not ready' });
      return false;
    }

    try {
      const payload = decodeSignalingPayload(qrString) as SignalingAnswer;

      if (!payload) {
        throw new Error('Invalid final code');
      }

      if (payload.type !== SIGNALING_TYPE.ANSWER) {
        throw new Error('Wrong code type - expected final code');
      }

      if (isSignalingExpired(payload)) {
        throw new Error('Code has expired');
      }

      const answerJson = JSON.stringify({ type: 'answer', sdp: payload.sdp });
      await webrtc.completeConnection(answerJson);

      set({ state: 'connecting' });
      return true;
    } catch (error) {
      set({
        state: 'error',
        error: error instanceof Error ? error.message : 'Failed to complete connection',
      });
      return false;
    }
  },

  /**
   * Complete session after receiving WebRTC answer (legacy method)
   */
  completeSession: async (answerJson: string) => {
    const webrtc = get()._webrtc;
    if (!webrtc) {
      set({ state: 'error', error: 'No WebRTC connection' });
      return;
    }

    try {
      await webrtc.completeConnection(answerJson);
    } catch (error) {
      set({
        state: 'error',
        error: error instanceof Error ? error.message : 'Failed to complete connection',
      });
    }
  },

  /**
   * Send an encrypted message
   */
  sendMessage: async (content: string) => {
    const { _sessionKey: sessionKey, _webrtc: webrtc, messages } = get();

    if (!sessionKey || !webrtc) {
      return false;
    }

    try {
      // Encrypt the message
      const encrypted = await encrypt(content, sessionKey);

      // Send via WebRTC
      const sent = webrtc.send(encrypted);

      if (sent) {
        // Add to local messages
        const message: Message = {
          id: crypto.randomUUID(),
          content,
          sender: 'self',
          timestamp: Date.now(),
        };

        set({ messages: [...messages, message] });
      }

      return sent;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  },

  /**
   * Handle incoming encrypted message
   */
  _handleIncomingMessage: async (data: Uint8Array) => {
    const { _sessionKey: sessionKey, messages } = get();

    if (!sessionKey) {
      return;
    }

    try {
      // Decrypt the message
      const content = await decrypt(data, sessionKey);

      // Add to messages
      const message: Message = {
        id: crypto.randomUUID(),
        content,
        sender: 'peer',
        timestamp: Date.now(),
      };

      set({ messages: [...messages, message] });
    } catch (error) {
      console.error('Failed to decrypt message:', error);
    }
  },

  /**
   * Mark safety number as verified by user
   */
  verifySafetyNumber: () => {
    set({ safetyNumberVerified: true });
  },

  /**
   * Initiate reconnection to a contact via frtun overlay network
   * This is the zero-code reconnection flow - no QR exchange needed
   *
   * @param contactId - Contact's ID in the identity store
   * @param peerPublicKey - Contact's X25519 public key (for session key derivation)
   * @param frtunPeerId - Contact's frtun peer ID (e.g., "frtun1xxx.peer")
   */
  initiateReconnection: async (
    _contactId: string,
    peerPublicKey: Uint8Array,
    frtunPeerId: string
  ) => {
    set({
      state: 'reconnecting_overlay',
      error: null,
      reconnectionProgress: 'Connecting to overlay network...',
    });

    try {
      // Step 1: Ensure frtun client is connected
      const frtunClient = await ensureFrtunConnected();
      const client = frtunClient.getClient();

      if (!client) {
        throw new Error('frtun not initialized - please restart the app');
      }

      // Step 2: Generate our session key pair for this reconnection
      set({ reconnectionProgress: 'Generating session keys...' });
      const ourKeyPair = await generateHybridKeyPair();

      // Step 3: Open stream to peer via frtun relay
      set({
        state: 'reconnecting_stream',
        reconnectionProgress: `Opening stream to ${frtunPeerId.slice(0, 16)}...`,
      });

      const stream = await Promise.race([
        client.openTcpStream(frtunPeerId, 443),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Stream timeout')), TIMEOUTS.STREAM_OPEN)
        ),
      ]);

      // Step 4: Exchange session parameters via stream
      set({
        state: 'reconnecting_handshake',
        reconnectionProgress: 'Exchanging session parameters...',
      });

      // Send reconnection request with our classical public key
      const request = {
        type: 'reconnect',
        publicKey: Array.from(ourKeyPair.publicKey.classical),
      };
      await stream.write(new TextEncoder().encode(JSON.stringify(request)));

      // Read response with peer's SDP offer
      const responseBytes = await Promise.race([
        stream.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Handshake timeout')), TIMEOUTS.HANDSHAKE)
        ),
      ]);
      if (!responseBytes) {
        throw new Error('No response received from peer');
      }
      const response = JSON.parse(new TextDecoder().decode(responseBytes));

      if (response.type !== 'reconnect_response') {
        throw new Error('Invalid reconnection response');
      }

      // Step 5: Create WebRTC connection
      set({
        state: 'reconnecting_webrtc',
        reconnectionProgress: 'Establishing secure connection...',
      });

      const webrtc = new WebRTCChannel({
        onMessage: (data) => get()._handleIncomingMessage(data),
        onStateChange: async (state) => {
          set({ connectionState: state });
          if (state === 'connected') {
            const { _keyPair, _peerPublicKeys } = get();
            if (_keyPair && _peerPublicKeys) {
              const localClassicalKey = _keyPair.publicKey.classical;
              const safetyNumber = await generateSafetyNumber(localClassicalKey, _peerPublicKeys);
              set({
                state: 'active',
                safetyNumber: formatSafetyNumber(safetyNumber),
                reconnectionProgress: null,
              });
            } else {
              set({ state: 'active', reconnectionProgress: null });
            }
          } else if (state === 'failed') {
            set({
              state: 'error',
              error: 'WebRTC connection failed',
              reconnectionProgress: null,
            });
          }
        },
        onSignalingData: () => {},
        onIceDiagnostics: (diagnostics) => set({ iceDiagnostics: diagnostics }),
      });

      // Create WebRTC offer
      const offerJson = await webrtc.initAsInitiator();
      const offerData = JSON.parse(offerJson);

      // Send SDP offer via stream
      await stream.write(new TextEncoder().encode(JSON.stringify({
        type: 'sdp_offer',
        sdp: offerData.sdp,
      })));

      // Receive SDP answer
      const answerBytes = await stream.read();
      if (!answerBytes) {
        throw new Error('No SDP answer received');
      }
      const answerData = JSON.parse(new TextDecoder().decode(answerBytes));

      if (answerData.type !== 'sdp_answer') {
        throw new Error('Invalid SDP answer');
      }

      // Complete WebRTC connection with answer
      const answerJson = JSON.stringify({ type: 'answer', sdp: answerData.sdp });
      await webrtc.completeConnection(answerJson);

      // Derive session key using hybrid key exchange
      // For reconnection, we use our new keys + stored peer's public key
      const result = await deriveSharedSecretAsInitiator(
        ourKeyPair.privateKey,
        { classical: peerPublicKey, pq: new Uint8Array(0) } // Classical-only for reconnection
      );

      set({
        _keyPair: ourKeyPair,
        _peerPublicKeys: peerPublicKey,
        _sessionKey: result.sharedSecret,
        _webrtc: webrtc,
        isQuantumSecure: false, // Reconnection uses classical keys only
      });

      // Close the frtun stream (WebRTC takes over)
      stream.close();

      return true;
    } catch (error) {
      console.error('[reconnection] Failed:', error);
      set({
        state: 'error',
        error: error instanceof Error ? error.message : 'Reconnection failed',
        reconnectionProgress: null,
      });
      return false;
    }
  },

  /**
   * Handle incoming reconnection request (when someone connects via frtun stream)
   * This is called when we receive a reconnection request via frtun stream handler
   *
   * @param peerId - The frtun peer ID of the caller
   * @param offer - The SDP offer from the caller
   * @returns The SDP answer to send back
   */
  handleIncomingReconnection: async (
    peerId: string,
    offer: RTCSessionDescriptionInit
  ) => {
    set({
      state: 'reconnecting_handshake',
      reconnectionProgress: `Incoming connection from ${peerId.slice(0, 16)}...`,
    });

    try {
      // Generate our session key pair
      const ourKeyPair = await generateHybridKeyPair();

      // Create WebRTC connection as responder
      const webrtc = new WebRTCChannel({
        onMessage: (data) => get()._handleIncomingMessage(data),
        onStateChange: async (state) => {
          set({ connectionState: state });
          if (state === 'connected') {
            set({
              state: 'active',
              reconnectionProgress: null,
            });
          } else if (state === 'failed') {
            set({
              state: 'error',
              error: 'WebRTC connection failed',
              reconnectionProgress: null,
            });
          }
        },
        onSignalingData: () => {},
        onIceDiagnostics: (diagnostics) => set({ iceDiagnostics: diagnostics }),
      });

      // Create answer from offer
      const offerJson = JSON.stringify(offer);
      const answerJson = await webrtc.initAsResponder(offerJson);
      const answerData = JSON.parse(answerJson);

      set({
        _keyPair: ourKeyPair,
        _webrtc: webrtc,
        state: 'reconnecting_webrtc',
        reconnectionProgress: 'Establishing secure connection...',
      });

      return { type: 'answer' as const, sdp: answerData.sdp };
    } catch (error) {
      console.error('[reconnection] Failed to handle incoming:', error);
      throw error;
    }
  },

  /**
   * Destroy the session and all cryptographic material
   */
  destroySession: () => {
    const { _keyPair, _sessionKey, _webrtc } = get();

    // Close WebRTC
    if (_webrtc) {
      _webrtc.close();
    }

    // Destroy key pair
    if (_keyPair) {
      destroyKeyPair(_keyPair);
    }

    // Destroy session key
    if (_sessionKey) {
      destroyKey(_sessionKey);
    }

    // Reset state
    set({
      state: 'idle',
      role: null,
      error: null,
      messages: [],
      qrPayload: null,
      qrString: null,
      signalingQrString: null,
      qrExpirySeconds: 60,
      connectionState: 'disconnected',
      isQuantumSecure: false,
      safetyNumber: null,
      safetyNumberVerified: false,
      iceDiagnostics: null,
      reconnectionProgress: null,
      peerFrtunPeerId: null,
      _keyPair: null,
      _peerPublicKeys: null,
      _sessionKey: null,
      _webrtc: null,
      _pendingKemCiphertext: null,
    });
  },

  /**
   * Update QR expiry countdown
   */
  updateQRExpiry: () => {
    const { qrPayload } = get();
    if (qrPayload) {
      const remaining = getRemainingSeconds(qrPayload);
      set({ qrExpirySeconds: remaining });

      if (remaining <= 0) {
        // QR expired, regenerate
        get().generateQR();
      }
    }
  },

  /**
   * Get WebRTC offer for signaling
   */
  getWebRTCOffer: async () => {
    const webrtc = get()._webrtc;
    if (!webrtc) return null;

    try {
      return await webrtc.initAsInitiator();
    } catch {
      return null;
    }
  },

  /**
   * Handle WebRTC answer from peer
   */
  handleWebRTCAnswer: async (answerJson: string) => {
    const webrtc = get()._webrtc;
    if (!webrtc) return;

    await webrtc.completeConnection(answerJson);
  },

  /**
   * Handle ICE candidate from peer
   */
  handleICECandidate: async (candidateJson: string) => {
    const webrtc = get()._webrtc;
    if (!webrtc) return;

    await webrtc.addIceCandidate(candidateJson);
  },
}));
