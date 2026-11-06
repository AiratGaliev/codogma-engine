import assert from "node:assert/strict";
import { test as testCase } from "vitest";
import type { NodeDocument, PrefabDocumentV1, ProjectDocumentV1, SceneDocumentV1 } from "@codogma/cge";
import {
  addNativePrefabInstance,
  addNativePrefabOverride,
  createNativePrefabDocument,
  createNativePrefabInstanceNode,
  registerNativePrefab,
  resolveNativePrefabRoot,
} from "../src/domain/native-prefab-model.js";

const root: NodeDocument = {
  id: "node-crate",
  name: "Crate",
  active: true,
  transform: { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
  components: [{
    id: "component-renderer",
    typeId: "com.codogma.renderer.image",
    schemaVersion: 1,
    enabled: true,
    properties: { assetId: "asset-crate", tint: "#ffffff" },
  }],
  children: [],
};

const project: ProjectDocumentV1 = {
  schemaVersion: 1,
  id: "project-prefab",
  name: "Prefab",
  scenes: [{ id: "scene-main", assetId: "asset-scene" }],
  assets: [{ id: "asset-scene", path: "scenes/Main.cge-scene.json", kind: "scene" }],
  prefabs: [],
  componentModules: [],
  runtime: { adapterId: "phaser", settings: {} },
};

const scene: SceneDocumentV1 = {
  schemaVersion: 1,
  id: "scene-main",
  name: "Main",
  settings: {},
  rootNodes: [],
};

testCase("creates a native Prefab document from an existing native Node", () => {
  const prefab = createNativePrefabDocument(root, "Crate");
  assert.equal(prefab.schemaVersion, 1);
  assert.equal(prefab.name, "Crate");
  assert.equal(prefab.root.id, root.id);
  assert.notEqual(prefab.id, root.id);
});

testCase("registers Prefabs only through explicit Project asset and prefab references", () => {
  const prefab: PrefabDocumentV1 = createNativePrefabDocument(root);
  const next = registerNativePrefab(project, prefab, "asset-prefab", "prefabs/Crate.cge-prefab.json");
  assert.deepEqual(next.prefabs, [{ id: prefab.id, assetId: "asset-prefab" }]);
  assert.equal(next.assets.find((asset) => asset.id === "asset-prefab")?.kind, "prefab");
  assert.throws(() => registerNativePrefab(next, prefab, "asset-prefab-2", "prefabs/Other.cge-prefab.json"), /already registered/);
});

testCase("creates a native Prefab instance with a distinct Node id and explicit source reference", () => {
  const prefab = createNativePrefabDocument(root);
  const instance = createNativePrefabInstanceNode(prefab, { x: 100, y: 200 });
  assert.notEqual(instance.id, prefab.root.id);
  assert.deepEqual(instance.prefabInstance, { prefabId: prefab.id, sourceNodeId: prefab.root.id, overrides: [] });
  assert.equal(instance.transform.x, 100);
  const next = addNativePrefabInstance(scene, prefab, { x: 100, y: 200 });
  assert.equal(next.rootNodes[0]?.prefabInstance?.prefabId, prefab.id);
});

testCase("preserves full Transform and inserts a replacement Prefab instance at the original parent", () => {
  const prefab = createNativePrefabDocument(root);
  const sceneWithParent: SceneDocumentV1 = {
    ...scene,
    rootNodes: [{
      id: "node-parent",
      name: "Parent",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    }],
  };
  const transform = { ...root.transform, x: 120, y: 240, rotation: 0.75, scaleX: 2, scaleY: 1.5, originX: 0.25, originY: 0.75 };
  const nested = addNativePrefabInstance(sceneWithParent, prefab, {
    name: "Nested Crate",
    transform,
    parentId: "node-parent",
  });
  const instance = nested.rootNodes[0]?.children[0];
  assert.ok(instance?.prefabInstance);
  assert.equal(instance.name, "Nested Crate");
  assert.deepEqual(instance.transform, transform);
  assert.equal(nested.rootNodes.length, 1);
  assert.equal(nested.rootNodes[0]?.children.length, 1);
  assert.throws(() => addNativePrefabInstance(sceneWithParent, prefab, { parentId: "missing" }), /parent Node/);
});

testCase("applies native component property overrides without mutating the Prefab source", () => {
  const prefab = createNativePrefabDocument(root);
  const instance = createNativePrefabInstanceNode(prefab);
  const withInstance: SceneDocumentV1 = { ...scene, rootNodes: [instance] };
  const updated = addNativePrefabOverride(withInstance, instance.id, prefab, {
    targetNodeId: root.id,
    targetComponentId: "component-renderer",
    propertyPath: "tint",
    value: "#ff0000",
  });
  const updatedInstance = updated.rootNodes[0]!;
  const resolved = resolveNativePrefabRoot(updatedInstance, prefab);
  assert.equal(resolved.components[0]?.properties.tint, "#ff0000");
  assert.equal(prefab.root.components[0]?.properties.tint, "#ffffff");
});

testCase("rejects unknown target nodes, unknown component ids and malformed property paths", () => {
  const prefab = createNativePrefabDocument(root);
  const instance = createNativePrefabInstanceNode(prefab);
  const withInstance: SceneDocumentV1 = { ...scene, rootNodes: [instance] };
  assert.throws(() => addNativePrefabOverride(withInstance, instance.id, prefab, {
    targetNodeId: "missing",
    propertyPath: "name",
    value: "Renamed",
  }), /not found/);
  assert.throws(() => addNativePrefabOverride(withInstance, instance.id, prefab, {
    targetNodeId: root.id,
    targetComponentId: "missing-component",
    propertyPath: "tint",
    value: "#fff",
  }), /not found/);
  const overridden = addNativePrefabOverride(withInstance, instance.id, prefab, {
    targetNodeId: root.id,
    propertyPath: "transform.x",
    value: "invalid",
  });
  assert.throws(() => resolveNativePrefabRoot(overridden.rootNodes[0]!, prefab), /Transform field/);
});
