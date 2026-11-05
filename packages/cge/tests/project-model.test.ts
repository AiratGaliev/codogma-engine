import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  isValidStableId,
  migrateProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
  validateComponentTypeSchema,
  validateProjectDocument,
  validateSceneDocument,
  isJsonValue,
  stableStringify,
  type ComponentTypeSchemaV1,
  type JsonValue,
  type PrefabDocumentV1,
  type ProjectDocumentV1,
} from "../src/index.js";

const validProject: ProjectDocumentV1 = {
  schemaVersion: 1,
  id: "project-1",
  name: "Core acceptance",
  scenes: [{ id: "scene-ref-1", assetId: "asset-scene-1" }],
  assets: [{ id: "asset-scene-1", path: "scenes/Level.cge-scene.json", kind: "scene" }],
  prefabs: [],
  componentModules: [],
  runtime: { adapterId: "phaser", settings: {} },
};

test("validates the versioned project envelope and preserves unknown JSON fields", () => {
  const input = JSON.parse(JSON.stringify(validProject)) as Record<string, unknown>;
  input.extensionData = { source: "plugin", keep: true };
  const result = validateProjectDocument(input);
  assert.equal(result.valid, true);
  assert.deepEqual((result.value as unknown as Record<string, unknown>).extensionData, { source: "plugin", keep: true });
});

test("serializes deterministic JSON and round-trips the same semantic document", () => {
  const first = serializeProjectDocument(validProject);
  const second = serializeProjectDocument(JSON.parse(first) as ProjectDocumentV1);
  assert.equal(first, second);
  assert.equal(first.endsWith("\n"), true);
});

test("migrates only the explicit v0 project shape in memory", () => {
  const result = migrateProjectDocument({
    schemaVersion: 0,
    id: "legacy-project",
    name: "Old project",
    unknownPluginData: { keep: "yes" },
  });
  assert.equal(result.fromVersion, 0);
  assert.equal(result.toVersion, 1);
  assert.equal(result.document.runtime.adapterId, "phaser");
  assert.deepEqual((result.document as unknown as Record<string, unknown>).unknownPluginData, { keep: "yes" });
});

test("reports parse and unsupported-version diagnostics without rewriting source", () => {
  assert.equal(parseProjectDocument("{").diagnostics[0]?.code, "PROJECT_PARSE_ERROR");
  assert.equal(
    parseProjectDocument(JSON.stringify({ schemaVersion: 7 })).diagnostics[0]?.code,
    "PROJECT_UNSUPPORTED_VERSION",
  );
});

test("rejects dangling scene refs, duplicate ids and traversal paths", () => {
  const dangling = { ...validProject, scenes: [{ id: "scene-ref-1", assetId: "missing" }] };
  assert.equal(
    validateProjectDocument(dangling).diagnostics.some((item) => item.code === "PROJECT_INVALID_REFERENCE"),
    true,
  );

  const invalid = {
    ...validProject,
    assets: [
      { id: "asset-scene-1", path: "scenes/Level.cge-scene.json", kind: "scene" },
      { id: "asset-scene-1", path: "../outside.png", kind: "image" },
    ],
  };
  const diagnostics = validateProjectDocument(invalid).diagnostics;
  assert.equal(diagnostics.some((item) => item.code === "PROJECT_DUPLICATE_ID"), true);
  assert.equal(diagnostics.some((item) => item.code === "PROJECT_INVALID_DOCUMENT"), true);
});

test("scene validation catches duplicate node ids and invalid transforms", () => {
  const scene = {
    schemaVersion: 1,
    id: "scene-1",
    name: "Level",
    settings: {},
    rootNodes: [{
      id: "node-1",
      name: "Root",
      active: true,
      transform: { x: Number.NaN, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [{
        id: "node-1",
        name: "Duplicate",
        active: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [],
        children: [],
      }],
    }],
  };
  const result = validateSceneDocument(scene);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.some((item) => item.code === "SCENE_DUPLICATE_ID"), true);
  assert.equal(result.diagnostics.some((item) => item.code === "SCENE_INVALID_TRANSFORM"), true);
});

test("checked-in project v0/v1 compatibility fixtures are exercised by the parser", () => {
  const legacy = readFileSync(resolve(process.cwd(), "tests/fixtures/project-v0.json"), "utf8");
  const current = readFileSync(resolve(process.cwd(), "tests/fixtures/project-v1.json"), "utf8");

  const migrated = parseProjectDocument(legacy);
  const parsed = parseProjectDocument(current);

  assert.equal(migrated.value?.schemaVersion, 1);
  assert.equal(migrated.migratedFrom, 0);
  assert.deepEqual(
    (migrated.value as unknown as Record<string, unknown>).unknownPluginData,
    { keep: true },
  );
  assert.equal(parsed.value?.schemaVersion, 1);
  assert.deepEqual(
    (parsed.value as unknown as Record<string, unknown>).unknownPluginData,
    { keep: true },
  );
});

