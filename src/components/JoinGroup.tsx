/**
 * JoinGroup.tsx
 * Vapor PWA - Star Topology Group Chat Joining
 *
 * Member flow (2-step, matching P2P pattern):
 * 1. Paste host's invite code
 * 2. Copy response code for host, then wait for connection
 * Connection establishes automatically when host processes the response.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
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

type JoinStep = 'paste_invite' | 'showing_response' | 'connecting' | 'connected' | 'error';

export function JoinGroup({ onBack, onJoined }: JoinGroupProps) {
  const [step, setStep] = useState<JoinStep>('paste_invite');
  const [pasteValue, setPasteValue] = useState('');
  const [invite, setInvite] = useState<GroupInvitePayload | null>(null);
  const [responseCode, setResponseCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep hook call for reactivity, but read identity/fingerprint from getState() to avoid stale closures
  useIdentityStore();
  const { joinGroup, setConnectionState } = useGroupStore();

  const channelRef = useRef<WebRTCChannel | null>(null);
  const stepRef = useRef<JoinStep>(step);
  stepRef.current = step;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, []);

  const handlePasteInvite = useCallback(async () => {
    if (!pasteValue.trim()) {
      setError('Please paste the invite code');
      return;
    }

    setError(null);

    try {
      const decoded = decodeGroupInviteFromBase64(pasteValue.trim());

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

      setInvite(decoded);

      // Process the invite and generate response
      await processInviteAndGenerateResponse(decoded);

    } catch (err) {
      console.error('[JoinGroup] Failed to process invite:', err);
      setError('Failed to process invite code. Please try again.');
    }
  }, [pasteValue]);

  const processInviteAndGenerateResponse = async (inviteData: GroupInvitePayload) => {
    // Read directly from store to avoid stale closure
    let { identity, fingerprint, state: idState } = useIdentityStore.getState();

    // If identity not loaded yet, try re-initializing and wait
    if (!identity || !fingerprint) {
      console.warn(`[JoinGroup] Identity not ready (state=${idState}), retrying initialize...`);
      await useIdentityStore.getState().initialize();
      const refreshed = useIdentityStore.getState();
      identity = refreshed.identity;
      fingerprint = refreshed.fingerprint;
      idState = refreshed.state;
    }

    if (!identity || !fingerprint) {
      console.error(`[JoinGroup] Identity still not ready after retry (state=${idState}, identity=${!!identity}, fingerprint=${fingerprint})`);
      setError(`Identity not ready (state: ${idState}). Please go back and try again.`);
      return;
    }

    // Get host fingerprint for display
    const fp = await getHostFingerprint(inviteData.hostPublicKey);

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
          console.log('[JoinGroup] Channel state:', newState, 'current step:', stepRef.current);

          if (newState === 'connected') {
            console.log('[JoinGroup] Connected! Sending join request...');
            sendJoinRequest(channel);
          } else if (newState === 'failed') {
            // Only show error if we haven't already connected
            if (stepRef.current !== 'connected') {
              setError('Connection failed. Make sure the host has processed your response code.');
              setStep('error');
            }
          } else if (newState === 'disconnected' && stepRef.current === 'connecting') {
            setError('Connection lost. Please try again.');
            setStep('error');
          }
        },
        onSignalingData: () => {
          // Signaling handled via copy/paste
        },
      });

      channelRef.current = channel;

      // Process the host's offer SDP
      if (inviteData.offerSdp) {
        const offerJson = JSON.stringify({ type: 'offer', sdp: inviteData.offerSdp });
        const answerJson = await channel.initAsResponder(offerJson);
        const answer = JSON.parse(answerJson);

        // Generate response code containing our answer SDP
        const responseData = {
          type: 'group_response',
          groupId: inviteData.groupId,
          fingerprint: fingerprint,
          nickname: 'Member',
          answerSdp: answer.sdp,
          publicKey: btoa(String.fromCharCode(...identity.publicKey)),
        };

        setResponseCode(btoa(JSON.stringify(responseData)));
        setStep('showing_response');

        // Join the group in state (pending connection)
        joinGroup({
          id: inviteData.groupId,
          name: inviteData.groupName,
          hostFingerprint: fp,
          hostNickname: inviteData.hostNickname,
          createdAt: inviteData.timestamp * 1000,
        });
      } else {
        setError('Invalid invite - missing connection data.');
      }

    } catch (err) {
      console.error('[JoinGroup] Failed to generate response:', err);
      setError('Failed to generate response. Please try again.');
    }
  };

  const sendJoinRequest = (channel: WebRTCChannel) => {
    const { identity, fingerprint } = useIdentityStore.getState();
    if (!identity || !fingerprint) return;

    const publicKeyBase64 = btoa(String.fromCharCode(...identity.publicKey));

    const message = JSON.stringify({
      type: 'join_request',
      fingerprint,
      nickname: 'Member',
      publicKey: publicKeyBase64,
    });

    channel.send(new TextEncoder().encode(message));
  };

  const handleMessage = (message: { type: string; groupId?: string; groupName?: string }) => {
    if (message.type === 'join_accepted') {
      console.log('[JoinGroup] Join accepted!');
      setConnectionState('connected');
      setStep('connected');

      // Transition to chat
      setTimeout(() => {
        onJoined();
      }, 500);
    } else if (message.type === 'join_rejected') {
      setError('Host rejected your join request.');
      setStep('error');
    }
  };

  const handleCopyResponse = useCallback(async () => {
    if (!responseCode) return;
    try {
      await navigator.clipboard.writeText(responseCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [responseCode]);

  // After copying response, go straight to connecting (no "paste final" step needed)
  const handleWaitForConnection = () => {
    setStep('connecting');
    setConnectionState('connecting');

    // Timeout if connection doesn't establish within 60 seconds
    // (generous timeout to allow for manual copy-paste between devices)
    setTimeout(() => {
      if (stepRef.current === 'connecting') {
        setError('Connection timed out. Make sure the host pastes your response code.');
        setStep('error');
      }
    }, 60000);
  };

  // Step 1: Paste invite code
  if (step === 'paste_invite') {
    return (
      <div className="join-group-container">
        <div className="connection-flow">
          <div className="flow-step">
            <div className="step-header">
              <span className="step-number">1</span>
              <h2>Paste Invite Code</h2>
            </div>

            <p className="step-description">
              Paste the invite code the host shared with you
            </p>

            <div className="paste-container">
              <textarea
                className="paste-input"
                placeholder="Paste the invite code here..."
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                rows={4}
              />

              <button
                className="btn-primary"
                onClick={handlePasteInvite}
                disabled={!pasteValue.trim()}
              >
                <CheckIcon />
                <span>Process Invite</span>
              </button>
            </div>

            {error && (
              <div className="error-message">
                <span>{error}</span>
              </div>
            )}
          </div>

          <button className="btn-cancel" onClick={onBack}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Show response code, then wait for connection
  if (step === 'showing_response' && invite) {
    return (
      <div className="join-group-container">
        <div className="connection-flow">
          <div className="flow-step">
            <div className="step-header">
              <span className="step-number">2</span>
              <h2>Send Your Response</h2>
            </div>

            <p className="step-description">
              Copy this code and send it to the host. Once they process it, you'll connect automatically.
            </p>

            <div className="code-container">
              <div className="code-preview">
                {responseCode ? (
                  <code>{responseCode.substring(0, 50)}...</code>
                ) : (
                  <span className="loading">Generating...</span>
                )}
              </div>

              <button
                className="btn-copy"
                onClick={handleCopyResponse}
                disabled={!responseCode}
              >
                <CopyIcon />
                <span>{copied ? 'Copied!' : 'Copy Response Code'}</span>
              </button>
            </div>

            <div className="group-info-badge">
              <span>Joining: {invite.groupName}</span>
              <span className="host-info">Host: {invite.hostNickname}</span>
            </div>

            <div className="flow-actions">
              <button className="btn-primary" onClick={handleWaitForConnection} disabled={!responseCode}>
                I've Sent The Code
              </button>
            </div>
          </div>

          <button className="btn-cancel" onClick={onBack}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Connecting state
  if (step === 'connecting') {
    return (
      <div className="join-group-container">
        <div className="join-group-connecting">
          <div className="connecting-spinner" />
          <h2>Waiting for Host...</h2>
          <p className="connection-status">The host needs to paste your response code</p>
          <p className="connection-group">Joining: {invite?.groupName}</p>
        </div>
      </div>
    );
  }

  // Connected state (brief transition)
  if (step === 'connected') {
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
  if (step === 'error') {
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
            <button className="btn-primary" onClick={() => { setStep('paste_invite'); setPasteValue(''); setError(null); }}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Icons
function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
