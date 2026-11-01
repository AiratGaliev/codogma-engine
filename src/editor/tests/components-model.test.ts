import assert from "node:assert/strict";
import { test } from "vitest";
import type { UserComponentsDocument } from "../src/domain/components-model.ts";
import {
  addUserComponentDefinition, attachUserComponent, createUserComponentDefinition, detachUserComponent,
  formatUserComponentsContent, isUserComponentsContent, parseUserComponentsContent,
  removeUserComponentDefinition, updateUserComponentDefinition,
} from "../src/domain/components-model.ts";


function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Expected item at index ${index}.`);
  return item;
}

const fixture: UserComponentsDocument = {
  components: [{ name: "PushOnClick", baseClass: "UserComponent", gameObjectType: "Phaser.GameObjects.Image",
    properties: [{ name: "pushScale", label: "Push Scale", defValue: 0.5, type: { id: "number" } }], generateAwakeEvent: true }],
  meta: { app: "Phaser Editor 2D - Object Script Editor", contentType: "phasereditor2d.core.scene.SceneContentType" },
  outputLang: "TYPE_SCRIPT",
};

test("parses .components documents and keeps metadata", () => {
  const parsed = parseUserComponentsContent(JSON.stringify(fixture));
  assert.equal(isUserComponentsContent(parsed), true);
  assert.equal(parsed.meta?.app, fixture.meta?.app);
  assert.equal(parsed.outputLang, "TYPE_SCRIPT");
});

test("attaches components and initializes declared property defaults", () => {
  const object = { id: "one", type: "Image", components: [], x: 12 };
  const attached = attachUserComponent(object, at(fixture.components, 0));
  assert.deepEqual(attached.components, ["PushOnClick"]);
  assert.equal(attached["PushOnClick.pushScale"], 0.5);
  assert.equal(object.components.length, 0);
  assert.equal(attachUserComponent(attached, at(fixture.components, 0)).components?.length, 1);
});

test("detaches a component and removes only its namespaced properties", () => {
  const next = detachUserComponent({ components: ["PushOnClick", "Tint"], "PushOnClick.pushScale": 0.75, "Tint.tint": "red", custom: "keep" }, "PushOnClick");
  assert.deepEqual(next.components, ["Tint"]);
  assert.equal(Object.hasOwn(next, "PushOnClick.pushScale"), false);
  assert.equal(next["Tint.tint"], "red");
  assert.equal(next.custom, "keep");
});

test("creates, updates and removes User Component definitions", () => {
  const definition = createUserComponentDefinition("Blink", { properties: [{ name: "speed", type: { id: "number" }, defValue: 2 }] });
  const added = addUserComponentDefinition(fixture, definition);
  const updated = updateUserComponentDefinition(added, "Blink", { displayName: "Blinking" });
  assert.equal(at(updated.components, 1).displayName, "Blinking");
  assert.equal(removeUserComponentDefinition(updated, "Blink").components.length, 1);
  assert.equal(fixture.components.length, 1);
});

test("serializes the existing .components contract and rejects invalid names", () => {
  const output = formatUserComponentsContent(fixture);
  assert.ok(output.endsWith("\n"));
  assert.deepEqual(JSON.parse(output), fixture);
  assert.throws(() => createUserComponentDefinition("Bad Name"), /identifier/);
  assert.throws(() => addUserComponentDefinition(fixture, at(fixture.components, 0)), /already exists/);
});
