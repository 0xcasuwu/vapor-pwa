/**
 * Chat.tsx
 * Vapor PWA - Encrypted Chat Interface
 *
 * Displays messages and provides input for sending new messages.
 * All messages are encrypted with ChaCha20-Poly1305 before sending.
 */

import { useState, useRef, useEffect } from 'react';
import { useSessionStore, Message } from '../store/sessionStore';

interface ChatProps {
  onEndSession: () => void;
}

export function Chat({ onEndSession }: ChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    sendMessage,
    destroySession,
    connectionState,
    isQuantumSecure,
  } = useSessionStore();

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

        {isQuantumSecure && (
          <div className="quantum-indicator">
            <span className="quantum-icon">🛡</span>
            <span className="quantum-label">PQ</span>
          </div>
        )}

        <button className="btn-end" onClick={handleEndSession}>
          End Session
        </button>
      </div>

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
                🛡 Protected by X25519 + ML-KEM-768
              </p>
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
