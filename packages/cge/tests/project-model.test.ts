import assert from "node:assert/strict";
import test from "node:test";
import {
  migrateProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
  validateProjectDocument,
  validateSceneDocument,
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
