/**
 * GroupQRPayload.ts
 * Vapor PWA - Star Topology Group Chat Invite Payload
 *
 * Encodes group invite information for QR code sharing.
 * When a user creates a group, they generate an invite QR that contains:
 * - Group ID and name
 * - Host's public key for verification
 * - Host's WebRTC signaling offer (SDP)
 *
 * Joiners scan this QR to connect directly to the host.
 * The host then relays all messages between members (star topology).
 */

import pako from 'pako';

// Version for future compatibility
export const GROUP_INVITE_VERSION = 0x10; // 16 in decimal - distinct from 1:1 chat versions

// Payload structure sizes
export const GROUP_PAYLOAD_SIZES = {
  VERSION: 1,
  GROUP_ID_LENGTH: 1,      // 1 byte for length (max 255)
  NAME_LENGTH: 1,          // 1 byte for length (max 255)
  PUBLIC_KEY: 32,          // X25519 host public key
  TIMESTAMP: 8,            // float64 little-endian
  SDP_LENGTH: 2,           // 2 bytes for SDP length (max 65535)
} as const;

export interface GroupInvitePayload {
  version: number;
  groupId: string;
  groupName: string;
  hostPublicKey: Uint8Array;
  hostNickname: string;
  timestamp: number;
  // WebRTC offer SDP for direct connection to host
  offerSdp?: string;
}

/**
 * Generate a group invite payload
 */
export function generateGroupInvite(
  groupId: string,
  groupName: string,
  hostPublicKey: Uint8Array,
  hostNickname: string,
  offerSdp?: string
): GroupInvitePayload {
  return {
    version: GROUP_INVITE_VERSION,
    groupId,
    groupName,
    hostPublicKey,
    hostNickname,
    timestamp: Date.now() / 1000,
    offerSdp,
  };
}

/**
 * Encode group invite payload to binary format
 */
export function encodeGroupInvite(payload: GroupInvitePayload): Uint8Array {
  const encoder = new TextEncoder();

  const groupIdBytes = encoder.encode(payload.groupId);
  const groupNameBytes = encoder.encode(payload.groupName);
  const hostNicknameBytes = encoder.encode(payload.hostNickname);
  const sdpBytes = payload.offerSdp ? encoder.encode(payload.offerSdp) : new Uint8Array(0);

  // Calculate total size
  const totalSize =
    1 +                              // version
    1 + groupIdBytes.length +        // groupId length + data
    1 + groupNameBytes.length +      // groupName length + data
    1 + hostNicknameBytes.length +   // hostNickname length + data
    32 +                             // hostPublicKey
    8 +                              // timestamp
    2 + sdpBytes.length;             // SDP length + data

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;

  // Version (1 byte)
  view.setUint8(offset, payload.version);
  offset += 1;

  // Group ID (length + data)
  view.setUint8(offset, groupIdBytes.length);
  offset += 1;
  bytes.set(groupIdBytes, offset);
  offset += groupIdBytes.length;

  // Group name (length + data)
  view.setUint8(offset, groupNameBytes.length);
  offset += 1;
  bytes.set(groupNameBytes, offset);
  offset += groupNameBytes.length;

  // Host nickname (length + data)
  view.setUint8(offset, hostNicknameBytes.length);
  offset += 1;
  bytes.set(hostNicknameBytes, offset);
  offset += hostNicknameBytes.length;

  // Host public key (32 bytes)
  bytes.set(payload.hostPublicKey, offset);
  offset += 32;

  // Timestamp (8 bytes, float64 little-endian)
  view.setFloat64(offset, payload.timestamp, true);
  offset += 8;

  // SDP (2 bytes length + data)
  view.setUint16(offset, sdpBytes.length, true);
  offset += 2;
  if (sdpBytes.length > 0) {
    bytes.set(sdpBytes, offset);
  }

  return bytes;
}

/**
 * Decode group invite payload from binary format
 */
export function decodeGroupInvite(data: Uint8Array): GroupInvitePayload | null {
  if (data.length < 1) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  let offset = 0;

  // Version (1 byte)
  const version = view.getUint8(offset);
  offset += 1;

  if (version !== GROUP_INVITE_VERSION) {
    console.error(`Invalid group invite version: ${version}, expected ${GROUP_INVITE_VERSION}`);
    return null;
  }

  // Group ID (length + data)
  const groupIdLength = view.getUint8(offset);
  offset += 1;
  if (offset + groupIdLength > data.length) return null;
  const groupId = decoder.decode(data.slice(offset, offset + groupIdLength));
  offset += groupIdLength;

  // Group name (length + data)
  const groupNameLength = view.getUint8(offset);
  offset += 1;
  if (offset + groupNameLength > data.length) return null;
  const groupName = decoder.decode(data.slice(offset, offset + groupNameLength));
  offset += groupNameLength;

  // Host nickname (length + data)
  const hostNicknameLength = view.getUint8(offset);
  offset += 1;
  if (offset + hostNicknameLength > data.length) return null;
  const hostNickname = decoder.decode(data.slice(offset, offset + hostNicknameLength));
  offset += hostNicknameLength;

  // Host public key (32 bytes)
  if (offset + 32 > data.length) return null;
  const hostPublicKey = data.slice(offset, offset + 32);
  offset += 32;

  // Timestamp (8 bytes)
  if (offset + 8 > data.length) return null;
  const timestamp = view.getFloat64(offset, true);
  offset += 8;

  // SDP (2 bytes length + data)
  if (offset + 2 > data.length) return null;
  const sdpLength = view.getUint16(offset, true);
  offset += 2;

  let offerSdp: string | undefined;
  if (sdpLength > 0) {
    if (offset + sdpLength > data.length) return null;
    offerSdp = decoder.decode(data.slice(offset, offset + sdpLength));
  }

  return {
    version,
    groupId,
    groupName,
    hostPublicKey,
    hostNickname,
    timestamp,
    offerSdp,
  };
}

/**
 * Encode group invite to compressed base64 for QR code
 */
export function encodeGroupInviteToBase64(payload: GroupInvitePayload): string {
  const bytes = encodeGroupInvite(payload);
  const compressed = pako.deflate(bytes);
  return btoa(String.fromCharCode(...compressed));
}

/**
 * Decode group invite from compressed base64
 */
export function decodeGroupInviteFromBase64(base64: string): GroupInvitePayload | null {
  try {
    const binary = atob(base64);
    const compressed = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      compressed[i] = binary.charCodeAt(i);
    }

    // Try to decompress
    try {
      const decompressed = pako.inflate(compressed);
      return decodeGroupInvite(decompressed);
    } catch {
      // Fallback: try as uncompressed
      return decodeGroupInvite(compressed);
    }
  } catch {
    return null;
  }
}

/**
 * Check if group invite has expired (default 1 hour)
 */
export function isGroupInviteExpired(
  payload: GroupInvitePayload,
  expirySeconds: number = 3600
): boolean {
  const now = Date.now() / 1000;
  const age = now - payload.timestamp;
  return age > expirySeconds;
}

/**
 * Validate group invite payload structure
 */
export function isValidGroupInvite(payload: GroupInvitePayload): boolean {
  if (payload.version !== GROUP_INVITE_VERSION) return false;
  if (!payload.groupId || payload.groupId.length === 0) return false;
  if (!payload.groupName || payload.groupName.length === 0) return false;
  if (payload.hostPublicKey.length !== 32) return false;
  if (!payload.hostNickname || payload.hostNickname.length === 0) return false;
  return true;
}

/**
 * Get fingerprint of host public key (for display)
 */
export async function getHostFingerprint(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hash);
  return Array.from(hashArray.slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
