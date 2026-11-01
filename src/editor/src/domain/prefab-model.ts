import type { SceneDocument, SceneObject } from "./scene-model.ts";

export interface PrefabProperty {
  name: string;
  label?: string;
  tooltip?: string;
  defValue?: unknown;
  customDefinition?: boolean;
  type: { id: "string" | "number" | "boolean" | "option"; options?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface PrefabDocument extends SceneDocument {
  sceneType: "PREFAB";
  settings: Record<string, unknown>;
  prefabProperties?: PrefabProperty[];
  name?: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const createId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `codogma-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertScene(scene: unknown): asserts scene is SceneDocument {
  if (!isRecord(scene) || typeof scene.id !== "string" || !Array.isArray(scene.displayList)) {
    throw new TypeError("A Scene document with an id and displayList is required.");
  }
}

function assertPrefab(prefab: unknown): asserts prefab is PrefabDocument {
  if (!isRecord(prefab) ||
      prefab.sceneType !== "PREFAB" ||
      typeof prefab.id !== "string" ||
      !Array.isArray(prefab.displayList)) {
    throw new TypeError("A Prefab must be a .scene document with sceneType PREFAB and a displayList.");
  }
}

export function createPrefabDocument(
  scene: SceneDocument,
  object: SceneObject,
  name = "Prefab",
): PrefabDocument {
  assertScene(scene);
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    throw new TypeError("A scene object is required to create a Prefab.");
  }
  const sourceMeta = isRecord(scene.meta) ? scene.meta : {};
  const displayObject = clone(object);
  displayObject.id = typeof displayObject.id === "string" ? displayObject.id : createId();
  const sourceSettings = isRecord(scene.settings) ? clone(scene.settings) : {};
  return {
    id: createId(),
    sceneType: "PREFAB",
    settings: { ...sourceSettings, createMethodName: "", preloadMethodName: "" },
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

export function createPrefabInstance(
  scene: SceneDocument,
  prefab: PrefabDocument,
  options: Record<string, unknown> = {},
): SceneDocument {
  assertScene(scene);
  assertPrefab(prefab);
  if (scene.sceneType === "PREFAB") {
    throw new TypeError("Prefab instances can only be created inside a SCENE document.");
  }
  const source = prefab.displayList[0] ?? {};
  const instance: SceneObject = {
    prefabId: prefab.id,
    id: createId(),
    label: typeof options.label === "string"
      ? options.label
      : typeof options.name === "string"
        ? options.name
        : prefab.name ?? "Prefab",
    components: [],
    x: isFiniteNumber(options.x) ? options.x : isFiniteNumber(source.x) ? source.x : 400,
    y: isFiniteNumber(options.y) ? options.y : isFiniteNumber(source.y) ? source.y : 300,
  };
  for (const key of ["rotation", "scaleX", "scaleY", "alpha", "depth"] as const) {
    if (isFiniteNumber(options[key])) instance[key] = options[key];
  }
  if (Array.isArray(prefab.prefabProperties) && prefab.prefabProperties.length > 0) {
    instance.unlock = [];
  }
  return { ...scene, displayList: [...scene.displayList, instance] };
}

export function addPrefabProperty(prefab: PrefabDocument, property: PrefabProperty): PrefabDocument {
  assertPrefab(prefab);
  if (!property || typeof property !== "object" ||
      typeof property.name !== "string" || !/^[A-Za-z_$][\w$]*$/.test(property.name)) {
    throw new TypeError("Prefab property name must be a valid identifier.");
  }
  const properties = Array.isArray(prefab.prefabProperties) ? prefab.prefabProperties : [];
  if (properties.some((item) => item.name === property.name)) {
    throw new Error(`Prefab property "${property.name}" already exists.`);
  }
  if (!property.type || !["string", "number", "boolean", "option"].includes(property.type.id)) {
    throw new TypeError("Prefab property type must be string, number, boolean or option.");
  }
  if (property.type.id === "option" &&
      (!Array.isArray(property.type.options) || property.type.options.length === 0)) {
    throw new TypeError("Option Prefab properties require at least one option.");
  }
  return { ...prefab, prefabProperties: [...properties, clone(property)] };
}

export function updatePrefabProperty(
  prefab: PrefabDocument,
  propertyName: string,
  patch: Partial<PrefabProperty>,
): PrefabDocument {
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

export function removePrefabProperty(prefab: PrefabDocument, propertyName: string): PrefabDocument {
  assertPrefab(prefab);
  const properties = prefab.prefabProperties ?? [];
  if (!properties.some((item) => item.name === propertyName)) {
    throw new Error(`Prefab property "${propertyName}" was not found.`);
  }
  return { ...prefab, prefabProperties: properties.filter((item) => item.name !== propertyName) };
}

export function getPrefabPropertyDefault(property: PrefabProperty): unknown {
  if (!property || typeof property !== "object") return undefined;
  return clone(property.defValue);
}

export function resolvePrefabInstanceValues(
  prefab: PrefabDocument,
  instance: SceneObject,
): Record<string, unknown> {
  assertPrefab(prefab);
  if (!instance || instance.prefabId !== prefab.id) {
    throw new TypeError("The instance does not reference the supplied Prefab.");
  }
  const result: Record<string, unknown> = {};
  for (const property of prefab.prefabProperties ?? []) {
    result[property.name] = Object.hasOwn(instance, property.name)
      ? instance[property.name]
      : getPrefabPropertyDefault(property);
  }
  return result;
}
