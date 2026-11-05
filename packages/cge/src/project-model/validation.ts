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
  isValidStableId,
} from "./contracts.js";

export interface SceneValidationContext {
  assets?: ReadonlyMap<string, AssetReference>;
  componentSchemas?: ReadonlyMap<string, ComponentTypeSchemaV1>;
  registeredComponentTypes?: ReadonlySet<string>;
  prefabIds?: ReadonlySet<string>;
  prefabs?: ReadonlyMap<string, PrefabDocumentV1>;
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

function hasSafeDataProperties(
  value: unknown,
  visited: WeakSet<object> = new WeakSet(),
): boolean {
  if (typeof value === "function") return false;
  if (value === null || typeof value !== "object") return true;
  if (visited.has(value)) return true;

  visited.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype ||
          Object.getOwnPropertySymbols(value).length > 0) {
        return false;
      }
    } else {
      const prototype = Object.getPrototypeOf(value);
      if ((prototype !== Object.prototype && prototype !== null) ||
          Object.getOwnPropertySymbols(value).length > 0) {
        return false;
      }
    }

    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) ||
          !hasSafeDataProperties(descriptor.value, visited)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function warnUnknownFields(
  input: Record<string, unknown>,
  knownFields: ReadonlySet<string>,
  path: string,
  diagnostics: CoreDiagnostic[],
  entityId?: string,
): void {
  for (const [key, value] of Object.entries(input)) {
    if (knownFields.has(key)) continue;
    if (!isJsonValue(value)) {
      diagnostics.push(issue(
        "PROJECT_INVALID_DOCUMENT",
        "Unknown field must contain JSON-compatible data.",
        path + "." + key,
        entityId,
      ));
      continue;
    }
    diagnostics.push({
      code: "PROJECT_UNKNOWN_FIELD_PRESERVED",
      severity: "warning",
      message: "Unknown JSON-compatible field " + key + " is preserved during validation and serialization.",
      path: path + "." + key,
      ...(entityId === undefined ? {} : { entityId }),
    });
  }
}

function validateIdCollection(values: unknown[], path: string, diagnostics: CoreDiagnostic[]): Set<string> {
  const ids = new Set<string>();
  values.forEach((item, index) => {
    if (!isRecord(item) || !isValidStableId(item.id)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "An item requires a stable ID using letters, digits, dot, underscore, colon or hyphen (maximum 256 characters).", path + "[" + index + "].id"));
      return;
    }
    if (ids.has(item.id)) diagnostics.push(issue("PROJECT_DUPLICATE_ID", "Duplicate id " + item.id + ".", path + "[" + index + "].id", item.id));
    ids.add(item.id);
  });
  return ids;
}

