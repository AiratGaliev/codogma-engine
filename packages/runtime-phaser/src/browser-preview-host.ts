import type Phaser from "phaser";
import {
  ComponentRegistry,
  ProjectSceneLoader,
  SceneLoaderError,
  createSceneManager,
  createTypedEventBus,
  type EventSubscribeOptions,
  type AssetReference,
  type EventSubscription,
  type ProjectDocumentV1,
  type ProjectSceneLoaderOptions,
  type SceneManager,
  createRuntimeEntityIdentity,
  createRuntimeComponentIdentity,
  isRuntimeIdentityInScope,
  type RuntimeIdentityScope,
  type RuntimeSelectionIdentity,
  type RuntimeEntityIdentity,
  type RuntimeComponentIdentity,
  type RuntimeComponentPropertyInspection,
  type RuntimeTransform,
  type TransformData,
  type NodeDocument,
  type ComponentInstanceDocument,
} from "@codogma/cge";
import {
  createPhaserRuntimeSceneLoader,
  type PhaserComponentViewFactory,
  type PhaserRuntimeSceneSession,
} from "./phaser-runtime-scene-loader.js";
import type { PhaserRuntimeDiagnostic } from "./errors.js";

export type BrowserPreviewState =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "failed"
  | "disposed";

export type BrowserPreviewLogLevel = "debug" | "info" | "warn" | "error";

export interface BrowserPreviewStateChange {
  readonly previous: BrowserPreviewState;
  readonly current: BrowserPreviewState;
  readonly sessionId: string | null;
}

export interface BrowserPreviewLogEvent {
  readonly sessionId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly level: BrowserPreviewLogLevel;
  readonly message: string;
}

export interface BrowserPreviewErrorEvent {
  readonly sessionId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly source: "host" | "core" | "phaser" | "module" | "compiler";
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly causeMessage?: string;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly entityId?: string;
  readonly componentInstanceId?: string;
  readonly nodeId?: string;
}

export interface BrowserPreviewHostEvents {
  "state-change": BrowserPreviewStateChange;
  log: BrowserPreviewLogEvent;
  error: BrowserPreviewErrorEvent;
  "runtime-selection": {
    readonly sessionId: string;
    readonly selection: RuntimeSelectionIdentity | null;
  };
}

export interface BrowserPreviewRuntimeComponentSnapshot {
  readonly identity: RuntimeComponentIdentity;
  readonly enabled: boolean;
  readonly started: boolean;
  readonly persistedEnabled: boolean;
  readonly persistedProperties: Readonly<Record<string, unknown>>;
  readonly properties: Readonly<Record<string, RuntimeComponentPropertyInspection>>;
}

export interface BrowserPreviewRuntimeNodeSnapshot {
  readonly identity: RuntimeEntityIdentity;
  readonly name: string;
  readonly active: boolean;
  readonly persistedActive: boolean;
  readonly runtimeTransform: Readonly<RuntimeTransform>;
  readonly persistedTransform: Readonly<TransformData>;
  readonly components: readonly BrowserPreviewRuntimeComponentSnapshot[];
  readonly children: readonly BrowserPreviewRuntimeNodeSnapshot[];
}

/** Immutable, session-scoped view; persisted and live values remain separate. */
export interface BrowserPreviewRuntimeSnapshot extends RuntimeIdentityScope {
  readonly nodes: readonly BrowserPreviewRuntimeNodeSnapshot[];
}

export interface BrowserPreviewModuleDiagnostic {
  readonly source: "compiler" | "module" | "core";
  readonly code: string | number;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly entityId?: string;
  readonly componentInstanceId?: string;
  readonly nodeId?: string;
}

export interface BrowserPreviewModuleResolutionContext {
  readonly project: ProjectDocumentV1;
  readonly sceneId: string;
  readonly signal: AbortSignal;
  /** Reads only Asset IDs/paths declared by the captured Project snapshot. */
  readonly readAssetDocument: ProjectSceneLoaderOptions["readAssetDocument"];
}

export interface BrowserPreviewModuleResolutionResult {
  /** Complete executable registry for this Project Preview, returned only when resolution succeeds. */
  readonly registry?: ComponentRegistry;
  readonly diagnostics: readonly BrowserPreviewModuleDiagnostic[];
}

interface BrowserPreviewHostBaseOptions {
  /** Phaser 4.2.1 runtime namespace. Injection keeps this package importable in Node tooling. */
  readonly phaser: typeof Phaser;
  /** Browser element owned by the external host; the Preview Host never creates an iframe or window. */
  readonly parent: HTMLElement;
  /** Captured when the host is created; later authoring edits require a new host/snapshot. */
  readonly project: ProjectDocumentV1;
  readonly sceneId: string;
  /** Host-owned, project-scoped Scene document access. Successfully read documents are cached per host. */
  readonly readAssetDocument: ProjectSceneLoaderOptions["readAssetDocument"];
  /** Explicit rendering providers keyed by the registered Component type ID. */
  readonly componentViewFactories?: Readonly<Record<string, PhaserComponentViewFactory>>;
  readonly width?: number;
  readonly height?: number;
  /** Rejects boot when Phaser never creates the Preview Scene; defaults to 15 seconds. */
  readonly startupTimeoutMs?: number;
  /**
   * Optional session-scoped module preflight. Run the Core module resolver and
   * TypeScript diagnostics here; the callback executes before Phaser Game boot.
   */
  readonly resolveComponentRegistry?: (
    context: BrowserPreviewModuleResolutionContext,
  ) => Promise<BrowserPreviewModuleResolutionResult>;
}

