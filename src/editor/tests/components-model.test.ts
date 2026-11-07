import assert from "node:assert/strict";
import { test as testCase } from "vitest";
import type { ProjectDocumentV1, SceneDocumentV1 } from "@codogma/cge";
import {
  attachNativeComponent,
  detachNativeComponent,
  getNativeComponentInstances,
  setNativeComponentEnabled,
  updateNativeComponentProperties,
} from "../src/domain/components-model.js";
import { findSceneNode } from "../src/domain/scene-model.js";

const project: ProjectDocumentV1 = {
  schemaVersion: 1,
  id: "project-native",
  name: "Native",
  scenes: [{ id: "scene-native", assetId: "asset-scene" }],
  assets: [
    { id: "asset-scene", path: "scenes/Main.cge-scene.json", kind: "scene" },
    { id: "asset-script", path: "src/Health.ts", kind: "script" },
  ],
  prefabs: [],
  componentModules: [{ typeId: "com.example.health", moduleAssetId: "asset-script", version: "1.0.0" }],
  runtime: { adapterId: "phaser", settings: {} },
};

function scene(): SceneDocumentV1 {
  return {
    schemaVersion: 1,
    id: "scene-native",
    name: "Main",
    settings: {},
    rootNodes: [{
      id: "node-player",
      name: "Player",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    }],
  };
}

testCase("attaches a registered component with stable type identity and independent instance identity", () => {
  const original = scene();
  const next = attachNativeComponent(original, "node-player", "com.example.health", { project }) as SceneDocumentV1;
  const node = findSceneNode(next, "node-player");
  assert.equal(node?.components.length, 1);
  assert.equal(node?.components[0]?.typeId, "com.example.health");
  assert.equal(node?.components[0]?.enabled, true);
  assert.notEqual(node?.components[0]?.id, node?.components[0]?.typeId);
  assert.deepEqual(getNativeComponentInstances(node!, { project }).map((item) => item.id), [node?.components[0]?.id]);
  assert.deepEqual(findSceneNode(original, "node-player")?.components, []);
});

testCase("prevents duplicate attachment of the same Component type to one Node", () => {
  const first = attachNativeComponent(scene(), "node-player", "com.example.health", { project }) as SceneDocumentV1;
  assert.throws(
    () => attachNativeComponent(first, "node-player", "com.example.health", { project }),
    /already attached/,
  );
  const secondNodeScene: SceneDocumentV1 = {
    ...first,
    rootNodes: [...first.rootNodes, {
      id: "node-enemy",
      name: "Enemy",
      active: true,
      transform: { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    }],
  };
  const next = attachNativeComponent(secondNodeScene, "node-enemy", "com.example.health", { project }) as SceneDocumentV1;
  assert.equal(findSceneNode(next, "node-enemy")?.components[0]?.typeId, "com.example.health");
  assert.notEqual(
    findSceneNode(next, "node-player")?.components[0]?.id,
    findSceneNode(next, "node-enemy")?.components[0]?.id,
  );
});

testCase("rejects component IDs that are not registered by the native Project manifest", () => {
  assert.throws(() => attachNativeComponent(scene(), "node-player", "Health", { project }), /not registered/);
  assert.throws(() => attachNativeComponent(scene(), "node-player", "com.example.unknown", { project }), /not registered/);
});

testCase("updates properties and enabled state by instanceId, never by display name", () => {
  let current = attachNativeComponent(scene(), "node-player", "com.example.health", { project }, { hp: 100 }) as SceneDocumentV1;
  const instance = findSceneNode(current, "node-player")?.components[0];
  assert.ok(instance);
  current = updateNativeComponentProperties(current, "node-player", instance.id, { hp: 75, armor: true }, { project }) as SceneDocumentV1;
  current = setNativeComponentEnabled(current, "node-player", instance.id, false) as SceneDocumentV1;
  const updated = findSceneNode(current, "node-player")?.components[0];
  assert.deepEqual(updated?.properties, { hp: 75, armor: true });
  assert.equal(updated?.enabled, false);
});

testCase("detaches only the selected instance and rejects malformed property payloads", () => {
  let current = attachNativeComponent(scene(), "node-player", "com.example.health", { project }) as SceneDocumentV1;
  const instance = findSceneNode(current, "node-player")?.components[0];
  assert.ok(instance);
  current = detachNativeComponent(current, "node-player", instance.id) as SceneDocumentV1;
  assert.deepEqual(findSceneNode(current, "node-player")?.components, []);
  assert.throws(() => updateNativeComponentProperties(current, "node-player", instance.id, { value: undefined }, { project }), /not found/);
  assert.throws(() => attachNativeComponent(scene(), "node-player", "com.example.health", { project }, { value: undefined }), /JSON-compatible/);
});
