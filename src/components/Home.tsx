/**
 * Home.tsx
 * Vapor PWA - Home Screen
 *
 * Landing page with options to:
 * - Generate QR (initiate session)
 * - Scan QR (join session)
 */

interface HomeProps {
  onGenerateQR: () => void;
  onScanQR: () => void;
}

export function Home({ onGenerateQR, onScanQR }: HomeProps) {
  return (
    <div className="home">
      <div className="home-header">
        <div className="logo">
          <VaporLogo />
        </div>
        <h1 className="title">Vapor</h1>
        <p className="tagline">Ephemeral Encrypted Messaging</p>
      </div>

      <div className="home-content">
        <div className="security-badge">
          <span className="badge-icon">🛡</span>
          <span className="badge-text">Post-Quantum Secure</span>
        </div>

        <p className="description">
          Start a private conversation that leaves no trace.
          Messages are encrypted with quantum-resistant cryptography
          and transmitted peer-to-peer.
        </p>

        <div className="action-buttons">
          <button className="btn-primary" onClick={onGenerateQR}>
            <QRIcon />
            <span>Show My QR</span>
          </button>

          <button className="btn-secondary" onClick={onScanQR}>
            <ScanIcon />
            <span>Scan QR Code</span>
          </button>
        </div>
      </div>

      <div className="home-footer">
        <div className="crypto-info">
          <h3>Cryptography</h3>
          <ul>
            <li>
              <strong>Key Exchange:</strong> X25519 + ML-KEM-768 (Hybrid)
            </li>
            <li>
              <strong>Encryption:</strong> XChaCha20-Poly1305
            </li>
            <li>
              <strong>Key Derivation:</strong> HKDF-SHA256
            </li>
          </ul>
        </div>

        <p className="footer-text">
          No accounts. No servers. No history.
          <br />
          <span className="muted">Messages vanish because they were never really there.</span>
        </p>
      </div>
    </div>
  );
}

function VaporLogo() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="vaporGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="45" fill="url(#vaporGradient)" opacity="0.1" />
      <circle cx="50" cy="50" r="35" fill="url(#vaporGradient)" opacity="0.2" />
      <path
        d="M50 20C35 20 25 35 25 50C25 65 35 75 50 75C50 75 45 65 45 50C45 35 50 20 50 20Z"
        fill="url(#vaporGradient)"
        opacity="0.6"
      />
      <path
        d="M50 20C65 20 75 35 75 50C75 65 65 75 50 75C50 75 55 65 55 50C55 35 50 20 50 20Z"
        fill="url(#vaporGradient)"
        opacity="0.8"
      />
      <circle cx="50" cy="50" r="8" fill="url(#vaporGradient)" />
    </svg>
  );
}

function QRIcon() {
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
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="3" height="3" />
      <rect x="18" y="14" width="3" height="3" />
      <rect x="14" y="18" width="3" height="3" />
      <rect x="18" y="18" width="3" height="3" />
    </svg>
  );
}

function ScanIcon() {
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
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}
