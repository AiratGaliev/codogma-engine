import type { CoreDiagnostic, ValidationResult } from "../diagnostics.js";
import { cloneJsonValue, isJsonValue, isRecord, type JsonObject, type JsonValue } from "../json.js";
import {
  createDefaultTransform,
  isValidStableId,
  SCENE_SCHEMA_VERSION,
  PREFAB_SCHEMA_VERSION,
  type ComponentInstanceDocument,
  type NodeDocument,
  type PrefabDocumentV1,
  type SceneDocumentV1,
  type TransformData,
} from "./contracts.js";
import {
  validatePrefabDocument,
  validateSceneDocument,
  type SceneValidationContext,
} from "./validation.js";

export interface LegacyComponentTypeReference {
  readonly typeId: string;
  readonly schemaVersion: number;
}

export interface LegacyPrefabReference {
  /** Стабильный ID Prefab в ProjectDocumentV1.prefabs[].id. */
  readonly prefabId: string;
  /** Стабильный ID корневого Node мигрированного Prefab. */
  readonly rootNodeId: string;
  readonly propertyNames: ReadonlySet<string>;
}

export interface LegacySceneMigrationOptions {
  readonly name?: string;
  /** Явное сопоставление legacy-имени класса со стабильным типом Component. */
  readonly componentTypes?: ReadonlyMap<string, LegacyComponentTypeReference>;
  /** Явные стабильные ID экземпляров, ключом служит legacyComponentInstanceKey(). */
  readonly componentInstanceIds?: ReadonlyMap<string, string>;
  /** Явное сопоставление ID legacy Prefab с Prefab reference текущего Project. */
  readonly prefabReferences?: ReadonlyMap<string, LegacyPrefabReference>;
  readonly validationContext?: SceneValidationContext;
}

export interface LegacyMigrationResult<T> {
  readonly document: T;
  readonly diagnostics: CoreDiagnostic[];
  readonly sourceVersion: string;
}

type LegacyCollection = "displayList" | "container";
type LegacyRecord = Record<string, unknown>;

const TRANSFORM_FIELDS = [
  "x", "y", "rotation", "scaleX", "scaleY", "originX", "originY",
] as const;

function diagnostic(
  code: CoreDiagnostic["code"],
  message: string,
  path?: string,
  entityId?: string,
  severity: CoreDiagnostic["severity"] = "warning",
): CoreDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
    ...(entityId === undefined ? {} : { entityId }),
  };
}

