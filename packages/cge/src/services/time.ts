import type { RuntimeDisposable, RuntimeTimeFrame, RuntimeTimeDomain } from "./common.js";

export interface TimeService extends RuntimeDisposable {
  /** Snapshot for the latest host frame; frameIndex is zero before the first advance. */
  readonly currentFrame: RuntimeTimeFrame;
  setPaused(paused: boolean): void;
  /** Must be finite and non-negative. Zero freezes scaled time without stopping unscaled time. */
  setTimeScale(scale: number): void;
  /** Advance exactly once for a host-owned frame; the supplied delta is not silently clamped. */
  advance(unscaledDeltaSeconds: number): RuntimeTimeFrame;
}

export type ScheduledTaskStatus = "scheduled" | "paused" | "completed" | "cancelled";

export interface ScheduledTask extends RuntimeDisposable {
  readonly status: ScheduledTaskStatus;
  /** Idempotently cancels the callback, including when called from that callback. */
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface ScheduleOptions {
  readonly timeDomain?: RuntimeTimeDomain;
  /** Aborting the owner signal cancels this task. */
  readonly signal?: AbortSignal;
}

export interface Scheduler extends RuntimeDisposable {
  /** Schedule one callback after a finite, non-negative delay in seconds; timeDomain defaults to scaled. */
  schedule(delaySeconds: number, callback: () => void, options?: ScheduleOptions): ScheduledTask;
  /** Consume the same immutable frame produced by TimeService.advance(). */
  update(frame: RuntimeTimeFrame): void;
}
