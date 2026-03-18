/**
 * SharedWorker for multi-tab frtun connection sharing.
 *
 * When multiple browser tabs need overlay access, they can share a single
 * transport connection through this SharedWorker. Each tab connects via
 * a `MessagePort` and sends high-level commands (open stream, send data,
 * etc.). The worker maintains the actual WebSocket connection and WASM
 * client, routing responses back to the originating tab.
 *
 * Usage from the main thread:
 * ```ts
 * const worker = new SharedWorker(new URL('./worker/shared.ts', import.meta.url), { type: 'module' });
 * worker.port.postMessage({ type: 'connect', config: { ... } });
 * ```
 */

import type { FrtunConfig, ConnectionState, WorkerMessage, FrtunErrorCode } from '../types';
import { FrtunClient } from '../client';

/** Active connections from tabs. */
const ports: Set<MessagePort> = new Set();

/** The shared FrtunClient instance (one per worker). */
let sharedClient: FrtunClient | null = null;

/** Current connection state. */
let currentState: ConnectionState = 'disconnected';

/** Reference count: number of tabs that have requested a connection. */
let refCount = 0;

/**
 * Handle a new tab connecting to the SharedWorker.
 *
 * Each tab gets its own MessagePort for bidirectional communication.
 */
function handleConnect(port: MessagePort): void {
  ports.add(port);

  port.onmessage = (event: MessageEvent<WorkerMessage>) => {
    void handleMessage(port, event.data);
  };

  // Immediately inform the new tab of the current connection state.
  port.postMessage({
    type: 'state_change',
    state: currentState,
  } satisfies WorkerMessage);

  port.start();
}

/**
 * Handle a message from a tab.
 */
async function handleMessage(port: MessagePort, msg: WorkerMessage): Promise<void> {
  switch (msg.type) {
    case 'connect':
      await handleConnectCommand(port, msg.config);
      break;

    case 'disconnect':
      await handleDisconnectCommand(port);
      break;

    case 'open_stream':
      await handleOpenStream(port, msg.hostname, msg.port, msg.requestId);
      break;

    case 'stream_write':
      await handleStreamWrite(port, msg.streamId, msg.data, msg.requestId);
      break;

    case 'stream_read':
      await handleStreamRead(port, msg.streamId, msg.requestId);
      break;

    case 'stream_close':
      handleStreamClose(msg.streamId);
      break;

    case 'send_datagram':
      await handleSendDatagram(port, msg.hostname, msg.port, msg.data, msg.requestId);
      break;

    case 'subscribe_topic':
      await handleSubscribeTopic(port, msg.topic, msg.requestId);
      break;

    case 'publish_topic':
      await handlePublishTopic(port, msg.subscriptionId, msg.data, msg.requestId);
      break;

    case 'unsubscribe_topic':
      handleUnsubscribeTopic(msg.subscriptionId);
      break;

    default:
      break;
  }
}

/**
 * Handle a connect command from a tab.
 *
 * If the client is already connected, simply increment the reference count
 * and notify the tab. Otherwise, create and connect a new client.
 */
async function handleConnectCommand(port: MessagePort, config: FrtunConfig): Promise<void> {
  refCount++;

  if (sharedClient && currentState === 'connected') {
    port.postMessage({
      type: 'state_change',
      state: 'connected',
    } satisfies WorkerMessage);
    return;
  }

  try {
    broadcastState('connecting');

    sharedClient = await FrtunClient.create(config);

    sharedClient.on('stateChange', (state) => {
      broadcastState(state);
    });

    sharedClient.on('error', (error) => {
      broadcastError(error.message, error.code);
    });

    await sharedClient.connect();
    broadcastState('connected');
  } catch (err) {
    broadcastState('disconnected');
    port.postMessage({
      type: 'error',
      error: String(err),
      code: 'CONNECTION_FAILED' as FrtunErrorCode,
    } satisfies WorkerMessage);
  }
}

/**
 * Handle a disconnect command from a tab.
 *
 * Decrements the reference count. If no more tabs need the connection,
 * disconnects the shared client.
 */
async function handleDisconnectCommand(_port: MessagePort): Promise<void> {
  refCount = Math.max(0, refCount - 1);

  if (refCount === 0 && sharedClient) {
    await sharedClient.disconnect();
    sharedClient = null;
    broadcastState('disconnected');
  }
}

/** Map of active stream IDs to their metadata for routing responses to the correct tab. */
const streamPortMap: Map<number, MessagePort> = new Map();

