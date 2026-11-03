import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  migrateProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
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
