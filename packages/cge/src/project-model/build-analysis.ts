import {
  validateComponentTypeSchema,
  type ComponentTypeSchemaV1,
} from "../components/component-schema.js";
import {
  hasErrors,
  type CoreDiagnostic,
  type CoreDiagnosticSource,
} from "../diagnostics.js";
import { isRecord, isSafeProjectPath } from "../json.js";
import {
  isValidStableId,
  type AssetReference,
  type ProjectDocumentV1,
  type SceneDocumentV1,
  type PrefabDocumentV1,
} from "./contracts.js";
import {
  validateProjectDocument,
  validateSceneDocument,
  validatePrefabDocument,
} from "./validation.js";

export type ProjectBuildGraphNodeKind =
  | "project"
  | "asset"
  | "scene"
  | "prefab"
  | "module"
  | "package"
  | "feature"
  | "runtime-file"
  | "output-file";

export type ProjectBuildGraphEdgeKind =
  | "declares"
  | "contains"
  | "references"
  | "imports"
  | "depends-on"
  | "provides"
  | "emits";

export interface ProjectBuildGraphNode {
  id: string;
  kind: ProjectBuildGraphNodeKind;
  name: string;
  path?: string;
  sizeBytes?: number;
  scope?: ProjectBuildPackageScope;
  target?: string;
}

export interface ProjectBuildGraphEdge {
  from: string;
  to: string;
  kind: ProjectBuildGraphEdgeKind;
  reason?: string;
}

export type ProjectBuildPackageScope =
  | "runtime"
  | "editor"
  | "build"
  | "qa"
  | "development";

export interface ProjectBuildFileSnapshot {
  path: string;
  kind: "file" | "directory" | "symlink";
  sizeBytes?: number;
}

export interface ProjectBuildDocumentSnapshot {
  assetId: string;
  document: unknown;
}

export interface ProjectBuildModuleImport {
  specifier: string;
  kind: "static" | "dynamic";
  resolvedModuleId?: string;
  resolvedPackageId?: string;
}

export interface ProjectBuildModuleSnapshot {
  id: string;
  path: string;
  assetId?: string;
  entryPoint?: "runtime" | "adapter" | "component";
  imports?: readonly ProjectBuildModuleImport[];
}

export interface ProjectBuildPackageSnapshot {
  /** Stable identity of this exact installed npm package instance. */
  id: string;
  name: string;
  version: string;
  scope: ProjectBuildPackageScope;
  /** IDs of exact installed package instances selected by npm for each dependency. */
  dependencies: readonly string[];
  optionalDependencies?: readonly string[];
  supportedTargets?: readonly string[];
}

export interface ProjectBuildFeatureSnapshot {
  id: string;
  /** Exact installed npm package instance that provides the feature. */
  providerPackageId?: string;
  selected: boolean;
  available: boolean;
  targetCompatible: boolean;
}

export interface ProjectBuildRuntimeFileSnapshot {
  id: string;
  path: string;
  available: boolean;
  required: boolean;
  referencedByNodeIds?: readonly string[];
  sizeBytes?: number;
}

export interface ProjectBuildAssetReference {
  assetId: string;
  sourceNodeId: string;
  reason: string;
  path?: string;
}

export interface ProjectBuildDynamicEntryPoint {
  sourceModuleId: string;
  specifier: string;
  targetModuleId?: string;
  targetPackageId?: string;
}

export interface ProjectBuildCoverage {
  resourceReferences: boolean;
  moduleImports: boolean;
  packageDependencies: boolean;
  dynamicImports: boolean;
  externalRuntimeFiles: boolean;
}

export interface ProjectBuildOutputFile {
  path: string;
  sizeBytes: number;
  gzipBytes?: number;
  brotliBytes?: number;
  includesNodeIds: readonly string[];
}

export interface ProjectBuildOutputManifest {
  production: boolean;
  target: string;
  toolchain: string;
  files: readonly ProjectBuildOutputFile[];
}

export interface ProjectBuildAnalysisInput {
  project: unknown;
  target: string;
  files: readonly ProjectBuildFileSnapshot[];
  scenes: readonly ProjectBuildDocumentSnapshot[];
  prefabs: readonly ProjectBuildDocumentSnapshot[];
  componentSchemas?: readonly ComponentTypeSchemaV1[];
  modules?: readonly ProjectBuildModuleSnapshot[];
  packages?: readonly ProjectBuildPackageSnapshot[];
  features?: readonly ProjectBuildFeatureSnapshot[];
  runtimeFiles?: readonly ProjectBuildRuntimeFileSnapshot[];
  assetReferences?: readonly ProjectBuildAssetReference[];
  dynamicEntryPoints?: readonly ProjectBuildDynamicEntryPoint[];
  coverage?: ProjectBuildCoverage;
  outputManifest?: ProjectBuildOutputManifest;
  pathCaseSensitive?: boolean;
}

export interface ProjectBuildExcludedNode {
  nodeId: string;
  reason: string;
}

export interface ProjectBuildGraph {
  nodes: ProjectBuildGraphNode[];
  edges: ProjectBuildGraphEdge[];
  entryPointNodeIds: string[];
  includedNodeIds: string[];
  excludedNodes: ProjectBuildExcludedNode[];
}

export type ProjectBuildOutputReport =
  | {
      status: "not-produced";
      target: string;
    }
  | {
      status: "measured";
      target: string;
      toolchain: string;
      fileCount: number;
      rawBytes: number;
      gzipBytes?: number;
      brotliBytes?: number;
      files: ProjectBuildOutputFile[];
      includedNodeIds: string[];
    };

export interface ProjectBuildAnalysisReport {
  target: string;
  projectId?: string;
  schemaVersion?: number;
  graph: {
    nodeCount: number;
    edgeCount: number;
    entryPointCount: number;
    includedNodeCount: number;
    excludedNodeCount: number;
  };
  includedAssets: string[];
  unusedAssets: string[];
  includedModules: string[];
  includedPackages: string[];
  includedPackageInstances: Array<{ id: string; name: string; version: string }>;
  includedFeatures: string[];
  output: ProjectBuildOutputReport;
}

export interface ProjectBuildAnalysisResult {
  valid: boolean;
  diagnostics: CoreDiagnostic[];
  graph: ProjectBuildGraph;
  report: ProjectBuildAnalysisReport;
}

const PACKAGE_SCOPES: readonly ProjectBuildPackageScope[] = [
  "runtime",
  "editor",
  "build",
  "qa",
  "development",
];

function createEmptyGraph(): ProjectBuildGraph {
  return {
    nodes: [],
    edges: [],
    entryPointNodeIds: [],
    includedNodeIds: [],
    excludedNodes: [],
  };
}

