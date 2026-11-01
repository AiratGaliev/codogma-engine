function clone(value) { return JSON.parse(JSON.stringify(value)); }

function assertDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document) || !Array.isArray(document.components)) {
    throw new TypeError('A User Components document must contain a "components" array.');
  }
  const names = new Set();
  for (const component of document.components) {
    if (!component || typeof component !== "object" ||
        typeof component.name !== "string" || !component.name.trim()) {
      throw new TypeError("Each User Component requires a non-empty name.");
    }
    if (names.has(component.name)) throw new Error(`Duplicate User Component "${component.name}".`);
    names.add(component.name);
    if (component.properties !== undefined && !Array.isArray(component.properties)) {
      throw new TypeError(`User Component "${component.name}" properties must be an array.`);
    }
  }
}

export function isUserComponentsContent(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Array.isArray(value.components) && value.components.every((item) => item && typeof item.name === "string"));
}

export function parseUserComponentsContent(content) {
  if (typeof content !== "string" || !content.trim()) throw new TypeError("The User Components file is empty.");
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (error) { throw new SyntaxError(`The User Components file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  assertDocument(parsed);
  return parsed;
}

export function createUserComponentDefinition(name, options = {}) {
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

export function addUserComponentDefinition(document, definition) {
  assertDocument(document);
  if (!definition || typeof definition.name !== "string" || !/^[A-Za-z_$][\w$]*$/.test(definition.name)) {
    throw new TypeError("User Component name must be a valid TypeScript identifier.");
  }
  if (document.components.some((item) => item.name === definition.name)) {
    throw new Error(`User Component "${definition.name}" already exists.`);
  }
  const properties = definition.properties ?? [];
  if (!Array.isArray(properties) || properties.some((item) =>
    !item || typeof item.name !== "string" || !/^[A-Za-z_$][\w$]*$/.test(item.name))) {
    throw new TypeError("User Component properties must have valid identifier names.");
  }
  return { ...document, components: [...document.components, clone(definition)] };
}

export function updateUserComponentDefinition(document, name, patch) {
  assertDocument(document);
  const index = document.components.findIndex((item) => item.name === name);
  if (index < 0) throw new Error(`User Component "${name}" was not found.`);
  const components = document.components.slice();
  components[index] = { ...components[index], ...clone(patch) };
  if (components.some((item, itemIndex) => itemIndex !== index && item.name === components[index].name)) {
    throw new Error(`User Component "${components[index].name}" already exists.`);
  }
  assertDocument({ ...document, components });
  return { ...document, components };
}

export function removeUserComponentDefinition(document, name) {
  assertDocument(document);
  const components = document.components.filter((item) => item.name !== name);
  if (components.length === document.components.length) throw new Error(`User Component "${name}" was not found.`);
  return { ...document, components };
}

export function attachUserComponent(object, definition) {
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
    if (!Object.hasOwn(next, key) && Object.hasOwn(property, "defValue")) next[key] = clone(property.defValue);
  }
  return next;
}

export function detachUserComponent(object, componentName) {
  if (!object || typeof object !== "object") throw new TypeError("A scene object is required.");
  const next = clone(object);
  next.components = (Array.isArray(next.components) ? next.components : []).filter((name) => name !== componentName);
  for (const key of Object.keys(next)) if (key.startsWith(`${componentName}.`)) delete next[key];
  return next;
}

export function formatUserComponentsContent(document) {
  assertDocument(document);
  return `${JSON.stringify(document, null, 4)}\n`;
}
