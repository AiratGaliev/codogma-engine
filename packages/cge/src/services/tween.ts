import type { RuntimeDisposable, RuntimeTimeFrame, RuntimeTimeDomain } from "./common.js";
import { assertRuntimeTimeFrame } from "./frame-validation.js";

type IfEquals<X, Y, Then = X, Else = never> = (
  <T>() => T extends X ? 1 : 2
) extends <T>() => T extends Y ? 1 : 2 ? Then : Else;

type WritableNumericKeys<TTarget extends object> = {
  [Key in keyof TTarget]-?: TTarget[Key] extends number
    ? IfEquals<{ [Property in Key]: TTarget[Key] }, { -readonly [Property in Key]: TTarget[Key] }, Key>
    : never;
}[keyof TTarget];

export type TweenPropertyValues<TTarget extends object> = Readonly<
  Partial<{ [Key in WritableNumericKeys<TTarget>]: number }>
>;
export type EasingFunction = (linearProgress: number) => number;
export type TweenStatus = "delayed" | "running" | "paused" | "completed" | "cancelled";

export interface TweenOptions {
  readonly durationSeconds: number;
  readonly delaySeconds?: number;
  readonly easing?: EasingFunction;
  readonly repeat?: number;
  readonly yoyo?: boolean;
  readonly timeDomain?: RuntimeTimeDomain;
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
  to<TTarget extends object>(
    target: TTarget,
    properties: TweenPropertyValues<TTarget>,
    options: TweenOptions,
  ): TweenHandle;
  update(frame: RuntimeTimeFrame): void;
}

interface TweenTrack {
  readonly key: PropertyKey;
  readonly from: number;
  readonly to: number;
}

interface TweenOwner { remove(tween: HostTween): void; }

function ownDataNumber(target: object, key: PropertyKey): number {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor || !("value" in descriptor) || descriptor.writable !== true ||
      typeof descriptor.value !== "number" || !Number.isFinite(descriptor.value)) {
    throw new TypeError("Tween target properties must be own writable finite numeric data properties.");
  }
  return descriptor.value;
}

function writeTweenValue(target: object, key: PropertyKey, value: number): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor || !("value" in descriptor) || descriptor.writable !== true) {
    throw new TypeError("A tween target property is no longer writable.");
  }
  if (!Reflect.set(target, key, value)) throw new TypeError("A tween target property rejected an update.");
}

class HostTween implements TweenHandle {
  private state: TweenStatus;
  private elapsedSeconds = 0;
  private remainingDelay: number;
  private readonly signal?: AbortSignal;
  private readonly onAbort?: () => void;
  private readonly totalDuration: number;
  readonly timeDomain: RuntimeTimeDomain;

  constructor(
    private readonly target: object,
    private readonly tracks: readonly TweenTrack[],
    private readonly options: TweenOptions,
    private readonly owner: TweenOwner,
  ) {
    this.remainingDelay = options.delaySeconds ?? 0;
    this.state = this.remainingDelay > 0 ? "delayed" : "running";
    this.timeDomain = options.timeDomain ?? "scaled";
    this.signal = options.signal;
    const repeat = options.repeat ?? 0;
    this.totalDuration = options.durationSeconds * (repeat === -1 ? Number.POSITIVE_INFINITY : repeat + 1);
    if (repeat !== -1 && !Number.isFinite(this.totalDuration)) {
      throw new RangeError("Tween total duration exceeds the finite numeric range.");
    }
    if (this.signal) {
      this.onAbort = () => this.cancel();
      if (this.signal.aborted) this.state = "cancelled";
      else this.signal.addEventListener("abort", this.onAbort, { once: true });
    }
    if (this.state === "cancelled") this.release();
  }

  get isDisposed(): boolean { return this.state === "completed" || this.state === "cancelled"; }
  get status(): TweenStatus { return this.state; }

  cancel(): void {
    if (this.isDisposed) return;
    this.state = "cancelled";
    this.release();
  }
  pause(): void {
    if (this.state === "running" || this.state === "delayed") this.state = "paused";
  }
  resume(): void {
    if (this.state === "paused") this.state = this.remainingDelay > 0 ? "delayed" : "running";
  }

  advance(deltaSeconds: number): void {
    if (this.state !== "running" && this.state !== "delayed") return;
    let activeDelta = deltaSeconds;
    if (this.remainingDelay > 0) {
      if (activeDelta < this.remainingDelay) {
        this.remainingDelay -= activeDelta;
        return;
      }
      activeDelta -= this.remainingDelay;
      this.remainingDelay = 0;
      this.state = "running";
    }

    const duration = this.options.durationSeconds;
    const repeat = this.options.repeat ?? 0;
    if (duration === 0) {
      const lastReverse = this.options.yoyo === true && repeat % 2 === 1;
      this.applyProgress(lastReverse ? 0 : 1);
      this.finish();
      this.options.onUpdate?.(1);
      this.options.onComplete?.();
      return;
    }

    this.elapsedSeconds += activeDelta;
    if (!Number.isFinite(this.elapsedSeconds)) throw new RangeError("Tween elapsed time overflowed.");
    if (repeat !== -1 && this.elapsedSeconds >= this.totalDuration) {
      const lastReverse = this.options.yoyo === true && repeat % 2 === 1;
      this.applyProgress(lastReverse ? 0 : 1);
      this.finish();
      this.options.onUpdate?.(1);
      this.options.onComplete?.();
      return;
    }

    const cycleIndex = Math.floor(this.elapsedSeconds / duration);
    const cycleElapsed = this.elapsedSeconds - cycleIndex * duration;
    let progress = cycleElapsed / duration;
    if (this.options.yoyo === true && cycleIndex % 2 === 1) progress = 1 - progress;
    this.applyProgress(progress);
    this.options.onUpdate?.(progress);
  }