export function validateProjectDocument(input: unknown): ValidationResult<ProjectDocumentV1> {
  if (!isRecord(input) || !isJsonValue(input)) {
    return {
      valid: false,
      diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project document must be a JSON-compatible object.")],
    };
  }
  if (input.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return {
      valid: false,
      diagnostics: [issue(
        "PROJECT_UNSUPPORTED_VERSION",
        "Project schema version " + String(input.schemaVersion) + " is not supported by this validator.",
        "schemaVersion",
      )],
    };
  }
  if (!isNonEmptyString(input.name) ||
      !Array.isArray(input.scenes) || !Array.isArray(input.assets) ||
      !Array.isArray(input.prefabs) || !Array.isArray(input.componentModules) ||
      !isRecord(input.runtime) || !isNonEmptyString(input.runtime.adapterId) ||
      !isRecord(input.runtime.settings)) {
    return {
      valid: false,
      diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project v1 requires name, scenes, assets, prefabs, componentModules and runtime configuration.")],
    };
  }
  if (!isValidStableId(input.id)) {
    return {
      valid: false,
      diagnostics: [issue(
        "PROJECT_INVALID_DOCUMENT",
        "Project id must use the stable ID grammar: 1-256 ASCII characters, starting with a letter or digit.",
        "id",
      )],
    };
  }

  const diagnostics: CoreDiagnostic[] = [];
  warnUnknownFields(
    input,
    new Set(["schemaVersion", "id", "name", "scenes", "assets", "prefabs", "componentModules", "runtime"]),
    "project",
    diagnostics,
    input.id,
  );
  warnUnknownFields(input.runtime, new Set(["adapterId", "settings"]), "runtime", diagnostics, input.id);
  validateIdCollection(input.assets, "assets", diagnostics);
  validateIdCollection(input.scenes, "scenes", diagnostics);
  validateIdCollection(input.prefabs, "prefabs", diagnostics);
  const assetsById = new Map<string, Record<string, unknown>>();

  input.assets.forEach((asset, index) => {
    const assetPath = "assets[" + index + "]";
    if (!isRecord(asset)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Asset reference must be an object.", assetPath));
      return;
    }
    if (!isValidStableId(asset.id)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Asset id must use the stable ID grammar.", assetPath + ".id"));
      return;
    }
    if (!isSafeProjectPath(asset.path)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Asset path must be a safe project-relative path.", assetPath + ".path", asset.id));
      return;
    }
    if (asset.subResourceId !== undefined && !isValidStableId(asset.subResourceId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Asset subResourceId must use the stable ID grammar.", assetPath + ".subResourceId", asset.id));
      return;
    }
    if (!ASSET_KINDS.includes(asset.kind as (typeof ASSET_KINDS)[number])) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Asset kind is not supported.", assetPath + ".kind", asset.id));
      return;
    }
    warnUnknownFields(asset, new Set(["id", "path", "kind", "subResourceId"]), assetPath, diagnostics, asset.id);
    assetsById.set(asset.id, asset);
  });

  input.scenes.forEach((scene, index) => {
    if (!isRecord(scene) || !isValidStableId(scene.id) || !isValidStableId(scene.assetId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Scene reference requires id and assetId.", "scenes[" + index + "]"));
      return;
    }
    warnUnknownFields(scene, new Set(["id", "assetId"]), "scenes[" + index + "]", diagnostics, scene.id);
    const asset = assetsById.get(scene.assetId);
    if (!asset || asset.kind !== "scene") {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Scene asset " + scene.assetId + " is missing or is not a scene asset.", "scenes[" + index + "].assetId", scene.id));
    }
  });

  input.prefabs.forEach((prefab, index) => {
    if (!isRecord(prefab) || !isValidStableId(prefab.id) || !isValidStableId(prefab.assetId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Prefab reference requires id and assetId.", "prefabs[" + index + "]"));
      return;
    }
    warnUnknownFields(prefab, new Set(["id", "assetId"]), "prefabs[" + index + "]", diagnostics, prefab.id);
    const asset = assetsById.get(prefab.assetId);
    if (!asset || asset.kind !== "prefab") {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Prefab asset " + prefab.assetId + " is missing or is not a prefab asset.", "prefabs[" + index + "].assetId", prefab.id));
    }
  });

  validateIdCollection(input.componentModules, "componentModules", diagnostics);
  const exportedTypeIds = new Set<string>();
  input.componentModules.forEach((module, moduleIndex) => {
    const modulePath = "componentModules[" + moduleIndex + "]";
    if (!isRecord(module) ||
        !isValidStableId(module.id) ||
        !isValidStableId(module.moduleAssetId) ||
        !isNonEmptyString(module.version) ||
        !Array.isArray(module.exports) ||
        module.exports.length === 0) {
      diagnostics.push(issue(
        "PROJECT_INVALID_DOCUMENT",
        "Component module requires a stable id, script moduleAssetId, version and at least one exported component definition.",
        modulePath,
      ));
      return;
    }
    const moduleId = module.id as string;
    warnUnknownFields(
      module,
      new Set(["id", "moduleAssetId", "version", "exports"]),
      modulePath,
      diagnostics,
      moduleId,
    );
    const asset = assetsById.get(module.moduleAssetId);
    if (!asset || asset.kind !== "script") {
      diagnostics.push(issue(
        "PROJECT_INVALID_REFERENCE",
        "Component module " + moduleId + " must reference a registered script asset.",
        modulePath + ".moduleAssetId",
        moduleId,
      ));
    }
    module.exports.forEach((exported, exportIndex) => {
      const exportPath = modulePath + ".exports[" + exportIndex + "]";
      if (!isRecord(exported) ||
          !isValidStableId(exported.typeId) ||
          typeof exported.schemaVersion !== "number" ||
          !Number.isInteger(exported.schemaVersion) ||
          exported.schemaVersion < 1) {
        diagnostics.push(issue(
          "PROJECT_INVALID_DOCUMENT",
          "Component module export requires a stable typeId and positive integer schemaVersion.",
          exportPath,
          moduleId,
        ));
        return;
      }
      warnUnknownFields(
        exported,
        new Set(["typeId", "schemaVersion"]),
        exportPath,
        diagnostics,
        moduleId,
      );
      if (exportedTypeIds.has(exported.typeId)) {
        diagnostics.push(issue(
          "PROJECT_DUPLICATE_ID",
          "Component type " + exported.typeId + " is exported more than once in the project manifest.",
          exportPath + ".typeId",
          moduleId,
        ));
      }
      exportedTypeIds.add(exported.typeId);
    });
  });

  return hasErrors(diagnostics)
    ? { valid: false, diagnostics }
    : { valid: true, diagnostics, value: input as unknown as ProjectDocumentV1 };
}

function collectNodeIds(
  nodes: unknown[],
  ids: Set<string>,
  diagnostics: CoreDiagnostic[],
  prefix: string,
  visitedNodes: WeakSet<object> = new WeakSet(),
): void {
  nodes.forEach((node, index) => {
    const path = prefix + "[" + index + "]";
    if (!isRecord(node) || !isValidStableId(node.id)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Node requires a stable ID using letters, digits, dot, underscore, colon or hyphen (maximum 256 characters).", path + ".id"));
      return;
    }
    if (visitedNodes.has(node)) {
      diagnostics.push(issue(
        "SCENE_INVALID_NODE",
        "Scene hierarchy cannot contain cyclic or shared Node object references; use stable IDs for references.",
        path,
        node.id,
      ));
      return;
    }
    visitedNodes.add(node);
    if (ids.has(node.id)) diagnostics.push(issue("SCENE_DUPLICATE_ID", "Duplicate node id " + node.id + ".", path + ".id", node.id));
    ids.add(node.id);
    if (Array.isArray(node.children)) {
      collectNodeIds(node.children, ids, diagnostics, path + ".children", visitedNodes);
    }
  });
}

function collectPrefabNodes(root: PrefabDocumentV1["root"]): Map<string, PrefabDocumentV1["root"]> {
  const nodes = new Map<string, PrefabDocumentV1["root"]>();
  const visit = (node: PrefabDocumentV1["root"]): void => {
    nodes.set(node.id, node);
    node.children.forEach(visit);
  };
  visit(root);
  return nodes;
}

function validatePrefabOverrides(
  prefabInstance: Record<string, unknown>,
  path: string,
  context: SceneValidationContext,
  nodeId: string,
  diagnostics: CoreDiagnostic[],
): void {
  if (!isNonEmptyString(prefabInstance.prefabId) || !Array.isArray(prefabInstance.overrides)) return;
  const prefabId = prefabInstance.prefabId;
  const prefabDocument = context.prefabs?.get(prefabId);
  if (context.prefabs && !prefabDocument) {
    diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Prefab " + prefabId + " is not available in the validation context.", path + ".prefabId", nodeId));
  } else if (!context.prefabs && context.prefabIds && !context.prefabIds.has(prefabId)) {
    diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Prefab " + prefabId + " is not registered.", path + ".prefabId", nodeId));
  }
  const prefabNodes = prefabDocument ? collectPrefabNodes(prefabDocument.root) : undefined;
  const seenOverrides = new Set<string>();

  prefabInstance.overrides.forEach((override, index) => {
    const overridePath = path + ".overrides[" + index + "]";
    if (!isRecord(override) || !isJsonValue(override) ||
        !isValidStableId(override.targetNodeId) || !isNonEmptyString(override.propertyPath) ||
        !Object.prototype.hasOwnProperty.call(override, "value") || !isJsonValue(override.value) ||
        (override.targetComponentId !== undefined && !isValidStableId(override.targetComponentId))) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Prefab override requires targetNodeId, propertyPath and a JSON-compatible value; targetComponentId must be a non-empty id when present.", overridePath, nodeId));
      return;
    }

    warnUnknownFields(override, new Set(["targetNodeId", "propertyPath", "value", "targetComponentId"]), overridePath, diagnostics, nodeId);
    const targetNodeId = override.targetNodeId;
    const targetComponentId = typeof override.targetComponentId === "string" ? override.targetComponentId : "";
    const identity = targetNodeId + "\u0000" + targetComponentId + "\u0000" + override.propertyPath;
    if (seenOverrides.has(identity)) {
      diagnostics.push(issue("PROJECT_DUPLICATE_ID", "Prefab override is duplicated for the same target and property.", overridePath, nodeId));
    }
    seenOverrides.add(identity);

    const targetNode = prefabNodes?.get(targetNodeId);
    if (prefabNodes && !targetNode) {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Prefab override target node " + targetNodeId + " does not exist in prefab " + prefabId + ".", overridePath + ".targetNodeId", nodeId));
    } else if (targetNode && targetComponentId &&
        !targetNode.components.some((component) => component.id === targetComponentId)) {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Prefab override component " + targetComponentId + " does not exist on target node " + targetNodeId + ".", overridePath + ".targetComponentId", nodeId));
    }
  });
}

function validateNode(
  node: unknown,
  path: string,
  nodeIds: ReadonlySet<string>,
  context: SceneValidationContext,
  diagnostics: CoreDiagnostic[],
  componentIds: Set<string>,
  visitedNodes: WeakSet<object>,
): void {
  if (!isRecord(node) || !isValidStableId(node.id) || !isNonEmptyString(node.name) ||
      typeof node.active !== "boolean" || !isRecord(node.transform) ||
      !Array.isArray(node.components) || !Array.isArray(node.children)) {
    diagnostics.push(issue("SCENE_INVALID_NODE", "Node requires JSON-compatible id/name, active, transform, components and children.", path));
    return;
  }
  if (visitedNodes.has(node)) return;
  visitedNodes.add(node);

  const nodeId = node.id as string;
  const knownNodeFields = new Set(["id", "name", "active", "transform", "components", "assetReferences", "children", "prefabInstance"]);
  warnUnknownFields(node, knownNodeFields, path, diagnostics, nodeId);
  const knownTransformFields = new Set(["x", "y", "rotation", "scaleX", "scaleY", "originX", "originY"]);
  warnUnknownFields(node.transform, knownTransformFields, path + ".transform", diagnostics, nodeId);
  for (const key of ["x", "y", "rotation", "scaleX", "scaleY", "originX", "originY"]) {
    const value = node.transform[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      diagnostics.push(issue("SCENE_INVALID_TRANSFORM", "Transform " + key + " must be finite.", path + ".transform." + key, nodeId));
    }
  }

  if (node.assetReferences !== undefined) {
    if (!Array.isArray(node.assetReferences)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Node assetReferences must be an array.", path + ".assetReferences", nodeId));
    } else {
      const propertyPaths = new Set<string>();
      node.assetReferences.forEach((reference, index) => {
        const referencePath = path + ".assetReferences[" + index + "]";
        if (!isRecord(reference) || !isNonEmptyString(reference.propertyPath) ||
            !isValidStableId(reference.assetId) || !isJsonValue(reference)) {
          diagnostics.push(issue("SCENE_INVALID_NODE", "Node asset reference requires a non-empty propertyPath and stable assetId.", referencePath, nodeId));
          return;
        }
        if (propertyPaths.has(reference.propertyPath)) {
          diagnostics.push(issue("PROJECT_DUPLICATE_ID", "Duplicate Node asset reference propertyPath " + reference.propertyPath + ".", referencePath + ".propertyPath", nodeId));
        }
        warnUnknownFields(reference, new Set(["propertyPath", "assetId"]), referencePath, diagnostics, nodeId);
        propertyPaths.add(reference.propertyPath);
        if (context.assets && !context.assets.has(reference.assetId)) {
          diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Asset " + reference.assetId + " is not present in the Project Asset registry.", referencePath + ".assetId", nodeId));
        }
      });
    }
  }

  node.components.forEach((component, index) => {
    const componentPath = path + ".components[" + index + "]";
    if (!isRecord(component) || !isJsonValue(component) ||
        !isValidStableId(component.id) || !isValidStableId(component.typeId) ||
        typeof component.enabled !== "boolean" || !isRecord(component.properties)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Component instance requires stable id/typeId, enabled state and JSON properties.", componentPath, nodeId));
      return;
    }
    if (typeof component.schemaVersion !== "number" ||
        !Number.isInteger(component.schemaVersion) || component.schemaVersion < 1) {
      diagnostics.push(issue(
        "COMPONENT_INVALID_SCHEMA",
        "Component instance schemaVersion must be a positive integer.",
        componentPath + ".schemaVersion",
        nodeId,
      ));
      return;
    }
    warnUnknownFields(component, new Set(["id", "typeId", "schemaVersion", "enabled", "properties"]), componentPath, diagnostics, nodeId);
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
        path: componentPath + ".properties" + (item.propertyName ? "." + item.propertyName : ""),
        entityId: nodeId,
        componentInstanceId: componentId,
      })));
    }
  });

  if (node.prefabInstance !== undefined) {
    const prefab = node.prefabInstance;
    if (!isRecord(prefab) || !isValidStableId(prefab.prefabId) ||
        !Array.isArray(prefab.overrides) || !isJsonValue(prefab)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Prefab instance requires a prefabId and JSON overrides.", path + ".prefabInstance", node.id));
    } else if (prefab.sourceNodeId !== undefined && !isValidStableId(prefab.sourceNodeId)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Prefab sourceNodeId must be a non-empty stable id.", path + ".prefabInstance.sourceNodeId", node.id));
    } else {
      warnUnknownFields(prefab, new Set(["prefabId", "overrides", "sourceNodeId"]), path + ".prefabInstance", diagnostics, nodeId);
      validatePrefabOverrides(prefab, path + ".prefabInstance", context, node.id, diagnostics);
    }
  }

  node.children.forEach((child, index) =>
    validateNode(child, path + ".children[" + index + "]", nodeIds, context, diagnostics, componentIds, visitedNodes),
  );
}

