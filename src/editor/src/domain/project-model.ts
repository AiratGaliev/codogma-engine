import { BUILTIN_COMPONENT_TYPE_IDS, BUILTIN_COMPONENT_TYPES } from "./builtin-component-ids.js";
import { getNativeFxType, validateNativeFxComponentProperties, validateNativeFxPropertyValues } from "./fx-validation.js";
import {
  parsePrefabDocument,
  parseProjectDocument,
  parseSceneDocument,
  serializePrefabDocument,
  serializeProjectDocument,
  serializeSceneDocument,
  validateProjectDocument,
  type AssetReference,
  type ComponentTypeSchemaV1,
  type NodeDocument,
  type NodeReferenceKind,
  type PrefabDocumentV1,
  type ProjectDocumentV1,
  type SceneDocumentV1,
} from "@codogma/cge";

export const PROJECT_MANIFEST_PATH = "project.json";
export const NATIVE_SCENE_EXTENSION = ".cge-scene.json";
export const NATIVE_PREFAB_EXTENSION = ".cge-prefab.json";

export class NativeProjectDocumentError extends Error {
  readonly diagnostics: readonly { code: string; message: string; path?: string }[];

  constructor(label: string, diagnostics: readonly { code: string; message: string; path?: string }[]) {
    const details = diagnostics.map((item) =>
      item.path ? `${item.path}: ${item.message}` : item.message,
    );
    super(`${label} is invalid.${details.length ? ` ${details.join("; ")}` : ""}`);
    this.name = "NativeProjectDocumentError";
    this.diagnostics = diagnostics;
  }
}

function requireParsed<T>(
  label: string,
  result: { value?: T; diagnostics: readonly { code: string; message: string; path?: string }[] },
): T {
  if (!result.value) throw new NativeProjectDocumentError(label, result.diagnostics);
  return result.value;
}

function assetById(project: ProjectDocumentV1, assetId: string, kind: AssetReference["kind"]): AssetReference {
  const asset = project.assets.find((item) => item.id === assetId);
  if (!asset || asset.kind !== kind) {
    throw new Error(`Project manifest reference "${assetId}" does not resolve to a ${kind} asset.`);
  }
  return asset;
}

export function parseNativeProjectDocument(content: string): ProjectDocumentV1 {
  return requireParsed("Native Project document", parseProjectDocument(content));
}

export function serializeNativeProjectDocument(project: ProjectDocumentV1): string {
  return serializeProjectDocument(project);
}

export function resolveSceneAsset(project: ProjectDocumentV1, sceneId: string): AssetReference {
  const reference = project.scenes.find((item) => item.id === sceneId);
  if (!reference) throw new Error(`Scene "${sceneId}" is not registered in project.json.`);
  return assetById(project, reference.assetId, "scene");
}

export function resolvePrefabAsset(project: ProjectDocumentV1, prefabId: string): AssetReference {
  const reference = project.prefabs.find((item) => item.id === prefabId);
  if (!reference) throw new Error(`Prefab "${prefabId}" is not registered in project.json.`);
  return assetById(project, reference.assetId, "prefab");
}

export function findSceneReferenceByAssetPath(
  project: ProjectDocumentV1,
  path: string,
): ProjectDocumentV1["scenes"][number] | undefined {
  return project.scenes.find((reference) => {
    const asset = project.assets.find((item) => item.id === reference.assetId);
    return asset?.kind === "scene" && asset.path === path;
  });
}

export function findPrefabReferenceByAssetPath(
  project: ProjectDocumentV1,
  path: string,
): ProjectDocumentV1["prefabs"][number] | undefined {
  return project.prefabs.find((reference) => {
    const asset = project.assets.find((item) => item.id === reference.assetId);
    return asset?.kind === "prefab" && asset.path === path;
  });
}

