const EDITABLE_NUMERIC_PROPERTIES = new Set([
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
  "originX",
  "originY",
  "alpha",
]);

function assertScene(scene) {
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    throw new TypeError("A scene must be a JSON object.");
  }

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

function getSceneObjectId(source, collection, index) {
  return source &&
    typeof source === "object" &&
    !Array.isArray(source) &&
    typeof source.id === "string" &&
    source.id.length > 0
    ? source.id
    : `${collection}-${index}`;
}

/**
 * Parse a legacy Codogma/Phaser Editor .scene file without changing its schema.
 * Unknown fields are deliberately preserved.
 */
export function parseSceneContent(content) {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new TypeError("The scene file is empty.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
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
export function getSceneObjects(scene) {
  assertScene(scene);
  const objects = [];

  for (const collection of ["displayList", "plainObjects"]) {
    const nodes = scene[collection] ?? [];
    nodes.forEach((source, index) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) return;
      objects.push({
        id: getSceneObjectId(source, collection, index),
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
        source,
      });
    });
  }

  return objects;
}

/**
 * Apply an inspector edit immutably while preserving all serialized fields.
 * Values are limited to properties understood by the current Inspector slice.
 */
export function updateSceneObject(scene, id, patch) {
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

  for (const collection of ["displayList", "plainObjects"]) {
    const source = scene[collection] ?? [];
    const index = source.findIndex((item, itemIndex) => getSceneObjectId(item, collection, itemIndex) === id);
    if (index === -1) continue;

    const next = source.slice();
    next[index] = { ...source[index], ...patch };
    return { ...scene, [collection]: next };
  }

  throw new Error(`Scene object "${id}" was not found.`);
}

export function removeSceneObject(scene, id) {
  assertScene(scene);
  let found = false;
  const next = { ...scene };

  for (const collection of ["displayList", "plainObjects"]) {
    const source = scene[collection] ?? [];
    if (source.some((item, index) => getSceneObjectId(item, collection, index) === id)) {
      next[collection] = source.filter((item, index) => getSceneObjectId(item, collection, index) !== id);
      found = true;
    }
  }

  if (!found) throw new Error(`Scene object "${id}" was not found.`);
  return next;
}

export function createSceneObject(scene, kind) {
  assertScene(scene);
  if (!["Image", "Text", "Container"].includes(kind)) {
    throw new TypeError(`Unsupported scene object type "${kind}".`);
  }

  const id =
    globalThis.crypto?.randomUUID?.() ??
    `codogma-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const base = {
    id,
    label: kind === "Image" ? "Image" : kind === "Text" ? "Text" : "Container",
    components: [],
    x: 400,
    y: 300,
  };

  let object;
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

export function findScenePaths(rootFile) {
  const paths = [];

  function visit(node, prefix, isRoot = false) {
    if (!node || typeof node.name !== "string") return;
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

export function formatSceneContent(scene) {
  assertScene(scene);
  return `${JSON.stringify(scene, null, 4)}\n`;
}
