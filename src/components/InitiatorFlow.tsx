/**
 * InitiatorFlow.tsx
 * Vapor PWA - Complete Initiator Connection Flow
 *
 * Alice's flow:
 * 1. Generate and display initial QR (public keys)
 * 2. Wait for Bob to scan it
 * 3. Scan Bob's offer QR
 * 4. Display answer QR for Bob to scan
 * 5. Connection established
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { Scanner } from '@yudiel/react-qr-scanner';
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { useSessionStore } from '../store/sessionStore';
import { decodeDebugLog } from '../crypto/SignalingPayload';

type FlowStep = 'generating' | 'showing_qr' | 'scanning_offer' | 'showing_answer' | 'connecting';

interface InitiatorFlowProps {
  onCancel: () => void;
  onComplete: () => void;
}

export function InitiatorFlow({ onCancel, onComplete }: InitiatorFlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<FlowStep>('generating');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'saved' | 'error'>('idle');

  const {
    state: sessionState,
    qrString,
    signalingQrString,
    qrExpirySeconds,
    isQuantumSecure,
    generateQR,
    updateQRExpiry,
    processOfferQR,
    destroySession,
  } = useSessionStore();

  // Generate initial QR on mount
  useEffect(() => {
    generateQR();
  }, [generateQR]);

  // Update local step based on session state
  useEffect(() => {
    if (sessionState === 'waiting') {
      setStep('showing_qr');
    } else if (sessionState === 'showing_answer') {
      setStep('showing_answer');
    } else if (sessionState === 'connecting') {
      setStep('connecting');
    } else if (sessionState === 'active') {
      onComplete();
    } else if (sessionState === 'error') {
      setError(useSessionStore.getState().error || 'Connection failed');
    }
  }, [sessionState, onComplete]);

  // Update expiry countdown for initial QR
  useEffect(() => {
    if (step === 'showing_qr') {
      const interval = setInterval(() => {
        updateQRExpiry();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, updateQRExpiry]);

  // Render initial QR code
  useEffect(() => {
    if (qrString && canvasRef.current && step === 'showing_qr') {
      QRCode.toCanvas(canvasRef.current, qrString, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'L',
      });
    }
  }, [qrString, step]);

  // Render answer QR code
  useEffect(() => {
    if (signalingQrString && canvasRef.current && step === 'showing_answer') {
      QRCode.toCanvas(canvasRef.current, signalingQrString, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'L',
      });
    }
  }, [signalingQrString, step]);

  const handleStartScanOffer = () => {
    setStep('scanning_offer');
    setScanning(true);
    setError(null);
  };

  const handleScanOffer = useCallback(async (detectedCodes: IDetectedBarcode[]) => {
    if (!scanning || detectedCodes.length === 0) return;

    const qrData = detectedCodes[0].rawValue;
    if (!qrData) return;

    setScanning(false);
    setError(null);

    try {
      setError(`Scanned ${qrData.length} chars, processing...`);
      const result = await processOfferQR(qrData);
      if (!result) {
        const storeError = useSessionStore.getState().error;
        const debugInfo = decodeDebugLog.join(' | ');
        setError(`Failed: ${storeError || 'Unknown'}\n\nDebug: ${debugInfo}`);
        setScanning(true);
      }
      // State change will update step to 'showing_answer'
    } catch (err) {
      const debugInfo = decodeDebugLog.join(' | ');
      setError(`Exception: ${err instanceof Error ? err.message : String(err)}\n\nDebug: ${debugInfo}`);
      setScanning(true);
    }
  }, [scanning, processOfferQR]);

  const handleScanError = useCallback((err: unknown) => {
    console.error('Scanner error:', err);
    setError('Camera access denied or not available');
  }, []);

  const handleCancel = () => {
    destroySession();
    onCancel();
  };

  const handleBackToQR = () => {
    setStep('showing_qr');
    setScanning(false);
    setError(null);
  };

  // Debug: paste QR data manually for desktop testing
  const handlePasteQR = async () => {
    const qrData = prompt('Paste the QR data (base64 string):');
    if (!qrData) return;

    setError(`Pasted ${qrData.length} chars, processing...`);
    try {
      const result = await processOfferQR(qrData.trim());
      if (!result) {
        const storeError = useSessionStore.getState().error;
        const debugInfo = decodeDebugLog.join(' | ');
        setError(`Failed: ${storeError || 'Unknown'}\n\nDebug: ${debugInfo}`);
      }
    } catch (err) {
      const debugInfo = decodeDebugLog.join(' | ');
      setError(`Exception: ${err instanceof Error ? err.message : String(err)}\n\nDebug: ${debugInfo}`);
    }
  };

  /**
   * Convert canvas to blob for sharing
   */
  const getQRImageBlob = useCallback(async (): Promise<Blob | null> => {
    if (!canvasRef.current) return null;

    return new Promise((resolve) => {
      canvasRef.current!.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }, []);

  /**
   * Share QR code image via Web Share API or download
   */
  const handleShare = async () => {
    if (!canvasRef.current) return;

    const blob = await getQRImageBlob();
    if (!blob) {
      setShareStatus('error');
      setTimeout(() => setShareStatus('idle'), 3000);
      return;
    }

    // Create file for sharing
    const file = new File([blob], 'vapor-invite.png', { type: 'image/png' });

    // Try Web Share API with file only (no text to avoid duplicate clipboard entries)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
        });
        setShareStatus('shared');
        setTimeout(() => setShareStatus('idle'), 3000);
        return;
      } catch (err) {
        // User cancelled or share failed - fall through to download
        if ((err as Error).name === 'AbortError') {
          return; // User cancelled, don't show error
        }
        console.warn('Web Share failed, falling back to download:', err);
      }
    }

    // Fallback: Download the image
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vapor-invite.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShareStatus('saved');
    setTimeout(() => setShareStatus('idle'), 3000);
  };

  const getShareButtonText = () => {
    // Check if Web Share API with files is supported
    if (typeof navigator.canShare === 'function') {
      const testFile = new File(['test'], 'test.png', { type: 'image/png' });
      if (navigator.canShare({ files: [testFile] })) {
        return 'Share QR Code';
      }
    }
    return 'Save QR Code';
  };

  const getStatusMessage = () => {
    switch (shareStatus) {
      case 'shared':
        return 'QR code shared!';
      case 'saved':
        return 'QR code saved!';
      case 'error':
        return 'Failed to share';
      default:
        return null;
    }
  };

  // Debug: copy QR data to clipboard
  const handleCopyQRData = async () => {
    const data = qrString || signalingQrString;
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data);
      setError('Copied to clipboard!');
      setTimeout(() => setError(null), 2000);
    } catch {
      setError('Failed to copy');
    }
  };

  return (
    <div className="initiator-flow">
      {/* Debug: Role indicator */}
      <div style={{ background: '#4CAF50', color: 'white', padding: '8px', borderRadius: '4px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold' }}>
        ALICE (Initiator) - You create the invite
      </div>

      {/* Step 1: Show initial QR */}
      {step === 'showing_qr' && (
        <>
          <div className="qr-header">
            <h2>Step 1: Share Your QR</h2>
            <p className="qr-subtitle">
              Your contact needs to scan this with Vapor
            </p>
          </div>

          <div className="qr-container">
            {qrString ? (
              <canvas ref={canvasRef} className="qr-canvas" />
            ) : (
              <div className="qr-loading">
                <div className="spinner" />
                <p>Generating...</p>
              </div>
            )}
          </div>

          <div className="qr-info">
            <div className="qr-timer">
              <span className="timer-icon">~</span>
              <span className="timer-text">Expires in {qrExpirySeconds}s</span>
            </div>

            {isQuantumSecure && (
              <div className="quantum-badge">
                <span className="quantum-icon">*</span>
                <span className="quantum-text">Quantum-Resistant</span>
              </div>
            )}
          </div>

          {/* Share Button */}
          <div className="share-actions">
            <button
              className="btn-share"
              onClick={handleShare}
              disabled={!qrString || shareStatus !== 'idle'}
            >
              <ShareIcon />
              <span>{shareStatus === 'idle' ? getShareButtonText() : getStatusMessage()}</span>
            </button>
          </div>

          <div className="qr-footer">
            <p className="qr-hint">
              Share the QR image via iMessage, WhatsApp, Telegram, or any messenger.
              <br />
              After they scan it, tap the button below to scan their response.
            </p>
          </div>

          <div className="flow-actions">
            <button className="btn-primary" onClick={handleStartScanOffer}>
              Scan Their Response
            </button>
            <button className="btn-secondary" onClick={handleCopyQRData} style={{ marginTop: '10px' }}>
              Copy QR Data (Debug)
            </button>
          </div>
        </>
      )}

      {/* Step 2: Scan Bob's offer QR */}
      {step === 'scanning_offer' && (
        <>
          <div className="qr-header">
            <h2>Step 2: Scan Their Response</h2>
            <p className="qr-subtitle">
              Point your camera at your contact's QR code
            </p>
          </div>

          <div className="scanner-container">
            {scanning && (
              <Scanner
                onScan={handleScanOffer}
                onError={handleScanError}
                constraints={{ facingMode: 'environment' }}
                styles={{
                  container: { width: '100%', maxWidth: '400px', aspectRatio: '1' },
                }}
              />
            )}
          </div>

          {error && (
            <div className="scanner-error">
              <span className="error-icon">!</span>
              <span className="error-text">{error}</span>
            </div>
          )}

          <button className="btn-secondary" onClick={handleBackToQR}>
            Show My QR Again
          </button>

          <button className="btn-secondary" onClick={handlePasteQR} style={{ marginTop: '10px' }}>
            Paste Bob's OFFER QR (from Bob's "Copy OFFER QR")
          </button>
        </>
      )}

      {/* Step 3: Show answer QR */}
      {step === 'showing_answer' && (
        <>
          <div className="qr-header">
            <h2>Step 3: Show This to Your Contact</h2>
            <p className="qr-subtitle">
              They need to scan this to complete the connection
            </p>
          </div>

          <div className="qr-container">
            {signalingQrString ? (
              <canvas ref={canvasRef} className="qr-canvas" />
            ) : (
              <div className="qr-loading">
                <div className="spinner" />
                <p>Generating...</p>
              </div>
            )}
          </div>

          <div className="signaling-badge">
            <span className="signaling-icon">~</span>
            <span className="signaling-text">WebRTC Answer</span>
          </div>

          <div className="qr-footer">
            <p className="qr-hint">
              Once they scan this QR, the secure connection will be established.
            </p>
          </div>

          <button className="btn-secondary" onClick={handleCopyQRData} style={{ marginTop: '10px' }}>
            Copy ANSWER QR (for Bob to paste in "Scan Their Response")
          </button>
        </>
      )}

      {/* Connecting state */}
      {step === 'connecting' && (
        <div className="connecting-state">
          <div className="spinner" />
          <h2>Establishing Secure Connection</h2>
          <p>Please wait...</p>
        </div>
      )}

      <button className="btn-cancel" onClick={handleCancel}>
        Cancel
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
