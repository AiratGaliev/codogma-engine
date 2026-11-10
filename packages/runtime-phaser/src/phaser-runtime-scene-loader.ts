import type Phaser from "phaser";
import type {
  ComponentInstanceDocument,
  NodeDocument,
  ProjectRuntimeSceneSession,
  RuntimeComponentSnapshot,
  RuntimeSceneGraphNode,
  RuntimeSceneSession,
  SceneLoadRequest,
  SceneLoader,
} from "@codogma/cge";
import {
  PhaserRuntimeAdapterError,
  type PhaserRuntimeDiagnostic,
} from "./errors.js";

const SCENE_UPDATE = "update";
const SCENE_SHUTDOWN = "shutdown";
const SCENE_DESTROY = "destroy";

export type PhaserRuntimeNodeSnapshot = Readonly<
  Omit<RuntimeSceneGraphNode, "transform" | "children" | "componentInstanceIds">
> & {
  readonly transform: Readonly<RuntimeSceneGraphNode["transform"]>;
  readonly children: readonly PhaserRuntimeNodeSnapshot[];
  readonly componentInstanceIds: readonly string[];
};

export type PhaserComponentViewFactory = (context: PhaserComponentViewContext) => Phaser.GameObjects.GameObject;

export interface PhaserComponentViewContext {
  readonly scene: Phaser.Scene;
  readonly projectId: string;
  readonly sceneId: string;
  /** Immutable view of Node data; mutable Core graph nodes are never exposed to factories. */
  readonly node: PhaserRuntimeNodeSnapshot;
  /** Immutable snapshot of the Component runtime identity/state. */
  readonly component: Readonly<RuntimeComponentSnapshot>;
  /** Isolated JSON copy of validated authoring data; mutations cannot reach the Core snapshot. */
  readonly document: ComponentInstanceDocument;
}

export interface PhaserRuntimeSceneLoaderOptions {
  readonly projectId: string;
  /** Only explicitly registered Component types create display objects. */
  readonly componentViewFactories?: Readonly<Record<string, PhaserComponentViewFactory>>;
  /**
   * Called once per Phaser Scene UPDATE in seconds. The default updates the
   * Core ComponentWorld directly. Hosts composing EngineRuntime should supply
   * a callback that invokes runtime.update(deltaSeconds, scaled => session.world.update(scaled)).
   */
  readonly update?: (deltaSeconds: number, session: ProjectRuntimeSceneSession) => void;
  /** Receives adapter diagnostics; exceptions thrown by the observer are isolated. */
  readonly onDiagnostic?: (diagnostic: PhaserRuntimeDiagnostic) => void;
}

/** A loader whose successful sessions expose the validated Core runtime graph. */
export interface RuntimeGraphSceneLoader {
  load(request: SceneLoadRequest): Promise<ProjectRuntimeSceneSession>;
}

type NodeComponentDocument = {
  readonly node: NodeDocument;
  readonly component: ComponentInstanceDocument;
};

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function";
}

function isDestroyed(gameObject: Phaser.GameObjects.GameObject): boolean {
  return (gameObject as Phaser.GameObjects.GameObject & { isDestroyed?: boolean }).isDestroyed === true;
}

function setGameObjectVisible(gameObject: Phaser.GameObjects.GameObject, visible: boolean): void {
  const visibility = gameObject as Phaser.GameObjects.GameObject & {
    visible?: boolean;
    setVisible?: (value: boolean) => unknown;
  };
  if (typeof visibility.setVisible === "function") {
    visibility.setVisible(visible);
    return;
  }
  if ("visible" in gameObject) {
    visibility.visible = visible;
    return;
  }
  throw new TypeError("A Component view must support Phaser visibility.");
}

