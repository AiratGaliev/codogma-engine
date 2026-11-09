import type { CoreDiagnostic, CoreDiagnosticCode } from "../diagnostics.js";
import { ComponentWorld, ComponentWorldError, type RuntimeComponentSnapshot, type RuntimeNode } from "../components/component-world.js";
import { ComponentRegistry } from "../components/component-registry.js";
import type { ComponentTypeSchemaV1 } from "../components/component-schema.js";
import { isJsonValue, type JsonObject } from "../json.js";
import {
  validateProjectDocument,
  type SceneValidationContext,
} from "../project-model/validation.js";
import {
  parseSceneDocument,
} from "../project-model/serialization.js";
import type {
  AssetReference,
  NodeDocument,
  PrefabReference,
  ProjectDocumentV1,
  SceneDocumentV1,
} from "../project-model/contracts.js";
import type {
  RuntimeSceneSession,
  SceneLoadProgress,
  SceneLoadRequest,
  SceneLoader,
} from "./scene-manager.js";

export interface ProjectSceneLoaderOptions {
  /** Validated again and snapshotted when the loader is composed. */
  readonly project: ProjectDocumentV1;
  /** Explicitly registered Component definitions; project data never imports code. */
  readonly registry: ComponentRegistry;
  /**
   * Host-owned document access. The callback receives only Scene assets and must
   * honor the supplied signal. It returns UTF-8 JSON text; Core performs parsing.
   */
  readonly readAssetDocument: (asset: AssetReference, signal: AbortSignal) => Promise<string>;
}

export interface RuntimeSceneGraphNode extends RuntimeNode {
  /** Omitted for root Nodes. Transform values are local to this parent. */
  readonly parentId?: string;
  readonly children: readonly RuntimeSceneGraphNode[];
  readonly componentInstanceIds: readonly string[];
}

export interface RuntimeSceneGraph {
  readonly sceneId: string;
  /** Immutable, validated source snapshot; runtime mutations never rewrite it. */
  readonly document: Readonly<SceneDocumentV1>;
  readonly diagnostics: readonly CoreDiagnostic[];
  readonly rootNodes: readonly RuntimeSceneGraphNode[];
  getNode(nodeId: string): RuntimeSceneGraphNode | undefined;
  getComponent(instanceId: string): RuntimeComponentSnapshot | undefined;
  getAsset(assetId: string): AssetReference | undefined;
  getPrefab(prefabId: string): PrefabReference | undefined;
}

export type RuntimeSceneSessionState = "inactive" | "active" | "paused" | "disposed";

export interface ProjectRuntimeSceneSession extends RuntimeSceneSession {
  readonly state: RuntimeSceneSessionState;
  readonly isActive: boolean;
  readonly isPaused: boolean;
  /** The host owns ticking; call update only while isActive && !isPaused. */
  readonly world: ComponentWorld;
  readonly graph: RuntimeSceneGraph;
}

/** A machine-readable failure raised while resolving, hydrating or releasing a Scene. */
export class SceneLoaderError extends Error {
  readonly code: CoreDiagnosticCode;
  readonly diagnostics: CoreDiagnostic[];
  readonly originalError?: unknown;

  constructor(
    code: CoreDiagnosticCode,
    message: string,
    diagnostics: CoreDiagnostic[],
    cause?: unknown,
  ) {
    super(message);
    this.name = "SceneLoaderError";
    this.code = code;
    this.diagnostics = diagnostics;
    if (cause !== undefined) this.originalError = cause;
  }
}

interface NodeBuildRecord {
  readonly document: NodeDocument;
  readonly runtime: RuntimeNode;
  readonly parentId?: string;
  children: NodeBuildRecord[];
}

