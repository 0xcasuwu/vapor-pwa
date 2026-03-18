# Vapor PWA: Frtun UX Validation Plan

## Goal

Validate that the frtun integration provides a seamless user experience:
1. Users can connect via QR code exchange
2. Users can save contacts with frtun peer IDs
3. Users can see contact online/offline status (presence)
4. Users can reconnect to saved contacts without QR codes

## Current State

| Component | Code Status | Runtime Tested |
|-----------|-------------|----------------|
| frtun SDK + WASM | Integrated | NO |
| Relay connection (wss.subfrost.io) | Configured | NO |
| Gossipsub presence | Wired | NO |
| ReconnectFlow UI | Wired | NO |
| QR v4 with frtunPeerId | Implemented | NO |
| Contact storage with frtunPeerId | Implemented | NO |

## Validation Phases

### Phase 1: Local Build Verification

**Objective**: Confirm the app builds and runs without errors.

**Steps**:
1. Run `pnpm build` - verify no TypeScript or bundling errors
2. Run `pnpm preview` - verify production build serves correctly
3. Open in browser - verify app loads without console errors
4. Create identity - verify mnemonic generation works
5. Check browser DevTools Network tab - verify no failed requests

**Success Criteria**:
- Build completes without errors
- App loads and displays home screen
- Identity creation flow works
- No JavaScript errors in console

---

### Phase 2: Frtun Relay Connectivity

**Objective**: Verify the app can connect to Subfrost relay servers.

**Steps**:
1. Open browser DevTools → Network tab
2. Create or unlock identity
3. Watch for WebSocket connection to `wss.subfrost.io/ws`
4. Check console for `[frtun]` log messages
5. Verify connection state transitions:
   - `uninitialized` → `initializing` → `connecting` → `connected`

**Expected Console Output**:
```
[frtun] Initializing client...
[frtun] Connecting to wss.subfrost.io:443/ws
[frtun] Connected to relay
[presence] Started
```

**Failure Scenarios to Watch**:
- WebSocket connection refused (relay down)
- WASM loading failure
- CORS errors
- SSL certificate errors

**Success Criteria**:
- WebSocket connection established to relay
- frtun client reaches "connected" state
- Presence system starts without errors

---

### Phase 3: QR Code Exchange (Two Devices/Browsers)

**Objective**: Verify 1:1 chat establishment with frtunPeerId capture.

**Setup**:
- Device A: Chrome (or any browser)
- Device B: Different browser or incognito window

**Steps**:

1. **Device A - Generate QR**:
   - Create/unlock identity
   - Click "Generate QR"
   - Wait for QR code to appear
   - Check console: QR should include frtunPeerId in v4 format

2. **Device B - Scan & Respond**:
   - Create/unlock identity (different mnemonic)
   - Click "Scan QR"
   - Scan Device A's QR code
   - Device B shows "Offer QR" for Device A to scan

3. **Device A - Complete Handshake**:
   - Scan Device B's offer QR
   - Device A shows "Answer QR" for Device B

4. **Device B - Finalize**:
   - Scan Device A's answer QR
   - Both devices should transition to Chat screen

5. **Verify frtunPeerId Exchange**:
   - On Device A, check console for received payload
   - Verify `peerFrtunPeerId` is populated in sessionStore

**Success Criteria**:
- Chat established on both devices
- Messages send/receive encrypted
- peerFrtunPeerId captured during exchange

---

### Phase 4: Contact Saving with frtunPeerId

**Objective**: Verify contacts are saved with their frtun peer ID.

**Steps**:

1. While in active chat (from Phase 3):
   - Click "Save Contact" button
   - Enter nickname (e.g., "Device B")
   - Click Save

2. End the chat session

3. Go to Home screen, find contact in list

4. **Verify in IndexedDB**:
   - Open DevTools → Application → IndexedDB
   - Find `vapor-identity` database → `contacts` store
   - Check contact entry has `frtunPeerId` field populated

5. **Verify UI shows reconnect capability**:
   - Contact should show visual indicator (different from non-reconnectable contacts)

**Success Criteria**:
- Contact saved to IndexedDB
- `frtunPeerId` field present and populated
- Contact appears in Home screen list
- Contact is marked as "reconnectable"

---

### Phase 5: Presence System (Online/Offline Status)

**Objective**: Verify gossipsub presence updates contact status.

**Prerequisites**:
- Both devices have saved each other as contacts
- Both devices connected to frtun relay

**Steps**:

1. **Both Online**:
   - Open app on Device A
   - Open app on Device B
   - Wait 30-60 seconds for heartbeats
   - Check Device A's contact list - Device B should show "online" indicator

2. **One Goes Offline**:
   - Close Device B completely
   - Wait 90+ seconds (presence timeout)
   - Check Device A's contact list - Device B should show "offline"

