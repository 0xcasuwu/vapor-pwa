/**
 * fetch() polyfill for `*.peer` domains.
 *
 * When installed, this module monkey-patches `globalThis.fetch` to intercept
 * requests whose hostname ends with `.peer`. Such requests are routed through
 * the frtun overlay's virtual TCP stack rather than the browser's native
 * networking. Non-`.peer` requests pass through to the original `fetch`.
 *
 * @example
 * ```ts
 * import { FrtunClient, installFetchPolyfill } from '@frtun/sdk';
 *
 * const client = await FrtunClient.create({ ... });
 * await client.connect();
 * installFetchPolyfill(client);
 *
 * // This goes through the overlay!
 * const res = await fetch('https://my-service.peer/api/data');
 * const data = await res.json();
 *
 * uninstallFetchPolyfill(); // restore original fetch
 * ```
 */

import type { FrtunClient } from './client';
import type { FrtunStream } from './stream';
import { FrtunError, FrtunErrorCode } from './types';

/** Preserved reference to the browser's original fetch implementation. */
const originalFetch: typeof globalThis.fetch = globalThis.fetch;

/** Whether the polyfill is currently installed. */
let installed = false;

/** Reference to the client used by the polyfill. */
let activeClient: FrtunClient | null = null;

/**
 * Install the fetch polyfill, routing `*.peer` requests through the overlay.
 *
 * Only one client can be active at a time. Calling this again with a
 * different client replaces the previous binding.
 *
 * @param client - A connected `FrtunClient` instance.
 */
export function installFetchPolyfill(client: FrtunClient): void {
  activeClient = client;

  if (installed) {
    return;
  }
  installed = true;

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = extractUrl(input);

    if (!url.hostname.endsWith('.peer')) {
      return originalFetch(input, init);
    }

    if (!activeClient) {
      throw new FrtunError(
        FrtunErrorCode.InvalidState,
        'Fetch polyfill has no active FrtunClient',
      );
    }

    const port = url.port
      ? parseInt(url.port, 10)
      : url.protocol === 'https:' ? 443 : 80;

    // Open a TCP stream through the overlay.
    const stream = await activeClient.openTcpStream(url.hostname, port);

    try {
      // Upgrade to TLS if the request uses HTTPS.
      if (url.protocol === 'https:') {
        await stream.upgradeTls(url.hostname);
      }

      // Build and send the HTTP/1.1 request.
      const httpRequest = buildHttpRequest(url, init);
      await stream.write(httpRequest);

      // Read and parse the HTTP response.
      const responseData = await readHttpResponse(stream);

      return new Response(responseData.body as BodyInit | null, {
        status: responseData.status,
        statusText: responseData.statusText,
        headers: new Headers(responseData.headers),
      });
    } catch (err) {
      stream.close();
      if (err instanceof FrtunError) {
        throw err;
      }
      throw new FrtunError(
        FrtunErrorCode.HttpError,
        `Fetch to ${url.href} failed: ${String(err)}`,
      );
    }
  };
}

/**
 * Uninstall the fetch polyfill and restore the browser's original `fetch`.
 */
export function uninstallFetchPolyfill(): void {
  if (!installed) {
    return;
  }
  installed = false;
  activeClient = null;
  globalThis.fetch = originalFetch;
}

// ---------------------------------------------------------------------------
// HTTP/1.1 helpers
// ---------------------------------------------------------------------------

/**
 * Extract a `URL` from the various input types accepted by `fetch()`.
 */
function extractUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) {
    return input;
  }
  if (typeof input === 'string') {
    return new URL(input);
  }
  // Request object
  return new URL(input.url);
}

/**
 * Build a raw HTTP/1.1 request from a URL and `RequestInit`.
 *
 * Returns the request as encoded UTF-8 bytes suitable for writing to a
 * TCP stream.
 */
function buildHttpRequest(url: URL, init?: RequestInit): Uint8Array {
  const method = init?.method?.toUpperCase() ?? 'GET';
  const path = url.pathname + url.search;
  const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;

  const headers = new Map<string, string>();
  headers.set('Host', host);
  headers.set('Connection', 'close');
  headers.set('User-Agent', 'frtun-sdk/0.1');

  // Merge caller-provided headers.
  if (init?.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  // Body handling.
  let bodyBytes: Uint8Array | null = null;
  if (init?.body !== undefined && init?.body !== null) {
    if (init.body instanceof ArrayBuffer) {
      bodyBytes = new Uint8Array(init.body);
    } else if (init.body instanceof Uint8Array) {
      bodyBytes = init.body;
    } else if (typeof init.body === 'string') {
      bodyBytes = new TextEncoder().encode(init.body);
    } else if (init.body instanceof Blob) {
      // Blob must be resolved synchronously here; in practice callers
      // should convert to ArrayBuffer before passing to fetch().
      // Fall back to empty body for now.
      bodyBytes = null;
    }
    // Other ReadableStream / FormData bodies would need async handling.
  }

  if (bodyBytes !== null) {
    headers.set('Content-Length', String(bodyBytes.byteLength));
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/octet-stream');
    }
  }

  // Assemble the request line and headers.
  let requestText = `${method} ${path} HTTP/1.1\r\n`;
  for (const [key, value] of headers) {
    requestText += `${key}: ${value}\r\n`;
  }
  requestText += '\r\n';

  const headerBytes = new TextEncoder().encode(requestText);

  if (bodyBytes === null || bodyBytes.byteLength === 0) {
    return headerBytes;
  }

  // Concatenate headers + body.
  const result = new Uint8Array(headerBytes.byteLength + bodyBytes.byteLength);
  result.set(headerBytes, 0);
  result.set(bodyBytes, headerBytes.byteLength);
  return result;
}

