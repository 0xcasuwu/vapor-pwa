/**
 * ResponderFlow.tsx
 * Vapor PWA - Complete Responder Connection Flow
 *
 * Bob's flow:
 * 1. Scan Alice's initial QR (public keys)
 * 2. Display offer QR for Alice to scan
 * 3. Scan Alice's answer QR
 * 4. Connection established
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { Scanner } from '@yudiel/react-qr-scanner';
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { useSessionStore } from '../store/sessionStore';
import { decodeDebugLog } from '../crypto/SignalingPayload';

type FlowStep = 'scanning_initial' | 'showing_offer' | 'scanning_answer' | 'connecting';

interface ResponderFlowProps {
  onCancel: () => void;
  onComplete: () => void;
}

export function ResponderFlow({ onCancel, onComplete }: ResponderFlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<FlowStep>('scanning_initial');
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'saved' | 'error'>('idle');

  const {
    state: sessionState,
    signalingQrString,
    isQuantumSecure,
    scanQR,
    processAnswerQR,
    destroySession,
  } = useSessionStore();

  // Update local step based on session state
  useEffect(() => {
    if (sessionState === 'showing_offer') {
      setStep('showing_offer');
      setScanning(false);
    } else if (sessionState === 'connecting') {
      setStep('connecting');
    } else if (sessionState === 'active') {
      onComplete();
    } else if (sessionState === 'error') {
      setError(useSessionStore.getState().error || 'Connection failed');
    }
  }, [sessionState, onComplete]);

  // Render offer QR code
  useEffect(() => {
    if (signalingQrString && canvasRef.current && step === 'showing_offer') {
      QRCode.toCanvas(canvasRef.current, signalingQrString, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'L',
      });
    }
  }, [signalingQrString, step]);

  // Handle scanning Alice's initial QR
  const handleScanInitial = useCallback(async (detectedCodes: IDetectedBarcode[]) => {
    if (!scanning || detectedCodes.length === 0) return;

    const qrData = detectedCodes[0].rawValue;
    if (!qrData) return;

    setScanning(false);
    setError(null);

    try {
      const result = await scanQR(qrData);
      if (!result) {
        setError('Failed to process QR code');
        setScanning(true);
      }
      // State change will update step to 'showing_offer'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process QR');
      setScanning(true);
    }
  }, [scanning, scanQR]);

  // Handle scanning Alice's answer QR
  const handleScanAnswer = useCallback(async (detectedCodes: IDetectedBarcode[]) => {
    if (!scanning || detectedCodes.length === 0) return;

    const qrData = detectedCodes[0].rawValue;
    if (!qrData) return;

    setScanning(false);
    setError(null);

    try {
      setError(`Scanned ${qrData.length} chars, processing...`);
      const success = await processAnswerQR(qrData);
      if (!success) {
        // Get the error from the store
        const storeError = useSessionStore.getState().error;
        setError(`Failed: ${storeError || 'Unknown error'}`);
        setScanning(true);
      }
      // State change will update step to 'connecting' then 'active'
    } catch (err) {
      setError(`Exception: ${err instanceof Error ? err.message : String(err)}`);
      setScanning(true);
    }
  }, [scanning, processAnswerQR]);

  const handleScanError = useCallback((err: unknown) => {
    console.error('Scanner error:', err);
    setError('Camera access denied or not available');
  }, []);

  const handleStartScanAnswer = () => {
    setStep('scanning_answer');
    setScanning(true);
    setError(null);
  };

  const handleBackToOffer = () => {
    setStep('showing_offer');
    setScanning(false);
    setError(null);
  };

  // Debug: paste QR data manually for desktop testing (initial QR)
  const handlePasteInitialQR = async () => {
    const qrData = prompt('Paste Alice\'s initial QR data (base64 string):');
    if (!qrData) return;

    setError(`Pasted ${qrData.length} chars, processing...`);
    try {
      const result = await scanQR(qrData.trim());
      if (!result) {
        const storeError = useSessionStore.getState().error;
        setError(`Failed: ${storeError || 'Unknown'}`);
      }
    } catch (err) {
      setError(`Exception: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Debug: paste QR data manually for desktop testing (answer QR)
  const handlePasteAnswerQR = async () => {
    const qrData = prompt('Paste Alice\'s answer QR data (base64 string):');
    if (!qrData) return;

    setError(`Pasted ${qrData.length} chars, processing...`);
    try {
      const success = await processAnswerQR(qrData.trim());
      if (!success) {
        const storeError = useSessionStore.getState().error;
        const debugInfo = decodeDebugLog.join(' | ');
        setError(`Failed: ${storeError || 'Unknown'}\n\nDebug: ${debugInfo}`);
      }
    } catch (err) {
      const debugInfo = decodeDebugLog.join(' | ');
      setError(`Exception: ${err instanceof Error ? err.message : String(err)}\n\nDebug: ${debugInfo}`);
    }
  };

  const handleCancel = () => {
    destroySession();
    onCancel();
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

    const file = new File([blob], 'vapor-response.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
        });
        setShareStatus('shared');
        setTimeout(() => setShareStatus('idle'), 3000);
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.warn('Web Share failed, falling back to download:', err);
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vapor-response.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShareStatus('saved');
    setTimeout(() => setShareStatus('idle'), 3000);
  };

  const getShareButtonText = () => {
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
    if (!signalingQrString) return;
    try {
      await navigator.clipboard.writeText(signalingQrString);
      setError('Copied to clipboard!');
      setTimeout(() => setError(null), 2000);
    } catch {
      setError('Failed to copy');
    }
  };

  return (
    <div className="responder-flow">
      {/* Step 1: Scan Alice's initial QR */}
      {step === 'scanning_initial' && (
        <>
          <div className="qr-header">
            <h2>Step 1: Scan Their QR Code</h2>
            <p className="qr-subtitle">
              Point your camera at your contact's QR code
            </p>
          </div>

          <div className="scanner-container">
            {scanning && (
              <Scanner
                onScan={handleScanInitial}
                onError={handleScanError}
                constraints={{ facingMode: 'environment' }}
                styles={{
                  container: { width: '100%', maxWidth: '400px', aspectRatio: '1' },
                }}
              />
            )}

            {sessionState === 'scanning' && (
              <div className="scanner-processing">
                <div className="spinner" />
                <p>Processing QR code...</p>
              </div>
            )}
          </div>

          {error && (
            <div className="scanner-error">
              <span className="error-icon">!</span>
              <span className="error-text">{error}</span>
            </div>
          )}

          <div className="scanner-info">
            <p className="scanner-hint">
              Make sure the entire QR code is visible in the frame.
              <br />
              Your session key will be derived using post-quantum cryptography.
            </p>
          </div>

          <button className="btn-secondary" onClick={handlePasteInitialQR} style={{ marginTop: '10px' }}>
            Paste QR Data (Debug)
          </button>
        </>
      )}

      {/* Step 2: Show offer QR */}
      {step === 'showing_offer' && (
        <>
          <div className="qr-header">
            <h2>Step 2: Show This to Your Contact</h2>
            <p className="qr-subtitle">
              They need to scan this QR to continue
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

          <div className="qr-info">
            <div className="signaling-badge">
              <span className="signaling-icon">~</span>
              <span className="signaling-text">WebRTC Offer</span>
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
              disabled={!signalingQrString || shareStatus !== 'idle'}
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
            <button className="btn-primary" onClick={handleStartScanAnswer}>
              Scan Their Response
            </button>
            <button className="btn-secondary" onClick={handleCopyQRData} style={{ marginTop: '10px' }}>
              Copy QR Data (Debug)
            </button>
          </div>
        </>
      )}

      {/* Step 3: Scan Alice's answer QR */}
      {step === 'scanning_answer' && (
        <>
          <div className="qr-header">
            <h2>Step 3: Scan Their Response</h2>
            <p className="qr-subtitle">
              Point your camera at your contact's QR code
            </p>
          </div>

          <div className="scanner-container">
            {scanning && (
              <Scanner
                onScan={handleScanAnswer}
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

          <button className="btn-secondary" onClick={handleBackToOffer}>
            Show My QR Again
          </button>

          <button className="btn-secondary" onClick={handlePasteAnswerQR} style={{ marginTop: '10px' }}>
            Paste QR Data (Debug)
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
