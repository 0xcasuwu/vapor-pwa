/**
 * CreateGroup.tsx
 * Vapor PWA - Star Topology Group Chat Creation
 *
 * Host flow (similar to InitiatorFlow):
 * 1. Show disclaimer about host responsibility
 * 2. Create group and generate invite code
 * 3. Wait for members to send their response codes
 * 4. Paste each member's response and send final code
 * 5. Start chat when at least one member connected
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGroupStore } from '../store/groupStore';
import { useIdentityStore } from '../store/identityStore';
import {
  generateGroupInvite,
  encodeGroupInviteToBase64,
} from '../crypto/GroupQRPayload';
import { WebRTCChannel, type ConnectionState } from '../crypto/WebRTCChannel';

interface CreateGroupProps {
  onBack: () => void;
  onGroupCreated: () => void;
}

type HostStep = 'disclaimer' | 'create_form' | 'showing_invite' | 'waiting_response' | 'sending_final' | 'ready';

interface PendingMember {
  fingerprint: string;
  nickname: string;
  channel: WebRTCChannel;
  answerSdp?: string;
}

export function CreateGroup({ onBack, onGroupCreated }: CreateGroupProps) {
  const [step, setStep] = useState<HostStep>('disclaimer');
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [finalCode, setFinalCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { createGroup, activeGroup, addMember, setMemberChannel } = useGroupStore();
  // Keep hook call for reactivity, but read identity/fingerprint from getState() to avoid stale closures
  useIdentityStore();

  const pendingMembersRef = useRef<Map<string, PendingMember>>(new Map());
  const hostChannelRef = useRef<WebRTCChannel | null>(null);
  const currentOfferSdpRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pendingMembersRef.current.forEach(member => member.channel.close());
      if (hostChannelRef.current) {
        hostChannelRef.current.close();
      }
    };
  }, []);

  const handleAcceptDisclaimer = () => {
    setStep('create_form');
  };

  const handleCreateGroup = async () => {
    const { identity, fingerprint } = useIdentityStore.getState();
    if (!groupName.trim() || !identity || !fingerprint) return;

    setIsCreating(true);
    setError(null);

    try {
      // Create the group in state
      const group = createGroup(
        groupName.trim(),
        fingerprint,
        'Host'
      );

      // Create WebRTC channel for the first member connection
      const hostChannel = new WebRTCChannel({
        onMessage: (data: Uint8Array) => {
          try {
            const message = JSON.parse(new TextDecoder().decode(data));
            handleIncomingMessage(message, hostChannel);
          } catch (e) {
            console.error('[Group] Failed to parse message:', e);
          }
        },
        onStateChange: (state: ConnectionState) => {
          console.log('[Group] Host channel state:', state);
          if (state === 'connected') {
            // Member connected successfully
            console.log('[Group] Member connected!');
          }
        },
        onSignalingData: () => {
          // Signaling handled via copy/paste
        },
      });

      hostChannelRef.current = hostChannel;

      // Initialize as initiator and get offer
      const offerJson = await hostChannel.initAsInitiator();
      const offer = JSON.parse(offerJson);
      currentOfferSdpRef.current = offer.sdp;

      // Generate invite payload
      const invite = generateGroupInvite(
        group.id,
        group.name,
        identity.publicKey,
        'Host',
        offer.sdp
      );

      const inviteBase64 = encodeGroupInviteToBase64(invite);
      setInviteCode(inviteBase64);
      setStep('showing_invite');

    } catch (err) {
      console.error('[Group] Failed to create group:', err);
      setError('Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleIncomingMessage = (message: Record<string, unknown>, channel: WebRTCChannel) => {
    if (message.type === 'join_request' && message.fingerprint && message.nickname) {
      const memberFingerprint = message.fingerprint as string;
      const memberNickname = message.nickname as string;
      const memberPublicKey = message.publicKey as string | undefined;

      console.log(`[Group] Join request from ${memberNickname}`);

      // Add member to group
      addMember({
        id: memberFingerprint,
        fingerprint: memberFingerprint,
        nickname: memberNickname,
        publicKey: memberPublicKey
          ? Uint8Array.from(atob(memberPublicKey), c => c.charCodeAt(0))
          : new Uint8Array(32),
        joinedAt: Date.now(),
        channel,
      });

      // Store channel reference
      setMemberChannel(memberFingerprint, channel);

      // Send confirmation
      const confirmMessage = JSON.stringify({
        type: 'join_accepted',
        groupId: activeGroup?.id,
        groupName: activeGroup?.name,
      });
      channel.send(new TextEncoder().encode(confirmMessage));
    }
  };

  const handleCopyInvite = useCallback(async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [inviteCode]);

  const handleNextStep = () => {
    setStep('waiting_response');
    setPasteValue('');
    setError(null);
  };

  const handleProcessResponse = async () => {
    if (!pasteValue.trim() || !hostChannelRef.current) {
      setError('Please paste the response code');
      return;
    }

    setError(null);

    try {
      // Parse the member's response (contains their answer SDP)
      const responseData = JSON.parse(atob(pasteValue.trim()));

      if (!responseData.answerSdp) {
        setError('Invalid response code - missing answer');
        return;
      }

      // Process the answer SDP to complete the WebRTC connection
      const answerJson = JSON.stringify({ type: 'answer', sdp: responseData.answerSdp });
      await hostChannelRef.current.completeConnection(answerJson);

      // Generate final confirmation code for the member
      const finalData = {
        type: 'group_final',
        groupId: activeGroup?.id,
        confirmed: true,
      };
      setFinalCode(btoa(JSON.stringify(finalData)));
      setStep('sending_final');
      setCopied(false);

    } catch (err) {
      console.error('[Group] Failed to process response:', err);
      setError('Invalid response code. Please check and try again.');
    }
  };

  const handleCopyFinal = useCallback(async () => {
    if (!finalCode) return;
    try {
      await navigator.clipboard.writeText(finalCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [finalCode]);

  const handleMemberConnected = () => {
    setStep('ready');
    setPasteValue('');
    setFinalCode(null);
  };

  const handleAddAnotherMember = async () => {
    // Create a new WebRTC channel for the next member
    const { identity } = useIdentityStore.getState();
    if (!identity || !activeGroup) return;

    try {
      const newChannel = new WebRTCChannel({
        onMessage: (data: Uint8Array) => {
          try {
            const message = JSON.parse(new TextDecoder().decode(data));
            handleIncomingMessage(message, newChannel);
          } catch (e) {
            console.error('[Group] Failed to parse message:', e);
          }
        },
        onStateChange: (state: ConnectionState) => {
          console.log('[Group] New member channel state:', state);
        },
        onSignalingData: () => {},
      });

      hostChannelRef.current = newChannel;

      // Generate new offer
      const offerJson = await newChannel.initAsInitiator();
      const offer = JSON.parse(offerJson);
      currentOfferSdpRef.current = offer.sdp;

      // Generate new invite with updated offer
      const invite = generateGroupInvite(
        activeGroup.id,
        activeGroup.name,
        identity.publicKey,
        'Host',
        offer.sdp
      );

      setInviteCode(encodeGroupInviteToBase64(invite));
      setStep('showing_invite');
      setCopied(false);

    } catch (err) {
      console.error('[Group] Failed to create new invite:', err);
      setError('Failed to generate new invite. Please try again.');
    }
  };

  // Disclaimer screen
  if (step === 'disclaimer') {
    return (
      <div className="create-group-container">
        <div className="group-disclaimer">
          <div className="disclaimer-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>

          <h2>Host Responsibility</h2>

          <div className="disclaimer-content">
            <div className="disclaimer-item">
              <span className="disclaimer-bullet">1</span>
              <div>
                <strong>You are the relay</strong>
                <p>All group messages flow through your device. If you close this tab, the group chat stops working.</p>
              </div>
            </div>

            <div className="disclaimer-item">
              <span className="disclaimer-bullet">2</span>
              <div>
                <strong>Keep this tab open</strong>
                <p>Your browser must stay open and connected for members to communicate.</p>
              </div>
            </div>

            <div className="disclaimer-item">
              <span className="disclaimer-bullet">3</span>
              <div>
                <strong>No persistence</strong>
                <p>When you leave, the group ends. Messages are not stored anywhere.</p>
              </div>
            </div>

            <div className="disclaimer-item">
              <span className="disclaimer-bullet">4</span>
              <div>
                <strong>Privacy preserved</strong>
                <p>Messages are end-to-end encrypted. You relay encrypted data you cannot read.</p>
              </div>
            </div>
          </div>

          <div className="disclaimer-warning">
            This is how serverless group chat works. One person must host.
          </div>

          <div className="disclaimer-actions">
            <button className="btn-secondary" onClick={onBack}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleAcceptDisclaimer}>
              I Understand, Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Create form
  if (step === 'create_form') {
    return (
      <div className="create-group-container">
        <div className="create-group-form">
          <h2>Create Group Chat</h2>

          <div className="form-field">
            <label htmlFor="groupName">Group Name</label>
            <input
              id="groupName"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name..."
              maxLength={50}
              autoFocus
            />
          </div>

          <div className="host-badge">
            <span className="host-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
              </svg>
            </span>
            You will be the host
          </div>

          {error && (
            <div className="error-message">
              <span>{error}</span>
            </div>
          )}

          <div className="form-actions">
            <button className="btn-secondary" onClick={onBack}>
              Back
            </button>
            <button
              className="btn-primary"
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Showing invite code
  if (step === 'showing_invite') {
    return (
      <div className="create-group-container">
        <div className="connection-flow">
          <div className="flow-step">
            <div className="step-header">
              <span className="step-number">1</span>
              <h2>Share Invite Code</h2>
            </div>

            <p className="step-description">
              Send this invite code to members via any messenger
            </p>

            <div className="code-container">
              <div className="code-preview">
                {inviteCode ? (
                  <code>{inviteCode.substring(0, 50)}...</code>
                ) : (
                  <span className="loading">Generating...</span>
                )}
              </div>

              <button
                className="btn-copy"
                onClick={handleCopyInvite}
                disabled={!inviteCode}
              >
                <CopyIcon />
                <span>{copied ? 'Copied!' : 'Copy Invite Code'}</span>
              </button>
            </div>

            <div className="group-name-badge">
              Group: {activeGroup?.name}
            </div>

            <div className="flow-actions">
              <button className="btn-primary" onClick={handleNextStep} disabled={!inviteCode}>
                Next: Paste Their Response
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

  // Step 2: Waiting for member response
  if (step === 'waiting_response') {
    return (
      <div className="create-group-container">
        <div className="connection-flow">
          <div className="flow-step">
            <div className="step-header">
              <span className="step-number">2</span>
              <h2>Paste Member Response</h2>
            </div>

            <p className="step-description">
              The member will send back a response code
            </p>

            <div className="paste-container">
              <textarea
                className="paste-input"
                placeholder="Paste the response code here..."
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                rows={4}
              />

              <button
                className="btn-primary"
                onClick={handleProcessResponse}
                disabled={!pasteValue.trim()}
              >
                <CheckIcon />
                <span>Process Response</span>
              </button>
            </div>

            {error && (
              <div className="error-message">
                <span>{error}</span>
              </div>
            )}

            <button className="btn-text" onClick={() => setStep('showing_invite')}>
              ← Back to invite
            </button>
          </div>

          <button className="btn-cancel" onClick={onBack}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Step 3: Send final code
  if (step === 'sending_final') {
    return (
      <div className="create-group-container">
        <div className="connection-flow">
          <div className="flow-step">
            <div className="step-header">
              <span className="step-number">3</span>
              <h2>Send Final Code</h2>
            </div>

            <p className="step-description">
              Send this final code to complete the member's connection
            </p>

            <div className="code-container">
              <div className="code-preview">
                {finalCode ? (
                  <code>{finalCode.substring(0, 50)}...</code>
                ) : (
                  <span className="loading">Generating...</span>
                )}
              </div>

              <button
                className="btn-copy"
                onClick={handleCopyFinal}
                disabled={!finalCode}
              >
                <CopyIcon />
                <span>{copied ? 'Copied!' : 'Copy Final Code'}</span>
              </button>
            </div>

            <p className="step-hint">
              Once they paste this code, they'll be connected to the group.
            </p>

            <div className="flow-actions">
              <button className="btn-primary" onClick={handleMemberConnected}>
                Member Connected
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

  // Ready state - can start chat or add more members
  if (step === 'ready') {
    return (
      <div className="create-group-container">
        <div className="group-invite-display">
          <h2>Group Ready</h2>
          <p className="group-name-display">{activeGroup?.name}</p>

          <div className="member-count">
            <span className="member-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
            </span>
            {(activeGroup?.members.length || 0) + 1} members (including you)
          </div>

          <div className="invite-actions">
            <button className="btn-secondary" onClick={handleAddAnotherMember}>
              Add Another Member
            </button>
            <button
              className="btn-primary"
              onClick={onGroupCreated}
            >
              Start Chat
            </button>
          </div>

          <div className="host-reminder">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            Remember: Keep this tab open to host the group
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