function collectNativeNodeKinds(roots: readonly NodeDocument[]): ReadonlyMap<string, NodeReferenceKind> {
  const result = new Map<string, NodeReferenceKind>();
  const visit = (node: NodeDocument): void => {
    const renderer = node.components.find((component) =>
      component.typeId === BUILTIN_COMPONENT_TYPES.imageRenderer ||
      component.typeId === BUILTIN_COMPONENT_TYPES.textRenderer ||
      component.typeId === BUILTIN_COMPONENT_TYPES.container,
    );
    let kind: NodeReferenceKind = "Node";
    if (node.prefabInstance) kind = "Prefab";
    else if (renderer?.typeId === BUILTIN_COMPONENT_TYPES.imageRenderer) kind = "Image";
    else if (renderer?.typeId === BUILTIN_COMPONENT_TYPES.textRenderer) kind = "Text";
    else if (renderer?.typeId === BUILTIN_COMPONENT_TYPES.container) kind = "Container";
    result.set(node.id, kind);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return result;
}

function nodeKindsFromContent(content: string, documentKind: "scene" | "prefab"): ReadonlyMap<string, NodeReferenceKind> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return undefined;
    const record = parsed as Record<string, unknown>;
    const roots = documentKind === "scene"
      ? record.rootNodes
      : record.root && typeof record.root === "object" ? [record.root] : undefined;
    if (!Array.isArray(roots)) return undefined;
    return collectNativeNodeKinds(roots as NodeDocument[]);
  } catch {
    return undefined;
  }
}

function createSceneValidationContext(
  project: ProjectDocumentV1,
  prefabDocuments?: readonly PrefabDocumentV1[],
  componentSchemas?: ReadonlyMap<string, ComponentTypeSchemaV1>,
  nodeKinds?: ReadonlyMap<string, NodeReferenceKind>,
) {
  const prefabs = prefabDocuments ? new Map(prefabDocuments.map((prefab) => [prefab.id, prefab])) : undefined;
  return {
    assets: new Map(project.assets.map((asset) => [asset.id, asset])),
    prefabIds: new Set(project.prefabs.map((prefab) => prefab.id)),
    ...(prefabs ? { prefabs } : {}),
    ...(componentSchemas ? { componentSchemas } : {}),
    ...(nodeKinds ? { nodeKinds } : {}),
    registeredComponentTypes: new Set([
      ...BUILTIN_COMPONENT_TYPE_IDS,
      ...project.componentModules.map((module) => module.typeId),
    ]),
  };
}

function findPrefabNodeById(root: NodeDocument, targetId: string): NodeDocument | undefined {
  if (root.id === targetId) return root;
  for (const child of root.children) {
    const found = findPrefabNodeById(child, targetId);
    if (found) return found;
  }
  return undefined;
}

function assertImageAssetReference(
  project: ProjectDocumentV1,
  assetId: unknown,
  path: string,
  diagnostics: Array<{ code: string; message: string; path: string }>,
): void {
  const asset = typeof assetId === "string"
    ? project.assets.find((item) => item.id === assetId)
    : undefined;
  if (!asset) {
    diagnostics.push({
      code: "PROJECT_INVALID_REFERENCE",
      message: typeof assetId === "string" && assetId.trim()
        ? `Image Asset "${assetId}" is not registered in project.json.`
        : "Image Renderer assetId must reference a registered Project image Asset.",
      path,
    });
  } else if (asset.kind !== "image") {
    diagnostics.push({
      code: "PROJECT_INVALID_REFERENCE",
      message: `Asset "${assetId}" has kind "${asset.kind}", expected "image".`,
      path,
    });
  }
}

/**
 * Built-in Image Renderer stores its Asset reference as a stable assetId
 * string (rather than a user Component's { assetId } property object). Keep
 * that native reference valid at the Project boundary for both Scene and
 * Prefab documents, on read and write.
 */
