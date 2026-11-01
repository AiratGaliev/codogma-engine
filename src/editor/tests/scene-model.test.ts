import assert from "node:assert/strict";
import { test } from "vitest";
import type { SceneDocument } from "../src/domain/scene-model.ts";
import {
  createSceneObject,
  findScenePaths,
  formatSceneContent,
  getSceneObjects,
  parseSceneContent,
  removeSceneObject,
  updateSceneObject,
} from "../src/domain/scene-model.ts";


function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Expected item at index ${index}.`);
  return item;
}

const fixtureScene: SceneDocument = {
  id: "scene-1",
  sceneType: "SCENE",
  settings: { sceneKey: "Level" },
  displayList: [
    { id: "image-1", type: "Image", label: "dino", x: 400, y: 245, components: ["PushOnClick"], texture: { key: "dino" } },
    { id: "text-1", type: "Text", label: "title", x: 100, y: 200, text: "Original" },
    { id: "prefab-1", prefabId: "prefab-1", label: "Prefab", x: 50, y: 80 },
  ],
  plainObjects: [],
};

test("parses and validates a real scene-shaped document without discarding fields", () => {
  const parsed = parseSceneContent(JSON.stringify(fixtureScene));
  assert.equal(parsed.id, "scene-1");
  assert.equal(parsed.settings?.sceneKey, "Level");
  assert.equal(at(parsed.displayList, 0).texture?.key, "dino");
  assert.deepEqual(at(parsed.displayList, 0).components, ["PushOnClick"]);
});

test("lists display objects and prefab instances with stable ids and useful labels", () => {
  const entries = getSceneObjects(fixtureScene);
  assert.deepEqual(entries.map(({ id, name, type }) => [id, name, type]), [
    ["image-1", "dino", "Image"],
    ["text-1", "title", "Text"],
    ["prefab-1", "Prefab", "Prefab"],
  ]);
});

test("updates transforms immutably and preserves unedited object metadata", () => {
  const updated = updateSceneObject(fixtureScene, "image-1", { x: 465, rotation: 15 });
  assert.equal(at(updated.displayList, 0).x, 465);
  assert.equal(at(updated.displayList, 0).rotation, 15);
  assert.equal(at(updated.displayList, 0).texture?.key, "dino");
  assert.equal(at(updated.displayList, 0).components?.[0], "PushOnClick");
  assert.equal(at(fixtureScene.displayList, 0).x, 400);
});

test("fallback hierarchy ids can update and remove legacy objects without serialized ids", () => {
  const legacyScene = {
    ...fixtureScene,
    displayList: [{ type: "Text", label: "Legacy", x: 12, y: 24 }],
    plainObjects: [],
  };
  const entry = at(getSceneObjects(legacyScene), 0);
  assert.equal(entry.id, "displayList-0");

  const updated = updateSceneObject(legacyScene, entry.id, { x: 64 });
  assert.equal(at(updated.displayList, 0).x, 64);
  assert.equal(at(legacyScene.displayList, 0).x, 12);

  const removed = removeSceneObject(updated, entry.id);
  assert.equal(removed.displayList.length, 0);
  assert.equal(legacyScene.displayList.length, 1);
});

test("rejects NaN, Infinity and non-numeric transform values", () => {
  assert.throws(() => updateSceneObject(fixtureScene, "image-1", { x: Number.NaN }), /finite number/);
  assert.throws(() => updateSceneObject(fixtureScene, "image-1", { scaleY: Number.POSITIVE_INFINITY }), /finite number/);
  assert.throws(() => updateSceneObject(fixtureScene, "image-1", { rotation: "left" } as never), /finite number/);
});

test("creates supported Image, Text and Container nodes without changing the legacy schema", () => {
  const imageScene = createSceneObject(fixtureScene, "Image");
  const textScene = createSceneObject(imageScene, "Text");
  const containerScene = createSceneObject(textScene, "Container");
  const objects = getSceneObjects(containerScene);
  assert.equal(objects.length, 6);
  assert.equal(at(objects, 3).source.texture?.key, "dino");
  assert.equal(at(objects, 4).source.text, "New text");
  assert.deepEqual(at(objects, 5).source.list, []);
  assert.equal(fixtureScene.displayList.length, 3);
});

test("removes only the selected scene object", () => {
  const updated = removeSceneObject(fixtureScene, "text-1");
  assert.deepEqual(updated.displayList.map((item) => item.id), ["image-1", "prefab-1"]);
  assert.equal(fixtureScene.displayList.length, 3);
  assert.throws(() => removeSceneObject(updated, "missing"), /was not found/);
});

test("rejects malformed scene data with a useful message", () => {
  assert.throws(() => parseSceneContent("{"), /not valid JSON/);
  assert.throws(() => parseSceneContent(JSON.stringify({ displayList: [] })), /stable id/);
  assert.throws(() => parseSceneContent(JSON.stringify({ id: "scene-2", displayList: {} })), /displayList must be an array/);
});

test("formats scene content as valid JSON and preserves object data", () => {
  const text = formatSceneContent(fixtureScene);
  assert.ok(text.endsWith("\n"));
  assert.deepEqual(JSON.parse(text), fixtureScene);
});

test("discovers scene files recursively and prioritizes Level.scene", () => {
  const root = {
    name: "fixture",
    isFile: false,
    children: [
      { name: "scenes", isFile: false, children: [
        { name: "Other.scene", isFile: true },
        { name: "Level.scene", isFile: true },
      ] },
      { name: "Main.scene", isFile: true },
      { name: "notes.txt", isFile: true },
    ],
  };
  assert.deepEqual(findScenePaths(root), ["scenes/Level.scene", "Main.scene", "scenes/Other.scene"]);
  assert.deepEqual(findScenePaths({ name: "test-typescript", isFile: false, children: [
    { name: "scenes", isFile: false, children: [{ name: "Level.scene", isFile: true }] },
  ] }), ["scenes/Level.scene"]);
});