3. **Comes Back Online**:
   - Reopen Device B
   - Wait 30 seconds
   - Check Device A - Device B should show "online" again

**Console Verification**:
```
[presence] Received: { type: 'online', peerId: 'frtun1...', timestamp: ... }
```

**Success Criteria**:
- Online contacts show green/online indicator
- Offline contacts show gray/offline after timeout
- Status updates within expected timeframes

---

### Phase 6: Zero-Code Reconnection

**Objective**: Verify ReconnectFlow establishes connection without QR exchange.

**Prerequisites**:
- Contact saved with frtunPeerId (from Phase 4)
- Both devices online and connected to relay

**Steps**:

1. **Device A - Initiate Reconnection**:
   - Go to Home screen
   - Click on saved contact (Device B)
   - ReconnectFlow should appear with 4-step progress

2. **Watch Progress**:
   - Step 1: "Overlay Network" - connecting to relay
   - Step 2: "Open Stream" - opening stream to peer
   - Step 3: "Handshake" - exchanging session keys
   - Step 4: "Secure Channel" - establishing WebRTC

3. **Device B - Handle Incoming**:
   - Device B should receive incoming connection request
   - (This may require Device B to be listening - verify)

4. **Chat Established**:
   - Both devices transition to Chat screen
   - Send test messages to verify encryption works

**Failure Points to Watch**:
- "Failed to connect to relay" - relay connectivity issue
- "Failed to open stream" - peer not online or not listening
- "Handshake failed" - protocol mismatch
- "WebRTC failed" - network/firewall issues

**Success Criteria**:
- ReconnectFlow completes all 4 steps
- Chat opens without QR code exchange
- Messages work bidirectionally

---

### Phase 7: Edge Case Testing

**Objective**: Verify graceful handling of failure scenarios.

**Test Cases**:

1. **Reconnect to Offline Peer**:
   - Try reconnecting when Device B is closed
   - Should show error after timeout
   - Should allow retry or cancel

2. **Network Interruption**:
   - Disable network during reconnection
   - Should show appropriate error
   - Should recover when network returns

3. **Relay Failover**:
   - (If possible) simulate primary relay down
   - Should try fallback relays (wss-1, wss-2)

4. **App Backgrounding**:
   - Put app in background during active chat
   - Return to app - verify connection state

5. **Multiple Contacts**:
   - Save 3+ contacts
   - Verify each can be reconnected independently

**Success Criteria**:
- Errors are user-friendly (not technical)
- Retry mechanism works
- App doesn't crash on failures

---

## Implementation Requirements

### Before Testing

1. **Verify Relay Availability**:
   ```bash
   # Check if relays are reachable
   curl -I https://wss.subfrost.io/ws
   ```

2. **Build Production Bundle**:
   ```bash
   pnpm build
   pnpm preview
   ```

3. **Prepare Test Devices**:
   - Two separate browser windows/devices
   - Different identities (mnemonics)

### During Testing

1. **Keep DevTools Open**:
   - Console tab for logs
   - Network tab for WebSocket
   - Application tab for IndexedDB

2. **Document Issues**:
   - Screenshot error states
   - Copy console logs
   - Note exact reproduction steps

### After Testing

1. **Compile Results**:
   - Which phases passed/failed
   - Specific error messages
   - Performance observations

2. **Prioritize Fixes**:
   - Critical: App doesn't load, crashes
   - High: Core feature broken (QR, chat, reconnect)
   - Medium: Presence not working
   - Low: Edge case failures

---

## Timeline Estimate

| Phase | Tasks | Complexity |
|-------|-------|------------|
| Phase 1 | Build verification | Simple |
| Phase 2 | Relay connectivity | Simple |
| Phase 3 | QR exchange | Medium |
| Phase 4 | Contact saving | Simple |
| Phase 5 | Presence | Medium |
| Phase 6 | Zero-code reconnect | Complex |
| Phase 7 | Edge cases | Medium |

---

## Potential Issues & Mitigations

### Issue: Relay servers not running
**Mitigation**: Check with Subfrost team; implement mock mode for testing

### Issue: WASM fails to load
**Mitigation**: Check browser compatibility; verify WASM files in build

### Issue: Peer not listening for reconnection
**Mitigation**: May need to implement incoming stream handler in app

### Issue: Presence not propagating
**Mitigation**: Verify gossipsub topic subscription; check relay pubsub support

---

## Decision Points

1. **If relays are down**: Implement mock frtun client for local testing?
2. **If reconnection flow broken**: Debug stream/handshake protocol or defer feature?
3. **If presence not working**: Accept as limitation or investigate gossipsub?

---

## Next Steps After Validation

1. Document any bugs found
2. Create GitHub issues for fixes
3. Implement fixes in priority order
4. Re-run validation phases
5. Consider adding E2E tests (Playwright) for regression
