import type { SceneObject } from "./scene-model.ts";

export interface UserComponentProperty {
  name: string;
  label?: string;
  tooltip?: string;
  defValue?: unknown;
  customDefinition?: boolean;
  type?: { id: "string" | "number" | "boolean" | "option"; options?: string[]; [key: string]: unknown };
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
  components[index] = updated;
  if (components.some((item, itemIndex) => itemIndex !== index && item.name === updated.name)) {
    throw new Error(`User Component "${updated.name}" already exists.`);
  }
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
  const next = clone(object);
  const components = Array.isArray(next.components) ? next.components.slice() : [];
  if (components.includes(definition.name)) return next;
  components.push(definition.name);
  next.components = components;
  for (const property of definition.properties ?? []) {
    const key = `${definition.name}.${property.name}`;
    if (!Object.hasOwn(next, key) && Object.hasOwn(property, "defValue")) {
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
  return `${JSON.stringify(document, null, 4)}\n`;
}
