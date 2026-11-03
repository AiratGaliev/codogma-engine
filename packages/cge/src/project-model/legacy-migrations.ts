import type { CoreDiagnostic, ValidationResult } from "../diagnostics.js";
import { cloneJsonValue, isJsonValue, isRecord, type JsonObject, type JsonValue } from "../json.js";
import {
  SCENE_SCHEMA_VERSION,
  PREFAB_SCHEMA_VERSION,
  createDefaultTransform,
  type ComponentInstanceDocument,
  type NodeDocument,
  type PrefabDocumentV1,
  type SceneDocumentV1,
  type TransformData,
} from "./contracts.js";
import { validatePrefabDocument, validateSceneDocument, type SceneValidationContext } from "./validation.js";

export interface LegacyComponentTypeReference {
  readonly typeId: string;
  readonly schemaVersion: number;
}

export interface LegacyAssetReferenceMapping {
  readonly assetId: string;
}

export interface LegacyPrefabReference {
  readonly rootNodeId: string;
  readonly propertyNames: ReadonlySet<string>;
}

export interface LegacySceneMigrationOptions {
  readonly name?: string;
  readonly componentTypes?: ReadonlyMap<string, LegacyComponentTypeReference>;
  readonly prefabReferences?: ReadonlyMap<string, LegacyPrefabReference>;
  readonly assetReferences?: ReadonlyMap<string, LegacyAssetReferenceMapping>;
  readonly validationContext?: SceneValidationContext;
}

export interface LegacyMigrationResult<T> {
  readonly document: T;
  readonly diagnostics: CoreDiagnostic[];
  readonly sourceVersion: string;
}

const TRANSFORM_FIELDS = [
  "x",
  "y",
  "rotation",
  "scaleX",
  "scaleY",
  "originX",
  "originY",
] as const;

type LegacyCollection = "displayList" | "plainObjects" | "container";

function diagnostic(
  code: CoreDiagnostic["code"],
  severity: CoreDiagnostic["severity"],
  message: string,
  path?: string,
  entityId?: string,
): CoreDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
    ...(entityId === undefined ? {} : { entityId }),
  };
}

function fail(message: string, path?: string): never {
  throw new LegacyProjectMigrationError(message, [
    diagnostic(
      "PROJECT_MIGRATION_INVALID_INPUT",
      "error",
      message,
      path,
    ),
  ]);
}

type LegacySceneDocumentInput = Record<string, unknown> & { readonly id: string };

function asLegacyDocument(input: unknown, expectedType: "SCENE" | "PREFAB"): LegacySceneDocumentInput {
  if (!isRecord(input) || !isJsonValue(input)) {
    return fail("Legacy " + expectedType + " input must be a JSON object.");
  }
  if (!isNonEmptyString(input.id)) {
    return fail("Legacy " + expectedType + " document requires its existing stable id.", "id");
  }
  if (input.sceneType !== expectedType) {
    return fail("Expected a legacy " + expectedType + " document.", "sceneType");
  }
  return input as LegacySceneDocumentInput;
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

function resolveDocumentName(
  document: Record<string, unknown>,
  options: LegacySceneMigrationOptions,
): string {
  if (isNonEmptyString(options.name)) return options.name;
  if (isRecord(document.settings) && isNonEmptyString(document.settings.sceneKey)) {
    return document.settings.sceneKey;
  }
  if (isNonEmptyString(document.name)) return document.name;
  return String(document.id);
}

function migrateTransform(
  source: Record<string, unknown>,
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
        "warning",
        "Legacy transform value " + key + " is not a finite number; the v1 default is used and the original value is retained in legacySource.",
        path + "." + key,
        nodeId,
      ));
    }
  }
  return transform;
}

function resolveRegisteredComponentTypes(
  options: LegacySceneMigrationOptions,
): ReadonlySet<string> | undefined {
  const ids = new Set(options.validationContext?.registeredComponentTypes ?? []);
  for (const mapping of options.componentTypes?.values() ?? []) ids.add(mapping.typeId);
  return ids.size > 0 ? ids : undefined;
}