export function validateSceneDocument(
  input: unknown,
  context: SceneValidationContext = {},
): ValidationResult<SceneDocumentV1> {
  if (!isRecord(input) || !hasSafeDataProperties(input)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Scene document must contain plain data properties.")],
    };
  }
  if (input.schemaVersion !== SCENE_SCHEMA_VERSION) {
    return {
      valid: false,
      diagnostics: [issue(
        "PROJECT_UNSUPPORTED_VERSION",
        "Scene schema version " + String(input.schemaVersion) + " is not supported.",
        "schemaVersion",
        isValidStableId(input.id) ? input.id : undefined,
      )],
    };
  }
  if (!isNonEmptyString(input.name) || !Array.isArray(input.rootNodes) ||
      !isRecord(input.settings)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Scene v1 requires name, rootNodes and JSON settings.")],
    };
  }
  if (!isValidStableId(input.id)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Scene id must use the stable ID grammar.", "id")],
    };
  }
  const diagnostics: CoreDiagnostic[] = [];
  const knownSceneFields = new Set(["schemaVersion", "id", "name", "rootNodes", "settings"]);
  warnUnknownFields(input, knownSceneFields, "scene", diagnostics, input.id);
  const nodeIds = new Set<string>();
  const visitedNodes = new WeakSet<object>();
  collectNodeIds(input.rootNodes, nodeIds, diagnostics, "rootNodes", visitedNodes);
  const validatedNodes = new WeakSet<object>();
  const componentIds = new Set<string>();
  input.rootNodes.forEach((node, index) =>
    validateNode(node, "rootNodes[" + index + "]", nodeIds, context, diagnostics, componentIds, validatedNodes),
  );
  if (!isJsonValue(input) && !hasErrors(diagnostics)) {
    diagnostics.push(issue(
      "SCENE_INVALID_NODE",
      "Scene document contains values that are not JSON-compatible.",
    ));
  }
  return hasErrors(diagnostics)
    ? { valid: false, diagnostics }
    : { valid: true, diagnostics, value: input as unknown as SceneDocumentV1 };
}

