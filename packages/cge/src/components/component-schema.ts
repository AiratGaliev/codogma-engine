import { ASSET_KINDS, isValidStableId, type AssetKind, type AssetReference } from "../project-model/contracts.js";
import { hasErrors, type CoreDiagnostic, type ValidationResult } from "../diagnostics.js";
import { isRecord, isJsonValue, type JsonObject, type JsonValue } from "../json.js";

export const COMPONENT_SCHEMA_VERSION = 1 as const;
export type ComponentPropertyStorage = "persisted" | "editorOnly" | "runtime";

interface ComponentPropertyBase {
  label?: string;
  description?: string;
  required?: boolean;
  storage?: ComponentPropertyStorage;
  defaultValue?: JsonValue;
}
export interface StringPropertySchema extends ComponentPropertyBase {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}
export interface NumberPropertySchema extends ComponentPropertyBase {
  type: "number";
  min?: number;
  max?: number;
  integer?: boolean;
}
export interface BooleanPropertySchema extends ComponentPropertyBase { type: "boolean"; }
export interface EnumPropertySchema extends ComponentPropertyBase { type: "enum"; options: string[]; }
export interface AssetPropertySchema extends ComponentPropertyBase { type: "asset"; assetKinds?: AssetKind[]; }
export interface NodePropertySchema extends ComponentPropertyBase { type: "node"; allowSelf?: boolean; }

export type ComponentPropertySchema =
  | StringPropertySchema
  | NumberPropertySchema
  | BooleanPropertySchema
  | EnumPropertySchema
  | AssetPropertySchema
  | NodePropertySchema;

export interface ComponentTypeSchemaV1 {
  schemaVersion: typeof COMPONENT_SCHEMA_VERSION;
  typeId: string;
  name: string;
  version: string;
  properties: Record<string, ComponentPropertySchema>;
}
export interface AssetPropertyValue { assetId: string; subResourceId?: string; }
export interface NodePropertyValue { nodeId: string; }
export interface ComponentSchemaContext {
  assets?: ReadonlyMap<string, AssetReference>;
  nodeIds?: ReadonlySet<string>;
  ownerNodeId?: string;
}

const PROPERTY_TYPES = ["string", "number", "boolean", "enum", "asset", "node"] as const;
const STORAGE_VALUES = ["persisted", "editorOnly", "runtime"] as const;
const COMPONENT_SCHEMA_FIELDS = new Set(["schemaVersion", "typeId", "name", "version", "properties"]);
const PROPERTY_BASE_FIELDS = ["type", "label", "description", "required", "storage", "defaultValue"] as const;
const PROPERTY_SPECIFIC_FIELDS: Record<(typeof PROPERTY_TYPES)[number], readonly string[]> = {
  string: ["minLength", "maxLength", "pattern"],
  number: ["min", "max", "integer"],
  boolean: [],
  enum: ["options"],
  asset: ["assetKinds"],
  node: ["allowSelf"],
};

function diagnostic(
  code: CoreDiagnostic["code"],
  message: string,
  propertyName?: string,
  severity: CoreDiagnostic["severity"] = "error",
): CoreDiagnostic {
  return { code, severity, message, ...(propertyName === undefined ? {} : { propertyName }) };
}

function validateValue(
  name: string,
  schema: ComponentPropertySchema,
  value: unknown,
  context: ComponentSchemaContext,
): CoreDiagnostic[] {
  const fail = (message: string): CoreDiagnostic[] => [diagnostic("COMPONENT_INVALID_VALUE", message, name)];
  if (!isJsonValue(value)) return fail(name + " must be JSON-compatible.");
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") return fail(name + " must be a string.");
      if (schema.minLength !== undefined && value.length < schema.minLength) return fail(name + " is shorter than its minimum length.");
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return fail(name + " exceeds its maximum length.");
      if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) return fail(name + " does not match its required format.");
      return [];
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return fail(name + " must be a finite number.");
      if (schema.integer && !Number.isInteger(value)) return fail(name + " must be an integer.");
      if (schema.min !== undefined && value < schema.min) return fail(name + " is below its minimum.");
      if (schema.max !== undefined && value > schema.max) return fail(name + " exceeds its maximum.");
      return [];
    case "boolean":
      return typeof value === "boolean" ? [] : fail(name + " must be a boolean.");
    case "enum":
      return typeof value === "string" && schema.options.includes(value) ? [] : fail(name + " must match one of its declared options.");
    case "asset": {
      if (!isRecord(value) || !isValidStableId(value.assetId) ||
          (value.subResourceId !== undefined && !isValidStableId(value.subResourceId))) return fail(name + " must contain an assetId reference.");
      const asset = context.assets?.get(value.assetId);
      if (context.assets && !asset) return [diagnostic("COMPONENT_INVALID_REFERENCE", "Asset " + value.assetId + " referenced by " + name + " does not exist.", name)];
      if (asset && schema.assetKinds && !schema.assetKinds.includes(asset.kind)) {
        return [diagnostic("COMPONENT_INVALID_REFERENCE", "Asset " + value.assetId + " has an incompatible kind for " + name + ".", name)];
      }
      return [];
    }
    case "node": {
      if (!isRecord(value) || !isValidStableId(value.nodeId)) return fail(name + " must contain a nodeId reference.");
      if (context.nodeIds && !context.nodeIds.has(value.nodeId)) return [diagnostic("COMPONENT_INVALID_REFERENCE", "Node " + value.nodeId + " referenced by " + name + " does not exist.", name)];
      if (context.ownerNodeId === value.nodeId && schema.allowSelf === false) return [diagnostic("COMPONENT_INVALID_REFERENCE", name + " cannot reference its owning node.", name)];
      return [];
    }
  }
}

