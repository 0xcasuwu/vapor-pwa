/**
 * share.ts
 * Vapor PWA - URL Handling Utilities
 *
 * Handles parsing incoming invite links
 * (QR image sharing is handled directly in QRGenerator)
 */

/**
 * Parse invite payload from URL
 * Supports legacy URL format for backwards compatibility
 */
export function parseInviteFromUrl(): string | null {
  const hash = window.location.hash;

  // Check for #/join/PAYLOAD format
  const joinMatch = hash.match(/^#\/join\/(.+)$/);
  if (joinMatch) {
    try {
      return decodeURIComponent(joinMatch[1]);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Clear invite from URL (after processing)
 */
export function clearInviteFromUrl(): void {
  if (window.location.hash.startsWith('#/join/')) {
    history.replaceState(null, '', window.location.pathname);
  }
}

/**
 * Check if there's a pending invite in the URL
 */
export function hasPendingInvite(): boolean {
  return parseInviteFromUrl() !== null;
}
