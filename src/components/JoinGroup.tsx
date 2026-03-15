/**
 * JoinGroup.tsx
 * Vapor PWA - Star Topology Group Chat Joining
 *
 * This component handles joining an existing group:
 * 1. Scan QR code with group invite
 * 2. Connect to host via WebRTC
 * 3. Enter the group chat
 *
 * Members connect directly to host, who relays all messages.
 */

import { useState, useRef, useEffect } from 'react';
import { useIdentityStore } from '../store/identityStore';
import { useGroupStore } from '../store/groupStore';
import {
  decodeGroupInviteFromBase64,
  isGroupInviteExpired,
  isValidGroupInvite,
  getHostFingerprint,
  type GroupInvitePayload,
} from '../crypto/GroupQRPayload';
import { WebRTCChannel, type ConnectionState } from '../crypto/WebRTCChannel';

interface JoinGroupProps {
  onBack: () => void;
  onJoined: () => void;
}

type JoinState = 'entering' | 'confirming' | 'connecting' | 'connected' | 'error';

export function JoinGroup({ onBack, onJoined }: JoinGroupProps) {
  const [state, setState] = useState<JoinState>('entering');
  const [inviteCode, setInviteCode] = useState('');
  const [invite, setInvite] = useState<GroupInvitePayload | null>(null);
  const [hostFingerprint, setHostFingerprint] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');

  const { identity, fingerprint } = useIdentityStore();
  const { joinGroup, setConnectionState } = useGroupStore();

  const channelRef = useRef<WebRTCChannel | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, []);

  const handlePasteInvite = async () => {
    try {
      const text = await navigator.clipboard.readText();
      processInviteCode(text.trim());
    } catch {
      setError('Failed to read clipboard. Please paste the code manually.');
    }
  };

  const processInviteCode = async (code: string) => {
    setError(null);
    setInviteCode(code);

    const decoded = decodeGroupInviteFromBase64(code);

    if (!decoded) {
      setError('Invalid invite code. Please check and try again.');
      return;
    }

    if (!isValidGroupInvite(decoded)) {
      setError('Malformed invite. Missing required fields.');
      return;
    }

    if (isGroupInviteExpired(decoded)) {
      setError('This invite has expired. Ask the host for a new one.');
      return;
    }

    // Get host fingerprint for display
    const fp = await getHostFingerprint(decoded.hostPublicKey);
    setHostFingerprint(fp);
    setInvite(decoded);
    setState('confirming');
  };

  const handleConfirmJoin = async () => {
    if (!invite || !identity || !fingerprint) return;

    setState('connecting');
    setConnectionStatus('Setting up connection...');

    try {
      // Create WebRTC channel
      const channel = new WebRTCChannel({
        onMessage: (data: Uint8Array) => {
          try {
            const message = JSON.parse(new TextDecoder().decode(data));
            handleMessage(message);
          } catch (e) {
            console.error('[JoinGroup] Failed to parse message:', e);
          }
        },
        onStateChange: (newState: ConnectionState) => {
          console.log('[JoinGroup] Channel state:', newState);

          switch (newState) {
            case 'connecting':
              setConnectionStatus('Connecting to host...');
              break;
            case 'connected':
              setConnectionStatus('Connected! Sending join request...');
              sendJoinRequest(channel);
              break;
            case 'disconnected':
            case 'failed':
              setError('Connection lost. Please try again.');
              setState('error');
              break;
          }
        },
        onSignalingData: () => {
          // Handle signaling data if needed
        },
      });

      channelRef.current = channel;

      // Process the host's offer SDP
      if (invite.offerSdp) {
        setConnectionStatus('Processing host offer...');
        const offerJson = JSON.stringify({ type: 'offer', sdp: invite.offerSdp });
        await channel.initAsResponder(offerJson);
        setConnectionStatus('Waiting for connection...');
      }

      // Join the group in state
      joinGroup({
        id: invite.groupId,
        name: invite.groupName,
        hostFingerprint: hostFingerprint,
        hostNickname: invite.hostNickname,
        createdAt: invite.timestamp * 1000,
      });

      setConnectionState('connecting');

    } catch (err) {
      console.error('[JoinGroup] Failed to connect:', err);
      setError('Failed to connect to group. Please try again.');
      setState('error');
    }
  };

  const sendJoinRequest = (channel: WebRTCChannel) => {
    if (!identity || !fingerprint) return;

    const publicKeyBase64 = btoa(String.fromCharCode(...identity.publicKey));

    const message = JSON.stringify({
      type: 'join_request',
      fingerprint,
      nickname: 'Anonymous',
      publicKey: publicKeyBase64,
    });

    channel.send(new TextEncoder().encode(message));
  };

  const handleMessage = (message: { type: string; groupId?: string; groupName?: string }) => {
    if (message.type === 'join_accepted') {
      console.log('[JoinGroup] Join accepted!');
      setConnectionState('connected');
      setState('connected');

      // Transition to chat
      setTimeout(() => {
        onJoined();
      }, 500);
    } else if (message.type === 'join_rejected') {
      setError('Host rejected your join request.');
      setState('error');
    }
  };

  // Entering state - enter invite code
  if (state === 'entering') {
    return (
      <div className="join-group-container">
        <div className="join-group-form">
          <h2>Join Group Chat</h2>

          <div className="join-instructions">
            <p>Enter or paste the group invite code shared by the host.</p>
          </div>

          <div className="form-field">
            <label htmlFor="inviteCode">Invite Code</label>
            <textarea
              id="inviteCode"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Paste invite code here..."
              rows={4}
            />
          </div>

          {error && (
            <div className="join-error">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              {error}
            </div>
          )}

          <div className="form-actions">
            <button className="btn-secondary" onClick={onBack}>
              Back
            </button>
            <button className="btn-secondary" onClick={handlePasteInvite}>
              Paste from Clipboard
            </button>
            <button
              className="btn-primary"
              onClick={() => processInviteCode(inviteCode)}
              disabled={!inviteCode.trim()}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirming state - show group info before joining
  if (state === 'confirming' && invite) {
    return (
      <div className="join-group-container">
        <div className="join-group-confirm">
          <h2>Join Group?</h2>

          <div className="group-info-card">
            <div className="group-info-name">{invite.groupName}</div>
            <div className="group-info-host">
              <span className="label">Hosted by:</span>
              <span className="value">{invite.hostNickname}</span>
            </div>
            <div className="group-info-fingerprint">
              <span className="label">Host ID:</span>
              <span className="value mono">{hostFingerprint}</span>
            </div>
          </div>

          <div className="join-reminder">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            <div>
              <strong>Note:</strong> Group messages are relayed through the host.
              If the host disconnects, the group chat will end.
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setState('entering')}>
              Back
            </button>
            <button className="btn-primary" onClick={handleConfirmJoin}>
              Join Group
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Connecting state
  if (state === 'connecting') {
    return (
      <div className="join-group-container">
        <div className="join-group-connecting">
          <div className="connecting-spinner" />
          <h2>Connecting...</h2>
          <p className="connection-status">{connectionStatus}</p>
          <p className="connection-group">Joining: {invite?.groupName}</p>
        </div>
      </div>
    );
  }

  // Connected state (brief transition)
  if (state === 'connected') {
    return (
      <div className="join-group-container">
        <div className="join-group-success">
          <div className="success-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <h2>Connected!</h2>
          <p>Entering group chat...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="join-group-container">
        <div className="join-group-error">
          <div className="error-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </div>
          <h2>Connection Failed</h2>
          <p className="error-message">{error}</p>
          <div className="form-actions">
            <button className="btn-secondary" onClick={onBack}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => setState('entering')}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
