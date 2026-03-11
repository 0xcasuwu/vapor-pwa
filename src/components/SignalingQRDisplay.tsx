/**
 * SignalingQRDisplay.tsx
 * Vapor PWA - WebRTC Signaling QR Display Component
 *
 * Displays offer/answer QR codes during the two-way handshake:
 * - Bob shows offer QR after scanning Alice's initial QR
 * - Alice shows answer QR after scanning Bob's offer QR
 *
 * Also handles scanning the peer's response QR.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { Scanner } from '@yudiel/react-qr-scanner';
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { useSessionStore } from '../store/sessionStore';

interface SignalingQRDisplayProps {
  type: 'offer' | 'answer';
  onComplete: () => void;
  onCancel: () => void;
}

export function SignalingQRDisplay({ type, onComplete, onCancel }: SignalingQRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'show' | 'scan'>('show');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    signalingQrString,
    state,
    processAnswerQR,
    destroySession,
  } = useSessionStore();

  // Render QR code to canvas
  useEffect(() => {
    if (signalingQrString && canvasRef.current && mode === 'show') {
      QRCode.toCanvas(canvasRef.current, signalingQrString, {
        width: 280,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'L',
      });
    }
  }, [signalingQrString, mode]);

  // Watch for connection state changes
  useEffect(() => {
    if (state === 'active') {
      onComplete();
    }
  }, [state, onComplete]);

  const handleScan = useCallback(async (detectedCodes: IDetectedBarcode[]) => {
    if (!scanning || detectedCodes.length === 0) return;

    const qrData = detectedCodes[0].rawValue;
    if (!qrData) return;

    setScanning(false);
    setError(null);

    try {
      // Bob scanning Alice's answer QR
      setError(`Scanned ${qrData.length} chars, processing...`);
      const success = await processAnswerQR(qrData);
      if (!success) {
        // Get the error from the store
        const storeError = useSessionStore.getState().error;
        setError(`Failed: ${storeError || 'Unknown error'}`);
        setScanning(true);
      }
      // Connection will complete and trigger onComplete via state change
    } catch (err) {
      setError(`Exception: ${err instanceof Error ? err.message : String(err)}`);
      setScanning(true);
    }
  }, [scanning, processAnswerQR]);

  const handleScanError = useCallback((err: unknown) => {
    console.error('Scanner error:', err);
    setError('Camera access denied or not available');
  }, []);

  const handleCancel = () => {
    destroySession();
    onCancel();
  };

  const startScanning = () => {
    setMode('scan');
    setScanning(true);
    setError(null);
  };

  const getTitle = () => {
    if (type === 'offer') {
      return 'Show This to Your Contact';
    }
    return 'Show This to Your Contact';
  };

  const getSubtitle = () => {
    if (type === 'offer') {
      return 'They need to scan this QR code to continue the connection';
    }
    return 'They need to scan this QR code to complete the connection';
  };

  const getNextStepText = () => {
    if (type === 'offer') {
      return 'After they scan, tap "Scan Their Response" to scan their answer QR';
    }
    return 'Once they scan this, the connection will be established';
  };

  return (
    <div className="signaling-qr">
      <div className="qr-header">
        <h2>{mode === 'show' ? getTitle() : 'Scan Response QR'}</h2>
        <p className="qr-subtitle">
          {mode === 'show' ? getSubtitle() : 'Point your camera at your contact\'s answer QR'}
        </p>
      </div>

      {mode === 'show' && (
        <>
          <div className="qr-container">
            {signalingQrString ? (
              <canvas ref={canvasRef} className="qr-canvas" />
            ) : (
              <div className="qr-loading">Generating...</div>
            )}
          </div>

          <div className="signaling-badge">
            <span className="signaling-icon">~</span>
            <span className="signaling-text">
              {type === 'offer' ? 'WebRTC Offer' : 'WebRTC Answer'}
            </span>
          </div>

          <div className="qr-info">
            <p className="qr-hint">{getNextStepText()}</p>
          </div>

          {type === 'offer' && (
            <button className="btn-primary" onClick={startScanning}>
              Scan Their Response
            </button>
          )}
        </>
      )}

      {mode === 'scan' && (
        <>
          <div className="scanner-container">
            {scanning && (
              <Scanner
                onScan={handleScan}
                onError={handleScanError}
                constraints={{
                  facingMode: 'environment',
                }}
                styles={{
                  container: {
                    width: '100%',
                    maxWidth: '400px',
                    aspectRatio: '1',
                  },
                }}
              />
            )}

            {state === 'connecting' && (
              <div className="scanner-connecting">
                <div className="spinner" />
                <p>Establishing secure connection...</p>
              </div>
            )}
          </div>

          {error && (
            <div className="scanner-error">
              <span className="error-icon">!</span>
              <span className="error-text">{error}</span>
            </div>
          )}

          <button className="btn-secondary" onClick={() => setMode('show')}>
            Show My QR Again
          </button>
        </>
      )}

      <button className="btn-cancel" onClick={handleCancel}>
        Cancel
      </button>
    </div>
  );
}
