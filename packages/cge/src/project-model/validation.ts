import { hasErrors, type CoreDiagnostic, type ValidationResult } from "../diagnostics.js";
import { isJsonValue, isRecord, isSafeProjectPath } from "../json.js";
import { validateComponentProperties, type ComponentTypeSchemaV1 } from "../components/component-schema.js";
import {
  ASSET_KINDS,
  PROJECT_SCHEMA_VERSION,
  SCENE_SCHEMA_VERSION,
  PREFAB_SCHEMA_VERSION,
  type AssetReference,
  type ProjectDocumentV1,
  type SceneDocumentV1,
  type PrefabDocumentV1,
} from "./contracts.js";

export interface SceneValidationContext {
  assets?: ReadonlyMap<string, AssetReference>;
  componentSchemas?: ReadonlyMap<string, ComponentTypeSchemaV1>;
  registeredComponentTypes?: ReadonlySet<string>;
  prefabIds?: ReadonlySet<string>;
}

function issue(
  code: CoreDiagnostic["code"],
  message: string,
  path?: string,
  entityId?: string,
): CoreDiagnostic {
  return {
    code,
    severity: "error",
    message,
    ...(path === undefined ? {} : { path }),
    ...(entityId === undefined ? {} : { entityId }),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateIdCollection(values: unknown[], path: string, diagnostics: CoreDiagnostic[]): Set<string> {
  const ids = new Set<string>();
  values.forEach((item, index) => {
    if (!isRecord(item) || !isNonEmptyString(item.id)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "An item requires a non-empty stable id.", path + "[" + index + "].id"));
      return;
    }
    if (ids.has(item.id)) diagnostics.push(issue("PROJECT_DUPLICATE_ID", "Duplicate id " + item.id + ".", path + "[" + index + "].id", item.id));
    ids.add(item.id);
  });
  return ids;
}

