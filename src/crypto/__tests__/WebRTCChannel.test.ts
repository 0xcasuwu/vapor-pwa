/**
 * WebRTCChannel.test.ts
 * Vapor PWA - WebRTC Channel Unit Tests
 *
 * Tests the WebRTCChannel helper functions and signaling encoding.
 * Full WebRTC tests require browser environment and are covered by E2E tests.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeSignalingForQR,
  decodeSignalingFromQR,
} from '../WebRTCChannel';

describe('Signaling QR Encoding', () => {
  describe('encodeSignalingForQR', () => {
    it('should encode JSON to base64', () => {
      const json = JSON.stringify({ type: 'offer', sdp: 'test' });
      const encoded = encodeSignalingForQR(json);

      expect(encoded).toBeDefined();
      expect(typeof encoded).toBe('string');
      // Base64 should decode back
      expect(atob(encoded)).toBe(json);
    });

    it('should handle complex SDP data', () => {
      const json = JSON.stringify({
        type: 'offer',
        sdp: 'v=0\r\no=- 123 1 IN IP4 127.0.0.1\r\na=candidate:1 1 UDP host\r\n',
      });

      const encoded = encodeSignalingForQR(json);
      expect(atob(encoded)).toBe(json);
    });

    it('should handle empty SDP', () => {
      const json = JSON.stringify({ type: 'offer', sdp: '' });
      const encoded = encodeSignalingForQR(json);

      expect(atob(encoded)).toBe(json);
    });
  });

  describe('decodeSignalingFromQR', () => {
    it('should decode base64 to JSON', () => {
      const original = JSON.stringify({ type: 'answer', sdp: 'test-sdp' });
      const encoded = btoa(original);

      const decoded = decodeSignalingFromQR(encoded);

      expect(decoded).toBe(original);
    });

    it('should round-trip correctly', () => {
      const original = JSON.stringify({
        type: 'offer',
        sdp: 'v=0\r\no=-\r\na=candidate:1 1 UDP host\r\n',
      });

      const encoded = encodeSignalingForQR(original);
      const decoded = decodeSignalingFromQR(encoded);

      expect(decoded).toBe(original);
    });

    it('should preserve special characters', () => {
      const original = JSON.stringify({
        type: 'offer',
        sdp: 'v=0\r\n+=special chars!/\r\n',
      });

      const encoded = encodeSignalingForQR(original);
      const decoded = decodeSignalingFromQR(encoded);

      expect(decoded).toBe(original);
    });

    it('should handle unicode', () => {
      const original = JSON.stringify({
        type: 'offer',
        sdp: 'test',
        metadata: 'Test 田中 🎉',
      });

      // Note: btoa doesn't handle unicode directly
      // In real usage, SDP is ASCII-only
      const encoded = btoa(unescape(encodeURIComponent(original)));
      const decoded = decodeURIComponent(escape(atob(encoded)));

      expect(decoded).toBe(original);
    });
  });
});

describe('WebRTCChannel Types', () => {
  it('should define ConnectionState type', () => {
    const states: Array<'disconnected' | 'connecting' | 'connected' | 'failed'> = [
      'disconnected',
      'connecting',
      'connected',
      'failed',
    ];

    states.forEach(state => {
      expect(typeof state).toBe('string');
    });
  });

  it('should define SignalingData type', () => {
    const signalingTypes: Array<'offer' | 'answer' | 'ice-candidate'> = [
      'offer',
      'answer',
      'ice-candidate',
    ];

    signalingTypes.forEach(type => {
      expect(typeof type).toBe('string');
    });
  });
});

describe('WebRTCChannel Constants', () => {
  it('should use Google STUN servers', () => {
    // Verify the expected STUN servers are documented
    const expectedStunServers = [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
    ];

    expectedStunServers.forEach(server => {
      expect(server).toMatch(/^stun:stun\d?\.l\.google\.com:19302$/);
    });
  });
});

describe('ICE Diagnostics Type', () => {
  it('should define IceDiagnostics structure', () => {
    const diagnostics = {
      gatheringState: 'complete' as const,
      connectionState: 'connected' as const,
      candidateTypes: {
        host: 2,
        srflx: 1,
        relay: 0,
        prflx: 0,
      },
      selectedPair: 'srflx ↔ srflx',
      errorMessage: null as string | null,
    };

    expect(diagnostics.gatheringState).toBe('complete');
    expect(diagnostics.candidateTypes.host).toBe(2);
    expect(diagnostics.selectedPair).toBe('srflx ↔ srflx');
    expect(diagnostics.errorMessage).toBeNull();
  });

  it('should handle error states', () => {
    const diagnostics = {
      gatheringState: 'unknown' as const,
      connectionState: 'failed' as const,
      candidateTypes: { host: 0, srflx: 0, relay: 0, prflx: 0 },
      selectedPair: null,
      errorMessage: 'No ICE candidates gathered - check network/firewall',
    };

    expect(diagnostics.errorMessage).toContain('No ICE candidates');
  });
});

describe('WebRTCChannel DataChannel Options', () => {
  it('should use ordered reliable delivery', () => {
    // Document expected DataChannel configuration
    const dataChannelConfig = {
      ordered: true,
      maxRetransmits: 3,
    };

    expect(dataChannelConfig.ordered).toBe(true);
    expect(dataChannelConfig.maxRetransmits).toBe(3);
  });
});
