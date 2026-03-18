/**
 * ContactExport.ts
 * Vapor PWA - Encrypted Contact Export/Import
 *
 * Allows users to export their contacts as an encrypted file that can be
 * imported on another browser/device using their seed phrase.
 *
 * Export format: JSON encrypted with XChaCha20-Poly1305 using a key derived
 * from the user's mnemonic phrase.
 */

import { encrypt, decrypt } from './Encryption';

// Version for future compatibility
const EXPORT_VERSION = 1;

// Magic bytes to identify Vapor export files
const MAGIC_HEADER = 'VAPOR_CONTACTS_V1';

export interface ContactExportEntry {
  id: string;
  nickname: string;
  publicKey: string; // base64 encoded
  addedAt: number;
  lastSeen?: number;
  frtunPeerId?: string;
}

export interface ContactExportData {
  version: number;
  magic: string;
  exportedAt: number;
  fingerprint: string; // Identity fingerprint for verification
  contacts: ContactExportEntry[];
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Export contacts to an encrypted blob
 *
 * @param contacts - Array of contacts to export
 * @param storageKey - 32-byte key derived from mnemonic
 * @param fingerprint - User's identity fingerprint
 * @returns Blob containing encrypted export data
 */
export async function exportContacts(
  contacts: Array<{
    id: string;
    nickname: string;
    publicKey: Uint8Array;
    addedAt: number;
    lastSeen?: number;
    frtunPeerId?: string;
  }>,
  storageKey: Uint8Array,
  fingerprint: string
): Promise<Blob> {
  // Convert contacts to exportable format
  const exportEntries: ContactExportEntry[] = contacts.map(contact => ({
    id: contact.id,
    nickname: contact.nickname,
    publicKey: uint8ToBase64(contact.publicKey),
    addedAt: contact.addedAt,
    lastSeen: contact.lastSeen,
    frtunPeerId: contact.frtunPeerId,
  }));

  const exportData: ContactExportData = {
    version: EXPORT_VERSION,
    magic: MAGIC_HEADER,
    exportedAt: Date.now(),
    fingerprint,
    contacts: exportEntries,
  };

  // Serialize to JSON
  const jsonString = JSON.stringify(exportData);

  // Encrypt with storage key
  const encrypted = await encrypt(jsonString, storageKey);

  // Create downloadable blob
  return new Blob([encrypted.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}

/**
 * Import contacts from an encrypted file
 *
 * @param file - File containing encrypted export data
 * @param storageKey - 32-byte key derived from mnemonic
 * @returns Array of imported contacts
 * @throws Error if decryption fails or data is invalid
 */
export async function importContacts(
  file: File,
  storageKey: Uint8Array
): Promise<{
  contacts: Array<{
    id: string;
    nickname: string;
    publicKey: Uint8Array;
    addedAt: number;
    lastSeen?: number;
    frtunPeerId?: string;
  }>;
  exportedAt: number;
  sourceFingerprint: string;
}> {
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const encryptedData = new Uint8Array(arrayBuffer);

  // Decrypt
  let jsonString: string;
  try {
    jsonString = await decrypt(encryptedData, storageKey);
  } catch {
    throw new Error('Failed to decrypt. Wrong seed phrase or corrupted file.');
  }

  // Parse JSON
  let exportData: ContactExportData;
  try {
    exportData = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid export file format.');
  }

  // Validate magic header
  if (exportData.magic !== MAGIC_HEADER) {
    throw new Error('Not a valid Vapor contacts file.');
  }

  // Validate version
  if (exportData.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${exportData.version}`);
  }

  // Convert contacts back to internal format
  const contacts = exportData.contacts.map(entry => ({
    id: entry.id,
    nickname: entry.nickname,
    publicKey: base64ToUint8(entry.publicKey),
    addedAt: entry.addedAt,
    lastSeen: entry.lastSeen,
    frtunPeerId: entry.frtunPeerId,
  }));

  return {
    contacts,
    exportedAt: exportData.exportedAt,
    sourceFingerprint: exportData.fingerprint,
  };
}

/**
 * Generate a filename for the export
 */
export function generateExportFilename(fingerprint: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `vapor-contacts-${fingerprint}-${date}.vapor`;
}

/**
 * Trigger a file download in the browser
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
