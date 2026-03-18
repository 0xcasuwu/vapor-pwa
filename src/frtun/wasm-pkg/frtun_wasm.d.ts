/* tslint:disable */
/* eslint-disable */

/**
 * Connection state of the transport.
 */
export enum TransportState {
    /**
     * Not yet connected.
     */
    Disconnected = 0,
    /**
     * WebSocket is connecting.
     */
    Connecting = 1,
    /**
     * WebSocket is open and ready to send/receive.
     */
    Connected = 2,
    /**
     * WebSocket is closing.
     */
    Closing = 3,
    /**
     * WebSocket has been closed (may reconnect).
     */
    Closed = 4,
    /**
     * An error occurred.
     */
    Error = 5,
}

/**
 * The main overlay network client for the browser.
 *
 * Wraps the transport (WebSocket), multiplexer (frame mux), virtual
 * network stack (smoltcp), DNS allocator, and configuration into a
 * single cohesive API.
 */
export class WasmClient {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Close a multiplexed stream.
     */
    close_stream(stream_id: number): void;
    /**
     * Connect to the relay server via WebSocket using the given URL.
     *
     * The URL should be a `ws://` or `wss://` WebSocket URL.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the WebSocket connection cannot be
     * initiated.
     */
    connect(url: string): void;
    /**
     * Connect using the URL derived from the transport configuration.
     *
     * Builds the WebSocket URL from the configured server, port, and path
     * fields. Equivalent to calling `connect()` with the auto-constructed URL.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the config lacks a server or if the
     * WebSocket cannot be created.
     */
    connect_auto(): void;
    /**
     * Disconnect from the relay server.
     */
    disconnect(): void;
    /**
     * Allocate a bogon IP for a peer name.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the DNS allocator is not configured or
     * the pool is exhausted.
     */
    dns_allocate(peer_name: string): string;
    /**
     * Reverse-lookup a bogon IP to its peer name.
     */
    dns_reverse_lookup(ip: string): string | undefined;
    /**
     * Return `true` if the client is connected to the relay.
     */
    is_connected(): boolean;
    /**
     * Create a new overlay network client from a TOML configuration string.
     *
     * The TOML is parsed and validated using `frtun-config`.  The client is
     * created in a disconnected state; call `connect()` to establish the
     * WebSocket connection.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the TOML is invalid or fails validation.
     */
    constructor(config_toml: string);
    /**
     * Get the node mode from config.
     */
    node_mode(): string;
    /**
     * Register a callback to receive incoming messages.
     *
     * The callback receives a `Uint8Array` for each incoming binary message.
     */
    on_message(callback: Function): void;
    /**
     * Open a new multiplexed stream. Returns the stream ID.
     */
    open_stream(): number;
    /**
     * Poll the virtual network stack.
     *
     * `timestamp_millis` should be the current time in milliseconds.
     * Returns `true` if any work was done.
     */
    poll_netstack(timestamp_millis: number): boolean;
    /**
     * Receive data from a specific multiplexed stream.
     */
    recv_from_stream(stream_id: number): Uint8Array | undefined;
    /**
     * Send raw data through the overlay network.
     *
     * The data is framed as a `Data` frame on stream 1 (the default stream)
     * and sent via the WebSocket transport.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the transport is not connected or the
     * send fails.
     */
    send(data: Uint8Array): void;
    /**
     * Send data on a specific multiplexed stream.
     */
    send_on_stream(stream_id: number, data: Uint8Array): void;
    /**
     * Send a raw IP packet through the overlay network stack.
     *
     * The packet is injected into the virtual netstack, which generates
     * outbound IP packets that are framed and sent through the mux/transport.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the netstack is not initialized.
     */
    send_packet(packet: Uint8Array): void;
    /**
     * Return the number of active mux streams.
     */
    stream_count(): number;
    /**
     * Create a TCP connection through the virtual network stack.
     *
     * Returns a socket handle.
     */
    tcp_connect(dst_ip: string, dst_port: number): number;
    /**
     * Receive data from a TCP socket in the virtual network stack.
     */
    tcp_recv(handle: number): Uint8Array | undefined;
    /**
     * Send data on a TCP socket in the virtual network stack.
     */
    tcp_send(handle: number, data: Uint8Array): number;
    /**
     * Get the transport method from config.
     */
    transport_method(): string;
}

