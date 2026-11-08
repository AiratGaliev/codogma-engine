import {
  createDefaultTransform,
  isValidStableId,
  type ComponentInstanceDocument,
  type NodeDocument,
  type PrefabDocumentV1,
  type SceneDocumentV1,
} from "@codogma/cge";
import { resolveNativePrefabRoot } from "./prefab-model.js";
import { BUILTIN_COMPONENT_TYPES } from "./builtin-component-ids.js";
export { BUILTIN_COMPONENT_TYPES } from "./builtin-component-ids.js";

export type EditorDocument = SceneDocumentV1 | PrefabDocumentV1;

const RENDERER_TYPES: Readonly<Record<string, "Image" | "Text" | "Container">> = {
  [BUILTIN_COMPONENT_TYPES.imageRenderer]: "Image",
  [BUILTIN_COMPONENT_TYPES.textRenderer]: "Text",
  [BUILTIN_COMPONENT_TYPES.container]: "Container",
};

const TRANSFORM_KEYS = ["x", "y", "rotation", "scaleX", "scaleY", "originX", "originY"] as const;
type TransformKey = (typeof TRANSFORM_KEYS)[number];

interface SceneNodeView {
  id: string;
  name: string;
  label: string;
  type: "Image" | "Text" | "Container" | "Prefab" | "Node";
  renderType: "Image" | "Text" | "Container" | "Node";
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
  active: boolean;
  alpha: number;
  depth: number;
  texture?: { key: string };
  text?: string;
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  align?: string;
  wordWrapWidth?: number;
}

export interface SceneNodeEntry {
  id: string;
  name: string;
  type: SceneNodeView["type"];
  parentId: string | null;
  depth: number;
  source: SceneNodeView;
  node: NodeDocument;
  renderNode: NodeDocument;
}

export interface SceneNodePatch extends Partial<Record<TransformKey, number>> {
  name?: string;
  label?: string;
  active?: boolean;
  alpha?: number;
  depth?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  align?: string;
  wordWrapWidth?: number;
  assetId?: string;
}

export type SceneNodeKind = "Image" | "Text" | "Container";

const NODE_PATCH_KEYS = new Set([
  ...TRANSFORM_KEYS,
  "name", "label", "active", "alpha", "depth",
  "text", "fontFamily", "fontSize", "color", "align", "wordWrapWidth", "assetId",
]);
const TEXT_RENDERER_PATCH_KEYS = ["text", "fontFamily", "fontSize", "color", "align", "wordWrapWidth"] as const;

function validateSceneNodePatch(patch: SceneNodePatch): void {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("Scene Node patch must be a plain object.");
  }
  const prototype = Object.getPrototypeOf(patch);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Scene Node patch must be a plain object.");
  }

  for (const key of Reflect.ownKeys(patch)) {
    if (typeof key !== "string" || !NODE_PATCH_KEYS.has(key)) {
      throw new TypeError(`Unsupported Scene Node patch field "${String(key)}".`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(patch, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new TypeError(`Scene Node patch field "${key}" must be a data property.`);
    }
  }

  for (const key of TRANSFORM_KEYS) {
    const value = patch[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new TypeError(`Transform ${key} must be a finite number.`);
    }
  }
  for (const key of ["name", "label"] as const) {
    const value = patch[key];
    // Empty names are temporarily permitted while the Inspector text input is
    // being edited; Core serialization remains the final non-empty check.
    if (value !== undefined && typeof value !== "string") {
      throw new TypeError(`Scene Node ${key} must be a string.`);
    }
  }
  if (patch.name !== undefined && patch.label !== undefined && patch.name !== patch.label) {
    throw new TypeError("Scene Node patch cannot contain conflicting name and label values.");
  }
  if (patch.active !== undefined && typeof patch.active !== "boolean") {
    throw new TypeError("Scene Node active must be a boolean.");
  }
  if (patch.alpha !== undefined &&
      (typeof patch.alpha !== "number" || !Number.isFinite(patch.alpha) || patch.alpha < 0 || patch.alpha > 1)) {
    throw new RangeError("Renderer alpha must be a finite number between 0 and 1.");
  }
  if (patch.depth !== undefined && (typeof patch.depth !== "number" || !Number.isFinite(patch.depth))) {
    throw new TypeError("Renderer depth must be a finite number.");
  }
  for (const key of ["text", "fontFamily", "fontSize", "color"] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== "string") {
      throw new TypeError(`Text Renderer ${key} must be a string.`);
    }
  }
  if (patch.fontFamily !== undefined && !patch.fontFamily.trim()) {
    throw new TypeError("Text Renderer fontFamily must be non-empty.");
  }
  if (patch.fontSize !== undefined && !patch.fontSize.trim()) {
    throw new TypeError("Text Renderer fontSize must be non-empty.");
  }
  if (patch.color !== undefined && !patch.color.trim()) {
    throw new TypeError("Text Renderer color must be non-empty.");
  }
  if (patch.align !== undefined && !["left", "center", "right"].includes(patch.align)) {
    throw new TypeError('Text Renderer align must be "left", "center" or "right".');
  }
  if (patch.wordWrapWidth !== undefined &&
      (typeof patch.wordWrapWidth !== "number" || !Number.isFinite(patch.wordWrapWidth) || patch.wordWrapWidth < 0)) {
    throw new RangeError("Text Renderer wordWrapWidth must be a finite non-negative number.");
  }
  if (patch.assetId !== undefined && (typeof patch.assetId !== "string" || !isValidStableId(patch.assetId))) {
    throw new TypeError("Image Renderer assetId must be a stable Asset ID.");
  }
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error("Secure randomUUID support is required to create native document identities.");
}

