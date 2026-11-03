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
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : isRecord(value) && Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

export function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stableStringify(value: JsonValue, space = 2): string {
  function sort(item: JsonValue): JsonValue {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === "object") {
      const sorted: JsonObject = {};
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
