/**
 * handshake.integration.test.ts
 * Integration tests for the complete key exchange handshake
 *
 * This simulates the full flow:
 * 1. Alice generates QR (public keys)
 * 2. Bob scans, derives shared secret, creates signaling offer
 * 3. Alice scans offer, derives shared secret, creates signaling answer
 * 4. Both parties should have identical session keys
 * 5. Messages encrypted by one can be decrypted by the other
 */

import { describe, it, expect } from 'vitest';
import {
  generateHybridKeyPair,
  deriveSharedSecretAsInitiator,
  deriveSharedSecretAsResponder,
} from './HybridKeyPair';
import {
  generateQRPayload,
  encodeToCompressedBase64,
  decodeFromCompressedBase64,
  isValid,
  isExpired,
} from './HybridQRPayload';
import {
  createSignalingOffer,
  createSignalingAnswer,
  encodeSignalingPayload,
  decodeSignalingPayload,
  isValidSignalingPayload,
  SIGNALING_TYPE,
} from './SignalingPayload';
import type { SignalingOffer, SignalingAnswer } from './SignalingPayload';
import { encrypt, decrypt } from './Encryption';

describe('Full Handshake Integration', () => {
  it('Alice and Bob derive identical session keys via QR exchange', async () => {
    // === STEP 1: Alice generates initial QR ===
    const aliceKeyPair = await generateHybridKeyPair();
    const aliceQRPayload = generateQRPayload(aliceKeyPair.publicKey);
    const aliceQRString = encodeToCompressedBase64(aliceQRPayload);

    // Verify QR is valid
    expect(aliceQRString.length).toBeGreaterThan(0);

    // === STEP 2: Bob scans Alice's QR ===
    const decodedAliceQR = decodeFromCompressedBase64(aliceQRString);
    expect(decodedAliceQR).not.toBeNull();
    expect(isValid(decodedAliceQR!)).toBe(true);
    expect(isExpired(decodedAliceQR!)).toBe(false);

    // Bob generates his own key pair
    const bobKeyPair = await generateHybridKeyPair();

    // Bob derives shared secret (encapsulates)
    const bobResult = await deriveSharedSecretAsInitiator(
      bobKeyPair.privateKey,
      {
        classical: decodedAliceQR!.classicalPublicKey,
        pq: decodedAliceQR!.pqPublicKey,
      }
    );

    expect(bobResult.sharedSecret.length).toBe(32);
    expect(bobResult.ciphertext.length).toBe(1088);

    // Bob creates signaling offer (would include WebRTC SDP in real flow)
    const mockSDP = 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\n...';
    const signalingOffer = createSignalingOffer(
      mockSDP,
      bobResult.ciphertext,
      bobKeyPair.publicKey.classical
    );

    expect(signalingOffer.type).toBe(SIGNALING_TYPE.OFFER);
    expect(isValidSignalingPayload(signalingOffer)).toBe(true);

    const offerQRString = encodeSignalingPayload(signalingOffer);

    // === STEP 3: Alice scans Bob's offer QR ===
    const decodedOffer = decodeSignalingPayload(offerQRString) as SignalingOffer;
    expect(decodedOffer).not.toBeNull();
    expect(decodedOffer.type).toBe(SIGNALING_TYPE.OFFER);
    expect(decodedOffer.sdp).toBe(mockSDP);

    // Alice derives shared secret (decapsulates)
    const aliceSessionKey = await deriveSharedSecretAsResponder(
      aliceKeyPair,
      decodedOffer.classicalPublicKey,
      decodedOffer.kemCiphertext
    );

    // === VERIFY: Both have identical session keys ===
    expect(aliceSessionKey).toEqual(bobResult.sharedSecret);

    // Alice creates signaling answer
    const mockAnswerSDP = 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\n...answer';
    const signalingAnswer = createSignalingAnswer(mockAnswerSDP);
    const answerQRString = encodeSignalingPayload(signalingAnswer);

    // === STEP 4: Bob scans Alice's answer QR ===
    const decodedAnswer = decodeSignalingPayload(answerQRString) as SignalingAnswer;
    expect(decodedAnswer).not.toBeNull();
    expect(decodedAnswer.type).toBe(SIGNALING_TYPE.ANSWER);
    expect(decodedAnswer.sdp).toBe(mockAnswerSDP);

    // At this point, both would complete WebRTC connection with the SDPs
    // For this test, we just verify the session keys match
  });

  it('encrypted messages can be exchanged after handshake', async () => {
    // Quick handshake setup
    const aliceKeyPair = await generateHybridKeyPair();
    const bobKeyPair = await generateHybridKeyPair();

    // Bob encapsulates to Alice
    const bobResult = await deriveSharedSecretAsInitiator(
      bobKeyPair.privateKey,
      aliceKeyPair.publicKey
    );

    // Alice decapsulates
    const aliceSessionKey = await deriveSharedSecretAsResponder(
      aliceKeyPair,
      bobKeyPair.publicKey.classical,
      bobResult.ciphertext
    );

    const bobSessionKey = bobResult.sharedSecret;

    // Verify keys match
    expect(aliceSessionKey).toEqual(bobSessionKey);

    // === Test message exchange ===

    // Alice sends to Bob
    const aliceMessage = 'Hello Bob, this is a secret message!';
    const encryptedByAlice = await encrypt(aliceMessage, aliceSessionKey);
    const decryptedByBob = await decrypt(encryptedByAlice, bobSessionKey);
    expect(decryptedByBob).toBe(aliceMessage);

    // Bob sends to Alice
    const bobMessage = 'Hi Alice, I got your message!';
    const encryptedByBob = await encrypt(bobMessage, bobSessionKey);
    const decryptedByAlice = await decrypt(encryptedByBob, aliceSessionKey);
    expect(decryptedByAlice).toBe(bobMessage);
  });

  it('messages cannot be decrypted with wrong key', async () => {
    // Alice and Bob handshake
    const aliceKeyPair = await generateHybridKeyPair();
    const bobKeyPair = await generateHybridKeyPair();

    const bobResult = await deriveSharedSecretAsInitiator(
      bobKeyPair.privateKey,
      aliceKeyPair.publicKey
    );

    // Eve generates her own key (attacker)
    const eveKeyPair = await generateHybridKeyPair();
    const eveResult = await deriveSharedSecretAsInitiator(
      eveKeyPair.privateKey,
      aliceKeyPair.publicKey
    );

    // Bob encrypts a message
    const secretMessage = 'This is top secret!';
    const encrypted = await encrypt(secretMessage, bobResult.sharedSecret);

    // Eve cannot decrypt with her key
    await expect(decrypt(encrypted, eveResult.sharedSecret)).rejects.toThrow(
      'Decryption failed'
    );
  });

  it('complete QR code size is reasonable for display', async () => {
    const keyPair = await generateHybridKeyPair();
    const payload = generateQRPayload(keyPair.publicKey);

    // Initial QR (compressed)
    const initialQR = encodeToCompressedBase64(payload);

    // Signaling offer QR (with mock SDP - real SDP would be larger)
    const mockSDP = `v=0
o=- 12345 2 IN IP4 127.0.0.1
s=-
t=0 0
a=ice-ufrag:abcd
a=ice-pwd:efghijklmnopqrstuvwx
a=candidate:1234 1 UDP 2130706431 192.168.1.100 54321 typ host
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=setup:actpass
a=mid:0
a=sctp-port:5000`;

    const bobKeyPair = await generateHybridKeyPair();
    const bobResult = await deriveSharedSecretAsInitiator(
      bobKeyPair.privateKey,
      keyPair.publicKey
    );

    const offer = createSignalingOffer(
      mockSDP,
      bobResult.ciphertext,
      bobKeyPair.publicKey.classical
    );
    const offerQR = encodeSignalingPayload(offer);

    const answer = createSignalingAnswer(mockSDP);
    const answerQR = encodeSignalingPayload(answer);

    // Log sizes for visibility
    console.log('QR Code sizes:');
    console.log(`  Initial QR: ${initialQR.length} chars`);
    console.log(`  Offer QR: ${offerQR.length} chars`);
    console.log(`  Answer QR: ${answerQR.length} chars`);

    // QR codes can typically handle up to ~4000 alphanumeric chars
    // For good scanning reliability, should be under ~2000
    expect(initialQR.length).toBeLessThan(2000);
    expect(offerQR.length).toBeLessThan(3000); // Offer is larger due to KEM ciphertext
    expect(answerQR.length).toBeLessThan(1500); // Answer is just SDP
  });
});
