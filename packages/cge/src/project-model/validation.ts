import { hasErrors, type CoreDiagnostic, type ValidationResult } from "../diagnostics.js";
import { isJsonValue, isRecord, isSafeProjectPath } from "../json.js";
import { validateComponentProperties, type ComponentTypeSchemaV1 } from "../components/component-schema.js";
import {
  ASSET_KINDS,
  isValidStableId,
  PROJECT_SCHEMA_VERSION,
  SCENE_SCHEMA_VERSION,
  PREFAB_SCHEMA_VERSION,
  type AssetReference,
  type NodeDocument,
  type ProjectDocumentV1,
  type SceneDocumentV1,
  type PrefabDocumentV1,
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

function hasSafeDataProperties(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return true;
  }
  if (typeof value !== "object" || ancestors.has(value)) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
        return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || !hasSafeDataProperties(descriptor.value, ancestors)) return false;
      }
      return Object.keys(value).every((key) => {
        const index = Number(key);
        return Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key;
      });
    }

    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
      return false;
    }
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !hasSafeDataProperties(descriptor.value, ancestors)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

function warnUnknownFields(
  input: Record<string, unknown>,
  knownFields: ReadonlySet<string>,
  path: string,
  diagnostics: CoreDiagnostic[],
  entityId?: string,
): void {
  for (const key of Object.keys(input)) {
    if (knownFields.has(key)) continue;
    if (!isJsonValue(input[key])) {
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
    const itemPath = path + "[" + index + "]";
    if (!isRecord(item)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "An item must be an object.", itemPath));
      return;
    }
    if (!isValidStableId(item.id)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "An item requires a stable id.", itemPath + ".id"));
      return;
    }
    if (ids.has(item.id)) diagnostics.push(issue("PROJECT_DUPLICATE_ID", "Duplicate id " + item.id + ".", itemPath + ".id", item.id));
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
        "Project schema version " + String(input.schemaVersion) + " is not supported.",
        "schemaVersion",
      )],
    };
  }
  if (!isValidStableId(input.id)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project id must use the stable ID grammar.", "id")] };
  }
  if (!isNonEmptyString(input.name)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project name must be a non-empty string.", "name")] };
  }
  if (!Array.isArray(input.scenes)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project scenes must be an array.", "scenes")] };
  }
  if (!Array.isArray(input.assets)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project assets must be an array.", "assets")] };
  }
  if (!Array.isArray(input.prefabs)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project prefabs must be an array.", "prefabs")] };
  }
  if (!Array.isArray(input.componentModules)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project componentModules must be an array.", "componentModules")] };
  }
  if (!isRecord(input.runtime)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Project runtime configuration must be an object.", "runtime")] };
  }
  if (!isValidStableId(input.runtime.adapterId)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Runtime adapterId must use the stable ID grammar.", "runtime.adapterId")] };
  }
  if (!isRecord(input.runtime.settings)) {
    return { valid: false, diagnostics: [issue("PROJECT_INVALID_DOCUMENT", "Runtime settings must be an object.", "runtime.settings")] };
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
  const componentTypeIds = new Set<string>();
  const assetsById = new Map<string, Record<string, unknown>>();

  input.assets.forEach((asset, index) => {
    const assetPath = "assets[" + index + "]";
    if (!isRecord(asset)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Asset reference must be an object.", assetPath));
      return;
    }
    if (!isValidStableId(asset.id)) return;
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
    const scenePath = "scenes[" + index + "]";
    if (!isRecord(scene)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Scene reference must be an object.", scenePath));
      return;
    }
    if (!isValidStableId(scene.id)) return;
    if (!isValidStableId(scene.assetId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Scene assetId must use the stable ID grammar.", scenePath + ".assetId", scene.id));
      return;
    }
    warnUnknownFields(scene, new Set(["id", "assetId"]), scenePath, diagnostics, scene.id);
    const asset = assetsById.get(scene.assetId);
    if (!asset || asset.kind !== "scene") {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Scene asset " + scene.assetId + " is missing or is not a scene asset.", "scenes[" + index + "].assetId", scene.id));
    }
  });

  input.prefabs.forEach((prefab, index) => {
    const prefabPath = "prefabs[" + index + "]";
    if (!isRecord(prefab)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Prefab reference must be an object.", prefabPath));
      return;
    }
    if (!isValidStableId(prefab.id)) return;
    if (!isValidStableId(prefab.assetId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Prefab assetId must use the stable ID grammar.", prefabPath + ".assetId", prefab.id));
      return;
    }
    warnUnknownFields(prefab, new Set(["id", "assetId"]), prefabPath, diagnostics, prefab.id);
    const asset = assetsById.get(prefab.assetId);
    if (!asset || asset.kind !== "prefab") {
      diagnostics.push(issue("PROJECT_INVALID_REFERENCE", "Prefab asset " + prefab.assetId + " is missing or is not a prefab asset.", "prefabs[" + index + "].assetId", prefab.id));
    }
  });

  input.componentModules.forEach((module, index) => {
    const modulePath = "componentModules[" + index + "]";
    if (!isRecord(module)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Component module reference must be an object.", modulePath));
      return;
    }
    if (!isValidStableId(module.typeId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Component module typeId must use the stable ID grammar.", modulePath + ".typeId"));
      return;
    }
    if (!isValidStableId(module.moduleAssetId)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Component module moduleAssetId must use the stable ID grammar.", modulePath + ".moduleAssetId", module.typeId));
      return;
    }
    if (!isNonEmptyString(module.version)) {
      diagnostics.push(issue("PROJECT_INVALID_DOCUMENT", "Component module version must be a non-empty string.", modulePath + ".version", module.typeId));
      return;
    }
    warnUnknownFields(module, new Set(["typeId", "moduleAssetId", "version"]), modulePath, diagnostics, module.typeId);
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
    if (!isRecord(node)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Node must be an object.", path));
      return;
    }
    if (!isValidStableId(node.id)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Node requires a stable non-empty id.", path + ".id"));
      return;
    }
    if (ids.has(node.id)) diagnostics.push(issue("SCENE_DUPLICATE_ID", "Duplicate node id " + node.id + ".", path + ".id", node.id));
    ids.add(node.id);
    if (Array.isArray(node.children)) collectNodeIds(node.children, ids, diagnostics, path + ".children");
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
  if (!isValidStableId(prefabInstance.prefabId) || !Array.isArray(prefabInstance.overrides)) return;
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
    warnUnknownFields(
      override,
      new Set(["targetNodeId", "propertyPath", "value", "targetComponentId"]),
      overridePath,
      diagnostics,
      nodeId,
    );

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
): NodeDocument {
  if (!isRecord(node) || !isValidStableId(node.id)) {
    return node as unknown as NodeDocument;
  }

  let valid = true;
  if (!isNonEmptyString(node.name)) {
    diagnostics.push(issue("SCENE_INVALID_NODE", "Node name must be a non-empty string.", path + ".name", node.id));
    valid = false;
  }
  if (typeof node.active !== "boolean") {
    diagnostics.push(issue("SCENE_INVALID_NODE", "Node active must be a boolean.", path + ".active", node.id));
    valid = false;
  }
  if (!isRecord(node.transform)) {
    diagnostics.push(issue("SCENE_INVALID_NODE", "Node transform must be an object.", path + ".transform", node.id));
    valid = false;
  }
  if (!Array.isArray(node.components)) {
    diagnostics.push(issue("SCENE_INVALID_NODE", "Node components must be an array.", path + ".components", node.id));
    valid = false;
  }
  if (!Array.isArray(node.children)) {
    diagnostics.push(issue("SCENE_INVALID_NODE", "Node children must be an array.", path + ".children", node.id));
    valid = false;
  }
  if (!valid) return node as unknown as NodeDocument;

  if (!isNonEmptyString(node.name) || typeof node.active !== "boolean" ||
      !isRecord(node.transform) || !Array.isArray(node.components) || !Array.isArray(node.children)) {
    return node as unknown as NodeDocument;
  }

  const nodeId = node.id as string;
  warnUnknownFields(
    node,
    new Set(["id", "name", "active", "transform", "components", "children", "prefabInstance"]),
    path,
    diagnostics,
    nodeId,
  );
  warnUnknownFields(
    node.transform,
    new Set(["x", "y", "rotation", "scaleX", "scaleY", "originX", "originY"]),
    path + ".transform",
    diagnostics,
    nodeId,
  );
  for (const key of ["x", "y", "rotation", "scaleX", "scaleY", "originX", "originY"]) {
    const value = node.transform[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      diagnostics.push(issue("SCENE_INVALID_TRANSFORM", "Transform " + key + " must be finite.", path + ".transform." + key, nodeId));
    }
  }

  const components = node.components.map((component, index) => {
    const componentPath = path + ".components[" + index + "]";
    if (!isRecord(component) || !isValidStableId(component.id) ||
        !isValidStableId(component.typeId) || typeof component.schemaVersion !== "number" ||
        typeof component.enabled !== "boolean" || !isRecord(component.properties) || !isJsonValue(component)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Component instance requires id, typeId, schemaVersion, enabled and JSON properties.", componentPath, nodeId));
      return component;
    }
    if (!Number.isInteger(component.schemaVersion) || component.schemaVersion < 1) {
      diagnostics.push(issue(
        "COMPONENT_INVALID_SCHEMA",
        "Component instance schemaVersion must be a positive integer.",
        componentPath + ".schemaVersion",
        nodeId,
      ));
      return component;
    }
    warnUnknownFields(
      component,
      new Set(["id", "typeId", "schemaVersion", "enabled", "properties"]),
      componentPath,
      diagnostics,
      nodeId,
    );
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
    if (!schema) return component;

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
    return result.valid && result.value
      ? { ...component, properties: result.value }
      : component;
  });

  if (node.prefabInstance !== undefined) {
    const prefab = node.prefabInstance;
    if (!isRecord(prefab) || !isValidStableId(prefab.prefabId) ||
        !Array.isArray(prefab.overrides)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Prefab instance requires a prefabId and JSON overrides.", path + ".prefabInstance", node.id));
    } else if (prefab.sourceNodeId !== undefined && !isValidStableId(prefab.sourceNodeId)) {
      diagnostics.push(issue("SCENE_INVALID_NODE", "Prefab sourceNodeId must be a non-empty stable id.", path + ".prefabInstance.sourceNodeId", node.id));
    } else {
      warnUnknownFields(
        prefab,
        new Set(["prefabId", "overrides", "sourceNodeId"]),
        path + ".prefabInstance",
        diagnostics,
        nodeId,
      );
      validatePrefabOverrides(prefab, path + ".prefabInstance", context, node.id, diagnostics);
    }
  }

  const children = node.children.map((child, index) =>
    validateNode(child, path + ".children[" + index + "]", nodeIds, context, diagnostics, componentIds),
  );
  return {
    ...node,
    transform: { ...node.transform },
    components,
    children,
  } as unknown as NodeDocument;
}

export function validateSceneDocument(
  input: unknown,
  context: SceneValidationContext = {},
): ValidationResult<SceneDocumentV1> {
  if (!isRecord(input) || !hasSafeDataProperties(input)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Scene document must contain only plain data properties without accessors or cycles.")],
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
  if (!isValidStableId(input.id)) {
    return { valid: false, diagnostics: [issue("SCENE_INVALID_NODE", "Scene id must use the stable ID grammar.", "id")] };
  }
  if (!isNonEmptyString(input.name)) {
    return { valid: false, diagnostics: [issue("SCENE_INVALID_NODE", "Scene name must be a non-empty string.", "name")] };
  }
  if (!Array.isArray(input.rootNodes)) {
    return { valid: false, diagnostics: [issue("SCENE_INVALID_NODE", "Scene rootNodes must be an array.", "rootNodes")] };
  }
  if (!isRecord(input.settings)) {
    return { valid: false, diagnostics: [issue("SCENE_INVALID_NODE", "Scene settings must be an object.", "settings")] };
  }
  if (!isJsonValue(input.settings)) {
    return { valid: false, diagnostics: [issue("SCENE_INVALID_NODE", "Scene settings must contain JSON-compatible data.", "settings")] };
  }
  const diagnostics: CoreDiagnostic[] = [];
  warnUnknownFields(
    input,
    new Set(["schemaVersion", "id", "name", "rootNodes", "settings"]),
    "scene",
    diagnostics,
    input.id,
  );
  const nodeIds = new Set<string>();
  collectNodeIds(input.rootNodes, nodeIds, diagnostics, "rootNodes");
  const componentIds = new Set<string>();
  const rootNodes = input.rootNodes.map((node, index) =>
    validateNode(node, "rootNodes[" + index + "]", nodeIds, context, diagnostics, componentIds),
  );
  return hasErrors(diagnostics)
    ? { valid: false, diagnostics }
    : { valid: true, diagnostics, value: { ...input, rootNodes } as unknown as SceneDocumentV1 };
}

export function validatePrefabDocument(
  input: unknown,
  context: SceneValidationContext = {},
): ValidationResult<PrefabDocumentV1> {
  if (!isRecord(input) || !hasSafeDataProperties(input)) {
    return {
      valid: false,
      diagnostics: [issue("SCENE_INVALID_NODE", "Prefab document must contain only plain data properties without accessors or cycles.")],
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
  if (!isValidStableId(input.id)) {
    return { valid: false, diagnostics: [issue("SCENE_INVALID_NODE", "Prefab id must use the stable ID grammar.", "id")] };
  }
  if (!isNonEmptyString(input.name)) {
    return { valid: false, diagnostics: [issue("SCENE_INVALID_NODE", "Prefab name must be a non-empty string.", "name")] };
  }
  if (!isRecord(input.root)) {
    return { valid: false, diagnostics: [issue("SCENE_INVALID_NODE", "Prefab root must be a node object.", "root")] };
  }
  const result = validateSceneDocument({
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    rootNodes: [input.root],
    settings: {},
  }, context);
  const diagnostics = result.diagnostics.map((item) => {
    if (item.path?.startsWith("rootNodes[0]")) {
      return {
        ...item,
        path: "root" + item.path.slice("rootNodes[0]".length),
      };
    }
    return item;
  });
  warnUnknownFields(input, new Set(["schemaVersion", "id", "name", "root"]), "prefab", diagnostics, input.id);
  if (!result.valid || !result.value?.rootNodes[0]) {
    return { valid: false, diagnostics };
  }
  return {
    valid: true,
    diagnostics,
    value: { ...input, root: result.value.rootNodes[0] } as unknown as PrefabDocumentV1,
  };
}