function mapLegacyComponents(
  source: Record<string, unknown>,
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
      "warning",
      "Legacy components value is not an array; the original value is retained in legacySource.",
      path + ".components",
      nodeId,
    ));
    return { components, unresolved };
  }

  const names = Array.isArray(source.components) ? source.components : [];
  names.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      diagnostics.push(diagnostic(
        "PROJECT_LEGACY_COMPONENT_PRESERVED",
        "warning",
        "Legacy component reference is not a non-empty string and cannot be mapped.",
        path + ".components[" + index + "]",
        nodeId,
      ));
      return;
    }
    const mapping = options.componentTypes?.get(entry);
    if (!mapping) {
      unresolved.push(entry);
      diagnostics.push(diagnostic(
        "PROJECT_LEGACY_COMPONENT_PRESERVED",
        "warning",
        "Legacy component " + entry + " has no explicit stable typeId mapping; its reference and namespaced values remain in legacySource.",
        path + ".components[" + index + "]",
        nodeId,
      ));
      return;
    }
    if (!isNonEmptyString(mapping.typeId) ||
        !Number.isInteger(mapping.schemaVersion) ||
        mapping.schemaVersion < 1) {
      fail("Legacy component mapping for " + entry + " requires a stable typeId and positive integer schemaVersion.", path + ".components[" + index + "]");
    }

    const properties: Record<string, JsonValue> = {};
    const prefix = entry + ".";
    for (const [key, value] of Object.entries(source)) {
      if (!key.startsWith(prefix)) continue;
      const propertyName = key.slice(prefix.length);
      if (!propertyName || !isJsonValue(value)) {
        diagnostics.push(diagnostic(
          "PROJECT_LEGACY_COMPONENT_PRESERVED",
          "warning",
          "Legacy component property " + key + " cannot be converted to a JSON property; it remains in legacySource.",
          path + "." + key,
          nodeId,
        ));
        continue;
      }
      setJsonProperty(properties, propertyName, cloneJsonValue(value));
    }

    components.push({
      id: "legacy:" + nodeId + ":" + entry,
      typeId: mapping.typeId,
      schemaVersion: mapping.schemaVersion,
      enabled: true,
      properties,
    });
  });

  return { components, unresolved };
}

function mapLegacyAssetReferences(
  source: Record<string, unknown>,
  nodeId: string,
  path: string,
  options: LegacySceneMigrationOptions,
  diagnostics: CoreDiagnostic[],
): Array<{ propertyPath: string; assetId: string }> {
  if (!isRecord(source.texture) || !isNonEmptyString(source.texture.key)) return [];
  const legacyKey = source.texture.key;
  const mapping = options.assetReferences?.get(legacyKey);
  if (!mapping || !isNonEmptyString(mapping.assetId)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_COMPONENT_PRESERVED",
      "warning",
      "Legacy texture key " + legacyKey + " has no explicit stable Asset ID mapping; the original texture configuration remains in legacySource.",
      path + ".texture.key",
      nodeId,
    ));
    return [];
  }
  return [{ propertyPath: "texture", assetId: mapping.assetId }];
}

