const clone = (value) => JSON.parse(JSON.stringify(value));
const createId = () => globalThis.crypto?.randomUUID?.() ?? `codogma-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function assertScene(scene) {
  if (!scene || typeof scene !== "object" || Array.isArray(scene) ||
      typeof scene.id !== "string" || !Array.isArray(scene.displayList)) {
    throw new TypeError("A Scene document with an id and displayList is required.");
  }
}
function assertPrefab(prefab) {
  if (!prefab || typeof prefab !== "object" || Array.isArray(prefab) ||
      prefab.sceneType !== "PREFAB" || typeof prefab.id !== "string" ||
      !Array.isArray(prefab.displayList)) {
    throw new TypeError("A Prefab must be a .scene document with sceneType PREFAB and a displayList.");
  }
}

export function createPrefabDocument(scene, object, name = "Prefab") {
  assertScene(scene);
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    throw new TypeError("A scene object is required to create a Prefab.");
  }
  const sourceMeta = scene.meta && typeof scene.meta === "object" ? scene.meta : {};
  const displayObject = clone(object);
  displayObject.id = typeof displayObject.id === "string" ? displayObject.id : createId();
  return {
    id: createId(),
    sceneType: "PREFAB",
    settings: { ...(scene.settings ? clone(scene.settings) : {}), createMethodName: "", preloadMethodName: "" },
    displayList: [displayObject],
    plainObjects: [],
    meta: {
      ...clone(sourceMeta),
      app: "Codogma Engine - Scene Editor",
      url: sourceMeta.url ?? "https://codogma.com",
      contentType: sourceMeta.contentType ?? "phasereditor2d.core.scene.SceneContentType",
      version: sourceMeta.version ?? 5,
    },
    prefabProperties: [],
    name,
  };
}

export function createPrefabInstance(scene, prefab, options = {}) {
  assertScene(scene);
  assertPrefab(prefab);
  if (scene.sceneType === "PREFAB") throw new TypeError("Prefab instances can only be created inside a SCENE document.");
  const source = prefab.displayList[0] && typeof prefab.displayList[0] === "object" ? prefab.displayList[0] : {};
  const instance = {
    prefabId: prefab.id,
    id: createId(),
    label: options.label ?? options.name ?? prefab.name ?? "Prefab",
    components: [],
    x: Number.isFinite(options.x) ? options.x : Number.isFinite(source.x) ? source.x : 400,
    y: Number.isFinite(options.y) ? options.y : Number.isFinite(source.y) ? source.y : 300,
  };
  for (const key of ["rotation", "scaleX", "scaleY", "alpha", "depth"]) {
    if (Number.isFinite(options[key])) instance[key] = options[key];
  }
  if (Array.isArray(prefab.prefabProperties) && prefab.prefabProperties.length > 0) instance.unlock = [];
  return { ...scene, displayList: [...scene.displayList, instance] };
}

export function addPrefabProperty(prefab, property) {
  assertPrefab(prefab);
  if (!property || typeof property !== "object" ||
      typeof property.name !== "string" || !/^[A-Za-z_$][\w$]*$/.test(property.name)) {
    throw new TypeError("Prefab property name must be a valid identifier.");
  }
  const properties = Array.isArray(prefab.prefabProperties) ? prefab.prefabProperties : [];
  if (properties.some((item) => item.name === property.name)) throw new Error(`Prefab property "${property.name}" already exists.`);
  if (!property.type || !["string", "number", "boolean", "option"].includes(property.type.id)) {
    throw new TypeError("Prefab property type must be string, number, boolean or option.");
  }
  if (property.type.id === "option" &&
      (!Array.isArray(property.type.options) || property.type.options.length === 0)) {
    throw new TypeError("Option Prefab properties require at least one option.");
  }
  return { ...prefab, prefabProperties: [...properties, clone(property)] };
}

export function updatePrefabProperty(prefab, propertyName, patch) {
  assertPrefab(prefab);
  const properties = prefab.prefabProperties ?? [];
  const index = properties.findIndex((item) => item.name === propertyName);
  if (index < 0) throw new Error(`Prefab property "${propertyName}" was not found.`);
  const next = properties.slice();
  next[index] = { ...next[index], ...clone(patch) };
  if (next.some((item, itemIndex) => itemIndex !== index && item.name === next[index].name)) {
    throw new Error(`Prefab property "${next[index].name}" already exists.`);
  }
  return { ...prefab, prefabProperties: next };
}

export function removePrefabProperty(prefab, propertyName) {
  assertPrefab(prefab);
  const properties = prefab.prefabProperties ?? [];
  if (!properties.some((item) => item.name === propertyName)) throw new Error(`Prefab property "${propertyName}" was not found.`);
  return { ...prefab, prefabProperties: properties.filter((item) => item.name !== propertyName) };
}

export function getPrefabPropertyDefault(property) {
  if (!property || typeof property !== "object") return undefined;
  return clone(property.defValue);
}

export function resolvePrefabInstanceValues(prefab, instance) {
  assertPrefab(prefab);
  if (!instance || instance.prefabId !== prefab.id) throw new TypeError("The instance does not reference the supplied Prefab.");
  const result = {};
  for (const property of prefab.prefabProperties ?? []) {
    result[property.name] = Object.hasOwn(instance, property.name)
      ? instance[property.name]
      : getPrefabPropertyDefault(property);
  }
  return result;
}
