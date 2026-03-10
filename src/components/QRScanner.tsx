/**
 * QRScanner.tsx
 * Vapor PWA - QR Code Scanner Component
 *
 * Uses the device camera to scan QR codes for session joining.
 * Processes the scanned payload and initiates key exchange.
 */

import { useState, useCallback } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { useSessionStore } from '../store/sessionStore';

interface QRScannerProps {
  onCancel: () => void;
  onScanned: (offer: string) => void;
}

export function QRScanner({ onCancel, onScanned }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const { scanQR, state } = useSessionStore();

  const handleScan = useCallback(async (detectedCodes: IDetectedBarcode[]) => {
    if (!scanning || detectedCodes.length === 0) return;

    const qrData = detectedCodes[0].rawValue;
    if (!qrData) return;

    setScanning(false);
    setError(null);

    try {
      const result = await scanQR(qrData);
      if (result && 'offerQr' in result) {
        // Successfully scanned initial QR, got offer QR string
        onScanned(result.offerQr);
      } else if (result && 'needsAnswerScan' in result) {
        // Scanned signaling QR, state machine handles next step
        onScanned('signaling');
      } else {
        setError('Failed to process QR code');
        setScanning(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process QR code');
      setScanning(true);
    }
  }, [scanning, scanQR, onScanned]);

  const handleError = useCallback((err: unknown) => {
    console.error('Scanner error:', err);
    setError('Camera access denied or not available');
  }, []);

  return (
    <div className="qr-scanner">
      <div className="scanner-header">
        <h2>Scan QR Code</h2>
        <p className="scanner-subtitle">
          Point your camera at your contact's QR code
        </p>
      </div>

      <div className="scanner-container">
        {scanning && (
          <Scanner
            onScan={handleScan}
            onError={handleError}
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

        {state === 'scanning' && (
          <div className="scanner-processing">
            <div className="spinner" />
            <p>Processing QR code...</p>
          </div>
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
          <span className="error-icon">⚠️</span>
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

      <button className="btn-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
