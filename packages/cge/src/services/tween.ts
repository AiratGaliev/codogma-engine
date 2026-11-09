import type { RuntimeDisposable, RuntimeTimeFrame, RuntimeTimeDomain } from "./common.js";

type IfEquals<X, Y, Then = X, Else = never> = (
  <T>() => T extends X ? 1 : 2
) extends <T>() => T extends Y ? 1 : 2
  ? Then
  : Else;

type WritableNumericKeys<TTarget extends object> = {
  [Key in keyof TTarget]-?: TTarget[Key] extends number
    ? IfEquals<
        { [Property in Key]: TTarget[Key] },
        { -readonly [Property in Key]: TTarget[Key] },
        Key
      >
    : never;
}[keyof TTarget];

export type TweenPropertyValues<TTarget extends object> = Readonly<
  Partial<{
    [Key in WritableNumericKeys<TTarget>]: number;
  }>
>;

export type EasingFunction = (linearProgress: number) => number;
export type TweenStatus = "delayed" | "running" | "paused" | "completed" | "cancelled";

export interface TweenOptions {
  /** Finite and non-negative; zero completes on the first update. */
  readonly durationSeconds: number;
  /** Finite and non-negative; defaults to zero. */
  readonly delaySeconds?: number;
  /** Receives normalized progress 0..1 and must return a finite value. */
  readonly easing?: EasingFunction;
  /** Non-negative integer additional plays after the first; -1 means repeat indefinitely. Defaults to zero. */
  readonly repeat?: number;
  readonly yoyo?: boolean;
  /** Defaults to scaled time. */
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
  /** Numeric, writable target properties only; values are absolute. Sequences/groups are outside v1. */
  to<TTarget extends object>(
    target: TTarget,
    properties: TweenPropertyValues<TTarget>,
    options: TweenOptions,
  ): TweenHandle;
  /** Consume the same immutable frame produced by TimeService.advance(). */
  update(frame: RuntimeTimeFrame): void;
}
