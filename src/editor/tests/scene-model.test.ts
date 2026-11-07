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
} from "../src/domain/scene-model.js";

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
  const next = updateSceneNode(original, "node-child", { x: 48, rotation: 30 }) as SceneDocumentV1;
  const originalChild = findSceneNode(original, "node-child");
  const updatedChild = findSceneNode(next, "node-child");
  assert.equal(originalChild?.transform.x, 10);
  assert.equal(updatedChild?.transform.x, 48);
  assert.equal(updatedChild?.components[0]?.properties.assetId, "asset-hero");
});

testCase("projects inactive native Nodes as inactive viewport entries", () => {
  const inactive = updateSceneNode(scene(), "node-child", { active: false }) as SceneDocumentV1;
  const entry = getSceneNodeEntries(inactive).find((item) => item.id === "node-child");
  assert.equal(entry?.source.active, false);
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


testCase("updates native Image Asset references through the renderer component", () => {
  const imageScene = createSceneNode(scene(), "Image", "asset-player-sprite") as SceneDocumentV1;
  const node = findSceneNode(imageScene, getSceneNodeEntries(imageScene).at(-1)!.id)!;
  const updated = updateSceneNode(imageScene, node.id, { assetId: "asset-background" }) as SceneDocumentV1;
  const renderer = findSceneNode(updated, node.id)!.components.find((component) => component.typeId === BUILTIN_COMPONENT_TYPES.imageRenderer);
  assert.equal(renderer?.properties.assetId, "asset-background");
});

testCase("validates Scene Node patch fields and renderer-specific values before mutating the document", () => {
  const original = scene();
  const imageId = "node-child";
  const textScene = createSceneNode(original, "Text") as SceneDocumentV1;
  const textId = textScene.rootNodes[1]!.id;

  assert.throws(() => updateSceneNode(original, imageId, { unknownField: true } as never), /Unsupported Scene Node patch field/);
  assert.throws(() => updateSceneNode(original, imageId, { active: "false" } as never), /active must be a boolean/);
  assert.throws(() => updateSceneNode(original, imageId, { alpha: 1.1 }), /alpha must be a finite number between 0 and 1/);
  assert.throws(() => updateSceneNode(original, imageId, { alpha: Number.NaN }), /alpha must be a finite number between 0 and 1/);
  assert.throws(() => updateSceneNode(original, imageId, { depth: Number.POSITIVE_INFINITY }), /depth must be a finite number/);
  assert.throws(() => updateSceneNode(original, imageId, { text: "wrong renderer" }), /does not have a Text Renderer/);
  assert.throws(() => updateSceneNode(textScene, textId, { assetId: "asset-hero" }), /does not have an Image Renderer/);
  assert.throws(() => updateSceneNode(textScene, textId, { align: "justify" }), /align must be "left", "center" or "right"/);
  assert.throws(() => updateSceneNode(textScene, textId, { wordWrapWidth: -1 }), /wordWrapWidth must be a finite non-negative number/);
  assert.throws(() => updateSceneNode(original, imageId, { assetId: "invalid asset id" }), /stable Asset ID/);

  const updatedText = updateSceneNode(textScene, textId, {
    text: "Native text",
    fontFamily: "Arial",
    fontSize: "18px",
    color: "#ffffff",
    align: "center",
    wordWrapWidth: 320,
  }) as SceneDocumentV1;
  const updatedNode = findSceneNode(updatedText, textId)!;
  assert.equal(updatedNode.components[0]?.properties.text, "Native text");
  assert.equal(updatedNode.components[0]?.properties.align, "center");

  // The Inspector edits names one keystroke at a time, so an intermediate
  // empty string must remain possible; Core validation rejects it on save.
  const editingName = updateSceneNode(original, imageId, { label: "" }) as SceneDocumentV1;
  assert.equal(findSceneNode(editingName, imageId)?.name, "");
});
