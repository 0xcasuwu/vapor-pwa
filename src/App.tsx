/**
 * App.tsx
 * Vapor PWA - Main Application Component
 *
 * Flow:
 * 1. Identity check: onboarding if no identity, otherwise home
 * 2. Home shows contacts list and connect options
 * 3. Connection flows: initiate (QR) or connect (scan)
 * 4. Chat session with peer
 */

import { useState, useEffect } from 'react';
import { Home } from './components/Home';
import { Onboarding } from './components/Onboarding';
import { CreateGroup } from './components/CreateGroup';
import { JoinGroup } from './components/JoinGroup';
import { GroupChat } from './components/GroupChat';
import { ReconnectFlow } from './components/ReconnectFlow';
import type { Contact } from './store/identityStore';
import { useSessionStore } from './store/sessionStore';
import { useIdentityStore } from './store/identityStore';
import { parseInviteFromUrl, clearInviteFromUrl } from './utils/share';
import { startPresence, stopPresence } from './frtun';
import './App.css';

type Screen = 'home' | 'generate' | 'scan' | 'chat' | 'joining' | 'create-group' | 'join-group' | 'group-chat' | 'reconnect';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [error, setError] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [reconnectContact, setReconnectContact] = useState<Contact | null>(null);

  const { state: sessionState } = useSessionStore();
  const { state: identityState, initialize: initIdentity } = useIdentityStore();

  const { contacts, fingerprint } = useIdentityStore();

  // Initialize identity store on mount
  useEffect(() => {
    initIdentity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize frtun presence system (gossipsub-based)
  useEffect(() => {
    if (identityState !== 'unlocked' || !fingerprint) return;

    const { updateContactPresence } = useIdentityStore.getState();

    // Start presence system with callback to update contact status
    const handlePresenceUpdate = (peerId: string, isOnline: boolean, _timestamp: number) => {
      // Find contact by frtun peer ID and update their presence
      const contact = contacts.find(c => c.frtunPeerId === peerId);
      if (contact) {
        updateContactPresence(contact.id, isOnline);
      }
    };

    startPresence(handlePresenceUpdate).catch(err => {
      console.warn('[App] Failed to start presence:', err);
    });

    // Stop presence when app unloads
    const handleBeforeUnload = () => {
      stopPresence().catch(() => {
        // Ignore errors during shutdown
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopPresence().catch(() => {
        // Ignore errors during cleanup
      });
    };
  }, [identityState, fingerprint, contacts]);

  // Watch session state changes to update screen
  // Only handle terminal states (active, error) - flow components handle intermediate states
  useEffect(() => {
    if (sessionState === 'active') {
      setScreen('chat');
    } else if (sessionState === 'error') {
      // Stay on current screen but show error
      const { error: sessionError } = useSessionStore.getState();
      setError(sessionError);
    }
  }, [sessionState]);

  // Check for incoming invite link on mount
  useEffect(() => {
    const invite = parseInviteFromUrl();
    if (invite) {
      setPendingInvite(invite);
      setScreen('joining');
      clearInviteFromUrl();
    }

    const handleHashChange = () => {
      const newInvite = parseInviteFromUrl();
      if (newInvite) {
        setPendingInvite(newInvite);
        setScreen('joining');
        clearInviteFromUrl();
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleGenerateQR = () => {
    setScreen('generate');
  };

  const handleScanQR = () => {
    setScreen('scan');
  };

  const handleCreateGroup = () => {
    setScreen('create-group');
  };

  const handleJoinGroup = () => {
    setScreen('join-group');
  };

  const handleReconnect = (contact: Contact) => {
    setReconnectContact(contact);
    setScreen('reconnect');
  };

  const handleGroupCreated = () => {
    setScreen('group-chat');
  };

  const handleGroupJoined = () => {
    setScreen('group-chat');
  };

  const handleLeaveGroup = () => {
    setScreen('home');
  };

  const handleCancel = () => {
    setScreen('home');
    setPendingInvite(null);
    setError(null);
  };

  const handleEndSession = () => {
    setScreen('home');
    setError(null);
  };

  const handleJoinComplete = () => {
    setScreen('home');
    setPendingInvite(null);
  };

  const handleConnectionComplete = () => {
    setScreen('chat');
  };

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Show loading while identity state is being determined
  if (identityState === 'loading') {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="spinner" />
          <p>Initializing...</p>
        </div>
      </div>
    );
  }

  // Show onboarding if no identity exists
  if (identityState === 'none') {
    return (
      <div className="app">
        <Onboarding />
      </div>
    );
  }

  // Identity exists but couldn't auto-unlock (e.g. first run after update)
  // Ask user to re-enter their seed phrase to unlock
  if (identityState === 'locked') {
    return (
      <div className="app">
        <Onboarding unlockMode />
      </div>
    );
  }

  return (
    <div className="app">
      {screen === 'home' && (
        <Home
          onGenerateQR={handleGenerateQR}
          onScanQR={handleScanQR}
          onCreateGroup={handleCreateGroup}
          onJoinGroup={handleJoinGroup}
          onReconnect={handleReconnect}
        />
      )}

      {screen === 'generate' && (
        <DynamicInitiatorFlow onCancel={handleCancel} onComplete={handleConnectionComplete} />
      )}

      {screen === 'scan' && (
        <DynamicResponderFlow onCancel={handleCancel} onComplete={handleConnectionComplete} />
      )}

      {screen === 'chat' && (
        <DynamicChat onEndSession={handleEndSession} />
      )}

      {screen === 'joining' && pendingInvite && (
        <JoinFromInvite
          invitePayload={pendingInvite}
          onCancel={handleCancel}
          onComplete={handleJoinComplete}
        />
      )}

      {screen === 'create-group' && (
        <CreateGroup onBack={handleCancel} onGroupCreated={handleGroupCreated} />
      )}

      {screen === 'join-group' && (
        <JoinGroup onBack={handleCancel} onJoined={handleGroupJoined} />
      )}

      {screen === 'group-chat' && (
        <GroupChat onLeave={handleLeaveGroup} />
      )}

      {screen === 'reconnect' && reconnectContact && (
        <ReconnectFlow
          contact={reconnectContact}
          onConnected={handleConnectionComplete}
          onCancel={() => {
            setReconnectContact(null);
            setScreen('home');
          }}
        />
      )}

      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          <span className="error-icon">!</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      {/* Install PWA Prompt */}
      <InstallPrompt />
    </div>
  );
}

/**
 * Join from invite link component
 */
function JoinFromInvite({
  invitePayload,
  onCancel,
  onComplete,
}: {
  invitePayload: string;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Validate the invite payload
    const validateInvite = async () => {
      try {
        // Import the QR payload decoder dynamically
        const { decodeFromCompressedBase64, decodeFromBase64, isValid, isExpired } =
          await import('./crypto/HybridQRPayload');

        const payload = decodeFromCompressedBase64(invitePayload) || decodeFromBase64(invitePayload);

        if (!payload) {
          throw new Error('Invalid invite link');
        }

        if (!isValid(payload)) {
          throw new Error('Corrupted invite data');
        }

        if (isExpired(payload)) {
          throw new Error('This invite has expired. Ask for a new one.');
        }

        setStatus('ready');
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Failed to process invite');
      }
    };

    validateInvite();
  }, [invitePayload]);

  const handleJoin = async () => {
    // In a real implementation, this would:
    // 1. Generate our own key pair
    // 2. Derive shared secret
    // 3. Set up WebRTC connection
    // For now, we just acknowledge the invite
    onComplete();
  };

  return (
    <div className="join-screen">
      <div className="join-header">
        <h2>Secure Chat Invite</h2>
        <p className="join-subtitle">
          Someone wants to start a private conversation with you
        </p>
      </div>

      <div className="join-content">
        {status === 'loading' && (
          <div className="join-loading">
            <div className="spinner"></div>
            <p>Validating invite...</p>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="join-security">
              <div className="security-icon">*</div>
              <div className="security-text">
                <strong>End-to-End Encrypted</strong>
                <span>Post-quantum secure (X25519 + ML-KEM-768)</span>
              </div>
            </div>

            <div className="join-info">
              <p>
                This conversation will be:
              </p>
              <ul>
                <li>Encrypted with quantum-resistant cryptography</li>
                <li>Direct peer-to-peer (no server)</li>
                <li>Ephemeral (no message history)</li>
              </ul>
            </div>

            <button className="btn-join" onClick={handleJoin}>
              Join Secure Chat
            </button>
          </>
        )}

        {status === 'error' && (
          <div className="join-error">
            <div className="error-icon-large">!</div>
            <p className="error-message">{errorMsg}</p>
          </div>
        )}
      </div>

      <button className="btn-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/**
 * Dynamic imports for components that use crypto
 */

/**
 * Initiator flow - Alice generates QR, waits for Bob to scan, then scans Bob's offer
 */
function DynamicInitiatorFlow({ onCancel, onComplete }: { onCancel: () => void; onComplete: () => void }) {
  const [Component, setComponent] = useState<React.ComponentType<{
    onCancel: () => void;
    onComplete: () => void;
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import('./components/InitiatorFlow')
      .then(m => setComponent(() => m.InitiatorFlow))
      .catch(err => {
        console.error('Failed to load InitiatorFlow:', err);
        setError(err.message || 'Failed to load');
      });
  }, []);

  if (error) return <div className="loading">Error: {error}</div>;
  if (!Component) return <div className="loading">Loading...</div>;
  return <Component onCancel={onCancel} onComplete={onComplete} />;
}

/**
 * Responder flow - Bob scans Alice's QR, shows offer QR, then scans Alice's answer
 */
function DynamicResponderFlow({ onCancel, onComplete }: { onCancel: () => void; onComplete: () => void }) {
  const [Component, setComponent] = useState<React.ComponentType<{
    onCancel: () => void;
    onComplete: () => void;
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    console.log('[ResponderFlow] Starting dynamic import...');
    import('./components/ResponderFlow')
      .then(m => {
        console.log('[ResponderFlow] Import successful, module:', m);
        setComponent(() => m.ResponderFlow);
        setLoadState('loaded');
      })
      .catch(err => {
        console.error('[ResponderFlow] Failed to load:', err);
        setError(err.message || 'Failed to load');
        setLoadState('error');
      });
  }, []);

  if (error) return <div className="loading">Error: {error}</div>;
  if (!Component) return <div className="loading">Loading scanner... ({loadState})</div>;
  return <Component onCancel={onCancel} onComplete={onComplete} />;
}

function DynamicChat({ onEndSession }: { onEndSession: () => void }) {
  const [Component, setComponent] = useState<React.ComponentType<{ onEndSession: () => void }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import('./components/Chat')
      .then(m => setComponent(() => m.Chat))
      .catch(err => {
        console.error('Failed to load Chat:', err);
        setError(err.message || 'Failed to load');
      });
  }, []);

  if (error) return <div className="loading">Error: {error}</div>;
  if (!Component) return <div className="loading">Loading...</div>;
  return <Component onEndSession={onEndSession} />;
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
        <span className="install-icon">+</span>
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
