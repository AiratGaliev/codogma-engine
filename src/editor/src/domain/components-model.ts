import {
  validateComponentProperties,
  validateComponentPropertyValue,
  validateComponentTypeSchema,
  type ComponentTypeSchemaV1,
  type CoreDiagnostic,
  type JsonObject,
  type JsonValue,
  type ValidationResult,
} from "@codogma/cge";
import type { SceneObject } from "./scene-model.ts";

export interface UserComponentProperty {
  name: string;
  label?: string;
  tooltip?: string;
  defValue?: unknown;
  customDefinition?: boolean;
  type?: { id: string; options?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface UserComponentDefinition {
  name: string;
  displayName?: string;
  objectDisplayFormat?: string;
  baseClass?: string;
  gameObjectType?: string;
  properties: UserComponentProperty[];
  generateAwakeEvent?: boolean;
  [key: string]: unknown;
}

export interface UserComponentsDocument {
  components: UserComponentDefinition[];
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertDocument(document: unknown): asserts document is UserComponentsDocument {
  if (!isRecord(document) || !Array.isArray(document.components)) {
    throw new TypeError('A User Components document must contain a "components" array.');
  }
  const names = new Set<string>();
  for (const value of document.components) {
    if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
      throw new TypeError("Each User Component requires a non-empty name.");
    }
    if (names.has(value.name)) throw new Error(`Duplicate User Component "${value.name}".`);
    names.add(value.name);
    if (value.properties !== undefined && !Array.isArray(value.properties)) {
      throw new TypeError(`User Component "${value.name}" properties must be an array.`);
    }
  }
}

function legacyPropertySchema(property: UserComponentProperty): ComponentTypeSchemaV1["properties"][string] | undefined {
  const base = {
    label: property.label ?? property.name,
    ...(typeof property.tooltip === "string" ? { description: property.tooltip } : {}),
    ...(Object.hasOwn(property, "defValue") ? { defaultValue: property.defValue as JsonValue } : {}),
  };
  switch (property.type?.id) {
    case "number":
      return { ...base, type: "number" };
    case "boolean":
      return { ...base, type: "boolean" };
    case "option":
      return Array.isArray(property.type.options)
        ? { ...base, type: "enum", options: property.type.options.filter((item): item is string => typeof item === "string") }
        : undefined;
    case "string":
    case undefined:
      // Legacy definitions without a type were text fields in the old Inspector.
      return { ...base, type: "string" };
    default:
      return undefined;
  }
}

/**
 * Adapts the existing .components JSON format to the public Core schema.
 * This is a compatibility adapter only: it does not register a runtime module
 * or infer a new stable component type ID from a scene/file path.
 */
export function createUserComponentSchema(
  definition: UserComponentDefinition,
): ValidationResult<ComponentTypeSchemaV1> {
  if (!definition || typeof definition.name !== "string" || !definition.name.trim()) {
    return {
      valid: false,
      diagnostics: [{
        code: "COMPONENT_INVALID_SCHEMA",
        severity: "error",
        message: "A User Component definition requires a name.",
      }],
    };
  }

  const properties: ComponentTypeSchemaV1["properties"] = {};
  const diagnostics: CoreDiagnostic[] = [];
  const names = new Set<string>();
  for (const property of definition.properties ?? []) {
    if (!property || typeof property.name !== "string" || !/^[A-Za-z_$][\w$]*$/.test(property.name)) {
      diagnostics.push({
        code: "COMPONENT_INVALID_SCHEMA",
        severity: "error",
        message: "User Component properties require valid TypeScript identifier names.",
        ...(typeof property?.name === "string" ? { propertyName: property.name } : {}),
      });
      continue;
    }
    if (names.has(property.name)) {
      diagnostics.push({
        code: "COMPONENT_INVALID_SCHEMA",
        severity: "error",
        message: `Duplicate User Component property "${property.name}".`,
        propertyName: property.name,
      });
      continue;
    }
    names.add(property.name);
    const schema = legacyPropertySchema(property);
    if (!schema) {
      diagnostics.push({
        code: "COMPONENT_INVALID_SCHEMA",
        severity: "error",
        message: `User Component property "${property.name}" uses unsupported legacy type "${property.type?.id ?? "unknown"}".`,
        propertyName: property.name,
      });
      continue;
    }
    properties[property.name] = schema;
  }
  if (diagnostics.some((item) => item.severity === "error")) return { valid: false, diagnostics };

  const schema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: `legacy.user-component:${definition.name}`,
    name: definition.displayName ?? definition.name,
    version: "legacy",
    properties,
  };
  const result = validateComponentTypeSchema(schema);
  return {
    ...result,
    diagnostics: [...diagnostics, ...result.diagnostics],
  };
}

export function validateUserComponentPropertyValue(
  definition: UserComponentDefinition,
  propertyName: string,
  value: unknown,
): ValidationResult<JsonValue> {
  const schema = createUserComponentSchema(definition);
  if (!schema.valid || !schema.value) return { valid: false, diagnostics: schema.diagnostics };
  return validateComponentPropertyValue(schema.value, propertyName, value);
}

export function validateUserComponentProperties(
  object: SceneObject,
  definition: UserComponentDefinition,
): ValidationResult<JsonObject> {
  const schema = createUserComponentSchema(definition);
  if (!schema.valid || !schema.value) return { valid: false, diagnostics: schema.diagnostics };
  const values: Record<string, unknown> = {};
  const prefix = `${definition.name}.`;
  for (const [key, value] of Object.entries(object)) {
    if (key.startsWith(prefix)) values[key.slice(prefix.length)] = value;
  }
  return validateComponentProperties(schema.value, values);
}

export function isUserComponentsContent(value: unknown): value is UserComponentsDocument {
  return Boolean(
    isRecord(value) &&
    Array.isArray(value.components) &&
    value.components.every((item) => isRecord(item) && typeof item.name === "string"),
  );
}

export function parseUserComponentsContent(content: string): UserComponentsDocument {
  if (typeof content !== "string" || !content.trim()) {
    throw new TypeError("The User Components file is empty.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new SyntaxError(
      `The User Components file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertDocument(parsed);
  return parsed;
}

export function createUserComponentDefinition(
  name: string,
  options: Partial<UserComponentDefinition> = {},
): UserComponentDefinition {
  const normalized = typeof name === "string" ? name.trim() : "";
  if (!/^[A-Za-z_$][\w$]*$/.test(normalized)) {
    throw new TypeError("User Component name must be a valid TypeScript identifier.");
  }
  return {
    name: normalized,
    displayName: options.displayName ?? normalized,
    objectDisplayFormat: options.objectDisplayFormat ?? "",
    baseClass: options.baseClass ?? "UserComponent",
    gameObjectType: options.gameObjectType ?? "Phaser.GameObjects.Image",
    properties: Array.isArray(options.properties) ? clone(options.properties) : [],
    generateAwakeEvent: options.generateAwakeEvent ?? false,
  };
}

export function addUserComponentDefinition(
  document: UserComponentsDocument,
  definition: UserComponentDefinition,
): UserComponentsDocument {
  assertDocument(document);
  if (!definition || typeof definition.name !== "string" ||
      !/^[A-Za-z_$][\w$]*$/.test(definition.name)) {
    throw new TypeError("User Component name must be a valid TypeScript identifier.");
  }
  if (document.components.some((item) => item.name === definition.name)) {
    throw new Error(`User Component "${definition.name}" already exists.`);
  }
  const properties = definition.properties ?? [];
  if (!Array.isArray(properties) || properties.some((item) =>
    !item || typeof item.name !== "string" || !/^[A-Za-z_$][\w$]*$/.test(item.name),
  )) {
    throw new TypeError("User Component properties must have valid identifier names.");
  }
  const schema = createUserComponentSchema(definition);
  if (!schema.valid) {
    throw new TypeError(schema.diagnostics.map((item) => item.message).join("\n"));
  }
  return { ...document, components: [...document.components, clone(definition)] };
}

export function updateUserComponentDefinition(
  document: UserComponentsDocument,
  name: string,
  patch: Partial<UserComponentDefinition>,
): UserComponentsDocument {
  assertDocument(document);
  const index = document.components.findIndex((item) => item.name === name);
  if (index < 0) throw new Error(`User Component "${name}" was not found.`);
  const components = document.components.slice();
  const current = components[index];
  if (!current) throw new Error(`User Component "${name}" was not found.`);
  const updated = { ...current, ...clone(patch) };
  if (components.some((item, itemIndex) => itemIndex !== index && item.name === updated.name)) {
    throw new Error(`User Component "${updated.name}" already exists.`);
  }
  const schema = createUserComponentSchema(updated);
  if (!schema.valid) throw new TypeError(schema.diagnostics.map((item) => item.message).join("\n"));
  components[index] = updated;
  assertDocument({ ...document, components });
  return { ...document, components };
}

export function removeUserComponentDefinition(
  document: UserComponentsDocument,
  name: string,
): UserComponentsDocument {
  assertDocument(document);
  const components = document.components.filter((item) => item.name !== name);
  if (components.length === document.components.length) {
    throw new Error(`User Component "${name}" was not found.`);
  }
  return { ...document, components };
}

export function attachUserComponent(
  object: SceneObject,
  definition: UserComponentDefinition,
): SceneObject {
  if (!object || typeof object !== "object" || !definition || typeof definition.name !== "string") {
    throw new TypeError("A scene object and User Component definition are required.");
  }
  const schema = createUserComponentSchema(definition);
  if (!schema.valid) throw new TypeError(schema.diagnostics.map((item) => item.message).join("\n"));

  const next = clone(object);
  const components = Array.isArray(next.components) ? next.components.slice() : [];
  if (components.includes(definition.name)) return next;
  components.push(definition.name);
  next.components = components;
  for (const property of definition.properties ?? []) {
    const key = `${definition.name}.${property.name}`;
    if (!Object.hasOwn(next, key) && Object.hasOwn(property, "defValue")) {
      const result = validateUserComponentPropertyValue(definition, property.name, property.defValue);
      if (!result.valid) throw new TypeError(result.diagnostics.map((item) => item.message).join("\n"));
      next[key] = clone(property.defValue);
    }
  }
  return next;
}

export function detachUserComponent(object: SceneObject, componentName: string): SceneObject {
  if (!object || typeof object !== "object") throw new TypeError("A scene object is required.");
  const next = clone(object);
  next.components = (Array.isArray(next.components) ? next.components : [])
    .filter((name) => name !== componentName);
  for (const key of Object.keys(next)) {
    if (key.startsWith(`${componentName}.`)) delete next[key];
  }
  return next;
}

export function formatUserComponentsContent(document: UserComponentsDocument): string {
  assertDocument(document);
  for (const definition of document.components) {
    const result = createUserComponentSchema(definition);
    if (!result.valid) throw new TypeError(result.diagnostics.map((item) => item.message).join("\n"));
  }
  return `${JSON.stringify(document, null, 4)}\n`;
}