export function isPrefabDocument(value: EditorDocument | null | undefined): value is PrefabDocumentV1 {
  return Boolean(value && "root" in value);
}

function documentRoots(document: EditorDocument): NodeDocument[] {
  return isPrefabDocument(document) ? [document.root] : document.rootNodes;
}

function cloneNode(node: NodeDocument): NodeDocument {
  return {
    ...node,
    transform: { ...node.transform },
    components: node.components.map((component) => ({
      ...component,
      properties: { ...component.properties },
    })),
    children: node.children.map(cloneNode),
    ...(node.prefabInstance
      ? { prefabInstance: { ...node.prefabInstance, overrides: node.prefabInstance.overrides.map((item) => ({ ...item })) } }
      : {}),
  };
}

function collectNodes(
  roots: readonly NodeDocument[],
  prefabs: ReadonlyMap<string, PrefabDocumentV1>,
): SceneNodeEntry[] {
  const result: SceneNodeEntry[] = [];
  const visit = (node: NodeDocument, parentId: string | null, depth: number): void => {
    const prefab = node.prefabInstance ? prefabs.get(node.prefabInstance.prefabId) : undefined;
    const effectiveNode = prefab ? resolveNativePrefabRoot(node, prefab) : node;
    const renderer = effectiveNode.components.find((component) =>
      Object.prototype.hasOwnProperty.call(RENDERER_TYPES, component.typeId),
    );
    const rendererType = renderer ? RENDERER_TYPES[renderer.typeId] ?? "Node" : "Node";
    const properties = renderer?.properties ?? {};
    const view: SceneNodeView = {
      id: node.id,
      name: node.name,
      label: node.name,
      type: node.prefabInstance ? "Prefab" : rendererType,
      renderType: rendererType,
      x: node.transform.x,
      y: node.transform.y,
      rotation: node.transform.rotation,
      scaleX: node.transform.scaleX,
      scaleY: node.transform.scaleY,
      originX: node.transform.originX,
      originY: node.transform.originY,
      active: node.active,
      alpha: typeof properties.alpha === "number" ? properties.alpha : 1,
      depth: typeof properties.depth === "number" ? properties.depth : 0,
      ...(rendererType === "Image" && typeof properties.assetId === "string" && properties.assetId
        ? { texture: { key: properties.assetId } }
        : {}),
      ...(rendererType === "Text" ? {
        text: typeof properties.text === "string" ? properties.text : "",
        fontFamily: typeof properties.fontFamily === "string" ? properties.fontFamily : "Arial",
        fontSize: typeof properties.fontSize === "string" ? properties.fontSize : "16px",
        color: typeof properties.color === "string" ? properties.color : "#E7EBF2",
        align: typeof properties.align === "string" ? properties.align : "left",
        ...(typeof properties.wordWrapWidth === "number" ? { wordWrapWidth: properties.wordWrapWidth } : {}),
      } : {}),
    };
    result.push({ id: node.id, name: node.name, type: view.type, parentId, depth, source: view, node, renderNode: effectiveNode });
    node.children.forEach((child) => visit(child, node.id, depth + 1));
  };
  roots.forEach((root) => visit(root, null, 0));
  return result;
}