function assertNativeBuiltinComponentData(
  project: ProjectDocumentV1,
  roots: readonly NodeDocument[],
  label: string,
  rootPath: "root" | "rootNodes" = "rootNodes",
  prefabDocuments?: readonly PrefabDocumentV1[],
): void {
  const diagnostics: Array<{ code: string; message: string; path: string }> = [];
  const prefabs = new Map((prefabDocuments ?? []).map((prefab) => [prefab.id, prefab]));

  const visit = (node: NodeDocument, path: string): void => {
    node.components.forEach((component, index) => {
      const componentPath = `${path}.components[${index}]`;
      try {
        validateNativeFxComponentProperties(component);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const propertyName = /FX property "([^"]+)"/.exec(message)?.[1];
        diagnostics.push({
          code: "COMPONENT_INVALID_VALUE",
          message,
          path: propertyName
            ? `${componentPath}.properties.${propertyName}`
            : `${componentPath}.properties`,
        });
      }

      if (component.typeId !== BUILTIN_COMPONENT_TYPES.imageRenderer ||
          !Object.prototype.hasOwnProperty.call(component.properties, "assetId")) {
        return;
      }

      assertImageAssetReference(
        project,
        component.properties.assetId,
        `${path}.components[${index}].properties.assetId`,
        diagnostics,
      );
    });

    if (node.prefabInstance) {
      const prefab = prefabs.get(node.prefabInstance.prefabId);
      if (prefab) {
        const fxScalarFields = new Set([
          "threshold", "blurRadius", "blurSteps", "blurQuality", "blendAmount",
          "alpha", "fromX", "fromY", "toX", "toY", "size", "radius", "direction",
          "scale", "duration", "thickness", "feather", "color", "backgroundColor",
          "color1", "color2", "label", "preFX", "reveal", "yoyo",
        ]);
        node.prefabInstance.overrides.forEach((override, overrideIndex) => {
          if (!override.targetComponentId) return;
          const targetNode = findPrefabNodeById(prefab.root, override.targetNodeId);
          const targetComponent = targetNode?.components.find((item) => item.id === override.targetComponentId);
          if (!targetComponent) return; // Core validation reports dangling targets with Prefab documents in context.

          const overridePath = `${path}.prefabInstance.overrides[${overrideIndex}]`;
          if (targetComponent.typeId === BUILTIN_COMPONENT_TYPES.imageRenderer) {
            if (override.propertyPath === "assetId") {
              assertImageAssetReference(project, override.value, `${overridePath}.value`, diagnostics);
            } else if (override.propertyPath.startsWith("assetId.")) {
              diagnostics.push({
                code: "PROJECT_INVALID_REFERENCE",
                message: "Image Renderer assetId is a scalar Project Asset reference and cannot be overridden through a nested path.",
                path: `${overridePath}.propertyPath`,
              });
            }
          }

          const fxType = getNativeFxType(targetComponent.typeId);
          if (fxType) {
            if (!override.propertyPath.includes(".")) {
              try {
                validateNativeFxPropertyValues(fxType, {
                  ...targetComponent.properties,
                  [override.propertyPath]: override.value,
                }, false);
              } catch (error) {
                diagnostics.push({
                  code: "COMPONENT_INVALID_VALUE",
                  message: error instanceof Error ? error.message : String(error),
                  path: `${overridePath}.value`,
                });
              }
            } else if (fxScalarFields.has(override.propertyPath.split(".")[0]!)) {
              diagnostics.push({
                code: "COMPONENT_INVALID_VALUE",
                message: `FX scalar property override "${override.propertyPath}" cannot use a nested path.`,
                path: `${overridePath}.propertyPath`,
              });
            }
          }
        });
      }
    }

    node.children.forEach((child, index) => visit(child, `${path}.children[${index}]`));
  };

  roots.forEach((root, index) => visit(root, rootPath === "root" ? "root" : `rootNodes[${index}]`));
  if (diagnostics.length > 0) throw new NativeProjectDocumentError(label, diagnostics);
}

export function parseNativeSceneDocument(
  project: ProjectDocumentV1,
  sceneId: string,
  content: string,
  prefabDocuments?: readonly PrefabDocumentV1[],
  componentSchemas?: ReadonlyMap<string, ComponentTypeSchemaV1>,
): SceneDocumentV1 {
  const asset = resolveSceneAsset(project, sceneId);
  if (!asset.path.endsWith(NATIVE_SCENE_EXTENSION)) {
    throw new Error(`Scene asset "${asset.id}" must use the native ${NATIVE_SCENE_EXTENSION} contract.`);
  }
  const document = requireParsed(
    `Scene "${sceneId}"`,
    parseSceneDocument(content, createSceneValidationContext(
      project,
      prefabDocuments,
      componentSchemas,
      componentSchemas ? nodeKindsFromContent(content, "scene") : undefined,
    )),
  );
  if (document.id !== sceneId) {
    throw new Error(`Scene manifest id "${sceneId}" does not match document id "${document.id}".`);
  }
  assertNativeBuiltinComponentData(project, document.rootNodes, `Scene "${sceneId}"`, "rootNodes", prefabDocuments);
  return document;
}

