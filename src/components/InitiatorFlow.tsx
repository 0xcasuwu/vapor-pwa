/**
 * InitiatorFlow.tsx
 * Vapor PWA - Initiator Connection Flow (Copy/Paste UX)
 *
 * Alice's flow:
 * 1. Generate and copy invite code
 * 2. Paste Bob's response code
 * 3. Copy final answer code for Bob
 * 4. Connection established
 */

import { useEffect, useState, useCallback } from 'react';
import { useSessionStore } from '../store/sessionStore';

type FlowStep = 'generating' | 'showing_invite' | 'waiting_response' | 'showing_answer' | 'connecting';

interface InitiatorFlowProps {
  onCancel: () => void;
  onComplete: () => void;
}

export function InitiatorFlow({ onCancel, onComplete }: InitiatorFlowProps) {
  const [step, setStep] = useState<FlowStep>('generating');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasteValue, setPasteValue] = useState('');

  const {
    state: sessionState,
    qrString,
    signalingQrString,
    isQuantumSecure,
    iceDiagnostics,
    generateQR,
    processOfferQR,
    destroySession,
  } = useSessionStore();

  // Generate initial invite on mount
  useEffect(() => {
    generateQR();
  }, [generateQR]);

  // Update local step based on session state
  useEffect(() => {
    if (sessionState === 'waiting') {
      setStep('showing_invite');
    } else if (sessionState === 'showing_answer') {
      setStep('showing_answer');
      setCopied(false);
    } else if (sessionState === 'connecting') {
      setStep('connecting');
    } else if (sessionState === 'active') {
      onComplete();
    } else if (sessionState === 'error') {
      setError(useSessionStore.getState().error || 'Connection failed');
    }
  }, [sessionState, onComplete]);

  const handleCopyInvite = useCallback(async () => {
    if (!qrString) return;
    try {
      await navigator.clipboard.writeText(qrString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [qrString]);

  const handleCopyAnswer = useCallback(async () => {
    if (!signalingQrString) return;
    try {
      await navigator.clipboard.writeText(signalingQrString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [signalingQrString]);

  const handlePasteResponse = useCallback(async () => {
    if (!pasteValue.trim()) {
      setError('Please paste the response code');
      return;
    }

    setError(null);
    try {
      const result = await processOfferQR(pasteValue.trim());
      if (!result) {
        const storeError = useSessionStore.getState().error;
        setError(storeError || 'Invalid response code');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process response');
    }
  }, [pasteValue, processOfferQR]);

  const handleCancel = () => {
    destroySession();
    onCancel();
  };

  const handleNextStep = () => {
    setStep('waiting_response');
    setPasteValue('');
    setError(null);
  };

  return (
    <div className="connection-flow">
      {/* Step 1: Show invite code */}
      {step === 'showing_invite' && (
        <div className="flow-step">
          <div className="step-header">
            <span className="step-number">1</span>
            <h2>Copy Your Invite</h2>
          </div>

          <p className="step-description">
            Send this code to your contact via any messenger
          </p>

          <div className="code-container">
            <div className="code-preview">
              {qrString ? (
                <code>{qrString.substring(0, 50)}...</code>
              ) : (
                <span className="loading">Generating...</span>
              )}
            </div>

            <button
              className="btn-copy"
              onClick={handleCopyInvite}
              disabled={!qrString}
            >
              <CopyIcon />
              <span>{copied ? 'Copied!' : 'Copy Invite Code'}</span>
            </button>
          </div>

          {isQuantumSecure && (
            <div className="security-badge">
              <ShieldIcon />
              <span>Quantum-Resistant Encryption</span>
            </div>
          )}

          <div className="flow-actions">
            <button className="btn-primary" onClick={handleNextStep} disabled={!qrString}>
              Next: Paste Their Response
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Paste response code */}
      {step === 'waiting_response' && (
        <div className="flow-step">
          <div className="step-header">
            <span className="step-number">2</span>
            <h2>Paste Their Response</h2>
          </div>

          <p className="step-description">
            Your contact will send back a response code
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
              onClick={handlePasteResponse}
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
      )}

      {/* Step 3: Show answer code */}
      {step === 'showing_answer' && (
        <div className="flow-step">
          <div className="step-header">
            <span className="step-number">3</span>
            <h2>Send Final Code</h2>
          </div>

          <p className="step-description">
            Send this final code to complete the connection
          </p>

          <div className="code-container">
            <div className="code-preview">
              {signalingQrString ? (
                <code>{signalingQrString.substring(0, 50)}...</code>
              ) : (
                <span className="loading">Generating...</span>
              )}
            </div>

            <button
              className="btn-copy"
              onClick={handleCopyAnswer}
              disabled={!signalingQrString}
            >
              <CopyIcon />
              <span>{copied ? 'Copied!' : 'Copy Final Code'}</span>
            </button>
          </div>

          <p className="step-hint">
            Once they paste this code, the connection will be established automatically.
          </p>
        </div>
      )}

      {/* Connecting state */}
      {step === 'connecting' && (
        <div className="flow-step connecting">
          <div className="spinner" />
          <h2>Establishing Connection</h2>
          <p>Please wait...</p>
          {iceDiagnostics && <IceDiagnosticsPanel diagnostics={iceDiagnostics} showDetails={true} />}
        </div>
      )}

      {/* Generating state */}
      {step === 'generating' && (
        <div className="flow-step connecting">
          <div className="spinner" />
          <h2>Preparing Invite</h2>
          <p>Generating secure keys...</p>
        </div>
      )}

      {/* Global error display with diagnostics */}
      {error && step !== 'waiting_response' && (
        <div className="flow-error-panel">
          <div className="error-header">
            <ErrorIcon />
            <h3>Connection Failed</h3>
          </div>
          <p className="error-detail">{error}</p>
          {iceDiagnostics && <IceDiagnosticsPanel diagnostics={iceDiagnostics} showDetails={true} />}
          <button className="btn-primary" onClick={handleCancel}>
            Start Over
          </button>
        </div>
      )}

      <button className="btn-cancel" onClick={handleCancel}>
        Cancel
      </button>
    </div>
  );
}

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

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

interface IceDiagnosticsPanelProps {
  diagnostics: {
    gatheringState: string;
    connectionState: string;
    candidateTypes: { host: number; srflx: number; relay: number; prflx: number };
    selectedPair: string | null;
    errorMessage: string | null;
  };
}

function IceDiagnosticsPanel({ diagnostics, showDetails = false }: IceDiagnosticsPanelProps & { showDetails?: boolean }) {
  const { candidateTypes, connectionState, gatheringState, selectedPair, errorMessage } = diagnostics;
  const totalCandidates = candidateTypes.host + candidateTypes.srflx + candidateTypes.relay + candidateTypes.prflx;

  // Determine status and warnings
  const hasStunOrTurn = candidateTypes.srflx > 0 || candidateTypes.relay > 0;
  const onlyLocal = totalCandidates > 0 && !hasStunOrTurn;
  const noCandidates = totalCandidates === 0 && gatheringState === 'complete';

  return (
    <div className="ice-diagnostics">
      <div className="diag-title">Connection Diagnostics</div>

      <div className="diag-row">
        <span>Gathering:</span>
        <span className={`diag-state ${gatheringState === 'complete' ? 'completed' : 'checking'}`}>
          {gatheringState}
        </span>
      </div>

      <div className="diag-row">
        <span>ICE State:</span>
        <span className={`diag-state ${connectionState}`}>{connectionState}</span>
      </div>

      <div className="diag-row">
        <span>Candidates:</span>
        <span>{totalCandidates} found</span>
      </div>

      {showDetails && totalCandidates > 0 && (
        <div className="diag-breakdown">
          {candidateTypes.host > 0 && (
            <div className="diag-candidate">
              <span className="diag-dot local" /> {candidateTypes.host} Local
            </div>
          )}
          {candidateTypes.srflx > 0 && (
            <div className="diag-candidate">
              <span className="diag-dot stun" /> {candidateTypes.srflx} STUN
            </div>
          )}
          {candidateTypes.relay > 0 && (
            <div className="diag-candidate">
              <span className="diag-dot turn" /> {candidateTypes.relay} TURN
            </div>
          )}
          {candidateTypes.prflx > 0 && (
            <div className="diag-candidate">
              <span className="diag-dot prflx" /> {candidateTypes.prflx} Peer
            </div>
          )}
        </div>
      )}

      {selectedPair && (
        <div className="diag-row diag-success-row">
          <span>Connected via:</span>
          <span className="diag-success">{selectedPair}</span>
        </div>
      )}

      {/* Warnings */}
      {onlyLocal && (
        <div className="diag-warning">
          ⚠️ Only local candidates found. STUN/TURN servers may be blocked by firewall. Cross-network connections will likely fail.
        </div>
      )}

      {noCandidates && (
        <div className="diag-error">
          ❌ No ICE candidates gathered. Check your network connection and firewall settings.
        </div>
      )}

      {errorMessage && (
        <div className="diag-error">❌ {errorMessage}</div>
      )}
    </div>
  );
}