  private applyProgress(progress: number): void {
    const eased = (this.options.easing ?? identityEasing)(progress);
    if (!Number.isFinite(eased)) throw new RangeError("Tween easing must return a finite value.");
    for (const track of this.tracks) {
      const value = track.from + (track.to - track.from) * eased;
      if (!Number.isFinite(value)) throw new RangeError("Tween produced a non-finite target value.");
      writeTweenValue(this.target, track.key, value);
    }
  }

  private finish(): void {
    this.state = "completed";
    this.release();
  }

  private release(): void {
    if (this.signal && this.onAbort) this.signal.removeEventListener("abort", this.onAbort);
    this.owner.remove(this);
  }
}

function identityEasing(progress: number): number { return progress; }

class HostTweenService implements TweenService {
  private readonly tweens = new Set<HostTween>();
  private disposed = false;
  private updating = false;
  private lastFrameIndex = 0;

  get isDisposed(): boolean { return this.disposed; }

  to<TTarget extends object>(
    target: TTarget,
    properties: TweenPropertyValues<TTarget>,
    options: TweenOptions,
  ): TweenHandle {
    this.assertUsable();
    if ((typeof target !== "object" && typeof target !== "function") || target === null) {
      throw new TypeError("Tween target must be an object.");
    }
    if (!properties || typeof properties !== "object") throw new TypeError("Tween properties must be an object.");
    if (!options || typeof options !== "object") throw new TypeError("Tween options are required.");
    const duration = options.durationSeconds;
    const delay = options.delaySeconds ?? 0;
    const repeat = options.repeat ?? 0;
    if (!Number.isFinite(duration) || duration < 0 ||
        !Number.isFinite(delay) || delay < 0 ||
        (repeat !== -1 && (!Number.isSafeInteger(repeat) || repeat < 0))) {
      throw new RangeError("Tween duration, delay and repeat must satisfy the v1 bounds.");
    }
    const domain = options.timeDomain ?? "scaled";
    if (domain !== "scaled" && domain !== "unscaled") throw new TypeError("Unknown tween time domain.");
    if (options.yoyo !== undefined && typeof options.yoyo !== "boolean") {
      throw new TypeError("Tween yoyo must be a boolean.");
    }
    for (const callback of [options.easing, options.onUpdate, options.onComplete]) {
      if (callback !== undefined && typeof callback !== "function") {
        throw new TypeError("Tween callbacks must be functions.");
      }
    }
    if (repeat === -1 && duration === 0) {
      throw new RangeError("An infinitely repeating tween requires a positive duration.");
    }

    const descriptors = Object.getOwnPropertyDescriptors(properties);
    const tracks: TweenTrack[] = [];
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key as keyof typeof descriptors];
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "number" ||
          !Number.isFinite(descriptor.value)) {
        throw new TypeError("Tween destination values must be finite numeric data properties.");
      }
      tracks.push({ key, from: ownDataNumber(target, key), to: descriptor.value });
    }
    if (tracks.length === 0) throw new TypeError("A tween must animate at least one target property.");

    const tween = new HostTween(target, tracks, options, { remove: (item) => this.tweens.delete(item) });
    if (!tween.isDisposed) this.tweens.add(tween);
    return tween;
  }

  update(frame: RuntimeTimeFrame): void {
    this.assertUsable();
    assertRuntimeTimeFrame(frame, this.lastFrameIndex);
    if (this.updating) throw new Error("TweenService.update() is not re-entrant.");
    this.lastFrameIndex = frame.frameIndex;
    this.updating = true;
    const errors: unknown[] = [];
    try {
      for (const tween of [...this.tweens]) {
        if (tween.isDisposed) continue;
        const delta = tween.timeDomain === "unscaled" ? frame.unscaledDeltaSeconds : frame.deltaSeconds;
        try { tween.advance(delta); } catch (error) {
          tween.cancel();
          errors.push(error);
        }
      }
    } finally {
      this.updating = false;
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more tweens failed during update.");
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.updating) throw new Error("TweenService.dispose() cannot run during TweenService.update().");
    this.disposed = true;
    for (const tween of [...this.tweens]) tween.cancel();
    this.tweens.clear();
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("TweenService is disposed.");
  }
}

export function createTweenService(): TweenService { return new HostTweenService(); }