export function validateProjectDocument(input: unknown): ValidationResult<ProjectDocumentV1> {
  if (!isRecord(input) || !isJsonValue(input) ||
      input.schemaVersion !== PROJECT_SCHEMA_VERSION ||
      !isNonEmptyString(input.id) || !isNonEmptyString(input.name) ||
      !Array.isArray(input.scenes) || !Array.isArray(input.assets) ||
      !Array.isArray(input.prefabs) || !Array.isArray(input.componentModules) ||
      !isRecord(input.runtime) || !isNonEmptyString(input.runtime.adapterId) ||
      !isRecord(input.runtime.settings)) {
    return {
      valid: false,
      diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project v1 requires stable id/name, scenes, assets, prefabs, componentModules and runtime configuration.")],
    };
  }

  const diagnostics: CoreDiagnostic[] = [];
  const assetIds = validateIdCollection(input.assets, "assets", diagnostics);
  validateIdCollection(input.scenes, "scenes", diagnostics);
  validateIdCollection(input.prefabs, "prefabs", diagnostics);
  const componentTypeIds = new Set<string>();
  const assetsById = new Map<string, Record<string, unknown>>();

  input.assets.forEach((asset, index) => {
    if (!isRecord(asset) || !isNonEmptyString(asset.id) ||
        !isSafeProjectPath(asset.path) ||
        !ASSET_KINDS.includes(asset.kind as (typeof ASSET_KINDS)[number])) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Asset reference requires a stable id, safe relative path and supported kind.", "assets[" + index + "]"));
    } else {
      assetsById.set(asset.id, asset);
    }
  });

  input.scenes.forEach((scene, index) => {
    if (!isRecord(scene) || !isNonEmptyString(scene.id) || !isNonEmptyString(scene.assetId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Scene reference requires id and assetId.", "scenes[" + index + "]"));
      return;
    }
    const asset = assetsById.get(scene.assetId);
    if (!asset || asset.kind !== "scene") {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Scene asset " + scene.assetId + " is missing or is not a scene asset.", "scenes[" + index + "].assetId", scene.id));
    }
  });

  input.prefabs.forEach((prefab, index) => {
    if (!isRecord(prefab) || !isNonEmptyString(prefab.id) || !isNonEmptyString(prefab.assetId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Prefab reference requires id and assetId.", "prefabs[" + index + "]"));
      return;
    }
    const asset = assetsById.get(prefab.assetId);
    if (!asset || asset.kind !== "prefab") {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Prefab asset " + prefab.assetId + " is missing or is not a prefab asset.", "prefabs[" + index + "].assetId", prefab.id));
    }
  });

  input.componentModules.forEach((module, index) => {
    if (!isRecord(module) || !isNonEmptyString(module.typeId) ||
        !isNonEmptyString(module.moduleAssetId) || !isNonEmptyString(module.version)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Component module requires typeId, moduleAssetId and version.", "componentModules[" + index + "]"));
      return;
    }
    if (componentTypeIds.has(module.typeId)) {
      diagnostics.push(issue("PROJECT_DUPLICATE_ID", "Duplicate component type id " + module.typeId + ".", "componentModules[" + index + "].typeId"));
    }
    componentTypeIds.add(module.typeId);
    const asset = assetsById.get(module.moduleAssetId);
    if (!asset || asset.kind !== "script") {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Component module " + module.typeId + " must reference a registered script asset.", "componentModules[" + index + "].moduleAssetId"));
    }
  });

  return hasErrors(diagnostics)
    ? { valid: false, diagnostics }
    : { valid: true, diagnostics, value: input as unknown as ProjectDocumentV1 };
}

function collectNodeIds(nodes: unknown[], ids: Set<string>, diagnostics: CoreDiagnostic[], prefix: string): void {
  nodes.forEach((node, index) => {
    const path = prefix + "[" + index + "]";
    if (!isRecord(node) || !isNonEmptyString(node.id)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Node requires a stable non-empty id.", path + ".id"));
      return;
    }
    if (ids.has(node.id)) diagnostics.push(issue("SCENE_DUPLICATE_ID", "Duplicate node id " + node.id + ".", path + ".id", node.id));
    ids.add(node.id);
    if (Array.isArray(node.children)) collectNodeIds(node.children, ids, diagnostics, path + ".children");
  });
}

function validateNode(
  node: unknown,
  path: string,
  nodeIds: ReadonlySet<string>,
  context: SceneValidationContext,
  diagnostics: CoreDiagnostic[],
  componentIds: Set<string>,
): void {
  if (!isRecord(node) || !isNonEmptyString(node.id) || !isNonEmptyString(node.name) ||
      typeof node.active !== "boolean" || !isRecord(node.transform) ||
      !Array.isArray(node.components) || !Array.isArray(node.children)) {
    diagnostics.push(issue("SCENE_INVALID_NODE", "Node requires JSON-compatible id/name, active, transform, components and children.", path));
    return;
  }

  const nodeId = node.id as string;
  const knownNodeFields = new Set(["id", "name", "active", "transform", "components", "children", "prefabInstance"]);
  for (const [key, value] of Object.entries(node)) {
    if (!knownNodeFields.has(key) && !isJsonValue(value)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Unknown node field must be JSON-compatible.", path + "." + key, nodeId));
    }
  }
  const knownTransformFields = new Set(["x", "y", "rotation", "scaleX", "scaleY", "originX", "originY"]);
  for (const [key, value] of Object.entries(node.transform)) {
    if (!knownTransformFields.has(key) && !isJsonValue(value)) {
      diagnostics.push(issue("SCENE_INVALID_TRANSFORM", "Unknown transform field must be JSON-compatible.", path + ".transform." + key, nodeId));
    }
  }
  for (const key of ["x", "y", "rotation", "scaleX", "scaleY", "originX", "originY"]) {
    const value = node.transform[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      diagnostics.push(issue("SCENE_INVALID_TRANSFORM", "Transform " + key + " must be finite.", path + ".transform." + key, nodeId));
    }
  }

  node.components.forEach((component, index) => {
    const componentPath = path + ".components[" + index + "]";
    if (!isRecord(component) || !isNonEmptyString(component.id) ||
        !isNonEmptyString(component.typeId) || typeof component.schemaVersion !== "number" ||
        !Number.isInteger(component.schemaVersion) || typeof component.enabled !== "boolean" ||
        !isRecord(component.properties) || !isJsonValue(component)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Component instance requires id, typeId, integer schemaVersion, enabled and JSON properties.", componentPath, nodeId));
      return;
    }
    const componentId = component.id as string;
    const componentTypeId = component.typeId as string;
    if (componentIds.has(componentId)) {
      diagnostics.push(issue("COMPONENT_DUPLICATE_INSTANCE", "Duplicate component instance id " + componentId + ".", componentPath + ".id", nodeId));
    }
    componentIds.add(componentId);
    if (context.registeredComponentTypes && !context.registeredComponentTypes.has(componentTypeId)) {
      diagnostics.push(issue("COMPONENT_UNKNOWN_TYPE", "Component type " + componentTypeId + " is not registered.", componentPath + ".typeId", nodeId));
    }
    const schema = context.componentSchemas?.get(componentTypeId);
    if (schema) {
      if (component.schemaVersion !== schema.schemaVersion) {
        diagnostics.push(issue("COMPONENT_INVALID_SCHEMA", "Component instance schema version does not match the registered schema.", componentPath + ".schemaVersion", nodeId));
      }
      const result = validateComponentProperties(schema, component.properties, {
        ...(context.assets === undefined ? {} : { assets: context.assets }),
        nodeIds,
        ownerNodeId: nodeId,
      });
      diagnostics.push(...result.diagnostics.map((item) => ({
        ...item,
        path: componentPath + ".properties",
        entityId: nodeId,
        componentInstanceId: componentId,
      })));
    }
  });

  if (node.prefabInstance !== undefined) {
    const prefab = node.prefabInstance;
    if (!isRecord(prefab) || !isNonEmptyString(prefab.prefabId) ||
        !Array.isArray(prefab.overrides) || !isJsonValue(prefab)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Prefab instance requires a prefabId and JSON overrides.", path + ".prefabInstance", node.id));
    } else if (context.prefabIds && !context.prefabIds.has(prefab.prefabId as string)) {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Prefab " + prefab.prefabId + " is not registered.", path + ".prefabInstance.prefabId", node.id));
    }
  }

  node.children.forEach((child, index) =>
    validateNode(child, path + ".children[" + index + "]", nodeIds, context, diagnostics, componentIds),
  );
}

export function validateSceneDocument(
  input: unknown,
  context: SceneValidationContext = {},
): ValidationResult<SceneDocumentV1> {
  if (!isRecord(input) || input.schemaVersion !== SCENE_SCHEMA_VERSION ||
      !isNonEmptyString(input.id) || !isNonEmptyString(input.name) ||
      !Array.isArray(input.rootNodes) || !isRecord(input.settings) || !isJsonValue(input.settings)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Scene v1 requires stable id/name, rootNodes and JSON settings.")],
    };
  }
  const diagnostics: CoreDiagnostic[] = [];
  const knownSceneFields = new Set(["schemaVersion", "id", "name", "rootNodes", "settings"]);
  for (const [key, value] of Object.entries(input)) {
    if (!knownSceneFields.has(key) && !isJsonValue(value)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Unknown scene field must be JSON-compatible.", key));
    }
  }
  const nodeIds = new Set<string>();
  collectNodeIds(input.rootNodes, nodeIds, diagnostics, "rootNodes");
  const componentIds = new Set<string>();
  input.rootNodes.forEach((node, index) =>
    validateNode(node, "rootNodes[" + index + "]", nodeIds, context, diagnostics, componentIds),
  );
  return hasErrors(diagnostics)
    ? { valid: false, diagnostics }
    : { valid: true, diagnostics, value: input as unknown as SceneDocumentV1 };
}

export function validatePrefabDocument(
  input: unknown,
  context: SceneValidationContext = {},
): ValidationResult<PrefabDocumentV1> {
  if (!isRecord(input) || input.schemaVersion !== PREFAB_SCHEMA_VERSION ||
      !isNonEmptyString(input.id) || !isNonEmptyString(input.name) || !isRecord(input.root)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Prefab v1 requires stable id/name and a root node.")],
    };
  }
  const result = validateSceneDocument({
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    rootNodes: [input.root],
    settings: {},
  }, context);
  const knownPrefabFields = new Set(["schemaVersion", "id", "name", "root"]);
  const extraFieldDiagnostics = Object.entries(input)
    .filter(([key]) => !knownPrefabFields.has(key))
    .filter(([, value]) => !isJsonValue(value))
    .map(([key]) => issue("SCENE_INVALID_NODE", "Unknown prefab field must be JSON-compatible.", key));
  if (extraFieldDiagnostics.length > 0) {
    return { valid: false, diagnostics: [...result.diagnostics, ...extraFieldDiagnostics] };
  }
  return result.valid
    ? { valid: true, diagnostics: result.diagnostics, value: input as unknown as PrefabDocumentV1 }
    : { valid: false, diagnostics: result.diagnostics };
}
