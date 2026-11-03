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
  validatePrefabDocument,
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
  assert.equal(invalidNumber.diagnostics.some((item) => item.path === "assets[0].subResourceId"), true);
  assert.equal(invalidEmpty.valid, false);
  assert.equal(invalidEmpty.diagnostics.some((item) => item.path === "assets[0].subResourceId"), true);
});


test("validates a stable Component Module manifest and resolves source script Assets", () => {
  const project = {
    ...validProject,
    assets: [
      ...validProject.assets,
      { id: "asset-follow-target-module", path: "src/FollowTarget.ts", kind: "script" },
    ],
    componentModules: [{
      id: "module-follow-target",
      moduleAssetId: "asset-follow-target-module",
      version: "1.2.0",
      exports: [
        { typeId: "com.codogma.follow-target", schemaVersion: 1 },
        { typeId: "com.codogma.follow-camera", schemaVersion: 2 },
      ],
    }],
  };
  const result = validateProjectDocument(project);

  assert.equal(result.valid, true);
  assert.equal(result.value?.componentModules[0]?.id, "module-follow-target");
  assert.equal(result.value?.componentModules[0]?.moduleAssetId, "asset-follow-target-module");
  assert.deepEqual(result.value?.componentModules[0]?.exports, project.componentModules[0]?.exports);
});

test("rejects duplicate module identities and component type exports across modules", () => {
  const scriptAsset = { id: "asset-module", path: "src/components.ts", kind: "script" as const };
  const module = {
    id: "module-a",
    moduleAssetId: scriptAsset.id,
    version: "1.0.0",
    exports: [{ typeId: "com.codogma.player", schemaVersion: 1 }],
  };
  const duplicateModule = validateProjectDocument({
    ...validProject,
    assets: [...validProject.assets, scriptAsset],
    componentModules: [module, { ...module, exports: [{ typeId: "com.codogma.enemy", schemaVersion: 1 }] }],
  });
  assert.equal(duplicateModule.valid, false);
  assert.equal(duplicateModule.diagnostics.some((item) =>
    item.code === "PROJECT_DUPLICATE_ID" && item.path === "componentModules[1].id"), true);

  const duplicateType = validateProjectDocument({
    ...validProject,
    assets: [...validProject.assets, scriptAsset, { id: "asset-module-2", path: "src/other.ts", kind: "script" }],
    componentModules: [
      module,
      { id: "module-b", moduleAssetId: "asset-module-2", version: "1.0.0", exports: [{ typeId: "com.codogma.player", schemaVersion: 2 }] },
    ],
  });
  assert.equal(duplicateType.valid, false);
  assert.equal(duplicateType.diagnostics.some((item) =>
    item.code === "PROJECT_DUPLICATE_ID" && item.path === "componentModules[1].exports[0].typeId"), true);
});

test("rejects invalid Module export schema versions and non-script source assets", () => {
  const imageAsset = { id: "asset-image", path: "assets/player.png", kind: "image" as const };
  const invalidSchemaVersion = validateProjectDocument({
    ...validProject,
    assets: [...validProject.assets, imageAsset],
    componentModules: [{
      id: "module-player",
      moduleAssetId: imageAsset.id,
      version: "1.0.0",
      exports: [{ typeId: "com.codogma.player", schemaVersion: 0 }],
    }],
  });
  assert.equal(invalidSchemaVersion.valid, false);
  assert.equal(invalidSchemaVersion.diagnostics.some((item) =>
    item.code === "PROJECT_INVALID_DOCUMENT" && item.path === "componentModules[0].exports[0]"), true);
  assert.equal(invalidSchemaVersion.diagnostics.some((item) =>
    item.code === "PROJECT_INVALID_REFERENCE" && item.path === "componentModules[0].moduleAssetId"), true);
});

test("preserves unknown Project and Asset fields with structured warnings", () => {
  const project = JSON.parse(JSON.stringify(validProject)) as Record<string, unknown>;
  project.pluginEnvelope = { plugin: "example", revision: 2 };
  const assets = project.assets as Array<Record<string, unknown>>;
  assets[0] = { ...assets[0], importMetadata: { source: "atlas", page: 1 } };

  const result = validateProjectDocument(project);
  assert.equal(result.valid, true);
  assert.deepEqual((result.value as unknown as Record<string, unknown>).pluginEnvelope, project.pluginEnvelope);
  assert.equal(result.diagnostics.some((item) =>
    item.code === "PROJECT_UNKNOWN_FIELD_PRESERVED" && item.path === "project.pluginEnvelope"), true);
  assert.equal(result.diagnostics.some((item) =>
    item.code === "PROJECT_UNKNOWN_FIELD_PRESERVED" && item.path === "assets[0].importMetadata"), true);
});

test("requires stable opaque IDs and rejects whitespace/control characters", () => {
  const invalidProject = validateProjectDocument({
    ...validProject,
    id: "project with spaces",
  });
  assert.equal(invalidProject.valid, false);
  assert.equal(invalidProject.diagnostics.some((item) => item.path === "id"), true);

  const invalidAsset = validateProjectDocument({
    ...validProject,
    assets: [{ id: "assets/../image", path: "assets/player.png", kind: "image" }],
  });
  assert.equal(invalidAsset.valid, false);
  assert.equal(invalidAsset.diagnostics.some((item) => item.path === "assets[0].id"), true);
});

