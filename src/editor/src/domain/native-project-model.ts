import { BUILTIN_COMPONENT_TYPE_IDS } from "./native-component-types.js";
import {
  parsePrefabDocument,
  parseProjectDocument,
  parseSceneDocument,
  serializePrefabDocument,
  serializeProjectDocument,
  serializeSceneDocument,
  validateProjectDocument,
  type AssetReference,
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

function createSceneValidationContext(project: ProjectDocumentV1) {
  return {
    assets: new Map(project.assets.map((asset) => [asset.id, asset])),
    prefabIds: new Set(project.prefabs.map((prefab) => prefab.id)),
    registeredComponentTypes: new Set([
      ...BUILTIN_COMPONENT_TYPE_IDS,
      ...project.componentModules.map((module) => module.typeId),
    ]),
  };
}

export function parseNativeSceneDocument(
  project: ProjectDocumentV1,
  sceneId: string,
  content: string,
): SceneDocumentV1 {
  const asset = resolveSceneAsset(project, sceneId);
  if (!asset.path.endsWith(NATIVE_SCENE_EXTENSION)) {
    throw new Error(`Scene asset "${asset.id}" must use the native ${NATIVE_SCENE_EXTENSION} contract.`);
  }
  const document = requireParsed(
    `Scene "${sceneId}"`,
    parseSceneDocument(content, createSceneValidationContext(project)),
  );
  if (document.id !== sceneId) {
    throw new Error(`Scene manifest id "${sceneId}" does not match document id "${document.id}".`);
  }
  return document;
}

export function serializeNativeSceneDocument(
  project: ProjectDocumentV1,
  document: SceneDocumentV1,
): string {
  const reference = project.scenes.find((item) => item.id === document.id);
  if (!reference) throw new Error(`Scene "${document.id}" is not registered in project.json.`);
  const asset = assetById(project, reference.assetId, "scene");
  if (!asset.path.endsWith(NATIVE_SCENE_EXTENSION)) {
    throw new Error(`Scene asset "${asset.id}" must use the native ${NATIVE_SCENE_EXTENSION} contract.`);
  }
  return serializeSceneDocument(document, createSceneValidationContext(project));
}

export function parseNativePrefabDocument(
  project: ProjectDocumentV1,
  prefabId: string,
  content: string,
): PrefabDocumentV1 {
  const asset = resolvePrefabAsset(project, prefabId);
  if (!asset.path.endsWith(NATIVE_PREFAB_EXTENSION)) {
    throw new Error(`Prefab asset "${asset.id}" must use the native ${NATIVE_PREFAB_EXTENSION} contract.`);
  }
  const document = requireParsed(
    `Prefab "${prefabId}"`,
    parsePrefabDocument(content, createSceneValidationContext(project)),
  );
  if (document.id !== prefabId) {
    throw new Error(`Prefab manifest id "${prefabId}" does not match document id "${document.id}".`);
  }
  return document;
}

export function serializeNativePrefabDocument(
  project: ProjectDocumentV1,
  document: PrefabDocumentV1,
): string {
  const reference = project.prefabs.find((item) => item.id === document.id);
  if (!reference) throw new Error(`Prefab "${document.id}" is not registered in project.json.`);
  const asset = assetById(project, reference.assetId, "prefab");
  if (!asset.path.endsWith(NATIVE_PREFAB_EXTENSION)) {
    throw new Error(`Prefab asset "${asset.id}" must use the native ${NATIVE_PREFAB_EXTENSION} contract.`);
  }
  return serializePrefabDocument(document, createSceneValidationContext(project));
}

export function addNativePrefabReference(
  project: ProjectDocumentV1,
  prefab: PrefabDocumentV1,
  assetId: string,
  path: string,
): ProjectDocumentV1 {
  if (!path.endsWith(NATIVE_PREFAB_EXTENSION)) {
    throw new Error(`Native Prefab assets must use the ${NATIVE_PREFAB_EXTENSION} extension.`);
  }
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
