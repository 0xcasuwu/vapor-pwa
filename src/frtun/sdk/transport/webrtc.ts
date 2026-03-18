/**
 * WebRTC DataChannel transport for direct peer-to-peer browser connections.
 *
 * This module is a placeholder for future WebRTC support. Once implemented,
 * it will allow two browser nodes to establish a direct data channel without
 * going through a relay, using the overlay's signaling infrastructure for
 * the initial SDP exchange.
 *
 * The transport will expose the same interface as `WebSocketTransport`,
 * allowing it to be used interchangeably as the underlying connection.
 */

/** Configuration for the WebRTC transport. */
export interface WebRtcTransportConfig {
  /** ICE servers for NAT traversal. */
  iceServers?: RTCIceServer[];
  /** Maximum number of buffered messages in the data channel. */
  maxBufferedAmount?: number;
  /** Data channel label. */
  channelLabel?: string;
}

/** Default ICE servers using public STUN. */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

/** Callback signatures for WebRTC transport events. */
export interface WebRtcTransportCallbacks {
  /** Called when a binary message is received from the peer. */
  onMessage: (data: Uint8Array) => void;
  /** Called when the data channel is closed. */
  onClose: () => void;
  /** Called when an error occurs. */
  onError: (error: Error) => void;
}

/** State of the WebRTC transport. */
export type WebRtcState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/**
 * WebRTC DataChannel transport (stub implementation).
 *
 * All methods throw `Error('Not implemented')` until the WebRTC transport
 * is fully built out. The API surface is defined here to allow the rest
 * of the SDK to reference it and for type-checking purposes.
 */
export class WebRtcTransport {
  private _state: WebRtcState = 'new';
  private readonly config: WebRtcTransportConfig;
  private readonly callbacks: WebRtcTransportCallbacks;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  /**
   * Create a new WebRTC transport.
   *
   * @param config - WebRTC configuration.
   * @param callbacks - Event callbacks.
   */
  constructor(config: WebRtcTransportConfig, callbacks: WebRtcTransportCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /** Current state of the transport. */
  get state(): WebRtcState {
    return this._state;
  }

  /**
   * Create an offer and initialize the peer connection as the offerer.
   *
   * @returns The local SDP offer string to send to the remote peer via signaling.
   */
  async createOffer(): Promise<string> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers ?? DEFAULT_ICE_SERVERS,
    });

    const label = this.config.channelLabel ?? 'frtun-data';
    this.dataChannel = this.peerConnection.createDataChannel(label, {
      ordered: true,
    });
    this.setupDataChannel(this.dataChannel);
    this.setupPeerConnection();

    this._state = 'connecting';

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering to complete.
    await this.waitForIceGathering();

    return this.peerConnection.localDescription?.sdp ?? '';
  }

  /**
   * Accept a remote offer and create an answer.
   *
   * @param remoteSdp - The remote peer's SDP offer.
   * @returns The local SDP answer string.
   */
  async acceptOffer(remoteSdp: string): Promise<string> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers ?? DEFAULT_ICE_SERVERS,
    });

    this.setupPeerConnection();

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel(this.dataChannel);
    };

    this._state = 'connecting';

    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: 'offer', sdp: remoteSdp }),
    );

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    await this.waitForIceGathering();

    return this.peerConnection.localDescription?.sdp ?? '';
  }

  /**
   * Set the remote answer (called by the offerer after receiving the answer).
   *
   * @param remoteSdp - The remote peer's SDP answer.
   */
  async acceptAnswer(remoteSdp: string): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No peer connection; call createOffer() first');
    }
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: remoteSdp }),
    );
  }

  /**
   * Send binary data over the data channel.
   *
   * @param data - The bytes to send.
   */
  send(data: Uint8Array): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel is not open');
    }
    const maxBuffered = this.config.maxBufferedAmount ?? 16 * 1024 * 1024;
    if (this.dataChannel.bufferedAmount > maxBuffered) {
      throw new Error('Data channel buffer is full');
    }
    this.dataChannel.send(data as ArrayBufferView<ArrayBuffer>);
  }

  /** Close the transport. */
  close(): void {
    this._state = 'closed';
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch { /* ignore */ }
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch { /* ignore */ }
      this.peerConnection = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Set up event handlers on the peer connection. */
  private setupPeerConnection(): void {
    if (!this.peerConnection) return;

    this.peerConnection.onconnectionstatechange = () => {
      const pcState = this.peerConnection?.connectionState;
      if (pcState === 'connected') {
        this._state = 'connected';
      } else if (pcState === 'disconnected') {
        this._state = 'disconnected';
        this.callbacks.onClose();
      } else if (pcState === 'failed') {
        this._state = 'failed';
        this.callbacks.onError(new Error('WebRTC connection failed'));
      } else if (pcState === 'closed') {
        this._state = 'closed';
        this.callbacks.onClose();
      }
    };

    this.peerConnection.onicecandidate = () => {
      // ICE candidates are gathered and included in the SDP via
      // waitForIceGathering. No external trickle ICE signaling needed.
    };
  }

  /** Set up event handlers on a data channel. */
  private setupDataChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      this._state = 'connected';
    };

    channel.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        this.callbacks.onMessage(new Uint8Array(event.data));
      }
    };

    channel.onclose = () => {
      this._state = 'disconnected';
      this.callbacks.onClose();
    };

    channel.onerror = (event: Event) => {
      this.callbacks.onError(
        new Error(`DataChannel error: ${event instanceof ErrorEvent ? event.message : 'unknown'}`),
      );
    };
  }

  /** Wait for ICE gathering to complete (or timeout after 5 seconds). */
  private waitForIceGathering(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.peerConnection) {
        resolve();
        return;
      }
      if (this.peerConnection.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        resolve(); // Proceed with whatever candidates we have.
      }, 5000);

      this.peerConnection.onicegatheringstatechange = () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      };
    });
  }
}
