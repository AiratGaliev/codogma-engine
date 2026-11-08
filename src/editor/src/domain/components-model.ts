import {
  isJsonValue,
  isValidStableId,
  validateComponentProperties,
  type ComponentInstanceDocument,
  type ComponentTypeSchemaV1,
  type NodeReferenceKind,
  type CoreDiagnostic,
  type JsonObject,
  type JsonValue,
  type NodeDocument,
  type ProjectDocumentV1,
  type ValidationResult,
} from "@codogma/cge";
import {
  getSceneNodeEntries,
  isPrefabDocument,
  updateNativeNode,
  type EditorDocument,
} from "./scene-model.js";

export interface NativeComponentContext {
  project: ProjectDocumentV1;
  schemas?: ReadonlyMap<string, ComponentTypeSchemaV1>;
  assets?: ReadonlyMap<string, ProjectDocumentV1["assets"][number]>;
  nodeIds?: ReadonlySet<string>;
  nodeKinds?: ReadonlyMap<string, NodeReferenceKind>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error("Secure randomUUID support is required to create component instance identities.");
}

function userModule(context: NativeComponentContext, typeId: string) {
  if (!isValidStableId(typeId)) throw new TypeError("Component typeId must be a stable native identity.");
  const module = context.project.componentModules.find((item) => item.typeId === typeId);
  if (!module) throw new Error(`Component "${typeId}" is not registered in the native Project manifest.`);
  return module;
}

function createSchemaContext(
  document: EditorDocument,
  nodeId: string,
  context: NativeComponentContext,
) {
  const entries = getSceneNodeEntries(document);
  return {
    assets: context.assets ?? new Map(context.project.assets.map((asset) => [asset.id, asset])),
    nodeIds: context.nodeIds ?? new Set(entries.map((entry) => entry.id)),
    nodeKinds: context.nodeKinds ?? new Map(entries.map((entry) => [entry.id, entry.type])),
    ownerNodeId: nodeId,
  };
}

function validateProperties(
  document: EditorDocument,
  typeId: string,
  properties: Record<string, unknown>,
  context: NativeComponentContext,
  nodeId: string,
): ValidationResult<JsonObject> {
  if (!isPlainObject(properties) || !isJsonValue(properties)) {
    return {
      valid: false,
      diagnostics: [{
        code: "COMPONENT_INVALID_VALUE",
        severity: "error",
        message: "Component properties must be a JSON-compatible object.",
        entityId: nodeId,
      }],
    };
  }
  const schema = context.schemas?.get(typeId);
  if (!schema) {
    return {
      valid: false,
      diagnostics: [{
        code: "COMPONENT_INVALID_SCHEMA",
        severity: "error",
        message: `Component "${typeId}" has no valid registered Component Schema.`,
        entityId: nodeId,
      }],
    };
  }
  return validateComponentProperties(schema, properties, createSchemaContext(document, nodeId, context));
}

function componentPropertiesPath(
  document: EditorDocument,
  nodeId: string,
  instanceId: string | undefined,
): string | undefined {
  const roots = isPrefabDocument(document)
    ? [{ node: document.root, path: "root" }]
    : document.rootNodes.map((node, index) => ({ node, path: `rootNodes[${index}]` }));
  const visit = (node: NodeDocument, path: string): string | undefined => {
    if (node.id === nodeId) {
      const componentIndex = instanceId
        ? node.components.findIndex((component) => component.id === instanceId)
        : -1;
      return componentIndex >= 0 ? `${path}.components[${componentIndex}].properties` : `${path}.components.properties`;
    }
    for (let index = 0; index < node.children.length; index += 1) {
      const found = visit(node.children[index]!, `${path}.children[${index}]`);
      if (found) return found;
    }
    return undefined;
  };
  for (const root of roots) {
    const found = visit(root.node, root.path);
    if (found) return found;
  }
  return undefined;
}

function toPersistedDiagnostics(
  diagnostics: readonly CoreDiagnostic[],
  document: EditorDocument,
  nodeId: string,
  instanceId?: string,
): CoreDiagnostic[] {
  const basePath = componentPropertiesPath(document, nodeId, instanceId);
  return diagnostics.map((item) => ({
    ...item,
    ...(basePath ? { path: item.propertyName ? `${basePath}.${item.propertyName}` : basePath } : {}),
    entityId: nodeId,
    ...(instanceId ? { componentInstanceId: instanceId } : {}),
  }));
}