test("rejects non-JSON objects and safely preserves an own __proto__ data key", () => {
  assert.equal(isJsonValue(new Date()), false);
  assert.equal(isJsonValue(new Map()), false);
  assert.equal(isJsonValue({ value: Number.NaN }), false);

  const parsed = JSON.parse('{"__proto__":{"polluted":true},"value":1}') as JsonValue;
  assert.equal(isJsonValue(parsed), true);
  const roundTrip = JSON.parse(stableStringify(parsed)) as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(roundTrip, "__proto__"), true);
  assert.deepEqual(roundTrip.__proto__, { polluted: true });
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
});

test("component validation diagnostics retain the exact persisted property path", () => {
  const componentSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.path-check",
    name: "Path Check",
    version: "1.0.0",
    properties: { speed: { type: "number", min: 0 } },
  };
  const result = validateSceneDocument({
    schemaVersion: 1,
    id: "scene-path",
    name: "Path",
    settings: {},
    rootNodes: [{
      id: "node-path",
      name: "Player",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "component-path",
        typeId: componentSchema.typeId,
        schemaVersion: 1,
        enabled: true,
        properties: { speed: -1 },
      }],
      children: [],
    }],
  }, { componentSchemas: new Map([[componentSchema.typeId, componentSchema]]) });

  const diagnostic = result.diagnostics.find((item) => item.propertyName === "speed");
  assert.equal(diagnostic?.path, "rootNodes[0].components[0].properties.speed");
  assert.equal(diagnostic?.componentInstanceId, "component-path");
});

test("validates Prefab override target node and component references", () => {
  const prefab: PrefabDocumentV1 = {
    schemaVersion: 1,
    id: "prefab-1",
    name: "Crate",
    root: {
      id: "prefab-root",
      name: "Root",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "prefab-component",
        typeId: "com.codogma.crate",
        schemaVersion: 1,
        enabled: true,
        properties: {},
      }],
      children: [],
    },
  };
  const makeScene = (overrides: unknown[]) => ({
    schemaVersion: 1,
    id: "scene-prefab",
    name: "Scene",
    settings: {},
    rootNodes: [{
      id: "instance-node",
      name: "Crate Instance",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
      prefabInstance: { prefabId: "prefab-1", overrides },
    }],
  });
  const context = { prefabs: new Map([["prefab-1", prefab]]) };
  const valid = validateSceneDocument(makeScene([
    { targetNodeId: "prefab-root", propertyPath: "transform.x", value: 25 },
    { targetNodeId: "prefab-root", targetComponentId: "prefab-component", propertyPath: "enabled", value: false },
  ]), context);
  assert.equal(valid.valid, true);

  const invalid = validateSceneDocument(makeScene([
    { targetNodeId: "missing-node", propertyPath: "transform.x", value: 25 },
    { targetNodeId: "prefab-root", targetComponentId: "missing-component", propertyPath: "enabled", value: false },
  ]), context);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.diagnostics.filter((item) => item.code === "PROJECT_INVALID_REFERENCE").length, 2);
});

test("rejects malformed and duplicate Prefab overrides", () => {
  const scene = {
    schemaVersion: 1,
    id: "scene-prefab-invalid",
    name: "Scene",
    settings: {},
    rootNodes: [{
      id: "instance-node",
      name: "Crate Instance",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
      prefabInstance: {
        prefabId: "prefab-1",
        overrides: [
          { targetNodeId: "node", propertyPath: "x", value: 1 },
          { targetNodeId: "node", propertyPath: "x", value: 2 },
          { targetNodeId: "", propertyPath: "", value: null },
        ],
      },
    }],
  };
  const result = validateSceneDocument(scene);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.some((item) => item.code === "PROJECT_DUPLICATE_ID"), true);
  assert.equal(result.diagnostics.some((item) => item.code === "SCENE_INVALID_NODE"), true);
});

test("rejects malformed optional Asset sub-resource identifiers", () => {
  const asset = validProject.assets[0];
  assert.ok(asset);

  const invalidNumber = validateProjectDocument({
    ...validProject,
    assets: [{ ...asset, subResourceId: 42 }],
  });
  const invalidEmpty = validateProjectDocument({
    ...validProject,
    assets: [{ ...asset, subResourceId: "   " }],
  });

  assert.equal(invalidNumber.valid, false);
  assert.equal(invalidNumber.diagnostics.some((item) => item.path === "assets[0]"), true);
  assert.equal(invalidEmpty.valid, false);
  assert.equal(invalidEmpty.diagnostics.some((item) => item.path === "assets[0]"), true);
});