test("preserves unknown Scene, Node, Transform and Component extension fields with diagnostics", () => {
  const scene = {
    schemaVersion: 1,
    id: "scene-extension",
    name: "Extension",
    settings: {},
    pluginSceneData: { cameraPreset: "portrait" },
    rootNodes: [{
      id: "node-extension",
      name: "Sprite",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5, pluginAnchor: "center" },
      components: [{
        id: "component-extension",
        typeId: "com.codogma.sprite",
        schemaVersion: 1,
        enabled: true,
        properties: {},
        pluginComponentData: { revision: 3 },
      }],
      children: [],
      pluginNodeData: ["preserve"],
    }],
  };
  const result = validateSceneDocument(scene);
  assert.equal(result.valid, true);
  assert.deepEqual((result.value as unknown as Record<string, unknown>).pluginSceneData, { cameraPreset: "portrait" });
  assert.equal(result.diagnostics.some((item) => item.path === "scene.pluginSceneData"), true);
  assert.equal(result.diagnostics.some((item) => item.path === "rootNodes[0].pluginNodeData"), true);
  assert.equal(result.diagnostics.some((item) => item.path === "rootNodes[0].transform.pluginAnchor"), true);
  assert.equal(result.diagnostics.some((item) => item.path === "rootNodes[0].components[0].pluginComponentData"), true);
});

test("rejects malformed Scene identity before serializing its hierarchy", () => {
  const result = validateSceneDocument({
    schemaVersion: 1,
    id: "scene / outside",
    name: "Invalid ID",
    settings: {},
    rootNodes: [],
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0]?.code, "SCENE_INVALID_NODE");
});


test("rejects unknown Project extension values that are not JSON-compatible", () => {
  const project = {
    ...validProject,
    pluginPayload: new Date(),
  };
  const result = validateProjectDocument(project);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.some((item) =>
    item.code === "PROJECT_INVALID_DOCUMENT"), true);
});


test("reports stable ID errors at the Scene and Prefab identity fields", () => {
  const invalidScene = validateSceneDocument({
    schemaVersion: 1,
    id: "scene with spaces",
    name: "Bad Scene",
    rootNodes: [],
    settings: {},
  });
  assert.equal(invalidScene.valid, false);
  assert.equal(invalidScene.diagnostics[0]?.path, "id");

  const invalidPrefab = validatePrefabDocument({
    schemaVersion: 1,
    id: "prefab/with/path",
    name: "Bad Prefab",
    root: {
      id: "root-node",
      name: "Root",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    },
  });
  assert.equal(invalidPrefab.valid, false);
  assert.equal(invalidPrefab.diagnostics[0]?.path, "id");
});


test("reports future Project, Scene and Prefab schema versions explicitly", () => {
  const futureProject = validateProjectDocument({
    schemaVersion: 9,
    id: "project-future",
    name: "Future",
    scenes: [],
    assets: [],
    prefabs: [],
    componentModules: [],
    runtime: { adapterId: "phaser", settings: {} },
  });
  const futureScene = validateSceneDocument({
    schemaVersion: 9,
    id: "scene-future",
    name: "Future",
    rootNodes: [],
    settings: {},
  });
  const futurePrefab = validatePrefabDocument({
    schemaVersion: 9,
    id: "prefab-future",
    name: "Future",
    root: {
      id: "future-root",
      name: "Root",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    },
  });

  assert.equal(futureProject.valid, false);
  assert.equal(futureProject.diagnostics[0]?.code, "PROJECT_UNSUPPORTED_VERSION");
  assert.equal(futureProject.diagnostics[0]?.path, "schemaVersion");
  assert.equal(futureScene.valid, false);
  assert.equal(futureScene.diagnostics[0]?.code, "PROJECT_UNSUPPORTED_VERSION");
  assert.equal(futureScene.diagnostics[0]?.path, "schemaVersion");
  assert.equal(futurePrefab.valid, false);
  assert.equal(futurePrefab.diagnostics[0]?.code, "PROJECT_UNSUPPORTED_VERSION");
  assert.equal(futurePrefab.diagnostics[0]?.path, "schemaVersion");
});

test("Project migration deep-copies JSON data and does not mutate or alias its source", () => {
  const input = {
    schemaVersion: 0,
    id: "legacy-project-copy",
    name: "Copy test",
    scenes: [],
    assets: [],
    nestedPluginData: { values: [1, 2, 3] },
  };
  const sourceSnapshot = JSON.stringify(input);
  const result = migrateProjectDocument(input);

  assert.equal(JSON.stringify(input), sourceSnapshot);
  assert.notEqual(
    (result.document as unknown as Record<string, unknown>).nestedPluginData,
    input.nestedPluginData,
  );
  const migratedNested = (result.document as unknown as Record<string, unknown>).nestedPluginData as { values: number[] };
  migratedNested.values.push(4);
  assert.deepEqual(input.nestedPluginData.values, [1, 2, 3]);
});

test("rejects legacy Project migration inputs that are not JSON-compatible", () => {
  const invalid = {
    schemaVersion: 0,
    id: "legacy-project",
    name: "Bad",
    nested: new Date(),
  };
  assert.throws(
    () => migrateProjectDocument(invalid),
    (error: unknown) => error instanceof Error &&
      "diagnostics" in error &&
      Array.isArray((error as { diagnostics: unknown }).diagnostics) &&
      ((error as { diagnostics: Array<{ code?: string }> }).diagnostics[0]?.code === "PROJECT_INVALID_DOCUMENT"),
  );
});


test("rejects cyclic Scene Node object graphs without recursing indefinitely", () => {
  const root: Record<string, unknown> = {
    id: "node-cycle",
    name: "Cycle",
    active: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    components: [],
    children: [],
  };
  root.children = [root];
  const result = validateSceneDocument({
    schemaVersion: 1,
    id: "scene-cycle",
    name: "Cycle",
    settings: {},
    rootNodes: [root],
  });

  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.some((item) =>
    item.code === "SCENE_INVALID_NODE" &&
    item.path === "rootNodes[0].children[0]"), true);
});
