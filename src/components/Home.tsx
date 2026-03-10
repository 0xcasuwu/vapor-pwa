/**
 * Home.tsx
 * Vapor PWA - Home Screen
 *
 * Cyberpunk Japanese aesthetic with ethereal vapor and neon glow
 */

interface HomeProps {
  onGenerateQR: () => void;
  onScanQR: () => void;
}

export function Home({ onGenerateQR, onScanQR }: HomeProps) {
  return (
    <div className="home">
      {/* Animated background elements */}
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      <div className="home-header">
        <div className="logo">
          <VaporLogo />
        </div>
        <div className="title-container">
          <h1 className="title">
            <span className="title-jp">蒸気</span>
            <span className="title-en">VAPOR</span>
          </h1>
          <p className="tagline">消える前に存在しない</p>
          <p className="tagline-en">Gone before it existed</p>
        </div>
      </div>

      <div className="home-content">
        <div className="security-badge">
          <span className="badge-glow" />
          <span className="badge-text">POST-QUANTUM SECURE</span>
        </div>

        <p className="description">
          Ephemeral encrypted messaging.<br />
          No servers. No trace. No history.
        </p>

        <div className="action-buttons">
          <button className="btn-primary btn-neon" onClick={onGenerateQR}>
            <QRIcon />
            <span>INITIATE</span>
          </button>

          <button className="btn-secondary btn-neon" onClick={onScanQR}>
            <ScanIcon />
            <span>CONNECT</span>
          </button>
        </div>
      </div>

      <div className="home-footer">
        <div className="crypto-info">
          <div className="crypto-header">
            <span className="crypto-kanji">暗号</span>
            <span className="crypto-label">CRYPTOGRAPHY</span>
          </div>
          <div className="crypto-specs">
            <div className="spec-item">
              <span className="spec-label">KEY</span>
              <span className="spec-value">X25519 + ML-KEM-768</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">CIPHER</span>
              <span className="spec-value">XChaCha20-Poly1305</span>
            </div>
            <div className="spec-item">
              <span className="spec-label">KDF</span>
              <span className="spec-value">HKDF-SHA256</span>
            </div>
          </div>
        </div>

        <p className="footer-text">
          <span className="footer-jp">痕跡なし</span>
          <span className="footer-divider">//</span>
          <span className="footer-en">Zero Trace Protocol</span>
        </p>
      </div>
    </div>
  );
}

function VaporLogo() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="vapor-logo"
    >
      <defs>
        {/* Neon glow filters */}
        <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#00fff2" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="glow-pink" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#ff00aa" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradients */}
        <linearGradient id="vapor-grad-1" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00fff2" stopOpacity="0" />
          <stop offset="50%" stopColor="#00fff2" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00fff2" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="vapor-grad-2" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#ff00aa" stopOpacity="0" />
          <stop offset="50%" stopColor="#ff00aa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ff00aa" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="vapor-grad-3" x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0" />
          <stop offset="60%" stopColor="#7c3aed" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Outer ethereal ring */}
      <circle
        cx="60"
        cy="60"
        r="55"
        stroke="url(#vapor-grad-1)"
        strokeWidth="0.5"
        fill="none"
        opacity="0.5"
        className="ring-outer"
      />

      {/* Vapor wisps - Japanese ink brush style */}
      <g className="vapor-wisps">
        {/* Left wisp */}
        <path
          d="M35 85 Q25 70 30 55 Q35 40 45 30 Q50 25 55 28"
          stroke="url(#vapor-grad-1)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          filter="url(#glow-cyan)"
          className="wisp wisp-1"
        />

        {/* Center wisp */}
        <path
          d="M60 90 Q55 75 60 60 Q65 45 60 30 Q58 22 60 18"
          stroke="url(#vapor-grad-3)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          filter="url(#glow-pink)"
          className="wisp wisp-2"
        />

        {/* Right wisp */}
        <path
          d="M85 85 Q95 70 90 55 Q85 40 75 30 Q70 25 65 28"
          stroke="url(#vapor-grad-2)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          filter="url(#glow-pink)"
          className="wisp wisp-3"
        />
      </g>

      {/* Inner geometric - minimal enso-inspired circle */}
      <circle
        cx="60"
        cy="55"
        r="12"
        stroke="#00fff2"
        strokeWidth="1.5"
        fill="none"
        filter="url(#glow-cyan)"
        strokeDasharray="60 20"
        className="enso"
      />

      {/* Core point */}
      <circle
        cx="60"
        cy="55"
        r="3"
        fill="#ff00aa"
        filter="url(#glow-pink)"
        className="core"
      />

      {/* Kanji water radical hint (subtle) */}
      <text
        x="60"
        y="105"
        textAnchor="middle"
        fill="#00fff2"
        fontSize="10"
        fontFamily="serif"
        opacity="0.4"
        filter="url(#glow-cyan)"
      >
        気
      </text>
    </svg>
  );
}

function QRIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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
