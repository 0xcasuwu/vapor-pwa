/**
 * ReconnectFlow.tsx
 * Vapor PWA - Zero-Code Reconnection UI
 *
 * Shows progress of libp2p Circuit Relay reconnection.
 * User clicks a contact → this component shows connection progress → Chat opens.
 */

import { useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import type { Contact } from '../store/identityStore';

interface ReconnectFlowProps {
  contact: Contact;
  onConnected: () => void;
  onCancel: () => void;
}

export function ReconnectFlow({ contact, onConnected, onCancel }: ReconnectFlowProps) {
  const {
    state,
    error,
    reconnectionProgress,
    initiateReconnection,
    destroySession,
  } = useSessionStore();

  // Start reconnection on mount
  useEffect(() => {
    if (!contact.libp2pPeerId) {
      return;
    }

    initiateReconnection(
      contact.id,
      contact.publicKey,
      contact.libp2pPeerId,
      contact.libp2pMultiaddrs
    );
  }, [contact, initiateReconnection]);

  // Transition to chat when connected
  useEffect(() => {
    if (state === 'active') {
      onConnected();
    }
  }, [state, onConnected]);

  const handleCancel = () => {
    destroySession();
    onCancel();
  };

  // Get current step for progress indicator
  const getStepNumber = () => {
    switch (state) {
      case 'reconnecting_relay': return 1;
      case 'reconnecting_peer': return 2;
      case 'reconnecting_signaling': return 3;
      case 'reconnecting_webrtc': return 4;
      default: return 0;
    }
  };

  const currentStep = getStepNumber();
  const isError = state === 'error';

  return (
    <div className="reconnect-flow">
      {/* Background effects */}
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      <div className="reconnect-content">
        <div className="reconnect-header">
          <span className="reconnect-kanji">再接続</span>
          <h2>RECONNECTING</h2>
        </div>

        <div className="reconnect-contact">
          <div className="contact-avatar large">
            <span>{contact.nickname.charAt(0).toUpperCase()}</span>
          </div>
          <span className="contact-name">{contact.nickname}</span>
        </div>

        {/* Progress steps */}
        <div className="reconnect-steps">
          <Step
            number={1}
            label="Relay Network"
            active={currentStep === 1}
            completed={currentStep > 1}
            error={isError && currentStep === 1}
          />
          <StepConnector active={currentStep > 1} />
          <Step
            number={2}
            label="Dial Peer"
            active={currentStep === 2}
            completed={currentStep > 2}
            error={isError && currentStep === 2}
          />
          <StepConnector active={currentStep > 2} />
          <Step
            number={3}
            label="Signaling"
            active={currentStep === 3}
            completed={currentStep > 3}
            error={isError && currentStep === 3}
          />
          <StepConnector active={currentStep > 3} />
          <Step
            number={4}
            label="WebRTC"
            active={currentStep === 4}
            completed={state === 'active'}
            error={isError && currentStep === 4}
          />
        </div>

        {/* Status message */}
        <div className={`reconnect-status ${isError ? 'error' : ''}`}>
          {isError ? (
            <>
              <span className="status-icon error">!</span>
              <span>{error || 'Connection failed'}</span>
            </>
          ) : (
            <>
              <span className="status-spinner" />
              <span>{reconnectionProgress || 'Connecting...'}</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="reconnect-actions">
          {isError ? (
            <>
              <button className="btn-secondary" onClick={handleCancel}>
                Go Back
              </button>
              <button
                className="btn-primary"
                onClick={() => initiateReconnection(
                  contact.id,
                  contact.publicKey,
                  contact.libp2pPeerId!,
                  contact.libp2pMultiaddrs
                )}
              >
                Retry
              </button>
            </>
          ) : (
            <button className="btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
          )}
        </div>

        {/* Info about what's happening */}
        <div className="reconnect-info">
          <p>
            Connecting via decentralized relay network.
            <br />
            No manual code exchange required.
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  label,
  active,
  completed,
  error,
}: {
  number: number;
  label: string;
  active: boolean;
  completed: boolean;
  error: boolean;
}) {
  return (
    <div className={`step ${active ? 'active' : ''} ${completed ? 'completed' : ''} ${error ? 'error' : ''}`}>
      <div className="step-circle">
        {completed ? (
          <CheckIcon />
        ) : error ? (
          <span>!</span>
        ) : (
          <span>{number}</span>
        )}
      </div>
      <span className="step-label">{label}</span>
    </div>
  );
}

function StepConnector({ active }: { active: boolean }) {
  return <div className={`step-connector ${active ? 'active' : ''}`} />;
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
