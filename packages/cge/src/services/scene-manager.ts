import type { RuntimeAsyncDisposable } from "./common.js";
import type { RuntimeMaybePromise } from "./scene-types.js";

export interface SceneLoadProgress {
  /** Monotonic progress fraction in the inclusive range 0..1. */
  readonly progress: number;
  readonly message?: string;
}

/** An inactive runtime session produced by SceneLoader; it owns its scene-local resources. */
export interface RuntimeSceneSession {
  readonly sceneId: string;
  activate(): RuntimeMaybePromise<void>;
  deactivate(): RuntimeMaybePromise<void>;
  pause(): RuntimeMaybePromise<void>;
  resume(): RuntimeMaybePromise<void>;
  dispose(): RuntimeMaybePromise<void>;
}

export interface SceneLoader {
  /** Load and prepare an inactive session; honor abort before/during load and roll back partial allocations before rejecting. */
  load(request: SceneLoadRequest): Promise<RuntimeSceneSession>;
}

export interface SceneLoadRequest {
  readonly sceneId: string;
  /** Manager-owned signal; loaders stop work and roll back partial allocations when aborted. */
  readonly signal: AbortSignal;
  readonly onProgress?: (progress: SceneLoadProgress) => void;
}

export interface SceneSwitchOptions {
  /** Cancels this request before the activation commit begins. */
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SceneLoadProgress) => void;
}

export type SceneSwitchStatus = "activated" | "already-active" | "cancelled";

export interface SceneSwitchResult {
  readonly status: SceneSwitchStatus;
  readonly sceneId: string;
}

/** Owns at most one active session and delegates hydration to the injected SceneLoader. */
export interface SceneManager extends RuntimeAsyncDisposable {
  readonly activeSceneId: string | undefined;
  readonly isSwitching: boolean;
  switchTo(sceneId: string, options?: SceneSwitchOptions): Promise<SceneSwitchResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Cancels a pending switch and releases the active scene; manager remains reusable. */
  stop(): Promise<void>;
}

/** Explicit composition point: the SceneManager receives its Loader, never discovers or creates one. */
export interface SceneManagerFactory {
  create(loader: SceneLoader): SceneManager;
}

interface SwitchOperation {
  readonly controller: AbortController;
  readonly externalSignal?: AbortSignal;
  readonly onExternalAbort?: () => void;
  commitStarted: boolean;
  promise: Promise<SceneSwitchResult>;
}

class HostSceneManager implements SceneManager {
  private activeSession: RuntimeSceneSession | undefined;
  private pending: SwitchOperation | undefined;
  private commitPromise: Promise<void> | undefined;
  private disposed = false;
  private paused = false;
  private stopping: Promise<void> | undefined;
  private disposing?: Promise<void>;
  private lifecycleTail: Promise<void> = Promise.resolve();
  private readonly disposedSessions = new WeakSet<object>();

  constructor(private readonly loader: SceneLoader) {
    if (!loader || typeof loader.load !== "function") throw new TypeError("SceneManager requires an explicit SceneLoader.");
  }

  get isDisposed(): boolean { return this.disposed; }
  get activeSceneId(): string | undefined { return this.activeSession?.sceneId; }
  get isSwitching(): boolean { return this.pending !== undefined; }

  switchTo(sceneId: string, options: SceneSwitchOptions = {}): Promise<SceneSwitchResult> {
    this.assertAcceptingWork();
    if (typeof sceneId !== "string" || sceneId.trim().length === 0) {
      return Promise.reject(new TypeError("Scene ID must be a non-empty stable identifier."));
    }
    if (options.signal?.aborted) return Promise.resolve({ status: "cancelled", sceneId });

    const previous = this.pending;
    if (this.activeSession?.sceneId === sceneId && !previous?.commitStarted) {
      previous?.controller.abort(new Error("Pending scene request superseded by the already-active scene."));
      return Promise.resolve({ status: "already-active", sceneId });
    }
    if (previous && !previous.commitStarted) {
      previous.controller.abort(new Error("Scene request superseded by a newer request."));
    }

    const controller = new AbortController();
    const operation: SwitchOperation = {
      controller,
      ...(options.signal ? { externalSignal: options.signal } : {}),
      commitStarted: false,
      promise: Promise.resolve({ status: "cancelled", sceneId }),
    };
    if (options.signal) {
      const onExternalAbort = (): void => {
        if (!operation.commitStarted) controller.abort(options.signal?.reason);
      };
      (operation as { onExternalAbort?: () => void }).onExternalAbort = onExternalAbort;
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }
    this.pending = operation;

    operation.promise = this.runSwitch(operation, sceneId, options, previous);
    return operation.promise;
  }

