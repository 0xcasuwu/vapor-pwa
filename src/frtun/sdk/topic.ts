/**
 * TopicSubscription -- gossipsub pub/sub topic over the frtun overlay.
 *
 * Wraps the WASM gossip router to provide a high-level publish/subscribe
 * API. Messages are broadcast to all peers subscribed to the same topic
 * and deduplicated using BLAKE3 message IDs.
 */

import type { WasmClient } from './types';
import { FrtunError, FrtunErrorCode } from './types';

/** Callback signature for topic message handlers. */
export type TopicMessageHandler = (data: Uint8Array, from: string) => void;

export class TopicSubscription {
  /** The gossipsub topic string. */
  readonly topic: string;

  private readonly wasmClient: WasmClient;
  private readonly subscriptionId: number;
  private handler: TopicMessageHandler | null = null;
  private active: boolean = true;
  private pollHandle: ReturnType<typeof setTimeout> | null = null;

  /**
   * @internal
   * Construct a new TopicSubscription. Called by `FrtunClient.subscribeTopic()`.
   */
  constructor(wasmClient: WasmClient, subscriptionId: number, topic: string) {
    this.wasmClient = wasmClient;
    this.subscriptionId = subscriptionId;
    this.topic = topic;
  }

  /**
   * Publish a message to this topic.
   *
   * The message is broadcast to all peers subscribed to the topic via
   * the gossipsub mesh. The local node also receives the message if a
   * handler is registered.
   *
   * @param data - Payload bytes to broadcast.
   * @throws {FrtunError} If the subscription has been cancelled or the publish fails.
   */
  async publish(data: Uint8Array): Promise<void> {
    if (!this.active) {
      throw new FrtunError(
        FrtunErrorCode.TopicError,
        `Cannot publish to unsubscribed topic "${this.topic}"`,
      );
    }
    try {
      await this.wasmClient.publish_topic(this.subscriptionId, data);
    } catch (err) {
      throw new FrtunError(
        FrtunErrorCode.TopicError,
        `Publish to topic "${this.topic}" failed: ${String(err)}`,
      );
    }
  }

  /**
   * Register a handler for incoming messages on this topic.
   *
   * The handler receives the raw payload bytes and the sender's peer name.
   * Only one handler can be active; subsequent calls replace the previous one.
   *
   * @param handler - Callback invoked for each received message.
   */
  onMessage(handler: TopicMessageHandler): void {
    this.handler = handler;
    this.startPolling();
  }

  /**
   * Unsubscribe from this topic.
   *
   * Stops the message polling loop and tells the WASM gossip router to
   * leave the topic mesh.
   */
  unsubscribe(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.handler = null;
    if (this.pollHandle !== null) {
      clearTimeout(this.pollHandle);
      this.pollHandle = null;
    }
    try {
      this.wasmClient.unsubscribe_topic(this.subscriptionId);
    } catch {
      // Best-effort cleanup.
    }
  }

  /** Whether this subscription is still active. */
  get isActive(): boolean {
    return this.active;
  }

  /**
   * Internal polling loop that pulls messages from the WASM layer.
   *
   * The WASM gossip router queues incoming messages per subscription.
   * We poll cooperatively, yielding back to the browser event loop
   * between iterations.
   */
  private startPolling(): void {
    if (this.pollHandle !== null || !this.active) {
      return;
    }

    const poll = async (): Promise<void> => {
      if (!this.active || this.handler === null) {
        this.pollHandle = null;
        return;
      }

      try {
        const msg = await this.wasmClient.topic_next_message(this.subscriptionId);
        if (msg !== null && this.handler !== null) {
          this.handler(msg.data, msg.from);
          // If we got a message, immediately check for more.
          if (this.active) {
            this.pollHandle = setTimeout(() => { void poll(); }, 0);
            return;
          }
        }
      } catch {
        // Polling errors are non-fatal; the topic may have been
        // concurrently unsubscribed.
      }

      // No message available; back off before next poll.
      if (this.active) {
        this.pollHandle = setTimeout(() => { void poll(); }, 50);
      }
    };

    void poll();
  }
}
