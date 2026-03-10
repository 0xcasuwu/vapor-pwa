/**
 * sessionStore.ts
 * Vapor PWA - Session State Management
 *
 * Uses Zustand for lightweight, reactive state management.
 * Handles the full session lifecycle:
 * - Key pair generation
 * - QR payload management
 * - Key exchange (hybrid X25519 + ML-KEM-768)
 * - Message encryption/decryption
 * - Session destruction
 */

import { create } from 'zustand';
import type { HybridKeyPairData } from '../crypto/HybridKeyPair';
import {
  generateHybridKeyPair,
  deriveSharedSecretAsInitiator,
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
import { encrypt, decrypt, destroyKey } from '../crypto/Encryption';
import type { ConnectionState } from '../crypto/WebRTCChannel';
import { WebRTCChannel } from '../crypto/WebRTCChannel';

export interface Message {
  id: string;
  content: string;
  sender: 'self' | 'peer';
  timestamp: number;
}

export type SessionState =
  | 'idle'           // No session
  | 'generating'     // Generating QR code
  | 'waiting'        // Showing QR, waiting for scan
  | 'scanning'       // Scanning peer's QR
  | 'connecting'     // WebRTC connecting
  | 'active'         // Session established
  | 'error';         // Error state

interface SessionStore {
  // State
  state: SessionState;
  error: string | null;
  messages: Message[];
  qrPayload: HybridQRPayload | null;
  qrString: string | null;
  qrExpirySeconds: number;
  connectionState: ConnectionState;
  isQuantumSecure: boolean;

  // Internal (not exposed directly)
  _keyPair: HybridKeyPairData | null;
  _sessionKey: Uint8Array | null;
  _webrtc: WebRTCChannel | null;
  _consumedNonces: Set<string>;

  // Actions
  generateQR: () => Promise<void>;
  scanQR: (qrString: string) => Promise<{ offer: string } | null>;
  completeSession: (answerJson: string) => Promise<void>;
  sendMessage: (content: string) => Promise<boolean>;
  destroySession: () => void;
  updateQRExpiry: () => void;

  // WebRTC signaling
  getWebRTCOffer: () => Promise<string | null>;
  handleWebRTCAnswer: (answerJson: string) => Promise<void>;
  handleICECandidate: (candidateJson: string) => Promise<void>;

  // Internal methods (exposed for WebRTC callbacks)
  _handleIncomingMessage: (data: Uint8Array) => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Initial state
  state: 'idle',
  error: null,
  messages: [],
  qrPayload: null,
  qrString: null,
  qrExpirySeconds: 60,
  connectionState: 'disconnected',
  isQuantumSecure: false,

  _keyPair: null,
  _sessionKey: null,
  _webrtc: null,
  _consumedNonces: new Set(),

  /**
   * Generate a new QR code for session initiation
   */
  generateQR: async () => {
    set({ state: 'generating', error: null });

    try {
      // Generate hybrid key pair
      const keyPair = await generateHybridKeyPair();

      // Generate QR payload
      const payload = generateQRPayload(keyPair.publicKey);

      // Encode for QR display (full hybrid payload with quantum-resistant keys)
      const qrString = encodeToCompressedBase64(payload);

      set({
        state: 'waiting',
        _keyPair: keyPair,
        qrPayload: payload,
        qrString,
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
   * Process a scanned QR code and initiate key exchange
   * Returns WebRTC offer if successful
   */
  scanQR: async (qrString: string) => {
    set({ state: 'scanning', error: null });

    try {
      // Try compressed first, then uncompressed
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

      // Generate our key pair
      const ourKeyPair = await generateHybridKeyPair();

      let sessionKey: Uint8Array;

      if (isHybrid(payload)) {
        // Hybrid (post-quantum) mode
        const result = await deriveSharedSecretAsInitiator(
          ourKeyPair.privateKey,
          { classical: payload.classicalPublicKey, pq: payload.pqPublicKey }
        );
        sessionKey = result.sharedSecret;

        // Store ciphertext for response
        // (In full implementation, this would be sent via signaling)
        set({ isQuantumSecure: true });
      } else {
        // Legacy mode - just use classical ECDH
        // Note: This path should rarely be used in PWA-to-PWA communication
        throw new Error('Legacy mode not fully supported in PWA');
      }

      // Mark nonce as consumed
      get()._consumedNonces.add(nonceHex);

      // Initialize WebRTC
      const webrtc = new WebRTCChannel({
        onMessage: (data) => {
          // Decrypt and add to messages
          get()._handleIncomingMessage(data);
        },
        onStateChange: (state) => {
          set({ connectionState: state });
          if (state === 'connected') {
            set({ state: 'active' });
          } else if (state === 'failed') {
            set({ state: 'error', error: 'Connection failed' });
          }
        },
        onSignalingData: () => {
          // ICE candidates are handled via the signaling channel
        },
      });

      const offer = await webrtc.initAsInitiator();

      set({
        state: 'connecting',
        _keyPair: ourKeyPair,
        _sessionKey: sessionKey,
        _webrtc: webrtc,
      });

      return { offer };
    } catch (error) {
      set({
        state: 'error',
        error: error instanceof Error ? error.message : 'Failed to process QR',
      });
      return null;
    }
  },

  /**
   * Complete session after receiving WebRTC answer
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
      error: null,
      messages: [],
      qrPayload: null,
      qrString: null,
      qrExpirySeconds: 60,
      connectionState: 'disconnected',
      isQuantumSecure: false,
      _keyPair: null,
      _sessionKey: null,
      _webrtc: null,
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
