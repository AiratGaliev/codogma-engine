export interface SceneObject {
  id?: string;
  label?: string;
  type?: string;
  prefabId?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  originX?: number;
  originY?: number;
  alpha?: number;
  texture?: { key?: string; [key: string]: unknown };
  components?: string[];
  list?: unknown[];
  [key: string]: unknown;
}

export interface SceneDocument {
  id: string;
  sceneType?: string;
  settings?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  displayList: SceneObject[];
  plainObjects?: SceneObject[];
  [key: string]: unknown;
}

export interface SceneObjectEntry {
  id: string;
  name: string;
  type: string;
  collection: "displayList" | "plainObjects";
  index: number;
  parentId: string | null;
  depth: number;
  source: SceneObject;
}

export interface SceneFileTreeEntry {
  name: string;
  isFile: boolean;
  children?: SceneFileTreeEntry[];
}

type SceneCollection = SceneObjectEntry["collection"];
type SceneObjectKind = "Image" | "Text" | "Container";

const EDITABLE_NUMERIC_PROPERTIES = new Set([
  "x", "y", "rotation", "scaleX", "scaleY", "originX", "originY", "alpha",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertScene(scene: unknown): asserts scene is SceneDocument {
  if (!isRecord(scene)) throw new TypeError("A scene must be a JSON object.");
  if (typeof scene.id !== "string" || scene.id.length === 0) {
    throw new TypeError("The scene is missing its stable id.");
  }
  if (!Array.isArray(scene.displayList)) {
    throw new TypeError("The scene displayList must be an array.");
  }
  if (scene.plainObjects !== undefined && !Array.isArray(scene.plainObjects)) {
    throw new TypeError("The scene plainObjects value must be an array.");
  }
}

function getSceneObjectId(source: unknown, collection: SceneCollection, path: string): string {
  return isRecord(source) && typeof source.id === "string" && source.id.length > 0
    ? source.id
    : `${collection}-${path}`;
}

function isFxHelperNode(source: unknown): boolean {
  if (!isRecord(source) || typeof source.type !== "string") return false;
  return [
    "Circle", "Bloom", "Gradient", "Shine", "Barrel", "Blend", "Blocky", "Blur",
    "Bokeh", "ColorMatrix", "CombineColorMatrix", "Displacement", "Glow",
    "GradientMap", "ImageLight", "Key", "NormalTools", "ObjectMask",
    "PanoramaBlur", "ParallelFilters", "Pixelate", "Quantize", "Sampler",
    "Shadow", "Threshold", "TextureMask", "Vignette", "Wipe",
  ].includes(source.type);
}

/**
 * Parse a legacy Codogma/Phaser Editor .scene file without changing its schema.
 * Unknown fields are deliberately preserved.
 */
export function parseSceneContent(content: string): SceneDocument {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new TypeError("The scene file is empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new SyntaxError(
      `The scene file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  assertScene(parsed);
  return parsed;
}

/**
 * Return display-list and plain-object nodes in their original storage order.
 * The source reference is retained for read-only rendering; mutations must go
 * through updateSceneObject/removeSceneObject.
 */
export function getSceneObjects(scene: SceneDocument): SceneObjectEntry[] {
  assertScene(scene);
  const objects: SceneObjectEntry[] = [];

  function visit(
    nodes: unknown[],
    collection: SceneCollection,
    pathPrefix: string,
    parentId: string | null,
    depth: number,
  ): void {
    nodes.forEach((source, index) => {
      if (!isRecord(source) || isFxHelperNode(source)) return;
      const path = `${pathPrefix}${index}`;
      const id = getSceneObjectId(source, collection, path);
      objects.push({
        id,
        name:
          typeof source.label === "string" && source.label.length > 0
            ? source.label
            : typeof source.type === "string"
              ? source.type
              : source.prefabId
                ? "Prefab instance"
                : "Object",
        type:
          typeof source.type === "string"
            ? source.type
            : source.prefabId
              ? "Prefab"
              : "Object",
        collection,
        index,
        parentId,
        depth,
        source: source as SceneObject,
      });
      if (Array.isArray(source.list)) {
        visit(source.list, collection, `${path}-list-`, id, depth + 1);
      }
    });
  }

  for (const collection of ["displayList", "plainObjects"] as const) {
    visit(scene[collection] ?? [], collection, "", null, 0);
  }
  return objects;
}

/**
 * Apply an inspector edit immutably while preserving all serialized fields.
 * Values are limited to properties understood by the current Inspector slice.
 */
export function updateSceneObject(
  scene: SceneDocument,
  id: string,
  patch: Partial<SceneObject>,
): SceneDocument {
  assertScene(scene);
  if (typeof id !== "string" || !patch || typeof patch !== "object") {
    throw new TypeError("A scene object id and patch are required.");
  }

  for (const [key, value] of Object.entries(patch)) {
    if (EDITABLE_NUMERIC_PROPERTIES.has(key) &&
        (typeof value !== "number" || !Number.isFinite(value))) {
      throw new TypeError(`The "${key}" property must be a finite number.`);
    }
  }

  function updateNodes(
    nodes: unknown[],
    prefix: string,
    collection: SceneCollection,
  ): { nodes: unknown[]; changed: boolean } {
    let changed = false;
    const next = nodes.map((item, index) => {
      if (!isRecord(item) || isFxHelperNode(item)) return item;
      const path = `${prefix}${index}`;
      const itemId = getSceneObjectId(item, collection, path);
      if (itemId === id) {
        changed = true;
        return { ...item, ...patch };
      }
      if (!Array.isArray(item.list)) return item;
      const nested = updateNodes(item.list, `${path}-list-`, collection);
      if (!nested.changed) return item;
      changed = true;
      return { ...item, list: nested.nodes };
    });
    return { nodes: changed ? next : nodes, changed };
  }

  for (const collection of ["displayList", "plainObjects"] as const) {
    const updated = updateNodes(scene[collection] ?? [], "", collection);
    if (updated.changed) return { ...scene, [collection]: updated.nodes };
  }
  throw new Error(`Scene object "${id}" was not found.`);
}

export function removeSceneObject(scene: SceneDocument, id: string): SceneDocument {
  assertScene(scene);

  function removeNodes(
    nodes: unknown[],
    prefix: string,
    collection: SceneCollection,
  ): { nodes: unknown[]; changed: boolean } {
    let changed = false;
    const next: unknown[] = [];
    nodes.forEach((item, index) => {
      if (!isRecord(item) || isFxHelperNode(item)) {
        next.push(item);
        return;
      }
      const path = `${prefix}${index}`;
      const itemId = getSceneObjectId(item, collection, path);
      if (itemId === id) {
        changed = true;
        return;
      }
      if (Array.isArray(item.list)) {
        const nested = removeNodes(item.list, `${path}-list-`, collection);
        if (nested.changed) {
          changed = true;
          next.push({ ...item, list: nested.nodes });
          return;
        }
      }
      next.push(item);
    });
    return { nodes: changed ? next : nodes, changed };
  }

  for (const collection of ["displayList", "plainObjects"] as const) {
    const removed = removeNodes(scene[collection] ?? [], "", collection);
    if (removed.changed) return { ...scene, [collection]: removed.nodes };
  }
  throw new Error(`Scene object "${id}" was not found.`);
}

export function createSceneObject(scene: SceneDocument, kind: SceneObjectKind): SceneDocument {
  assertScene(scene);
  if (!["Image", "Text", "Container"].includes(kind)) {
    throw new TypeError(`Unsupported scene object type "${kind}".`);
  }

  const id =
    globalThis.crypto?.randomUUID?.() ??
    `codogma-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const base: SceneObject = {
    id,
    label: kind,
    components: [],
    x: 400,
    y: 300,
  };

  let object: SceneObject;
  if (kind === "Image") {
    object = { ...base, type: "Image", texture: { key: "dino" } };
  } else if (kind === "Text") {
    object = {
      ...base,
      type: "Text",
      text: "New text",
      fontFamily: "Arial",
      fontSize: "24px",
    };
  } else {
    object = { ...base, type: "Container", list: [] };
  }

  return { ...scene, displayList: [...scene.displayList, object] };
}

export function findScenePaths(rootFile: SceneFileTreeEntry): string[] {
  const paths: string[] = [];

  function visit(node: SceneFileTreeEntry, prefix: string, isRoot = false): void {
    const relativePath = isRoot
      ? ""
      : prefix
        ? `${prefix}/${node.name}`
        : node.name;

    if (node.isFile) {
      if (node.name.toLowerCase().endsWith(".scene")) paths.push(relativePath);
      return;
    }

    for (const child of node.children ?? []) visit(child, relativePath);
  }

  // GetProjectFiles.rootFile.name is the selected project directory name, not
  // a path segment accepted by /editor/project/<relative-path>.
  visit(rootFile, "", true);
  return paths.sort((left, right) => {
    const leftDefault = left.toLowerCase().endsWith("/level.scene") || left.toLowerCase() === "level.scene" ? 0 : 1;
    const rightDefault = right.toLowerCase().endsWith("/level.scene") || right.toLowerCase() === "level.scene" ? 0 : 1;
    return leftDefault - rightDefault || left.localeCompare(right);
  });
}

export function formatSceneContent(scene: SceneDocument): string {
  assertScene(scene);
  return `${JSON.stringify(scene, null, 4)}\n`;
}
