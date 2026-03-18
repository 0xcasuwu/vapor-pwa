/**
 * Chat.tsx
 * Vapor PWA - Encrypted Chat Interface
 *
 * Displays messages and provides input for sending new messages.
 * All messages are encrypted with ChaCha20-Poly1305 before sending.
 * Includes safety number display for MITM verification.
 * Allows saving peer as contact with nickname.
 */

import { useState, useRef, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { useIdentityStore } from '../store/identityStore';
import type { Message } from '../store/sessionStore';

interface ChatProps {
  onEndSession: () => void;
}

export function Chat({ onEndSession }: ChatProps) {
  const [input, setInput] = useState('');
  const [showSafetyNumber, setShowSafetyNumber] = useState(false);
  const [showSaveContact, setShowSaveContact] = useState(false);
  const [contactNickname, setContactNickname] = useState('');
  const [contactSaved, setContactSaved] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    sendMessage,
    destroySession,
    connectionState,
    isQuantumSecure,
    safetyNumber,
    safetyNumberVerified,
    verifySafetyNumber,
    _peerPublicKeys,
    peerFrtunPeerId,
  } = useSessionStore();

  const { addContact, getContactByPublicKey } = useIdentityStore();

  // Check if peer is already a contact
  useEffect(() => {
    if (_peerPublicKeys) {
      const existing = getContactByPublicKey(_peerPublicKeys);
      if (existing) {
        setContactSaved(true);
        setContactNickname(existing.nickname);
      }
    }
  }, [_peerPublicKeys, getContactByPublicKey]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const sent = await sendMessage(trimmed);
    if (sent) {
      setInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEndSession = () => {
    destroySession();
    onEndSession();
  };

  const handleSaveContact = async () => {
    if (!_peerPublicKeys || !contactNickname.trim()) return;

    try {
      // Include peer's frtun peer ID if available (enables zero-code reconnection)
      await addContact(_peerPublicKeys, contactNickname.trim(), {
        frtunPeerId: peerFrtunPeerId ?? undefined,
      });
      setContactSaved(true);
      setShowSaveContact(false);
    } catch (err) {
      console.error('Failed to save contact:', err);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="chat">
      <div className="chat-header">
        <div className="chat-status">
          <span
            className={`status-dot ${connectionState === 'connected' ? 'connected' : 'disconnected'}`}
          />
          <span className="status-text">
            {connectionState === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="header-actions">
          {_peerPublicKeys && !contactSaved && (
            <button
              className="btn-save-contact"
              onClick={() => setShowSaveContact(true)}
              title="Save contact"
            >
              <UserPlusIcon />
            </button>
          )}

          {safetyNumber && (
            <button
              className={`btn-verify ${safetyNumberVerified ? 'verified' : ''}`}
              onClick={() => setShowSafetyNumber(true)}
              title="Verify safety number"
            >
              <ShieldIcon />
              {safetyNumberVerified ? 'Verified' : 'Verify'}
            </button>
          )}

          <button className="btn-end" onClick={handleEndSession}>
            End
          </button>
        </div>
      </div>

      {/* Safety Number Modal */}
      {showSafetyNumber && safetyNumber && (
        <div className="safety-modal-overlay" onClick={() => setShowSafetyNumber(false)}>
          <div className="safety-modal" onClick={(e) => e.stopPropagation()}>
            <div className="safety-header">
              <ShieldIcon />
              <h3>Safety Number</h3>
            </div>

            <p className="safety-description">
              Compare this with your contact. If the numbers match, your connection is secure and not intercepted.
            </p>

            <div className="safety-number">
              {safetyNumber}
            </div>

            <div className="safety-instructions">
              <p>Read this aloud on a phone call, or compare in person.</p>
              <p className="safety-warning">
                If the numbers don't match, someone may be intercepting your messages.
              </p>
            </div>

            <div className="safety-actions">
              {!safetyNumberVerified ? (
                <button
                  className="btn-primary"
                  onClick={() => {
                    verifySafetyNumber();
                    setShowSafetyNumber(false);
                  }}
                >
                  <CheckIcon />
                  Mark as Verified
                </button>
              ) : (
                <div className="verified-badge">
                  <CheckIcon />
                  Verified
                </div>
              )}

              <button
                className="btn-text"
                onClick={() => setShowSafetyNumber(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Contact Modal */}
      {showSaveContact && (
        <div className="safety-modal-overlay" onClick={() => setShowSaveContact(false)}>
          <div className="safety-modal save-contact-modal" onClick={(e) => e.stopPropagation()}>
            <div className="safety-header">
              <UserPlusIcon />
              <h3>Save Contact</h3>
            </div>

            <p className="safety-description">
              Give this contact a nickname so you can recognize them later.
            </p>

            <input
              type="text"
              className="contact-nickname-input"
              placeholder="Nickname..."
              value={contactNickname}
              onChange={(e) => setContactNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveContact();
              }}
              autoFocus
            />

            {_peerPublicKeys && (
              <div className="contact-key-preview">
                <span className="key-label">Key:</span>
                <span className="key-value">
                  {Array.from(_peerPublicKeys.slice(0, 8))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('')
                    .toUpperCase()}...
                </span>
              </div>
            )}

            <div className="safety-actions">
              <button
                className="btn-primary"
                onClick={handleSaveContact}
                disabled={!contactNickname.trim()}
              >
                <CheckIcon />
                Save Contact
              </button>

              <button
                className="btn-text"
                onClick={() => setShowSaveContact(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="empty-icon">💬</div>
            <p className="empty-text">
              Session established!
              <br />
              Start sending encrypted messages.
            </p>
            {isQuantumSecure && (
              <p className="empty-security">
                Protected by X25519 + ML-KEM-768
              </p>
            )}
            {safetyNumber && !safetyNumberVerified && (
              <button
                className="btn-verify-prompt"
                onClick={() => setShowSafetyNumber(true)}
              >
                <ShieldIcon />
                Verify your connection is secure
              </button>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} formatTime={formatTime} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          rows={1}
          disabled={connectionState !== 'connected'}
        />
        <button
          className="btn-send"
          onClick={handleSend}
          disabled={!input.trim() || connectionState !== 'connected'}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  formatTime: (timestamp: number) => string;
}

function MessageBubble({ message, formatTime }: MessageBubbleProps) {
  return (
    <div className={`message ${message.sender}`}>
      <div className="message-bubble">
        <p className="message-content">{message.content}</p>
        <span className="message-time">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}