export function serializeNativeSceneDocument(
  project: ProjectDocumentV1,
  document: SceneDocumentV1,
  prefabDocuments?: readonly PrefabDocumentV1[],
  componentSchemas?: ReadonlyMap<string, ComponentTypeSchemaV1>,
): string {
  // First let Core validate the JSON boundary before inspecting Node data.
  const initialContext = createSceneValidationContext(project, prefabDocuments, componentSchemas);
  const initialContent = serializeSceneDocument(document, initialContext);
  if (componentSchemas) {
    const normalized = requireParsed("Native Scene document", parseSceneDocument(initialContent, initialContext));
    assertRegisteredComponentSchemas(project, normalized.rootNodes, componentSchemas, "Scene");
  }
  const nodeKinds = componentSchemas ? nodeKindsFromContent(initialContent, "scene") : undefined;
  const context = createSceneValidationContext(project, prefabDocuments, componentSchemas, nodeKinds);
  const content = serializeSceneDocument(document, context);
  const normalized = requireParsed("Native Scene document", parseSceneDocument(content, context));
  const reference = project.scenes.find((item) => item.id === normalized.id);
  if (!reference) throw new Error(`Scene "${normalized.id}" is not registered in project.json.`);
  const asset = assetById(project, reference.assetId, "scene");
  if (!asset.path.endsWith(NATIVE_SCENE_EXTENSION)) {
    throw new Error(`Scene asset "${asset.id}" must use the native ${NATIVE_SCENE_EXTENSION} contract.`);
  }
  assertNativeBuiltinComponentData(project, normalized.rootNodes, `Scene "${normalized.id}"`, "rootNodes", prefabDocuments);
  return content;
}

function assertRegisteredComponentSchemas(
  project: ProjectDocumentV1,
  roots: readonly NodeDocument[],
  schemas: ReadonlyMap<string, ComponentTypeSchemaV1> | undefined,
  label: string,
): void {
  if (!schemas) return;
  const moduleTypes = new Set(project.componentModules.map((module) => module.typeId));
  const diagnostics: Array<{ code: string; message: string; path: string }> = [];
  const visit = (node: NodeDocument, path: string): void => {
    node.components.forEach((component, index) => {
      if (!moduleTypes.has(component.typeId) || schemas.has(component.typeId)) return;
      diagnostics.push({
        code: "COMPONENT_INVALID_SCHEMA",
        message: `Component "${component.typeId}" has no valid registered Component Schema.`,
        path: `${path}.components[${index}].typeId`,
      });
    });
    node.children.forEach((child, index) => visit(child, `${path}.children[${index}]`));
  };
  roots.forEach((root, index) => visit(root, label === "Prefab" ? "root" : `rootNodes[${index}]`));
  if (diagnostics.length > 0) throw new NativeProjectDocumentError(label, diagnostics);
}

function assertNoNestedPrefabInstances(
  roots: readonly NodeDocument[],
  label: string,
): void {
  const diagnostics: Array<{ code: string; message: string; path: string }> = [];
  const visit = (node: NodeDocument, path: string): void => {
    if (node.prefabInstance) {
      diagnostics.push({
        code: "PROJECT_INVALID_REFERENCE",
        message: "Nested Prefab instances are not supported in native Prefab documents.",
        path: `${path}.prefabInstance`,
      });
    }
    node.children.forEach((child, index) => visit(child, `${path}.children[${index}]`));
  };
  roots.forEach((root, index) => visit(root, `root[${index}]`));
  if (diagnostics.length > 0) throw new NativeProjectDocumentError(label, diagnostics);
}

export function parseNativePrefabDocument(
  project: ProjectDocumentV1,
  prefabId: string,
  content: string,
  prefabDocuments?: readonly PrefabDocumentV1[],
  componentSchemas?: ReadonlyMap<string, ComponentTypeSchemaV1>,
): PrefabDocumentV1 {
  const asset = resolvePrefabAsset(project, prefabId);
  if (!asset.path.endsWith(NATIVE_PREFAB_EXTENSION)) {
    throw new Error(`Prefab asset "${asset.id}" must use the native ${NATIVE_PREFAB_EXTENSION} contract.`);
  }
  const document = requireParsed(
    `Prefab "${prefabId}"`,
    parsePrefabDocument(content, createSceneValidationContext(
      project,
      prefabDocuments,
      componentSchemas,
      componentSchemas ? nodeKindsFromContent(content, "prefab") : undefined,
    )),
  );
  if (document.id !== prefabId) {
    throw new Error(`Prefab manifest id "${prefabId}" does not match document id "${document.id}".`);
  }
  assertNoNestedPrefabInstances([document.root], `Prefab "${prefabId}"`);
  assertNativeBuiltinComponentData(project, [document.root], `Prefab "${prefabId}"`, "root", prefabDocuments);
  return document;
}