/** Parsed HTTP response. */
interface ParsedHttpResponse {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: Uint8Array | null;
}

/**
 * Read and parse an HTTP/1.1 response from a stream.
 *
 * Reads data until the response headers are complete (double CRLF), parses
 * the status line and headers, then reads the body according to
 * `Content-Length` or until EOF.
 */
async function readHttpResponse(stream: FrtunStream): Promise<ParsedHttpResponse> {
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let headerEnd = -1;
  let totalRead = 0;

  // Read until we find the end of headers (\r\n\r\n).
  while (headerEnd === -1) {
    const chunk = await stream.read();
    if (chunk === null) {
      break;
    }
    chunks.push(chunk);
    totalRead += chunk.byteLength;

    // Assemble what we have so far and check for header termination.
    const assembled = concatUint8Arrays(chunks);
    const text = decoder.decode(assembled, { stream: true });
    const idx = text.indexOf('\r\n\r\n');
    if (idx !== -1) {
      headerEnd = idx;
      break;
    }

    // Guard against absurdly large headers.
    if (totalRead > 64 * 1024) {
      throw new FrtunError(
        FrtunErrorCode.HttpError,
        'HTTP response headers exceeded 64 KB',
      );
    }
  }

  if (chunks.length === 0) {
    throw new FrtunError(
      FrtunErrorCode.HttpError,
      'No data received from stream',
    );
  }

  const raw = concatUint8Arrays(chunks);
  const headerText = decoder.decode(raw.slice(0, headerEnd !== -1 ? headerEnd : raw.byteLength));
  const lines = headerText.split('\r\n');

  // Parse status line.
  const statusLine = lines[0];
  const statusMatch = statusLine.match(/^HTTP\/\d\.\d\s+(\d+)\s*(.*)/);
  if (!statusMatch) {
    throw new FrtunError(
      FrtunErrorCode.HttpError,
      `Invalid HTTP status line: "${statusLine}"`,
    );
  }

  const status = parseInt(statusMatch[1], 10);
  const statusText = statusMatch[2] ?? '';

  // Parse headers.
  const headers: Array<[string, string]> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) {
      break;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }
    headers.push([
      line.slice(0, colonIdx).trim(),
      line.slice(colonIdx + 1).trim(),
    ]);
  }

  // Determine body length.
  const contentLengthHeader = headers.find(
    ([k]) => k.toLowerCase() === 'content-length',
  );
  const bodyStartOffset = headerEnd !== -1 ? headerEnd + 4 : raw.byteLength;
  let bodyData = raw.slice(bodyStartOffset);

  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader[1], 10);
    if (contentLength > 0) {
      // We may need to read more data to fill the content length.
      while (bodyData.byteLength < contentLength) {
        const chunk = await stream.read();
        if (chunk === null) {
          break;
        }
        bodyData = concatUint8Arrays([bodyData, chunk]) as Uint8Array<ArrayBuffer>;
      }
      bodyData = bodyData.slice(0, contentLength) as Uint8Array<ArrayBuffer>;
    } else {
      bodyData = new Uint8Array(0);
    }
  } else {
    // No Content-Length: read until EOF (Connection: close).
    const bodyChunks: Uint8Array[] = [bodyData];
    while (true) {
      const chunk = await stream.read();
      if (chunk === null) {
        break;
      }
      bodyChunks.push(chunk);
    }
    bodyData = concatUint8Arrays(bodyChunks) as Uint8Array<ArrayBuffer>;
  }

  stream.close();

  return {
    status,
    statusText,
    headers,
    body: bodyData.byteLength > 0 ? bodyData : null,
  };
}

/**
 * Concatenate multiple Uint8Arrays into a single array.
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  if (arrays.length === 0) {
    return new Uint8Array(0);
  }
  if (arrays.length === 1) {
    return arrays[0];
  }
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.byteLength;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  return result;
}
