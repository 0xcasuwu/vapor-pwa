/**
 * SafetyNumber.ts
 * Vapor PWA - Safety Number Generation for MITM Protection
 *
 * Generates a human-readable fingerprint from both parties' public keys.
 * If an attacker is performing a MITM attack, the fingerprints will not match
 * because each party will have different key combinations.
 *
 * Format: 6 words from a wordlist, derived from SHA-256 hash of combined keys
 */

// BIP-39 inspired wordlist (256 common, memorable words)
const WORDLIST = [
  'apple', 'river', 'mountain', 'sunset', 'ocean', 'forest', 'thunder', 'crystal',
  'shadow', 'phoenix', 'dragon', 'garden', 'winter', 'summer', 'autumn', 'spring',
  'silver', 'golden', 'copper', 'bronze', 'diamond', 'emerald', 'ruby', 'sapphire',
  'tiger', 'eagle', 'wolf', 'falcon', 'panther', 'lion', 'hawk', 'raven',
  'castle', 'tower', 'bridge', 'harbor', 'island', 'valley', 'canyon', 'meadow',
  'storm', 'breeze', 'flame', 'frost', 'lightning', 'rainbow', 'aurora', 'comet',
  'marble', 'granite', 'obsidian', 'jade', 'pearl', 'coral', 'amber', 'onyx',
  'spirit', 'cosmic', 'stellar', 'lunar', 'solar', 'nebula', 'galaxy', 'quasar',
  'cipher', 'quantum', 'vector', 'matrix', 'prism', 'vertex', 'nexus', 'apex',
  'echo', 'pulse', 'wave', 'spark', 'flare', 'glow', 'shine', 'gleam',
  'anchor', 'compass', 'voyage', 'summit', 'horizon', 'zenith', 'orbit', 'beacon',
  'temple', 'shrine', 'grove', 'oasis', 'haven', 'refuge', 'shelter', 'sanctuary',
  'crimson', 'azure', 'violet', 'scarlet', 'indigo', 'cobalt', 'teal', 'coral',
  'mystic', 'ancient', 'eternal', 'infinite', 'silent', 'hidden', 'secret', 'sacred',
  'swift', 'brave', 'noble', 'fierce', 'gentle', 'steady', 'calm', 'bold',
  'whisper', 'thunder', 'ripple', 'cascade', 'torrent', 'current', 'stream', 'tide',
  'arctic', 'tropic', 'alpine', 'coastal', 'desert', 'prairie', 'tundra', 'savanna',
  'falcon', 'condor', 'osprey', 'heron', 'crane', 'swan', 'dove', 'sparrow',
  'maple', 'cedar', 'willow', 'birch', 'oak', 'pine', 'elm', 'ash',
  'jasper', 'opal', 'topaz', 'garnet', 'quartz', 'agate', 'zircon', 'beryl',
  'delta', 'sigma', 'omega', 'alpha', 'gamma', 'theta', 'kappa', 'lambda',
  'north', 'south', 'east', 'west', 'polar', 'equator', 'tropic', 'meridian',
  'spark', 'ember', 'blaze', 'inferno', 'kindle', 'ignite', 'radiant', 'luminous',
  'velvet', 'silk', 'satin', 'linen', 'cotton', 'wool', 'cashmere', 'flannel',
  'piano', 'violin', 'cello', 'flute', 'trumpet', 'guitar', 'drums', 'harp',
  'morning', 'evening', 'midnight', 'twilight', 'dawn', 'dusk', 'noon', 'night',
  'jasmine', 'lotus', 'orchid', 'lily', 'rose', 'tulip', 'daisy', 'iris',
  'voyage', 'quest', 'journey', 'odyssey', 'venture', 'expedition', 'mission', 'passage',
  'cipher', 'code', 'enigma', 'puzzle', 'riddle', 'mystery', 'secret', 'arcane',
  'meteor', 'asteroid', 'planet', 'moon', 'star', 'sun', 'nova', 'pulsar',
  'chrome', 'titanium', 'platinum', 'mercury', 'iron', 'steel', 'alloy', 'carbon',
  'vertex', 'prism', 'helix', 'spiral', 'fractal', 'mosaic', 'lattice', 'grid',
];

/**
 * Generate a safety number from two sets of public keys
 * Keys are sorted to ensure both parties derive the same fingerprint
 */
export async function generateSafetyNumber(
  localPublicKeys: Uint8Array,
  remotePublicKeys: Uint8Array
): Promise<string> {
  // Sort keys to ensure consistent ordering regardless of who is "local"
  // This way Alice and Bob both compute the same hash
  const [first, second] = sortKeys(localPublicKeys, remotePublicKeys);

  // Combine keys
  const combined = new Uint8Array(first.length + second.length);
  combined.set(first, 0);
  combined.set(second, first.length);

  // Hash with SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to 6 words
  return hashToWords(hashArray, 6);
}

/**
 * Generate a numeric safety number (like Signal's)
 * Returns 12 groups of 5 digits
 */
export async function generateNumericSafetyNumber(
  localPublicKeys: Uint8Array,
  remotePublicKeys: Uint8Array
): Promise<string> {
  const [first, second] = sortKeys(localPublicKeys, remotePublicKeys);

  const combined = new Uint8Array(first.length + second.length);
  combined.set(first, 0);
  combined.set(second, first.length);

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to numeric format: 12 groups of 5 digits
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    // Take 2 bytes, convert to 5-digit number (00000-65535, padded)
    const value = (hashArray[i * 2] << 8) | hashArray[i * 2 + 1];
    groups.push(value.toString().padStart(5, '0'));
  }

  return groups.join(' ');
}

/**
 * Sort two key arrays deterministically
 * Ensures both parties get the same order
 */
function sortKeys(a: Uint8Array, b: Uint8Array): [Uint8Array, Uint8Array] {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] < b[i]) return [a, b];
    if (a[i] > b[i]) return [b, a];
  }
  // If equal prefix, shorter one first
  return a.length <= b.length ? [a, b] : [b, a];
}

/**
 * Convert hash bytes to words
 */
function hashToWords(hash: Uint8Array, wordCount: number): string {
  const words: string[] = [];
  const wordlistSize = WORDLIST.length; // 256

  for (let i = 0; i < wordCount; i++) {
    // Use one byte per word (gives us 256 possibilities = our wordlist size)
    const index = hash[i] % wordlistSize;
    words.push(WORDLIST[index]);
  }

  return words.join('-');
}

/**
 * Format safety number for display
 * Capitalizes each word for readability
 */
export function formatSafetyNumber(safetyNumber: string): string {
  return safetyNumber
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' · ');
}
