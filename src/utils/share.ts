/**
 * share.ts
 * Vapor PWA - Sharing Utilities
 *
 * Handles sharing session invites via:
 * - Web Share API (native share sheet on mobile)
 * - Clipboard fallback (desktop)
 * - Deep links for direct app opening
 */

/**
 * Generate a shareable invite URL
 * The payload is embedded in the URL fragment (not sent to server)
 */
export function generateInviteUrl(qrPayload: string): string {
  const baseUrl = window.location.origin;
  // Use fragment (#) so payload never hits server logs
  return `${baseUrl}/#/join/${encodeURIComponent(qrPayload)}`;
}

/**
 * Parse invite payload from URL
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
 * Share invite via Web Share API or clipboard
 */
export async function shareInvite(qrPayload: string): Promise<{ method: 'share' | 'clipboard'; success: boolean }> {
  const inviteUrl = generateInviteUrl(qrPayload);
  const shareText = `Join my secure Vapor chat`;

  // Try Web Share API first (native share sheet)
  if (navigator.share && canUseWebShare()) {
    try {
      await navigator.share({
        title: 'Vapor - Secure Chat Invite',
        text: shareText,
        url: inviteUrl,
      });
      return { method: 'share', success: true };
    } catch (err) {
      // User cancelled or share failed
      if ((err as Error).name !== 'AbortError') {
        console.warn('Web Share failed:', err);
      }
      return { method: 'share', success: false };
    }
  }

  // Fallback to clipboard
  return copyToClipboard(inviteUrl);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<{ method: 'clipboard'; success: boolean }> {
  try {
    await navigator.clipboard.writeText(text);
    return { method: 'clipboard', success: true };
  } catch {
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return { method: 'clipboard', success: true };
    } catch {
      return { method: 'clipboard', success: false };
    }
  }
}

/**
 * Check if Web Share API is available and usable
 */
function canUseWebShare(): boolean {
  // Web Share API requires secure context
  if (!window.isSecureContext) return false;

  // Check if we're on mobile (share sheet is more useful there)
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return isMobile;
}

/**
 * Get share button text based on platform
 */
export function getShareButtonText(): string {
  if (typeof navigator.share === 'function' && canUseWebShare()) {
    return 'Share Invite';
  }
  return 'Copy Invite Link';
}

/**
 * Check if there's a pending invite in the URL
 */
export function hasPendingInvite(): boolean {
  return parseInviteFromUrl() !== null;
}