function createNodeSnapshot(
  node: RuntimeSceneGraphNode,
  snapshots: Map<string, PhaserRuntimeNodeSnapshot>,
): PhaserRuntimeNodeSnapshot {
  const existing = snapshots.get(node.id);
  if (existing) return existing;

  const snapshot: PhaserRuntimeNodeSnapshot = Object.freeze({
    id: node.id,
    name: node.name,
    active: node.active,
    transform: Object.freeze({ ...node.transform }),
    ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
    children: Object.freeze(node.children.map((child) => createNodeSnapshot(child, snapshots))),
    componentInstanceIds: Object.freeze([...node.componentInstanceIds]),
  });
  snapshots.set(node.id, snapshot);
  return snapshot;
}

function cloneComponentDocument(document: ComponentInstanceDocument): ComponentInstanceDocument {
  // Scene Loader validation guarantees JSON-compatible authoring data. Give
  // view factories an isolated copy so they cannot mutate the source snapshot.
  return JSON.parse(JSON.stringify(document)) as ComponentInstanceDocument;
}

function collectComponentDocuments(
  nodes: readonly NodeDocument[],
  result: Map<string, NodeComponentDocument>,
): void {
  for (const node of nodes) {
    for (const component of node.components) {
      result.set(component.id, { node, component });
    }
    collectComponentDocuments(node.children, result);
  }
}

function createDiagnostic(
  code: PhaserRuntimeDiagnostic["code"],
  message: string,
  projectId: string,
  sceneId: string,
  nodeId?: string,
  componentInstanceId?: string,
  causeMessage?: string,
): PhaserRuntimeDiagnostic {
  return {
    code,
    severity: "error",
    message,
    projectId,
    sceneId,
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(componentInstanceId === undefined ? {} : { componentInstanceId }),
    ...(causeMessage === undefined ? {} : { causeMessage }),
  };
}

/**
 * Converts a host-neutral ProjectRuntimeSceneSession into a Phaser view
 * hierarchy. Core owns all mutable Transform and Component state; Phaser owns
 * only the lifetime of the corresponding display objects.
 */
export class PhaserRuntimeSceneSession implements RuntimeSceneSession {
  private readonly nodeViews = new Map<string, Phaser.GameObjects.Container>();
  private readonly componentViews = new Map<string, Phaser.GameObjects.GameObject>();
  private readonly nodeIds = new WeakMap<Phaser.GameObjects.GameObject, string>();
  private readonly componentIds = new WeakMap<Phaser.GameObjects.GameObject, string>();
  private readonly graphNodes = new Map<string, RuntimeSceneGraphNode>();
  private readonly nodeSnapshots = new Map<string, PhaserRuntimeNodeSnapshot>();
  private readonly rootViews: Phaser.GameObjects.Container[] = [];
  private readonly ownedObjects = new Set<Phaser.GameObjects.GameObject>();
  private disposePromise: Promise<void> | undefined;
  private listenersAttached = false;

  private readonly updateListener = (_time: number, deltaMilliseconds: number): void => {
    this.onSceneUpdate(deltaMilliseconds);
  };

  private readonly shutdownListener = (): void => {
    void this.dispose().catch(() => undefined);
  };

  private readonly destroyListener = (): void => {
    void this.dispose().catch(() => undefined);
  };

  constructor(
    private readonly scene: Phaser.Scene,
    readonly coreSession: ProjectRuntimeSceneSession,
    private readonly options: PhaserRuntimeSceneLoaderOptions,
    private readonly factories: ReadonlyMap<string, PhaserComponentViewFactory>,
  ) {
    for (const root of coreSession.graph.rootNodes) {
      this.indexGraphNode(root);
      createNodeSnapshot(root, this.nodeSnapshots);
    }
    this.buildViews();
  }

  get sceneId(): string { return this.coreSession.sceneId; }
  get isDisposed(): boolean { return this.disposePromise !== undefined; }

  getNodeView(nodeId: string): Phaser.GameObjects.Container | undefined {
    if (this.isDisposed) return undefined;
    const view = this.nodeViews.get(nodeId);
    return view && !isDestroyed(view) ? view : undefined;
  }

