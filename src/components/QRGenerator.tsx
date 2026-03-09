/**
 * QRGenerator.tsx
 * Vapor PWA - QR Code Generation Component
 *
 * Displays the QR code for session initiation with:
 * - Auto-refresh on expiry
 * - Countdown timer
 * - Quantum security indicator
 */

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useSessionStore } from '../store/sessionStore';

interface QRGeneratorProps {
  onCancel: () => void;
}

export function QRGenerator({ onCancel }: QRGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    qrString,
    qrExpirySeconds,
    isQuantumSecure,
    generateQR,
    updateQRExpiry,
    destroySession,
  } = useSessionStore();

  // Generate QR on mount
  useEffect(() => {
    generateQR();

    return () => {
      // Clean up on unmount
    };
  }, [generateQR]);

  // Update expiry countdown
  useEffect(() => {
    const interval = setInterval(() => {
      updateQRExpiry();
    }, 1000);

    return () => clearInterval(interval);
  }, [updateQRExpiry]);

  // Render QR code to canvas
  useEffect(() => {
    if (qrString && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrString, {
        width: 280,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'L', // Low error correction for larger data
      });
    }
  }, [qrString]);

  const handleCancel = () => {
    destroySession();
    onCancel();
  };

  return (
    <div className="qr-generator">
      <div className="qr-header">
        <h2>Share This QR Code</h2>
        <p className="qr-subtitle">
          Have your contact scan this code to start a secure session
        </p>
      </div>

      <div className="qr-container">
        {qrString ? (
          <canvas ref={canvasRef} className="qr-canvas" />
        ) : (
          <div className="qr-loading">Generating...</div>
        )}
      </div>

      <div className="qr-info">
        <div className="qr-timer">
          <span className="timer-icon">⏱</span>
          <span className="timer-text">
            Expires in {qrExpirySeconds}s
          </span>
        </div>

        {isQuantumSecure && (
          <div className="quantum-badge">
            <span className="quantum-icon">🛡</span>
            <span className="quantum-text">Quantum-Resistant</span>
          </div>
        )}
      </div>

      <div className="qr-footer">
        <p className="qr-hint">
          This QR contains your public key (X25519 + ML-KEM-768).
          <br />
          No private data is shared.
        </p>
      </div>

      <button className="btn-cancel" onClick={handleCancel}>
        Cancel
      </button>
    </div>
  );
}
