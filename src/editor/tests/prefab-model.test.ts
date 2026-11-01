import assert from "node:assert/strict";
import { test } from "vitest";
import type { SceneDocument } from "../src/domain/scene-model.ts";
import type { PrefabDocument } from "../src/domain/prefab-model.ts";
import {
  addPrefabProperty, createPrefabDocument, createPrefabInstance, getPrefabPropertyDefault,
  removePrefabProperty, resolvePrefabInstanceValues, updatePrefabProperty,
} from "../src/domain/prefab-model.ts";


function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Expected item at index ${index}.`);
  return item;
}

const scene: SceneDocument = {
  id: "scene-id",
  sceneType: "SCENE",
  settings: { sceneKey: "Level" },
  displayList: [{ id: "object-id", type: "Image", label: "dino", texture: { key: "dino" }, x: 20, y: 30, components: ["Tint"] }],
  plainObjects: [],
  meta: { contentType: "phasereditor2d.core.scene.SceneContentType", version: 5 },
};

test("creates a legacy-compatible PREFAB scene document from a selected object", () => {
  const prefab = createPrefabDocument(scene, at(scene.displayList, 0), "Dino");
  assert.equal(prefab.sceneType, "PREFAB");
  assert.equal(at(prefab.displayList, 0).texture?.key, "dino");
  assert.equal(at(prefab.displayList, 0).components?.[0], "Tint");
  assert.equal(prefab.settings.createMethodName, "");
  assert.equal(prefab.settings.sceneKey, "Level");
  assert.deepEqual(prefab.prefabProperties, []);
  assert.equal(scene.displayList.length, 1);
});

test("creates a prefab instance using the stable Prefab document id", () => {
  const prefab = createPrefabDocument(scene, at(scene.displayList, 0), "Dino");
  const next = createPrefabInstance(scene, prefab, { label: "dinoPrefab", x: 120, y: 90 });
  const instance = next.displayList.at(-1);
  assert.ok(instance);
  assert.equal(instance.prefabId, prefab.id);
  assert.equal(instance.label, "dinoPrefab");
  assert.equal(instance.x, 120);
  assert.equal(instance.y, 90);
  assert.deepEqual(instance.components, []);
  assert.equal(scene.displayList.length, 1);
});

test("supports typed Prefab properties and per-instance overrides", () => {
  let prefab = createPrefabDocument(scene, at(scene.displayList, 0));
  prefab = addPrefabProperty(prefab, { name: "rotating", label: "Rotating", defValue: false, customDefinition: false, type: { id: "boolean" } });
  prefab = addPrefabProperty(prefab, { name: "origin", label: "Origin", defValue: "top", customDefinition: true, type: { id: "option", options: ["top", "center", "bottom"] } });
  assert.equal(getPrefabPropertyDefault(at(prefab.prefabProperties ?? [], 0)), false);
  const instance = createPrefabInstance(scene, prefab).displayList.at(-1);
  assert.ok(instance);
  assert.deepEqual(resolvePrefabInstanceValues(prefab, instance), { rotating: false, origin: "top" });
  assert.deepEqual(resolvePrefabInstanceValues(prefab, { ...instance, rotating: true }), { rotating: true, origin: "top" });
  prefab = updatePrefabProperty(prefab, "rotating", { defValue: true });
  assert.equal(at(prefab.prefabProperties ?? [], 0).defValue, true);
  prefab = removePrefabProperty(prefab, "origin");
  assert.deepEqual((prefab.prefabProperties ?? []).map((item) => item.name), ["rotating"]);
});

test("rejects invalid Prefabs and duplicate property definitions", () => {
  assert.throws(() => createPrefabDocument(scene, null as unknown as SceneDocument["displayList"][number]), /scene object/);
  assert.throws(() => createPrefabInstance(scene, { id: "missing", sceneType: "SCENE", displayList: [] } as unknown as PrefabDocument), /sceneType PREFAB/);
  const prefab = createPrefabDocument(scene, at(scene.displayList, 0));
  const withProperty = addPrefabProperty(prefab, { name: "count", type: { id: "number" }, defValue: 1 });
  assert.throws(() => addPrefabProperty(withProperty, { name: "count", type: { id: "number" } }), /already exists/);
  assert.throws(() => addPrefabProperty(withProperty, { name: "bad key", type: { id: "number" } }), /valid identifier/);
});
