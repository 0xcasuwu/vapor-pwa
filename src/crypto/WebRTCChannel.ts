/**
 * WebRTCChannel.ts
 * Vapor PWA - P2P Communication via WebRTC DataChannel
 *
 * Provides true peer-to-peer messaging without relay servers.
 * Messages are already encrypted at the application layer (ChaCha20-Poly1305),
 * but WebRTC adds DTLS encryption as an additional layer.
 *
 * Connection Flow:
 * 1. Initiator creates offer, encodes as QR/signal
 * 2. Responder scans, creates answer
 * 3. Both exchange ICE candidates
 * 4. DataChannel established
 * 5. Encrypted messages flow P2P
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface SignalingData {
  type: 'offer' | 'answer' | 'ice-candidate';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface WebRTCChannelOptions {
  onMessage: (data: Uint8Array) => void;
  onStateChange: (state: ConnectionState) => void;
  onSignalingData: (data: SignalingData) => void;
}

/**
 * WebRTC DataChannel wrapper for P2P encrypted messaging
 */
export class WebRTCChannel {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private options: WebRTCChannelOptions;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private state: ConnectionState = 'disconnected';

  // STUN servers for NAT traversal (no TURN = no relay = more private)
  private static readonly ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  constructor(options: WebRTCChannelOptions) {
    this.options = options;
  }

  /**
   * Initialize as the connection initiator (creates offer)
   */
  async initAsInitiator(): Promise<string> {
    this.createPeerConnection();

    // Create data channel
    this.dc = this.pc!.createDataChannel('vapor', {
      ordered: true,
      maxRetransmits: 3,
    });
    this.setupDataChannel(this.dc);

    // Create and set local offer
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);

    this.setState('connecting');

    // Return offer as JSON string
    return JSON.stringify({
      type: 'offer',
      sdp: offer.sdp,
    });
  }

  /**
   * Initialize as the connection responder (receives offer, creates answer)
   */
  async initAsResponder(offerJson: string): Promise<string> {
    this.createPeerConnection();

    // Handle incoming data channel
    this.pc!.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDataChannel(this.dc);
    };

    // Parse and set remote offer
    const offer = JSON.parse(offerJson);
    await this.pc!.setRemoteDescription({
      type: 'offer',
      sdp: offer.sdp,
    });

    // Process any pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      await this.pc!.addIceCandidate(candidate);
    }
    this.pendingCandidates = [];

    // Create and set local answer
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);

    this.setState('connecting');

    // Return answer as JSON string
    return JSON.stringify({
      type: 'answer',
      sdp: answer.sdp,
    });
  }

  /**
   * Complete connection by processing the answer (initiator only)
   */
  async completeConnection(answerJson: string): Promise<void> {
    const answer = JSON.parse(answerJson);
    await this.pc!.setRemoteDescription({
      type: 'answer',
      sdp: answer.sdp,
    });

    // Process any pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      await this.pc!.addIceCandidate(candidate);
    }
    this.pendingCandidates = [];
  }

  /**
   * Add ICE candidate from remote peer
   */
  async addIceCandidate(candidateJson: string): Promise<void> {
    const candidate = JSON.parse(candidateJson);

    if (this.pc?.remoteDescription) {
      await this.pc.addIceCandidate(candidate);
    } else {
      // Queue candidate until remote description is set
      this.pendingCandidates.push(candidate);
    }
  }

  /**
   * Send encrypted message over the data channel
   */
  send(data: Uint8Array): boolean {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.error('DataChannel not open');
      return false;
    }

    try {
      // Create a clean ArrayBuffer copy to satisfy TypeScript
      this.dc.send(new Uint8Array(data).buffer);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  /**
   * Close the connection and clean up
   */
  close(): void {
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.setState('disconnected');
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Create and configure the RTCPeerConnection
   */
  private createPeerConnection(): void {
    this.pc = new RTCPeerConnection({
      iceServers: WebRTCChannel.ICE_SERVERS,
    });

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.options.onSignalingData({
          type: 'ice-candidate',
          payload: event.candidate.toJSON(),
        });
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      switch (this.pc?.connectionState) {
        case 'connected':
          this.setState('connected');
          break;
        case 'disconnected':
        case 'closed':
          this.setState('disconnected');
          break;
        case 'failed':
          this.setState('failed');
          break;
      }
    };

    // Handle ICE connection state (more granular)
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc?.iceConnectionState === 'failed') {
        this.setState('failed');
      }
    };
  }

  /**
   * Set up data channel event handlers
   */
  private setupDataChannel(dc: RTCDataChannel): void {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      console.log('DataChannel opened');
      this.setState('connected');
    };

    dc.onclose = () => {
      console.log('DataChannel closed');
      this.setState('disconnected');
    };

    dc.onerror = (error) => {
      console.error('DataChannel error:', error);
      this.setState('failed');
    };

    dc.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      this.options.onMessage(data);
    };
  }

  /**
   * Update state and notify listener
   */
  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange(newState);
    }
  }
}

/**
 * Encode signaling data for QR or manual exchange
 * Compresses the SDP to fit in QR codes
 */
export function encodeSignalingForQR(signalingJson: string): string {
  // Base64 encode for QR compatibility
  return btoa(signalingJson);
}

/**
 * Decode signaling data from QR or manual exchange
 */
export function decodeSignalingFromQR(encoded: string): string {
  return atob(encoded);
}
