/**
 * QRGenerator.tsx
 * Vapor PWA - QR Code Generation Component
 *
 * Displays the QR code for session initiation with:
 * - Auto-refresh on expiry
 * - Countdown timer
 * - Quantum security indicator
 * - Share QR image via iMessage/WhatsApp/Telegram/etc
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { useSessionStore } from '../store/sessionStore';

interface QRGeneratorProps {
  onCancel: () => void;
}

export function QRGenerator({ onCancel }: QRGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'saved' | 'error'>('idle');
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
    if (!qrString || !canvasRef.current) return;

    const blob = await getQRImageBlob();
    if (!blob) {
      setShareStatus('error');
      setTimeout(() => setShareStatus('idle'), 3000);
      return;
    }

    // Create file for sharing
    const file = new File([blob], 'vapor-invite.png', { type: 'image/png' });

    // Try Web Share API with file (requires HTTPS and modern browser)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Vapor - Secure Chat Invite',
          text: 'Scan this QR code with Vapor to join my secure chat',
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

  return (
    <div className="qr-generator">
      <div className="qr-header">
        <h2>Invite to Secure Chat</h2>
        <p className="qr-subtitle">
          Share this QR code image via any messenger
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
          disabled={!qrString || shareStatus !== 'idle'}
        >
          <ShareIcon />
          <span>{shareStatus === 'idle' ? getShareButtonText() : getStatusMessage()}</span>
        </button>
      </div>

      <div className="qr-footer">
        <p className="qr-hint">
          Send the QR image via iMessage, WhatsApp, Telegram, or any messenger.
          <br />
          Your contact scans it with Vapor to join securely.
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