export type BrowserPreviewHostOptions = BrowserPreviewHostBaseOptions & (
  | { readonly registry: ComponentRegistry; readonly resolveComponentRegistry?: never }
  | { readonly registry?: never; readonly resolveComponentRegistry: NonNullable<BrowserPreviewHostBaseOptions["resolveComponentRegistry"]> }
);

export interface BrowserPreviewHost {
  readonly state: BrowserPreviewState;
  /** The current run's identity, including startup/failure diagnostics; null after Stop. */
  readonly sessionId: string | null;
  readonly projectId: string;
  readonly sceneId: string;
  /** Returns the current active/paused runtime only; never falls back to authoring data. */
  getRuntimeSnapshot(): BrowserPreviewRuntimeSnapshot | null;
  getRuntimeSelection(): RuntimeSelectionIdentity | null;
  /** Selects an exact live identity from the current Project/Scene/Preview scope. */
  selectRuntimeIdentity(identity: RuntimeSelectionIdentity): boolean;
  clearRuntimeSelection(): void;
  subscribe<TKey extends keyof BrowserPreviewHostEvents>(
    type: TKey,
    handler: (payload: BrowserPreviewHostEvents[TKey]) => void,
    options?: EventSubscribeOptions,
  ): EventSubscription;
  /** Emits a log only while a concrete Preview session is starting, running or paused. */
  log(level: BrowserPreviewLogLevel, message: string): boolean;
  play(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Stops the current runtime session and starts a fresh one from this host's captured inputs. */
  restart(): Promise<void>;
  /** Releases the runtime session but keeps the Phaser Game available for another Play. */
  stop(): Promise<void>;
  /** Updates the viewport immediately or stores the dimensions for the first Game boot. */
  resize(width: number, height: number): void;
  /** Terminal and idempotent. Destroys the Phaser Game and all host-owned runtime resources. */
  dispose(): Promise<void>;
}

let hostSequence = 0;

function snapshotComponentRegistry(source: ComponentRegistry): ComponentRegistry {
  const snapshot = new ComponentRegistry();
  for (const definition of source.list()) snapshot.register(definition);
  return snapshot;
}

function freezeProjectSnapshot<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeProjectSnapshot(child);
    }
    Object.freeze(value);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPreviewLogLevel(value: string): value is BrowserPreviewLogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Preview operation was cancelled.");
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (signal.aborted) reject(abortReason(signal));
        else resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

function validateViewport(width: number, height: number): void {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError("Preview viewport width and height must be finite positive numbers.");
  }
}

/**
 * Composes the native Core Scene Loader and Phaser view adapter into one
 * browser-owned Game. Core/Phaser remain the only simulation and frame owners.
 */
class BrowserPreviewHostImpl implements BrowserPreviewHost {
  private currentState: BrowserPreviewState = "idle";
  private currentSessionId: string | null = null;
  private runtimeSession: { readonly sessionId: string; readonly session: PhaserRuntimeSceneSession } | undefined;
  private runtimeSelection: RuntimeSelectionIdentity | null = null;
  private readonly events = createTypedEventBus<BrowserPreviewHostEvents>();
  private readonly documentSnapshots = new Map<string, string>();
  private readonly viewFactories: Readonly<Record<string, PhaserComponentViewFactory>>;
  private readonly hostId = "preview-" + (++hostSequence).toString(36);
  private readonly projectSnapshot?: ProjectDocumentV1;
  private registrySnapshot?: ComponentRegistry;
  private readonly snapshotError?: unknown;
  private viewport: { width: number; height: number };
  private game: Phaser.Game | undefined;
  private gameReadyPromise: Promise<SceneManager> | undefined;
  private failGameReady: ((error: unknown) => void) | undefined;
  private gameStartupTimer: ReturnType<typeof setTimeout> | undefined;
  private sceneManager: SceneManager | undefined;
  private unexpectedGameDestroyCleanup: Promise<void> | undefined;
  private readonly pendingStartControllers = new Set<AbortController>();
  private operationTail: Promise<void> = Promise.resolve();
  private disposePromise: Promise<void> | undefined;
  private disposeRequested = false;
  private expectedGameDestruction = false;
  private sessionErrorCounts = new Map<string, number>();
  private nextSessionSequence = 0;

