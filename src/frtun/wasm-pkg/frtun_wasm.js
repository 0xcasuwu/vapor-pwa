/* @ts-self-types="./frtun_wasm.d.ts" */

/**
 * Connection state of the transport.
 * @enum {0 | 1 | 2 | 3 | 4 | 5}
 */
export const TransportState = Object.freeze({
    /**
     * Not yet connected.
     */
    Disconnected: 0, "0": "Disconnected",
    /**
     * WebSocket is connecting.
     */
    Connecting: 1, "1": "Connecting",
    /**
     * WebSocket is open and ready to send/receive.
     */
    Connected: 2, "2": "Connected",
    /**
     * WebSocket is closing.
     */
    Closing: 3, "3": "Closing",
    /**
     * WebSocket has been closed (may reconnect).
     */
    Closed: 4, "4": "Closed",
    /**
     * An error occurred.
     */
    Error: 5, "5": "Error",
});

/**
 * The main overlay network client for the browser.
 *
 * Wraps the transport (WebSocket), multiplexer (frame mux), virtual
 * network stack (smoltcp), DNS allocator, and configuration into a
 * single cohesive API.
 */
export class WasmClient {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmClientFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmclient_free(ptr, 0);
    }
    /**
     * Close a multiplexed stream.
     * @param {number} stream_id
     */
    close_stream(stream_id) {
        wasm.wasmclient_close_stream(this.__wbg_ptr, stream_id);
    }
    /**
     * Connect to the relay server via WebSocket using the given URL.
     *
     * The URL should be a `ws://` or `wss://` WebSocket URL.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the WebSocket connection cannot be
     * initiated.
     * @param {string} url
     */
    connect(url) {
        const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclient_connect(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
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
    connect_auto() {
        const ret = wasm.wasmclient_connect_auto(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Disconnect from the relay server.
     */
    disconnect() {
        wasm.wasmclient_disconnect(this.__wbg_ptr);
    }
    /**
     * Allocate a bogon IP for a peer name.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the DNS allocator is not configured or
     * the pool is exhausted.
     * @param {string} peer_name
     * @returns {string}
     */
    dns_allocate(peer_name) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(peer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmclient_dns_allocate(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Reverse-lookup a bogon IP to its peer name.
     * @param {string} ip
     * @returns {string | undefined}
     */
    dns_reverse_lookup(ip) {
        const ptr0 = passStringToWasm0(ip, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclient_dns_reverse_lookup(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * Return `true` if the client is connected to the relay.
     * @returns {boolean}
     */
    is_connected() {
        const ret = wasm.wasmclient_is_connected(this.__wbg_ptr);
        return ret !== 0;
    }
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
     * @param {string} config_toml
     */
    constructor(config_toml) {
        const ptr0 = passStringToWasm0(config_toml, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclient_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmClientFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get the node mode from config.
     * @returns {string}
     */
    node_mode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmclient_node_mode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Register a callback to receive incoming messages.
     *
     * The callback receives a `Uint8Array` for each incoming binary message.
     * @param {Function} callback
     */
    on_message(callback) {
        wasm.wasmclient_on_message(this.__wbg_ptr, callback);
    }
    /**
     * Open a new multiplexed stream. Returns the stream ID.
     * @returns {number}
     */
    open_stream() {
        const ret = wasm.wasmclient_open_stream(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Poll the virtual network stack.
     *
     * `timestamp_millis` should be the current time in milliseconds.
     * Returns `true` if any work was done.
     * @param {number} timestamp_millis
     * @returns {boolean}
     */
    poll_netstack(timestamp_millis) {
        const ret = wasm.wasmclient_poll_netstack(this.__wbg_ptr, timestamp_millis);
        return ret !== 0;
    }
    /**
     * Receive data from a specific multiplexed stream.
     * @param {number} stream_id
     * @returns {Uint8Array | undefined}
     */
    recv_from_stream(stream_id) {
        const ret = wasm.wasmclient_recv_from_stream(this.__wbg_ptr, stream_id);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
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
     * @param {Uint8Array} data
     */
    send(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclient_send(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Send data on a specific multiplexed stream.
     * @param {number} stream_id
     * @param {Uint8Array} data
     */
    send_on_stream(stream_id, data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclient_send_on_stream(this.__wbg_ptr, stream_id, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Send a raw IP packet through the overlay network stack.
     *
     * The packet is injected into the virtual netstack, which generates
     * outbound IP packets that are framed and sent through the mux/transport.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the netstack is not initialized.
     * @param {Uint8Array} packet
     */
    send_packet(packet) {
        const ptr0 = passArray8ToWasm0(packet, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclient_send_packet(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Return the number of active mux streams.
     * @returns {number}
     */
    stream_count() {
        const ret = wasm.wasmclient_stream_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Create a TCP connection through the virtual network stack.
     *
     * Returns a socket handle.
     * @param {string} dst_ip
     * @param {number} dst_port
     * @returns {number}
     */
    tcp_connect(dst_ip, dst_port) {
        const ptr0 = passStringToWasm0(dst_ip, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclient_tcp_connect(this.__wbg_ptr, ptr0, len0, dst_port);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Receive data from a TCP socket in the virtual network stack.
     * @param {number} handle
     * @returns {Uint8Array | undefined}
     */
    tcp_recv(handle) {
        const ret = wasm.wasmclient_tcp_recv(this.__wbg_ptr, handle);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Send data on a TCP socket in the virtual network stack.
     * @param {number} handle
     * @param {Uint8Array} data
     * @returns {number}
     */
    tcp_send(handle, data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclient_tcp_send(this.__wbg_ptr, handle, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Get the transport method from config.
     * @returns {string}
     */
    transport_method() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmclient_transport_method(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WasmClient.prototype[Symbol.dispose] = WasmClient.prototype.free;

/**
 * Parsed configuration wrapper exposed to JS.
 *
 * Allows reading individual config sections without exposing the full
 * Rust `Config` type.
 */
export class WasmConfig {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmConfigFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmconfig_free(ptr, 0);
    }
    /**
     * Get the DNS bogon range (if configured).
     * @returns {string | undefined}
     */
    dns_bogon_range() {
        const ret = wasm.wasmconfig_dns_bogon_range(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Get the list of intercepted TLDs (if configured).
     * @returns {any}
     */
    dns_intercept_tlds() {
        const ret = wasm.wasmconfig_dns_intercept_tlds(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the identity file path.
     * @returns {string}
     */
    identity_path() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmconfig_identity_path(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Parse a TOML configuration string.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the TOML is malformed or fails validation.
     * @param {string} toml_str
     */
    constructor(toml_str) {
        const ptr0 = passStringToWasm0(toml_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmconfig_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmConfigFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get the node mode (e.g. "Client", "Relay").
     * @returns {string}
     */
    node_mode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmconfig_node_mode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the number of configured peers.
     * @returns {number}
     */
    peer_count() {
        const ret = wasm.wasmconfig_peer_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the list of peer names.
     * @returns {any}
     */
    peer_names() {
        const ret = wasm.wasmconfig_peer_names(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get the number of configured firewall rules.
     * @returns {number}
     */
    rule_count() {
        const ret = wasm.wasmconfig_rule_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Serialize the full config to a JS object via serde-wasm-bindgen.
     * @returns {any}
     */
    to_js_object() {
        const ret = wasm.wasmconfig_to_js_object(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Serialize the full config to a JSON string for JS introspection.
     * @returns {string}
     */
    to_json() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmconfig_to_json(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get the transport method (e.g. "wss", "quic").
     * @returns {string}
     */
    transport_method() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmconfig_transport_method(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the transport path (if configured).
     * @returns {string | undefined}
     */
    transport_path() {
        const ret = wasm.wasmconfig_transport_path(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Get the transport port (if configured).
     * @returns {number | undefined}
     */
    transport_port() {
        const ret = wasm.wasmconfig_transport_port(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret;
    }
    /**
     * Get the transport server (if configured).
     * @returns {string | undefined}
     */
    transport_server() {
        const ret = wasm.wasmconfig_transport_server(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Get the TUN address (if configured).
     * @returns {string | undefined}
     */
    tun_address() {
        const ret = wasm.wasmconfig_tun_address(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Get the TUN MTU (if configured).
     * @returns {number | undefined}
     */
    tun_mtu() {
        const ret = wasm.wasmconfig_tun_mtu(this.__wbg_ptr);
        return ret === 0x100000001 ? undefined : ret;
    }
}
if (Symbol.dispose) WasmConfig.prototype[Symbol.dispose] = WasmConfig.prototype.free;

/**
 * A browser-compatible bogon IP allocator.
 *
 * Allocates synthetic IPv4 addresses from a private CIDR range and
 * maintains bidirectional mappings between peer names and addresses.
 */
export class WasmDns {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmDnsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmdns_free(ptr, 0);
    }
    /**
     * Allocate (or return the existing) bogon IP for a peer name.
     *
     * Returns the IPv4 address as a dotted-quad string (e.g. `"100.64.0.1"`).
     *
     * # Errors
     *
     * Returns a `JsValue` error if the address pool is exhausted.
     * @param {string} peer_name
     * @returns {string}
     */
    allocate(peer_name) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(peer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmdns_allocate(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Return the number of currently allocated IPs.
     * @returns {number}
     */
    allocated_count() {
        const ret = wasm.wasmdns_allocated_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Return the total pool capacity.
     * @returns {number}
     */
    capacity() {
        const ret = wasm.wasmdns_capacity(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Check whether an IP falls within this allocator's CIDR range.
     * @param {string} ip
     * @returns {boolean}
     */
    is_bogon(ip) {
        const ptr0 = passStringToWasm0(ip, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdns_is_bogon(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Create a new bogon allocator from a CIDR string (e.g. `"100.64.0.0/10"`).
     *
     * # Errors
     *
     * Returns a `JsValue` error if the CIDR string is malformed or the prefix
     * length is out of the valid range.
     * @param {string} cidr
     */
    constructor(cidr) {
        const ptr0 = passStringToWasm0(cidr, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdns_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmDnsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Reverse lookup: find the peer name for a bogon IP address string.
     *
     * Returns `undefined` in JS if the IP has not been allocated.
     * @param {string} ip
     * @returns {string | undefined}
     */
    reverse_lookup(ip) {
        const ptr0 = passStringToWasm0(ip, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdns_reverse_lookup(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
}
if (Symbol.dispose) WasmDns.prototype[Symbol.dispose] = WasmDns.prototype.free;

/**
 * A lightweight frame multiplexer for the browser.
 *
 * Manages stream lifecycle (open/close/reset) and frame encode/decode
 * using `frtun-core`'s wire format.  All state is single-threaded.
 */
export class WasmMux {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmMuxFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmmux_free(ptr, 0);
    }
    /**
     * Close a stream gracefully (sends StreamClose).
     * @param {number} stream_id
     */
    close_stream(stream_id) {
        wasm.wasmmux_close_stream(this.__wbg_ptr, stream_id);
    }
    /**
     * Decode a frame from raw bytes and return its parts as a JS object.
     *
     * Returns `{ frameType: number, streamId: number, payload: Uint8Array }`.
     * @param {Uint8Array} raw
     * @returns {any}
     */
    static decode_frame(raw) {
        const ptr0 = passArray8ToWasm0(raw, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmux_decode_frame(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Encode a frame from its constituent parts and return the raw bytes.
     *
     * This is a utility method for callers that need to construct frames
     * manually (e.g. for testing or custom control messages).
     *
     * `frame_type` values: 0=Data, 1=StreamOpen, 2=StreamClose,
     * 3=StreamReset, 4=WindowUpdate, 5=Ping, 6=Pong.
     * @param {number} frame_type
     * @param {number} stream_id
     * @param {Uint8Array} payload
     * @returns {Uint8Array}
     */
    static encode_frame(frame_type, stream_id, payload) {
        const ptr0 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmux_encode_frame(frame_type, stream_id, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Check whether a stream has been closed by the remote side.
     * @param {number} stream_id
     * @returns {boolean}
     */
    is_remote_closed(stream_id) {
        const ret = wasm.wasmmux_is_remote_closed(this.__wbg_ptr, stream_id);
        return ret !== 0;
    }
    /**
     * Create a new multiplexer.
     *
     * `is_initiator` determines stream-ID parity:
     * - `true`  -> odd IDs  (1, 3, 5, ...) -- typically the client.
     * - `false` -> even IDs (2, 4, 6, ...) -- typically the server.
     * @param {boolean} is_initiator
     */
    constructor(is_initiator) {
        const ret = wasm.wasmmux_new(is_initiator);
        this.__wbg_ptr = ret >>> 0;
        WasmMuxFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Open a new outbound stream.  Returns the allocated stream ID.
     *
     * A `StreamOpen` frame is enqueued for transmission.
     * @returns {number}
     */
    open_stream() {
        const ret = wasm.wasmmux_open_stream(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Return the number of queued outbound frames.
     * @returns {number}
     */
    outbound_count() {
        const ret = wasm.wasmmux_outbound_count(this.__wbg_ptr);
        return ret >>> 0;
    }
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
     * @param {Uint8Array} raw
     */
    process_inbound(raw) {
        const ptr0 = passArray8ToWasm0(raw, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmux_process_inbound(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Receive data from a stream's inbound queue.
     *
     * Returns `undefined` in JS if no data is available.
     * @param {number} stream_id
     * @returns {Uint8Array | undefined}
     */
    recv(stream_id) {
        const ret = wasm.wasmmux_recv(this.__wbg_ptr, stream_id);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Remove a stream from the table entirely.
     * @param {number} stream_id
     */
    remove_stream(stream_id) {
        wasm.wasmmux_remove_stream(this.__wbg_ptr, stream_id);
    }
    /**
     * Reset a stream abruptly (sends StreamReset and removes it).
     * @param {number} stream_id
     */
    reset_stream(stream_id) {
        wasm.wasmmux_reset_stream(this.__wbg_ptr, stream_id);
    }
    /**
     * Enqueue a data frame to be sent on the given stream.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the payload exceeds the maximum frame size
     * or if the stream does not exist.
     * @param {number} stream_id
     * @param {Uint8Array} data
     */
    send(stream_id, data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmux_send(this.__wbg_ptr, stream_id, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Return the number of active streams.
     * @returns {number}
     */
    stream_count() {
        const ret = wasm.wasmmux_stream_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Take the next outbound frame (encoded bytes) to send over the transport.
     *
     * Returns `undefined` in JS if no outbound frames are queued.
     * @returns {Uint8Array | undefined}
     */
    take_outbound() {
        const ret = wasm.wasmmux_take_outbound(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
}
if (Symbol.dispose) WasmMux.prototype[Symbol.dispose] = WasmMux.prototype.free;

/**
 * A userspace TCP/IP stack for the browser, backed by smoltcp.
 *
 * This exposes the core operations needed by the overlay network client:
 * creating TCP sockets, injecting/draining packets, and polling the stack.
 */
export class WasmNetStack {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmNetStackFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmnetstack_free(ptr, 0);
    }
    /**
     * Drain all outbound packets generated by the stack.
     *
     * Returns a JS array of `Uint8Array`s. These packets should be sent
     * over the overlay network.
     * @returns {Array<any>}
     */
    drain_packets() {
        const ret = wasm.wasmnetstack_drain_packets(this.__wbg_ptr);
        return ret;
    }
    /**
     * Inject a raw IP packet from the overlay network into the stack.
     *
     * The packet will be processed on the next call to `poll()`.
     * @param {Uint8Array} data
     */
    inject_packet(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.wasmnetstack_inject_packet(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Create a new virtual network stack.
     *
     * * `ip` -- the IPv4 address to assign (e.g. `"10.0.0.1"`).
     * * `prefix_len` -- the CIDR prefix length (e.g. `24`).
     * @param {string} ip
     * @param {number} prefix_len
     */
    constructor(ip, prefix_len) {
        const ptr0 = passStringToWasm0(ip, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmnetstack_new(ptr0, len0, prefix_len);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmNetStackFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Poll the TCP/IP state machine.
     *
     * `timestamp_millis` is the current time in milliseconds (e.g. from
     * `Date.now()` or `performance.now()`).  This drives timeouts,
     * retransmissions, and other time-dependent TCP behavior.
     *
     * Returns `true` if any work was done.
     * @param {number} timestamp_millis
     * @returns {boolean}
     */
    poll(timestamp_millis) {
        const ret = wasm.wasmnetstack_poll(this.__wbg_ptr, timestamp_millis);
        return ret !== 0;
    }
    /**
     * Remove a socket handle from the handle map.
     *
     * Call this after the socket is fully closed and no longer needed.
     * @param {number} handle
     */
    remove_socket(handle) {
        wasm.wasmnetstack_remove_socket(this.__wbg_ptr, handle);
    }
    /**
     * Return the number of active sockets.
     * @returns {number}
     */
    socket_count() {
        const ret = wasm.wasmnetstack_socket_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Check whether a socket has data available to receive.
     * @param {number} handle
     * @returns {boolean}
     */
    tcp_can_recv(handle) {
        const ret = wasm.wasmnetstack_tcp_can_recv(this.__wbg_ptr, handle);
        return ret !== 0;
    }
    /**
     * Check whether a socket is ready to send data.
     * @param {number} handle
     * @returns {boolean}
     */
    tcp_can_send(handle) {
        const ret = wasm.wasmnetstack_tcp_can_send(this.__wbg_ptr, handle);
        return ret !== 0;
    }
    /**
     * Gracefully close a TCP socket (sends FIN).
     * @param {number} handle
     */
    tcp_close(handle) {
        wasm.wasmnetstack_tcp_close(this.__wbg_ptr, handle);
    }
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
     * @param {string} dst_ip
     * @param {number} dst_port
     * @returns {number}
     */
    tcp_connect(dst_ip, dst_port) {
        const ptr0 = passStringToWasm0(dst_ip, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmnetstack_tcp_connect(this.__wbg_ptr, ptr0, len0, dst_port);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Create a TCP socket that listens on the given port.
     *
     * Returns a socket handle.
     * @param {number} port
     * @returns {number}
     */
    tcp_listen(port) {
        const ret = wasm.wasmnetstack_tcp_listen(this.__wbg_ptr, port);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Read available data from a TCP socket.
     *
     * Returns `undefined` in JS if no data is available or the socket is
     * closed.
     * @param {number} handle
     * @returns {Uint8Array | undefined}
     */
    tcp_recv(handle) {
        const ret = wasm.wasmnetstack_tcp_recv(this.__wbg_ptr, handle);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Write data to a TCP socket.
     *
     * Returns the number of bytes actually enqueued (may be less than the
     * input length if the transmit buffer is partially full).
     * @param {number} handle
     * @param {Uint8Array} data
     * @returns {number}
     */
    tcp_send(handle, data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmnetstack_tcp_send(this.__wbg_ptr, handle, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Return the TCP state as a string (e.g. "Established", "SynSent", etc.).
     * @param {number} handle
     * @returns {string}
     */
    tcp_state(handle) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmnetstack_tcp_state(this.__wbg_ptr, handle);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WasmNetStack.prototype[Symbol.dispose] = WasmNetStack.prototype.free;

/**
 * WebSocket-based transport for the frtun overlay network in the browser.
 *
 * Uses `web_sys::WebSocket` in binary mode (ArrayBuffer) and provides
 * methods to send data, register callbacks, and query connection state.
 */
export class WasmTransport {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmTransportFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmtransport_free(ptr, 0);
    }
    /**
     * Connect to a relay via WebSocket.
     *
     * The URL should be a `ws://` or `wss://` WebSocket URL.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the WebSocket cannot be created.
     * @param {string} url
     */
    connect(url) {
        const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtransport_connect(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Disconnect the WebSocket.
     */
    disconnect() {
        wasm.wasmtransport_disconnect(this.__wbg_ptr);
    }
    /**
     * Return the number of queued inbound messages.
     * @returns {number}
     */
    inbound_count() {
        const ret = wasm.wasmtransport_inbound_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Return `true` if the transport is currently connected and ready.
     * @returns {boolean}
     */
    is_connected() {
        const ret = wasm.wasmtransport_is_connected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Return the last error message, or `undefined` if none.
     * @returns {string | undefined}
     */
    last_error() {
        const ret = wasm.wasmtransport_last_error(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Create a new transport (not yet connected).
     */
    constructor() {
        const ret = wasm.wasmtransport_new();
        this.__wbg_ptr = ret >>> 0;
        WasmTransportFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Register a callback that is invoked for each incoming binary message.
     *
     * The callback receives a single `Uint8Array` argument.  When a callback
     * is registered, messages are no longer queued and `recv()` will always
     * return `undefined`.
     * @param {Function} callback
     */
    on_message(callback) {
        wasm.wasmtransport_on_message(this.__wbg_ptr, callback);
    }
    /**
     * Register a callback that is invoked when the connection state changes.
     *
     * The callback receives the new state as a `number` argument (see
     * `TransportState` enum values).
     * @param {Function} callback
     */
    on_state_change(callback) {
        wasm.wasmtransport_on_state_change(this.__wbg_ptr, callback);
    }
    /**
     * Attempt to reconnect using the previously supplied URL.
     *
     * # Errors
     *
     * Returns a `JsValue` error if no URL has been set (i.e. `connect` was
     * never called) or if the WebSocket cannot be created.
     */
    reconnect() {
        const ret = wasm.wasmtransport_reconnect(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Receive the next queued inbound message.
     *
     * Returns `undefined` in JS if no messages are queued.  If an
     * `on_message` callback is registered, messages are delivered there
     * instead of being queued.
     * @returns {Uint8Array | undefined}
     */
    recv() {
        const ret = wasm.wasmtransport_recv(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Send binary data over the WebSocket.
     *
     * # Errors
     *
     * Returns a `JsValue` error if the WebSocket is not in the `Connected`
     * state or the send fails.
     * @param {Uint8Array} data
     */
    send(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtransport_send(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Return the current connection state.
     * @returns {TransportState}
     */
    state() {
        const ret = wasm.wasmtransport_state(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmTransport.prototype[Symbol.dispose] = WasmTransport.prototype.free;

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
 * @returns {any}
 */
export function generate_identity() {
    const ret = wasm.generate_identity();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Initialize the WASM environment.
 *
 * Sets up `console_error_panic_hook` so that Rust panics produce readable
 * stack traces in the browser console instead of the default
 * "unreachable executed" message.
 *
 * Safe to call multiple times; only the first invocation has any effect.
 */
export function init() {
    wasm.init();
}

/**
 * Parse a TOML configuration string and return a JS object.
 *
 * This is a convenience function for quick config inspection without
 * creating a full `WasmConfig` instance.
 *
 * # Errors
 *
 * Returns a `JsValue` error if the TOML is malformed or fails validation.
 * @param {string} toml_str
 * @returns {any}
 */
export function parse_config(toml_str) {
    const ptr0 = passStringToWasm0(toml_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.parse_config(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Derive a `.peer` name from a public key (raw bytes).
 *
 * The public key is hashed with BLAKE3 to produce a 32-byte fingerprint,
 * which is then bech32m-encoded with the `frtun` HRP and `.peer` suffix.
 * @param {Uint8Array} pubkey
 * @returns {string}
 */
export function peer_name_from_pubkey(pubkey) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(pubkey, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.peer_name_from_pubkey(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Initialize the WASM module.
 *
 * Sets up panic hooks for better error messages.  This is called
 * automatically by `WasmClient::new()`, but can also be called
 * explicitly before using other functions.
 */
export function wasm_main() {
    wasm.wasm_main();
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_83742b46f01ce22d: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_debug_string_5398f5bb970e0daa: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_3c846841762788c1: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_781bc9f159099513: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_7ef6b97b02428fae: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_52709e72fb9f179c: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_6b5b6b8576d35cb1: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_buffer_60b8043cd926067d: function(arg0) {
            const ret = arg0.buffer;
            return ret;
        },
        __wbg_call_2d781c1f4d5c0ef8: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_close_af26905c832a88cb: function() { return handleError(function (arg0) {
            arg0.close();
        }, arguments); },
        __wbg_code_aea376e2d265a64f: function(arg0) {
            const ret = arg0.code;
            return ret;
        },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_data_a3d9ff9cdd801002: function(arg0) {
            const ret = arg0.data;
            return ret;
        },
        __wbg_error_8d9a8e04cd1d3588: function(arg0) {
            console.error(arg0);
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_instanceof_ArrayBuffer_101e2bf31071a9f6: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_length_ea16607d7b61445b: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_log_524eedafa26daa59: function(arg0) {
            console.log(arg0);
        },
        __wbg_message_67f6368dc2a526af: function(arg0, arg1) {
            const ret = arg1.message;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_49d5571bd3f0c4d4: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_5f486cdf45a04d78: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_a70fbab9066b301f: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_ab79df5bd7c26067: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_dd50bcc3f60ba434: function() { return handleError(function (arg0, arg1) {
            const ret = new WebSocket(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_new_from_slice_22da9388ac046e50: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_with_length_825018a1616e9e55: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_d62e5099504357e6: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_e87b0e732085a946: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_reason_cbcb9911796c4714: function(arg0, arg1) {
            const ret = arg1.reason;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_send_0a82e94c7ac2c328: function() { return handleError(function (arg0, arg1) {
            arg0.send(arg1);
        }, arguments); },
        __wbg_set_282384002438957f: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_7eaa4f96924fd6b3: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_bf7251625df30a02: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_set_binaryType_3dcf8281ec100a8f: function(arg0, arg1) {
            arg0.binaryType = __wbindgen_enum_BinaryType[arg1];
        },
        __wbg_set_onclose_8da801226bdd7a7b: function(arg0, arg1) {
            arg0.onclose = arg1;
        },
        __wbg_set_onerror_901ca711f94a5bbb: function(arg0, arg1) {
            arg0.onerror = arg1;
        },
        __wbg_set_onmessage_6f80ab771bf151aa: function(arg0, arg1) {
            arg0.onmessage = arg1;
        },
        __wbg_set_onopen_34e3e24cf9337ddd: function(arg0, arg1) {
            arg0.onopen = arg1;
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_f207c857566db248: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_a068d24e39478a8a: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbg_warn_69424c2d92a2fa73: function(arg0) {
            console.warn(arg0);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 18, function: Function { arguments: [NamedExternref("CloseEvent")], shim_idx: 19, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h233e2746682202dc, wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 18, function: Function { arguments: [NamedExternref("ErrorEvent")], shim_idx: 19, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h233e2746682202dc, wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_1);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 18, function: Function { arguments: [NamedExternref("Event")], shim_idx: 19, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h233e2746682202dc, wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_2);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 18, function: Function { arguments: [NamedExternref("MessageEvent")], shim_idx: 19, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h233e2746682202dc, wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_3);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000008: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./frtun_wasm_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_1(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_1(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_2(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_2(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_3(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h0f24b0a6fa26b25b_3(arg0, arg1, arg2);
}


const __wbindgen_enum_BinaryType = ["blob", "arraybuffer"];
const WasmClientFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmclient_free(ptr >>> 0, 1));
const WasmConfigFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmconfig_free(ptr >>> 0, 1));
const WasmDnsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmdns_free(ptr >>> 0, 1));
const WasmMuxFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmmux_free(ptr >>> 0, 1));
const WasmNetStackFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmnetstack_free(ptr >>> 0, 1));
const WasmTransportFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmtransport_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => state.dtor(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            state.dtor(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('frtun_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