/**
 * Parsed configuration wrapper exposed to JS.
 *
 * Allows reading individual config sections without exposing the full
 * Rust `Config` type.
 */
export class WasmConfig {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get the DNS bogon range (if configured).
     */
    dns_bogon_range(): string | undefined;
    /**
     * Get the list of intercepted TLDs (if configured).
     */
    dns_intercept_tlds(): any;
    /**
     * Get the identity file path.
     */
    identity_path(): string;
    /**
     * Parse a TOML configuration string.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the TOML is malformed or fails validation.
     */
    constructor(toml_str: string);
    /**
     * Get the node mode (e.g. "Client", "Relay").
     */
    node_mode(): string;
    /**
     * Get the number of configured peers.
     */
    peer_count(): number;
    /**
     * Get the list of peer names.
     */
    peer_names(): any;
    /**
     * Get the number of configured firewall rules.
     */
    rule_count(): number;
    /**
     * Serialize the full config to a JS object via serde-wasm-bindgen.
     */
    to_js_object(): any;
    /**
     * Serialize the full config to a JSON string for JS introspection.
     */
    to_json(): string;
    /**
     * Get the transport method (e.g. "wss", "quic").
     */
    transport_method(): string;
    /**
     * Get the transport path (if configured).
     */
    transport_path(): string | undefined;
    /**
     * Get the transport port (if configured).
     */
    transport_port(): number | undefined;
    /**
     * Get the transport server (if configured).
     */
    transport_server(): string | undefined;
    /**
     * Get the TUN address (if configured).
     */
    tun_address(): string | undefined;
    /**
     * Get the TUN MTU (if configured).
     */
    tun_mtu(): number | undefined;
}

/**
 * A browser-compatible bogon IP allocator.
 *
 * Allocates synthetic IPv4 addresses from a private CIDR range and
 * maintains bidirectional mappings between peer names and addresses.
 */
export class WasmDns {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Allocate (or return the existing) bogon IP for a peer name.
     *
     * Returns the IPv4 address as a dotted-quad string (e.g. `"100.64.0.1"`).
     *
     * # Errors
     *
     * Returns a `JsValue` error if the address pool is exhausted.
     */
    allocate(peer_name: string): string;
    /**
     * Return the number of currently allocated IPs.
     */
    allocated_count(): number;
    /**
     * Return the total pool capacity.
     */
    capacity(): number;
    /**
     * Check whether an IP falls within this allocator's CIDR range.
     */
    is_bogon(ip: string): boolean;
    /**
     * Create a new bogon allocator from a CIDR string (e.g. `"100.64.0.0/10"`).
     *
     * # Errors
     *
     * Returns a `JsValue` error if the CIDR string is malformed or the prefix
     * length is out of the valid range.
     */
    constructor(cidr: string);
    /**
     * Reverse lookup: find the peer name for a bogon IP address string.
     *
     * Returns `undefined` in JS if the IP has not been allocated.
     */
    reverse_lookup(ip: string): string | undefined;
}

/**
 * A lightweight frame multiplexer for the browser.
 *
 * Manages stream lifecycle (open/close/reset) and frame encode/decode
 * using `frtun-core`'s wire format.  All state is single-threaded.
 */
