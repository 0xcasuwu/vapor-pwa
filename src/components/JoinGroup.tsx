/**
 * JoinGroup.tsx
 * Vapor PWA - Star Topology Group Chat Joining
 *
 * Member flow (similar to ResponderFlow):
 * 1. Paste host's invite code
 * 2. Generate and copy response code for host
 * 3. Paste host's final code
 * 4. Connection established, enter group chat
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

type JoinStep = 'paste_invite' | 'showing_response' | 'paste_final' | 'connecting' | 'connected' | 'error';

export function JoinGroup({ onBack, onJoined }: JoinGroupProps) {
  const [step, setStep] = useState<JoinStep>('paste_invite');
  const [pasteValue, setPasteValue] = useState('');
  const [invite, setInvite] = useState<GroupInvitePayload | null>(null);
  const [hostFingerprint, setHostFingerprint] = useState<string>('');
  const [responseCode, setResponseCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep hook call for reactivity, but read identity/fingerprint from getState() to avoid stale closures
  useIdentityStore();
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

      // Get host fingerprint for display
      const fp = await getHostFingerprint(decoded.hostPublicKey);
      setHostFingerprint(fp);
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
    const { identity, fingerprint } = useIdentityStore.getState();
    if (!identity || !fingerprint) {
      setError('Identity not ready. Please try again.');
      return;
    }

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

          if (newState === 'connected') {
            console.log('[JoinGroup] Connected! Sending join request...');
            sendJoinRequest(channel);
          } else if (newState === 'disconnected' || newState === 'failed') {
            // Don't show error during initial setup
            if (step === 'connecting') {
              setError('Connection lost. Please try again.');
              setStep('error');
            }
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
          hostFingerprint: hostFingerprint,
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

  const handleNextStep = () => {
    setStep('paste_final');
    setPasteValue('');
    setError(null);
  };

  const handlePasteFinal = useCallback(async () => {
    if (!pasteValue.trim()) {
      setError('Please paste the final code');
      return;
    }

    setError(null);

    try {
      // Parse the host's final confirmation
      const finalData = JSON.parse(atob(pasteValue.trim()));

      if (finalData.type !== 'group_final' || !finalData.confirmed) {
        setError('Invalid final code. Please check and try again.');
        return;
      }

      // The WebRTC connection should already be establishing
      // Mark as connecting and wait for the channel to connect
      setStep('connecting');
      setConnectionState('connecting');

      // The onStateChange callback will handle transitioning to connected

    } catch (err) {
      console.error('[JoinGroup] Failed to process final code:', err);
      setError('Invalid final code. Please check and try again.');
    }
  }, [pasteValue, setConnectionState]);

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

  // Step 2: Show response code
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
              Send this response code back to the host
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
              <button className="btn-primary" onClick={handleNextStep} disabled={!responseCode}>
                Next: Paste Host's Final Code
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

  // Step 3: Paste final code
  if (step === 'paste_final') {
    return (
      <div className="join-group-container">
        <div className="connection-flow">
          <div className="flow-step">
            <div className="step-header">
              <span className="step-number">3</span>
              <h2>Paste Final Code</h2>
            </div>

            <p className="step-description">
              Paste the final code the host sends back
            </p>

            <div className="paste-container">
              <textarea
                className="paste-input"
                placeholder="Paste the final code here..."
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                rows={4}
              />

              <button
                className="btn-primary"
                onClick={handlePasteFinal}
                disabled={!pasteValue.trim()}
              >
                <CheckIcon />
                <span>Complete Connection</span>
              </button>
            </div>

            {error && (
              <div className="error-message">
                <span>{error}</span>
              </div>
            )}

            <button className="btn-text" onClick={() => setStep('showing_response')}>
              ← Back to response
            </button>
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
          <h2>Connecting...</h2>
          <p className="connection-status">Establishing connection to group</p>
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
            <button className="btn-primary" onClick={() => setStep('paste_invite')}>
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