export function getSceneNodeEntries(
  document: EditorDocument,
  prefabDocuments: readonly PrefabDocumentV1[] = [],
): SceneNodeEntry[] {
  const prefabs = new Map(prefabDocuments.map((prefab) => [prefab.id, prefab]));
  return collectNodes(documentRoots(document), prefabs);
}

function updateNodeRecursively(
  nodes: readonly NodeDocument[],
  id: string,
  update: (node: NodeDocument) => NodeDocument,
): { nodes: NodeDocument[]; found: boolean } {
  let found = false;
  const next = nodes.map((node) => {
    if (node.id === id) {
      found = true;
      return update(cloneNode(node));
    }
    const children = updateNodeRecursively(node.children, id, update);
    if (!children.found) return node;
    found = true;
    return { ...node, children: children.nodes };
  });
  return { nodes: next, found };
}

function replaceDocumentRoots(document: EditorDocument, roots: NodeDocument[]): EditorDocument {
  return isPrefabDocument(document) ? { ...document, root: roots[0] ?? document.root } : { ...document, rootNodes: roots };
}

function getRendererComponent(node: NodeDocument): ComponentInstanceDocument | undefined {
  return node.components.find((component) =>
    Object.prototype.hasOwnProperty.call(RENDERER_TYPES, component.typeId),
  );
}

function updateRendererProperties(
  node: NodeDocument,
  patch: Record<string, unknown>,
): NodeDocument {
  const renderer = getRendererComponent(node);
  if (!renderer) return node;
  return {
    ...node,
    components: node.components.map((component) => component.id === renderer.id
      ? { ...component, properties: { ...component.properties, ...patch } }
      : component),
  };
}