function validatePropertySchema(name: string, input: unknown): CoreDiagnostic[] {
  if (!isRecord(input) || !isJsonValue(input) || !PROPERTY_TYPES.includes(input.type as (typeof PROPERTY_TYPES)[number])) {
    return [diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " has an unsupported type.", name)];
  }
  const errors: CoreDiagnostic[] = [];
  const supportedFields = new Set([
    ...PROPERTY_BASE_FIELDS,
    ...PROPERTY_SPECIFIC_FIELDS[input.type as (typeof PROPERTY_TYPES)[number]],
  ]);
  for (const key of Object.keys(input)) {
    if (!supportedFields.has(key)) {
      errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " contains unsupported schema field " + key + ".", name));
    }
  }
  if (input.label !== undefined && typeof input.label !== "string") {
    errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " label must be a string.", name));
  }
  if (input.description !== undefined && typeof input.description !== "string") {
    errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " description must be a string.", name));
  }
  if (input.required !== undefined && typeof input.required !== "boolean") {
    errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " required must be boolean.", name));
  }
  if (input.storage !== undefined && !STORAGE_VALUES.includes(input.storage as ComponentPropertyStorage)) {
    errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " has an unsupported storage mode.", name));
  }

  if (input.type === "number") {
    for (const key of ["min", "max"]) {
      const value = input[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
        errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " has an invalid " + key + " constraint.", name));
      }
    }
    if (input.integer !== undefined && typeof input.integer !== "boolean") {
      errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " integer must be boolean.", name));
    }
    if (typeof input.min === "number" && typeof input.max === "number" && input.min > input.max) {
      errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " minimum exceeds maximum.", name));
    }
  }

  if (input.type === "string") {
    for (const key of ["minLength", "maxLength"]) {
      const value = input[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
        errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " has an invalid " + key + " constraint.", name));
      }
    }
    if (typeof input.minLength === "number" && typeof input.maxLength === "number" && input.minLength > input.maxLength) {
      errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " minimum length exceeds maximum length.", name));
    }
    if (input.pattern !== undefined) {
      if (typeof input.pattern !== "string") {
        errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " pattern must be a string.", name));
      } else {
        try { new RegExp(input.pattern); }
        catch { errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property " + name + " has an invalid regular expression.", name)); }
      }
    }
  }

  if (input.type === "enum" &&
      (!Array.isArray(input.options) || input.options.length === 0 ||
       input.options.some((option) => typeof option !== "string" || option.length === 0) ||
       new Set(input.options).size !== input.options.length)) {
    errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Enum property " + name + " requires unique non-empty options.", name));
  }
  if (input.type === "asset" && input.assetKinds !== undefined &&
      (!Array.isArray(input.assetKinds) || input.assetKinds.some((kind) => !ASSET_KINDS.includes(kind as AssetKind)))) {
    errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Asset property " + name + " has an unsupported asset kind.", name));
  }
  if (input.type === "node" && input.allowSelf !== undefined && typeof input.allowSelf !== "boolean") {
    errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Node property " + name + " allowSelf must be boolean.", name));
  }

  if (input.defaultValue !== undefined && !isJsonValue(input.defaultValue)) {
    errors.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Default for " + name + " is not JSON-compatible.", name));
  } else if (input.defaultValue !== undefined && errors.length === 0) {
    errors.push(...validateValue(name, input as unknown as ComponentPropertySchema, input.defaultValue, {}).map((item) => ({
      ...item,
      code: "COMPONENT_INVALID_SCHEMA" as const,
      message: "Default value for " + name + " is invalid: " + item.message,
    })));
  }
  return errors;
}

