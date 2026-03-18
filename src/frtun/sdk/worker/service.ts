/**
 * Service Worker for intercepting `*.peer` fetch events.
 *
 * This is an alternative to the `installFetchPolyfill()` approach. When
 * registered as a Service Worker, it intercepts all fetch requests at the
 * SW level -- including navigation requests, image loads, and script imports
 * -- and routes `*.peer` hostnames through the overlay network.
 *
 * Communication with the overlay client happens via a MessageChannel to
 * the SharedWorker (or directly to the main page if SharedWorker is not
 * available).
 *
 * Registration from the main thread:
 * ```ts
 * if ('serviceWorker' in navigator) {
 *   await navigator.serviceWorker.register(
 *     new URL('./worker/service.ts', import.meta.url),
 *     { type: 'module' }
 *   );
 * }
 * ```
 */

/** Typed reference to the Service Worker global scope. */
declare const self: ServiceWorkerGlobalScope;

/** Map of pending fetch requests awaiting a response from the overlay client. */
const pendingRequests: Map<number, {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}> = new Map();

/** Monotonically increasing request ID counter. */
let nextRequestId = 1;

/** MessagePort connected to the overlay client (set during activation). */
let overlayPort: MessagePort | null = null;

// ---------------------------------------------------------------------------
// Service Worker lifecycle events
// ---------------------------------------------------------------------------

self.addEventListener('install', (event: ExtendableEvent) => {
  // Skip waiting to activate immediately.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  // Claim all open clients so the SW starts intercepting immediately.
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Message handler for establishing the overlay port
// ---------------------------------------------------------------------------

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string; requestId?: number; [key: string]: unknown };

  if (data?.type === 'set_overlay_port' && event.ports[0]) {
    // The main page (or SharedWorker) sends a MessagePort for overlay communication.
    overlayPort = event.ports[0];
    overlayPort!.onmessage = handleOverlayMessage;
    overlayPort!.start();
    return;
  }

  if (data?.type === 'overlay_response') {
    // Response from the overlay client for a pending request.
    handleOverlayResponse(data as OverlayResponse);
  }
});

/** Overlay response message structure */
interface OverlayResponse {
  requestId: number;
  status?: number;
  statusText?: string;
  headers?: [string, string][];
  body?: Uint8Array | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Fetch interception
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Only intercept *.peer hostnames.
  if (!url.hostname.endsWith('.peer')) {
    return; // Let the browser handle non-.peer requests normally.
  }

  event.respondWith(handlePeerFetch(event.request, url));
});

/**
 * Handle a fetch request to a `*.peer` domain.
 *
 * Sends the request details to the overlay client via the message port
 * and waits for the response.
 */
async function handlePeerFetch(request: Request, url: URL): Promise<Response> {
  if (!overlayPort) {
    return new Response('Overlay connection not established', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const requestId = nextRequestId++;

  // Serialize the request for transmission over the message port.
  let bodyBytes: Uint8Array | null = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      const buf = await request.arrayBuffer();
      bodyBytes = new Uint8Array(buf);
    } catch {
      bodyBytes = null;
    }
  }

  const serializedHeaders: Array<[string, string]> = [];
  request.headers.forEach((value, key) => {
    serializedHeaders.push([key, value]);
  });

  return new Promise<Response>((resolve, reject) => {
    // Register the pending request.
    pendingRequests.set(requestId, { resolve, reject });

    // Set a timeout to avoid hanging forever.
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(new Response('Request timed out', {
        status: 504,
        statusText: 'Gateway Timeout',
        headers: { 'Content-Type': 'text/plain' },
      }));
    }, 30_000);

    // Replace the default reject/resolve to also clear the timeout.
    const originalResolve = resolve;
    const originalReject = reject;
    pendingRequests.set(requestId, {
      resolve: (response) => {
        clearTimeout(timeout);
        originalResolve(response);
      },
      reject: (error) => {
        clearTimeout(timeout);
        originalReject(error);
      },
    });

    // Send the request to the overlay client.
    overlayPort!.postMessage({
      type: 'fetch_request',
      requestId,
      url: url.href,
      method: request.method,
      headers: serializedHeaders,
      body: bodyBytes,
    });
  });
}

/**
 * Handle a response from the overlay client.
 */
function handleOverlayMessage(event: MessageEvent): void {
  const data = event.data;
  if (data?.type === 'overlay_response') {
    handleOverlayResponse(data);
  }
}

/**
 * Process an overlay response and resolve the pending fetch promise.
 */
function handleOverlayResponse(data: {
  requestId: number;
  status?: number;
  statusText?: string;
  headers?: Array<[string, string]>;
  body?: Uint8Array | null;
  error?: string;
}): void {
  const pending = pendingRequests.get(data.requestId);
  if (!pending) {
    return; // Already timed out or cancelled.
  }
  pendingRequests.delete(data.requestId);

  if (data.error) {
    pending.resolve(new Response(data.error, {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/plain' },
    }));
    return;
  }

  const responseHeaders = new Headers();
  if (data.headers) {
    for (const [key, value] of data.headers) {
      responseHeaders.append(key, value);
    }
  }

  pending.resolve(new Response(data.body as BodyInit | null ?? null, {
    status: data.status ?? 200,
    statusText: data.statusText ?? 'OK',
    headers: responseHeaders,
  }));
}

// ---------------------------------------------------------------------------
// Export for testing (this module is primarily consumed as a Service Worker)
// ---------------------------------------------------------------------------

export { handlePeerFetch, handleOverlayResponse };
