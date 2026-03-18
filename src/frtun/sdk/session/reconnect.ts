/**
 * Automatic reconnection with exponential backoff and jitter.
 *
 * Used by `FrtunClient` to transparently re-establish the overlay connection
 * after transient transport failures. The manager can be configured with
 * custom delay bounds, jitter factor, and maximum retry count.
 */

/** Configuration options for the reconnection manager. */
export interface ReconnectOptions {
  /** Minimum delay between reconnection attempts in milliseconds (default: 1000). */
  minDelayMs?: number;
  /** Maximum delay between reconnection attempts in milliseconds (default: 30000). */
  maxDelayMs?: number;
  /** Jitter factor (0..1) applied to the computed delay (default: 0.3). */
  jitterFactor?: number;
  /** Maximum number of reconnection attempts before giving up (default: unlimited). */
  maxAttempts?: number;
  /** The async function to call to perform the reconnection. */
  onReconnect: () => Promise<void>;
  /** Called when the reconnection state changes. */
  onStateChange?: (reconnecting: boolean) => void;
  /** Called when reconnection is abandoned after exhausting all attempts. */
  onExhausted?: () => void;
}

/** Default values. */
const DEFAULT_MIN_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_JITTER_FACTOR = 0.3;

export class ReconnectManager {
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterFactor: number;
  private readonly maxAttempts: number;
  private readonly onReconnect: () => Promise<void>;
  private readonly onStateChange?: (reconnecting: boolean) => void;
  private readonly onExhausted?: () => void;

  /** Current number of consecutive reconnection attempts. */
  private attempts: number = 0;
  /** Whether we are currently in a reconnection cycle. */
  private _active: boolean = false;
  /** Handle for the current setTimeout, used for cancellation. */
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  /** Whether cancel() has been called. */
  private cancelled: boolean = false;

  constructor(options: ReconnectOptions) {
    this.minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.jitterFactor = options.jitterFactor ?? DEFAULT_JITTER_FACTOR;
    this.maxAttempts = options.maxAttempts ?? Infinity;
    this.onReconnect = options.onReconnect;
    this.onStateChange = options.onStateChange;
    this.onExhausted = options.onExhausted;
  }

  /**
   * Start the reconnection cycle.
   *
   * Begins attempting to reconnect with exponential backoff. If already
   * active, this is a no-op.
   */
  async start(): Promise<void> {
    if (this._active) {
      return;
    }
    this._active = true;
    this.cancelled = false;
    this.attempts = 0;
    this.onStateChange?.(true);

    await this.attemptLoop();
  }

  /**
   * Cancel the reconnection cycle.
   *
   * Stops any pending retry timer and prevents further attempts.
   */
  cancel(): void {
    this.cancelled = true;
    this._active = false;
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    this.onStateChange?.(false);
  }

  /**
   * Reset the attempt counter.
   *
   * Call this after a successful connection to reset backoff state.
   */
  reset(): void {
    this.attempts = 0;
    this._active = false;
    this.cancelled = false;
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /** Whether the manager is currently in a reconnection cycle. */
  get active(): boolean {
    return this._active;
  }

  /** Number of consecutive reconnection attempts so far. */
  get attemptCount(): number {
    return this.attempts;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Main loop that retries with increasing delays. */
  private async attemptLoop(): Promise<void> {
    while (this._active && !this.cancelled) {
      if (this.attempts >= this.maxAttempts) {
        this._active = false;
        this.onStateChange?.(false);
        this.onExhausted?.();
        return;
      }

      // Compute delay with exponential backoff and jitter.
      const delay = this.computeDelay(this.attempts);
      this.attempts++;

      // Wait for the computed delay.
      await this.sleep(delay);

      if (this.cancelled) {
        return;
      }

      try {
        await this.onReconnect();
        // Success -- stop the loop.
        this._active = false;
        this.onStateChange?.(false);
        return;
      } catch {
        // Failed -- the loop will continue with the next attempt.
      }
    }
  }

  /**
   * Compute the delay for a given attempt number.
   *
   * Uses exponential backoff clamped to `[minDelayMs, maxDelayMs]` with
   * additive jitter.
   */
  private computeDelay(attempt: number): number {
    // Base delay: min * 2^attempt, clamped to max.
    const exponential = Math.min(
      this.maxDelayMs,
      this.minDelayMs * Math.pow(2, attempt),
    );

    // Apply jitter: +/- (jitterFactor * delay).
    const jitterRange = exponential * this.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.max(0, Math.round(exponential + jitter));
  }

  /** Sleep for the given number of milliseconds, respecting cancellation. */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.timerHandle = setTimeout(() => {
        this.timerHandle = null;
        resolve();
      }, ms);
    });
  }
}
