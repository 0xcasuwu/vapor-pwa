/**
 * Home.tsx
 * Vapor PWA - Home Screen
 *
 * Shows identity fingerprint, contacts list, and connection options.
 * Cyberpunk Japanese aesthetic with ethereal vapor and neon glow.
 */

import { useState } from 'react';
import { useIdentityStore } from '../store/identityStore';
import type { Contact } from '../store/identityStore';

interface HomeProps {
  onGenerateQR: () => void;
  onScanQR: () => void;
  onCreateGroup?: () => void;
  onJoinGroup?: () => void;
  onReconnect?: (contact: Contact) => void;
}

export function Home({ onGenerateQR, onScanQR, onCreateGroup, onJoinGroup, onReconnect }: HomeProps) {
  const [showSettings, setShowSettings] = useState(false);
  const { fingerprint, contacts } = useIdentityStore();

  return (
    <div className="home">
      {/* Animated background elements */}
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      <div className="home-header">
        <div className="header-top">
          <div className="identity-badge" onClick={() => setShowSettings(true)}>
            <span className="identity-icon">
              <IdentityIcon />
            </span>
            <span className="identity-fingerprint">{fingerprint || '--------'}</span>
          </div>
          <button className="btn-settings" onClick={() => setShowSettings(true)}>
            <SettingsIcon />
          </button>
        </div>

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
        {contacts.length > 0 ? (
          <ContactsList contacts={contacts} onReconnect={onReconnect} />
        ) : (
          <>
            <div className="security-badge">
              <span className="badge-glow" />
              <span className="badge-text">POST-QUANTUM SECURE</span>
            </div>
            <p className="description">
              Ephemeral encrypted messaging.<br />
              No servers. No trace. No history.
            </p>
          </>
        )}

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

        {/* Group Chat Section */}
        <div className="group-section">
          <div className="group-header">
            <span className="group-kanji">集団</span>
            <span className="group-label">GROUP CHAT</span>
          </div>
          <div className="group-buttons">
            <button className="btn-group btn-neon" onClick={onCreateGroup}>
              <GroupHostIcon />
              <span>HOST</span>
            </button>
            <button className="btn-group btn-neon" onClick={onJoinGroup}>
              <GroupJoinIcon />
              <span>JOIN</span>
            </button>
          </div>
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

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function ContactsList({
  contacts,
  onReconnect,
}: {
  contacts: Contact[];
  onReconnect?: (contact: Contact) => void;
}) {
  // Sort by last seen, then by added date
  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.lastSeen && b.lastSeen) return b.lastSeen - a.lastSeen;
    if (a.lastSeen) return -1;
    if (b.lastSeen) return 1;
    return b.addedAt - a.addedAt;
  });

  return (
    <div className="contacts-section">
      <div className="contacts-header">
        <span className="contacts-kanji">連絡先</span>
        <span className="contacts-label">CONTACTS</span>
        <span className="contacts-count">{contacts.length}</span>
      </div>
      <div className="contacts-list">
        {sortedContacts.map(contact => (
          <ContactItem key={contact.id} contact={contact} onReconnect={onReconnect} />
        ))}
      </div>
    </div>
  );
}

function ContactItem({
  contact,
  onReconnect,
}: {
  contact: Contact;
  onReconnect?: (contact: Contact) => void;
}) {
  const publicKeyHex = Array.from(contact.publicKey.slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return null;
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  };

  // Check if contact supports zero-code reconnection (frtun peer ID)
  const canReconnect = contact.frtunPeerId && contact.frtunPeerId.length > 0;

  const handleClick = () => {
    if (canReconnect && onReconnect) {
      onReconnect(contact);
    }
  };

  return (
    <div
      className={`contact-item ${canReconnect ? 'contact-reconnectable' : ''}`}
      onClick={handleClick}
      style={{ cursor: canReconnect ? 'pointer' : 'default' }}
    >
      <div className="contact-avatar">
        {contact.isOnline && <span className="online-dot" />}
        <span>{contact.nickname.charAt(0).toUpperCase()}</span>
      </div>
      <div className="contact-info">
        <span className="contact-name">{contact.nickname}</span>
        <span className="contact-key">{publicKeyHex}</span>
      </div>
      <div className="contact-status">
        {contact.isOnline ? (
          <span className="status-online">online</span>
        ) : canReconnect ? (
          <button
            className="btn-reconnect"
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
          >
            <ReconnectIcon />
            <span>reconnect</span>
          </button>
        ) : contact.lastSeen ? (
          <span className="contact-time">{formatTime(contact.lastSeen)}</span>
        ) : (
          <span className="contact-legacy">no relay</span>
        )}
      </div>
    </div>
  );
}

function ReconnectIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { fingerprint, revealMnemonic, wipeAll, contacts, exportContacts, importContacts } = useIdentityStore();
  const [showSeed, setShowSeed] = useState(false);
  const [revealedSeed, setRevealedSeed] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  // File input is created dynamically in handleImportClick, no ref needed

  const handleRevealSeed = () => {
    const seed = revealMnemonic();
    if (seed) {
      setRevealedSeed(seed);
      setShowSeed(true);
    } else {
      setRevealedSeed(null);
      setShowSeed(false);
    }
  };

  const handleWipe = async () => {
    if (confirmWipe) {
      await wipeAll();
      onClose();
    } else {
      setConfirmWipe(true);
    }
  };

  const handleExport = async () => {
    try {
      setExportStatus('Exporting...');
      await exportContacts();
      setExportStatus('Contacts exported!');
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vapor';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setImportStatus('Importing...');
        const result = await importContacts(file);
        setImportStatus(`Imported ${result.imported} contacts${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`);
        setTimeout(() => setImportStatus(null), 3000);
      } catch (err) {
        setImportStatus(err instanceof Error ? err.message : 'Import failed');
      }
    };
    input.click();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn-close" onClick={onClose}>x</button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <div className="settings-label">Identity</div>
            <div className="settings-value fingerprint">{fingerprint}</div>
          </div>

          {/* Browser Warning */}
          <div className="browser-warning">
            <WarningIcon />
            <span>Contacts are stored locally in this browser. Export to use on other devices.</span>
          </div>

          {/* Export/Import Section */}
          <div className="settings-section">
            <div className="settings-label">Contacts ({contacts.length})</div>
            <div className="export-import-buttons">
              <button
                className="btn-settings-action"
                onClick={handleExport}
                disabled={contacts.length === 0}
              >
                <ExportIcon />
                <span>Export Contacts</span>
              </button>
              <button className="btn-settings-action" onClick={handleImportClick}>
                <ImportIcon />
                <span>Import Contacts</span>
              </button>
            </div>
            {exportStatus && <div className="status-message">{exportStatus}</div>}
            {importStatus && <div className="status-message">{importStatus}</div>}
          </div>

          {!showSeed && !revealedSeed && (
            <button className="btn-settings-action" onClick={handleRevealSeed}>
              <span>Reveal Recovery Phrase</span>
              <WarningBadge />
            </button>
          )}

          {showSeed && revealedSeed && (
            <div className="seed-reveal">
              <div className="seed-warning-small">
                <WarningIcon />
                <span>Write this down securely!</span>
              </div>
              <div className="seed-words-grid">
                {revealedSeed.split(' ').map((word, i) => (
                  <div key={i} className="seed-word-small">
                    <span className="word-num">{i + 1}</span>
                    <span>{word}</span>
                  </div>
                ))}
              </div>
              <button className="btn-hide-seed" onClick={() => setShowSeed(false)}>
                Hide Phrase
              </button>
            </div>
          )}

          <div className="settings-danger">
            <button
              className={`btn-danger ${confirmWipe ? 'confirming' : ''}`}
              onClick={handleWipe}
            >
              {confirmWipe ? 'Confirm Wipe All Data' : 'Wipe Identity & Data'}
            </button>
            {confirmWipe && (
              <p className="danger-warning">
                This will delete your identity and all contacts. This cannot be undone.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function WarningBadge() {
  return <span className="warning-badge">!</span>;
}

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IdentityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
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

function GroupHostIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Shield for host */}
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      {/* Star in center */}
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function GroupJoinIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Multiple people */}
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
