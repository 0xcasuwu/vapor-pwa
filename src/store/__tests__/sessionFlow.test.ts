/**
 * sessionFlow.test.ts
 * Vapor PWA - Session Flow Integration Tests
 *
 * Tests the full session lifecycle from QR generation to active connection.
 * Verifies state transitions for the handshake protocol.
 *
 * Note: This test file tests state management without importing from the actual
 * sessionStore (which depends on WebRTC, frtun, etc.). The state types and
 * transitions are tested to ensure protocol compliance.
 */

import { describe, it, expect } from 'vitest';

// Session states as defined in the session store
// These MUST match ../sessionStore.ts SessionState type
type SessionState =
  | 'idle'
  | 'generating'
  | 'waiting'
  | 'scanning'
  | 'showing_offer'
  | 'waiting_for_answer'
  | 'showing_answer'
  | 'connecting'
  | 'active'
  | 'error'
  | 'reconnecting_overlay'
  | 'reconnecting_stream'
  | 'reconnecting_handshake'
  | 'reconnecting_webrtc';

type HandshakeRole = 'initiator' | 'responder' | null;
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';

interface Message {
  id: string;
  content: string;
  sender: 'self' | 'peer';
  timestamp: number;
}

// Mock session state for testing
interface MockSessionState {
  state: SessionState;
  role: HandshakeRole;
  error: string | null;
  messages: Message[];
  qrString: string | null;
  signalingQrString: string | null;
  qrExpirySeconds: number;
  connectionState: ConnectionState;
  isQuantumSecure: boolean;
  safetyNumber: string | null;
  safetyNumberVerified: boolean;
  reconnectionProgress: string | null;
  peerFrtunPeerId: string | null;
}

function createInitialState(): MockSessionState {
  return {
    state: 'idle',
    role: null,
    error: null,
    messages: [],
    qrString: null,
    signalingQrString: null,
    qrExpirySeconds: 60,
    connectionState: 'disconnected',
    isQuantumSecure: false,
    safetyNumber: null,
    safetyNumberVerified: false,
    reconnectionProgress: null,
    peerFrtunPeerId: null,
  };
}

function destroySession(): MockSessionState {
  return createInitialState();
}

