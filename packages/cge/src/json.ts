export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isJsonValue(value: unknown, ancestors = new WeakSet<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
        return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || !isJsonValue(descriptor.value, ancestors)) return false;
      }
      return Object.keys(value).every((key) => {
        const index = Number(key);
        return Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key;
      });
    }

    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
      return false;
    }
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !isJsonValue(descriptor.value, ancestors)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

export function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stableStringify(value: JsonValue, space = 2): string {
  function sort(item: JsonValue): JsonValue {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === "object") {
      const sorted = Object.create(null) as JsonObject;
      for (const key of Object.keys(item).sort()) {
        const child = item[key];
        if (child !== undefined) sorted[key] = sort(child);
      }
      return sorted;
    }
    return item;
  }
  return JSON.stringify(sort(value), null, space);
}

export function isSafeProjectPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || /^(?:https?:|data:|blob:)/i.test(value)) return false;
  return value.split("/").every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".." && !/[\u0000-\u001f]/.test(segment),
  );
}
