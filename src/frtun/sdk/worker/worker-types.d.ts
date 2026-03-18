/**
 * worker-types.d.ts
 * Type declarations for Service Worker and Shared Worker globals.
 * These are needed because the main app doesn't include WebWorker lib.
 */

// Service Worker types
declare interface ServiceWorkerGlobalScope {
  addEventListener(type: 'install', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'message', listener: (event: ExtendableMessageEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: Clients;
}

declare interface Clients {
  claim(): Promise<void>;
  get(id: string): Promise<Client | undefined>;
  matchAll(options?: ClientQueryOptions): Promise<Client[]>;
}

declare interface Client {
  id: string;
  type: 'window' | 'worker' | 'sharedworker';
  url: string;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

declare interface ClientQueryOptions {
  includeUncontrolled?: boolean;
  type?: 'window' | 'worker' | 'sharedworker' | 'all';
}

declare interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

declare interface ExtendableMessageEvent extends ExtendableEvent {
  data: unknown;
  source: Client | ServiceWorker | MessagePort | null;
  ports: readonly MessagePort[];
}

declare interface FetchEvent extends ExtendableEvent {
  request: Request;
  clientId: string;
  resultingClientId: string;
  respondWith(response: Response | Promise<Response>): void;
}

// Shared Worker types
declare interface SharedWorkerGlobalScope {
  addEventListener(type: 'connect', listener: (event: MessageEvent) => void): void;
  name: string;
  onconnect: ((event: MessageEvent) => void) | null;
}
