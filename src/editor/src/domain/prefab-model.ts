import {
  isJsonValue,
  isValidStableId,
  type NodeDocument,
  type PrefabDocumentV1,
  type PrefabOverrideDocument,
  type ProjectDocumentV1,
  type TransformData,
  type SceneDocumentV1,
} from "@codogma/cge";
import { addNativePrefabReference } from "./project-model.js";

export interface NativePrefabCatalogEntry {
  assetId: string;
  path: string;
  document: PrefabDocumentV1;
}

export interface NativePrefabInstanceOptions {
  name?: string;
  x?: number;
  y?: number;
  active?: boolean;
  transform?: TransformData;
  /** Existing parent Node in the Scene. Omit/null to insert at the Scene root. */
  parentId?: string | null;
}

/**
 * Replaces a saved Prefab document in the in-memory Project catalog without
 * changing its stable Project asset reference or the other catalog entries.
 */
export function replaceNativePrefabCatalogDocument(
  catalog: readonly NativePrefabCatalogEntry[],
  document: PrefabDocumentV1,
): NativePrefabCatalogEntry[] {
  return catalog.map((entry) => entry.document.id === document.id
    ? { ...entry, document }
    : entry);
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error("Secure randomUUID support is required to create Prefab identities.");
}

function cloneNode(node: NodeDocument): NodeDocument {
  return {
    ...node,
    transform: { ...node.transform },
    components: node.components.map((component) => ({
      ...component,
      properties: JSON.parse(JSON.stringify(component.properties)) as Record<string, unknown>,
    })),
    children: node.children.map(cloneNode),
    ...(node.prefabInstance
      ? { prefabInstance: { ...node.prefabInstance, overrides: node.prefabInstance.overrides.map((item) => ({ ...item })) } }
      : {}),
  };
}

function updateNode(
  roots: readonly NodeDocument[],
  targetNodeId: string,
  update: (node: NodeDocument) => NodeDocument,
): { roots: NodeDocument[]; found: boolean } {
  let found = false;
  const next = roots.map((node) => {
    if (node.id === targetNodeId) {
      found = true;
      return update(cloneNode(node));
    }
    const childResult = updateNode(node.children, targetNodeId, update);
    if (!childResult.found) return node;
    found = true;
    return { ...node, children: childResult.roots };
  });
  return { roots: next, found };
}

