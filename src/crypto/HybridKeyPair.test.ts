/**
 * HybridKeyPair.test.ts
 * Tests for post-quantum hybrid key exchange
 */

import { describe, it, expect } from 'vitest';
import {
  generateHybridKeyPair,
  deriveSharedSecretAsInitiator,
  deriveSharedSecretAsResponder,
  getCombinedPublicKey,
  parseCombinedPublicKey,
  destroyKeyPair,
  KEY_SIZES,
} from './HybridKeyPair';

describe('HybridKeyPair', () => {
  describe('generateHybridKeyPair', () => {
    it('generates keys with correct sizes', async () => {
      const keyPair = await generateHybridKeyPair();

      expect(keyPair.publicKey.classical.length).toBe(KEY_SIZES.CLASSICAL_PUBLIC_KEY);
      expect(keyPair.publicKey.pq.length).toBe(KEY_SIZES.PQ_PUBLIC_KEY);
      expect(keyPair.privateKey.classical.length).toBe(KEY_SIZES.CLASSICAL_PRIVATE_KEY);
      expect(keyPair.privateKey.pq.length).toBe(KEY_SIZES.PQ_PRIVATE_KEY);
    });

    it('generates unique keys each time', async () => {
      const keyPair1 = await generateHybridKeyPair();
      const keyPair2 = await generateHybridKeyPair();

      expect(keyPair1.publicKey.classical).not.toEqual(keyPair2.publicKey.classical);
      expect(keyPair1.publicKey.pq).not.toEqual(keyPair2.publicKey.pq);
    });
  });

  describe('getCombinedPublicKey / parseCombinedPublicKey', () => {
    it('round-trips correctly', async () => {
      const keyPair = await generateHybridKeyPair();
      const combined = getCombinedPublicKey(keyPair.publicKey);

      expect(combined.length).toBe(KEY_SIZES.COMBINED_PUBLIC_KEY);

      const parsed = parseCombinedPublicKey(combined);
      expect(parsed.classical).toEqual(keyPair.publicKey.classical);
      expect(parsed.pq).toEqual(keyPair.publicKey.pq);
    });

    it('throws on invalid size', () => {
      const invalid = new Uint8Array(100);
      expect(() => parseCombinedPublicKey(invalid)).toThrow('Invalid combined public key size');
    });
  });

  describe('key exchange', () => {
    it('initiator and responder derive identical shared secrets', async () => {
      // Alice generates her keys
      const aliceKeyPair = await generateHybridKeyPair();

      // Bob generates his keys
      const bobKeyPair = await generateHybridKeyPair();

      // Bob (initiator) encapsulates to Alice
      const bobResult = await deriveSharedSecretAsInitiator(
        bobKeyPair.privateKey,
        aliceKeyPair.publicKey
      );

      // Alice (responder) decapsulates
      const aliceSecret = await deriveSharedSecretAsResponder(
        aliceKeyPair,
        bobKeyPair.publicKey.classical,
        bobResult.ciphertext
      );

      // Both should have the same shared secret
      expect(bobResult.sharedSecret).toEqual(aliceSecret);
      expect(bobResult.sharedSecret.length).toBe(KEY_SIZES.SHARED_SECRET);
    });

    it('ciphertext has correct size', async () => {
      const aliceKeyPair = await generateHybridKeyPair();
      const bobKeyPair = await generateHybridKeyPair();

      const result = await deriveSharedSecretAsInitiator(
        bobKeyPair.privateKey,
        aliceKeyPair.publicKey
      );

      expect(result.ciphertext.length).toBe(KEY_SIZES.PQ_CIPHERTEXT);
    });

    it('different key pairs produce different shared secrets', async () => {
      const alice1 = await generateHybridKeyPair();
      const alice2 = await generateHybridKeyPair();
      const bob = await generateHybridKeyPair();

      const result1 = await deriveSharedSecretAsInitiator(bob.privateKey, alice1.publicKey);
      const result2 = await deriveSharedSecretAsInitiator(bob.privateKey, alice2.publicKey);

      expect(result1.sharedSecret).not.toEqual(result2.sharedSecret);
    });
  });

  describe('destroyKeyPair', () => {
    it('zeros all key material', async () => {
      const keyPair = await generateHybridKeyPair();

      // Verify keys are not all zeros before destroy
      expect(keyPair.privateKey.classical.some(b => b !== 0)).toBe(true);

      destroyKeyPair(keyPair);

      // All bytes should be zero after destroy
      expect(keyPair.privateKey.classical.every(b => b === 0)).toBe(true);
      expect(keyPair.privateKey.pq.every(b => b === 0)).toBe(true);
      expect(keyPair.publicKey.classical.every(b => b === 0)).toBe(true);
      expect(keyPair.publicKey.pq.every(b => b === 0)).toBe(true);
    });
  });
});
