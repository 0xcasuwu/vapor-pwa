/**
 * CreateGroup.tsx
 * Vapor PWA - Star Topology Group Chat Creation
 *
 * This component handles group creation with important disclaimers:
 * 1. Host must keep browser tab open for group to function
 * 2. All messages relay through the host
 * 3. Group disappears when host disconnects
 *
 * Star topology design enables group chat without a central server,
 * but requires one user (host) to act as the relay node.
 */

import { useState, useEffect, useRef } from 'react';
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

export function CreateGroup({ onBack, onGroupCreated }: CreateGroupProps) {
  const [groupName, setGroupName] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [inviteQR, setInviteQR] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { createGroup, activeGroup, addMember, setMemberChannel } = useGroupStore();
  const { identity, fingerprint } = useIdentityStore();

  const webrtcChannelsRef = useRef<Map<string, WebRTCChannel>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webrtcChannelsRef.current.forEach(channel => channel.close());
    };
  }, []);

  const handleAcceptDisclaimer = () => {
    setShowDisclaimer(false);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || !identity || !fingerprint) return;

    setIsCreating(true);

    try {
      // Create the group in state
      const group = createGroup(
        groupName.trim(),
        fingerprint,
        'Host' // Default nickname
      );

      // Create WebRTC channel for accepting connections
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
        },
        onSignalingData: () => {
          // Handle signaling data if needed
        },
      });

      // Initialize as initiator and get offer
      const offerJson = await hostChannel.initAsInitiator();
      const offer = JSON.parse(offerJson);

      // Generate invite payload
      const invite = generateGroupInvite(
        group.id,
        group.name,
        identity.publicKey,
        'Host',
        offer.sdp
      );

      const inviteBase64 = encodeGroupInviteToBase64(invite);
      setInviteQR(inviteBase64);

    } catch (error) {
      console.error('[Group] Failed to create group:', error);
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
      webrtcChannelsRef.current.set(memberFingerprint, channel);

      // Send confirmation
      const confirmMessage = JSON.stringify({
        type: 'join_accepted',
        groupId: activeGroup?.id,
        groupName: activeGroup?.name,
        members: activeGroup?.members.map(m => ({
          fingerprint: m.fingerprint,
          nickname: m.nickname,
        })),
      });
      channel.send(new TextEncoder().encode(confirmMessage));
    }
  };

  const handleCopyInvite = () => {
    if (inviteQR) {
      navigator.clipboard.writeText(inviteQR);
    }
  };

  // Disclaimer screen
  if (showDisclaimer) {
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

  // Group creation form
  if (!inviteQR) {
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

  // Show invite code for copy/paste
  return (
    <div className="create-group-container">
      <div className="group-invite-display">
        <h2>Share Invite Code</h2>
        <p className="group-name-display">{activeGroup?.name}</p>

        <div className="invite-code-display">
          <textarea
            readOnly
            value={inviteQR}
            rows={4}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </div>

        <p className="invite-instruction">
          Copy this code and share it with others to invite them
        </p>

        <div className="member-count">
          <span className="member-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </span>
          {activeGroup?.members.length || 0} members connected
        </div>

        <div className="invite-actions">
          <button className="btn-secondary" onClick={handleCopyInvite}>
            Copy to Clipboard
          </button>
          <button
            className="btn-primary"
            onClick={onGroupCreated}
            disabled={(activeGroup?.members.length || 0) === 0}
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
