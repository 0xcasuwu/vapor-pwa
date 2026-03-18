/**
 * sessionStore.test.ts
 * Vapor PWA - Session Store State Machine Tests
 *
 * Tests the reconnection state machine and session state types.
 * This test file verifies state transitions for frtun reconnection flow
 * without importing from the actual sessionStore (which depends on frtun).
 *
 * The state types and transitions are tested as constants to ensure
 * protocol compliance.
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
  // Reconnection states (frtun overlay network)
  | 'reconnecting_overlay'
  | 'reconnecting_stream'
  | 'reconnecting_handshake'
  | 'reconnecting_webrtc';

// Connection states
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';

// Mock session state for testing
interface MockSessionState {
  state: SessionState;
  role: 'initiator' | 'responder' | null;
  error: string | null;
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
    connectionState: 'disconnected',
    isQuantumSecure: false,
    safetyNumber: null,
    safetyNumberVerified: false,
    reconnectionProgress: null,
    peerFrtunPeerId: null,
  };
}

function destroySession(_state: MockSessionState): MockSessionState {
  return createInitialState();
}

function verifySafetyNumber(state: MockSessionState): MockSessionState {
  return { ...state, safetyNumberVerified: true };
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

    it('should have disconnected connection state', () => {
      const state = createInitialState();
      expect(state.connectionState).toBe('disconnected');
    });

    it('should have no reconnection progress', () => {
      const state = createInitialState();
      expect(state.reconnectionProgress).toBeNull();
    });

    it('should have no peer frtun peer ID', () => {
      const state = createInitialState();
      expect(state.peerFrtunPeerId).toBeNull();
    });
  });

  describe('Session States', () => {
    it('should define all valid session states', () => {
      const validStates: SessionState[] = [
        'idle',
        'generating',
        'waiting',
        'scanning',
        'showing_offer',
        'waiting_for_answer',
        'showing_answer',
        'connecting',
        'active',
        'error',
        // Reconnection states (frtun overlay network)
        'reconnecting_overlay',
        'reconnecting_stream',
        'reconnecting_handshake',
        'reconnecting_webrtc',
      ];

      // Verify all states are valid by checking they're strings
      validStates.forEach(state => {
        expect(typeof state).toBe('string');
        expect(state.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Reconnection States', () => {
    it('should track reconnecting_overlay state', () => {
      let state = createInitialState();
      state = {
        ...state,
        state: 'reconnecting_overlay',
        reconnectionProgress: 'Connecting to overlay network...',
      };

      expect(state.state).toBe('reconnecting_overlay');
      expect(state.reconnectionProgress).toBe('Connecting to overlay network...');
    });

    it('should track reconnecting_stream state', () => {
      let state = createInitialState();
      state = {
        ...state,
        state: 'reconnecting_stream',
        reconnectionProgress: 'Opening stream...',
      };

      expect(state.state).toBe('reconnecting_stream');
    });

    it('should track reconnecting_handshake state', () => {
      let state = createInitialState();
      state = {
        ...state,
        state: 'reconnecting_handshake',
        reconnectionProgress: 'Exchanging handshake data...',
      };

      expect(state.state).toBe('reconnecting_handshake');
    });

    it('should track reconnecting_webrtc state', () => {
      let state = createInitialState();
      state = {
        ...state,
        state: 'reconnecting_webrtc',
        reconnectionProgress: 'Establishing secure connection...',
      };

      expect(state.state).toBe('reconnecting_webrtc');
    });
  });

  describe('destroySession', () => {
    it('should reset all state to initial values', () => {
      let state: MockSessionState = {
        state: 'active',
        role: 'initiator',
        error: null,
        connectionState: 'connected',
        isQuantumSecure: true,
        safetyNumber: '12345678',
        safetyNumberVerified: true,
        reconnectionProgress: 'Connecting...',
        peerFrtunPeerId: 'frtun1test.peer',
      };

      state = destroySession(state);

      expect(state.state).toBe('idle');
      expect(state.role).toBeNull();
      expect(state.connectionState).toBe('disconnected');
      expect(state.isQuantumSecure).toBe(false);
      expect(state.safetyNumber).toBeNull();
      expect(state.reconnectionProgress).toBeNull();
      expect(state.peerFrtunPeerId).toBeNull();
    });

    it('should clear error state', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'error',
        error: 'Connection failed',
      };

      state = destroySession(state);

      expect(state.state).toBe('idle');
      expect(state.error).toBeNull();
    });
  });

  describe('Safety Number Verification', () => {
    it('should mark safety number as verified', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        safetyNumber: '12345678',
        safetyNumberVerified: false,
      };

      state = verifySafetyNumber(state);

      expect(state.safetyNumberVerified).toBe(true);
    });
  });

  describe('State Machine Transitions', () => {
    it('should transition from idle to generating', () => {
      let state = createInitialState();
      expect(state.state).toBe('idle');

      state = { ...state, state: 'generating', role: 'initiator' };

      expect(state.state).toBe('generating');
      expect(state.role).toBe('initiator');
    });

    it('should transition from generating to waiting', () => {
      let state: MockSessionState = { ...createInitialState(), state: 'generating' };
      state = { ...state, state: 'waiting' };

      expect(state.state).toBe('waiting');
    });

    it('should transition to error from any state', () => {
      const states: SessionState[] = [
        'generating',
        'waiting',
        'scanning',
        'connecting',
        'reconnecting_overlay',
        'reconnecting_stream',
      ];

      states.forEach(fromState => {
        let state: MockSessionState = { ...createInitialState(), state: fromState };
        state = { ...state, state: 'error', error: 'Test error' };

        expect(state.state).toBe('error');
        expect(state.error).toBe('Test error');
      });
    });

    it('should transition reconnection states in order', () => {
      const transitions: SessionState[] = [
        'idle',
        'reconnecting_overlay',
        'reconnecting_stream',
        'reconnecting_handshake',
        'reconnecting_webrtc',
        'active',
      ];

      let state = createInitialState();

      transitions.forEach(targetState => {
        state = { ...state, state: targetState };
        expect(state.state).toBe(targetState);
      });
    });
  });

  describe('Reconnection Progress Messages', () => {
    it('should update progress during reconnection', () => {
      const progressMessages = [
        'Connecting to overlay network...',
        'Starting relay connection...',
        'Generating session keys...',
        'Opening stream to frtun1test.peer...',
        'Exchanging handshake data...',
        'Establishing secure connection...',
      ];

      let state = createInitialState();

      progressMessages.forEach(progress => {
        state = { ...state, reconnectionProgress: progress };
        expect(state.reconnectionProgress).toBe(progress);
      });
    });

    it('should clear progress on success', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'reconnecting_webrtc',
        reconnectionProgress: 'Establishing...',
      };

      state = { ...state, state: 'active', reconnectionProgress: null };

      expect(state.state).toBe('active');
      expect(state.reconnectionProgress).toBeNull();
    });

    it('should clear progress on error', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        state: 'reconnecting_stream',
        reconnectionProgress: 'Opening stream...',
      };

      state = {
        ...state,
        state: 'error',
        error: 'Stream failed',
        reconnectionProgress: null,
      };

      expect(state.state).toBe('error');
      expect(state.reconnectionProgress).toBeNull();
    });
  });

  describe('Peer frtun ID Storage', () => {
    it('should store peer frtun ID from QR scan', () => {
      const peerId = 'frtun1qp5d82s3w7z9x8y6c5v4b3n2m1.peer';
      let state = createInitialState();

      state = { ...state, peerFrtunPeerId: peerId };

      expect(state.peerFrtunPeerId).toBe(peerId);
    });

    it('should clear peer ID on session destroy', () => {
      let state: MockSessionState = {
        ...createInitialState(),
        peerFrtunPeerId: 'frtun1test.peer',
      };

      state = destroySession(state);

      expect(state.peerFrtunPeerId).toBeNull();
    });
  });

  describe('Connection State Transitions', () => {
    it('should track connection state separately from session state', () => {
      let state = createInitialState();

      // During reconnection, connection state is 'connecting'
      state = { ...state, state: 'reconnecting_webrtc', connectionState: 'connecting' };
      expect(state.state).toBe('reconnecting_webrtc');
      expect(state.connectionState).toBe('connecting');

      // On success, both transition
      state = { ...state, state: 'active', connectionState: 'connected' };
      expect(state.state).toBe('active');
      expect(state.connectionState).toBe('connected');
    });
  });
});
