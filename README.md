# Vapor PWA

**Post-Quantum Secure Ephemeral Messaging**

A Progressive Web App for ephemeral encrypted messaging using hybrid post-quantum cryptography. Protocol-compatible with [Vapor iOS](https://github.com/0xcasuwu/vapor).

## Features

- **Post-Quantum Security**: X25519 + ML-KEM-768 hybrid key exchange
- **End-to-End Encryption**: XChaCha20-Poly1305 authenticated encryption
- **True P2P**: WebRTC DataChannel - no relay servers
- **Ephemeral**: Messages exist only in memory, no persistence
- **Zero Metadata**: No accounts, no phone numbers, no history
- **Offline-Capable**: PWA with full offline support

## Cryptography

| Component | Algorithm | Security Level |
|-----------|-----------|----------------|
| Key Exchange (Classical) | X25519 (Curve25519) | 128-bit |
| Key Exchange (Post-Quantum) | ML-KEM-768 (FIPS 203) | 128-bit PQ |
| Encryption | XChaCha20-Poly1305 | 256-bit / 128-bit PQ |
| Key Derivation | HKDF-SHA256 | 256-bit / 128-bit PQ |

## Protocol Compatibility

This PWA implements the **Vapor v2 Protocol** and is cross-compatible with:
- Vapor iOS (native app)
- Other Vapor PWA instances

QR payload format (1,257 bytes):
```
[version: 1 byte] [classical_pk: 32 bytes] [pq_pk: 1184 bytes] [nonce: 32 bytes] [timestamp: 8 bytes]
```

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### PWA Installation

1. Visit the hosted PWA URL in Chrome/Safari/Firefox
2. Click "Install" when prompted, or use browser menu "Add to Home Screen"
3. Open Vapor from your home screen for full-screen experience

## Architecture

```
src/
├── crypto/
│   ├── HybridKeyPair.ts      # X25519 + ML-KEM-768 key generation
│   ├── HybridQRPayload.ts    # QR payload encoding/decoding
│   ├── Encryption.ts          # XChaCha20-Poly1305 AEAD
│   └── WebRTCChannel.ts       # P2P DataChannel
├── components/
│   ├── Home.tsx               # Landing page
│   ├── QRGenerator.tsx        # QR code display
│   ├── QRScanner.tsx          # Camera QR scanning
│   └── Chat.tsx               # Encrypted chat interface
├── store/
│   └── sessionStore.ts        # Zustand state management
└── App.tsx                    # Main application
```

## Dependencies

- **libsodium-wrappers**: X25519, XChaCha20-Poly1305
- **mlkem**: ML-KEM-768 (NIST FIPS 203)
- **qrcode**: QR generation
- **@yudiel/react-qr-scanner**: QR scanning
- **zustand**: State management
- **vite-plugin-pwa**: PWA configuration

## Security Considerations

### What Vapor Protects Against
- Mass surveillance (no central data store)
- Metadata analysis (no server sees connections)
- Message interception (ChaCha20-Poly1305)
- Quantum computers (ML-KEM-768)
- Key compromise (ephemeral keys)

### What Vapor Does NOT Protect Against
- Device compromise (malware on your device)
- Screen capture (OS-level access)
- Physical coercion ("rubber hose cryptanalysis")

### Trust Assumptions
- Browser's Web Crypto API is implemented correctly
- libsodium.js and mlkem are correct
- WebRTC DTLS is secure
- QR exchange is authenticated (users verify codes)

## Session Flow

```
Alice (Initiator)                    Bob (Responder)
─────────────────                    ───────────────
1. Generate hybrid key pair
2. Create QR payload
3. Display QR code
                    ──── QR scan ────►
                                     4. Parse QR payload
                                     5. Generate own key pair
                                     6. Derive session key
                                     7. Create WebRTC offer
                    ◄─── signaling ───
8. Complete WebRTC handshake
9. Session established              9. Session established
   │                                   │
   └──────── Encrypted P2P Chat ───────┘
```

## License

MIT

## Related Projects

- [Vapor iOS](https://github.com/0xcasuwu/vapor) - Native iOS app
- [libsodium.js](https://github.com/nickelrm/libsodium.js) - Cryptographic library
- [mlkem](https://github.com/dajiaji/crystals-kyber-js) - ML-KEM implementation
