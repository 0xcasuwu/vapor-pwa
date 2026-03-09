/**
 * App.tsx
 * Vapor PWA - Main Application Component
 *
 * Manages the main application flow:
 * - Home → Generate QR / Scan QR
 * - Session establishment
 * - Chat interface
 */

import { useState, useEffect } from 'react';
import { Home } from './components/Home';
import { QRGenerator } from './components/QRGenerator';
import { QRScanner } from './components/QRScanner';
import { Chat } from './components/Chat';
import { useSessionStore } from './store/sessionStore';
import './App.css';

type Screen = 'home' | 'generate' | 'scan' | 'chat';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const { state, error } = useSessionStore();

  // Navigate to chat when session becomes active
  useEffect(() => {
    if (state === 'active') {
      setScreen('chat');
    }
  }, [state]);

  const handleGenerateQR = () => {
    setScreen('generate');
  };

  const handleScanQR = () => {
    setScreen('scan');
  };

  const handleCancel = () => {
    setScreen('home');
  };

  const handleScanned = (_offer: string) => {
    // In a full implementation, we would exchange WebRTC signaling here
    // For now, the session store handles the connection
    // This would typically involve a signaling server or manual exchange
    console.log('QR scanned, WebRTC offer generated');
  };

  const handleEndSession = () => {
    setScreen('home');
  };

  return (
    <div className="app">
      {screen === 'home' && (
        <Home onGenerateQR={handleGenerateQR} onScanQR={handleScanQR} />
      )}

      {screen === 'generate' && (
        <QRGenerator onCancel={handleCancel} />
      )}

      {screen === 'scan' && (
        <QRScanner onCancel={handleCancel} onScanned={handleScanned} />
      )}

      {screen === 'chat' && (
        <Chat onEndSession={handleEndSession} />
      )}

      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      {/* Install PWA Prompt */}
      <InstallPrompt />
    </div>
  );
}

/**
 * PWA Install Prompt Component
 */
function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="install-prompt">
      <div className="install-content">
        <span className="install-icon">📲</span>
        <div className="install-text">
          <strong>Install Vapor</strong>
          <span>Add to home screen for the best experience</span>
        </div>
      </div>
      <div className="install-actions">
        <button className="btn-install" onClick={handleInstall}>
          Install
        </button>
        <button className="btn-dismiss" onClick={handleDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}

// TypeScript type for the install prompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default App;