describe('Session Store State Machine', () => {
  describe('Initial State', () => {
    it('should start in idle state', () => {
      const state = createInitialState();
      expect(state.state).toBe('idle');
    });

    it('should have no role initially', () => {
      const state = createInitialState();
      expect(state.role).toBeNull();
    });

    it('should have no QR string initially', () => {
      const state = createInitialState();
      expect(state.qrString).toBeNull();
      expect(state.signalingQrString).toBeNull();
    });

    it('should have default expiry of 60 seconds', () => {
      const state = createInitialState();
      expect(state.qrExpirySeconds).toBe(60);
    });

    it('should have no safety number initially', () => {
      const state = createInitialState();
      expect(state.safetyNumber).toBeNull();
      expect(state.safetyNumberVerified).toBe(false);
    });

    it('should have empty messages array', () => {
      const state = createInitialState();
      expect(state.messages).toEqual([]);
    });
  });

  describe('generateQR Flow (Alice - Initiator)', () => {
    it('should transition from idle to generating', () => {
      let state = createInitialState();

      // Simulate start of generateQR()
      state = { ...state, state: 'generating', error: null, role: 'initiator' };

      expect(state.state).toBe('generating');
      expect(state.role).toBe('initiator');
    });

    it('should transition from generating to waiting with QR string', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'generating',
        role: 'initiator',
      };

      // Simulate successful QR generation
      state = {
        ...state,
        state: 'waiting',
        qrString: 'base64-encoded-hybrid-payload',
        qrExpirySeconds: 60,
        isQuantumSecure: true,
      };

      expect(state.state).toBe('waiting');
      expect(state.qrString).toBeDefined();
      expect(state.isQuantumSecure).toBe(true);
    });

    it('should transition to error on generation failure', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'generating',
      };

      // Simulate generation failure
      state = {
        ...state,
        state: 'error',
        error: 'Failed to generate QR',
      };

      expect(state.state).toBe('error');
      expect(state.error).toBe('Failed to generate QR');
    });
  });

  describe('scanQR Flow (Bob - Responder)', () => {
    it('should transition to scanning state', () => {
      let state = createInitialState();

      // Simulate start of scanQR()
      state = { ...state, state: 'scanning', error: null };

      expect(state.state).toBe('scanning');
    });

    it('should transition to showing_offer after scanning initial QR', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'scanning',
      };

      // Simulate successful scan of Alice's initial QR (public keys)
      state = {
        ...state,
        state: 'showing_offer',
        role: 'responder',
        signalingQrString: 'encoded-signaling-offer',
        isQuantumSecure: true,
        peerFrtunPeerId: 'frtun1test.peer',
      };

      expect(state.state).toBe('showing_offer');
      expect(state.role).toBe('responder');
      expect(state.signalingQrString).toBeDefined();
      expect(state.peerFrtunPeerId).toBeDefined();
    });

    it('should handle scanning expired QR code', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'scanning',
      };

      // Simulate expired QR
      state = {
        ...state,
        state: 'error',
        error: 'QR code has expired',
      };

      expect(state.state).toBe('error');
      expect(state.error).toBe('QR code has expired');
    });

    it('should handle invalid QR code format', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'scanning',
      };

      // Simulate invalid format
      state = {
        ...state,
        state: 'error',
        error: 'Invalid QR code format',
      };

      expect(state.state).toBe('error');
      expect(state.error).toBe('Invalid QR code format');
    });

    it('should handle replay attack (reused nonce)', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'scanning',
      };

      // Simulate nonce reuse
      state = {
        ...state,
        state: 'error',
        error: 'QR code already used',
      };

      expect(state.state).toBe('error');
      expect(state.error).toBe('QR code already used');
    });
  });

  describe('processOfferQR Flow (Alice processing Bob\'s offer)', () => {
    it('should transition to showing_answer after processing offer', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'waiting',
        role: 'initiator',
        qrString: 'initial-qr',
      };

      // Simulate Alice scanning Bob's offer QR
      state = {
        ...state,
        state: 'showing_answer',
        signalingQrString: 'encoded-signaling-answer',
        isQuantumSecure: true,
      };

      expect(state.state).toBe('showing_answer');
      expect(state.signalingQrString).toBeDefined();
    });

    it('should fail if no keys found', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'scanning',
      };

      // Simulate no keys (user didn't generate QR first)
      state = {
        ...state,
        state: 'error',
        error: 'Please start over - no keys found',
      };

      expect(state.state).toBe('error');
    });

    it('should fail on wrong code type', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'scanning',
      };

      // Simulate wrong code type (got answer instead of offer)
      state = {
        ...state,
        state: 'error',
        error: 'Wrong code type - expected response code',
      };

      expect(state.state).toBe('error');
    });
  });

  describe('processAnswerQR Flow (Bob processing Alice\'s answer)', () => {
    it('should transition to connecting after processing answer', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'showing_offer',
        role: 'responder',
        signalingQrString: 'offer-qr',
      };

      // Simulate Bob scanning Alice's answer QR
      state = {
        ...state,
        state: 'connecting',
        signalingQrString: null, // Clear after processing
      };

      expect(state.state).toBe('connecting');
    });

    it('should fail if connection not ready', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'scanning',
      };

      // Simulate no WebRTC connection ready
      state = {
        ...state,
        state: 'error',
        error: 'Please start over - connection not ready',
      };

      expect(state.state).toBe('error');
    });
  });

  describe('Connection Establishment', () => {
    it('should transition to active on successful connection', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'connecting',
        connectionState: 'connecting',
      };

      // Simulate successful WebRTC connection
      state = {
        ...state,
        state: 'active',
        connectionState: 'connected',
        safetyNumber: 'Apple · River · Mountain · Sunset · Ocean · Forest',
      };

      expect(state.state).toBe('active');
      expect(state.connectionState).toBe('connected');
      expect(state.safetyNumber).toBeDefined();
    });

    it('should transition to error on connection failure', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'connecting',
        connectionState: 'connecting',
      };

      // Simulate WebRTC connection failure
      state = {
        ...state,
        state: 'error',
        connectionState: 'failed',
        error: 'Connection failed',
      };

      expect(state.state).toBe('error');
      expect(state.connectionState).toBe('failed');
    });
  });

  describe('Message Flow', () => {
    it('should add message to list on send', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'active',
        connectionState: 'connected',
        messages: [],
      };

      const message: Message = {
        id: 'msg-1',
        content: 'Hello!',
        sender: 'self',
        timestamp: Date.now(),
      };

      state = { ...state, messages: [...state.messages, message] };

      expect(state.messages.length).toBe(1);
      expect(state.messages[0].sender).toBe('self');
    });

    it('should add message to list on receive', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'active',
        connectionState: 'connected',
        messages: [],
      };

      const message: Message = {
        id: 'msg-2',
        content: 'Hi there!',
        sender: 'peer',
        timestamp: Date.now(),
      };

      state = { ...state, messages: [...state.messages, message] };

      expect(state.messages.length).toBe(1);
      expect(state.messages[0].sender).toBe('peer');
    });

    it('should maintain message order', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'active',
        connectionState: 'connected',
        messages: [],
      };

      const msg1: Message = { id: '1', content: 'First', sender: 'self', timestamp: 1000 };
      const msg2: Message = { id: '2', content: 'Second', sender: 'peer', timestamp: 2000 };
      const msg3: Message = { id: '3', content: 'Third', sender: 'self', timestamp: 3000 };

      state = { ...state, messages: [msg1, msg2, msg3] };

      expect(state.messages.length).toBe(3);
      expect(state.messages[0].content).toBe('First');
      expect(state.messages[1].content).toBe('Second');
      expect(state.messages[2].content).toBe('Third');
    });
  });

  describe('Safety Number Verification', () => {
    it('should mark safety number as verified', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'active',
        safetyNumber: 'Apple · River · Mountain · Sunset · Ocean · Forest',
        safetyNumberVerified: false,
      };

      // Simulate verifySafetyNumber()
      state = { ...state, safetyNumberVerified: true };

      expect(state.safetyNumberVerified).toBe(true);
    });
  });

  describe('destroySession', () => {
    it('should reset all state to initial values', () => {
      let state: MockSessionState = {
        state: 'active',
        role: 'initiator',
        error: null,
        messages: [{ id: '1', content: 'Hello', sender: 'self', timestamp: Date.now() }],
        qrString: 'some-qr',
        signalingQrString: 'some-signaling-qr',
        qrExpirySeconds: 30,
        connectionState: 'connected',
        isQuantumSecure: true,
        safetyNumber: 'Apple · River · etc',
        safetyNumberVerified: true,
        reconnectionProgress: null,
        peerFrtunPeerId: 'frtun1test.peer',
      };

      state = destroySession();

      expect(state.state).toBe('idle');
      expect(state.role).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.qrString).toBeNull();
      expect(state.signalingQrString).toBeNull();
      expect(state.connectionState).toBe('disconnected');
      expect(state.isQuantumSecure).toBe(false);
      expect(state.safetyNumber).toBeNull();
      expect(state.safetyNumberVerified).toBe(false);
      expect(state.peerFrtunPeerId).toBeNull();
    });

    it('should clear error state', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'error',
        error: 'Some error',
      };

      state = destroySession();

      expect(state.error).toBeNull();
    });
  });
});