export function validatePrefabDocument(
  input: unknown,
  context: SceneValidationContext = {},
): ValidationResult<PrefabDocumentV1> {
  if (!isRecord(input) || !hasSafeDataProperties(input)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Prefab document must contain plain data properties.")],
    };
  }
  if (input.schemaVersion !== PREFAB_SCHEMA_VERSION) {
    return {
      valid: false,
      diagnostics: [issue(
        "PROJECT_UNSUPPORTED_VERSION",
        "Prefab schema version " + String(input.schemaVersion) + " is not supported.",
        "schemaVersion",
        isValidStableId(input.id) ? input.id : undefined,
      )],
    };
  }
  if (!isNonEmptyString(input.name)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Prefab v1 requires a non-empty name.", "name", isValidStableId(input.id) ? input.id : undefined)],
    };
  }
  if (!isRecord(input.root)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Prefab v1 requires a root node object.", "root", isValidStableId(input.id) ? input.id : undefined)],
    };
  }
  if (!isValidStableId(input.id)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Prefab id must use the stable ID grammar.", "id")],
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
  const diagnostics = result.diagnostics.map((item) => {
    if (item.path?.startsWith("rootNodes[0]")) {
      return {
        ...item,
        path: "root" + item.path.slice("rootNodes[0]".length),
      };
    }
    return item;
  });
  warnUnknownFields(input, knownPrefabFields, "prefab", diagnostics, input.id);
  if (!isJsonValue(input) && !hasErrors(diagnostics)) {
    diagnostics.push(issue(
      "SCENE_INVALID_NODE",
      "Prefab document contains values that are not JSON-compatible.",
    ));
  }
  return hasErrors(diagnostics)
    ? { valid: false, diagnostics }
    : { valid: true, diagnostics, value: input as unknown as PrefabDocumentV1 };
}