function diagnostic(
  code: CoreDiagnosticCode,
  message: string,
  path?: string,
  entityId?: string,
  componentInstanceId?: string,
): CoreDiagnostic {
  return {
    code,
    severity: "error",
    message,
    ...(path === undefined ? {} : { path }),
    ...(entityId === undefined ? {} : { entityId }),
    ...(componentInstanceId === undefined ? {} : { componentInstanceId }),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotJson<T>(value: T): T {
  if (!isJsonValue(value)) throw new TypeError("A runtime snapshot must contain JSON-compatible data.");
  return deepFreeze(JSON.parse(JSON.stringify(value)) as T);
}

function abortError(sceneId: string, signal: AbortSignal): SceneLoaderError {
  return new SceneLoaderError(
    "SCENE_LOAD_ABORTED",
    "Loading Scene " + sceneId + " was cancelled.",
    [diagnostic("SCENE_LOAD_ABORTED", "Scene loading was cancelled.", "sceneId", sceneId)],
    signal.reason,
  );
}

function throwIfAborted(sceneId: string, signal: AbortSignal): void {
  if (signal.aborted) throw abortError(sceneId, signal);
}

function awaitWithAbort<T>(
  operation: PromiseLike<T>,
  sceneId: string,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(sceneId, signal));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError(sceneId, signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (signal.aborted) reject(abortError(sceneId, signal));
        else resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

function toLoaderError(error: unknown, message: string): SceneLoaderError {
  if (error instanceof SceneLoaderError) return error;
  if (error instanceof ComponentWorldError) {
    const diagnostics = error.diagnostics.length > 0
      ? error.diagnostics
      : [diagnostic(error.code, error.message)];
    return new SceneLoaderError(error.code, message, diagnostics, error);
  }
  return new SceneLoaderError(
    "SCENE_LOAD_FAILED",
    message + ": " + errorMessage(error),
    [diagnostic("SCENE_LOAD_FAILED", errorMessage(error))],
    error,
  );
}

function collectModuleDiagnostics(
  scene: SceneDocumentV1,
  project: ProjectDocumentV1,
  registry: ComponentRegistry,
): CoreDiagnostic[] {
  const modules = new Map(project.componentModules.map((module) => [module.typeId, module] as const));
  const diagnostics: CoreDiagnostic[] = [];

  const visit = (nodes: readonly NodeDocument[], prefix: string): void => {
    nodes.forEach((node, nodeIndex) => {
      const nodePath = prefix + "[" + nodeIndex + "]";
      node.components.forEach((component, componentIndex) => {
        const componentPath = nodePath + ".components[" + componentIndex + "]";
        const module = modules.get(component.typeId);
        if (!module) {
          diagnostics.push(diagnostic(
            "PROJECT_INVALID_REFERENCE",
            "Component type " + component.typeId + " is not declared by Project.componentModules.",
            componentPath + ".typeId",
            node.id,
            component.id,
          ));
          return;
        }
        const definition = registry.get(component.typeId);
        if (!definition) {
          diagnostics.push(diagnostic(
            "COMPONENT_UNKNOWN_TYPE",
            "Component module " + component.typeId + " is declared by the Project but is not registered in Core.",
            componentPath + ".typeId",
            node.id,
            component.id,
          ));
          return;
        }
        if (definition.schema.version !== module.version) {
          diagnostics.push(diagnostic(
            "COMPONENT_INVALID_SCHEMA",
            "Registered Component version " + definition.schema.version +
              " does not match Project module version " + module.version + ".",
            componentPath + ".typeId",
            node.id,
            component.id,
          ));
        }
      });
      visit(node.children, nodePath + ".children");
    });
  };

  visit(scene.rootNodes, "rootNodes");
  return diagnostics;
}

function createNodeRecords(
  nodes: readonly NodeDocument[],
  world: ComponentWorld,
  records: NodeBuildRecord[],
  parentId?: string,
  signal?: AbortSignal,
  sceneId?: string,
): NodeBuildRecord[] {
  return nodes.map((document) => {
    if (signal && sceneId) throwIfAborted(sceneId, signal);
    const runtime = world.createNode({
      id: document.id,
      name: document.name,
      active: false,
      transform: document.transform,
    });
    const record: NodeBuildRecord = {
      document,
      runtime,
      children: [],
      ...(parentId === undefined ? {} : { parentId }),
    };
    records.push(record);
    record.children = createNodeRecords(document.children, world, records, runtime.id, signal, sceneId);
    return record;
  });
}

function attachNodeComponents(
  records: readonly NodeBuildRecord[],
  world: ComponentWorld,
  signal: AbortSignal,
  sceneId: string,
): void {
  for (const record of records) {
    for (const component of record.document.components) {
      throwIfAborted(sceneId, signal);
      world.attachComponent(
        record.runtime.id,
        component.typeId,
        component.properties as JsonObject,
        { instanceId: component.id, enabled: component.enabled },
      );
      // onCreate is user code and may synchronously abort the load.
      throwIfAborted(sceneId, signal);
    }
    attachNodeComponents(record.children, world, signal, sceneId);
  }
}

function createRuntimeGraph(
  scene: SceneDocumentV1,
  roots: readonly NodeBuildRecord[],
  world: ComponentWorld,
  assets: ReadonlyMap<string, AssetReference>,
  prefabs: ReadonlyMap<string, PrefabReference>,
  diagnostics: readonly CoreDiagnostic[],
): RuntimeSceneGraph {
  const nodes = new Map<string, RuntimeSceneGraphNode>();
  const materialize = (record: NodeBuildRecord): RuntimeSceneGraphNode => {
    const children = record.children.map(materialize);
    const node = Object.freeze({
      id: record.runtime.id,
      name: record.runtime.name,
      get active(): boolean { return record.runtime.active; },
      transform: record.runtime.transform,
      ...(record.parentId === undefined ? {} : { parentId: record.parentId }),
      children: Object.freeze(children),
      componentInstanceIds: Object.freeze(record.document.components.map((component) => component.id)),
    }) as RuntimeSceneGraphNode;
    nodes.set(node.id, node);
    return node;
  };

  const rootNodes = Object.freeze(roots.map(materialize));
  const document = snapshotJson(scene);
  const diagnosticSnapshot = Object.freeze(diagnostics.map((item) => Object.freeze({
    ...item,
    ...(item.details === undefined ? {} : { details: snapshotJson(item.details) }),
  })));
  return Object.freeze({
    sceneId: scene.id,
    document,
    diagnostics: diagnosticSnapshot,
    rootNodes,
    getNode(nodeId: string): RuntimeSceneGraphNode | undefined { return nodes.get(nodeId); },
    getComponent(instanceId: string): RuntimeComponentSnapshot | undefined {
      const component = world.listComponents().find((item) => item.id === instanceId);
      return component ? Object.freeze(component) : undefined;
    },
    getAsset(assetId: string): AssetReference | undefined { return assets.get(assetId); },
    getPrefab(prefabId: string): PrefabReference | undefined { return prefabs.get(prefabId); },
  });
}

/**
 * Loads Project Model v1 Scene documents into an inactive ComponentWorld session.
 * The host supplies document I/O and registers executable Component modules.
 */
export class ProjectSceneLoader implements SceneLoader {
  private readonly project: ProjectDocumentV1;
  private readonly registry: ComponentRegistry;
  private readonly assets: ReadonlyMap<string, AssetReference>;
  private readonly prefabs: ReadonlyMap<string, PrefabReference>;
  private readonly schemas: ReadonlyMap<string, ComponentTypeSchemaV1>;
  private readonly prefabIds: ReadonlySet<string>;
  private readonly projectDiagnostics: readonly CoreDiagnostic[];
  private readonly readAssetDocument: ProjectSceneLoaderOptions["readAssetDocument"];

  constructor(options: ProjectSceneLoaderOptions) {
    const projectResult = validateProjectDocument(options.project);
    if (!projectResult.valid || !projectResult.value) {
      const code = projectResult.diagnostics[0]?.code ?? "PROJECT_INVALID_DOCUMENT";
      throw new SceneLoaderError(
        code,
        "Project Model v1 validation failed.",
        projectResult.diagnostics,
      );
    }

    this.project = snapshotJson(projectResult.value);
    this.projectDiagnostics = Object.freeze(projectResult.diagnostics.map((item) => Object.freeze({ ...item })));
    this.assets = new Map(this.project.assets.map((asset) => [asset.id, asset] as const));
    this.prefabs = new Map(this.project.prefabs.map((prefab) => [prefab.id, prefab] as const));
    this.prefabIds = new Set(this.prefabs.keys());
    this.readAssetDocument = options.readAssetDocument;

    // Capture the executable registry at composition time so an in-flight load
    // cannot observe registration changes halfway through hydration.
    this.registry = new ComponentRegistry();
    for (const definition of options.registry.list()) this.registry.register(definition);
    this.schemas = new Map(
      [...this.registry.typeIds].flatMap((typeId) => {
        const definition = this.registry.get(typeId);
        return definition ? [[typeId, definition.schema] as const] : [];
      }),
    );
  }

  async load(request: SceneLoadRequest): Promise<ProjectRuntimeSceneSession> {
    let world: ComponentWorld | undefined;
    try {
      throwIfAborted(request.sceneId, request.signal);
      if (typeof request.sceneId !== "string" || request.sceneId.trim().length === 0) {
        throw new SceneLoaderError(
          "PROJECT_INVALID_REFERENCE",
          "A Scene load request requires a stable Scene ID.",
          [diagnostic("PROJECT_INVALID_REFERENCE", "Scene ID is missing.", "sceneId")],
        );
      }

      const sceneReference = this.project.scenes.find((scene) => scene.id === request.sceneId);
      if (!sceneReference) {
        throw new SceneLoaderError(
          "PROJECT_INVALID_REFERENCE",
          "Scene " + request.sceneId + " is not declared by the Project.",
          [diagnostic("PROJECT_INVALID_REFERENCE", "Scene ID is not registered by the Project.", "sceneId", request.sceneId)],
        );
      }
      const sceneAsset = this.assets.get(sceneReference.assetId);
      if (!sceneAsset || sceneAsset.kind !== "scene") {
        throw new SceneLoaderError(
          "PROJECT_INVALID_REFERENCE",
          "Scene " + request.sceneId + " does not resolve to a Scene asset.",
          [diagnostic("PROJECT_INVALID_REFERENCE", "Scene asset reference is missing or has the wrong kind.", "scenes", request.sceneId)],
        );
      }

      this.reportProgress(request, 0, "Resolving Scene");
      const content = await awaitWithAbort(
        this.readAssetDocument(sceneAsset, request.signal),
        request.sceneId,
        request.signal,
      );
      throwIfAborted(request.sceneId, request.signal);
      if (typeof content !== "string") {
        throw new SceneLoaderError(
          "PROJECT_PARSE_ERROR",
          "Scene document resolver must return UTF-8 JSON text.",
          [diagnostic("PROJECT_PARSE_ERROR", "Scene document resolver returned a non-string value.", sceneAsset.path, request.sceneId)],
        );
      }

      this.reportProgress(request, 0.25, "Parsing Scene document");
      const validationContext: SceneValidationContext = {
        assets: this.assets,
        componentSchemas: this.schemas,
        registeredComponentTypes: this.registry.typeIds,
        prefabIds: this.prefabIds,
      };
      const parsed = parseSceneDocument(content, validationContext);
      if (!parsed.value) {
        const code = parsed.diagnostics[0]?.code ?? "SCENE_INVALID_NODE";
        throw new SceneLoaderError(
          code,
          "Scene " + request.sceneId + " failed native document validation.",
          parsed.diagnostics,
        );
      }
      const scene = parsed.value;
      if (scene.id !== request.sceneId) {
        throw new SceneLoaderError(
          "PROJECT_INVALID_REFERENCE",
          "Scene document ID does not match the Project Scene reference.",
          [diagnostic("PROJECT_INVALID_REFERENCE", "Scene document ID must match the requested Project Scene ID.", "id", scene.id)],
        );
      }

      const moduleDiagnostics = collectModuleDiagnostics(scene, this.project, this.registry);
      if (moduleDiagnostics.length > 0) {
        const code = moduleDiagnostics[0]?.code ?? "PROJECT_INVALID_REFERENCE";
        throw new SceneLoaderError(
          code,
          "Scene " + request.sceneId + " references Component modules that are not resolvable.",
          moduleDiagnostics,
        );
      }
      throwIfAborted(request.sceneId, request.signal);
      this.reportProgress(request, 0.45, "Scene references and Component schemas validated");

      const nodeIds = new Set<string>();
      const collectIds = (nodes: readonly NodeDocument[]): void => {
        for (const node of nodes) {
          nodeIds.add(node.id);
          collectIds(node.children);
        }
      };
      collectIds(scene.rootNodes);

      world = new ComponentWorld(scene.id, this.registry, {
        schemaContext: {
          assets: this.assets,
          nodeIds,
        },
      });

      const records: NodeBuildRecord[] = [];
      const roots = createNodeRecords(scene.rootNodes, world, records, undefined, request.signal, scene.id);
      this.reportProgress(request, 0.65, "Runtime Node hierarchy created");
      attachNodeComponents(roots, world, request.signal, scene.id);
      throwIfAborted(request.sceneId, request.signal);
      this.reportProgress(request, 0.9, "Component instances hydrated");

      const graph = createRuntimeGraph(scene, roots, world, this.assets, this.prefabs, [...this.projectDiagnostics, ...parsed.diagnostics]);
      const session = new ProjectRuntimeSceneSessionImpl(world, graph, records);
      throwIfAborted(request.sceneId, request.signal);
      this.reportProgress(request, 1, "Inactive runtime session ready");
      return session;
    } catch (error) {
      const primary = toLoaderError(error, "Scene " + request.sceneId + " could not be loaded");
      if (world && !world.isDisposed) {
        try {
          world.dispose();
        } catch (cleanupError) {
          const cleanup = toLoaderError(cleanupError, "Scene rollback cleanup failed");
          throw new SceneLoaderError(
            primary.code,
            primary.message + "; rollback also reported an error.",
            [...primary.diagnostics, ...cleanup.diagnostics],
            new AggregateError([primary, cleanup], "Scene load and rollback failed."),
          );
        }
      }
      throw primary;
    }
  }

  private reportProgress(request: SceneLoadRequest, progress: number, message: string): void {
    throwIfAborted(request.sceneId, request.signal);
    request.onProgress?.({ progress, message } satisfies SceneLoadProgress);
    throwIfAborted(request.sceneId, request.signal);
  }
}

class ProjectRuntimeSceneSessionImpl implements ProjectRuntimeSceneSession {
  private stateValue: RuntimeSceneSessionState = "inactive";

  constructor(
    readonly world: ComponentWorld,
    readonly graph: RuntimeSceneGraph,
    private readonly records: readonly NodeBuildRecord[],
  ) {}

  get sceneId(): string { return this.graph.sceneId; }
  get state(): RuntimeSceneSessionState { return this.stateValue; }
  get isActive(): boolean { return this.stateValue === "active" || this.stateValue === "paused"; }
  get isPaused(): boolean { return this.stateValue === "paused"; }

  activate(): void {
    this.assertNotDisposed();
    if (this.isActive) return;

    const effectiveActivity = new Map<string, boolean>();
    try {
      for (const record of this.records) {
        const parentActive = record.parentId === undefined
          ? true
          : effectiveActivity.get(record.parentId) === true;
        const active = parentActive && record.document.active;
        effectiveActivity.set(record.runtime.id, active);
        if (active) this.world.setNodeActive(record.runtime.id, true);
      }
      this.stateValue = "active";
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const record of [...this.records].reverse()) {
        try {
          this.world.setNodeActive(record.runtime.id, false);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) {
        try {
          this.world.dispose();
        } catch (disposeError) {
          rollbackErrors.push(disposeError);
        }
        this.stateValue = "disposed";
      } else {
        this.stateValue = "inactive";
      }
      const primary = toLoaderError(error, "Scene " + this.sceneId + " activation failed");
      const rollbackDiagnostics = rollbackErrors.map((item) =>
        diagnostic("SCENE_LOAD_FAILED", "Activation rollback failed: " + errorMessage(item), "scene"),
      );
      throw new SceneLoaderError(
        "SCENE_LOAD_FAILED",
        "Scene " + this.sceneId + " could not be activated atomically.",
        [...primary.diagnostics, ...rollbackDiagnostics],
        rollbackErrors.length > 0
          ? new AggregateError([primary, ...rollbackErrors], "Scene activation and rollback failed.")
          : primary,
      );
    }
  }

  deactivate(): void {
    if (this.stateValue === "disposed" || this.stateValue === "inactive") return;
    const errors: unknown[] = [];
    for (const record of [...this.records].reverse()) {
      try {
        this.world.setNodeActive(record.runtime.id, false);
      } catch (error) {
        errors.push(error);
      }
    }
    this.stateValue = "inactive";
    if (errors.length > 0) {
      throw new SceneLoaderError(
        "SCENE_LOAD_FAILED",
        "Scene " + this.sceneId + " deactivation encountered lifecycle errors.",
        errors.map((error) => diagnostic("SCENE_LOAD_FAILED", errorMessage(error), "scene")),
        new AggregateError(errors, "Scene deactivation failed."),
      );
    }
  }

  pause(): void {
    this.assertNotDisposed();
    if (this.stateValue === "active") this.stateValue = "paused";
  }

  resume(): void {
    this.assertNotDisposed();
    if (this.stateValue === "paused") this.stateValue = "active";
  }

  dispose(): void {
    if (this.stateValue === "disposed") return;
    try {
      this.world.dispose();
    } catch (error) {
      this.stateValue = "disposed";
      throw toLoaderError(error, "Scene " + this.sceneId + " disposal failed");
    }
    this.stateValue = "disposed";
  }

  private assertNotDisposed(): void {
    if (this.stateValue === "disposed" || this.world.isDisposed) {
      this.stateValue = "disposed";
      throw new SceneLoaderError(
        "CORE_WORLD_DISPOSED",
        "Scene " + this.sceneId + " session has already been disposed.",
        [diagnostic("CORE_WORLD_DISPOSED", "A disposed Scene session cannot change state.", "scene", this.sceneId)],
      );
    }
  }
}
