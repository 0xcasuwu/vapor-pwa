# Vapor PWA - Project Context

## Mission

Vapor exists to guarantee the 4th Amendment right to privacy for all citizens of the world within the digital realm of communication. In an era of mass surveillance, metadata collection, and centralized communication infrastructure, Vapor provides a technical implementation of what should be a fundamental human right: private conversation.

The 4th Amendment states: "The right of the people to be secure in their persons, houses, papers, and effects, against unreasonable searches and seizures, shall not be violated."

Vapor extends this protection to digital communication by ensuring:
- **No central authority** can read, store, or be compelled to hand over messages
- **No metadata** is collected that reveals who talks to whom
- **No persistence** means messages cannot be retrieved after the fact
- **No accounts** means no identity registration with any third party

## Architecture Overview

### Zero Infrastructure Design

Vapor requires no servers to function. Communication occurs directly peer-to-peer via WebRTC DataChannels. The only external services used are:
- **STUN servers** (Google): Public IP discovery for NAT traversal
- **TURN servers** (Metered.ca): Relay fallback when direct P2P impossible

Neither service can read message content or even know that Vapor is being used.

### Cryptographic Foundation

**Hybrid Post-Quantum Key Exchange**: X25519 + ML-KEM-768
- Classical security: X25519 provides ~128-bit security against current computers
- Quantum security: ML-KEM-768 (FIPS 203) provides ~128-bit security against quantum computers
- Defense in depth: Both must be broken to compromise session keys
- Combined via HKDF-SHA256 with domain separation

**Message Encryption**: XChaCha20-Poly1305 (AEAD)
- 256-bit key from hybrid key exchange
- 24-byte random nonce per message
- Authenticated encryption prevents tampering

**Identity Derivation**: BIP-39 Mnemonic Seeds
- 12-word mnemonic generates deterministic identity
- Same mnemonic = same identity on any device
- No registration, no accounts, no identity providers

### Connection Topology

**1:1 Direct Chat**
```
Alice ←──── WebRTC DataChannel ────→ Bob
        (encrypted with shared session key)
```

**Group Chat: Star Topology**
```
              ┌─── Member 1
              │
   Host ──────┼─── Member 2
              │
              └─── Member 3
```
- Host maintains separate encrypted WebRTC channels to each member
- All messages flow through host for relay
- Each peer connection uses independent hybrid key exchange
- Host must remain online for group to function
- No direct member-to-member connections (simplifies key management)

### QR Code Signaling (Air-Gap Compatible)

The connection flow uses QR codes for signaling, enabling connections without any network infrastructure:

1. **Alice** generates initial QR: public keys + nonce + timestamp
2. **Bob** scans, generates WebRTC offer QR: SDP + ML-KEM ciphertext
3. **Alice** scans, generates WebRTC answer QR: SDP answer
4. **Bob** scans answer, connection established

This three-QR flow enables completely air-gapped key exchange - the devices need only cameras, not network connectivity, to establish the session.

## Key Files

| File | Purpose |
|------|---------|
| `src/crypto/HybridKeyPair.ts` | X25519 + ML-KEM-768 hybrid key exchange |
| `src/crypto/HybridQRPayload.ts` | Initial key exchange QR encoding |
| `src/crypto/SignalingPayload.ts` | WebRTC offer/answer QR encoding |
| `src/crypto/Encryption.ts` | XChaCha20-Poly1305 message encryption |
| `src/crypto/WebRTCChannel.ts` | ICE gathering, DataChannel management |
| `src/crypto/SafetyNumber.ts` | MITM detection fingerprints |
| `src/crypto/SeedIdentity.ts` | BIP-39 identity derivation |
| `src/store/sessionStore.ts` | Session state machine, message flow |
| `src/store/identityStore.ts` | IndexedDB identity/contact persistence |
| `src/store/groupStore.ts` | Star topology group management |
| `src/crypto/GroupQRPayload.ts` | Group invite QR format |

## Security Model

### What Vapor Protects Against
- Mass surveillance (no central data store to subpoena)
- Metadata analysis (no server logs of who talks to whom)
- Message interception (end-to-end encryption)
- Future quantum computers (ML-KEM-768)
- Key compromise over time (ephemeral sessions, forward secrecy)
- Replay attacks (per-message nonces, QR timestamp validation)

### What Vapor Does NOT Protect Against
- Device compromise (malware with screen/keyboard access)
- Physical coercion (you can be forced to unlock your phone)
- False identities (you must verify the person out-of-band)
- Screenshots (the other party can always capture the screen)

### Trust Assumption
The security model assumes QR code exchange is authenticated - that when you scan someone's QR code, you've verified it came from them. Safety numbers provide additional verification after connection establishment.

## Tech Stack

- **React 19** + **Zustand** for UI and state
- **libsodium-wrappers** for classical crypto (X25519, XChaCha20-Poly1305)
- **mlkem** for post-quantum crypto (ML-KEM-768)
- **WebRTC DataChannels** for P2P transport
- **IndexedDB** for local persistence (identity, contacts only - never messages)
- **Vite** + **PWA plugin** for offline-capable Progressive Web App
- **Web Push API** for presence notifications

## Current Focus

Testing and validating the star topology group WebRTC connections for multi-peer scenarios. The goal is ensuring reliable P2P connections between the host and all members, with proper message relay and encryption isolation per channel.

## Deployment

- **Live URL**: https://0xcasuwu.github.io/vapor-pwa/
- **GitHub Pages** via workflow on push to main
- Full PWA with offline support

## Protocol Compatibility

Vapor v2 Protocol is cross-compatible with Vapor iOS. Both platforms:
- Generate identical QR payload formats
- Use same hybrid key exchange mathematics
- Use same XChaCha20-Poly1305 encryption
- Can establish sessions with each other