function mapPrefabInstance(
  source: Record<string, unknown>,
  nodeId: string,
  path: string,
  options: LegacySceneMigrationOptions,
  diagnostics: CoreDiagnostic[],
): NodeDocument["prefabInstance"] | undefined {
  if (source.prefabId === undefined) return undefined;
  if (!isNonEmptyString(source.prefabId)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED",
      "warning",
      "Legacy prefabId is invalid; prefab fields remain available in legacySource.",
      path + ".prefabId",
      nodeId,
    ));
    return undefined;
  }

  const reference = options.prefabReferences?.get(source.prefabId);
  const overrides: Array<{ targetNodeId: string; propertyPath: string; value: JsonValue }> = [];
  if (!reference) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED",
      "warning",
      "Prefab " + source.prefabId + " has no root-node/property mapping. Legacy instance values are preserved in legacySource and no guessed overrides are emitted.",
      path + ".prefabId",
      nodeId,
    ));
  } else {
    for (const propertyName of reference.propertyNames) {
      if (!Object.prototype.hasOwnProperty.call(source, propertyName)) continue;
      const value = source[propertyName];
      if (!isJsonValue(value)) {
        diagnostics.push(diagnostic(
          "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED",
          "warning",
          "Prefab override " + propertyName + " is not JSON-compatible and remains in legacySource.",
          path + "." + propertyName,
          nodeId,
        ));
        continue;
      }
      overrides.push({
        targetNodeId: reference.rootNodeId,
        propertyPath: propertyName,
        value: cloneJsonValue(value),
      });
    }
  }

  return {
    prefabId: source.prefabId,
    overrides,
  };
}

function migrateLegacyNode(
  input: unknown,
  path: string,
  collection: LegacyCollection,
  options: LegacySceneMigrationOptions,
  diagnostics: CoreDiagnostic[],
): NodeDocument {
  if (!isRecord(input) || !isJsonValue(input)) {
    return fail("Legacy scene node must be a JSON object.", path);
  }
  if (!isNonEmptyString(input.id)) {
    return fail("Legacy scene node is missing its stable id; migration never invents identity from array order.", path + ".id");
  }

  const nodeId = input.id;
  const name = isNonEmptyString(input.label)
    ? input.label
    : isNonEmptyString(input.name)
      ? input.name
      : isNonEmptyString(input.type)
        ? input.type
        : nodeId;
  const mapped = mapLegacyComponents(input, nodeId, path, options, diagnostics);
  const children = Array.isArray(input.list)
    ? input.list.map((child, index) =>
      migrateLegacyNode(child, path + ".list[" + index + "]", "container", options, diagnostics))
    : [];

  if (input.list !== undefined && !Array.isArray(input.list)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_COMPONENT_PRESERVED",
      "warning",
      "Legacy list/container children are not an array; the original value remains in legacySource.",
      path + ".list",
      nodeId,
    ));
  }

  const prefabInstance = mapPrefabInstance(input, nodeId, path, options, diagnostics);
  const assetReferences = mapLegacyAssetReferences(input, nodeId, path, options, diagnostics);
  const legacySource = cloneJsonValue(input as JsonValue) as JsonObject;
  const node: NodeDocument = {
    id: nodeId,
    name,
    active: typeof input.active === "boolean" ? input.active : true,
    transform: migrateTransform(input, nodeId, path, diagnostics),
    components: mapped.components,
    ...(assetReferences.length === 0 ? {} : { assetReferences }),
    children,
    legacySource,
    legacyCollection: collection,
    ...(mapped.unresolved.length === 0 ? {} : { legacyComponents: mapped.unresolved }),
    ...(prefabInstance === undefined ? {} : { prefabInstance }),
  } as NodeDocument;

  return node;
}

function buildValidationContext(options: LegacySceneMigrationOptions): SceneValidationContext {
  const registered = resolveRegisteredComponentTypes(options);
  return {
    ...(options.validationContext ?? {}),
    ...(registered === undefined ? {} : { registeredComponentTypes: registered }),
  };
}