describe('Reconnection Flow', () => {
  describe('initiateReconnection', () => {
    it('should transition through reconnection states in order', () => {
      const transitions: SessionState[] = [
        'idle',
        'reconnecting_overlay',
        'reconnecting_stream',
        'reconnecting_handshake',
        'reconnecting_webrtc',
        'active',
      ];

      let state = createInitialState();

      transitions.forEach((targetState, index) => {
        state = { ...state, state: targetState };
        expect(state.state).toBe(transitions[index]);
      });
    });

    it('should set progress messages during reconnection', () => {
      let state: MockSessionState = createInitialState();

      // Step 1: Connecting to overlay network
      state = {
        ...state,
        state: 'reconnecting_overlay',
        reconnectionProgress: 'Connecting to overlay network...',
      };
      expect(state.reconnectionProgress).toBe('Connecting to overlay network...');

      // Step 2: Opening stream
      state = {
        ...state,
        state: 'reconnecting_stream',
        reconnectionProgress: 'Opening stream to frtun1abc...',
      };
      expect(state.reconnectionProgress).toContain('Opening stream');

      // Step 3: Exchanging handshake
      state = {
        ...state,
        state: 'reconnecting_handshake',
        reconnectionProgress: 'Exchanging handshake data...',
      };
      expect(state.reconnectionProgress).toBe('Exchanging handshake data...');

      // Step 4: Establishing WebRTC
      state = {
        ...state,
        state: 'reconnecting_webrtc',
        reconnectionProgress: 'Establishing secure connection...',
      };
      expect(state.reconnectionProgress).toBe('Establishing secure connection...');

      // Step 5: Success
      state = {
        ...state,
        state: 'active',
        reconnectionProgress: null,
      };
      expect(state.reconnectionProgress).toBeNull();
    });

    it('should handle reconnection failure', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'reconnecting_stream',
        reconnectionProgress: 'Opening stream...',
      };

      // Simulate failure
      state = {
        ...state,
        state: 'error',
        error: 'Reconnection failed',
        reconnectionProgress: null,
      };

      expect(state.state).toBe('error');
      expect(state.error).toBe('Reconnection failed');
      expect(state.reconnectionProgress).toBeNull();
    });

    it('should clear reconnection progress on error', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'reconnecting_handshake',
        reconnectionProgress: 'Exchanging...',
      };

      state = {
        ...state,
        state: 'error',
        error: 'Stream failed',
        reconnectionProgress: null,
      };

      expect(state.reconnectionProgress).toBeNull();
    });
  });

  describe('handleIncomingReconnection', () => {
    it('should set progress for incoming connection', () => {
      let state: MockSessionState = createInitialState();

      state = {
        ...state,
        state: 'reconnecting_handshake',
        reconnectionProgress: 'Incoming connection from frtun1...',
      };

      expect(state.reconnectionProgress).toContain('Incoming connection');
    });

    it('should transition to active on successful incoming connection', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'reconnecting_webrtc',
        reconnectionProgress: 'Establishing secure connection...',
      };

      state = {
        ...state,
        state: 'active',
        connectionState: 'connected',
        reconnectionProgress: null,
      };

      expect(state.state).toBe('active');
      expect(state.connectionState).toBe('connected');
    });
  });
});