export function serializeNativePrefabDocument(
  project: ProjectDocumentV1,
  document: PrefabDocumentV1,
  prefabDocuments?: readonly PrefabDocumentV1[],
  componentSchemas?: ReadonlyMap<string, ComponentTypeSchemaV1>,
): string {
  // First let Core validate the JSON boundary before inspecting Node data.
  const initialContext = createSceneValidationContext(project, prefabDocuments, componentSchemas);
  const initialContent = serializePrefabDocument(document, initialContext);
  if (componentSchemas) {
    const normalized = requireParsed("Native Prefab document", parsePrefabDocument(initialContent, initialContext));
    assertRegisteredComponentSchemas(project, [normalized.root], componentSchemas, "Prefab");
  }
  const nodeKinds = componentSchemas ? nodeKindsFromContent(initialContent, "prefab") : undefined;
  const context = createSceneValidationContext(project, prefabDocuments, componentSchemas, nodeKinds);
  const content = serializePrefabDocument(document, context);
  const normalized = requireParsed("Native Prefab document", parsePrefabDocument(content, context));
  const reference = project.prefabs.find((item) => item.id === normalized.id);
  if (!reference) throw new Error(`Prefab "${normalized.id}" is not registered in project.json.`);
  const asset = assetById(project, reference.assetId, "prefab");
  if (!asset.path.endsWith(NATIVE_PREFAB_EXTENSION)) {
    throw new Error(`Prefab asset "${asset.id}" must use the native ${NATIVE_PREFAB_EXTENSION} contract.`);
  }
  assertNoNestedPrefabInstances([normalized.root], `Prefab "${normalized.id}"`);
  assertNativeBuiltinComponentData(project, [normalized.root], `Prefab "${normalized.id}"`, "root", prefabDocuments);
  return content;
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error("Secure randomUUID support is required to create native Project asset identities.");
}

function assertNativeAssetPath(path: string, extension: string): void {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === ".." || segment === ".") ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) ||
    !path.endsWith(extension)
  ) {
    throw new TypeError(`Native asset path must be a relative ${extension} path inside the Project.`);
  }
}

export function createNativeSceneDocument(name: string): SceneDocumentV1 {
  const normalizedName = name.trim();
  if (!normalizedName) throw new TypeError("Scene name must be non-empty.");
  return {
    schemaVersion: 1,
    id: createId(),
    name: normalizedName,
    rootNodes: [],
    settings: {},
  };
}

export function registerNativeScene(
  project: ProjectDocumentV1,
  scene: SceneDocumentV1,
  assetId: string,
  path: string,
): ProjectDocumentV1 {
  assertNativeAssetPath(path, NATIVE_SCENE_EXTENSION);
  if (project.scenes.some((item) => item.id === scene.id)) {
    throw new Error(`Scene "${scene.id}" is already registered in project.json.`);
  }
  if (project.assets.some((item) => item.id === assetId || item.path === path)) {
    throw new Error(`Project asset id or path is already registered: "${assetId}" / "${path}".`);
  }

  const next: ProjectDocumentV1 = {
    ...project,
    assets: [...project.assets, { id: assetId, path, kind: "scene" }],
    scenes: [...project.scenes, { id: scene.id, assetId }],
  };
  const validation = validateProjectDocument(next);
  if (!validation.valid || !validation.value) {
    throw new NativeProjectDocumentError("Updated Project document", validation.diagnostics);
  }
  return validation.value;
}

export function addNativePrefabReference(
  project: ProjectDocumentV1,
  prefab: PrefabDocumentV1,
  assetId: string,
  path: string,
): ProjectDocumentV1 {
  assertNativeAssetPath(path, NATIVE_PREFAB_EXTENSION);
  if (project.prefabs.some((item) => item.id === prefab.id)) {
    throw new Error(`Prefab "${prefab.id}" is already registered in project.json.`);
  }
  if (project.assets.some((item) => item.id === assetId || item.path === path)) {
    throw new Error(`Project asset id or path is already registered: "${assetId}" / "${path}".`);
  }

  const next: ProjectDocumentV1 = {
    ...project,
    assets: [...project.assets, { id: assetId, path, kind: "prefab" }],
    prefabs: [...project.prefabs, { id: prefab.id, assetId }],
  };
  const validation = validateProjectDocument(next);
  if (!validation.valid || !validation.value) {
    throw new NativeProjectDocumentError("Updated Project document", validation.diagnostics);
  }
  return validation.value;
}

export function getNativeScriptModules(project: ProjectDocumentV1): Array<{
  typeId: string;
  version: string;
  assetId: string;
  path: string;
}> {
  return project.componentModules.map((module) => {
    const asset = assetById(project, module.moduleAssetId, "script");
    return {
      typeId: module.typeId,
      version: module.version,
      assetId: asset.id,
      path: asset.path,
    };
  });
}