  pause(): Promise<void> {
    this.assertAcceptingWork();
    return this.enqueueLifecycle(async () => {
      if (this.paused) return;
      await this.commitPromise;
      const active = this.activeSession;
      if (active) await active.pause();
      this.paused = true;
    });
  }

  resume(): Promise<void> {
    this.assertAcceptingWork();
    return this.enqueueLifecycle(async () => {
      if (!this.paused) return;
      await this.commitPromise;
      const active = this.activeSession;
      if (active) await active.resume();
      this.paused = false;
    });
  }

  stop(): Promise<void> {
    if (this.disposed) throw new Error("SceneManager is disposed.");
    if (this.stopping) return this.stopping;
    const pending = this.pending;
    if (pending && !pending.commitStarted) pending.controller.abort(new Error("SceneManager.stop() cancelled the pending load."));
    this.stopping = (async () => {
      const errors: unknown[] = [];
      try { await pending?.promise; } catch (error) { errors.push(error); }
      try { await this.commitPromise; } catch (error) { errors.push(error); }
      await this.lifecycleTail;
      const active = this.activeSession;
      this.activeSession = undefined;
      this.paused = false;
      if (active) {
        try { await this.deactivateAndDisposeSession(active); } catch (error) { errors.push(error); }
      }
      if (errors.length > 0) throw new AggregateError(errors, "SceneManager.stop() completed with cleanup errors.");
    })().finally(() => { this.stopping = undefined; });
    return this.stopping;
  }

  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.disposed = true;
    const pending = this.pending;
    if (pending && !pending.commitStarted) pending.controller.abort(new Error("SceneManager disposed."));
    this.disposing = (async () => {
      const errors: unknown[] = [];
      try { await this.stopping; } catch (error) { errors.push(error); }
      try { await pending?.promise; } catch (error) { errors.push(error); }
      try { await this.commitPromise; } catch (error) { errors.push(error); }
      await this.lifecycleTail;
      const active = this.activeSession;
      this.activeSession = undefined;
      this.paused = false;
      if (active) {
        try { await this.deactivateAndDisposeSession(active); } catch (error) { errors.push(error); }
      }
      if (errors.length > 0) throw new AggregateError(errors, "SceneManager disposal failed.");
    })();
    return this.disposing;
  }

  private async runSwitch(
    operation: SwitchOperation,
    sceneId: string,
    options: SceneSwitchOptions,
    previous: SwitchOperation | undefined,
  ): Promise<SceneSwitchResult> {
    let cleanupFailed = false;
    try {
      // A newer request arriving during an activation commit waits for that commit.
      if (previous?.commitStarted) {
        try { await previous.promise; } catch { /* The next request may recover to another scene. */ }
      }
      if (operation.controller.signal.aborted || this.disposed || this.pending !== operation) {
        return { status: "cancelled", sceneId };
      }
      if (this.activeSession?.sceneId === sceneId) return { status: "already-active", sceneId };

      const candidate = await this.loader.load({
        sceneId,
        signal: operation.controller.signal,
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      });
      if (!candidate || typeof candidate.sceneId !== "string" ||
          typeof candidate.activate !== "function" ||
          typeof candidate.deactivate !== "function" ||
          typeof candidate.pause !== "function" ||
          typeof candidate.resume !== "function" ||
          typeof candidate.dispose !== "function") {
        throw new TypeError("SceneLoader returned an invalid RuntimeSceneSession.");
      }
      if (candidate.sceneId !== sceneId) {
        try {
          await this.disposeSession(candidate);
        } catch (cleanupError) {
          cleanupFailed = true;
          throw new AggregateError([cleanupError], "A mismatched Scene candidate could not be disposed.");
        }
        throw new Error("SceneLoader returned a session for a different Scene ID.");
      }
      if (operation.controller.signal.aborted || this.disposed || this.pending !== operation) {
        try {
          await this.disposeSession(candidate);
        } catch (cleanupError) {
          cleanupFailed = true;
          throw new AggregateError([cleanupError], "A cancelled Scene candidate could not be disposed.");
        }
        return { status: "cancelled", sceneId };
      }

      // Complete pause/resume against the current owner before changing that owner.
      await this.lifecycleTail;
      if (operation.controller.signal.aborted || this.disposed || this.pending !== operation) {
        try {
          await this.disposeSession(candidate);
        } catch (cleanupError) {
          cleanupFailed = true;
          throw new AggregateError([cleanupError], "A cancelled Scene candidate could not be disposed.");
        }
        return { status: "cancelled", sceneId };
      }

      operation.commitStarted = true;
      const commit = this.commitCandidate(candidate);
      this.commitPromise = commit;
      try { await commit; } finally {
        if (this.commitPromise === commit) this.commitPromise = undefined;
      }
      return { status: "activated", sceneId };
    } catch (error) {
      if (!cleanupFailed && !operation.commitStarted && operation.controller.signal.aborted) {
        return { status: "cancelled", sceneId };
      }
      throw error;
    } finally {
      if (operation.externalSignal && operation.onExternalAbort) {
        operation.externalSignal.removeEventListener("abort", operation.onExternalAbort);
      }
      if (this.pending === operation) this.pending = undefined;
    }
  }

  private async commitCandidate(candidate: RuntimeSceneSession): Promise<void> {
    const previous = this.activeSession;
    if (previous === candidate) return;

    try {
      if (previous) await previous.deactivate();
      await candidate.activate();
      if (this.paused) await candidate.pause();
    } catch (activationError) {
      const rollbackErrors: unknown[] = [];
      try { await this.disposeSession(candidate); } catch (error) { rollbackErrors.push(error); }

      if (previous) {
        try {
          await previous.activate();
          if (this.paused) await previous.pause();
          this.activeSession = previous;
        } catch (restoreError) {
          rollbackErrors.push(restoreError);
          this.activeSession = undefined;
          try { await this.disposeSession(previous); } catch (error) { rollbackErrors.push(error); }
        }
      } else {
        this.activeSession = undefined;
      }

      if (rollbackErrors.length > 0) {
        throw new AggregateError([activationError, ...rollbackErrors], "Scene activation and rollback failed.");
      }
      throw activationError;
    }

    this.activeSession = candidate;
    if (previous) await this.disposeSession(previous);
  }

  private enqueueLifecycle(operation: () => Promise<void>): Promise<void> {
    const result = this.lifecycleTail.then(operation);
    this.lifecycleTail = result.catch(() => undefined);
    return result;
  }

  private async deactivateAndDisposeSession(session: RuntimeSceneSession): Promise<void> {
    const errors: unknown[] = [];
    try { await session.deactivate(); } catch (error) { errors.push(error); }
    try { await this.disposeSession(session); } catch (error) { errors.push(error); }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Active Scene deactivation or disposal failed.");
    }
  }

  private async disposeSession(session: RuntimeSceneSession): Promise<void> {
    if (this.disposedSessions.has(session)) return;
    this.disposedSessions.add(session);
    await session.dispose();
  }

  private assertAcceptingWork(): void {
    if (this.disposed) throw new Error("SceneManager is disposed.");
    if (this.stopping) throw new Error("SceneManager is stopping.");
  }
}

export function createSceneManager(loader: SceneLoader): SceneManager {
  return new HostSceneManager(loader);
}

export function createSceneManagerFactory(): SceneManagerFactory {
  return {
    create(loader: SceneLoader): SceneManager {
      return createSceneManager(loader);
    },
  };
}
