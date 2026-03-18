/**
 * types.ts
 * Vapor PWA - frtun Type Definitions
 *
 * Re-exports types from the SDK and defines Vapor-specific types.
 */

// Re-export SDK types
export type {
  FrtunConfig,
  FrtunEvents,
  ConnectionState,
  WasmModule,
  WasmClient,
  TransportConfig,
  DnsConfig,
} from './sdk/types';

export { FrtunError, FrtunErrorCode } from './sdk/types';

// Vapor-specific types
export type { FrtunIdentity } from './keys';
export type { VaporFrtunState, VaporFrtunEvents } from './client';
