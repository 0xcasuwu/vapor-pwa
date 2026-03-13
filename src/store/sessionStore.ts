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
import { getCombinedPublicKey } from '../crypto/HybridKeyPair';

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
  | 'error';                // Error state

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

      // Generate QR payload
      const payload = generateQRPayload(keyPair.publicKey);

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

      // Store peer's (Alice's) public keys for safety number generation
      const peerPublicKeys = getCombinedPublicKey({
        classical: payload.classicalPublicKey,
        pq: payload.pqPublicKey,
      });

      // Initialize WebRTC as initiator (Bob creates the offer)
      const webrtc = new WebRTCChannel({
        onMessage: (data) => {
          get()._handleIncomingMessage(data);
        },
        onStateChange: async (state) => {
          set({ connectionState: state });
          if (state === 'connected') {
            // Generate safety number when connected
            const { _keyPair, _peerPublicKeys } = get();
            if (_keyPair && _peerPublicKeys) {
              const localKeys = getCombinedPublicKey(_keyPair.publicKey);
              const safetyNumber = await generateSafetyNumber(localKeys, _peerPublicKeys);
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

      // Store Bob's public keys for safety number (classical only from signaling offer)
      // Note: Bob's full PQ key was used for encapsulation but we only have classical here
      // We'll use the classical key + KEM ciphertext as a proxy for Bob's identity
      const peerPublicKeys = new Uint8Array([...payload.classicalPublicKey, ...payload.kemCiphertext.slice(0, 32)]);

      // Initialize WebRTC as responder
      const webrtc = new WebRTCChannel({
        onMessage: (data) => {
          get()._handleIncomingMessage(data);
        },
        onStateChange: async (state) => {
          set({ connectionState: state });
          if (state === 'connected') {
            // Generate safety number when connected
            const { _keyPair, _peerPublicKeys } = get();
            if (_keyPair && _peerPublicKeys) {
              const localKeys = getCombinedPublicKey(_keyPair.publicKey);
              const safetyNumber = await generateSafetyNumber(localKeys, _peerPublicKeys);
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
