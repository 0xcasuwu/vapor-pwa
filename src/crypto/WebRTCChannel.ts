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

/**
 * ICE diagnostics for debugging connection issues
 */
export interface IceDiagnostics {
  gatheringState: RTCIceGatheringState | 'unknown';
  connectionState: RTCIceConnectionState | 'unknown';
  candidateTypes: {
    host: number;      // Local network candidates
    srflx: number;     // STUN candidates (server reflexive)
    relay: number;     // TURN candidates (relay)
    prflx: number;     // Peer reflexive
  };
  selectedPair: string | null;
  errorMessage: string | null;
}

export interface WebRTCChannelOptions {
  onMessage: (data: Uint8Array) => void;
  onStateChange: (state: ConnectionState) => void;
  onSignalingData: (data: SignalingData) => void;
  onIceDiagnostics?: (diagnostics: IceDiagnostics) => void;
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
  private diagnostics: IceDiagnostics = {
    gatheringState: 'unknown',
    connectionState: 'unknown',
    candidateTypes: { host: 0, srflx: 0, relay: 0, prflx: 0 },
    selectedPair: null,
    errorMessage: null,
  };

  // ICE servers for NAT traversal
  // STUN: Discovers public IP (free, stateless, no data relay)
  // Works for ~80% of NAT configurations. True P2P — no servers relay your data.
  private static readonly ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ];

  constructor(options: WebRTCChannelOptions) {
    this.options = options;
  }

  /**
   * Initialize as the connection initiator (creates offer)
   * Waits for ICE gathering to complete so all candidates are embedded in the SDP
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

    // Wait for ICE gathering to complete so all candidates are in the SDP
    await this.waitForIceGathering();

    this.setState('connecting');

    // Return the complete local description (includes ICE candidates)
    return JSON.stringify({
      type: 'offer',
      sdp: this.pc!.localDescription!.sdp,
    });
  }

  /**
   * Initialize as the connection responder (receives offer, creates answer)
   * Waits for ICE gathering to complete so all candidates are embedded in the SDP
   */
  async initAsResponder(offerJson: string): Promise<string> {
    this.createPeerConnection();

    // Handle incoming data channel
    this.pc!.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDataChannel(this.dc);
    };

    // Parse and set remote offer (already contains ICE candidates)
    const offer = JSON.parse(offerJson);
    await this.pc!.setRemoteDescription({
      type: 'offer',
      sdp: offer.sdp,
    });

    // Process any pending ICE candidates (shouldn't be any with gathering-complete mode)
    for (const candidate of this.pendingCandidates) {
      await this.pc!.addIceCandidate(candidate);
    }
    this.pendingCandidates = [];

    // Create and set local answer
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);

    // Wait for ICE gathering to complete so all candidates are in the SDP
    await this.waitForIceGathering();

    this.setState('connecting');

    // Return the complete local description (includes ICE candidates)
    return JSON.stringify({
      type: 'answer',
      sdp: this.pc!.localDescription!.sdp,
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
   * Get ICE diagnostics for debugging
   */
  getDiagnostics(): IceDiagnostics {
    return { ...this.diagnostics };
  }

  /**
   * Update and emit diagnostics
   */
  private updateDiagnostics(partial: Partial<IceDiagnostics>): void {
    this.diagnostics = { ...this.diagnostics, ...partial };
    this.options.onIceDiagnostics?.(this.diagnostics);
  }

  /**
   * Wait for ICE gathering to complete
   * This ensures all ICE candidates are embedded in the local SDP
   */
  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc) {
        resolve();
        return;
      }

      console.log('[ICE] Starting ICE gathering, current state:', this.pc.iceGatheringState);

      // Already complete
      if (this.pc.iceGatheringState === 'complete') {
        this.logIceCandidates();
        resolve();
        return;
      }

      // Wait for gathering to complete
      const checkState = () => {
        console.log('[ICE] Gathering state changed:', this.pc?.iceGatheringState);
        if (this.pc?.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          this.logIceCandidates();
          resolve();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);

      // Timeout after 15 seconds to prevent hanging (increased for TURN)
      setTimeout(() => {
        if (this.pc) {
          console.log('[ICE] Gathering timeout, proceeding with available candidates');
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          this.logIceCandidates();
        }
        resolve();
      }, 15000);
    });
  }

  /**
   * Log ICE candidates and update diagnostics
   */
  private logIceCandidates(): void {
    if (!this.pc?.localDescription?.sdp) return;

    const sdp = this.pc.localDescription.sdp;
    const candidates = sdp.split('\n').filter(line => line.startsWith('a=candidate:'));

    // Count candidate types
    const candidateTypes = { host: 0, srflx: 0, relay: 0, prflx: 0 };

    console.log('[ICE] Gathered candidates:');
    candidates.forEach((c, i) => {
      let type: string;
      if (c.includes('typ host')) {
        type = 'HOST';
        candidateTypes.host++;
      } else if (c.includes('typ srflx')) {
        type = 'SRFLX (STUN)';
        candidateTypes.srflx++;
      } else if (c.includes('typ relay')) {
        type = 'RELAY (TURN)';
        candidateTypes.relay++;
      } else if (c.includes('typ prflx')) {
        type = 'PRFLX';
        candidateTypes.prflx++;
      } else {
        type = 'UNKNOWN';
      }
      console.log(`  ${i + 1}. ${type}: ${c.substring(0, 80)}...`);
    });

    // Update diagnostics
    this.updateDiagnostics({
      candidateTypes,
      gatheringState: this.pc.iceGatheringState,
    });

    if (candidates.length === 0) {
      console.warn('[ICE] No candidates gathered! Connection will likely fail.');
      this.updateDiagnostics({ errorMessage: 'No ICE candidates gathered - check network/firewall' });
    } else if (candidateTypes.srflx === 0 && candidateTypes.relay === 0) {
      console.warn('[ICE] Only local candidates - may fail across networks');
      this.updateDiagnostics({ errorMessage: 'Only local candidates - STUN/TURN may be blocked' });
    }
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
      console.log('[WebRTC] Connection state:', this.pc?.connectionState);
      switch (this.pc?.connectionState) {
        case 'connected':
          this.updateSelectedCandidatePair();
          this.setState('connected');
          break;
        case 'disconnected':
        case 'closed':
          this.setState('disconnected');
          break;
        case 'failed':
          this.updateDiagnostics({ errorMessage: 'WebRTC connection failed - peers cannot reach each other' });
          this.setState('failed');
          break;
      }
    };

    // Handle ICE connection state (more granular)
    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc?.iceConnectionState;
      console.log('[ICE] Connection state:', iceState);
      this.updateDiagnostics({ connectionState: iceState || 'unknown' });

      if (iceState === 'failed') {
        this.updateDiagnostics({ errorMessage: 'ICE connection failed - NAT traversal unsuccessful' });
        this.setState('failed');
      } else if (iceState === 'checking') {
        this.updateDiagnostics({ errorMessage: null });
      }
    };

    // Handle ICE gathering state
    this.pc.onicegatheringstatechange = () => {
      console.log('[ICE] Gathering state:', this.pc?.iceGatheringState);
      this.updateDiagnostics({ gatheringState: this.pc?.iceGatheringState || 'unknown' });
    };
  }

  /**
   * Get info about the selected candidate pair (after connection)
   */
  private async updateSelectedCandidatePair(): Promise<void> {
    if (!this.pc) return;

    try {
      const stats = await this.pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const localCandidateId = report.localCandidateId;
          const remoteCandidateId = report.remoteCandidateId;

          let localType = 'unknown';
          let remoteType = 'unknown';

          stats.forEach((r) => {
            if (r.id === localCandidateId) {
              localType = r.candidateType || 'unknown';
            }
            if (r.id === remoteCandidateId) {
              remoteType = r.candidateType || 'unknown';
            }
          });

          const selectedPair = `${localType} ↔ ${remoteType}`;
          console.log('[ICE] Selected pair:', selectedPair);
          this.updateDiagnostics({ selectedPair, errorMessage: null });
        }
      });
    } catch (e) {
      console.warn('[ICE] Could not get stats:', e);
    }
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
