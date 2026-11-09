import {
  assertRuntimeTimeFrame,
  type RuntimeDisposable,
  type RuntimeTimeFrame,
  type RuntimeTimeDomain,
} from "./common.js";

export interface TimeService extends RuntimeDisposable {
  readonly currentFrame: RuntimeTimeFrame;
  setPaused(paused: boolean): void;
  setTimeScale(scale: number): void;
  advance(unscaledDeltaSeconds: number): RuntimeTimeFrame;
}

export type ScheduledTaskStatus = "scheduled" | "paused" | "completed" | "cancelled";

export interface ScheduledTask extends RuntimeDisposable {
  readonly status: ScheduledTaskStatus;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface ScheduleOptions {
  readonly timeDomain?: RuntimeTimeDomain;
  readonly signal?: AbortSignal;
}

export interface Scheduler extends RuntimeDisposable {
  schedule(delaySeconds: number, callback: () => void, options?: ScheduleOptions): ScheduledTask;
  update(frame: RuntimeTimeFrame): void;
}

const INITIAL_FRAME: RuntimeTimeFrame = Object.freeze({
  frameIndex: 0,
  deltaSeconds: 0,
  unscaledDeltaSeconds: 0,
  elapsedSeconds: 0,
  unscaledElapsedSeconds: 0,
  timeScale: 1,
  isPaused: false,
});

class HostTimeService implements TimeService {
  private frame = INITIAL_FRAME;
  private paused = false;
  private scale = 1;
  private disposed = false;

  get isDisposed(): boolean { return this.disposed; }
  get currentFrame(): RuntimeTimeFrame { return this.frame; }

  setPaused(paused: boolean): void {
    this.assertUsable();
    if (typeof paused !== "boolean") throw new TypeError("Pause state must be a boolean.");
    this.paused = paused;
  }

  setTimeScale(scale: number): void {
    this.assertUsable();
    if (!Number.isFinite(scale) || scale < 0) {
      throw new RangeError("Time scale must be finite and non-negative.");
    }
    this.scale = scale;
  }

  advance(unscaledDeltaSeconds: number): RuntimeTimeFrame {
    this.assertUsable();
    if (!Number.isFinite(unscaledDeltaSeconds) || unscaledDeltaSeconds < 0) {
      throw new RangeError("Host delta must be finite and non-negative.");
    }
    if (this.frame.frameIndex >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("Runtime frame index exceeded the safe integer range.");
    }
    const deltaSeconds = this.paused ? 0 : unscaledDeltaSeconds * this.scale;
    const elapsedSeconds = this.frame.elapsedSeconds + deltaSeconds;
    const unscaledElapsedSeconds = this.frame.unscaledElapsedSeconds + unscaledDeltaSeconds;
    if (!Number.isFinite(deltaSeconds) || !Number.isFinite(elapsedSeconds) ||
        !Number.isFinite(unscaledElapsedSeconds)) {
      throw new RangeError("Host delta would overflow the runtime time context.");
    }
    this.frame = Object.freeze({
      frameIndex: this.frame.frameIndex + 1,
      deltaSeconds,
      unscaledDeltaSeconds,
      elapsedSeconds,
      unscaledElapsedSeconds,
      timeScale: this.scale,
      isPaused: this.paused,
    });
    return this.frame;
  }

  dispose(): void { this.disposed = true; }

  private assertUsable(): void {
    if (this.disposed) throw new Error("TimeService is disposed.");
  }
}

interface ScheduledTaskOwner {
  remove(task: HostScheduledTask): void;
}

class HostScheduledTask implements ScheduledTask {
  private state: ScheduledTaskStatus = "scheduled";
  private remainingSeconds: number;
  private readonly signal?: AbortSignal;
  private readonly onAbort?: () => void;
  readonly timeDomain: RuntimeTimeDomain;

  constructor(
    delaySeconds: number,
    private readonly callback: () => void,
    private readonly owner: ScheduledTaskOwner,
    options: ScheduleOptions,
  ) {
    this.remainingSeconds = delaySeconds;
    this.timeDomain = options.timeDomain ?? "scaled";
    this.signal = options.signal;
    if (this.signal) {
      this.onAbort = () => this.cancel();
      if (this.signal.aborted) this.state = "cancelled";
      else this.signal.addEventListener("abort", this.onAbort, { once: true });
    }
    if (this.state === "cancelled") this.release();
  }

  get isDisposed(): boolean { return this.state === "completed" || this.state === "cancelled"; }
  get status(): ScheduledTaskStatus { return this.state; }

  cancel(): void {
    if (this.isDisposed) return;
    this.state = "cancelled";
    this.release();
  }
  pause(): void { if (this.state === "scheduled") this.state = "paused"; }
  resume(): void { if (this.state === "paused") this.state = "scheduled"; }

  advance(deltaSeconds: number): void {
    if (this.state !== "scheduled") return;
    this.remainingSeconds -= deltaSeconds;
    if (this.remainingSeconds > 0) return;
    this.state = "completed";
    this.release();
    this.callback();
  }

  private release(): void {
    if (this.signal && this.onAbort) this.signal.removeEventListener("abort", this.onAbort);
    this.owner.remove(this);
  }
}

class HostScheduler implements Scheduler {
  private readonly tasks = new Set<HostScheduledTask>();
  private disposed = false;
  private updating = false;
  private lastFrameIndex = 0;

  get isDisposed(): boolean { return this.disposed; }

  schedule(delaySeconds: number, callback: () => void, options: ScheduleOptions = {}): ScheduledTask {
    this.assertUsable();
    if (!Number.isFinite(delaySeconds) || delaySeconds < 0) {
      throw new RangeError("Scheduled delay must be finite and non-negative.");
    }
    if (typeof callback !== "function") throw new TypeError("A scheduled task requires a callback.");
    const domain = options.timeDomain ?? "scaled";
    if (domain !== "scaled" && domain !== "unscaled") throw new TypeError("Unknown scheduled task time domain.");
    const task = new HostScheduledTask(delaySeconds, callback, {
      remove: (item) => this.tasks.delete(item),
    }, options);
    if (!task.isDisposed) this.tasks.add(task);
    return task;
  }

  update(frame: RuntimeTimeFrame): void {
    this.assertUsable();
    assertRuntimeTimeFrame(frame, this.lastFrameIndex);
    if (this.updating) throw new Error("Scheduler.update() is not re-entrant.");
    this.lastFrameIndex = frame.frameIndex;
    this.updating = true;
    const errors: unknown[] = [];
    try {
      for (const task of [...this.tasks]) {
        if (task.isDisposed || task.status !== "scheduled") continue;
        const delta = task.timeDomain === "unscaled" ? frame.unscaledDeltaSeconds : frame.deltaSeconds;
        try { task.advance(delta); } catch (error) { errors.push(error); }
      }
    } finally {
      this.updating = false;
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more scheduled callbacks failed.");
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.updating) throw new Error("Scheduler.dispose() cannot run during Scheduler.update().");
    this.disposed = true;
    for (const task of [...this.tasks]) task.cancel();
    this.tasks.clear();
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("Scheduler is disposed.");
  }
}

export function createTimeService(): TimeService { return new HostTimeService(); }
export function createScheduler(): Scheduler { return new HostScheduler(); }