export function getNativeComponentInstances(
  node: NodeDocument,
  context: NativeComponentContext,
): ComponentInstanceDocument[] {
  const available = new Set(context.project.componentModules.map((item) => item.typeId));
  return node.components.filter((item) => available.has(item.typeId));
}

export function attachNativeComponent(
  document: EditorDocument,
  nodeId: string,
  typeId: string,
  context: NativeComponentContext,
  initialProperties: Record<string, unknown> = {},
): EditorDocument {
  const module = userModule(context, typeId);
  const instanceId = createId();
  return updateNativeNode(document, nodeId, (node) => {
    if (node.components.some((component) => component.typeId === typeId)) {
      throw new Error(`Component "${typeId}" is already attached to Node "${nodeId}".`);
    }
    const result = validateProperties(document, typeId, initialProperties, context, node.id);
    if (!result.valid || !result.value) {
      throw new TypeError(result.diagnostics.map((item) => item.message).join("\n"));
    }
    const instance: ComponentInstanceDocument = {
      id: instanceId,
      typeId: module.typeId,
      schemaVersion: context.schemas?.get(typeId)?.schemaVersion ?? 1,
      enabled: true,
      properties: result.value,
    };
    return { ...node, components: [...node.components, instance] };
  });
}

export function updateNativeComponentProperties(
  document: EditorDocument,
  nodeId: string,
  instanceId: string,
  properties: Record<string, unknown>,
  context: NativeComponentContext,
): EditorDocument {
  return updateNativeNode(document, nodeId, (node) => {
    const instance = node.components.find((component) => component.id === instanceId);
    if (!instance) throw new Error(`Component instance "${instanceId}" was not found on Node "${nodeId}".`);
    if (!context.project.componentModules.some((module) => module.typeId === instance.typeId)) {
      throw new Error(`Component type "${instance.typeId}" is not registered in the native Project manifest.`);
    }
    const result = validateProperties(document, instance.typeId, properties, context, nodeId);
    if (!result.valid || !result.value) {
      throw new TypeError(result.diagnostics.map((item) => item.message).join("\n"));
    }
    return {
      ...node,
      components: node.components.map((component) => component.id === instanceId
        ? { ...component, properties: result.value! }
        : component),
    };
  });
}

export function setNativeComponentEnabled(
  document: EditorDocument,
  nodeId: string,
  instanceId: string,
  enabled: boolean,
): EditorDocument {
  if (typeof enabled !== "boolean") throw new TypeError("Component enabled state must be boolean.");
  return updateNativeNode(document, nodeId, (node) => {
    const exists = node.components.some((component) => component.id === instanceId);
    if (!exists) throw new Error(`Component instance "${instanceId}" was not found on Node "${nodeId}".`);
    return {
      ...node,
      components: node.components.map((component) => component.id === instanceId ? { ...component, enabled } : component),
    };
  });
}

export function detachNativeComponent(
  document: EditorDocument,
  nodeId: string,
  instanceId: string,
): EditorDocument {
  return updateNativeNode(document, nodeId, (node) => {
    if (!node.components.some((component) => component.id === instanceId)) {
      throw new Error(`Component instance "${instanceId}" was not found on Node "${nodeId}".`);
    }
    const components = node.components.filter((component) => component.id !== instanceId);
    return { ...node, components };
  });
}

export function validateNativeComponentProperties(
  typeId: string,
  properties: Record<string, unknown>,
  context: NativeComponentContext,
  nodeId: string,
  document: EditorDocument,
  instanceId?: string,
): ValidationResult<JsonObject> {
  try {
    userModule(context, typeId);
  } catch (error) {
    return {
      valid: false,
      diagnostics: [{
        code: "COMPONENT_UNKNOWN_TYPE",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        entityId: nodeId,
        ...(instanceId ? { componentInstanceId: instanceId } : {}),
      }],
    };
  }
  const result = validateProperties(document, typeId, properties, context, nodeId);
  const diagnostics = toPersistedDiagnostics(result.diagnostics, document, nodeId, instanceId);
  return result.valid && result.value
    ? { valid: true, diagnostics, value: result.value }
    : { valid: false, diagnostics };
}
