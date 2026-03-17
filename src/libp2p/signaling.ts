/**
 * signaling.ts
 * Vapor PWA - WebRTC Signaling over libp2p
 *
 * Implements the /vapor/signaling/1.0.0 protocol for exchanging
 * WebRTC SDP offer/answer over libp2p streams.
 *
 * This enables zero-code reconnection:
 * 1. Alice dials Bob via Circuit Relay
 * 2. Alice opens signaling stream, sends SDP offer
 * 3. Bob receives offer, sends SDP answer
 * 4. Both establish direct WebRTC connection
 */

import { pipe } from 'it-pipe';
import { encode, decode } from 'it-length-prefixed';
import { pushable } from 'it-pushable';
import type { Stream } from '@libp2p/interface';
import {
  getNode,
  dialPeer,
  openSignalingStream,
  handleSignalingStreams,
} from './node';
import { TIMEOUTS } from './config';

/**
 * Signaling message types
 */
export enum SignalingMessageType {
  OFFER = 0x01,
  ANSWER = 0x02,
  ICE_CANDIDATE = 0x03,
  ERROR = 0xFF,
}

/**
 * Signaling message structure
 */
export interface SignalingMessage {
  type: SignalingMessageType;
  payload: string; // JSON-encoded SDP or ICE candidate
  timestamp: number;
}

/**
 * Encode a signaling message for transmission
 */
function encodeMessage(message: SignalingMessage): Uint8Array {
  const json = JSON.stringify(message);
  return new TextEncoder().encode(json);
}

/**
 * Decode a received signaling message
 */
function decodeMessage(data: Uint8Array): SignalingMessage {
  const json = new TextDecoder().decode(data);
  return JSON.parse(json);
}

/**
 * Initiator: Send SDP offer and receive answer
 * Used when reconnecting to a known contact
 */
export async function sendOfferAndReceiveAnswer(
  peerIdString: string,
  relayAddr: string | undefined,
  sdpOffer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  const node = getNode();
  if (!node) {
    throw new Error('libp2p node not initialized');
  }

  console.log('[signaling] Dialing peer for reconnection:', peerIdString);

  // First, dial the peer through relay
  await dialPeer(peerIdString, relayAddr);

  // Open signaling stream
  const stream = await openSignalingStream(peerIdString);
  console.log('[signaling] Signaling stream opened');

  try {
    // Create offer message
    const offerMessage: SignalingMessage = {
      type: SignalingMessageType.OFFER,
      payload: JSON.stringify(sdpOffer),
      timestamp: Date.now(),
    };

    // Send offer and receive answer
    const answer = await exchangeMessages(stream, offerMessage);

    if (answer.type !== SignalingMessageType.ANSWER) {
      throw new Error(`Unexpected message type: ${answer.type}`);
    }

    const sdpAnswer: RTCSessionDescriptionInit = JSON.parse(answer.payload);
    console.log('[signaling] Received SDP answer');

    return sdpAnswer;
  } finally {
    // Close the stream
    await stream.close();
  }
}

/**
 * Responder: Handle incoming signaling stream
 * Used when a contact initiates reconnection
 */
export function setupSignalingHandler(
  onOffer: (
    peerId: string,
    offer: RTCSessionDescriptionInit
  ) => Promise<RTCSessionDescriptionInit>
): void {
  handleSignalingStreams(async (stream: Stream, peerId: string) => {
    console.log('[signaling] Handling incoming signaling from:', peerId);

    try {
      // Receive offer
      const offerMessage = await receiveMessage(stream);

      if (offerMessage.type !== SignalingMessageType.OFFER) {
        throw new Error(`Expected OFFER, got ${offerMessage.type}`);
      }

      const sdpOffer: RTCSessionDescriptionInit = JSON.parse(offerMessage.payload);
      console.log('[signaling] Received SDP offer');

      // Process offer and generate answer
      const sdpAnswer = await onOffer(peerId, sdpOffer);

      // Send answer
      const answerMessage: SignalingMessage = {
        type: SignalingMessageType.ANSWER,
        payload: JSON.stringify(sdpAnswer),
        timestamp: Date.now(),
      };

      await sendMessage(stream, answerMessage);
      console.log('[signaling] Sent SDP answer');
    } catch (error) {
      console.error('[signaling] Error handling signaling:', error);

      // Send error message
      try {
        const errorMessage: SignalingMessage = {
          type: SignalingMessageType.ERROR,
          payload: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        };
        await sendMessage(stream, errorMessage);
      } catch {
        // Ignore send errors
      }
    } finally {
      await stream.close();
    }
  });
}

/**
 * Exchange messages: send one, receive one
 */
async function exchangeMessages(
  stream: Stream,
  outgoing: SignalingMessage
): Promise<SignalingMessage> {
  const source = pushable<Uint8Array>({ objectMode: true });

  // Encode and queue the outgoing message
  const encoded = encodeMessage(outgoing);
  source.push(encoded);
  source.end();

  let response: SignalingMessage | null = null;

  await pipe(
    source,
    encode,
    stream,
    decode,
    async (source) => {
      for await (const data of source) {
        response = decodeMessage(data.subarray());
        break; // Only expect one response
      }
    }
  );

  if (!response) {
    throw new Error('No response received');
  }

  return response;
}

/**
 * Send a single message
 */
async function sendMessage(stream: Stream, message: SignalingMessage): Promise<void> {
  const source = pushable<Uint8Array>({ objectMode: true });
  const encoded = encodeMessage(message);
  source.push(encoded);
  source.end();

  await pipe(
    source,
    encode,
    stream.sink
  );
}

/**
 * Receive a single message
 */
async function receiveMessage(stream: Stream): Promise<SignalingMessage> {
  let message: SignalingMessage | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Signaling timeout')), TIMEOUTS.SIGNALING_HANDSHAKE);
  });

  const receivePromise = pipe(
    stream.source,
    decode,
    async (source) => {
      for await (const data of source) {
        message = decodeMessage(data.subarray());
        break;
      }
    }
  );

  await Promise.race([receivePromise, timeoutPromise]);

  if (!message) {
    throw new Error('No message received');
  }

  return message;
}

/**
 * Check if a peer is reachable via libp2p
 * Attempts a lightweight connection check
 */
export async function isPeerReachable(peerIdString: string): Promise<boolean> {
  const node = getNode();
  if (!node) {
    return false;
  }

  const connections = node.node.getConnections();
  return connections.some(conn => conn.remotePeer.toString() === peerIdString);
}

/**
 * Get connection info for a peer
 */
export function getPeerConnectionInfo(peerIdString: string): {
  connected: boolean;
  relayAddrs: string[];
} {
  const node = getNode();
  if (!node) {
    return { connected: false, relayAddrs: [] };
  }

  const connections = node.node.getConnections();
  const peerConnections = connections.filter(
    conn => conn.remotePeer.toString() === peerIdString
  );

  if (peerConnections.length === 0) {
    return { connected: false, relayAddrs: [] };
  }

  const relayAddrs = peerConnections
    .map(conn => conn.remoteAddr.toString())
    .filter(addr => addr.includes('/p2p-circuit/'));

  return {
    connected: true,
    relayAddrs,
  };
}
