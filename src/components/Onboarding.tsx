/**
 * Onboarding.tsx
 * Vapor PWA - Identity Setup Flow
 *
 * Handles:
 * 1. Welcome screen (create vs import)
 * 2. Seed phrase display (with backup confirmation)
 * 3. Seed phrase import
 */

import { useState } from 'react';
import { useIdentityStore } from '../store/identityStore';
import { formatMnemonicForDisplay } from '../crypto/SeedIdentity';

type OnboardingStep = 'welcome' | 'creating' | 'show_seed' | 'confirm_backup' | 'import' | 'importing';

export function Onboarding() {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [importValue, setImportValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    mnemonic,
    createIdentity,
    importIdentity,
    clearMnemonic,
  } = useIdentityStore();

  const handleCreate = async () => {
    setStep('creating');
    setError(null);

    try {
      await createIdentity();
      setStep('show_seed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create identity');
      setStep('welcome');
    }
  };

  const handleCopySeed = async () => {
    if (!mnemonic) return;

    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const handleConfirmBackup = () => {
    clearMnemonic();
    // Identity is now active, parent component will redirect
  };

  const handleImport = async () => {
    if (!importValue.trim()) {
      setError('Please enter your recovery phrase');
      return;
    }

    setStep('importing');
    setError(null);

    const success = await importIdentity(importValue.trim());

    if (!success) {
      setError(useIdentityStore.getState().error || 'Invalid recovery phrase');
      setStep('import');
    }
    // If successful, parent component will redirect
  };

  return (
    <div className="onboarding">
      {/* Welcome Screen */}
      {step === 'welcome' && (
        <div className="onboarding-step">
          <div className="onboarding-logo">
            <span className="logo-jp">蒸気</span>
            <span className="logo-en">VAPOR</span>
          </div>

          <h1>Encrypted Messaging</h1>
          <p className="onboarding-subtitle">
            End-to-end encrypted, peer-to-peer communication with quantum-resistant cryptography.
          </p>

          <div className="onboarding-features">
            <div className="feature">
              <span className="feature-icon">🔐</span>
              <span>12-word recovery phrase</span>
            </div>
            <div className="feature">
              <span className="feature-icon">👥</span>
              <span>Save contacts locally</span>
            </div>
            <div className="feature">
              <span className="feature-icon">💨</span>
              <span>Messages stay ephemeral</span>
            </div>
          </div>

          <div className="onboarding-actions">
            <button className="btn-primary btn-large" onClick={handleCreate}>
              Create New Identity
            </button>
            <button className="btn-secondary" onClick={() => setStep('import')}>
              Import Existing
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>
      )}

      {/* Creating Identity */}
      {step === 'creating' && (
        <div className="onboarding-step">
          <div className="spinner" />
          <h2>Creating Identity</h2>
          <p>Generating secure keys...</p>
        </div>
      )}

      {/* Show Seed Phrase */}
      {step === 'show_seed' && mnemonic && (
        <div className="onboarding-step">
          <div className="seed-warning">
            <WarningIcon />
            <h2>Write This Down</h2>
          </div>

          <p className="seed-description">
            This is your recovery phrase. Write it down and store it safely.
            If you lose it, you cannot recover your identity.
          </p>

          <div className="seed-display">
            {formatMnemonicForDisplay(mnemonic).map((group, i) => (
              <div key={i} className="seed-group">
                {group.split(' ').map((word, j) => (
                  <div key={j} className="seed-word">
                    <span className="word-number">{i * 4 + j + 1}</span>
                    <span className="word-text">{word}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <button className="btn-copy" onClick={handleCopySeed}>
            <CopyIcon />
            <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
          </button>

          <div className="seed-confirm">
            <p className="confirm-warning">
              Never share this phrase. Anyone with it can access your identity.
            </p>
            <button className="btn-primary" onClick={() => setStep('confirm_backup')}>
              I've Written It Down
            </button>
          </div>
        </div>
      )}

      {/* Confirm Backup */}
      {step === 'confirm_backup' && (
        <div className="onboarding-step">
          <h2>Confirm Backup</h2>

          <p className="confirm-description">
            Make sure you've saved your recovery phrase securely.
            You won't be able to see it again unless you go to Settings.
          </p>

          <div className="confirm-checklist">
            <label className="checklist-item">
              <input type="checkbox" />
              <span>I've written down my 12 words</span>
            </label>
            <label className="checklist-item">
              <input type="checkbox" />
              <span>I've stored them in a safe place</span>
            </label>
            <label className="checklist-item">
              <input type="checkbox" />
              <span>I understand I can't recover without them</span>
            </label>
          </div>

          <div className="confirm-actions">
            <button className="btn-primary" onClick={handleConfirmBackup}>
              Complete Setup
            </button>
            <button className="btn-text" onClick={() => setStep('show_seed')}>
              ← Show phrase again
            </button>
          </div>
        </div>
      )}

      {/* Import Seed */}
      {step === 'import' && (
        <div className="onboarding-step">
          <h2>Import Identity</h2>

          <p className="import-description">
            Enter your 12-word recovery phrase to restore your identity.
          </p>

          <textarea
            className="seed-input"
            placeholder="Enter your 12-word recovery phrase..."
            value={importValue}
            onChange={(e) => setImportValue(e.target.value)}
            rows={4}
          />

          {error && <div className="error-message">{error}</div>}

          <div className="import-actions">
            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={!importValue.trim()}
            >
              Restore Identity
            </button>
            <button className="btn-text" onClick={() => {
              setStep('welcome');
              setImportValue('');
              setError(null);
            }}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <div className="onboarding-step">
          <div className="spinner" />
          <h2>Restoring Identity</h2>
          <p>Deriving keys from phrase...</p>
        </div>
      )}
    </div>
  );
}

function WarningIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
