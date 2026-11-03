import type { JsonValue, ValidationIssue, ValidationResult } from "./types.js";

export const MAX_WIRE_MESSAGE_BYTES = 1024 * 1024;
export const MAX_EVENT_PAYLOAD_BYTES = 64 * 1024;

export interface JsonInspectionLimits {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxArrayItems: number;
  maxObjectProperties: number;
  maxStringBytes: number;
}

export const DEFAULT_JSON_LIMITS: Readonly<JsonInspectionLimits> = Object.freeze({
  maxBytes: MAX_WIRE_MESSAGE_BYTES,
  maxDepth: 32,
  maxNodes: 20_000,
  maxArrayItems: 10_000,
  maxObjectProperties: 256,
  maxStringBytes: MAX_EVENT_PAYLOAD_BYTES,
});

export interface JsonValueValidationSuccess {
  success: true;
  value: JsonValue;
  byteLength: number;
}

export interface JsonValueValidationFailure {
  success: false;
  errors: readonly ValidationIssue[];
}

export type JsonValueValidationResult =
  | JsonValueValidationSuccess
  | JsonValueValidationFailure;

function issue(code: string, path: string, message: string): JsonValueValidationFailure {
  return { success: false, errors: [{ code, path, message }] };
}

function pointer(path: string, key: string | number): string {
  const token = String(key).replace(/~/g, "~0").replace(/\//g, "~1");
  return path + "/" + token;
}

export function validateJsonValue(
  input: unknown,
  limits: Readonly<JsonInspectionLimits> = DEFAULT_JSON_LIMITS,
): JsonValueValidationResult {
  let visitedNodes = 0;
  const activeObjects = new WeakSet<object>();

  const visit = (value: unknown, path: string, depth: number): ValidationIssue | null => {
    visitedNodes += 1;
    if (visitedNodes > limits.maxNodes) {
      return {
        code: "JSON_NODE_LIMIT_EXCEEDED",
        path,
        message: "The JSON value contains more nodes than the configured limit.",
      };
    }

    if (depth > limits.maxDepth) {
      return {
        code: "JSON_DEPTH_LIMIT_EXCEEDED",
        path,
        message: "The JSON value exceeds the maximum nesting depth.",
      };
    }

    if (value === null || typeof value === "boolean") return null;

    if (typeof value === "string") {
      if (new TextEncoder().encode(value).byteLength > limits.maxStringBytes) {
        return {
          code: "JSON_STRING_LIMIT_EXCEEDED",
          path,
          message: "A JSON string exceeds the configured byte limit.",
        };
      }
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value)
        ? null
        : {
            code: "JSON_NUMBER_NOT_FINITE",
            path,
            message: "JSON numbers must be finite.",
          };
    }

    if (typeof value !== "object") {
      return {
        code: "JSON_VALUE_NOT_SERIALIZABLE",
        path,
        message: "Functions, symbols, bigint and undefined are not valid JSON values.",
      };
    }

    const objectValue = value as object;
    if (activeObjects.has(objectValue)) {
      return {
        code: "JSON_CYCLE_DETECTED",
        path,
        message: "Cyclic object references are not allowed in the wire format.",
      };
    }

    activeObjects.add(objectValue);

    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
          return {
            code: "JSON_ARRAY_PROTOTYPE_NOT_ALLOWED",
            path,
            message: "Only ordinary arrays are allowed in the wire format.",
          };
        }

        if (value.length > limits.maxArrayItems) {
          return {
            code: "JSON_ARRAY_LIMIT_EXCEEDED",
            path,
            message: "The array contains more items than the configured limit.",
          };
        }

        if (Object.getOwnPropertySymbols(value).length > 0) {
          return {
            code: "JSON_SYMBOL_PROPERTY_NOT_ALLOWED",
            path,
            message: "Symbol-keyed properties are not valid JSON data.",
          };
        }

        const names = Object.getOwnPropertyNames(value);
        if (names.length !== value.length + 1 || !names.includes("length")) {
          return {
            code: "JSON_ARRAY_PROPERTY_NOT_ALLOWED",
            path,
            message: "Sparse arrays and arrays with custom properties are not allowed.",
          };
        }

        for (let index = 0; index < value.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            return {
              code: "JSON_ARRAY_ACCESSOR_NOT_ALLOWED",
              path: pointer(path, index),
              message: "Array items must be enumerable data properties.",
            };
          }

          const nestedIssue = visit(descriptor.value, pointer(path, index), depth + 1);
          if (nestedIssue) return nestedIssue;
        }

        return null;
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        return {
          code: "JSON_OBJECT_PROTOTYPE_NOT_ALLOWED",
          path,
          message: "Only plain JSON objects are allowed; runtime and class instances are rejected.",
        };
      }

      if (Object.getOwnPropertySymbols(value).length > 0) {
        return {
          code: "JSON_SYMBOL_PROPERTY_NOT_ALLOWED",
          path,
          message: "Symbol-keyed properties are not valid JSON data.",
        };
      }

      const names = Object.getOwnPropertyNames(value);
      if (names.length > limits.maxObjectProperties) {
        return {
          code: "JSON_OBJECT_LIMIT_EXCEEDED",
          path,
          message: "The object contains more properties than the configured limit.",
        };
      }

      for (const name of names) {
        if (new TextEncoder().encode(name).byteLength > 256) {
          return {
            code: "JSON_KEY_LIMIT_EXCEEDED",
            path: pointer(path, name),
            message: "A JSON object key exceeds the configured byte limit.",
          };
        }

        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          return {
            code: "JSON_ACCESSOR_OR_HIDDEN_PROPERTY_NOT_ALLOWED",
            path: pointer(path, name),
            message: "JSON objects may contain enumerable data properties only.",
          };
        }

        const nestedIssue = visit(descriptor.value, pointer(path, name), depth + 1);
        if (nestedIssue) return nestedIssue;
      }

      return null;
    } finally {
      activeObjects.delete(objectValue);
    }
  };

  try {
    const invalid = visit(input, "", 0);
    if (invalid) return { success: false, errors: [invalid] };

    const serialized = JSON.stringify(input);
    if (serialized === undefined) {
      return issue("JSON_VALUE_NOT_SERIALIZABLE", "", "The value cannot be serialized as JSON.");
    }

    const byteLength = new TextEncoder().encode(serialized).byteLength;
    if (byteLength > limits.maxBytes) {
      return issue("JSON_PAYLOAD_TOO_LARGE", "", "The serialized JSON value exceeds the configured byte limit.");
    }

    return {
      success: true,
      value: input as JsonValue,
      byteLength,
    };
  } catch {
    return issue("JSON_INSPECTION_FAILED", "", "The value could not be inspected safely.");
  }
}

export function validateEventPayloadSize(input: unknown): ValidationResult<JsonValue> {
  const result = validateJsonValue(input, {
    ...DEFAULT_JSON_LIMITS,
    maxBytes: MAX_EVENT_PAYLOAD_BYTES,
  });

  return result.success
    ? { success: true, value: result.value }
    : { success: false, errors: result.errors };
}
