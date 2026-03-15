/**
 * sw-push.js
 * Vapor PWA - Push Notification Handler for Service Worker
 *
 * This script handles incoming push notifications for presence updates.
 * It runs in the service worker context and updates contact status in IndexedDB.
 */

// IndexedDB database name for identity store
const DB_NAME = 'vapor-identity';
const CONTACTS_STORE = 'contacts';

/**
 * Handle incoming push events
 */
self.addEventListener('push', (event) => {
  console.log('[SW Push] Received push notification');

  if (!event.data) {
    console.log('[SW Push] No data in push');
    return;
  }

  let message;
  try {
    message = event.data.json();
  } catch (e) {
    console.error('[SW Push] Failed to parse push data:', e);
    return;
  }

  console.log('[SW Push] Message:', message);

  // Handle presence update
  if (message.type === 'online' || message.type === 'offline' || message.type === 'away') {
    event.waitUntil(handlePresenceUpdate(message));
  }
});

/**
 * Update contact presence in IndexedDB
 */
async function handlePresenceUpdate(message) {
  const { fingerprint, type, timestamp } = message;

  try {
    const db = await openDatabase();
    const tx = db.transaction(CONTACTS_STORE, 'readwrite');
    const store = tx.objectStore(CONTACTS_STORE);

    // Find contact by fingerprint (stored in publicKey hash)
    const allContacts = await getAllFromStore(store);

    for (const contact of allContacts) {
      // Check if this contact's fingerprint matches
      const contactFingerprint = await hashPublicKey(contact.publicKey);
      if (contactFingerprint === fingerprint) {
        // Update presence
        contact.isOnline = type === 'online';
        contact.lastPresenceUpdate = timestamp;
        if (type === 'online') {
          contact.lastSeen = timestamp;
        }

        await putInStore(store, contact);

        console.log(`[SW Push] Updated ${contact.nickname} to ${type}`);

        // Show notification if configured (optional)
        if (type === 'online' && Notification.permission === 'granted') {
          self.registration.showNotification('Vapor', {
            body: `${contact.nickname} is now online`,
            icon: '/pwa-192x192.png',
            tag: `presence-${contact.id}`,
            renotify: false,
          });
        }

        break;
      }
    }

    await tx.done;
  } catch (error) {
    console.error('[SW Push] Failed to update presence:', error);
  }
}

/**
 * Open IndexedDB database
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Get all records from an object store
 */
function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Put a record in an object store
 */
function putInStore(store, record) {
  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Hash a public key to get fingerprint
 */
async function hashPublicKey(publicKey) {
  const hash = await crypto.subtle.digest('SHA-256', publicKey);
  return Array.from(new Uint8Array(hash))
    .slice(0, 4)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Handle notification click
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW Push] Notification clicked');
  event.notification.close();

  // Focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if found
      for (const client of clientList) {
        if (client.url.includes('/vapor-pwa') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow('/vapor-pwa/');
      }
    })
  );
});

console.log('[SW Push] Push handler loaded');
