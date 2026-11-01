import type { SceneDocument, SceneObject } from "./scene-model.ts";

export type FxType = "Circle" | "Bloom" | "Gradient" | "Shine";
export type FxColor = string | number;

export interface FxBase extends Record<string, unknown> {
  id: string;
  type: FxType;
  label?: string;
  preFX?: boolean;
}

export interface CircleFx extends FxBase {
  type: "Circle";
  thickness?: number;
  color?: FxColor;
  backgroundColor?: FxColor;
  scale?: number;
  feather?: number;
}

export interface BloomFx extends FxBase {
  type: "Bloom";
  threshold?: number;
  blurRadius?: number;
  blurSteps?: number;
  blurQuality?: number;
  blendAmount?: number;
}

export interface GradientFx extends FxBase {
  type: "Gradient";
  color1?: FxColor;
  color2?: FxColor;
  alpha?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  size?: number;
}

export interface ShineFx extends FxBase {
  type: "Shine";
  radius?: number;
  direction?: number;
  scale?: number;
  duration?: number;
  reveal?: boolean;
  yoyo?: boolean;
}

export type FxObject = CircleFx | BloomFx | GradientFx | ShineFx;

export interface FxEntry {
  id: string;
  index: number;
  source: FxObject;
}

const FX_TYPES = new Set<FxType>(["Circle", "Bloom", "Gradient", "Shine"]);
const COLOR_FIELDS = new Set(["color", "backgroundColor", "color1", "color2"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isFxType(value: unknown): value is FxType {
  return typeof value === "string" && FX_TYPES.has(value as FxType);
}

export function isFxObject(value: unknown): value is FxObject {
  return isRecord(value) && isFxType(value.type) && typeof value.id === "string" && value.id.length > 0;
}

export function getSceneObjectEffects(parent: SceneObject): FxEntry[] {
  if (!Array.isArray(parent.list)) return [];
  const result: FxEntry[] = [];
  parent.list.forEach((item, index) => {
    if (!isFxObject(item)) return;
    result.push({
      id: item.id,
      index,
      source: item,
    });
  });
  return result;
}

export function getUnsupportedSceneObjectEffects(parent: SceneObject): string[] {
  if (!Array.isArray(parent.list)) return [];
  const unsupported = new Set<string>();
  for (const item of parent.list) {
    if (!isRecord(item) || typeof item.type !== "string" || isFxType(item.type)) continue;
    if (/^(Circle|Bloom|Gradient|Shine|FX)/i.test(item.type)) unsupported.add(item.type);
  }
  return [...unsupported].sort();
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `codogma-fx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createFxObject(type: FxType, id = createId()): FxObject {
  if (!isFxType(type)) throw new TypeError(`Unsupported FX type "${String(type)}".`);
  switch (type) {
    case "Circle":
      return { id, type, label: type, preFX: true, thickness: 8, color: "#ff33b2", backgroundColor: "#ff0000", scale: 1, feather: 0.005 };
    case "Bloom":
      return { id, type, label: type, preFX: true, threshold: 0.5, blurRadius: 2, blurSteps: 4, blurQuality: 0, blendAmount: 1 };
    case "Gradient":
      return { id, type, label: type, preFX: true, color1: "#ff0000", color2: "#00ff00", alpha: 0.2, fromX: 0, fromY: 0, toX: 0, toY: 1, size: 0 };
    case "Shine":
      return { id, type, label: type, preFX: true, radius: 0.5, direction: 0.5, scale: 2, duration: 2000, reveal: false, yoyo: false };
  }
}

function findSceneNode(
  scene: SceneDocument,
  id: string,
): { parent: SceneObject | null; node: SceneObject | null } {
  const visit = (items: SceneObject[], parent: SceneObject | null, prefix: string): { parent: SceneObject | null; node: SceneObject | null } => {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (!isRecord(item)) continue;
      const nodeId = typeof item.id === "string" && item.id.length > 0
        ? item.id
        : `${prefix}${index}`;
      if (nodeId === id) return { parent, node: item as SceneObject };
      if (Array.isArray(item.list)) {
        const nested = item.list.filter(isRecord) as SceneObject[];
        const found = visit(nested, item as SceneObject, `${nodeId}-list-`);
        if (found.node) return found;
      }
    }
    return { parent: null, node: null };
  };

  for (const collection of ["displayList", "plainObjects"] as const) {
    const found = visit(scene[collection] ?? [], null, `${collection}-`);
    if (found.node) return found;
  }
  return { parent: null, node: null };
}

function updateSceneNode(
  items: SceneObject[],
  id: string,
  collectionPrefix: string,
  update: (node: SceneObject) => SceneObject,
): { items: SceneObject[]; changed: boolean } {
  let changed = false;
  const next = items.map((item, index) => {
    const nodeId = typeof item.id === "string" && item.id.length > 0
      ? item.id
      : `${collectionPrefix}${index}`;
    if (nodeId === id) {
      changed = true;
      return update(item);
    }
    if (!Array.isArray(item.list)) return item;
    const nested = updateSceneNode(
      item.list.filter(isRecord) as SceneObject[],
      id,
      `${nodeId}-list-`,
      update,
    );
    if (!nested.changed) return item;
    changed = true;
    return { ...item, list: nested.items };
  });
  return { items: changed ? next : items, changed };
}

function updateSceneParent(
  scene: SceneDocument,
  parentId: string,
  update: (parent: SceneObject) => SceneObject,
): SceneDocument {
  for (const collection of ["displayList", "plainObjects"] as const) {
    const result = updateSceneNode(scene[collection] ?? [], parentId, `${collection}-`, update);
    if (result.changed) return { ...scene, [collection]: result.items };
  }
  throw new Error(`Scene object "${parentId}" was not found.`);
}

function assertFinite(field: string, value: unknown, min?: number, max?: number, integer = false): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`FX property "${field}" must be a finite number.`);
  }
  if (min !== undefined && value < min) throw new RangeError(`FX property "${field}" must be at least ${min}.`);
  if (max !== undefined && value > max) throw new RangeError(`FX property "${field}" must be at most ${max}.`);
  if (integer && !Number.isInteger(value)) throw new TypeError(`FX property "${field}" must be an integer.`);
}

function validatePatch(source: FxObject, patch: Partial<FxObject>): void {
  for (const [field, value] of Object.entries(patch)) {
    if (field === "id" || field === "type") throw new TypeError(`FX property "${field}" cannot be changed.`);
    if (COLOR_FIELDS.has(field)) {
      if (!((typeof value === "string" && value.trim().length > 0) ||
        (typeof value === "number" && Number.isFinite(value) && value >= 0))) {
        throw new TypeError(`FX property "${field}" must be a non-empty color string or non-negative color number.`);
      }
      continue;
    }
    if (field === "label") {
      if (typeof value !== "string" || value.trim().length === 0) throw new TypeError('FX property "label" must be a non-empty string.');
      continue;
    }
    if (field === "preFX") {
      if (typeof value !== "boolean") throw new TypeError('FX property "preFX" must be a boolean.');
      continue;
    }
    if (source.type === "Shine" && (field === "reveal" || field === "yoyo")) {
      if (typeof value !== "boolean") throw new TypeError(`FX property "${field}" must be a boolean.`);
      continue;
    }

    if (source.type === "Circle") {
      if (field === "thickness" || field === "feather") assertFinite(field, value, 0);
      else if (field === "scale") assertFinite(field, value, 0.01);
      else if (field !== "id" && field !== "type" && field !== "preFX" && field !== "label") throw new TypeError(`Unsupported Circle property "${field}".`);
    } else if (source.type === "Bloom") {
      if (field === "threshold") assertFinite(field, value, 0, 1);
      else if (field === "blurRadius" || field === "blendAmount") assertFinite(field, value, 0);
      else if (field === "blurSteps") assertFinite(field, value, 1, undefined, true);
      else if (field === "blurQuality") assertFinite(field, value, 0, 2, true);
      else if (field !== "id" && field !== "type" && field !== "preFX" && field !== "label") throw new TypeError(`Unsupported Bloom property "${field}".`);
    } else if (source.type === "Gradient") {
      if (field === "alpha" || field === "fromX" || field === "fromY" || field === "toX" || field === "toY") assertFinite(field, value, 0, 1);
      else if (field === "size") assertFinite(field, value, 0);
      else if (field !== "id" && field !== "type" && field !== "preFX" && field !== "label") throw new TypeError(`Unsupported Gradient property "${field}".`);
    } else {
      if (field === "radius") assertFinite(field, value, 0.01);
      else if (field === "direction") assertFinite(field, value);
      else if (field === "scale") assertFinite(field, value, 0.1);
      else if (field === "duration") assertFinite(field, value, 1);
      else if (field !== "id" && field !== "type" && field !== "preFX" && field !== "label") throw new TypeError(`Unsupported Shine property "${field}".`);
    }
  }
}

export function addSceneObjectFx(scene: SceneDocument, parentId: string, type: FxType): SceneDocument {
  if (!isFxType(type)) throw new TypeError(`Unsupported FX type "${String(type)}".`);
  return updateSceneParent(scene, parentId, (parent) => {
    const list = Array.isArray(parent.list) ? parent.list : [];
    return { ...parent, list: [...list, createFxObject(type)] };
  });
}

export function updateSceneObjectFx(
  scene: SceneDocument,
  parentId: string,
  fxId: string,
  patch: Partial<FxObject>,
): SceneDocument {
  return updateSceneParent(scene, parentId, (parent) => {
    if (!Array.isArray(parent.list)) throw new Error(`FX parent "${parentId}" has no child list.`);
    const index = parent.list.findIndex((item, itemIndex) =>
      isFxObject(item) && item.id === fxId ||
      isRecord(item) && `fx-${itemIndex}` === fxId && isFxType(item.type),
    );
    if (index < 0) throw new Error(`FX object "${fxId}" was not found on "${parentId}".`);
    const source = parent.list[index];
    if (!isFxObject(source)) throw new Error(`FX object "${fxId}" is not supported by this Host.`);
    validatePatch(source, patch);
    const nextList = parent.list.slice();
    nextList[index] = { ...source, ...patch };
    return { ...parent, list: nextList };
  });
}

export function removeSceneObjectFx(scene: SceneDocument, parentId: string, fxId: string): SceneDocument {
  return updateSceneParent(scene, parentId, (parent) => {
    if (!Array.isArray(parent.list)) throw new Error(`FX parent "${parentId}" has no child list.`);
    const index = parent.list.findIndex((item, itemIndex) =>
      isFxObject(item) && item.id === fxId ||
      isRecord(item) && `fx-${itemIndex}` === fxId && isFxType(item.type),
    );
    if (index < 0) throw new Error(`FX object "${fxId}" was not found on "${parentId}".`);
    const list = parent.list.slice();
    list.splice(index, 1);
    return { ...parent, list };
  });
}

export function findSceneObjectById(scene: SceneDocument, id: string): SceneObject | undefined {
  return findSceneNode(scene, id).node ?? undefined;
}
