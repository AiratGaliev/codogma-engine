import type { RuntimeDisposable, RuntimeTimeFrame, RuntimeTimeDomain } from "./common.js";

export type TweenPropertyValues<TTarget extends object> = Readonly<
  Partial<{
    [Key in keyof TTarget as TTarget[Key] extends number ? Key : never]: number;
  }>
>;

export type EasingFunction = (linearProgress: number) => number;
export type TweenStatus = "delayed" | "running" | "paused" | "completed" | "cancelled";

export interface TweenOptions {
  readonly durationSeconds: number;
  readonly delaySeconds?: number;
  /** Receives normalized progress 0..1 and must return a finite value. */
  readonly easing?: EasingFunction;
  /** Additional plays after the first; -1 means repeat indefinitely. */
  readonly repeat?: number;
  readonly repeatDelaySeconds?: number;
  readonly yoyo?: boolean;
  readonly timeDomain?: RuntimeTimeDomain;
  /** Aborting the owner signal cancels the tween and suppresses completion callbacks. */
  readonly signal?: AbortSignal;
  readonly onUpdate?: (progress: number) => void;
  readonly onComplete?: () => void;
}

export interface TweenHandle extends RuntimeDisposable {
  readonly status: TweenStatus;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface TweenService extends RuntimeDisposable {
  /** Numeric target properties only; values are absolute. Sequences/groups are outside v1. */
  to<TTarget extends object>(
    target: TTarget,
    properties: TweenPropertyValues<TTarget>,
    options: TweenOptions,
  ): TweenHandle;
  /** Consume the same immutable frame produced by TimeService.advance(). */
  update(frame: RuntimeTimeFrame): void;
}