  constructor(private readonly options: BrowserPreviewHostOptions) {
    if (!options || !options.phaser || typeof options.phaser.Game !== "function" ||
        typeof options.phaser.Scene !== "function" || !options.phaser.Core?.Events?.DESTROY ||
        !options.phaser.Scale || options.phaser.Scale.RESIZE === undefined) {
      throw new TypeError("BrowserPreviewHost requires the Phaser 4 Game, Scene, DESTROY event and RESIZE scale APIs.");
    }
    if (!options.parent || typeof options.parent !== "object") {
      throw new TypeError("BrowserPreviewHost requires an existing browser parent element.");
    }
    if (options.registry && options.resolveComponentRegistry) {
      throw new TypeError("Provide either a ComponentRegistry or a session-scoped Component module resolver, not both.");
    }
    if ((!options.registry || typeof options.registry.list !== "function") && !options.resolveComponentRegistry) {
      throw new TypeError("BrowserPreviewHost requires a ComponentRegistry or a session-scoped module resolver.");
    }
    if (typeof options.readAssetDocument !== "function") {
      throw new TypeError("BrowserPreviewHost requires a host-owned Scene document provider.");
    }
    if (typeof options.sceneId !== "string" || options.sceneId.trim().length === 0) {
      throw new TypeError("BrowserPreviewHost requires a stable target Scene ID.");
    }

    const width = options.width ?? 800;
    const height = options.height ?? 600;
    validateViewport(width, height);
    const startupTimeoutMs = options.startupTimeoutMs ?? 15_000;
    if (!Number.isFinite(startupTimeoutMs) || startupTimeoutMs < 1 || startupTimeoutMs > 60_000) {
      throw new RangeError("Preview startupTimeoutMs must be between 1 and 60000.");
    }
    this.viewport = { width, height };
    this.viewFactories = Object.freeze({ ...(options.componentViewFactories ?? {}) });

    // Capture both persisted data and executable registrations now, not on the
    // first Play. Invalid input is surfaced as a session-scoped startup error.
    try {
      this.projectSnapshot = freezeProjectSnapshot(
        JSON.parse(JSON.stringify(options.project)) as ProjectDocumentV1,
      );
      if (options.registry) this.registrySnapshot = snapshotComponentRegistry(options.registry);
    } catch (error) {
      this.snapshotError = error;
    }
  }

  get state(): BrowserPreviewState { return this.currentState; }
  get sessionId(): string | null { return this.currentSessionId; }
  get projectId(): string {
    const id = (this.projectSnapshot ?? this.options.project)?.id;
    return typeof id === "string" && id.length > 0 ? id : "unknown-project";
  }
  get sceneId(): string { return this.options.sceneId; }

  getRuntimeSnapshot(): BrowserPreviewRuntimeSnapshot | null {
    const runtime = this.runtimeSession;
    const sessionId = this.currentSessionId;
    if (!runtime || !sessionId || runtime.sessionId !== sessionId ||
        !["running", "paused"].includes(this.currentState) ||
        runtime.session.isDisposed || !runtime.session.coreSession.isActive) {
      return null;
    }

    const graph = runtime.session.coreSession.graph;
    const nodeDocuments = new Map<string, NodeDocument>();
    const componentDocuments = new Map<string, { readonly nodeId: string; readonly document: ComponentInstanceDocument }>();
    const indexDocuments = (nodes: readonly NodeDocument[]): void => {
      for (const node of nodes) {
        nodeDocuments.set(node.id, node);
        for (const component of node.components) {
          componentDocuments.set(component.id, { nodeId: node.id, document: component });
        }
        indexDocuments(node.children);
      }
    };
    indexDocuments(graph.document.rootNodes);

    const scope: RuntimeIdentityScope = {
      projectId: this.projectId,
      sceneId: this.sceneId,
      sessionId,
    };
    const materialize = (node: typeof graph.rootNodes[number]): BrowserPreviewRuntimeNodeSnapshot | undefined => {
      const persistedNode = nodeDocuments.get(node.id);
      if (!persistedNode) return undefined;

      const components: BrowserPreviewRuntimeComponentSnapshot[] = [];
      for (const componentInstanceId of node.componentInstanceIds) {
        const source = componentDocuments.get(componentInstanceId);
        const runtimeComponent = graph.getComponent(componentInstanceId);
        const inspected = runtime.session.coreSession.world.inspectComponent(componentInstanceId);
        if (!source || source.nodeId !== node.id || !runtimeComponent ||
            runtimeComponent.nodeId !== node.id || source.document.typeId !== runtimeComponent.typeId ||
            !inspected || inspected.nodeId !== node.id || inspected.typeId !== runtimeComponent.typeId) {
          return undefined;
        }
        components.push(Object.freeze({
          identity: createRuntimeComponentIdentity(scope, node.id, componentInstanceId, runtimeComponent.typeId),
          enabled: runtimeComponent.enabled,
          started: runtimeComponent.started,
          persistedEnabled: source.document.enabled,
          persistedProperties: source.document.properties,
          properties: inspected.properties,
        }));
      }

      const children: BrowserPreviewRuntimeNodeSnapshot[] = [];
      for (const child of node.children) {
        const snapshot = materialize(child);
        if (!snapshot) return undefined;
        children.push(snapshot);
      }

      return Object.freeze({
        identity: createRuntimeEntityIdentity(scope, node.id),
        name: node.name,
        active: node.active,
        persistedActive: persistedNode.active,
        runtimeTransform: Object.freeze({ ...node.transform }),
        persistedTransform: Object.freeze({ ...persistedNode.transform }),
        components: Object.freeze(components),
        children: Object.freeze(children),
      });
    };

    const nodes: BrowserPreviewRuntimeNodeSnapshot[] = [];
    for (const root of graph.rootNodes) {
      const snapshot = materialize(root);
      if (!snapshot) return null;
      nodes.push(snapshot);
    }
    return Object.freeze({ ...scope, nodes: Object.freeze(nodes) });
  }

