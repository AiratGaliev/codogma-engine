import type { ComponentInstanceDocument } from "@codogma/cge";
import { FX_COMPONENT_TYPES } from "./builtin-component-ids.js";

export type NativeFxType = "Circle" | "Bloom" | "Gradient" | "Shine";

const FX_TYPE_BY_ID: ReadonlyMap<string, NativeFxType> = new Map(
  Object.entries(FX_COMPONENT_TYPES).map(([type, typeId]) => [typeId, type as NativeFxType]),
);

const COLOR_FIELDS: Readonly<Record<NativeFxType, ReadonlySet<string>>> = {
  Circle: new Set(["color", "backgroundColor"]),
  Bloom: new Set(),
  Gradient: new Set(["color1", "color2"]),
  Shine: new Set(),
};

function assertFinite(field: string, value: unknown, min?: number, max?: number, integer = false): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`FX property "${field}" must be a finite number.`);
  }
  if (min !== undefined && value < min) throw new RangeError(`FX property "${field}" must be at least ${min}.`);
  if (max !== undefined && value > max) throw new RangeError(`FX property "${field}" must be at most ${max}.`);
  if (integer && !Number.isInteger(value)) throw new TypeError(`FX property "${field}" must be an integer.`);
}

/**
 * Validates known persisted FX fields. Unknown JSON extension fields are
 * preserved; callers validating an edit patch can opt into strict field
 * rejection so typos cannot silently become no-op edits.
 */
export function validateNativeFxPropertyValues(
  type: NativeFxType,
  properties: Record<string, unknown>,
  rejectUnsupported = true,
): void {
  for (const [field, value] of Object.entries(properties)) {
    if (field === "id" || field === "type") {
      throw new TypeError(`FX identity property "${field}" cannot be changed.`);
    }
    if (COLOR_FIELDS[type].has(field)) {
      const normalized = typeof value === "string" ? value.trim() : "";
      const validHex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized) ||
        /^0x[0-9a-f]{1,8}$/i.test(normalized);
      const validInteger = typeof value === "number" &&
        Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
      if (!validHex && !validInteger) {
        throw new TypeError(`FX property "${field}" must be a Phaser-compatible HEX color or 32-bit unsigned integer.`);
      }
      continue;
    }
    if (field === "label") {
      if (typeof value !== "string" || !value.trim()) throw new TypeError('FX property "label" must be a non-empty string.');
      continue;
    }
    if (field === "preFX" || (type === "Shine" && (field === "reveal" || field === "yoyo"))) {
      if (typeof value !== "boolean") throw new TypeError(`FX property "${field}" must be boolean.`);
      continue;
    }
    if (type === "Circle") {
      if (field === "thickness" || field === "feather") assertFinite(field, value, 0);
      else if (field === "scale") assertFinite(field, value, 0.01);
      else if (rejectUnsupported) throw new TypeError(`Unsupported Circle property "${field}".`);
    } else if (type === "Bloom") {
      if (field === "threshold") assertFinite(field, value, 0, 1);
      else if (field === "blurRadius" || field === "blendAmount") assertFinite(field, value, 0);
      else if (field === "blurSteps") assertFinite(field, value, 1, undefined, true);
      else if (field === "blurQuality") assertFinite(field, value, 0, 2, true);
      else if (rejectUnsupported) throw new TypeError(`Unsupported Bloom property "${field}".`);
    } else if (type === "Gradient") {
      if (["alpha", "fromX", "fromY", "toX", "toY"].includes(field)) assertFinite(field, value, 0, 1);
      else if (field === "size") assertFinite(field, value, 0);
      else if (rejectUnsupported) throw new TypeError(`Unsupported Gradient property "${field}".`);
    } else {
      if (field === "radius") assertFinite(field, value, 0.01);
      else if (field === "direction") assertFinite(field, value);
      else if (field === "scale") assertFinite(field, value, 0.1);
      else if (field === "duration") assertFinite(field, value, 1);
      else if (rejectUnsupported) throw new TypeError(`Unsupported Shine property "${field}".`);
    }
  }
}

export function getNativeFxType(typeId: string): NativeFxType | undefined {
  return FX_TYPE_BY_ID.get(typeId);
}

export function validateNativeFxComponentProperties(component: ComponentInstanceDocument): void {
  const type = getNativeFxType(component.typeId);
  if (!type) return;

  const properties = { ...component.properties };
  delete properties.id;
  delete properties.type;
  validateNativeFxPropertyValues(type, properties, false);
}