function fail(message: string, path?: string, code: CoreDiagnostic["code"] = "PROJECT_MIGRATION_INVALID_INPUT"): never {
  throw new LegacyProjectMigrationError(message, [
    diagnostic(code, message, path, undefined, "error"),
  ]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cloneLegacy(value: unknown): JsonValue {
  if (!isJsonValue(value)) return null;
  return cloneJsonValue(value);
}

function setJsonProperty(target: Record<string, JsonValue>, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/** Формирует ключ для явного сопоставления legacy Component instance ID. */
export function legacyComponentInstanceKey(nodeId: string, legacyComponentName: string): string {
  if (!isValidStableId(nodeId) || !isNonEmptyString(legacyComponentName)) {
    throw new TypeError("Legacy Component mapping requires a stable Node ID and a non-empty legacy class name.");
  }
  return nodeId + "\u0000" + legacyComponentName;
}

function sourceVersion(document: LegacyRecord, kind: "scene" | "prefab"): string {
  const meta = isRecord(document.meta) ? document.meta : undefined;
  const version = meta?.version;
  return typeof version === "number" && Number.isInteger(version)
    ? "legacy-" + kind + "-meta-v" + version
    : "legacy-" + kind;
}

function asLegacyDocument(input: unknown, expectedType: "SCENE" | "PREFAB"): LegacyRecord {
  if (!isRecord(input) || !isJsonValue(input)) {
    return fail("Legacy " + expectedType + " input must be a JSON-compatible object.");
  }
  if (!isValidStableId(input.id)) {
    return fail("Legacy " + expectedType + " document requires its existing stable ID.", "id");
  }
  if (Object.prototype.hasOwnProperty.call(input, "schemaVersion")) {
    return fail(
      "A document with schemaVersion belongs to the versioned Core format; use migrateSceneDocument/migratePrefabDocument to validate it.",
      "schemaVersion",
      "PROJECT_UNSUPPORTED_VERSION",
    );
  }
  if (input.sceneType !== expectedType) {
    return fail("Expected a legacy " + expectedType + " document.", "sceneType");
  }
  return input;
}

function resolveDocumentName(document: LegacyRecord, options: LegacySceneMigrationOptions): string {
  if (isNonEmptyString(options.name)) return options.name;
  if (isRecord(document.settings) && isNonEmptyString(document.settings.sceneKey)) {
    return document.settings.sceneKey;
  }
  if (isNonEmptyString(document.name)) return document.name;
  return String(document.id);
}

function reportUnknownDocumentFields(
  source: LegacyRecord,
  diagnostics: CoreDiagnostic[],
): void {
  const known = new Set([
    "id", "sceneType", "settings", "displayList", "plainObjects", "lists",
    "prefabProperties", "codeSnippets", "meta",
  ]);
  for (const key of Object.keys(source)) {
    if (!known.has(key)) {
      diagnostics.push(diagnostic(
        "PROJECT_LEGACY_FIELD_PRESERVED",
        "Legacy document field " + key + " is not represented by Project Model v1 and remains in legacySource.",
        "document." + key,
      ));
    }
  }
  if (source.lists !== undefined) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy document-level lists are not Node children; the complete list remains in legacySource.",
      "document.lists",
    ));
  }
  if (source.codeSnippets !== undefined) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy code snippets are not executed or rewritten by this migration; they remain in legacySource.",
      "document.codeSnippets",
    ));
  }
  if (source.prefabProperties !== undefined) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy Prefab property declarations are preserved; their authoring/override semantics are outside this converter.",
      "document.prefabProperties",
    ));
  }
}

function reportUnknownNodeFields(
  source: LegacyRecord,
  nodeId: string,
  path: string,
  diagnostics: CoreDiagnostic[],
): void {
  const known = new Set([
    "id", "label", "name", "active", "type", "components", "list",
    ...TRANSFORM_FIELDS, "prefabId", "unlock", "nestedPrefabs", "texture",
    "scope", "private_np",
  ]);
  const componentNames = Array.isArray(source.components)
    ? source.components.filter(isNonEmptyString)
    : [];
  for (const key of Object.keys(source)) {
    if (known.has(key) || componentNames.some((name) => key.startsWith(name + "."))) continue;
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy Node field " + key + " has no approved Project Model v1 mapping and remains in legacySource.",
      path + "." + key,
      nodeId,
    ));
  }
  if (source.type !== undefined) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy renderer/object type " + String(source.type) + " is not reinterpreted as runtime behavior by the persisted-data migration.",
      path + ".type",
      nodeId,
    ));
  }
  if (source.texture !== undefined) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_ASSET_REFERENCE_PRESERVED",
      "Legacy texture/resource data has no Node-level Asset Reference contract in Project Model v1; preserve it until an explicit component or asset mapping is available.",
      path + ".texture",
      nodeId,
    ));
  }
  if (source.scope !== undefined || source.private_np !== undefined) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy compiler/editor metadata is preserved and is not part of the persisted runtime Node contract.",
      path,
      nodeId,
    ));
  }
  if (source.unlock !== undefined || source.nestedPrefabs !== undefined) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED",
      "Legacy Prefab unlock/nested override data requires the separate COD-8 authoring contract and remains in legacySource.",
      path + (source.unlock !== undefined ? ".unlock" : ".nestedPrefabs"),
      nodeId,
    ));
  }
}

