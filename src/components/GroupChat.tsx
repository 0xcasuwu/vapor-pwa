/**
 * GroupChat.tsx
 * Vapor PWA - Star Topology Group Chat Interface
 *
 * Handles the group chat UI and message relay logic:
 * - Host: Receives messages from members and broadcasts to all
 * - Member: Sends messages to host, receives relayed messages
 *
 * All messages flow through the host in a star topology.
 */

import { useState, useEffect, useRef } from 'react';
import { useGroupStore, type GroupMessage } from '../store/groupStore';
import { useIdentityStore } from '../store/identityStore';

interface GroupChatProps {
  onLeave: () => void;
}

export function GroupChat({ onLeave }: GroupChatProps) {
  const [messageInput, setMessageInput] = useState('');
  const [showMembers, setShowMembers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    activeGroup,
    role,
    connectionState,
    broadcastMessage,
    receiveMessage,
    leaveGroup,
    getMemberChannel,
  } = useGroupStore();

  const { fingerprint } = useIdentityStore();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeGroup?.messages]);

  const handleIncomingMessage = (message: GroupMessage) => {
    if (!activeGroup || !fingerprint) return;

    // Add message to local state
    receiveMessage(message);

    // Host: relay to all other members
    if (role === 'host') {
      const messagePayload = new TextEncoder().encode(JSON.stringify({
        type: 'group_message',
        ...message,
      }));

      activeGroup.members.forEach(member => {
        // Don't send back to original sender
        if (member.fingerprint !== message.senderFingerprint && member.isOnline) {
          const channel = getMemberChannel(member.fingerprint);
          if (channel) {
            channel.send(messagePayload);
          }
        }
      });
    }
  };

  // Expose handleIncomingMessage for external use
  void handleIncomingMessage;

  const handleSendMessage = () => {
    if (!messageInput.trim() || !activeGroup || !fingerprint) return;

    const content = messageInput.trim();
    setMessageInput('');

    const nickname = 'You';

    if (role === 'host') {
      // Host broadcasts directly
      broadcastMessage(content, fingerprint, nickname);
    } else {
      // Member sends to host
      const hostChannel = getMemberChannel(activeGroup.hostFingerprint);
      if (hostChannel) {
        const message: GroupMessage = {
          id: generateMessageId(),
          groupId: activeGroup.id,
          senderFingerprint: fingerprint,
          senderNickname: nickname,
          content,
          timestamp: Date.now(),
        };

        hostChannel.send(new TextEncoder().encode(JSON.stringify({
          type: 'group_message',
          ...message,
        })));

        // Add to local messages immediately
        receiveMessage(message);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleLeave = () => {
    leaveGroup();
    onLeave();
  };

  if (!activeGroup) {
    return (
      <div className="group-chat-container">
        <div className="group-chat-error">
          <h2>No Active Group</h2>
          <button className="btn-primary" onClick={onLeave}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const totalMembers = activeGroup.members.length + 1; // +1 for host

  return (
    <div className="group-chat-container">
      {/* Header */}
      <div className="group-chat-header">
        <div className="header-left">
          <button className="btn-icon" onClick={handleLeave}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </button>
          <div className="group-info">
            <h3>{activeGroup.name}</h3>
            <span className="member-count">
              {totalMembers} member{totalMembers !== 1 ? 's' : ''}
              {role === 'host' && ' · You are hosting'}
            </span>
          </div>
        </div>
        <div className="header-right">
          <button
            className="btn-icon"
            onClick={() => setShowMembers(!showMembers)}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Host banner for hosts */}
      {role === 'host' && (
        <div className="host-banner">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
          </svg>
          <span>You are the host. Keep this tab open for the group to work.</span>
        </div>
      )}

      {/* Members sidebar */}
      {showMembers && (
        <div className="members-sidebar">
          <h4>Members</h4>
          <ul className="members-list">
            {/* Host */}
            <li className="member-item host">
              <span className="online-dot online" />
              <span className="member-name">
                {role === 'host' ? 'You (Host)' : activeGroup.hostNickname}
              </span>
              <span className="host-badge">HOST</span>
            </li>
            {/* Other members */}
            {activeGroup.members.map(member => (
              <li key={member.fingerprint} className="member-item">
                <span className={`online-dot ${member.isOnline ? 'online' : 'offline'}`} />
                <span className="member-name">
                  {member.fingerprint === fingerprint ? 'You' : member.nickname}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Messages area */}
      <div className="group-messages">
        {activeGroup.messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          activeGroup.messages.map(message => (
            <div
              key={message.id}
              className={`message ${message.senderFingerprint === fingerprint ? 'sent' : 'received'}`}
            >
              <div className="message-sender">
                {message.senderFingerprint === fingerprint ? 'You' : message.senderNickname}
              </div>
              <div className="message-content">{message.content}</div>
              <div className="message-time">
                {formatTime(message.timestamp)}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="group-input-area">
        {connectionState !== 'connected' && (
          <div className="connection-warning">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
            {connectionState === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </div>
        )}
        <div className="input-row">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            rows={1}
            disabled={connectionState !== 'connected'}
          />
          <button
            className="btn-send"
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || connectionState !== 'connected'}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function generateMessageId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const timestamp = Date.now().toString(36);
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${timestamp}-${random}`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