export function updateSceneNode(
  document: EditorDocument,
  id: string,
  patch: SceneNodePatch,
): EditorDocument {
  validateSceneNodePatch(patch);
  const result = updateNodeRecursively(documentRoots(document), id, (node) => {
    const renderer = getRendererComponent(node);
    const rendererType = renderer ? RENDERER_TYPES[renderer.typeId] : undefined;
    const hasTextRendererPatch = TEXT_RENDERER_PATCH_KEYS.some((key) => patch[key] !== undefined);
    if (hasTextRendererPatch && rendererType !== "Text") {
      throw new TypeError(`Scene Node "${id}" does not have a Text Renderer.`);
    }
    if (patch.assetId !== undefined && rendererType !== "Image") {
      throw new TypeError(`Scene Node "${id}" does not have an Image Renderer.`);
    }
    if ((patch.alpha !== undefined || patch.depth !== undefined) && !renderer) {
      throw new TypeError(`Scene Node "${id}" has no built-in Renderer for alpha or depth properties.`);
    }
    const transformPatch: Partial<Record<TransformKey, number>> = {};
    for (const key of TRANSFORM_KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      transformPatch[key] = value;
    }

    const nextName = patch.name ?? patch.label;
    let next: NodeDocument = {
      ...node,
      ...(nextName === undefined ? {} : { name: nextName }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      transform: { ...node.transform, ...transformPatch },
    };

    const componentPatch: Record<string, unknown> = {};
    for (const key of ["alpha", "depth", "text", "fontFamily", "fontSize", "color", "align", "wordWrapWidth", "assetId"] as const) {
      const value = patch[key];
      if (value !== undefined) componentPatch[key] = value;
    }
    if (Object.keys(componentPatch).length > 0) next = updateRendererProperties(next, componentPatch);
    return next;
  });
  if (!result.found) throw new Error(`Scene node "${id}" was not found.`);
  return replaceDocumentRoots(document, result.nodes);
}

export function updateNativeNode(
  document: EditorDocument,
  id: string,
  update: (node: NodeDocument) => NodeDocument,
): EditorDocument {
  const result = updateNodeRecursively(documentRoots(document), id, update);
  if (!result.found) throw new Error(`Scene node "${id}" was not found.`);
  return replaceDocumentRoots(document, result.nodes);
}

export function createSceneNode(document: EditorDocument, kind: SceneNodeKind, assetId?: string): EditorDocument {
  const id = createId();
  const componentId = createId();
  const rendererTypeId = kind === "Image"
    ? BUILTIN_COMPONENT_TYPES.imageRenderer
    : kind === "Text"
      ? BUILTIN_COMPONENT_TYPES.textRenderer
      : BUILTIN_COMPONENT_TYPES.container;
  const properties: Record<string, unknown> = kind === "Text"
    ? { text: "New text", fontFamily: "Arial", fontSize: "16px", color: "#E7EBF2", align: "left" }
    : kind === "Image" && assetId
      ? { assetId }
      : {};
  const node: NodeDocument = {
    id,
    name: `New ${kind}`,
    active: true,
    transform: { ...createDefaultTransform(), x: 400, y: 300 },
    components: [{
      id: componentId,
      typeId: rendererTypeId,
      schemaVersion: 1,
      enabled: true,
      properties,
    }],
    children: [],
  };

  if (isPrefabDocument(document)) {
    return { ...document, root: { ...cloneNode(document.root), children: [...document.root.children, node] } };
  }
  return { ...document, rootNodes: [...document.rootNodes, node] };
}

export function removeSceneNode(document: EditorDocument, id: string): EditorDocument {
  if (isPrefabDocument(document) && document.root.id === id) {
    throw new Error("The root Node of a Prefab cannot be removed.");
  }
  const remove = (nodes: readonly NodeDocument[]): { nodes: NodeDocument[]; found: boolean } => {
    let found = false;
    const next: NodeDocument[] = [];
    for (const node of nodes) {
      if (node.id === id) {
        found = true;
        continue;
      }
      const children = remove(node.children);
      found ||= children.found;
      next.push(children.found ? { ...node, children: children.nodes } : node);
    }
    return { nodes: next, found };
  };
  const result = isPrefabDocument(document)
    ? remove(document.root.children)
    : remove(document.rootNodes);
  if (!result.found) throw new Error(`Scene node "${id}" was not found.`);
  return isPrefabDocument(document)
    ? { ...document, root: { ...document.root, children: result.nodes } }
    : { ...document, rootNodes: result.nodes };
}

export function reparentSceneNode(
  document: EditorDocument,
  id: string,
  parentId: string | null,
): EditorDocument {
  const entries = getSceneNodeEntries(document);
  const selected = entries.find((entry) => entry.id === id);
  if (!selected) throw new Error(`Scene node "${id}" was not found.`);
  if (parentId === id || (parentId && isDescendant(selected.node, parentId))) {
    throw new Error("A Node cannot be reparented into its own subtree.");
  }
  if (isPrefabDocument(document) && document.root.id === id) {
    throw new Error("The root Node of a Prefab cannot be reparented.");
  }

  const removeFrom = (nodes: readonly NodeDocument[]): { nodes: NodeDocument[]; moved?: NodeDocument } => {
    const next: NodeDocument[] = [];
    let moved: NodeDocument | undefined;
    for (const node of nodes) {
      if (node.id === id) {
        moved = node;
        continue;
      }
      const children = removeFrom(node.children);
      moved ??= children.moved;
      next.push(children.moved ? { ...node, children: children.nodes } : node);
    }
    return { nodes: next, ...(moved ? { moved } : {}) };
  };

  const initialRoots = documentRoots(document);
  const detached = isPrefabDocument(document)
    ? removeFrom(document.root.children)
    : removeFrom(initialRoots);
  if (!detached.moved) throw new Error(`Scene node "${id}" could not be detached.`);
  const nodeToInsert = detached.moved;

  if (parentId === null) {
    if (isPrefabDocument(document)) {
      throw new Error("A Prefab document has exactly one root Node; reparent to its root instead.");
    }
    return { ...document, rootNodes: [...detached.nodes, nodeToInsert] };
  }

  const attach = (nodes: readonly NodeDocument[]): { nodes: NodeDocument[]; found: boolean } => {
    let found = false;
    const next = nodes.map((node) => {
      if (node.id === parentId) {
        found = true;
        return { ...node, children: [...node.children, nodeToInsert] };
      }
      const children = attach(node.children);
      if (!children.found) return node;
      found = true;
      return { ...node, children: children.nodes };
    });
    return { nodes: next, found };
  };

  const targetRoots = isPrefabDocument(document) ? [document.root] : detached.nodes;
  const attached = attach(targetRoots);
  if (!attached.found) throw new Error(`Parent Node "${parentId}" was not found.`);
  return isPrefabDocument(document)
    ? { ...document, root: attached.nodes[0] ?? document.root }
    : { ...document, rootNodes: attached.nodes };
}

function isDescendant(node: NodeDocument, id: string): boolean {
  return node.children.some((child) => child.id === id || isDescendant(child, id));
}

export function findSceneNode(document: EditorDocument, id: string): NodeDocument | undefined {
  return getSceneNodeEntries(document).find((entry) => entry.id === id)?.node;
}
