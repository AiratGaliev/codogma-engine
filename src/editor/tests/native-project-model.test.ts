import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import testCase from "node:test";
import {
  addNativePrefabReference,
  findPrefabReferenceByAssetPath,
  findSceneReferenceByAssetPath,
  getNativeScriptModules,
  parseNativePrefabDocument,
  parseNativeProjectDocument,
  parseNativeSceneDocument,
  resolvePrefabAsset,
  resolveSceneAsset,
  serializeNativeProjectDocument,
  serializeNativeSceneDocument,
} from "../src/domain/native-project-model.js";

const fixtureRoot = resolve(process.cwd(), "../packages/cge/tests/fixtures/acceptance-project");
const project = parseNativeProjectDocument(readFileSync(resolve(fixtureRoot, "project.json"), "utf8"));
const sceneContent = readFileSync(resolve(fixtureRoot, "scenes/Level.cge-scene.json"), "utf8");

testCase("loads the native project manifest and resolves scene, script and asset references by stable ids", () => {
  assert.equal(resolveSceneAsset(project, "scene-level").path, "scenes/Level.cge-scene.json");
  assert.equal(resolveSceneAsset(project, "scene-level").kind, "scene");
  assert.deepEqual(getNativeScriptModules(project), [{
    typeId: "com.codogma.acceptance.follow-target",
    version: "1.0.0",
    assetId: "asset-follow-target-module",
    path: "src/FollowTarget.ts",
  }]);
  assert.equal(findSceneReferenceByAssetPath(project, "scenes/Level.cge-scene.json")?.id, "scene-level");
  assert.equal(findSceneReferenceByAssetPath(project, "scenes/level.scene"), undefined);
});

testCase("parses and serializes the native Scene contract without changing manifest identity", () => {
  const scene = parseNativeSceneDocument(project, "scene-level", sceneContent);
  assert.equal(scene.schemaVersion, 1);
  assert.equal(scene.id, "scene-level");
  assert.equal(scene.rootNodes[0]?.id, "node-player");
  assert.equal(JSON.parse(serializeNativeSceneDocument(project, scene)).id, "scene-level");
});

testCase("rejects unpublished or unsupported document shapes at the native boundary", () => {
  assert.throws(() => parseNativeProjectDocument(JSON.stringify({
    schemaVersion: 1,
    id: "old",
    name: "Old",
    scenes: [],
    assets: [],
    prefabs: [],
    componentModules: [],
    runtime: { adapterId: "phaser", settings: {} },
    displayList: [],
  })), /Project document is invalid/);

  assert.throws(() => parseNativeSceneDocument(project, "scene-level", JSON.stringify({
    id: "scene-level",
    sceneType: "SCENE",
    displayList: [],
    plainObjects: [],
  })), /Scene "scene-level" is invalid/);
  assert.throws(() => parseNativeSceneDocument(project, "missing-scene", sceneContent), /not registered in project.json/);
});

testCase("rejects mismatched manifest identity and non-native file extension", () => {
  assert.throws(() => parseNativeSceneDocument(project, "scene-level", sceneContent.replace('"scene-level"', '"another-scene"')), /does not match document id/);
  const wrongExtensionProject = {
    ...project,
    assets: project.assets.map((asset) => asset.id === "asset-scene-level"
      ? { ...asset, path: "scenes/Level.scene" }
      : asset),
  };
  assert.throws(() => parseNativeSceneDocument(wrongExtensionProject, "scene-level", sceneContent), /must use the native/);
});

testCase("registers a native Prefab asset only through a validated Project manifest reference", () => {
  const prefab = {
    schemaVersion: 1 as const,
    id: "prefab-crate",
    name: "Crate",
    root: {
      id: "node-crate",
      name: "Crate",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    },
  };
  const next = addNativePrefabReference(project, prefab, "asset-prefab-crate", "prefabs/Crate.cge-prefab.json");
  assert.equal(resolvePrefabAsset(next, "prefab-crate").path, "prefabs/Crate.cge-prefab.json");
  assert.equal(findPrefabReferenceByAssetPath(next, "prefabs/Crate.cge-prefab.json")?.id, "prefab-crate");
  assert.throws(() => parseNativePrefabDocument(next, "prefab-crate", JSON.stringify({
    ...prefab,
    schemaVersion: 2,
  })), /not supported/);
  assert.throws(() => addNativePrefabReference(project, prefab, "asset-prefab-crate", "prefabs/Crate.scene"), /must use/);
});

testCase("does not duplicate an asset path or stable asset id while adding a Prefab", () => {
  const prefab = {
    schemaVersion: 1 as const,
    id: "prefab-another",
    name: "Another",
    root: {
      id: "node-another",
      name: "Another",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    },
  };
  assert.throws(() => addNativePrefabReference(project, prefab, "asset-scene-level", "prefabs/Another.cge-prefab.json"), /already registered/);
  assert.throws(() => addNativePrefabReference(project, prefab, "asset-new", "scenes/Level.cge-scene.json"), /already registered/);
});