  getComponentView(instanceId: string): Phaser.GameObjects.GameObject | undefined {
    if (this.isDisposed) return undefined;
    const view = this.componentViews.get(instanceId);
    return view && !isDestroyed(view) ? view : undefined;
  }

  getNodeId(view: Phaser.GameObjects.GameObject): string | undefined {
    if (this.isDisposed || isDestroyed(view)) return undefined;
    return this.nodeIds.get(view);
  }

  getComponentInstanceId(view: Phaser.GameObjects.GameObject): string | undefined {
    if (this.isDisposed || isDestroyed(view)) return undefined;
    return this.componentIds.get(view);
  }

  async activate(): Promise<void> {
    this.assertUsable();
    await this.coreSession.activate();
    this.syncViews();
  }

  async deactivate(): Promise<void> {
    this.assertUsable();
    await this.coreSession.deactivate();
    this.syncViews();
  }

  async pause(): Promise<void> {
    this.assertUsable();
    await this.coreSession.pause();
    // Pause stops simulation, not rendering or Phaser's Scene.
    this.syncViews();
  }

  async resume(): Promise<void> {
    this.assertUsable();
    await this.coreSession.resume();
    this.syncViews();
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposePromise = this.disposeInternal().catch((error: unknown) => {
      this.reportCleanupError(error);
      throw error;
    });
    return this.disposePromise;
  }

  attachListeners(): void {
    this.assertUsable();
    if (this.listenersAttached) return;
    this.scene.events.on(SCENE_UPDATE, this.updateListener);
    this.scene.events.on(SCENE_SHUTDOWN, this.shutdownListener);
    this.scene.events.on(SCENE_DESTROY, this.destroyListener);
    this.listenersAttached = true;
  }

  private indexGraphNode(node: RuntimeSceneGraphNode): void {
    this.graphNodes.set(node.id, node);
    for (const child of node.children) this.indexGraphNode(child);
  }