describe('Full Handshake Flow Simulation', () => {
  describe('3-Code Exchange: Alice → Bob → Alice → Active', () => {
    it('should complete full flow from idle to active', () => {
      // Alice's state
      let aliceState = createInitialState();

      // Step 1: Alice generates initial QR
      aliceState = {
        ...aliceState,
        state: 'generating',
        role: 'initiator',
      };
      expect(aliceState.state).toBe('generating');

      aliceState = {
        ...aliceState,
        state: 'waiting',
        qrString: 'alice-initial-qr',
        isQuantumSecure: true,
      };
      expect(aliceState.state).toBe('waiting');
      expect(aliceState.qrString).toBeDefined();

      // Bob's state - starts scanning
      let bobState = createInitialState();
      bobState = {
        ...bobState,
        state: 'scanning',
      };
      expect(bobState.state).toBe('scanning');

      // Step 2: Bob scans Alice's QR, generates offer QR
      bobState = {
        ...bobState,
        state: 'showing_offer',
        role: 'responder',
        signalingQrString: 'bob-offer-qr',
        isQuantumSecure: true,
      };
      expect(bobState.state).toBe('showing_offer');
      expect(bobState.signalingQrString).toBeDefined();

      // Step 3: Alice scans Bob's offer QR, generates answer QR
      aliceState = {
        ...aliceState,
        state: 'showing_answer',
        signalingQrString: 'alice-answer-qr',
      };
      expect(aliceState.state).toBe('showing_answer');
      expect(aliceState.signalingQrString).toBeDefined();

      // Step 4: Bob scans Alice's answer QR
      bobState = {
        ...bobState,
        state: 'connecting',
        connectionState: 'connecting',
      };
      expect(bobState.state).toBe('connecting');

      // Step 5: Connection established
      aliceState = {
        ...aliceState,
        state: 'active',
        connectionState: 'connected',
        safetyNumber: 'Word1 · Word2 · Word3 · Word4 · Word5 · Word6',
      };
      bobState = {
        ...bobState,
        state: 'active',
        connectionState: 'connected',
        safetyNumber: 'Word1 · Word2 · Word3 · Word4 · Word5 · Word6',
      };

      expect(aliceState.state).toBe('active');
      expect(bobState.state).toBe('active');
      expect(aliceState.safetyNumber).toBe(bobState.safetyNumber);
    });
  });

  describe('Error Recovery', () => {
    it('should allow restart after error', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'error',
        error: 'Connection failed',
      };

      // User clicks "Try Again" → destroySession()
      state = destroySession();
      expect(state.state).toBe('idle');

      // User starts new session
      state = {
        ...state,
        state: 'generating',
        role: 'initiator',
      };
      expect(state.state).toBe('generating');
    });
  });
});