  getRuntimeSelection(): RuntimeSelectionIdentity | null {
    const selection = this.runtimeSelection;
    const snapshot = this.getRuntimeSnapshot();
    if (!selection || !snapshot || !isRuntimeIdentityInScope(selection, snapshot)) return null;
    return this.findRuntimeIdentity(snapshot.nodes, selection) ?? null;
  }

  selectRuntimeIdentity(identity: RuntimeSelectionIdentity): boolean {
    const snapshot = this.getRuntimeSnapshot();
    if (!snapshot || !isRuntimeIdentityInScope(identity, snapshot)) return false;
    const canonical = this.findRuntimeIdentity(snapshot.nodes, identity);
    if (!canonical) return false;
    this.runtimeSelection = canonical;
    this.emit("runtime-selection", Object.freeze({
      sessionId: snapshot.sessionId,
      selection: canonical,
    }));
    return true;
  }

  clearRuntimeSelection(): void {
    const previous = this.runtimeSelection;
    if (!previous) return;
    this.runtimeSelection = null;
    this.emit("runtime-selection", Object.freeze({
      sessionId: previous.sessionId,
      selection: null,
    }));
  }

  private findRuntimeIdentity(
    nodes: readonly BrowserPreviewRuntimeNodeSnapshot[],
    candidate: RuntimeSelectionIdentity,
  ): RuntimeSelectionIdentity | undefined {
    for (const node of nodes) {
      if (candidate.kind === "node" && node.identity.nodeId === candidate.nodeId) return node.identity;
      if (candidate.nodeId === node.identity.nodeId && candidate.kind === "component") {
        const component = node.components.find((item) =>
          item.identity.componentInstanceId === candidate.componentInstanceId &&
          item.identity.typeId === candidate.typeId,
        );
        if (component) return component.identity;
      }
      const nested = this.findRuntimeIdentity(node.children, candidate);
      if (nested) return nested;
    }
    return undefined;
  }

  private handleRuntimeSessionCreated(session: PhaserRuntimeSceneSession): void {
    const sessionId = this.currentSessionId;
    if (!sessionId || this.disposeRequested) return;
    this.runtimeSession = { sessionId, session };
    this.runtimeSelection = null;
    this.emit("runtime-selection", Object.freeze({ sessionId, selection: null }));
  }

  private handleRuntimeSessionDisposed(session: PhaserRuntimeSceneSession): void {
    const current = this.runtimeSession;
    if (!current || current.session !== session) return;
    this.runtimeSession = undefined;
    this.clearRuntimeSelection();
  }

  subscribe<TKey extends keyof BrowserPreviewHostEvents>(
    type: TKey,
    handler: (payload: BrowserPreviewHostEvents[TKey]) => void,
    options?: EventSubscribeOptions,
  ): EventSubscription {
    return this.events.subscribe(type, handler, options);
  }

  log(level: BrowserPreviewLogLevel, message: string): boolean {
    if (!isPreviewLogLevel(level)) throw new TypeError("Preview log level must be debug, info, warn or error.");
    if (typeof message !== "string") throw new TypeError("Preview log message must be a string.");
    const sessionId = this.currentSessionId;
    if (!sessionId || !["starting", "running", "paused"].includes(this.currentState)) return false;
    this.emit("log", Object.freeze({
      sessionId,
      projectId: this.projectId,
      sceneId: this.sceneId,
      level,
      message,
    }));
    return true;
  }

  play(): Promise<void> {
    this.assertNotDisposing();
    const controller = new AbortController();
    return this.enqueueStart(controller, (signalOwner) => this.startInternal(signalOwner));
  }

  pause(): Promise<void> {
    this.assertNotDisposing();
    return this.enqueue(async () => {
      if (this.currentState !== "running") return;
      const manager = this.sceneManager;
      if (!manager) throw new Error("The active Preview session has no Scene Manager.");
      try {
        await manager.pause();
        this.setState("paused");
      } catch (error) {
        this.reportError(error, "PREVIEW_PAUSE_FAILED", "host");
        throw error;
      }
    });
  }

  resume(): Promise<void> {
    this.assertNotDisposing();
    return this.enqueue(async () => {
      if (this.currentState !== "paused") return;
      const manager = this.sceneManager;
      if (!manager) throw new Error("The paused Preview session has no Scene Manager.");
      try {
        await manager.resume();
        this.setState("running");
      } catch (error) {
        this.reportError(error, "PREVIEW_RESUME_FAILED", "host");
        throw error;
      }
    });
  }