export function migrateLegacySceneDocument(
  input: unknown,
  options: LegacySceneMigrationOptions = {},
): LegacyMigrationResult<SceneDocumentV1> {
  const legacy = asLegacyDocument(input, "SCENE");
  const diagnostics: CoreDiagnostic[] = [];
  const displayList = Array.isArray(legacy.displayList) ? legacy.displayList : [];
  const plainObjects = Array.isArray(legacy.plainObjects) ? legacy.plainObjects : [];

  if (legacy.displayList !== undefined && !Array.isArray(legacy.displayList)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_COMPONENT_PRESERVED",
      "warning",
      "Legacy displayList is not an array; the original document is retained in legacySource.",
      "displayList",
    ));
  }
  if (legacy.plainObjects !== undefined && !Array.isArray(legacy.plainObjects)) {
    diagnostics.push(diagnostic(
      "PROJECT_LEGACY_COMPONENT_PRESERVED",
      "warning",
      "Legacy plainObjects is not an array; the original document is retained in legacySource.",
      "plainObjects",
    ));
  }

  const rootNodes = [
    ...displayList.map((node, index) =>
      migrateLegacyNode(node, "displayList[" + index + "]", "displayList", options, diagnostics)),
    ...plainObjects.map((node, index) =>
      migrateLegacyNode(node, "plainObjects[" + index + "]", "plainObjects", options, diagnostics)),
  ];
  const document = {
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: legacy.id,
    name: resolveDocumentName(legacy, options),
    rootNodes,
    settings: {
      legacySettings: cloneLegacy(legacy.settings ?? {}),
      legacyMeta: cloneLegacy(legacy.meta ?? {}),
    },
    legacySource: cloneJsonValue(legacy as JsonValue),
  } as SceneDocumentV1 & Record<string, unknown>;

  const validation = validateSceneDocument(document, buildValidationContext(options));
  assertValidMigration(validation, "Legacy Scene could not be converted to Scene v1.");
  return {
    document,
    diagnostics: [...diagnostics, ...validation.diagnostics],
    sourceVersion: "legacy-scene",
  };
}

export function migrateLegacyPrefabDocument(
  input: unknown,
  options: LegacySceneMigrationOptions = {},
): LegacyMigrationResult<PrefabDocumentV1> {
  const legacy = asLegacyDocument(input, "PREFAB");
  const diagnostics: CoreDiagnostic[] = [];
  const displayList = Array.isArray(legacy.displayList) ? legacy.displayList : [];
  const plainObjects = Array.isArray(legacy.plainObjects) ? legacy.plainObjects : [];
  const roots = [
    ...displayList.map((node, index) =>
      migrateLegacyNode(node, "displayList[" + index + "]", "displayList", options, diagnostics)),
    ...plainObjects.map((node, index) =>
      migrateLegacyNode(node, "plainObjects[" + index + "]", "plainObjects", options, diagnostics)),
  ];
  const root = roots[0];
  if (!root) {
    return fail("Legacy Prefab must contain at least one stable-id root object.", "displayList");
  }
  if (roots.length > 1) {
    return fail(
      "Legacy Prefab contains multiple root objects, but Prefab v1 has exactly one root. Flattening or nesting extra roots would change hierarchy semantics; keep the source unchanged until an explicit grouping migration is supplied.",
      "displayList",
    );
  }

  const document = {
    schemaVersion: PREFAB_SCHEMA_VERSION,
    id: legacy.id,
    name: resolveDocumentName(legacy, options),
    root,
    legacyPrefabProperties: cloneLegacy(legacy.prefabProperties ?? []),
    legacySource: cloneJsonValue(legacy as JsonValue),
  } as PrefabDocumentV1 & Record<string, unknown>;

  const validation = validatePrefabDocument(document, buildValidationContext(options));
  assertValidMigration(validation, "Legacy Prefab could not be converted to Prefab v1.");
  return {
    document,
    diagnostics: [...diagnostics, ...validation.diagnostics],
    sourceVersion: "legacy-prefab",
  };
}

function assertValidMigration<T>(
  result: ValidationResult<T>,
  message: string,
): asserts result is ValidationResult<T> & { value: T } {
  if (!result.valid || !result.value) {
    throw new LegacyProjectMigrationError(message, result.diagnostics);
  }
}

export class LegacyProjectMigrationError extends Error {
  readonly diagnostics: CoreDiagnostic[];

  constructor(message: string, diagnostics: CoreDiagnostic[]) {
    super(message);
    this.name = "LegacyProjectMigrationError";
    this.diagnostics = diagnostics;
  }
}