function migrateTransform(
  source: LegacyRecord,
  nodeId: string,
  path: string,
  diagnostics: CoreDiagnostic[],
): TransformData {
  const transform = createDefaultTransform();
  for (const key of TRANSFORM_FIELDS) {
    const value = source[key];
    if (value === undefined) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      transform[key] = value;
    } else {
      diagnostics.push(diagnostic(
        "PROJECT_LEGACY_TRANSFORM_DEFAULTED",
        "Legacy Transform field " + key + " is not a finite number; the v1 default is used and the original value remains in legacySource.",
        path + "." + key,
        nodeId,
      ));
    }
  }
  return transform;
}

function mapLegacyComponents(
  source: LegacyRecord,
  nodeId: string,
  path: string,
  options: LegacySceneMigrationOptions,
  diagnostics: CoreDiagnostic[],
): { components: ComponentInstanceDocument[]; unresolved: string[] } {
  const components: ComponentInstanceDocument[] = [];
  const unresolved: string[] = [];
  if (source.components !== undefined && !Array.isArray(source.components)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_COMPONENT_PRESERVED",
      "Legacy components value is not an array; the complete source object remains in legacySource.",
      path + ".components",
      nodeId,
    ));
    return { components, unresolved };
  }

  const names = Array.isArray(source.components) ? source.components : [];
  names.forEach((entry, index) => {
    const entryPath = path + ".components[" + index + "]";
    if (!isNonEmptyString(entry)) {
      diagnostics.push(diagnostic(
        "PROJECT_LEGACY_COMPONENT_PRESERVED",
        "Legacy Component reference is not a non-empty class name and remains in legacySource.",
        entryPath,
        nodeId,
      ));
      return;
    }
    const mapping = options.componentTypes?.get(entry);
    if (!mapping) {
      unresolved.push(entry);
      diagnostics.push(diagnostic(
        "PROJECT_LEGACY_COMPONENT_PRESERVED",
        "Legacy Component " + entry + " has no explicit stable typeId/schemaVersion mapping; its reference and namespaced values remain in legacySource.",
        entryPath,
        nodeId,
      ));
      return;
    }
    if (!isValidStableId(mapping.typeId) ||
        !Number.isInteger(mapping.schemaVersion) || mapping.schemaVersion < 1) {
      fail("Legacy Component mapping for " + entry + " requires a stable typeId and positive integer schemaVersion.", entryPath);
    }

    const instanceId = options.componentInstanceIds?.get(legacyComponentInstanceKey(nodeId, entry));
    if (instanceId === undefined) {
      unresolved.push(entry);
      diagnostics.push(diagnostic(
        "PROJECT_LEGACY_COMPONENT_PRESERVED",
        "Legacy Component " + entry + " has no explicit stable instance ID mapping; no instance identity is invented.",
        entryPath,
        nodeId,
      ));
      return;
    }
    if (!isValidStableId(instanceId)) {
      fail("Legacy Component instance mapping for " + entry + " must provide a valid stable ID.", entryPath);
    }

    const properties: JsonObject = {};
    const prefix = entry + ".";
    for (const [key, value] of Object.entries(source)) {
      if (!key.startsWith(prefix)) continue;
      const propertyName = key.slice(prefix.length);
      if (!propertyName) {
        diagnostics.push(diagnostic(
          "PROJECT_LEGACY_COMPONENT_PRESERVED",
          "Legacy Component property has an empty property name and remains in legacySource.",
          path + "." + key,
          nodeId,
        ));
        continue;
      }
      setJsonProperty(properties, propertyName, cloneLegacy(value));
    }

    components.push({
      id: instanceId,
      typeId: mapping.typeId,
      schemaVersion: mapping.schemaVersion,
      enabled: true,
      properties,
    });
  });
  return { components, unresolved };
}

