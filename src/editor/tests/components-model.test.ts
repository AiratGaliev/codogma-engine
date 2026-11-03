import assert from "node:assert/strict";
import { test } from "vitest";
import type { UserComponentsDocument } from "../src/domain/components-model.ts";
import {
  addUserComponentDefinition, attachUserComponent, createUserComponentDefinition, detachUserComponent,
  createUserComponentSchema, validateUserComponentProperties, validateUserComponentPropertyValue,
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

test("adapts legacy component metadata to the shared Core schema", () => {
  const definition = at(fixture.components, 0);
  const schema = createUserComponentSchema(definition);
  assert.equal(schema.valid, true);
  assert.equal(schema.value?.typeId, "legacy.user-component:PushOnClick");
  assert.deepEqual(schema.value?.properties.pushScale, {
    label: "Push Scale",
    type: "number",
    defaultValue: 0.5,
  });
});

test("validates attached values with Core schema and keeps missing optional fields valid", () => {
  const definition = at(fixture.components, 0);
  const attached = attachUserComponent({ id: "one", type: "Image", components: [] }, definition);
  assert.equal(validateUserComponentProperties(attached, definition).valid, true);

  const invalid = { ...attached, "PushOnClick.pushScale": Number.NaN };
  const result = validateUserComponentProperties(invalid, definition);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0]?.propertyName, "pushScale");
});

test("validates enum edits and rejects unsupported legacy property types", () => {
  const tint = {
    name: "Tint",
    properties: [{
      name: "tint",
      defValue: "red",
      customDefinition: true,
      type: { id: "option", options: ["red", "green", "blue"] },
    }],
  };
  assert.equal(validateUserComponentPropertyValue(tint, "tint", "green").valid, true);
  assert.equal(validateUserComponentPropertyValue(tint, "tint", "purple").valid, false);

  const unsupported = {
    name: "Unsupported",
    properties: [{ name: "opaque", type: { id: "resource" } }],
  };
  const schema = createUserComponentSchema(unsupported);
  assert.equal(schema.valid, false);
  assert.match(schema.diagnostics[0]?.message ?? "", /unsupported legacy type/);
});

test("rejects invalid component renames and malformed property collections", () => {
  assert.throws(
    () => updateUserComponentDefinition(fixture, "PushOnClick", { name: "Bad Name" }),
    /valid TypeScript identifier/,
  );
  assert.equal(createUserComponentSchema({
    name: "Malformed",
    properties: {} as never,
  }).valid, false);
});

test("keeps __proto__ as a user property name in the legacy schema adapter", () => {
  const definition = {
    name: "Prototype",
    properties: [{ name: "__proto__", label: "Prototype value", defValue: "safe", type: { id: "string" } }],
  };
  const schema = createUserComponentSchema(definition);
  assert.equal(schema.valid, true);
  assert.ok(schema.value);
  assert.equal(Object.prototype.hasOwnProperty.call(schema.value.properties, "__proto__"), true);
  assert.equal(schema.value.properties["__proto__"]?.type, "string");

  const attached = attachUserComponent({ id: "node-1", type: "Image", components: [] }, definition);
  assert.equal(attached["Prototype.__proto__"], "safe");
  const validation = validateUserComponentProperties(attached, definition);
  assert.equal(validation.valid, true);
  assert.equal(validation.value?.["__proto__"], "safe");
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "safe"), false);
});
