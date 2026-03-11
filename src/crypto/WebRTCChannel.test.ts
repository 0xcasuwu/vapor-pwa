/**
 * WebRTCChannel.test.ts
 * Tests for WebRTC connection management
 *
 * Uses mocked RTCPeerConnection since happy-dom doesn't have WebRTC
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebRTCChannel, type ConnectionState } from './WebRTCChannel';

// Mock RTCPeerConnection
class MockRTCPeerConnection {
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  iceGatheringState: RTCIceGatheringState = 'new';
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';

  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;

  private eventListeners: Map<string, Set<EventListener>> = new Map();

  createDataChannel(label: string, options?: RTCDataChannelInit): MockRTCDataChannel {
    return new MockRTCDataChannel(label, options);
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'mock-offer-sdp' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'mock-answer-sdp' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
    // Simulate ICE gathering completing immediately
    setTimeout(() => {
      this.iceGatheringState = 'complete';
      this.dispatchEvent('icegatheringstatechange');
    }, 10);
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    // Mock implementation
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.eventListeners.get(type)?.delete(listener);
  }

  private dispatchEvent(type: string): void {
    this.eventListeners.get(type)?.forEach((listener) => {
      listener({} as Event);
    });
  }

  close(): void {
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }
}

class MockRTCDataChannel {
  label: string;
  readyState: RTCDataChannelState = 'connecting';
  binaryType: BinaryType = 'blob';

  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(label: string, options?: RTCDataChannelInit) {
    this.label = label;
  }

  send(data: ArrayBuffer | string): void {
    if (this.readyState !== 'open') {
      throw new Error('DataChannel not open');
    }
  }

  close(): void {
    this.readyState = 'closed';
    this.onclose?.();
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  simulateMessage(data: ArrayBuffer): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

// Setup global mock
const originalRTCPeerConnection = globalThis.RTCPeerConnection;

beforeEach(() => {
  (globalThis as unknown as { RTCPeerConnection: typeof MockRTCPeerConnection }).RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;
});

afterEach(() => {
  (globalThis as unknown as { RTCPeerConnection: typeof RTCPeerConnection }).RTCPeerConnection = originalRTCPeerConnection;
});

describe('WebRTCChannel', () => {
  describe('initAsInitiator', () => {
    it('creates offer and waits for ICE gathering', async () => {
      const onMessage = vi.fn();
      const onStateChange = vi.fn();
      const onSignalingData = vi.fn();

      const channel = new WebRTCChannel({
        onMessage,
        onStateChange,
        onSignalingData,
      });

      const offerJson = await channel.initAsInitiator();
      const offer = JSON.parse(offerJson);

      expect(offer.type).toBe('offer');
      expect(offer.sdp).toBe('mock-offer-sdp');
      expect(onStateChange).toHaveBeenCalledWith('connecting');
    });

    it('returns valid JSON with sdp field', async () => {
      const channel = new WebRTCChannel({
        onMessage: vi.fn(),
        onStateChange: vi.fn(),
        onSignalingData: vi.fn(),
      });

      const offerJson = await channel.initAsInitiator();

      expect(() => JSON.parse(offerJson)).not.toThrow();
      const parsed = JSON.parse(offerJson);
      expect(parsed).toHaveProperty('type');
      expect(parsed).toHaveProperty('sdp');
    });
  });

  describe('initAsResponder', () => {
    it('accepts offer and creates answer', async () => {
      const onMessage = vi.fn();
      const onStateChange = vi.fn();
      const onSignalingData = vi.fn();

      const channel = new WebRTCChannel({
        onMessage,
        onStateChange,
        onSignalingData,
      });

      const offerJson = JSON.stringify({ type: 'offer', sdp: 'remote-offer-sdp' });
      const answerJson = await channel.initAsResponder(offerJson);
      const answer = JSON.parse(answerJson);

      expect(answer.type).toBe('answer');
      expect(answer.sdp).toBe('mock-answer-sdp');
      expect(onStateChange).toHaveBeenCalledWith('connecting');
    });
  });

  describe('completeConnection', () => {
    it('sets remote description from answer', async () => {
      const channel = new WebRTCChannel({
        onMessage: vi.fn(),
        onStateChange: vi.fn(),
        onSignalingData: vi.fn(),
      });

      await channel.initAsInitiator();

      const answerJson = JSON.stringify({ type: 'answer', sdp: 'remote-answer-sdp' });
      await channel.completeConnection(answerJson);

      // No error thrown means success
      expect(channel.getState()).toBe('connecting');
    });
  });

  describe('send', () => {
    it('returns false when data channel not open', async () => {
      const channel = new WebRTCChannel({
        onMessage: vi.fn(),
        onStateChange: vi.fn(),
        onSignalingData: vi.fn(),
      });

      await channel.initAsInitiator();

      const result = channel.send(new Uint8Array([1, 2, 3]));
      expect(result).toBe(false);
    });
  });

  describe('close', () => {
    it('transitions to disconnected state', async () => {
      const onStateChange = vi.fn();
      const channel = new WebRTCChannel({
        onMessage: vi.fn(),
        onStateChange,
        onSignalingData: vi.fn(),
      });

      await channel.initAsInitiator();
      channel.close();

      expect(onStateChange).toHaveBeenCalledWith('disconnected');
      expect(channel.getState()).toBe('disconnected');
    });
  });

  describe('getState', () => {
    it('returns disconnected initially', () => {
      const channel = new WebRTCChannel({
        onMessage: vi.fn(),
        onStateChange: vi.fn(),
        onSignalingData: vi.fn(),
      });

      expect(channel.getState()).toBe('disconnected');
    });

    it('returns connecting after init', async () => {
      const channel = new WebRTCChannel({
        onMessage: vi.fn(),
        onStateChange: vi.fn(),
        onSignalingData: vi.fn(),
      });

      await channel.initAsInitiator();
      expect(channel.getState()).toBe('connecting');
    });
  });
});
