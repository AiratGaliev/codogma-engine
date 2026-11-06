import assert from "node:assert/strict";
import { test as testCase } from "vitest";
import type { PrefabDocumentV1, SceneDocumentV1 } from "@codogma/cge";
import {
  BUILTIN_COMPONENT_TYPES,
  createSceneNode,
  findSceneNode,
  getSceneNodeEntries,
  isPrefabDocument,
  removeSceneNode,
  reparentSceneNode,
  updateSceneNode,
} from "../src/domain/native-scene-model.js";

function scene(): SceneDocumentV1 {
  return {
    schemaVersion: 1,
    id: "scene-main",
    name: "Main",
    settings: {},
    rootNodes: [{
      id: "node-root",
      name: "Root",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "component-root-renderer",
        typeId: BUILTIN_COMPONENT_TYPES.container,
        schemaVersion: 1,
        enabled: true,
        properties: {},
      }],
      children: [{
        id: "node-child",
        name: "Child",
        active: true,
        transform: { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [{
          id: "component-child-renderer",
          typeId: BUILTIN_COMPONENT_TYPES.imageRenderer,
          schemaVersion: 1,
          enabled: true,
          properties: { assetId: "asset-hero" },
        }],
        children: [],
      }],
    }],
  };
}

testCase("projects native Node and Transform data into a transient Scene viewport view", () => {
  const entries = getSceneNodeEntries(scene());
  assert.deepEqual(entries.map((entry) => [entry.id, entry.parentId, entry.depth, entry.type]), [
    ["node-root", null, 0, "Container"],
    ["node-child", "node-root", 1, "Image"],
  ]);
  assert.equal(entries[1]?.source.texture?.key, "asset-hero");
  assert.equal(entries[1]?.source.x, 10);
  assert.equal("displayList" in scene(), false);
  assert.equal("plainObjects" in scene(), false);
});

testCase("creates native Nodes with explicit, stable built-in component TypeIds and independent instance identities", () => {
  const next = createSceneNode(scene(), "Text") as SceneDocumentV1;
  const created = next.rootNodes[1];
  assert.ok(created);
  assert.equal(created.name, "New Text");
  assert.equal(created.components[0]?.typeId, BUILTIN_COMPONENT_TYPES.textRenderer);
  assert.equal(created.components[0]?.schemaVersion, 1);
  assert.ok(created.components[0]?.id);
  assert.notEqual(created.id, created.components[0]?.id);
  assert.deepEqual(created.children, []);
});

testCase("edits native Transform and renderer properties immutably", () => {
  const original = scene();
  const next = updateSceneNode(original, "node-child", { x: 48, rotation: 30, text: "not applied to image" }) as SceneDocumentV1;
  const originalChild = findSceneNode(original, "node-child");
  const updatedChild = findSceneNode(next, "node-child");
  assert.equal(originalChild?.transform.x, 10);
  assert.equal(updatedChild?.transform.x, 48);
  assert.equal(updatedChild?.components[0]?.properties.assetId, "asset-hero");
});

testCase("reparents native Nodes and rejects cycles", () => {
  const original = scene();
  const withSibling = createSceneNode(original, "Image") as SceneDocumentV1;
  const sibling = withSibling.rootNodes[1];
  assert.ok(sibling);
  const nested = reparentSceneNode(withSibling, sibling.id, "node-root") as SceneDocumentV1;
  assert.equal(nested.rootNodes.length, 1);
  assert.equal(nested.rootNodes[0]?.children.length, 2);
  assert.throws(() => reparentSceneNode(nested, "node-root", sibling.id), /own subtree/);
});

testCase("removes only the requested Node and preserves sibling and component identities", () => {
  const original = scene();
  const next = removeSceneNode(original, "node-child") as SceneDocumentV1;
  assert.equal(next.rootNodes[0]?.children.length, 0);
  assert.equal(findSceneNode(original, "node-child")?.id, "node-child");
  assert.throws(() => removeSceneNode(original, "missing"), /was not found/);
});

testCase("edits native Prefab root and protects its single-root invariant", () => {
  const prefab: PrefabDocumentV1 = {
    schemaVersion: 1,
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
  assert.equal(isPrefabDocument(prefab), true);
  const next = createSceneNode(prefab, "Image") as PrefabDocumentV1;
  assert.equal(next.root.children.length, 1);
  assert.throws(() => removeSceneNode(prefab, "node-crate"), /root Node/);
});
