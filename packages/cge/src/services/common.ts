/** A runtime resource that can be deterministically released. */
export interface RuntimeDisposable {
  readonly isDisposed: boolean;
  dispose(): void;
}

/** An owned runtime resource whose teardown may complete asynchronously. */
export interface RuntimeAsyncDisposable {
  readonly isDisposed: boolean;
  dispose(): Promise<void>;
}

/** Time is shared by the host, scheduler and tween service; values are seconds. */
export type RuntimeTimeDomain = "scaled" | "unscaled";

/**
 * Immutable time snapshot produced once for each host-owned frame.
 * deltaSeconds is game-scaled; unscaledDeltaSeconds is the host delta as supplied.
 */
export interface RuntimeTimeFrame {
  readonly frameIndex: number;
  readonly deltaSeconds: number;
  readonly unscaledDeltaSeconds: number;
  readonly elapsedSeconds: number;
  readonly unscaledElapsedSeconds: number;
  readonly timeScale: number;
  readonly isPaused: boolean;
}
