import type { RuntimeAsyncDisposable } from "./common.js";
import type { RuntimeMaybePromise } from "./scene-types.js";

export interface SceneLoadProgress {
  /** Monotonic progress fraction in the inclusive range 0..1. */
  readonly progress: number;
  readonly message?: string;
}

export interface SceneLoadRequest {
  readonly sceneId: string;
  /** Manager-owned signal; loaders stop work and roll back partial allocations when aborted. */
  readonly signal: AbortSignal;
  readonly onProgress?: (progress: SceneLoadProgress) => void;
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