function mapPrefabInstance(
  source: LegacyRecord,
  nodeId: string,
  path: string,
  options: LegacySceneMigrationOptions,
  diagnostics: CoreDiagnostic[],
): NodeDocument["prefabInstance"] | undefined {
  if (source.prefabId === undefined) return undefined;
  if (!isValidStableId(source.prefabId)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED",
      "Legacy prefabId is invalid and is preserved only in legacySource.",
      path + ".prefabId",
      nodeId,
    ));
    return undefined;
  }

  const mapping = options.prefabReferences?.get(source.prefabId);
  if (!mapping) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED",
      "Legacy Prefab ID has no explicit mapping to a ProjectDocumentV1 Prefab reference; no runtime/reference ID is guessed.",
      path + ".prefabId",
      nodeId,
    ));
    return undefined;
  }
  if (!isValidStableId(mapping.prefabId) || !isValidStableId(mapping.rootNodeId)) {
    fail("Legacy Prefab mapping must provide stable Project Prefab and root Node IDs.", path + ".prefabId");
  }

  const validationContext = options.validationContext;
  const registeredPrefab = validationContext?.prefabs?.get(mapping.prefabId);
  const prefabIsRegistered = registeredPrefab !== undefined ||
    validationContext?.prefabIds?.has(mapping.prefabId) === true;
  if (!prefabIsRegistered) {
    fail(
      "Legacy Prefab mapping must resolve to a Prefab registered in validationContext.prefabIds or validationContext.prefabs.",
      path + ".prefabId",
      "PROJECT_INVALID_REFERENCE",
    );
  }
  if (registeredPrefab && registeredPrefab.root.id !== mapping.rootNodeId) {
    fail(
      "Legacy Prefab mapping rootNodeId does not match the registered Prefab root.",
      path + ".prefabId",
      "PROJECT_INVALID_REFERENCE",
    );
  }

  const overrides: Array<{ targetNodeId: string; propertyPath: string; value: JsonValue }> = [];
  for (const propertyName of mapping.propertyNames) {
    if (!isNonEmptyString(propertyName) ||
        !Object.prototype.hasOwnProperty.call(source, propertyName)) continue;
    const value = source[propertyName];
    if (!isJsonValue(value)) {
      diagnostics.push(diagnostic(
        "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED",
        "Legacy Prefab override " + propertyName + " is not JSON-compatible and remains in legacySource.",
        path + "." + propertyName,
        nodeId,
      ));
      continue;
    }
    overrides.push({
      targetNodeId: mapping.rootNodeId,
      propertyPath: propertyName,
      value: cloneJsonValue(value),
    });
  }
  return { prefabId: mapping.prefabId, overrides };
}

function migrateLegacyNode(
  input: unknown,
  path: string,
  collection: LegacyCollection,
  options: LegacySceneMigrationOptions,
  diagnostics: CoreDiagnostic[],
): NodeDocument {
  if (!isRecord(input) || !isJsonValue(input)) {
    return fail("Legacy Node must be a JSON-compatible object.", path);
  }
  if (!isValidStableId(input.id)) {
    return fail("Legacy Node is missing its existing stable ID; migration never invents identity from array order or name.", path + ".id");
  }

  const nodeId = input.id;
  if (input.active !== undefined && typeof input.active !== "boolean") {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy active flag is not boolean; v1 defaults it to true and preserves the original value in legacySource.",
      path + ".active",
      nodeId,
    ));
  }

  const components = mapLegacyComponents(input, nodeId, path, options, diagnostics);
  const children = Array.isArray(input.list)
    ? input.list.map((child, index) =>
      migrateLegacyNode(child, path + ".list[" + index + "]", "container", options, diagnostics))
    : [];
  if (input.list !== undefined && !Array.isArray(input.list)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy Container list is not an array; original data remains in legacySource.",
      path + ".list",
      nodeId,
    ));
  }

  reportUnknownNodeFields(input, nodeId, path, diagnostics);
  const prefabInstance = mapPrefabInstance(input, nodeId, path, options, diagnostics);
  const label = isNonEmptyString(input.label) ? input.label :
    isNonEmptyString(input.name) ? input.name : nodeId;
  const node = {
    id: nodeId,
    name: label,
    active: typeof input.active === "boolean" ? input.active : true,
    transform: migrateTransform(input, nodeId, path, diagnostics),
    components: components.components,
    children,
    legacySource: cloneJsonValue(input as JsonValue),
    legacyCollection: collection,
    ...(components.unresolved.length === 0 ? {} : { legacyComponents: components.unresolved }),
    ...(prefabInstance === undefined ? {} : { prefabInstance }),
  };
  return node as unknown as NodeDocument;
}