test("enforces one stable ID grammar across project, scene and component contracts", () => {
  for (const id of [
    "project-1",
    "com.codogma.player",
    "legacy.user-component:MyClass$1",
    "550e8400-e29b-41d4-a716-446655440000",
  ]) {
    assert.equal(isValidStableId(id), true, "expected valid stable ID: " + id);
  }
  for (const id of ["", " leading", "trailing ", "node/child", "../node", "node\\child"]) {
    assert.equal(isValidStableId(id), false, "expected invalid stable ID: " + id);
  }

  assert.equal(validateProjectDocument({ ...validProject, id: "project/invalid" }).valid, false);
  assert.equal(validateSceneDocument({
    schemaVersion: 1,
    id: "scene/invalid",
    name: "Invalid Scene",
    rootNodes: [],
    settings: {},
  }).valid, false);
  assert.equal(validateComponentTypeSchema({
    schemaVersion: 1,
    typeId: "com/codogma.invalid",
    name: "Invalid Component",
    version: "1.0.0",
    properties: {},
  }).valid, false);
});


test("Project migration deep-copies JSON values and never aliases or mutates the source", () => {
  const input = {
    schemaVersion: 0,
    id: "legacy-project-copy",
    name: "Copy test",
    scenes: [],
    assets: [],
    nestedPluginData: { values: [1, 2, 3] },
  };
  const before = JSON.stringify(input);
  const result = migrateProjectDocument(input);
  assert.equal(JSON.stringify(input), before);

  const migratedExtension = (result.document as unknown as Record<string, unknown>).nestedPluginData as { values: number[] };
  assert.notEqual(migratedExtension, input.nestedPluginData);
  migratedExtension.values.push(4);
  assert.deepEqual(input.nestedPluginData.values, [1, 2, 3]);
});

test("Project v0 migration rejects malformed present fields instead of silently defaulting them", () => {
  const base = {
    schemaVersion: 0,
    id: "legacy-project-malformed",
    name: "Malformed legacy project",
  };
  const malformedFields: Array<[string, unknown]> = [
    ["scenes", { unexpected: true }],
    ["assets", "not-an-array"],
    ["prefabs", 1],
    ["componentModules", null],
    ["runtime", "phaser"],
    ["runtime", { adapterId: "phaser", settings: "not-an-object" }],
    ["runtime", { adapterId: "", settings: {} }],
  ];

  for (const [field, value] of malformedFields) {
    const input = field === "runtime" && typeof value === "object" && value !== null
      ? { ...base, runtime: value }
      : { ...base, [field]: value };
    assert.throws(
      () => migrateProjectDocument(input),
      (error: unknown): boolean => {
        if (!(error instanceof Error) || !("diagnostics" in error)) return false;
        const diagnostics = (error as Error & {
          diagnostics: Array<{ code?: string; path?: string }>;
        }).diagnostics;
        return diagnostics.some((item) =>
          item.code === "PROJECT_MIGRATION_INVALID_INPUT" &&
          (item.path === field || item.path === "runtime.settings" || item.path === "runtime"));
      },
    );
  }
});
test("Project v0 migration defaults only absent optional collections and runtime fields", () => {
  const migrated = migrateProjectDocument({
    schemaVersion: 0,
    id: "legacy-project-defaults",
    name: "Defaults",
  });
  assert.deepEqual(migrated.document.scenes, []);
  assert.deepEqual(migrated.document.assets, []);
  assert.deepEqual(migrated.document.prefabs, []);
  assert.deepEqual(migrated.document.componentModules, []);
  assert.deepEqual(migrated.document.runtime, { adapterId: "phaser", settings: {} });

  const withRuntime = migrateProjectDocument({
    schemaVersion: 0,
    id: "legacy-project-runtime",
    name: "Runtime",
    runtime: { adapterId: "phaser", pluginRuntimeData: { keep: true } },
  });
  assert.deepEqual(withRuntime.document.runtime.settings, {});
  assert.deepEqual((withRuntime.document.runtime as unknown as Record<string, unknown>).pluginRuntimeData, { keep: true });
});


test("Project migration rejects future schema versions without modifying source data", () => {
  const future = {
    ...validProject,
    schemaVersion: 2,
    futureExtension: { nested: ["keep", true] },
  };
  const before = JSON.stringify(future);
  assert.throws(
    () => migrateProjectDocument(future),
    (error: unknown) => error instanceof Error &&
      "diagnostics" in error &&
      (error as Error & { diagnostics: Array<{ code?: string; path?: string }> })
        .diagnostics.some((item) =>
          item.code === "PROJECT_UNSUPPORTED_VERSION" &&
          item.path === "schemaVersion"),
  );
  assert.equal(JSON.stringify(future), before);
});