  restart(): Promise<void> {
    this.assertNotDisposing();
    this.abortPendingStarts(new Error("Preview restart superseded earlier Play/Restart requests."));
    const controller = new AbortController();
    return this.enqueueStart(controller, (signalOwner) => this.restartInternal(signalOwner));
  }

  stop(): Promise<void> {
    this.assertNotDisposing();
    this.abortPendingStarts(new Error("Preview Stop cancelled earlier Play/Restart requests."));
    return this.enqueue(() => this.stopInternal());
  }

  resize(width: number, height: number): void {
    this.assertNotDisposing();
    validateViewport(width, height);
    this.viewport = { width, height };
    this.game?.scale.resize(width, height);
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposeRequested = true;
    this.abortPendingStarts(new Error("Preview Host is being disposed."));
    this.disposePromise = this.enqueue(() => this.disposeInternal());
    return this.disposePromise;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private enqueueStart(
    controller: AbortController,
    operation: (controller: AbortController) => Promise<void>,
  ): Promise<void> {
    this.pendingStartControllers.add(controller);
    return this.enqueue(async () => {
      try {
        await operation(controller);
      } finally {
        this.pendingStartControllers.delete(controller);
      }
    });
  }

  private abortPendingStarts(reason: Error): void {
    for (const controller of this.pendingStartControllers) controller.abort(reason);
  }

  private async startInternal(controller: AbortController): Promise<void> {
    const signal = controller.signal;
    if (signal.aborted || this.disposeRequested) return;
    if (this.currentState === "running") return;
    if (this.currentState === "paused") {
      const manager = this.sceneManager;
      if (!manager) throw new Error("The paused Preview session has no Scene Manager.");
      await manager.resume();
      this.setState("running");
      return;
    }

    const sessionId = this.createSessionId();
    this.currentSessionId = sessionId;
    this.sessionErrorCounts.clear();
    this.sessionErrorCounts.set(sessionId, 0);
    this.setState("starting");
    try {
      await awaitWithAbort(this.ensureRegistry(signal), signal);
      const manager = await awaitWithAbort(this.ensureGame(), signal);
      if (signal.aborted || this.disposeRequested) return;
      const result = await manager.switchTo(this.sceneId, { signal });
      if (signal.aborted || result.status === "cancelled" || this.disposeRequested) return;
      this.setState("running");
    } catch (error) {
      if (signal.aborted || this.disposeRequested) return;
      if ((this.sessionErrorCounts.get(sessionId) ?? 0) === 0) {
        this.reportError(
          error,
          "PREVIEW_START_FAILED",
          this.registrySnapshot ? "phaser" : "module",
        );
      }
      if (!this.sceneManager && this.game) {
        try {
          this.expectedGameDestruction = true;
          await this.destroyGame();
        } catch (cleanupError) {
          this.reportError(cleanupError, "PREVIEW_START_ROLLBACK_FAILED", "host");
        } finally {
          this.expectedGameDestruction = false;
        }
      }
      this.setState("failed");
      throw error;
    }
  }

  private async restartInternal(controller: AbortController): Promise<void> {
    const signal = controller.signal;
    const previousSessionId = this.currentSessionId;
    if (previousSessionId) {
      this.setState("stopping");
    } else {
      const initialSessionId = this.createSessionId();
      this.currentSessionId = initialSessionId;
      this.sessionErrorCounts.clear();
      this.sessionErrorCounts.set(initialSessionId, 0);
      this.setState("starting");
    }
    try {
      await awaitWithAbort(this.ensureRegistry(signal), signal);
      const manager = await awaitWithAbort(this.ensureGame(), signal);
      if (signal.aborted || this.disposeRequested) return;
      await manager.stop();
      if (signal.aborted || this.disposeRequested) return;
      if (previousSessionId) {
        const restartedSessionId = this.createSessionId();
        this.currentSessionId = restartedSessionId;
        this.sessionErrorCounts.clear();
        this.sessionErrorCounts.set(restartedSessionId, 0);
        this.setState("starting");
      }
      const result = await manager.switchTo(this.sceneId, { signal });
      if (result.status === "cancelled" || signal.aborted || this.disposeRequested) return;
      this.setState("running");
    } catch (error) {
      if (signal.aborted || this.disposeRequested) return;
      const sessionId = this.currentSessionId;
      if (sessionId && (this.sessionErrorCounts.get(sessionId) ?? 0) === 0) {
        this.reportError(
          error,
          "PREVIEW_RESTART_FAILED",
          this.registrySnapshot ? "phaser" : "module",
        );
      }
      if (!this.sceneManager && this.game) {
        try {
          this.expectedGameDestruction = true;
          await this.destroyGame();
        } catch (cleanupError) {
          this.reportError(cleanupError, "PREVIEW_RESTART_ROLLBACK_FAILED", "host");
        } finally {
          this.expectedGameDestruction = false;
        }
      }
      this.setState("failed");
      throw error;
    }
  }

  private async stopInternal(): Promise<void> {
    if (this.currentState === "stopped" && !this.currentSessionId) return;
    if (this.currentState === "idle" && !this.sceneManager && !this.game) {
      this.currentSessionId = null;
      this.setState("stopped");
      return;
    }

    this.setState("stopping");
    try {
      // External Phaser Game destruction starts SceneManager.dispose() from
      // the Scene event callback. Stop is a lifecycle barrier and must not
      // report "stopped" until that asynchronous teardown has completed.
      await this.unexpectedGameDestroyCleanup;
      await this.sceneManager?.stop();
      // If Stop races Phaser boot before Scene.create, there is no usable
      // Scene Manager to reuse. Destroy that partial Game instead of retaining
      // a host with a pending boot and no runtime lifecycle owner.
      if (!this.sceneManager && this.game) {
        this.expectedGameDestruction = true;
        try {
          await this.destroyGame();
        } finally {
          this.expectedGameDestruction = false;
        }
      }
      this.currentSessionId = null;
      this.runtimeSession = undefined;
      this.clearRuntimeSelection();
      this.setState("stopped");
    } catch (error) {
      this.reportError(error, "PREVIEW_STOP_FAILED", "host");
      this.setState("failed");
      throw error;
    }
  }

  private async disposeInternal(): Promise<void> {
    if (this.currentState !== "disposed") this.setState("stopping");
    const errors: unknown[] = [];
    const manager = this.sceneManager;
    this.sceneManager = undefined;
    if (manager) {
      try {
        await manager.dispose();
      } catch (error) {
        errors.push(error);
        this.reportError(error, "PREVIEW_DISPOSE_FAILED", "host");
      }
    }
    try {
      await this.unexpectedGameDestroyCleanup;
    } catch (error) {
      errors.push(error);
      this.reportError(error, "PREVIEW_UNEXPECTED_GAME_DESTROY_CLEANUP_FAILED", "host");
    }

    try {
      await this.destroyGame();
    } catch (error) {
      errors.push(error);
      this.reportError(error, "PREVIEW_GAME_DESTROY_FAILED", "host");
    }

    this.currentSessionId = null;
    this.runtimeSession = undefined;
    this.clearRuntimeSelection();
    this.gameReadyPromise = undefined;
    this.setState("disposed");
    this.events.dispose();
    this.sessionErrorCounts.clear();
    this.documentSnapshots.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "Browser Preview Host disposal failed.");
    }
  }

  private ensureGame(): Promise<SceneManager> {
    if (this.unexpectedGameDestroyCleanup) {
      return this.unexpectedGameDestroyCleanup.then(() => this.ensureGame());
    }
    if (this.sceneManager) return Promise.resolve(this.sceneManager);
    if (this.gameReadyPromise) return this.gameReadyPromise;

    let resolveReady!: (manager: SceneManager) => void;
    let rejectReady!: (error: unknown) => void;
    let readySettled = false;
    const ready = new Promise<SceneManager>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const failReady = (error: unknown): void => {
      if (readySettled) return;
      readySettled = true;
      this.clearGameStartupTimer();
      if (this.failGameReady === failReady) this.failGameReady = undefined;
      rejectReady(error);
    };
    const completeReady = (manager: SceneManager): void => {
      if (readySettled) return;
      readySettled = true;
      this.clearGameStartupTimer();
      if (this.failGameReady === failReady) this.failGameReady = undefined;
      resolveReady(manager);
    };
    this.gameReadyPromise = ready;
    this.failGameReady = failReady;
    this.gameStartupTimer = setTimeout(() => {
      failReady(new Error("Phaser did not create the Preview Scene before the startup timeout."));
    }, this.options.startupTimeoutMs ?? 15_000);

    const host = this;
    class PreviewScene extends this.options.phaser.Scene {
      create(): void {
        if (readySettled) return;
        if (host.disposeRequested || host.expectedGameDestruction) {
          failReady(new Error("Preview Host stopped before the Phaser Scene became ready."));
          return;
        }
        try {
          const coreLoader = host.createCoreLoader();
          const runtimeLoader = createPhaserRuntimeSceneLoader(this, coreLoader, {
            projectId: host.projectId,
            componentViewFactories: host.viewFactories,
            onDiagnostic: (diagnostic) => host.handlePhaserDiagnostic(diagnostic),
            onSessionCreated: (session) => host.handleRuntimeSessionCreated(session),
            onSessionDisposed: (session) => host.handleRuntimeSessionDisposed(session),
          });
          const manager = createSceneManager(runtimeLoader);
          host.sceneManager = manager;
          completeReady(manager);
        } catch (error) {
          failReady(error);
        }
      }
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: this.options.phaser.AUTO,
      parent: this.options.parent,
      width: this.viewport.width,
      height: this.viewport.height,
      scale: {
        mode: this.options.phaser.Scale.RESIZE,
        width: this.viewport.width,
        height: this.viewport.height,
      },
      scene: PreviewScene,
    };

    try {
      const game = new this.options.phaser.Game(config);
      this.game = game;
      game.events.once(this.options.phaser.Core.Events.DESTROY, () => this.handleGameDestroyed(game));
    } catch (error) {
      this.gameReadyPromise = undefined;
      failReady(error);
    }
    return ready;
  }

  private async ensureRegistry(signal: AbortSignal): Promise<ComponentRegistry> {
    if (this.snapshotError !== undefined) throw this.snapshotError;
    if (this.registrySnapshot) return this.registrySnapshot;
    if (!this.projectSnapshot || !this.options.resolveComponentRegistry) {
      throw new Error("Preview Component module resolution is not configured.");
    }

    const result = await this.options.resolveComponentRegistry({
      project: this.projectSnapshot,
      sceneId: this.sceneId,
      signal,
      readAssetDocument: (asset, assetSignal) => this.readProjectAssetDocument(asset, assetSignal),
    });
    if (signal.aborted) throw abortReason(signal);

    let errorCount = 0;
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.severity === "error") {
        errorCount += 1;
        const sessionId = this.currentSessionId;
        if (!sessionId) continue;
        this.publishError({
          sessionId,
          projectId: this.projectId,
          sceneId: this.sceneId,
          source: diagnostic.source,
          code: String(diagnostic.code),
          severity: "error",
          message: diagnostic.message,
          ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
          ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
          ...(diagnostic.column === undefined ? {} : { column: diagnostic.column }),
          ...(diagnostic.entityId === undefined ? {} : { entityId: diagnostic.entityId }),
          ...(diagnostic.componentInstanceId === undefined ? {} : { componentInstanceId: diagnostic.componentInstanceId }),
          ...(diagnostic.nodeId === undefined ? {} : { nodeId: diagnostic.nodeId }),
        });
      } else {
        const sessionId = this.currentSessionId;
        if (!sessionId) continue;
        this.emit("log", Object.freeze({
          sessionId,
          projectId: this.projectId,
          sceneId: this.sceneId,
          level: diagnostic.severity === "warning" ? "warn" : "info",
          message: [
            diagnostic.path,
            diagnostic.line === undefined ? undefined : String(diagnostic.line),
            diagnostic.column === undefined ? undefined : String(diagnostic.column),
            diagnostic.message,
          ].filter(Boolean).join(": "),
        }));
      }
    }
    if (errorCount > 0) throw new Error("Preview Component module resolution failed with diagnostics.");
    if (!result.registry) throw new Error("Preview Component module resolver did not return a registry.");

    this.registrySnapshot = snapshotComponentRegistry(result.registry);
    return this.registrySnapshot;
  }

  private async readProjectAssetDocument(
    asset: AssetReference,
    signal: AbortSignal,
  ): Promise<string> {
    if (!this.projectSnapshot) throw new Error("Preview Project snapshot is unavailable.");
    const capturedAsset = this.projectSnapshot.assets.find((item) => item.id === asset.id);
    if (!capturedAsset || capturedAsset.path !== asset.path || capturedAsset.kind !== asset.kind) {
      throw new Error("Preview document provider received an Asset outside the captured Project snapshot.");
    }
    const cached = this.documentSnapshots.get(capturedAsset.id);
    if (cached !== undefined) return cached;
    const content = await this.options.readAssetDocument(Object.freeze({ ...capturedAsset }), signal);
    if (signal.aborted) throw abortReason(signal);
    if (typeof content !== "string") {
      throw new TypeError("Preview document provider must return UTF-8 JSON text.");
    }
    this.documentSnapshots.set(capturedAsset.id, content);
    return content;
  }

  private createCoreLoader(): ProjectSceneLoader {
    if (this.snapshotError !== undefined) throw this.snapshotError;
    if (!this.projectSnapshot || !this.registrySnapshot) {
      throw new Error("Preview Project and Component registrations could not be snapshotted.");
    }
    return new ProjectSceneLoader({
      project: this.projectSnapshot,
      registry: this.registrySnapshot,
      readAssetDocument: (asset, signal) => this.readProjectAssetDocument(asset, signal),
    });
  }

  private clearGameStartupTimer(): void {
    if (this.gameStartupTimer !== undefined) clearTimeout(this.gameStartupTimer);
    this.gameStartupTimer = undefined;
  }

  private async destroyGame(): Promise<void> {
    this.clearGameStartupTimer();
    this.failGameReady?.(new Error("Phaser Game was destroyed before Preview Scene startup completed."));
    const game = this.game;
    if (!game) {
      this.gameReadyPromise = undefined;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      game.events.once(this.options.phaser.Core.Events.DESTROY, finish);
      try {
        // Phaser finalizes Game destruction on its own next frame.
        game.destroy(true);
      } catch (error) {
        if (settled) return;
        settled = true;
        reject(error);
      }
    });
    if (this.game === game) this.game = undefined;
    this.gameReadyPromise = undefined;
  }

  private handleGameDestroyed(game: Phaser.Game): void {
    this.clearGameStartupTimer();
    this.failGameReady?.(new Error("Phaser Game was destroyed before Preview Scene startup completed."));
    if (this.game === game) this.game = undefined;
    this.gameReadyPromise = undefined;
    if (this.disposeRequested || this.expectedGameDestruction) return;

    const manager = this.sceneManager;
    this.sceneManager = undefined;
    if (manager) {
      const cleanup = manager.dispose().catch((error: unknown) => {
        this.reportError(error, "PREVIEW_UNEXPECTED_GAME_DESTROY_CLEANUP_FAILED", "host");
        throw error;
      });
      this.unexpectedGameDestroyCleanup = cleanup;
      // A failed cleanup remains recorded and blocks a replacement Game. The
      // rejection is observed here as well as by the next Play/Dispose caller.
      void cleanup.then(() => {
        if (this.unexpectedGameDestroyCleanup === cleanup) this.unexpectedGameDestroyCleanup = undefined;
      }, () => undefined);
    }
    if (this.currentSessionId) {
      this.reportError(
        new Error("The Phaser Game was destroyed outside the Preview Host lifecycle."),
        "PREVIEW_GAME_DESTROYED",
        "phaser",
      );
      this.setState("failed");
    }
  }

  private handlePhaserDiagnostic(diagnostic: PhaserRuntimeDiagnostic): void {
    const sessionId = this.currentSessionId;
    if (!sessionId || !["starting", "running", "paused", "stopping"].includes(this.currentState)) return;
    this.publishError({
      sessionId,
      projectId: diagnostic.projectId,
      sceneId: diagnostic.sceneId,
      source: "phaser",
      code: diagnostic.code,
      severity: "error",
      message: diagnostic.message,
      ...(diagnostic.causeMessage === undefined ? {} : { causeMessage: diagnostic.causeMessage }),
      ...(diagnostic.nodeId === undefined ? {} : { nodeId: diagnostic.nodeId }),
      ...(diagnostic.componentInstanceId === undefined ? {} : { componentInstanceId: diagnostic.componentInstanceId }),
    });
  }

  private reportError(
    error: unknown,
    fallbackCode: string,
    fallbackSource: BrowserPreviewErrorEvent["source"] = "host",
  ): void {
    const sessionId = this.currentSessionId;
    if (!sessionId) return;

    if (error instanceof SceneLoaderError && error.diagnostics.length > 0) {
      for (const diagnostic of error.diagnostics) {
        this.publishError({
          sessionId,
          projectId: this.projectId,
          sceneId: this.sceneId,
          source: "core",
          code: diagnostic.code,
          severity: "error",
          message: diagnostic.message,
          ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
          ...(diagnostic.entityId === undefined ? {} : { entityId: diagnostic.entityId }),
          ...(diagnostic.componentInstanceId === undefined ? {} : { componentInstanceId: diagnostic.componentInstanceId }),
        });
      }
      return;
    }

    if (error instanceof AggregateError) {
      const initialCount = this.sessionErrorCounts.get(sessionId) ?? 0;
      for (const nested of error.errors) this.reportError(nested, fallbackCode, fallbackSource);
      if ((this.sessionErrorCounts.get(sessionId) ?? 0) > initialCount) return;
    }

    this.publishError({
      sessionId,
      projectId: this.projectId,
      sceneId: this.sceneId,
      source: fallbackSource,
      code: fallbackCode,
      severity: "error",
      message: errorMessage(error),
      ...(error instanceof Error && error.cause !== undefined
        ? { causeMessage: errorMessage(error.cause) }
        : {}),
    });
  }

  private publishError(event: BrowserPreviewErrorEvent): void {
    this.sessionErrorCounts.set(event.sessionId, (this.sessionErrorCounts.get(event.sessionId) ?? 0) + 1);
    this.emit("error", Object.freeze(event));
  }

  private createSessionId(): string {
    const sequence = ++this.nextSessionSequence;
    const randomId = globalThis.crypto?.randomUUID?.();
    return randomId
      ? this.hostId + ":" + randomId
      : this.hostId + ":session-" + sequence.toString(36);
  }

  private setState(next: BrowserPreviewState): void {
    if (this.currentState === next) return;
    const previous = this.currentState;
    this.currentState = next;
    this.emit("state-change", Object.freeze({
      previous,
      current: next,
      sessionId: this.currentSessionId,
    }));
  }

  private emit<TKey extends keyof BrowserPreviewHostEvents>(
    type: TKey,
    payload: BrowserPreviewHostEvents[TKey],
  ): void {
    try {
      this.events.emit(type, payload);
    } catch {
      // Event observers are isolated from the Preview lifecycle and frame owner.
    }
  }

  private assertNotDisposing(): void {
    if (this.disposeRequested || this.currentState === "disposed") {
      throw new Error("BrowserPreviewHost is being disposed or has been disposed.");
    }
  }
}

/** Creates a browser-first Preview Host without creating a second game loop or UI surface. */
export function createBrowserPreviewHost(options: BrowserPreviewHostOptions): BrowserPreviewHost {
  return new BrowserPreviewHostImpl(options);
}