function makeSource(
  kind: CoreDiagnosticSource["kind"],
  id?: string,
  path?: string,
): CoreDiagnosticSource {
  return {
    kind,
    ...(id === undefined ? {} : { id }),
    ...(path === undefined ? {} : { path }),
  };
}

function addDiagnostic(
  diagnostics: CoreDiagnostic[],
  code: CoreDiagnostic["code"],
  message: string,
  source: CoreDiagnosticSource,
  path?: string,
  severity: CoreDiagnostic["severity"] = "error",
): void {
  diagnostics.push({
    code,
    severity,
    message,
    source,
    ...(path === undefined ? {} : { path }),
  });
}

function isValidByteCount(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0;
}

function safeTarget(value: string): string {
  return value.trim() || "unknown";
}

function emptyResult(target: string, diagnostics: CoreDiagnostic[]): ProjectBuildAnalysisResult {
  return {
    valid: !hasErrors(diagnostics),
    diagnostics,
    graph: createEmptyGraph(),
    report: {
      target: safeTarget(target),
      graph: {
        nodeCount: 0,
        edgeCount: 0,
        entryPointCount: 0,
        includedNodeCount: 0,
        excludedNodeCount: 0,
      },
      includedAssets: [],
      unusedAssets: [],
      includedModules: [],
      includedPackages: [],
      includedPackageInstances: [],
      includedFeatures: [],
      output: { status: "not-produced", target: safeTarget(target) },
    },
  };
}

function mapDocumentDiagnostics(
  diagnostics: CoreDiagnostic[],
  source: CoreDiagnosticSource,
  items: readonly CoreDiagnostic[],
): void {
  for (const item of items) {
    diagnostics.push({
      ...item,
      source,
    });
  }
}

function visitNodeDocuments(
  nodes: readonly import("./contracts.js").NodeDocument[],
  visit: (node: import("./contracts.js").NodeDocument) => void,
): void {
  for (const node of nodes) {
    visit(node);
    visitNodeDocuments(node.children, visit);
  }
}

function getDocumentRoots(document: SceneDocumentV1 | PrefabDocumentV1): readonly import("./contracts.js").NodeDocument[] {
  return "rootNodes" in document ? document.rootNodes : [document.root];
}

/**
 * Builds a deterministic, host-neutral preflight graph from a Project Model
 * and an explicit snapshot of resolved files, modules, npm packages and
 * measured output metadata.
 *
 * Filesystem traversal, TypeScript parsing, npm resolution and bundling stay
 * in the host/build tooling. This function consumes their bounded results;
 * it never imports project code or accesses the filesystem.
 */