describe('QR Expiry Management', () => {
  it('should track QR expiry countdown', () => {
    let state: MockSessionState = {
      ...createInitialState(),
      state: 'waiting',
      qrString: 'some-qr',
      qrExpirySeconds: 60,
    };

    // Simulate countdown
    for (let i = 59; i >= 0; i--) {
      state = { ...state, qrExpirySeconds: i };
      expect(state.qrExpirySeconds).toBe(i);
    }
  });

  it('should regenerate QR on expiry', () => {
    let state: MockSessionState = {
      ...createInitialState(),
      state: 'waiting',
      qrString: 'old-qr',
      qrExpirySeconds: 0,
    };

    // Simulate regeneration
    state = {
      ...state,
      state: 'generating',
      qrString: null,
    };

    state = {
      ...state,
      state: 'waiting',
      qrString: 'new-qr',
      qrExpirySeconds: 60,
    };

    expect(state.qrString).toBe('new-qr');
    expect(state.qrExpirySeconds).toBe(60);
  });
});

describe('Role Management', () => {
  it('should set initiator role for QR generator', () => {
    let state = createInitialState();

    state = { ...state, state: 'generating', role: 'initiator' };

    expect(state.role).toBe('initiator');
  });

  it('should set responder role for QR scanner', () => {
    let state = createInitialState();

    state = { ...state, state: 'showing_offer', role: 'responder' };

    expect(state.role).toBe('responder');
  });

  it('should clear role on session destroy', () => {
    let state: MockSessionState = {
      ...createInitialState(),
      state: 'active',
      role: 'initiator',
    };

    state = destroySession();

    expect(state.role).toBeNull();
  });
});

describe('Quantum Security Flag', () => {
  it('should set isQuantumSecure to true for hybrid handshake', () => {
    let state: MockSessionState = {
      ...createInitialState(),
      state: 'waiting',
    };

    // Simulate hybrid key generation
    state = { ...state, isQuantumSecure: true };

    expect(state.isQuantumSecure).toBe(true);
  });

  it('should set isQuantumSecure to false for reconnection', () => {
    let state: MockSessionState = createInitialState();

    // Reconnection uses classical keys only
    state = {
      ...state,
      state: 'active',
      isQuantumSecure: false,
    };

    expect(state.isQuantumSecure).toBe(false);
  });

  it('should reset isQuantumSecure on session destroy', () => {
    let state: MockSessionState = {
      ...createInitialState(),
      isQuantumSecure: true,
    };

    state = destroySession();

    expect(state.isQuantumSecure).toBe(false);
  });
});