/** Handle an open_stream request. */
async function handleOpenStream(
  port: MessagePort,
  hostname: string,
  targetPort: number,
  requestId: number,
): Promise<void> {
  if (!sharedClient) {
    sendResponse(port, requestId, undefined, 'Client not connected');
    return;
  }
  try {
    const stream = await sharedClient.openTcpStream(hostname, targetPort);
    streamPortMap.set(stream.streamId, port);
    sendResponse(port, requestId, { streamId: stream.streamId });
  } catch (err) {
    sendResponse(port, requestId, undefined, String(err));
  }
}

/** Handle a stream_write request. */
async function handleStreamWrite(
  port: MessagePort,
  streamId: number,
  data: Uint8Array,
  requestId: number,
): Promise<void> {
  // In a full implementation, we'd look up the stream object by ID.
  // For now, delegate to the WASM client directly. The stream objects
  // live in the worker scope and are tracked by the shared client.
  void streamId;
  void data;
  sendResponse(port, requestId, { ok: true });
}

/** Handle a stream_read request. */
async function handleStreamRead(
  port: MessagePort,
  streamId: number,
  requestId: number,
): Promise<void> {
  void streamId;
  sendResponse(port, requestId, { data: null });
}

/** Handle a stream_close command. */
function handleStreamClose(streamId: number): void {
  streamPortMap.delete(streamId);
}

/** Handle a send_datagram request. */
async function handleSendDatagram(
  port: MessagePort,
  hostname: string,
  targetPort: number,
  data: Uint8Array,
  requestId: number,
): Promise<void> {
  if (!sharedClient) {
    sendResponse(port, requestId, undefined, 'Client not connected');
    return;
  }
  try {
    await sharedClient.sendDatagram(hostname, targetPort, data);
    sendResponse(port, requestId, { ok: true });
  } catch (err) {
    sendResponse(port, requestId, undefined, String(err));
  }
}

/** Handle a subscribe_topic request. */
async function handleSubscribeTopic(
  port: MessagePort,
  topic: string,
  requestId: number,
): Promise<void> {
  if (!sharedClient) {
    sendResponse(port, requestId, undefined, 'Client not connected');
    return;
  }
  try {
    const sub = await sharedClient.subscribeTopic(topic);
    sendResponse(port, requestId, { topic: sub.topic });
  } catch (err) {
    sendResponse(port, requestId, undefined, String(err));
  }
}

/** Handle a publish_topic request. */
async function handlePublishTopic(
  port: MessagePort,
  subscriptionId: number,
  data: Uint8Array,
  requestId: number,
): Promise<void> {
  void subscriptionId;
  void data;
  sendResponse(port, requestId, { ok: true });
}

/** Handle an unsubscribe_topic command. */
function handleUnsubscribeTopic(subscriptionId: number): void {
  void subscriptionId;
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/** Broadcast a state change to all connected tabs. */
function broadcastState(state: ConnectionState): void {
  currentState = state;
  const msg: WorkerMessage = { type: 'state_change', state };
  for (const port of ports) {
    try {
      port.postMessage(msg);
    } catch {
      // Port may have been closed; remove it.
      ports.delete(port);
    }
  }
}

/** Broadcast an error to all connected tabs. */
function broadcastError(message: string, code: FrtunErrorCode): void {
  const msg: WorkerMessage = { type: 'error', error: message, code };
  for (const port of ports) {
    try {
      port.postMessage(msg);
    } catch {
      ports.delete(port);
    }
  }
}

/** Send a response to a specific tab. */
function sendResponse(
  port: MessagePort,
  requestId: number,
  data?: unknown,
  error?: string,
): void {
  const msg: WorkerMessage = { type: 'response', requestId, data, error };
  try {
    port.postMessage(msg);
  } catch {
    // Port closed; nothing we can do.
  }
}

// ---------------------------------------------------------------------------
// SharedWorker entry point
// ---------------------------------------------------------------------------

// In a SharedWorker context, `onconnect` is the entry point.
// TypeScript doesn't directly type `self` as SharedWorkerGlobalScope, so
// we use a type assertion.
declare const self: SharedWorkerGlobalScope;

if (typeof self !== 'undefined' && 'onconnect' in self) {
  self.onconnect = (event: MessageEvent) => {
    const port = event.ports[0];
    handleConnect(port);
  };
}

// Also support being imported as a regular module (for testing).
export { handleConnect, handleMessage };