export class WasmMux {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Close a stream gracefully (sends StreamClose).
     */
    close_stream(stream_id: number): void;
    /**
     * Decode a frame from raw bytes and return its parts as a JS object.
     *
     * Returns `{ frameType: number, streamId: number, payload: Uint8Array }`.
     */
    static decode_frame(raw: Uint8Array): any;
    /**
     * Encode a frame from its constituent parts and return the raw bytes.
     *
     * This is a utility method for callers that need to construct frames
     * manually (e.g. for testing or custom control messages).
     *
     * `frame_type` values: 0=Data, 1=StreamOpen, 2=StreamClose,
     * 3=StreamReset, 4=WindowUpdate, 5=Ping, 6=Pong.
     */
    static encode_frame(frame_type: number, stream_id: number, payload: Uint8Array): Uint8Array;
    /**
     * Check whether a stream has been closed by the remote side.
     */
    is_remote_closed(stream_id: number): boolean;
    /**
     * Create a new multiplexer.
     *
     * `is_initiator` determines stream-ID parity:
     * - `true`  -> odd IDs  (1, 3, 5, ...) -- typically the client.
     * - `false` -> even IDs (2, 4, 6, ...) -- typically the server.
     */
    constructor(is_initiator: boolean);
    /**
     * Open a new outbound stream.  Returns the allocated stream ID.
     *
     * A `StreamOpen` frame is enqueued for transmission.
     */
    open_stream(): number;
    /**
     * Return the number of queued outbound frames.
     */
    outbound_count(): number;
    /**
     * Process an inbound frame received from the transport.
     *
     * The raw bytes are decoded using `frtun-core`'s `Frame::decode_from_slice`,
     * and the frame is dispatched to the appropriate stream or handled as a
     * connection-level control frame.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the frame is malformed.
     */
    process_inbound(raw: Uint8Array): void;
    /**
     * Receive data from a stream's inbound queue.
     *
     * Returns `undefined` in JS if no data is available.
     */
    recv(stream_id: number): Uint8Array | undefined;
    /**
     * Remove a stream from the table entirely.
     */
    remove_stream(stream_id: number): void;
    /**
     * Reset a stream abruptly (sends StreamReset and removes it).
     */
    reset_stream(stream_id: number): void;
    /**
     * Enqueue a data frame to be sent on the given stream.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the payload exceeds the maximum frame size
     * or if the stream does not exist.
     */
    send(stream_id: number, data: Uint8Array): void;
    /**
     * Return the number of active streams.
     */
    stream_count(): number;
    /**
     * Take the next outbound frame (encoded bytes) to send over the transport.
     *
     * Returns `undefined` in JS if no outbound frames are queued.
     */
    take_outbound(): Uint8Array | undefined;
}

/**
 * A userspace TCP/IP stack for the browser, backed by smoltcp.
 *
 * This exposes the core operations needed by the overlay network client:
 * creating TCP sockets, injecting/draining packets, and polling the stack.
 */