function buildValidationContext(options: LegacySceneMigrationOptions): SceneValidationContext {
  // Mapping подтверждает identity, но не должен неявно регистрировать неизвестный проекту тип.
  return options.validationContext ?? {};
}

function assertValidMigration<T>(
  result: ValidationResult<T>,
  message: string,
): asserts result is ValidationResult<T> & { value: T } {
  if (!result.valid || !result.value) {
    throw new LegacyProjectMigrationError(message, result.diagnostics);
  }
}

/** Конвертирует legacy Scene в Scene v1 без файлового I/O и без исполнения legacy-кода. */
export function migrateLegacySceneDocument(
  input: unknown,
  options: LegacySceneMigrationOptions = {},
): LegacyMigrationResult<SceneDocumentV1> {
  const legacy = asLegacyDocument(input, "SCENE");
  const diagnostics: CoreDiagnostic[] = [];
  reportUnknownDocumentFields(legacy, diagnostics);

  const displayList = legacy.displayList === undefined ? [] :
    Array.isArray(legacy.displayList) ? legacy.displayList : [];
  if (legacy.displayList !== undefined && !Array.isArray(legacy.displayList)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy displayList is not an array; no hierarchy is inferred from the malformed value.",
      "document.displayList",
    ));
  }

  if (legacy.plainObjects !== undefined && !Array.isArray(legacy.plainObjects)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy plainObjects collection is malformed and remains unchanged in legacySource.",
      "document.plainObjects",
    ));
  } else if (Array.isArray(legacy.plainObjects) && legacy.plainObjects.length > 0) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy plainObjects are not GameObject Nodes and are not moved into the Scene hierarchy; the full collection remains in legacySource.",
      "document.plainObjects",
    ));
  }

  const rootNodes = displayList.map((node, index) =>
    migrateLegacyNode(node, "displayList[" + index + "]", "displayList", options, diagnostics));
  const settings = isRecord(legacy.settings) ? legacy.settings : {};
  if (legacy.settings !== undefined && !isRecord(legacy.settings)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy settings is not an object; it remains unchanged in legacySource.",
      "document.settings",
    ));
  }
  const meta = isRecord(legacy.meta) ? legacy.meta : {};
  if (legacy.meta !== undefined && !isRecord(legacy.meta)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy metadata is not an object; the original value remains unchanged in legacySource.",
      "document.meta",
    ));
  }
  const document = {
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: legacy.id,
    name: resolveDocumentName(legacy, options),
    rootNodes,
    settings: {
      legacySettings: cloneJsonValue(settings as unknown as JsonValue),
      legacyMeta: cloneJsonValue(meta as unknown as JsonValue),
    },
    legacySource: cloneJsonValue(legacy as unknown as JsonValue),
  } as SceneDocumentV1 & Record<string, unknown>;

  const validation = validateSceneDocument(document, buildValidationContext(options));
  assertValidMigration(validation, "Legacy Scene could not be converted to Scene v1.");
  return {
    document: validation.value,
    diagnostics: [...diagnostics, ...validation.diagnostics],
    sourceVersion: sourceVersion(legacy, "scene"),
  };
}