  private buildViews(): void {
    const componentDocuments = new Map<string, NodeComponentDocument>();
    collectComponentDocuments(this.coreSession.graph.document.rootNodes, componentDocuments);
    const components = new Map(
      this.coreSession.world.listComponents().map((component) => [component.id, component] as const),
    );

    const createNodeView = (
      node: RuntimeSceneGraphNode,
      parent: Phaser.GameObjects.Container | undefined,
    ): void => {
      let nodeView: Phaser.GameObjects.Container;
      try {
        nodeView = this.scene.add.container();
        this.ownedObjects.add(nodeView);
        nodeView.setExclusive(true);
        this.nodeViews.set(node.id, nodeView);
        this.nodeIds.set(nodeView, node.id);
        if (parent) parent.add(nodeView);
        else this.rootViews.push(nodeView);
      } catch (error) {
        throw new PhaserRuntimeAdapterError(
          createDiagnostic(
            "VIEW_CREATION_FAILED",
            "Could not create or attach the Phaser Container for Node " + node.id + ".",
            this.options.projectId,
            this.sceneId,
            node.id,
            undefined,
            this.errorMessage(error),
          ),
          error,
        );
      }

      this.applyNodeTransform(node, nodeView);
      nodeView.setActive(false);
      nodeView.setVisible(false);

      for (const componentInstanceId of node.componentInstanceIds) {
        const component = components.get(componentInstanceId);
        const persisted = componentDocuments.get(componentInstanceId);
        if (!component || !persisted || persisted.node.id !== node.id) {
          throw new PhaserRuntimeAdapterError(
            createDiagnostic(
              "SCENE_GRAPH_INVALID",
              "Core runtime Component " + componentInstanceId + " does not resolve to its Scene document Node.",
              this.options.projectId,
              this.sceneId,
              node.id,
              componentInstanceId,
            ),
          );
        }

        const factory = this.factories.get(component.typeId);
        if (!factory) continue;

        try {
          const view = factory({
            scene: this.scene,
            projectId: this.options.projectId,
            sceneId: this.sceneId,
            node: this.nodeSnapshots.get(node.id)!,
            component: Object.freeze({ ...component }),
            document: cloneComponentDocument(persisted.component),
          });
          if (!view || typeof view.destroy !== "function") {
            throw new TypeError("A Component view factory must return a Phaser GameObject.");
          }
          if (view.scene !== this.scene) {
            throw new TypeError("A Component view must belong to the Phaser Scene supplied to its factory.");
          }
          if (this.ownedObjects.has(view)) {
            throw new TypeError("A Phaser GameObject cannot be owned by more than one Node or Component view.");
          }
          this.ownedObjects.add(view);
          setGameObjectVisible(view, false);
          nodeView.add(view);
          this.componentViews.set(componentInstanceId, view);
          this.componentIds.set(view, componentInstanceId);
          view.active = false;
          this.setViewOrigin(view, node.transform.originX, node.transform.originY);
        } catch (error) {
          throw new PhaserRuntimeAdapterError(
            createDiagnostic(
              "VIEW_CREATION_FAILED",
              "Could not create or attach the Phaser view for Component " + componentInstanceId + ".",
              this.options.projectId,
              this.sceneId,
              node.id,
              componentInstanceId,
              this.errorMessage(error),
            ),
            error,
          );
        }
      }

      // Components are inserted before child Node Containers; child ordering
      // follows the validated Scene graph's children array.
      for (const child of node.children) createNodeView(child, nodeView);
    };

    try {
      for (const root of this.coreSession.graph.rootNodes) createNodeView(root, undefined);
      this.syncViews();
    } catch (error) {
      const cleanupErrors = this.destroyOwnedObjects();
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "Phaser view graph creation and rollback both failed.",
        );
      }
      throw error;
    }
  }

  private applyNodeTransform(
    node: RuntimeSceneGraphNode,
    view: Phaser.GameObjects.Container,
  ): void {
    const transform = node.transform;
    const values = [
      transform.x,
      transform.y,
      transform.rotation,
      transform.scaleX,
      transform.scaleY,
      transform.originX,
      transform.originY,
    ];
    if (values.some((value) => !Number.isFinite(value))) {
      throw new PhaserRuntimeAdapterError(
        createDiagnostic(
          "TRANSFORM_INVALID",
          "Node " + node.id + " has a non-finite runtime Transform.",
          this.options.projectId,
          this.sceneId,
          node.id,
        ),
      );
    }
    view.setPosition(transform.x, transform.y);
    view.setRotation(transform.rotation);
    view.setScale(transform.scaleX, transform.scaleY);
  }

  private syncViews(): void {
    if (this.isDisposed) return;

    const active = this.coreSession.isActive;
    const components = this.componentViews.size > 0
      ? new Map(this.coreSession.world.listComponents().map((component) => [component.id, component] as const))
      : undefined;

    for (const [nodeId, view] of this.nodeViews) {
      const node = this.graphNodes.get(nodeId);
      if (!node || isDestroyed(view)) continue;
      this.applyNodeTransform(node, view);
      const nodeActive = active && node.active;
      view.active = nodeActive;
      view.visible = nodeActive;
    }

    if (!components) return;
    for (const [instanceId, view] of this.componentViews) {
      if (isDestroyed(view)) continue;
      const component = components.get(instanceId);
      const nodeId = component?.nodeId;
      const node = nodeId ? this.graphNodes.get(nodeId) : undefined;
      const enabled = active && Boolean(node?.active) && component?.enabled === true;
      view.active = enabled;
      setGameObjectVisible(view, enabled);
      if (node) this.setViewOrigin(view, node.transform.originX, node.transform.originY);
    }
  }

  private setViewOrigin(view: Phaser.GameObjects.GameObject, originX: number, originY: number): void {
    const originView = view as Phaser.GameObjects.GameObject & {
      setOrigin?: (x?: number, y?: number) => unknown;
    };
    originView.setOrigin?.(originX, originY);
  }

  private onSceneUpdate(deltaMilliseconds: number): void {
    if (this.isDisposed || !this.coreSession.isActive) return;
    if (!Number.isFinite(deltaMilliseconds) || deltaMilliseconds < 0) {
      this.emitDiagnostic(createDiagnostic(
        "RUNTIME_UPDATE_FAILED",
        "Phaser supplied a non-finite or negative Scene UPDATE delta.",
        this.options.projectId,
        this.sceneId,
      ));
      return;
    }

    // A paused Core session stops simulation but still projects host/Inspector
    // Transform changes into Phaser views.
    if (!this.coreSession.isPaused) {
      try {
        const deltaSeconds = deltaMilliseconds / 1000;
        const result: unknown = this.options.update
          ? this.options.update(deltaSeconds, this.coreSession)
          : this.coreSession.world.update(deltaSeconds);
        if (isThenable(result)) {
          void Promise.resolve(result).catch(() => undefined);
          throw new TypeError("The Phaser runtime update callback must be synchronous.");
        }
      } catch (error) {
        this.emitDiagnostic(createDiagnostic(
          "RUNTIME_UPDATE_FAILED",
          "Core runtime update failed for Scene " + this.sceneId + ": " + this.errorMessage(error),
          this.options.projectId,
          this.sceneId,
        ));
        this.reportObserverError(error);
      }
    }

    try {
      this.syncViews();
    } catch (error) {
      this.emitDiagnostic(createDiagnostic(
        "RUNTIME_UPDATE_FAILED",
        "Phaser view synchronization failed for Scene " + this.sceneId + ": " + this.errorMessage(error),
        this.options.projectId,
        this.sceneId,
      ));
      this.reportObserverError(error);
    }
  }

  private async disposeInternal(): Promise<void> {
    const errors: unknown[] = [];
    try {
      this.scene.events.off(SCENE_UPDATE, this.updateListener);
      this.scene.events.off(SCENE_SHUTDOWN, this.shutdownListener);
      this.scene.events.off(SCENE_DESTROY, this.destroyListener);
    } catch (error) {
      errors.push(error);
    }
    this.listenersAttached = false;

    if (this.coreSession.isActive) {
      try {
        await this.coreSession.deactivate();
      } catch (error) {
        errors.push(error);
      }
    }

    errors.push(...this.destroyOwnedObjects());

    try {
      await this.coreSession.dispose();
    } catch (error) {
      errors.push(error);
    }

    if (errors.length > 0) {
      const diagnostic = createDiagnostic(
        "SCENE_CLEANUP_FAILED",
        "Phaser adapter could not clean up Scene " + this.sceneId + " without errors: " + errors.map((error) => this.errorMessage(error)).join("; "),
        this.options.projectId,
        this.sceneId,
      );
      throw new PhaserRuntimeAdapterError(diagnostic, new AggregateError(errors, diagnostic.message));
    }
  }

  private destroyOwnedObjects(): unknown[] {
    const errors: unknown[] = [];
    const objects = [...this.rootViews, ...this.ownedObjects];
    for (const object of objects) {
      if (isDestroyed(object)) continue;
      try {
        object.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    this.rootViews.length = 0;
    this.ownedObjects.clear();
    this.nodeViews.clear();
    this.componentViews.clear();
    this.graphNodes.clear();
    this.nodeSnapshots.clear();
    return errors;
  }

  private assertUsable(): void {
    if (this.isDisposed) {
      throw new Error("PhaserRuntimeSceneSession is disposed.");
    }
  }

  private emitDiagnostic(diagnostic: PhaserRuntimeDiagnostic): void {
    try {
      this.options.onDiagnostic?.(diagnostic);
    } catch {
      // Diagnostics must never break Phaser's frame or shutdown lifecycle.
    }
  }

  private reportObserverError(error: unknown): void {
    if (error instanceof PhaserRuntimeAdapterError) {
      this.emitDiagnostic(error.diagnostic);
    }
  }

  private reportCleanupError(error: unknown): void {
    if (error instanceof PhaserRuntimeAdapterError) {
      this.emitDiagnostic(error.diagnostic);
      return;
    }
    this.emitDiagnostic(createDiagnostic(
      "SCENE_CLEANUP_FAILED",
      "An error occurred while disposing the Phaser runtime Scene: " + this.errorMessage(error),
      this.options.projectId,
      this.sceneId,
    ));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Adapts an existing Core SceneLoader. It does not parse documents, resolve
 * modules, own Core lifecycle, or create a Phaser Game/Scene/ticker.
 */
export class PhaserRuntimeSceneLoader implements SceneLoader {
  private readonly factories: ReadonlyMap<string, PhaserComponentViewFactory>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly coreLoader: RuntimeGraphSceneLoader,
    private readonly options: PhaserRuntimeSceneLoaderOptions,
  ) {
    if (!scene || !scene.add || typeof scene.add.container !== "function" ||
        !scene.events || typeof scene.events.on !== "function" ||
        typeof scene.events.off !== "function") {
      throw new TypeError("PhaserRuntimeSceneLoader requires a live Phaser Scene with GameObjectFactory and events.");
    }
    if (!options || typeof options.projectId !== "string" || options.projectId.trim().length === 0) {
      throw new TypeError("PhaserRuntimeSceneLoader requires a non-empty Project ID.");
    }
    if (!coreLoader || typeof coreLoader.load !== "function") {
      throw new TypeError("PhaserRuntimeSceneLoader requires an existing Core SceneLoader.");
    }
    this.factories = new Map(Object.entries(options.componentViewFactories ?? {}));
    for (const [typeId, factory] of this.factories) {
      if (!typeId.trim() || typeof factory !== "function") {
        throw new TypeError("Component view factories require non-empty type IDs and callable factories.");
      }
    }
  }

  async load(request: SceneLoadRequest): Promise<PhaserRuntimeSceneSession> {
    const coreSession = await this.coreLoader.load(request);
    let runtimeSession: PhaserRuntimeSceneSession | undefined;
    try {
      if (request.signal.aborted) {
        throw request.signal.reason ?? new Error("Scene load was aborted before Phaser view creation.");
      }
      runtimeSession = new PhaserRuntimeSceneSession(
        this.scene,
        coreSession,
        this.options,
        this.factories,
      );
      runtimeSession.attachListeners();
      return runtimeSession;
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (runtimeSession) {
        try {
          await runtimeSession.dispose();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      } else {
        try {
          if (coreSession.isActive) await coreSession.deactivate();
          await coreSession.dispose();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }

      const adapterError = this.findAdapterError(error);
      if (!runtimeSession && adapterError) this.emitDiagnostic(adapterError.diagnostic);

      if (error instanceof PhaserRuntimeAdapterError && cleanupErrors.length === 0) {
        throw error;
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError([error, ...cleanupErrors], "Phaser adapter load and rollback failed.");
      }
      throw error;
    }
  }

  private findAdapterError(error: unknown): PhaserRuntimeAdapterError | undefined {
    if (error instanceof PhaserRuntimeAdapterError) return error;
    if (error instanceof AggregateError) {
      for (const nested of error.errors) {
        const adapterError = this.findAdapterError(nested);
        if (adapterError) return adapterError;
      }
    }
    return undefined;
  }

  private emitDiagnostic(diagnostic: PhaserRuntimeDiagnostic): void {
    try {
      this.options.onDiagnostic?.(diagnostic);
    } catch {
      // A user diagnostic observer must not prevent Core rollback.
    }
  }
}

export function createPhaserRuntimeSceneLoader(
  scene: Phaser.Scene,
  coreLoader: RuntimeGraphSceneLoader,
  options: PhaserRuntimeSceneLoaderOptions,
): PhaserRuntimeSceneLoader {
  return new PhaserRuntimeSceneLoader(scene, coreLoader, options);
}