export function analyzeProjectBuild(
  input: ProjectBuildAnalysisInput,
): ProjectBuildAnalysisResult {
  const diagnostics: CoreDiagnostic[] = [];
  const target = safeTarget(input.target);
  if (!input.target.trim()) {
    addDiagnostic(
      diagnostics,
      "PROJECT_BUILD_GRAPH_INVALID",
      "Build target must be a non-empty identifier.",
      makeSource("project", undefined, "project.json"),
      "target",
    );
  }

  const parsedProject = validateProjectDocument(input.project);
  mapDocumentDiagnostics(
    diagnostics,
    makeSource("project", undefined, "project.json"),
    parsedProject.diagnostics,
  );
  if (!parsedProject.valid || !parsedProject.value) {
    return emptyResult(target, diagnostics);
  }

  const project: ProjectDocumentV1 = parsedProject.value;
  const assetsById = new Map<string, AssetReference>(
    project.assets.map((asset) => [asset.id, asset]),
  );
  const componentModulesByType = new Map(
    project.componentModules.map((module) => [module.typeId, module]),
  );
  const componentSchemas = new Map<string, ComponentTypeSchemaV1>();
  let referenceDiscoveryComplete = true;
  for (const schemaInput of input.componentSchemas ?? []) {
    const validation = validateComponentTypeSchema(schemaInput);
    if (!validation.valid || !validation.value) {
      mapDocumentDiagnostics(
        diagnostics,
        makeSource("component-module", schemaInput.typeId, undefined),
        validation.diagnostics,
      );
      continue;
    }
    const schema = validation.value;
    if (componentSchemas.has(schema.typeId)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Component schema " + schema.typeId + " is provided more than once.",
        makeSource("component-module", schema.typeId),
        "componentSchemas",
      );
    } else {
      componentSchemas.set(schema.typeId, schema);
    }
    const moduleReference = componentModulesByType.get(schema.typeId);
    if (!moduleReference) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_COMPONENT_MODULE_MISSING",
        "Component schema " + schema.typeId + " is not declared by project.json.",
        makeSource("component-module", schema.typeId),
        "componentSchemas",
      );
    } else if (moduleReference.version !== schema.version) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "COMPONENT_INVALID_SCHEMA",
        "Component schema version " + schema.version + " does not match the project module version " + moduleReference.version + ".",
        makeSource("component-module", schema.typeId, assetsById.get(moduleReference.moduleAssetId)?.path),
        "version",
      );
    }
  }

  const pathCaseSensitive = input.pathCaseSensitive !== false;
  const pathKey = (value: string): string =>
    pathCaseSensitive ? value : value.toLocaleLowerCase("en-US");
  const filesByPath = new Map<string, ProjectBuildFileSnapshot>();
  for (const file of input.files ?? []) {
    const source = makeSource("file", undefined, file.path);
    if (!isSafeProjectPath(file.path)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_FILE_UNSAFE",
        "Project file path must be a safe project-relative path.",
        source,
        file.path,
      );
      continue;
    }
    if (file.sizeBytes !== undefined && !isValidByteCount(file.sizeBytes)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "File size must be a non-negative safe integer.",
        source,
        file.path,
      );
    }
    const key = pathKey(file.path);
    if (filesByPath.has(key)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_PATH_CONFLICT",
        "More than one filesystem entry resolves to the same project path.",
        source,
        file.path,
      );
      continue;
    }
    filesByPath.set(key, file);
  }

  const assetPaths = new Map<string, string>();
  for (const asset of project.assets) {
    const key = pathKey(asset.path);
    const previousAssetId = assetPaths.get(key);
    if (previousAssetId) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_PATH_CONFLICT",
        "Assets " + previousAssetId + " and " + asset.id + " use the same project path.",
        makeSource("asset", asset.id, asset.path),
        asset.path,
      );
    } else {
      assetPaths.set(key, asset.id);
    }
    const file = filesByPath.get(key);
    if (!file) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_FILE_MISSING",
        "Registered " + asset.kind + " asset " + asset.id + " is not present in the project file snapshot.",
        makeSource("asset", asset.id, asset.path),
        asset.path,
      );
    } else if (file.kind !== "file") {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_FILE_UNSAFE",
        "Registered asset must resolve to a regular file, not a " + file.kind + ".",
        makeSource("asset", asset.id, asset.path),
        asset.path,
      );
    }
  }

  const sceneSnapshots = new Map<string, unknown>();
  for (const snapshot of input.scenes ?? []) {
    if (sceneSnapshots.has(snapshot.assetId)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Scene document is supplied more than once for asset " + snapshot.assetId + ".",
        makeSource("scene", snapshot.assetId),
        "scenes",
      );
    } else {
      sceneSnapshots.set(snapshot.assetId, snapshot.document);
    }
  }
  const prefabSnapshots = new Map<string, unknown>();
  for (const snapshot of input.prefabs ?? []) {
    if (prefabSnapshots.has(snapshot.assetId)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Prefab document is supplied more than once for asset " + snapshot.assetId + ".",
        makeSource("prefab", snapshot.assetId),
        "prefabs",
      );
    } else {
      prefabSnapshots.set(snapshot.assetId, snapshot.document);
    }
  }

  const prefabIds = new Set(project.prefabs.map((reference) => reference.id));
  const prefabDocuments = new Map<string, PrefabDocumentV1>();
  for (const reference of project.prefabs) {
    const asset = assetsById.get(reference.assetId);
    const source = makeSource("prefab", reference.id, asset?.path);
    if (!asset || asset.kind !== "prefab") continue;
    if (!prefabSnapshots.has(reference.assetId)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_DOCUMENT_MISSING",
        "Registered Prefab asset has no loaded Prefab document.",
        source,
        asset.path,
      );
      continue;
    }
    const validation = validatePrefabDocument(prefabSnapshots.get(reference.assetId), {
      assets: assetsById,
      componentSchemas,
      registeredComponentTypes: new Set(componentModulesByType.keys()),
      prefabIds,
    });
    mapDocumentDiagnostics(diagnostics, source, validation.diagnostics);
    if (!validation.valid) referenceDiscoveryComplete = false;
    if (!validation.value) continue;
    if (validation.value.id !== reference.id) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_DOCUMENT_ID_MISMATCH",
        "Prefab document id " + validation.value.id + " does not match project reference id " + reference.id + ".",
        source,
        asset.path,
      );
      continue;
    }
    prefabDocuments.set(reference.id, validation.value);
  }

  for (const reference of project.prefabs) {
    const prefab = prefabDocuments.get(reference.id);
    if (!prefab) continue;
    const asset = assetsById.get(reference.assetId);
    const source = makeSource("prefab", reference.id, asset?.path);
    const validation = validatePrefabDocument(prefab, {
      assets: assetsById,
      componentSchemas,
      registeredComponentTypes: new Set(componentModulesByType.keys()),
      prefabIds,
      prefabs: prefabDocuments,
    });
    mapDocumentDiagnostics(diagnostics, source, validation.diagnostics);
    if (!validation.valid) referenceDiscoveryComplete = false;
  }

  const sceneDocuments = new Map<string, SceneDocumentV1>();
  const sceneReferencesByAsset = new Map(
    project.scenes.map((reference) => [reference.assetId, reference]),
  );
  const sceneContext = {
    assets: assetsById,
    componentSchemas,
    registeredComponentTypes: new Set(componentModulesByType.keys()),
    prefabIds,
    prefabs: prefabDocuments,
  };
  for (const reference of project.scenes) {
    const asset = assetsById.get(reference.assetId);
    const source = makeSource("scene", reference.id, asset?.path);
    if (!asset || asset.kind !== "scene") continue;
    if (!sceneSnapshots.has(reference.assetId)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_DOCUMENT_MISSING",
        "Registered Scene asset has no loaded Scene document.",
        source,
        asset.path,
      );
      continue;
    }
    const validation = validateSceneDocument(sceneSnapshots.get(reference.assetId), sceneContext);
    mapDocumentDiagnostics(diagnostics, source, validation.diagnostics);
    if (!validation.valid) referenceDiscoveryComplete = false;
    if (!validation.value) continue;
    if (validation.value.id !== reference.id) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_DOCUMENT_ID_MISMATCH",
        "Scene document id " + validation.value.id + " does not match project reference id " + reference.id + ".",
        source,
        asset.path,
      );
      continue;
    }
    sceneDocuments.set(reference.id, validation.value);
  }

  for (const assetId of sceneSnapshots.keys()) {
    if (!sceneReferencesByAsset.has(assetId)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Scene document is not registered by project.json.",
        makeSource("scene", assetId),
        "scenes",
      );
    }
  }
  const prefabAssetIds = new Set(project.prefabs.map((reference) => reference.assetId));
  for (const assetId of prefabSnapshots.keys()) {
    if (!prefabAssetIds.has(assetId)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Prefab document is not registered by project.json.",
        makeSource("prefab", assetId),
        "prefabs",
      );
    }
  }

  if (project.scenes.length === 0) {
    addDiagnostic(
      diagnostics,
      "PROJECT_BUILD_GRAPH_INVALID",
      "A production build requires at least one registered Scene.",
      makeSource("project", project.id, "project.json"),
      "scenes",
    );
  }

  const nodes: ProjectBuildGraphNode[] = [];
  const edges: ProjectBuildGraphEdge[] = [];
  const nodesById = new Map<string, ProjectBuildGraphNode>();
  const edgeKeys = new Set<string>();

  const addNode = (node: ProjectBuildGraphNode, source: CoreDiagnosticSource): void => {
    if (nodesById.has(node.id)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Build graph node " + node.id + " is declared more than once.",
        source,
        node.path,
      );
      return;
    }
    nodesById.set(node.id, node);
    nodes.push(node);
  };
  const addEdge = (
    from: string,
    to: string,
    kind: ProjectBuildGraphEdgeKind,
    reason?: string,
    source?: CoreDiagnosticSource,
  ): void => {
    if (!nodesById.has(from) || !nodesById.has(to)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Build graph edge " + from + " -> " + to + " references a missing node.",
        source ?? makeSource("project", project.id, "project.json"),
      );
      return;
    }
    const key = from + "\u0000" + to + "\u0000" + kind;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({
      from,
      to,
      kind,
      ...(reason === undefined ? {} : { reason }),
    });
  };

  const projectNodeId = "project:" + project.id;
  addNode({
    id: projectNodeId,
    kind: "project",
    name: project.name,
    path: "project.json",
  }, makeSource("project", project.id, "project.json"));

  const assetNodeIds = new Map<string, string>();
  for (const asset of project.assets) {
    const id = "asset:" + asset.id;
    assetNodeIds.set(asset.id, id);
    const fileSizeBytes = filesByPath.get(pathKey(asset.path))?.sizeBytes;
    const sizeBytes = isValidByteCount(fileSizeBytes) ? fileSizeBytes : undefined;
    addNode({
      id,
      kind: "asset",
      name: asset.id + " (" + asset.kind + ")",
      path: asset.path,
      ...(sizeBytes === undefined ? {} : { sizeBytes }),
    }, makeSource("asset", asset.id, asset.path));
    addEdge(projectNodeId, id, "declares", "Declared by project.json", makeSource("asset", asset.id, asset.path));
  }

  const sceneNodeIds = new Map<string, string>();
  for (const reference of project.scenes) {
    const assetNodeId = assetNodeIds.get(reference.assetId);
    const asset = assetsById.get(reference.assetId);
    const id = "scene:" + reference.id;
    sceneNodeIds.set(reference.id, id);
    addNode({
      id,
      kind: "scene",
      name: reference.id,
      ...(asset === undefined ? {} : { path: asset.path }),
    }, makeSource("scene", reference.id, asset?.path));
    if (assetNodeId) {
      addEdge(assetNodeId, id, "contains", "Scene document", makeSource("scene", reference.id, asset?.path));
    }
  }

  const prefabNodeIds = new Map<string, string>();
  for (const reference of project.prefabs) {
    const assetNodeId = assetNodeIds.get(reference.assetId);
    const asset = assetsById.get(reference.assetId);
    const id = "prefab:" + reference.id;
    prefabNodeIds.set(reference.id, id);
    addNode({
      id,
      kind: "prefab",
      name: reference.id,
      ...(asset === undefined ? {} : { path: asset.path }),
    }, makeSource("prefab", reference.id, asset?.path));
    if (assetNodeId) {
      addEdge(assetNodeId, id, "contains", "Prefab document", makeSource("prefab", reference.id, asset?.path));
    }
  }

  const modulesById = new Map<string, ProjectBuildModuleSnapshot>();
  const moduleNodeIds = new Map<string, string>();
  const moduleNodeByAssetId = new Map<string, string>();
  const moduleSnapshots = input.modules ?? [];
  for (const module of moduleSnapshots) {
    const source = makeSource("module", module.id, module.path);
    if (!isValidStableId(module.id) || !isSafeProjectPath(module.path)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_MODULE_MISSING",
        "Module requires a stable id and a safe project-relative source path.",
        source,
        module.path,
      );
      continue;
    }
    if (modulesById.has(module.id)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Module id " + module.id + " is declared more than once.",
        source,
        module.path,
      );
      continue;
    }
    if (module.assetId && moduleNodeByAssetId.has(module.assetId)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "More than one module descriptor points to asset " + module.assetId + ".",
        source,
        module.path,
      );
      continue;
    }
    const file = filesByPath.get(pathKey(module.path));
    if (!file || file.kind !== "file") {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_MODULE_MISSING",
        "Module source file is missing or is not a regular project file.",
        source,
        module.path,
      );
    }
    if (module.assetId) {
      const asset = assetsById.get(module.assetId);
      if (!asset || asset.kind !== "script") {
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_COMPONENT_MODULE_MISSING",
          "Module assetId must reference a registered script asset.",
          source,
          module.path,
        );
      } else if (pathKey(asset.path) !== pathKey(module.path)) {
        referenceDiscoveryComplete = false;
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_GRAPH_INVALID",
          "Module path does not match its registered script asset path.",
          source,
          module.path,
        );
      }
    }
    modulesById.set(module.id, module);
    const nodeId = "module:" + module.id;
    moduleNodeIds.set(module.id, nodeId);
    if (module.assetId) moduleNodeByAssetId.set(module.assetId, nodeId);
    const fileSizeBytes = file?.sizeBytes;
    const sizeBytes = isValidByteCount(fileSizeBytes) ? fileSizeBytes : undefined;
    addNode({
      id: nodeId,
      kind: "module",
      name: module.id,
      path: module.path,
      ...(sizeBytes === undefined ? {} : { sizeBytes }),
    }, source);
    if (module.assetId) {
      const assetNodeId = assetNodeIds.get(module.assetId);
      if (assetNodeId) addEdge(nodeId, assetNodeId, "references", "Module source asset", source);
    }
  }

  const componentModuleNodeIds = new Map<string, string>();
  for (const moduleReference of project.componentModules) {
    let nodeId = moduleNodeByAssetId.get(moduleReference.moduleAssetId);
    if (!nodeId) {
      nodeId = "module:component:" + moduleReference.typeId;
      const asset = assetsById.get(moduleReference.moduleAssetId);
      addNode({
        id: nodeId,
        kind: "module",
        name: moduleReference.typeId,
        ...(asset === undefined ? {} : { path: asset.path }),
      }, makeSource("component-module", moduleReference.typeId, asset?.path));
      const assetNodeId = assetNodeIds.get(moduleReference.moduleAssetId);
      if (assetNodeId) {
        addEdge(nodeId, assetNodeId, "references", "Component implementation source asset");
      }
      if (input.coverage?.moduleImports === true) {
        referenceDiscoveryComplete = false;
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_MODULE_MISSING",
          "The build snapshot has no resolved module descriptor for component type " + moduleReference.typeId + ".",
          makeSource("component-module", moduleReference.typeId, asset?.path),
          asset?.path,
        );
      }
    }
    componentModuleNodeIds.set(moduleReference.typeId, nodeId);
  }

  const packageNodeIdsById = new Map<string, string>();
  const packageSnapshotsById = new Map<string, ProjectBuildPackageSnapshot>();
  const packageSnapshots = input.packages ?? [];
  for (const packageSnapshot of packageSnapshots) {
    const source = makeSource("package", packageSnapshot.id);
    if (!isValidStableId(packageSnapshot.id) ||
        !packageSnapshot.name.trim() ||
        !packageSnapshot.version.trim() ||
        !PACKAGE_SCOPES.includes(packageSnapshot.scope)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Package descriptor requires a stable package-instance id, a name, a version and a supported Codogma scope.",
        source,
        "packages",
      );
      continue;
    }
    if (packageSnapshotsById.has(packageSnapshot.id)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Package instance id " + packageSnapshot.id + " appears more than once in the resolved npm graph.",
        source,
        "packages",
      );
      continue;
    }
    packageSnapshotsById.set(packageSnapshot.id, packageSnapshot);
    const nodeId = "package:" + packageSnapshot.id;
    packageNodeIdsById.set(packageSnapshot.id, nodeId);
    addNode({
      id: nodeId,
      kind: "package",
      name: packageSnapshot.name + "@" + packageSnapshot.version,
      scope: packageSnapshot.scope,
      ...(packageSnapshot.supportedTargets === undefined ? {} : { target }),
    }, source);
  }

  const featureNodesById = new Map<string, string>();
  const resolvedSelectedFeatureNodeIds = new Set<string>();
  const unselectedProviderFeatures = new Map<string, string[]>();
  for (const feature of input.features ?? []) {
    const source = makeSource("feature", feature.id);
    if (!isValidStableId(feature.id)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Feature provider descriptor requires a stable feature id.",
        source,
        "features",
      );
      continue;
    }
    if (featureNodesById.has(feature.id)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Feature " + feature.id + " is declared more than once.",
        source,
        "features",
      );
      continue;
    }
    const nodeId = "feature:" + feature.id;
    featureNodesById.set(feature.id, nodeId);
    addNode({ id: nodeId, kind: "feature", name: feature.id }, source);
    if (!feature.selected) {
      if (feature.providerPackageId) {
        const existing = unselectedProviderFeatures.get(feature.providerPackageId) ?? [];
        existing.push(feature.id);
        unselectedProviderFeatures.set(feature.providerPackageId, existing);
      }
      continue;
    }
    if (!feature.available || !feature.targetCompatible || !feature.providerPackageId) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_FEATURE_PROVIDER_MISSING",
        "Selected feature " + feature.id + " has no available provider compatible with target " + target + ".",
        source,
        "features",
      );
      continue;
    }
    const providerNodeId = packageNodeIdsById.get(feature.providerPackageId);
    if (!providerNodeId) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_FEATURE_PROVIDER_MISSING",
        "Selected feature " + feature.id + " requires missing npm package instance " + feature.providerPackageId + ".",
        source,
        "features",
      );
      continue;
    }
    addEdge(nodeId, providerNodeId, "provides", "Selected feature provider", source);
    resolvedSelectedFeatureNodeIds.add(nodeId);
  }

  for (const [packageId, packageSnapshot] of packageSnapshotsById) {
    const from = packageNodeIdsById.get(packageId);
    if (!from) continue;
    for (const dependencyId of packageSnapshot.dependencies) {
      const to = packageNodeIdsById.get(dependencyId);
      if (!to) {
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_PACKAGE_DEPENDENCY_MISSING",
          "Package " + packageSnapshot.name + "@" + packageSnapshot.version +
            " declares unresolved npm package instance " + dependencyId + ".",
          makeSource("package", packageId),
          "dependencies",
          input.coverage?.packageDependencies === true ? "error" : "warning",
        );
      } else {
        addEdge(from, to, "depends-on", "Required npm dependency instance " + dependencyId);
      }
    }
    for (const dependencyId of packageSnapshot.optionalDependencies ?? []) {
      const to = packageNodeIdsById.get(dependencyId);
      if (!to) {
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_PACKAGE_DEPENDENCY_MISSING",
          "Optional npm package instance " + dependencyId + " required by " +
            packageSnapshot.name + "@" + packageSnapshot.version + " is not installed.",
          makeSource("package", packageId),
          "optionalDependencies",
          "warning",
        );
      } else {
        addEdge(from, to, "depends-on", "Installed optional npm dependency instance " + dependencyId);
      }
    }
  }

  const moduleImports = new Map<string, ProjectBuildModuleImport[]>();
  for (const module of moduleSnapshots) {
    if (!modulesById.has(module.id)) continue;
    const from = moduleNodeIds.get(module.id);
    if (!from) continue;
    moduleImports.set(module.id, [...(module.imports ?? [])]);
    for (const imported of module.imports ?? []) {
      const source = makeSource("module", module.id, module.path);
      const hasModule = imported.resolvedModuleId !== undefined;
      const hasPackage = imported.resolvedPackageId !== undefined;
      const validKind = imported.kind === "static" || imported.kind === "dynamic";
      const validModuleId = !hasModule || isValidStableId(imported.resolvedModuleId);
      const validPackageId = !hasPackage || isValidStableId(imported.resolvedPackageId);
      if (!imported.specifier.trim() || hasModule === hasPackage ||
          !validKind || !validModuleId || !validPackageId) {
        referenceDiscoveryComplete = false;
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_IMPORT_UNRESOLVED",
          "Import " + imported.specifier + " must resolve to exactly one project module or npm package.",
          source,
          module.path,
        );
        continue;
      }
      let targetNodeId: string | undefined;
      if (hasModule && imported.resolvedModuleId) {
        targetNodeId = moduleNodeIds.get(imported.resolvedModuleId);
        if (!targetNodeId) {
          referenceDiscoveryComplete = false;
          addDiagnostic(
            diagnostics,
            "PROJECT_BUILD_IMPORT_UNRESOLVED",
            "Import " + imported.specifier + " resolves to missing module " + imported.resolvedModuleId + ".",
            source,
            module.path,
          );
          continue;
        }
      } else if (hasPackage && imported.resolvedPackageId) {
        targetNodeId = packageNodeIdsById.get(imported.resolvedPackageId);
        if (!targetNodeId) {
          referenceDiscoveryComplete = false;
          addDiagnostic(
            diagnostics,
            "PROJECT_BUILD_PACKAGE_MISSING",
            "Import " + imported.specifier + " resolves to missing npm package instance " + imported.resolvedPackageId + ".",
            source,
            module.path,
            input.coverage?.packageDependencies === true ? "error" : "warning",
          );
          continue;
        }
      }
      if (!targetNodeId) continue;
      if (imported.kind === "dynamic") {
        const declared = (input.dynamicEntryPoints ?? []).some((entry) =>
          entry.sourceModuleId === module.id &&
          entry.specifier === imported.specifier &&
          ((entry.targetModuleId !== undefined && entry.targetModuleId === imported.resolvedModuleId) ||
           (entry.targetPackageId !== undefined && entry.targetPackageId === imported.resolvedPackageId)),
        );
        if (!declared) {
          addDiagnostic(
            diagnostics,
            "PROJECT_BUILD_DYNAMIC_ENTRY_UNDECLARED",
            "Dynamic import " + imported.specifier + " is not declared as a build entry point.",
            source,
            module.path,
          );
        }
      }
      addEdge(from, targetNodeId, "imports", imported.kind + " import " + imported.specifier, source);
    }
  }

  for (const entry of input.dynamicEntryPoints ?? []) {
    const sourceNode = moduleNodeIds.get(entry.sourceModuleId);
    if (!sourceNode) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_DYNAMIC_ENTRY_UNDECLARED",
        "Dynamic entry point references missing source module " + entry.sourceModuleId + ".",
        makeSource("module", entry.sourceModuleId),
        "dynamicEntryPoints",
      );
      continue;
    }
    const sourceModule = modulesById.get(entry.sourceModuleId);
    const hasTargetModule = entry.targetModuleId !== undefined;
    const hasTargetPackage = entry.targetPackageId !== undefined;
    if (!entry.specifier.trim() || hasTargetModule === hasTargetPackage ||
        (hasTargetModule && !isValidStableId(entry.targetModuleId)) ||
        (hasTargetPackage && !isValidStableId(entry.targetPackageId))) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_DYNAMIC_ENTRY_UNDECLARED",
        "Dynamic entry point requires a specifier and exactly one valid module or package target.",
        makeSource("module", entry.sourceModuleId, sourceModule?.path),
        sourceModule?.path,
      );
      continue;
    }
    const matchingImport = (moduleImports.get(entry.sourceModuleId) ?? []).some((imported) =>
      imported.kind === "dynamic" &&
      imported.specifier === entry.specifier &&
      ((hasTargetModule && imported.resolvedModuleId === entry.targetModuleId) ||
       (hasTargetPackage && imported.resolvedPackageId === entry.targetPackageId)),
    );
    if (!matchingImport) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_DYNAMIC_ENTRY_UNDECLARED",
        "Declared dynamic entry point does not match a resolved dynamic import.",
        makeSource("module", entry.sourceModuleId, sourceModule?.path),
        sourceModule?.path,
      );
    }
  }

  const runtimeFileNodeIds = new Map<string, string>();
  const runtimeFileIds = new Set<string>();
  const runtimeFilePaths = new Set<string>();
  for (const runtimeFile of input.runtimeFiles ?? []) {
    const source = makeSource("runtime-file", runtimeFile.id, runtimeFile.path);
    if (!isValidStableId(runtimeFile.id) || !isSafeProjectPath(runtimeFile.path)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "External runtime file requires a stable id and a non-empty path.",
        source,
        runtimeFile.path,
      );
      continue;
    }
    if (runtimeFileIds.has(runtimeFile.id)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "External runtime file id " + runtimeFile.id + " is duplicated.",
        source,
        runtimeFile.path,
      );
      continue;
    }
    const runtimePathKey = pathKey(runtimeFile.path);
    if (runtimeFilePaths.has(runtimePathKey)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_PATH_CONFLICT",
        "More than one external runtime descriptor resolves to the same path.",
        source,
        runtimeFile.path,
      );
      continue;
    }
    runtimeFileIds.add(runtimeFile.id);
    runtimeFilePaths.add(runtimePathKey);
    const id = "runtime-file:" + runtimeFile.id;
    runtimeFileNodeIds.set(runtimeFile.id, id);
    if (runtimeFile.sizeBytes !== undefined && !isValidByteCount(runtimeFile.sizeBytes)) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Runtime file size must be a non-negative safe integer.",
        source,
        runtimeFile.path,
      );
    }
    if (!runtimeFile.available) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_RUNTIME_FILE_MISSING",
        "External runtime file is unavailable.",
        source,
        runtimeFile.path,
        runtimeFile.required ? "error" : "warning",
      );
    }
    addNode({
      id,
      kind: "runtime-file",
      name: runtimeFile.id,
      path: runtimeFile.path,
      ...(isValidByteCount(runtimeFile.sizeBytes) ? { sizeBytes: runtimeFile.sizeBytes } : {}),
    }, source);
    for (const sourceNodeId of runtimeFile.referencedByNodeIds ?? []) {
      if (!nodesById.has(sourceNodeId)) {
        referenceDiscoveryComplete = false;
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_GRAPH_INVALID",
          "Runtime file reference source node " + sourceNodeId + " is not in the build graph.",
          source,
          runtimeFile.path,
        );
        continue;
      }
      if (runtimeFile.available) {
        addEdge(sourceNodeId, id, "references", "External runtime file", source);
      }
    }
  }

  for (const reference of input.assetReferences ?? []) {
    const targetNodeId = assetNodeIds.get(reference.assetId);
    if (!targetNodeId) {
      addDiagnostic(
        diagnostics,
        "PROJECT_INVALID_REFERENCE",
        "Resource reference points to missing asset " + reference.assetId + ".",
        makeSource("file", undefined, reference.path),
        reference.path,
      );
      continue;
    }
    if (!nodesById.has(reference.sourceNodeId)) {
      referenceDiscoveryComplete = false;
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_GRAPH_INVALID",
        "Resource reference source node " + reference.sourceNodeId + " is not in the build graph.",
        makeSource("file", undefined, reference.path),
        reference.path,
      );
      continue;
    }
    addEdge(
      reference.sourceNodeId,
      targetNodeId,
      "references",
      reference.reason,
      makeSource("asset", reference.assetId, reference.path),
    );
  }

  const prefabAssetNodeById = new Map<string, string>();
  for (const reference of project.prefabs) {
    const nodeId = assetNodeIds.get(reference.assetId);
    if (nodeId) prefabAssetNodeById.set(reference.id, nodeId);
  }

  const connectDocumentResources = (
    document: SceneDocumentV1 | PrefabDocumentV1,
    documentNodeId: string,
    source: CoreDiagnosticSource,
  ): void => {
    visitNodeDocuments(getDocumentRoots(document), (node) => {
      for (const component of node.components) {
        const moduleNodeId = componentModuleNodeIds.get(component.typeId);
        if (moduleNodeId) {
          addEdge(
            documentNodeId,
            moduleNodeId,
            "imports",
            "Component type " + component.typeId,
            source,
          );
        } else {
          referenceDiscoveryComplete = false;
          addDiagnostic(
            diagnostics,
            "PROJECT_BUILD_COMPONENT_MODULE_MISSING",
            "Component type " + component.typeId + " has no registered project module.",
            makeSource("component-module", component.typeId, source.path),
            source.path,
          );
        }

        const schema = componentSchemas.get(component.typeId);
        if (!schema) {
          referenceDiscoveryComplete = false;
          addDiagnostic(
            diagnostics,
            "PROJECT_BUILD_COMPONENT_SCHEMA_MISSING",
            "Component type " + component.typeId + " has no validated schema in the build snapshot.",
            makeSource("component-module", component.typeId, source.path),
            source.path,
          );
          continue;
        }
        for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
          if (propertySchema.type !== "asset" ||
              propertySchema.storage === "editorOnly" ||
              propertySchema.storage === "runtime") continue;
          const value = component.properties[propertyName];
          if (!isRecord(value) || typeof value.assetId !== "string") continue;
          const assetNodeId = assetNodeIds.get(value.assetId);
          if (!assetNodeId) continue;
          addEdge(
            documentNodeId,
            assetNodeId,
            "references",
            "Component " + component.typeId + " property " + propertyName,
            makeSource("asset", value.assetId, source.path),
          );
        }
      }

      if (node.prefabInstance) {
        const prefabAssetNodeId = prefabAssetNodeById.get(node.prefabInstance.prefabId);
        if (!prefabAssetNodeId) {
          addDiagnostic(
            diagnostics,
            "PROJECT_INVALID_REFERENCE",
            "Prefab instance references missing Prefab " + node.prefabInstance.prefabId + ".",
            makeSource("prefab", node.prefabInstance.prefabId, source.path),
            source.path,
          );
        } else {
          addEdge(
            documentNodeId,
            prefabAssetNodeId,
            "references",
            "Prefab instance " + node.id,
            source,
          );
        }
      }
    });
  };

  for (const reference of project.scenes) {
    const document = sceneDocuments.get(reference.id);
    const nodeId = sceneNodeIds.get(reference.id);
    const asset = assetsById.get(reference.assetId);
    if (document && nodeId) {
      connectDocumentResources(document, nodeId, makeSource("scene", reference.id, asset?.path));
    }
  }
  for (const reference of project.prefabs) {
    const document = prefabDocuments.get(reference.id);
    const nodeId = prefabNodeIds.get(reference.id);
    const asset = assetsById.get(reference.assetId);
    if (document && nodeId) {
      connectDocumentResources(document, nodeId, makeSource("prefab", reference.id, asset?.path));
    }
  }

  const entryPointNodeIds = new Set<string>();
  for (const reference of project.scenes) {
    const id = assetNodeIds.get(reference.assetId);
    if (id) entryPointNodeIds.add(id);
  }
  for (const module of moduleSnapshots) {
    if (module.entryPoint === "runtime" || module.entryPoint === "adapter") {
      const id = moduleNodeIds.get(module.id);
      if (id) entryPointNodeIds.add(id);
    }
  }
  for (const nodeId of resolvedSelectedFeatureNodeIds) {
    entryPointNodeIds.add(nodeId);
  }
  for (const runtimeFile of input.runtimeFiles ?? []) {
    if (!runtimeFile.required || !runtimeFile.available) continue;
    const id = runtimeFileNodeIds.get(runtimeFile.id);
    if (id) entryPointNodeIds.add(id);
  }

  const reachableNodeIds = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }
  const queue = [...entryPointNodeIds].sort();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachableNodeIds.has(current)) continue;
    reachableNodeIds.add(current);
    for (const next of outgoing.get(current) ?? []) {
      if (!reachableNodeIds.has(next)) queue.push(next);
    }
  }

  const blockedPackageIds = new Set<string>();
  for (const [packageId, packageSnapshot] of packageSnapshotsById) {
    const nodeId = packageNodeIdsById.get(packageId);
    if (!nodeId || !reachableNodeIds.has(nodeId)) continue;
    const source = makeSource("package", packageId);
    const packageLabel = packageSnapshot.name + "@" + packageSnapshot.version;
    if (packageSnapshot.scope !== "runtime") {
      blockedPackageIds.add(nodeId);
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_PACKAGE_SCOPE_INVALID",
        "Package " + packageLabel + " has scope " + packageSnapshot.scope + " and cannot be included in a production game runtime.",
        source,
        "scope",
      );
    }
    if (packageSnapshot.supportedTargets &&
        packageSnapshot.supportedTargets.length > 0 &&
        !packageSnapshot.supportedTargets.includes(target)) {
      blockedPackageIds.add(nodeId);
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_PACKAGE_TARGET_UNSUPPORTED",
        "Package " + packageLabel + " does not support target " + target + ".",
        source,
        "supportedTargets",
      );
    }
  }

  const includedNodeIds = new Set<string>();
  const productionQueue = [...entryPointNodeIds].sort();
  while (productionQueue.length > 0) {
    const current = productionQueue.shift();
    if (!current || includedNodeIds.has(current) || blockedPackageIds.has(current)) continue;
    includedNodeIds.add(current);
    for (const next of outgoing.get(current) ?? []) {
      if (!includedNodeIds.has(next) && !blockedPackageIds.has(next)) productionQueue.push(next);
    }
  }

  const unselectedFeatureByPackage = new Map<string, string[]>();
  for (const [packageId, featureIds] of unselectedProviderFeatures) {
    unselectedFeatureByPackage.set(packageId, featureIds);
  }

  const unusedAnalysisComplete = referenceDiscoveryComplete &&
    input.coverage?.resourceReferences === true &&
    input.coverage.moduleImports === true &&
    input.coverage.packageDependencies === true &&
    input.coverage.dynamicImports === true &&
    input.coverage.externalRuntimeFiles === true;
  const excludedNodes: ProjectBuildExcludedNode[] = [];
  for (const node of nodes) {
    if (node.kind === "project" || includedNodeIds.has(node.id)) continue;
    let reason = "not-reachable-from-production-entry-points";
    if (node.kind === "feature") {
      const feature = (input.features ?? []).find((item) => "feature:" + item.id === node.id);
      if (feature && !feature.selected) reason = "feature-not-selected";
      else if (feature && !resolvedSelectedFeatureNodeIds.has(node.id)) reason = "provider-unavailable";
    } else if (node.kind === "package") {
      const packageId = node.id.slice("package:".length);
      if (unselectedFeatureByPackage.has(packageId)) reason = "feature-not-selected";
      else if (blockedPackageIds.has(node.id)) reason = "scope-or-target-incompatible";
      else if (reachableNodeIds.has(node.id)) reason = "blocked-by-incompatible-dependency";
    } else if (node.kind === "asset") {
      const asset = project.assets.find((item) => "asset:" + item.id === node.id);
      if (asset && asset.kind !== "scene" && asset.kind !== "prefab") {
        reason = unusedAnalysisComplete ? "unreferenced-resource" : "reference-scan-incomplete";
      }
    }
    excludedNodes.push({ nodeId: node.id, reason });
  }

  if (!unusedAnalysisComplete) {
    const missingCoverage = [
      ["resourceReferences", input.coverage?.resourceReferences],
      ["moduleImports", input.coverage?.moduleImports],
      ["packageDependencies", input.coverage?.packageDependencies],
      ["dynamicImports", input.coverage?.dynamicImports],
      ["externalRuntimeFiles", input.coverage?.externalRuntimeFiles],
    ].filter((item) => item[1] !== true).map((item) => item[0]).join(", ");
    addDiagnostic(
      diagnostics,
      "PROJECT_BUILD_REFERENCE_SCAN_INCOMPLETE",
      "Build graph discovery is incomplete for: " + missingCoverage + ". Unused-resource diagnostics require complete resource, module, dynamic-import and external-runtime references.",
      makeSource("project", project.id, "project.json"),
      "build-analysis",
      "warning",
    );
  }

  const unusedAssets: string[] = [];
  if (unusedAnalysisComplete) {
    for (const asset of project.assets) {
      if (asset.kind === "scene" || asset.kind === "prefab") continue;
      const nodeId = assetNodeIds.get(asset.id);
      if (nodeId && !includedNodeIds.has(nodeId)) {
        unusedAssets.push(asset.id);
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_RESOURCE_UNUSED",
          "Asset " + asset.id + " is not reachable from the selected production entry points.",
          makeSource("asset", asset.id, asset.path),
          asset.path,
          "warning",
        );
      }
    }
  }

  let finalizedOutput: ProjectBuildOutputReport = {
    status: "not-produced",
    target,
  };
  if (input.outputManifest) {
    const manifest = input.outputManifest;
    if (!manifest.production || manifest.target !== target || !manifest.toolchain.trim()) {
      addDiagnostic(
        diagnostics,
        "PROJECT_BUILD_OUTPUT_INVALID",
        "Output manifest must describe a production build for the selected target and identify its toolchain.",
        makeSource("artifact", undefined, "output-manifest"),
        "output-manifest",
      );
    } else {
      const outputFiles: ProjectBuildOutputFile[] = [];
      const outputPaths = new Set<string>();
      let outputInvalid = manifest.files.length === 0;
      if (outputInvalid) {
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_OUTPUT_INVALID",
          "Production output manifest must contain at least one file.",
          makeSource("artifact", undefined, "output-manifest"),
          "output-manifest",
        );
      }
      const includedOutputNodes = new Set<string>();
      let rawBytes = 0;
      let gzipBytes = 0;
      let brotliBytes = 0;
      let gzipComplete = true;
      let brotliComplete = true;
      for (const file of manifest.files) {
        const source = makeSource("artifact", undefined, file.path);
        const key = pathKey(file.path);
        if (!isSafeProjectPath(file.path) || outputPaths.has(key) ||
            !isValidByteCount(file.sizeBytes) ||
            (file.gzipBytes !== undefined && !isValidByteCount(file.gzipBytes)) ||
            (file.brotliBytes !== undefined && !isValidByteCount(file.brotliBytes))) {
          outputInvalid = true;
          addDiagnostic(
            diagnostics,
            "PROJECT_BUILD_OUTPUT_INVALID",
            "Output file path or measured byte counts are invalid or duplicated.",
            source,
            file.path,
          );
          continue;
        }
        outputPaths.add(key);
        rawBytes += file.sizeBytes;
        if (file.gzipBytes === undefined) gzipComplete = false;
        else gzipBytes += file.gzipBytes;
        if (file.brotliBytes === undefined) brotliComplete = false;
        else brotliBytes += file.brotliBytes;
        const includesNodeIds = [...new Set(file.includesNodeIds)].sort();
        for (const nodeId of includesNodeIds) {
          const node = nodesById.get(nodeId);
          if (!node) {
            outputInvalid = true;
            addDiagnostic(
              diagnostics,
              "PROJECT_BUILD_OUTPUT_INVALID",
              "Output manifest references unknown graph node " + nodeId + ".",
              source,
              file.path,
            );
            continue;
          }
          includedOutputNodes.add(nodeId);
          if (node.kind === "package" && node.scope !== "runtime") {
            addDiagnostic(
              diagnostics,
              "PROJECT_BUILD_OUTPUT_SCOPE_LEAK",
              "Production output contains non-runtime package " + node.name + ".",
              source,
              file.path,
            );
          }
          if (!includedNodeIds.has(nodeId)) {
            addDiagnostic(
              diagnostics,
              "PROJECT_BUILD_OUTPUT_INVALID",
              "Output contains graph node " + nodeId + " that is not selected for the production target.",
              source,
              file.path,
            );
          }
        }
        addNode({
          id: "output:" + file.path,
          kind: "output-file",
          name: file.path,
          path: file.path,
          sizeBytes: file.sizeBytes,
        }, source);
        for (const nodeId of includesNodeIds) {
          if (nodesById.has(nodeId)) {
            addEdge(nodeId, "output:" + file.path, "emits", "Reported by production output manifest", source);
          }
        }
        outputFiles.push({
          path: file.path,
          sizeBytes: file.sizeBytes,
          ...(file.gzipBytes === undefined ? {} : { gzipBytes: file.gzipBytes }),
          ...(file.brotliBytes === undefined ? {} : { brotliBytes: file.brotliBytes }),
          includesNodeIds,
        });
      }
      if (!Number.isSafeInteger(rawBytes) ||
          (gzipComplete && !Number.isSafeInteger(gzipBytes)) ||
          (brotliComplete && !Number.isSafeInteger(brotliBytes))) {
        outputInvalid = true;
        addDiagnostic(
          diagnostics,
          "PROJECT_BUILD_OUTPUT_INVALID",
          "Output size totals exceed the safe integer range.",
          makeSource("artifact", undefined, "output-manifest"),
          "output-manifest",
        );
      } else if (!outputInvalid) {
        const sortedOutputFiles = outputFiles.sort((left, right) => left.path.localeCompare(right.path));
        finalizedOutput = {
          status: "measured",
          target,
          toolchain: manifest.toolchain,
          fileCount: sortedOutputFiles.length,
          rawBytes,
          ...(gzipComplete ? { gzipBytes } : {}),
          ...(brotliComplete ? { brotliBytes } : {}),
          files: sortedOutputFiles,
          includedNodeIds: [...includedOutputNodes].sort(),
        };
      }
    }
  }

  nodes.sort((left, right) => left.id.localeCompare(right.id));
  edges.sort((left, right) =>
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to) ||
    left.kind.localeCompare(right.kind),
  );
  const sortedIncluded = [...includedNodeIds].sort();
  const sortedExcluded = excludedNodes.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const includedAssetIds = project.assets
    .filter((asset) => includedNodeIds.has(assetNodeIds.get(asset.id) ?? ""))
    .map((asset) => asset.id)
    .sort();
  const includedModules = nodes
    .filter((node) => node.kind === "module" && includedNodeIds.has(node.id))
    .map((node) => node.id.slice("module:".length))
    .sort();
  const includedPackages = nodes
    .filter((node) => node.kind === "package" && includedNodeIds.has(node.id))
    .map((node) => node.name)
    .sort();
  const includedPackageInstances = nodes
    .filter((node) => node.kind === "package" && includedNodeIds.has(node.id))
    .map((node) => {
      const id = node.id.slice("package:".length);
      const packageSnapshot = packageSnapshotsById.get(id);
      return {
        id,
        name: packageSnapshot?.name ?? node.name,
        version: packageSnapshot?.version ?? "",
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const graph: ProjectBuildGraph = {
    nodes,
    edges,
    entryPointNodeIds: [...entryPointNodeIds].sort(),
    includedNodeIds: sortedIncluded,
    excludedNodes: sortedExcluded,
  };
  const includedFeatures = nodes
    .filter((node) => node.kind === "feature" && includedNodeIds.has(node.id))
    .map((node) => node.id.slice("feature:".length))
    .sort();
  const report: ProjectBuildAnalysisReport = {
    target,
    projectId: project.id,
    schemaVersion: project.schemaVersion,
    graph: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      entryPointCount: entryPointNodeIds.size,
      includedNodeCount: includedNodeIds.size,
      excludedNodeCount: sortedExcluded.length,
    },
    includedAssets: includedAssetIds,
    unusedAssets: unusedAssets.sort(),
    includedModules,
    includedPackages,
    includedPackageInstances,
    includedFeatures,
    output: finalizedOutput,
  };
  return {
    valid: !hasErrors(diagnostics),
    diagnostics,
    graph,
    report,
  };
}