export class WasmNetStack {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Drain all outbound packets generated by the stack.
     *
     * Returns a JS array of `Uint8Array`s. These packets should be sent
     * over the overlay network.
     */
    drain_packets(): Array<any>;
    /**
     * Inject a raw IP packet from the overlay network into the stack.
     *
     * The packet will be processed on the next call to `poll()`.
     */
    inject_packet(data: Uint8Array): void;
    /**
     * Create a new virtual network stack.
     *
     * * `ip` -- the IPv4 address to assign (e.g. `"10.0.0.1"`).
     * * `prefix_len` -- the CIDR prefix length (e.g. `24`).
     */
    constructor(ip: string, prefix_len: number);
    /**
     * Poll the TCP/IP state machine.
     *
     * `timestamp_millis` is the current time in milliseconds (e.g. from
     * `Date.now()` or `performance.now()`).  This drives timeouts,
     * retransmissions, and other time-dependent TCP behavior.
     *
     * Returns `true` if any work was done.
     */
    poll(timestamp_millis: number): boolean;
    /**
     * Remove a socket handle from the handle map.
     *
     * Call this after the socket is fully closed and no longer needed.
     */
    remove_socket(handle: number): void;
    /**
     * Return the number of active sockets.
     */
    socket_count(): number;
    /**
     * Check whether a socket has data available to receive.
     */
    tcp_can_recv(handle: number): boolean;
    /**
     * Check whether a socket is ready to send data.
     */
    tcp_can_send(handle: number): boolean;
    /**
     * Gracefully close a TCP socket (sends FIN).
     */
    tcp_close(handle: number): void;
    /**
     * Initiate a TCP connection to the specified destination.
     *
     * Returns a socket handle (u32) that can be used with `tcp_send`,
     * `tcp_recv`, etc.  Call `poll()` repeatedly to drive the handshake.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the destination address is invalid or the
     * socket cannot be created.
     */
    tcp_connect(dst_ip: string, dst_port: number): number;
    /**
     * Create a TCP socket that listens on the given port.
     *
     * Returns a socket handle.
     */
    tcp_listen(port: number): number;
    /**
     * Read available data from a TCP socket.
     *
     * Returns `undefined` in JS if no data is available or the socket is
     * closed.
     */
    tcp_recv(handle: number): Uint8Array | undefined;
    /**
     * Write data to a TCP socket.
     *
     * Returns the number of bytes actually enqueued (may be less than the
     * input length if the transmit buffer is partially full).
     */
    tcp_send(handle: number, data: Uint8Array): number;
    /**
     * Return the TCP state as a string (e.g. "Established", "SynSent", etc.).
     */
    tcp_state(handle: number): string;
}

/**
 * WebSocket-based transport for the frtun overlay network in the browser.
 *
 * Uses `web_sys::WebSocket` in binary mode (ArrayBuffer) and provides
 * methods to send data, register callbacks, and query connection state.
 */
export class WasmTransport {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Connect to a relay via WebSocket.
     *
     * The URL should be a `ws://` or `wss://` WebSocket URL.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the WebSocket cannot be created.
     */
    connect(url: string): void;
    /**
     * Disconnect the WebSocket.
     */
    disconnect(): void;
    /**
     * Return the number of queued inbound messages.
     */
    inbound_count(): number;
    /**
     * Return `true` if the transport is currently connected and ready.
     */
    is_connected(): boolean;
    /**
     * Return the last error message, or `undefined` if none.
     */
    last_error(): string | undefined;
    /**
     * Create a new transport (not yet connected).
     */
    constructor();
    /**
     * Register a callback that is invoked for each incoming binary message.
     *
     * The callback receives a single `Uint8Array` argument.  When a callback
     * is registered, messages are no longer queued and `recv()` will always
     * return `undefined`.
     */
    on_message(callback: Function): void;
    /**
     * Register a callback that is invoked when the connection state changes.
     *
     * The callback receives the new state as a `number` argument (see
     * `TransportState` enum values).
     */
    on_state_change(callback: Function): void;
    /**
     * Attempt to reconnect using the previously supplied URL.
     *
     * # Errors
     *
     * Returns a `JsValue` error if no URL has been set (i.e. `connect` was
     * never called) or if the WebSocket cannot be created.
     */
    reconnect(): void;
    /**
     * Receive the next queued inbound message.
     *
     * Returns `undefined` in JS if no messages are queued.  If an
     * `on_message` callback is registered, messages are delivered there
     * instead of being queued.
     */
    recv(): Uint8Array | undefined;
    /**
     * Send binary data over the WebSocket.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the WebSocket is not in the `Connected`
     * state or the send fails.
     */
    send(data: Uint8Array): void;
    /**
     * Return the current connection state.
     */
    state(): TransportState;
}

/**
 * Generate a new identity (keypair) for the overlay network.
 *
 * Returns a JS object with the following fields:
 * - `publicKey`: `Uint8Array` -- the BLAKE3 hash of the public key (32 bytes).
 * - `secretKey`: `Uint8Array` -- 32 random bytes (used as a seed).
 * - `peerName`: `string` -- the bech32m-encoded peer name with `.peer` suffix.
 *
 * Note: This uses a simplified key generation approach for the browser.
 * The native frtun client uses ML-DSA-65 (Dilithium) keypairs, but those
 * require `pqcrypto-dilithium` which does not compile to wasm32.  Instead,
 * we generate a random 32-byte seed and derive the peer identity from it
 * using BLAKE3.
 */