export function validateComponentTypeSchema(input: unknown): ValidationResult<ComponentTypeSchemaV1> {
  if (!isRecord(input) || !isJsonValue(input) || input.schemaVersion !== COMPONENT_SCHEMA_VERSION ||
      !isValidStableId(input.typeId) ||
      typeof input.name !== "string" || !input.name.trim() ||
      typeof input.version !== "string" || !input.version.trim() ||
      !isRecord(input.properties)) {
    return { valid: false, diagnostics: [diagnostic("COMPONENT_INVALID_SCHEMA", "Component schema requires version 1, typeId, name, version and a properties object.")] };
  }
  const diagnostics: CoreDiagnostic[] = [];
  for (const key of Object.keys(input)) {
    if (!COMPONENT_SCHEMA_FIELDS.has(key)) {
      diagnostics.push({
        code: "COMPONENT_INVALID_SCHEMA",
        severity: "error",
        message: "Component schema contains unsupported field " + key + ".",
        path: key,
      });
    }
  }
  for (const [name, schema] of Object.entries(input.properties)) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) diagnostics.push(diagnostic("COMPONENT_INVALID_SCHEMA", "Property key " + name + " is not a valid identifier.", name));
    else diagnostics.push(...validatePropertySchema(name, schema));
  }
  return hasErrors(diagnostics)
    ? { valid: false, diagnostics }
    : { valid: true, diagnostics, value: input as unknown as ComponentTypeSchemaV1 };
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  return Object.keys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor;
  });
}

function setJsonProperty(target: JsonObject, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export function validateComponentProperties(
  schema: ComponentTypeSchemaV1,
  input: unknown,
  context: ComponentSchemaContext = {},
): ValidationResult<JsonObject> {
  if (!isJsonObjectRecord(input)) return { valid: false, diagnostics: [diagnostic("COMPONENT_INVALID_VALUE", "Component properties must be a plain JSON object.")] };
  const diagnostics: CoreDiagnostic[] = [];
  const normalized: JsonObject = {};

  for (const [name, propertySchema] of Object.entries(schema.properties)) {
    if ((propertySchema.storage ?? "persisted") !== "persisted") continue;
    const hasInput = Object.prototype.hasOwnProperty.call(input, name);
    const hasDefault = Object.prototype.hasOwnProperty.call(propertySchema, "defaultValue");
    if (!hasInput && !hasDefault) {
      if (propertySchema.required) diagnostics.push(diagnostic("COMPONENT_REQUIRED_VALUE", "Required property " + name + " has no value or default.", name));
      continue;
    }
    const value = hasInput ? input[name] : propertySchema.defaultValue;
    diagnostics.push(...validateValue(name, propertySchema, value, context));
    if (value !== undefined && isJsonValue(value)) setJsonProperty(normalized, name, value);
  }

  for (const [name, value] of Object.entries(input)) {
    if (Object.prototype.hasOwnProperty.call(schema.properties, name)) continue;
    if (!isJsonValue(value)) {
      diagnostics.push(diagnostic("COMPONENT_INVALID_VALUE", "Unknown property " + name + " is not JSON-compatible.", name));
      continue;
    }
    diagnostics.push(diagnostic(
      "COMPONENT_UNKNOWN_PROPERTY",
      "Property " + name + " is not declared by component " + schema.typeId + ".",
      name,
    ));
  }

  return hasErrors(diagnostics)
    ? { valid: false, diagnostics }
    : { valid: true, diagnostics, value: normalized };
}

export function validateComponentPropertyValue(
  schema: ComponentTypeSchemaV1,
  propertyName: string,
  value: unknown,
  context: ComponentSchemaContext = {},
): ValidationResult<JsonValue> {
  const property = schema.properties[propertyName];
  if (!property) {
    return {
      valid: false,
      diagnostics: [diagnostic(
        "COMPONENT_UNKNOWN_PROPERTY",
        "Property " + propertyName + " is not declared by component " + schema.typeId + ".",
        propertyName,
      )],
    };
  }
  if ((property.storage ?? "persisted") !== "persisted") {
    return {
      valid: false,
      diagnostics: [diagnostic(
        "COMPONENT_INVALID_SCHEMA",
        "Property " + propertyName + " is not a persisted component property.",
        propertyName,
      )],
    };
  }
  const diagnostics = validateValue(propertyName, property, value, context);
  if (hasErrors(diagnostics) || !isJsonValue(value)) {
    return { valid: false, diagnostics };
  }
  return { valid: true, diagnostics, value };
}

export function serializeComponentProperties(
  schema: ComponentTypeSchemaV1,
  input: unknown,
  context: ComponentSchemaContext = {},
): JsonObject {
  const result = validateComponentProperties(schema, input, context);
  if (!result.valid || !result.value) throw new ComponentSchemaValidationError(result.diagnostics);
  return result.value;
}

export class ComponentSchemaValidationError extends Error {
  readonly diagnostics: CoreDiagnostic[];
  constructor(diagnostics: CoreDiagnostic[]) {
    super("Component properties do not satisfy the registered component schema.");
    this.name = "ComponentSchemaValidationError";
    this.diagnostics = diagnostics;
  }
}