function findNode(roots: readonly NodeDocument[], id: string): NodeDocument | undefined {
  for (const node of roots) {
    if (node.id === id) return node;
    const nested = findNode(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

export function createNativePrefabDocument(node: NodeDocument, name = node.name): PrefabDocumentV1 {
  if (!node || !isValidStableId(node.id)) throw new TypeError("A native Node with a stable id is required.");
  if (!name.trim()) throw new TypeError("Prefab name must be non-empty.");
  if (node.prefabInstance) {
    throw new TypeError("A Prefab instance cannot be nested into a new Prefab until nested Prefab authoring is implemented.");
  }
  return {
    schemaVersion: 1,
    id: createId(),
    name,
    root: cloneNode(node),
  };
}

export function registerNativePrefab(
  project: ProjectDocumentV1,
  prefab: PrefabDocumentV1,
  assetId: string,
  path: string,
): ProjectDocumentV1 {
  return addNativePrefabReference(project, prefab, assetId, path);
}

export function createNativePrefabInstanceNode(
  prefab: PrefabDocumentV1,
  options: NativePrefabInstanceOptions = {},
): NodeDocument {
  if (!prefab || prefab.schemaVersion !== 1 || !isValidStableId(prefab.id)) {
    throw new TypeError("A validated PrefabDocumentV1 is required.");
  }
  const sourceTransform = options.transform ?? prefab.root.transform;
  const x = options.x ?? sourceTransform.x;
  const y = options.y ?? sourceTransform.y;
  const transform = { ...sourceTransform, x, y };
  for (const [field, value] of Object.entries(transform)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`Prefab instance Transform ${field} must be finite.`);
    }
  }
  return {
    id: createId(),
    name: options.name?.trim() || prefab.name,
    active: options.active ?? true,
    transform,
    components: [],
    children: [],
    prefabInstance: {
      prefabId: prefab.id,
      sourceNodeId: prefab.root.id,
      overrides: [],
    },
  };
}

export function addNativePrefabInstance(
  scene: SceneDocumentV1,
  prefab: PrefabDocumentV1,
  options: NativePrefabInstanceOptions = {},
): SceneDocumentV1 {
  const instance = createNativePrefabInstanceNode(prefab, options);
  if (scene.rootNodes.some((root) => root.id === instance.id)) {
    throw new Error("Generated Prefab instance identity already exists.");
  }
  const parentId = options.parentId ?? null;
  if (parentId === null) {
    return { ...scene, rootNodes: [...scene.rootNodes, instance] };
  }

  const insert = (nodes: readonly NodeDocument[]): { nodes: NodeDocument[]; found: boolean } => {
    let found = false;
    const next = nodes.map((node) => {
      if (node.id === parentId) {
        found = true;
        return { ...node, children: [...node.children, instance] };
      }
      const childResult = insert(node.children);
      if (!childResult.found) return node;
      found = true;
      return { ...node, children: childResult.nodes };
    });
    return { nodes: next, found };
  };
  const result = insert(scene.rootNodes);
  if (!result.found) throw new Error(`Prefab parent Node "${parentId}" was not found in the Scene.`);
  return { ...scene, rootNodes: result.nodes };
}

const NODE_TRANSFORM_OVERRIDE_KEYS = new Set([
  "x", "y", "rotation", "scaleX", "scaleY", "originX", "originY",
]);

function validateNativePrefabNodeOverride(override: PrefabOverrideDocument): void {
  if (override.targetComponentId) return;

  if (override.propertyPath === "name") {
    if (typeof override.value !== "string" || !override.value.trim()) {
      throw new TypeError('Prefab Node "name" override must be a non-empty string.');
    }
    return;
  }
  if (override.propertyPath === "active") {
    if (typeof override.value !== "boolean") {
      throw new TypeError('Prefab Node "active" override must be a boolean.');
    }
    return;
  }
  if (override.propertyPath.startsWith("transform.")) {
    const key = override.propertyPath.slice("transform.".length);
    if (!NODE_TRANSFORM_OVERRIDE_KEYS.has(key) ||
        typeof override.value !== "number" || !Number.isFinite(override.value)) {
      throw new TypeError(`Prefab Node override "${override.propertyPath}" must target a supported finite Transform field.`);
    }
    return;
  }
  throw new TypeError(`Prefab Node override "${override.propertyPath}" is not supported.`);
}

function validateNativePrefabOverride(
  prefab: PrefabDocumentV1,
  override: PrefabOverrideDocument,
): void {
  const pathSegments = typeof override?.propertyPath === "string" ? override.propertyPath.split(".") : [];
  const forbiddenPathSegments = new Set(["__proto__", "prototype", "constructor"]);
  if (!override || typeof override !== "object" || !isJsonValue(override.value) ||
      !isValidStableId(override.targetNodeId) || pathSegments.length === 0 ||
      pathSegments.some((part) =>
        !/^[A-Za-z_$][\\w$]*$/.test(part) || forbiddenPathSegments.has(part),
      ) ||
      (override.targetComponentId !== undefined && !isValidStableId(override.targetComponentId))) {
    throw new TypeError("Prefab override requires a stable target, safe property path and JSON-compatible value.");
  }

  const target = findNode([prefab.root], override.targetNodeId);
  if (!target) throw new Error(`Prefab Node "${override.targetNodeId}" was not found.`);
  if (override.targetComponentId && !target.components.some((item) => item.id === override.targetComponentId)) {
    throw new Error(`Prefab Component "${override.targetComponentId}" was not found on Node "${override.targetNodeId}".`);
  }
  validateNativePrefabNodeOverride(override);
}

export function addNativePrefabOverride(
  scene: SceneDocumentV1,
  instanceNodeId: string,
  prefab: PrefabDocumentV1,
  override: PrefabOverrideDocument,
): SceneDocumentV1 {
  validateNativePrefabOverride(prefab, override);
  const result = updateNode(scene.rootNodes, instanceNodeId, (node) => {
    if (node.prefabInstance?.prefabId !== prefab.id) {
      throw new Error(`Node "${instanceNodeId}" is not an instance of Prefab "${prefab.id}".`);
    }
    const current = node.prefabInstance.overrides.filter((item) =>
      item.targetNodeId !== override.targetNodeId ||
      item.targetComponentId !== override.targetComponentId ||
      item.propertyPath !== override.propertyPath,
    );
    return {
      ...node,
      prefabInstance: {
        ...node.prefabInstance,
        overrides: [...current, { ...override }],
      },
    };
  });
  if (!result.found) throw new Error(`Prefab instance Node "${instanceNodeId}" was not found.`);
  return { ...scene, rootNodes: result.roots };
}

function setPathValue(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  const forbiddenPathSegments = new Set(["__proto__", "prototype", "constructor"]);
  if (parts.length === 0 || parts.some((part) =>
    !/^[A-Za-z_$][\w$]*$/.test(part) || forbiddenPathSegments.has(part),
  )) {
    throw new TypeError(`Prefab override property path "${path}" is invalid.`);
  }
  const next = { ...target };
  let current = next;
  for (const part of parts.slice(0, -1)) {
    const child = current[part];
    if (child === null || typeof child !== "object" || Array.isArray(child)) {
      throw new TypeError(`Prefab override path "${path}" does not resolve to an object.`);
    }
    const copy = { ...(child as Record<string, unknown>) };
    current[part] = copy;
    current = copy;
  }
  current[parts[parts.length - 1]!] = value;
  return next;
}

function applyOverride(node: NodeDocument, override: PrefabOverrideDocument): NodeDocument {
  if (node.id !== override.targetNodeId) {
    return { ...node, children: node.children.map((child) => applyOverride(child, override)) };
  }
  if (override.targetComponentId) {
    return {
      ...node,
      components: node.components.map((component) => component.id === override.targetComponentId
        ? { ...component, properties: setPathValue(component.properties, override.propertyPath, override.value) }
        : component),
    };
  }
  if (override.propertyPath === "name") return { ...node, name: String(override.value) };
  if (override.propertyPath === "active" && typeof override.value === "boolean") {
    return { ...node, active: override.value };
  }
  if (override.propertyPath.startsWith("transform.")) {
    const key = override.propertyPath.slice("transform.".length);
    if (!["x", "y", "rotation", "scaleX", "scaleY", "originX", "originY"].includes(key) ||
        typeof override.value !== "number" || !Number.isFinite(override.value)) {
      throw new TypeError(`Prefab override "${override.propertyPath}" is not a valid Transform field.`);
    }
    return { ...node, transform: { ...node.transform, [key]: override.value } };
  }
  throw new TypeError(`Prefab override "${override.propertyPath}" is not supported for a Node field.`);
}

export function resolveNativePrefabRoot(
  instance: NodeDocument,
  prefab: PrefabDocumentV1,
): NodeDocument {
  if (instance.prefabInstance?.prefabId !== prefab.id) {
    throw new TypeError("The Node does not reference the supplied native Prefab.");
  }
  if (!Array.isArray(instance.prefabInstance.overrides)) {
    throw new TypeError("Native Prefab instance overrides must be an array.");
  }
  instance.prefabInstance.overrides.forEach((override) => validateNativePrefabOverride(prefab, override));
  return instance.prefabInstance.overrides.reduce(
    (root, override) => applyOverride(root, override),
    cloneNode(prefab.root),
  );
}