export function generate_identity(): any;

/**
 * Initialize the WASM environment.
 *
 * Sets up `console_error_panic_hook` so that Rust panics produce readable
 * stack traces in the browser console instead of the default
 * "unreachable executed" message.
 *
 * Safe to call multiple times; only the first invocation has any effect.
 */
export function init(): void;

/**
 * Parse a TOML configuration string and return a JS object.
 *
 * This is a convenience function for quick config inspection without
 * creating a full `WasmConfig` instance.
 *
 * # Errors
 *
 * Returns a `JsValue` error if the TOML is malformed or fails validation.
 */
export function parse_config(toml_str: string): any;

/**
 * Derive a `.peer` name from a public key (raw bytes).
 *
 * The public key is hashed with BLAKE3 to produce a 32-byte fingerprint,
 * which is then bech32m-encoded with the `frtun` HRP and `.peer` suffix.
 */
export function peer_name_from_pubkey(pubkey: Uint8Array): string;

/**
 * Initialize the WASM module.
 *
 * Sets up panic hooks for better error messages.  This is called
 * automatically by `WasmClient::new()`, but can also be called
 * explicitly before using other functions.
 */
export function wasm_main(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmclient_free: (a: number, b: number) => void;
    readonly __wbg_wasmconfig_free: (a: number, b: number) => void;
    readonly wasmclient_close_stream: (a: number, b: number) => void;
    readonly wasmclient_connect: (a: number, b: number, c: number) => [number, number];
    readonly wasmclient_connect_auto: (a: number) => [number, number];
    readonly wasmclient_disconnect: (a: number) => void;
    readonly wasmclient_dns_allocate: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmclient_dns_reverse_lookup: (a: number, b: number, c: number) => [number, number];
    readonly wasmclient_is_connected: (a: number) => number;
    readonly wasmclient_new: (a: number, b: number) => [number, number, number];
    readonly wasmclient_node_mode: (a: number) => [number, number];
    readonly wasmclient_on_message: (a: number, b: any) => void;
    readonly wasmclient_open_stream: (a: number) => number;
    readonly wasmclient_poll_netstack: (a: number, b: number) => number;
    readonly wasmclient_recv_from_stream: (a: number, b: number) => [number, number];
    readonly wasmclient_send: (a: number, b: number, c: number) => [number, number];
    readonly wasmclient_send_on_stream: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmclient_send_packet: (a: number, b: number, c: number) => [number, number];
    readonly wasmclient_stream_count: (a: number) => number;
    readonly wasmclient_tcp_connect: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmclient_tcp_recv: (a: number, b: number) => [number, number];
    readonly wasmclient_tcp_send: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmclient_transport_method: (a: number) => [number, number];
    readonly wasmconfig_dns_bogon_range: (a: number) => [number, number];
    readonly wasmconfig_dns_intercept_tlds: (a: number) => any;
    readonly wasmconfig_identity_path: (a: number) => [number, number];
    readonly wasmconfig_new: (a: number, b: number) => [number, number, number];
    readonly wasmconfig_node_mode: (a: number) => [number, number];
    readonly wasmconfig_peer_count: (a: number) => number;
    readonly wasmconfig_peer_names: (a: number) => any;
    readonly wasmconfig_rule_count: (a: number) => number;
    readonly wasmconfig_to_js_object: (a: number) => [number, number, number];
    readonly wasmconfig_to_json: (a: number) => [number, number, number, number];
    readonly wasmconfig_transport_method: (a: number) => [number, number];
    readonly wasmconfig_transport_path: (a: number) => [number, number];
    readonly wasmconfig_transport_port: (a: number) => number;
    readonly wasmconfig_transport_server: (a: number) => [number, number];
    readonly wasmconfig_tun_address: (a: number) => [number, number];
    readonly wasmconfig_tun_mtu: (a: number) => number;
    readonly __wbg_wasmdns_free: (a: number, b: number) => void;
    readonly wasmdns_allocate: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmdns_allocated_count: (a: number) => number;
    readonly wasmdns_capacity: (a: number) => number;
    readonly wasmdns_is_bogon: (a: number, b: number, c: number) => number;
    readonly wasmdns_new: (a: number, b: number) => [number, number, number];
    readonly wasmdns_reverse_lookup: (a: number, b: number, c: number) => [number, number];
    readonly init: () => void;
    readonly __wbg_wasmnetstack_free: (a: number, b: number) => void;
    readonly wasmnetstack_drain_packets: (a: number) => any;
    readonly wasmnetstack_inject_packet: (a: number, b: number, c: number) => void;
    readonly wasmnetstack_new: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmnetstack_poll: (a: number, b: number) => number;
    readonly wasmnetstack_remove_socket: (a: number, b: number) => void;
    readonly wasmnetstack_socket_count: (a: number) => number;
    readonly wasmnetstack_tcp_can_recv: (a: number, b: number) => number;
    readonly wasmnetstack_tcp_can_send: (a: number, b: number) => number;
    readonly wasmnetstack_tcp_close: (a: number, b: number) => void;
    readonly wasmnetstack_tcp_connect: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmnetstack_tcp_listen: (a: number, b: number) => [number, number, number];
    readonly wasmnetstack_tcp_recv: (a: number, b: number) => [number, number];
    readonly wasmnetstack_tcp_send: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmnetstack_tcp_state: (a: number, b: number) => [number, number];
    readonly generate_identity: () => [number, number, number];
    readonly parse_config: (a: number, b: number) => [number, number, number];
    readonly peer_name_from_pubkey: (a: number, b: number) => [number, number];
    readonly wasm_main: () => void;
    readonly __wbg_wasmtransport_free: (a: number, b: number) => void;
    readonly wasmtransport_connect: (a: number, b: number, c: number) => [number, number];
    readonly wasmtransport_disconnect: (a: number) => void;
    readonly wasmtransport_inbound_count: (a: number) => number;
    readonly wasmtransport_is_connected: (a: number) => number;
    readonly wasmtransport_last_error: (a: number) => [number, number];
    readonly wasmtransport_new: () => number;
    readonly wasmtransport_on_message: (a: number, b: any) => void;
    readonly wasmtransport_on_state_change: (a: number, b: any) => void;
    readonly wasmtransport_reconnect: (a: number) => [number, number];
    readonly wasmtransport_recv: (a: number) => [number, number];
    readonly wasmtransport_send: (a: number, b: number, c: number) => [number, number];
    readonly wasmtransport_state: (a: number) => number;
    readonly __wbg_wasmmux_free: (a: number, b: number) => void;
    readonly wasmmux_close_stream: (a: number, b: number) => void;
    readonly wasmmux_decode_frame: (a: number, b: number) => [number, number, number];
    readonly wasmmux_encode_frame: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmmux_is_remote_closed: (a: number, b: number) => number;
    readonly wasmmux_new: (a: number) => number;
    readonly wasmmux_open_stream: (a: number) => number;
    readonly wasmmux_outbound_count: (a: number) => number;
    readonly wasmmux_process_inbound: (a: number, b: number, c: number) => [number, number];
    readonly wasmmux_recv: (a: number, b: number) => [number, number];
    readonly wasmmux_remove_stream: (a: number, b: number) => void;
    readonly wasmmux_reset_stream: (a: number, b: number) => void;
    readonly wasmmux_send: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmmux_stream_count: (a: number) => number;
    readonly wasmmux_take_outbound: (a: number) => [number, number];
    readonly wasm_bindgen__closure__destroy__h233e2746682202dc: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_1: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_2: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_3: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
