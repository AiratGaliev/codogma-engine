import {
  isJsonValue,
  isValidStableId,
  validateComponentProperties,
  type ComponentInstanceDocument,
  type ComponentTypeSchemaV1,
  type JsonObject,
  type JsonValue,
  type NodeDocument,
  type ProjectDocumentV1,
  type ValidationResult,
} from "@codogma/cge";
import { updateNativeNode, type EditorDocument } from "./native-scene-model.js";

export interface NativeComponentContext {
  project: ProjectDocumentV1;
  schemas?: ReadonlyMap<string, ComponentTypeSchemaV1>;
  assets?: ReadonlyMap<string, ProjectDocumentV1["assets"][number]>;
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

function validateProperties(
  typeId: string,
  properties: Record<string, unknown>,
  context: NativeComponentContext,
  nodeId: string,
): Record<string, unknown> {
  if (!isPlainObject(properties) || !isJsonValue(properties)) {
    throw new TypeError("Component properties must be a JSON-compatible object.");
  }
  const schema = context.schemas?.get(typeId);
  if (!schema) return { ...properties };
  const result = validateComponentProperties(schema, properties, {
    ...(context.assets ? { assets: context.assets } : {}),
    ownerNodeId: nodeId,
  });
  if (!result.valid || !result.value) {
    throw new TypeError(result.diagnostics.map((item) => item.message).join("\n"));
  }
  return result.value as JsonObject;
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
    const duplicate = node.components.find((component) => component.typeId === typeId);
    if (duplicate) return node;
    const properties = validateProperties(typeId, initialProperties, context, node.id);
    const instance: ComponentInstanceDocument = {
      id: instanceId,
      typeId: module.typeId,
      schemaVersion: context.schemas?.get(typeId)?.schemaVersion ?? 1,
      enabled: true,
      properties,
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
    const validated = validateProperties(instance.typeId, properties, context, nodeId);
    return {
      ...node,
      components: node.components.map((component) => component.id === instanceId
        ? { ...component, properties: validated }
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
): ValidationResult<JsonValue> {
  try {
    userModule(context, typeId);
    return {
      valid: true,
      diagnostics: [],
      value: validateProperties(typeId, properties, context, nodeId) as JsonObject,
    };
  } catch (error) {
    return {
      valid: false,
      diagnostics: [{
        code: "COMPONENT_INVALID_VALUE",
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        entityId: nodeId,
      }],
    };
  }
}
