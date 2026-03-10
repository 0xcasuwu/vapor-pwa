/**
 * QRGenerator.tsx
 * Vapor PWA - QR Code Generation Component
 *
 * Displays the QR code for session initiation with:
 * - Auto-refresh on expiry
 * - Countdown timer
 * - Quantum security indicator
 * - Share via iMessage/WhatsApp/Telegram/etc
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useSessionStore } from '../store/sessionStore';
import { shareInvite, getShareButtonText } from '../utils/share';

interface QRGeneratorProps {
  onCancel: () => void;
}

export function QRGenerator({ onCancel }: QRGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'copied' | 'error'>('idle');
  const {
    qrString,
    compactShareString,
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

  const handleShare = async () => {
    // Use compact share string (classical only) for much shorter URLs
    if (!compactShareString) return;

    const result = await shareInvite(compactShareString);

    if (result.success) {
      setShareStatus(result.method === 'share' ? 'shared' : 'copied');
      // Reset status after 3 seconds
      setTimeout(() => setShareStatus('idle'), 3000);
    } else {
      setShareStatus('error');
      setTimeout(() => setShareStatus('idle'), 3000);
    }
  };

  const getStatusMessage = () => {
    switch (shareStatus) {
      case 'shared':
        return 'Invite shared!';
      case 'copied':
        return 'Link copied to clipboard!';
      case 'error':
        return 'Failed to share';
      default:
        return null;
    }
  };

  return (
    <div className="qr-generator">
      <div className="qr-header">
        <h2>Invite to Secure Chat</h2>
        <p className="qr-subtitle">
          Share via message or have them scan the QR code
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
          <span className="timer-icon">~</span>
          <span className="timer-text">
            Expires in {qrExpirySeconds}s
          </span>
        </div>

        {isQuantumSecure && (
          <div className="quantum-badge">
            <span className="quantum-icon">*</span>
            <span className="quantum-text">Quantum-Resistant</span>
          </div>
        )}
      </div>

      {/* Share Button - Primary Action */}
      <div className="share-actions">
        <button
          className="btn-share"
          onClick={handleShare}
          disabled={!compactShareString || shareStatus !== 'idle'}
        >
          <ShareIcon />
          <span>{shareStatus === 'idle' ? getShareButtonText() : getStatusMessage()}</span>
        </button>
      </div>

      <div className="qr-footer">
        <p className="qr-hint">
          Send this invite via iMessage, WhatsApp, Telegram, or any messenger.
          <br />
          Your contact opens the link to join securely.
        </p>
      </div>

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