/** Конвертирует legacy Prefab в Prefab v1; принимает только один однозначный корневой Node. */
export function migrateLegacyPrefabDocument(
  input: unknown,
  options: LegacySceneMigrationOptions = {},
): LegacyMigrationResult<PrefabDocumentV1> {
  const legacy = asLegacyDocument(input, "PREFAB");
  const diagnostics: CoreDiagnostic[] = [];
  reportUnknownDocumentFields(legacy, diagnostics);

  const displayList = legacy.displayList === undefined ? [] :
    Array.isArray(legacy.displayList) ? legacy.displayList : [];
  if (legacy.displayList !== undefined && !Array.isArray(legacy.displayList)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy Prefab displayList is not an array and remains unchanged in legacySource.",
      "document.displayList",
    ));
  }
  if (legacy.plainObjects !== undefined) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_FIELD_PRESERVED",
      "Legacy Prefab plainObjects is not a Prefab root and remains unchanged in legacySource.",
      "document.plainObjects",
    ));
  }
  if (displayList.length !== 1) {
    return fail(
      "Legacy Prefab must contain exactly one displayList root; migration will not invent a grouping Node or reinterpret additional roots.",
      "displayList",
    );
  }

  const root = migrateLegacyNode(displayList[0], "displayList[0]", "displayList", options, diagnostics);
  const document = {
    schemaVersion: PREFAB_SCHEMA_VERSION,
    id: legacy.id,
    name: resolveDocumentName(legacy, options),
    root,
    legacyPrefabProperties: cloneLegacy(legacy.prefabProperties ?? []),
    legacySource: cloneJsonValue(legacy as unknown as JsonValue),
  } as PrefabDocumentV1 & Record<string, unknown>;

  const validation = validatePrefabDocument(document, buildValidationContext(options));
  assertValidMigration(validation, "Legacy Prefab could not be converted to Prefab v1.");
  return {
    document: validation.value,
    diagnostics: [...diagnostics, ...validation.diagnostics],
    sourceVersion: sourceVersion(legacy, "prefab"),
  };
}

/** Валидирует/клонирует Scene v1 либо явно запускает legacy Scene migration. */
export function migrateSceneDocument(
  input: unknown,
  options: LegacySceneMigrationOptions = {},
): LegacyMigrationResult<SceneDocumentV1> {
  if (!isRecord(input) || !isJsonValue(input)) {
    return fail("Scene migration input must be a JSON-compatible object.");
  }
  if (input.schemaVersion === SCENE_SCHEMA_VERSION) {
    const document = cloneJsonValue(input as unknown as JsonValue) as unknown as SceneDocumentV1;
    const validation = validateSceneDocument(document, buildValidationContext(options));
    assertValidMigration(validation, "Scene v1 document is invalid.");
    return { document: validation.value, diagnostics: validation.diagnostics, sourceVersion: "cge-scene-v1" };
  }
  if (Object.prototype.hasOwnProperty.call(input, "schemaVersion")) {
    return fail("Scene schemaVersion " + String(input.schemaVersion) + " is not supported.", "schemaVersion", "PROJECT_UNSUPPORTED_VERSION");
  }
  return migrateLegacySceneDocument(input, options);
}

/** Валидирует/клонирует Prefab v1 либо явно запускает legacy Prefab migration. */
export function migratePrefabDocument(
  input: unknown,
  options: LegacySceneMigrationOptions = {},
): LegacyMigrationResult<PrefabDocumentV1> {
  if (!isRecord(input) || !isJsonValue(input)) {
    return fail("Prefab migration input must be a JSON-compatible object.");
  }
  if (input.schemaVersion === PREFAB_SCHEMA_VERSION) {
    const document = cloneJsonValue(input as unknown as JsonValue) as unknown as PrefabDocumentV1;
    const validation = validatePrefabDocument(document, buildValidationContext(options));
    assertValidMigration(validation, "Prefab v1 document is invalid.");
    return { document: validation.value, diagnostics: validation.diagnostics, sourceVersion: "cge-prefab-v1" };
  }
  if (Object.prototype.hasOwnProperty.call(input, "schemaVersion")) {
    return fail("Prefab schemaVersion " + String(input.schemaVersion) + " is not supported.", "schemaVersion", "PROJECT_UNSUPPORTED_VERSION");
  }
  return migrateLegacyPrefabDocument(input, options);
}

export class LegacyProjectMigrationError extends Error {
  readonly diagnostics: CoreDiagnostic[];

  constructor(message: string, diagnostics: CoreDiagnostic[]) {
    super(message);
    this.name = "LegacyProjectMigrationError";
    this.diagnostics = diagnostics;
  }
}
