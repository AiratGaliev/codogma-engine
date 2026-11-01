import assert from "node:assert/strict";
import { test } from "vitest";
import {
  addSceneObjectFx,
  createFxObject,
  getSceneObjectEffects,
  getUnsupportedSceneObjectEffects,
  removeSceneObjectFx,
  updateSceneObjectFx,
} from "../src/domain/fx-model.ts";
import {
  getSceneObjects,
  parseSceneContent,
} from "../src/domain/scene-model.ts";
import type { SceneDocument } from "../src/domain/scene-model.ts";

const sceneFixture: SceneDocument = {
  id: "fx-scene",
  displayList: [
    {
      id: "root-container",
      type: "Container",
      label: "Root",
      list: [
        {
          id: "nested-image",
          type: "Image",
          label: "Nested image",
          list: [
            { id: "circle-1", type: "Circle", preFX: true, thickness: 6, color: 0xffcc33 },
            { id: "legacy-glow", type: "Glow", color: "#ffffff", strength: 4 },
          ],
        },
        { id: "sibling-text", type: "Text", label: "Sibling" },
      ],
    },
  ],
};

test("creates legacy-compatible defaults for each supported 2D FX type", () => {
  assert.deepEqual(createFxObject("Circle", "circle"), {
    id: "circle", type: "Circle", label: "Circle", preFX: true,
    thickness: 8, color: "#ff33b2", backgroundColor: "#ff0000", scale: 1, feather: 0.005,
  });
  assert.equal(createFxObject("Bloom", "bloom").threshold, 0.5);
  assert.equal(createFxObject("Gradient", "gradient").alpha, 0.2);
  assert.equal(createFxObject("Shine", "shine").duration, 2000);
});

test("discovers nested scene nodes without exposing FX helper nodes as scene objects", () => {
  assert.deepEqual(getSceneObjects(sceneFixture).map(({ id, parentId, depth }) => [id, parentId, depth]), [
    ["root-container", null, 0],
    ["nested-image", "root-container", 1],
    ["sibling-text", "root-container", 1],
  ]);
});

test("reads supported and unsupported legacy effects without dropping either", () => {
  const nestedImage = getSceneObjects(sceneFixture).find((entry) => entry.id === "nested-image");
  assert.ok(nestedImage);
  const supported = getSceneObjectEffects(nestedImage.source);
  assert.deepEqual(supported.map(({ id, source }) => [id, source.type]), [["circle-1", "Circle"]]);
  assert.equal(supported[0]?.source.color, 0xffcc33);
  assert.equal(typeof supported[0]?.source.color, "number");
  assert.deepEqual(getUnsupportedSceneObjectEffects(nestedImage.source), ["Glow"]);
});

test("adds, edits and removes nested FX immutably while preserving unknown fields and sibling order", () => {
  const withBloom = addSceneObjectFx(sceneFixture, "nested-image", "Bloom");
  const nestedAfterAdd = getSceneObjects(withBloom).find((entry) => entry.id === "nested-image");
  assert.ok(nestedAfterAdd);
  const added = getSceneObjectEffects(nestedAfterAdd.source).find(({ source }) => source.type === "Bloom");
  assert.ok(added);

  const withGradient = updateSceneObjectFx(withBloom, "nested-image", added.id, {
    threshold: 0.75,
    blurQuality: 2,
    label: "Bright edge",
  });
  const nestedAfterEdit = getSceneObjects(withGradient).find((entry) => entry.id === "nested-image");
  assert.ok(nestedAfterEdit);
  const bloom = getSceneObjectEffects(nestedAfterEdit.source).find(({ id }) => id === added.id);
  assert.equal(bloom?.source.type, "Bloom");
  assert.equal(bloom?.source.threshold, 0.75);
  assert.equal(bloom?.source.blurQuality, 2);
  assert.equal(bloom?.source.label, "Bright edge");

  const removed = removeSceneObjectFx(withGradient, "nested-image", added.id);
  const nestedAfterRemove = getSceneObjects(removed).find((entry) => entry.id === "nested-image");
  assert.ok(nestedAfterRemove);
  assert.deepEqual(nestedAfterRemove.source.list?.map((item) => (item as {id?: string}).id), ["circle-1", "legacy-glow"]);
  assert.equal((getSceneObjects(sceneFixture).find((entry) => entry.id === "nested-image")?.source.list?.[0] as {thickness:number}).thickness, 6);
});

test("validates Phaser-specific numeric domains before persisting Inspector edits", () => {
  const withBloom = addSceneObjectFx(sceneFixture, "nested-image", "Bloom");
  const nested = getSceneObjects(withBloom).find((entry) => entry.id === "nested-image");
  assert.ok(nested);
  const bloom = getSceneObjectEffects(nested.source).find(({source}) => source.type === "Bloom");
  assert.ok(bloom);
  assert.throws(() => updateSceneObjectFx(withBloom, "nested-image", bloom.id, { threshold: 1.1 }), /at most 1/);
  assert.throws(() => updateSceneObjectFx(withBloom, "nested-image", bloom.id, { blurSteps: 1.5 }), /integer/);
  assert.throws(() => updateSceneObjectFx(withBloom, "nested-image", bloom.id, { blurQuality: 3 }), /at most 2/);
  assert.throws(() => updateSceneObjectFx(withBloom, "nested-image", bloom.id, { blurRadius: Number.POSITIVE_INFINITY }), /finite number/);
  assert.throws(() => updateSceneObjectFx(withBloom, "nested-image", bloom.id, { type: "Shine" } as never), /cannot be changed/);
});

test("validates alpha, normalized Gradient coordinates, Shine timing and color representations", () => {
  const gradient = createFxObject("Gradient", "gradient");
  assert.throws(() => updateSceneObjectFx({
    id: "gradient-scene", displayList: [{ id: "parent", type: "Image", list: [gradient] }],
  }, "parent", "gradient", { fromX: -0.1 }), /at least 0/);

  const shine = createFxObject("Shine", "shine");
  const shineScene: SceneDocument = { id: "shine-scene", displayList: [{ id: "parent", type: "Image", list: [shine] }] };
  assert.throws(() => updateSceneObjectFx(shineScene, "parent", "shine", { duration: 0 }), /at least 1/);
  const numericColour = updateSceneObjectFx(shineScene, "parent", "shine", { direction: -2, preFX: false });
  const updatedParent = getSceneObjects(numericColour)[0];
  assert.ok(updatedParent);
  assert.equal(getSceneObjectEffects(updatedParent.source)[0]?.source.preFX, false);
  assert.equal(getSceneObjectEffects(updatedParent.source)[0]?.source.direction, -2);
});

test("scene JSON round-trips FX settings and unrelated metadata without schema migration", () => {
  const content = JSON.stringify(sceneFixture);
  const parsed = parseSceneContent(content);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), sceneFixture);
  assert.equal((parsed.displayList[0]?.list?.[0] as {list: unknown[]}).list.length, 2);
});
test("edits and removes legacy FX without an id without inserting synthetic identity into serialized data", () => {
  const legacyScene: SceneDocument = {
    id: "legacy-fx",
    displayList: [{
      id: "parent",
      type: "Image",
      list: [{ type: "Circle", thickness: 5, color: 0x123456, customLegacyFlag: "keep" }],
    }],
  };
  const parent = getSceneObjects(legacyScene)[0];
  assert.ok(parent);
  const effect = getSceneObjectEffects(parent.source)[0];
  assert.ok(effect);
  assert.equal(effect.id, "fx-0");

  const updated = updateSceneObjectFx(legacyScene, "parent", effect.id, { thickness: 9 });
  const updatedParent = getSceneObjects(updated)[0];
  assert.ok(updatedParent);
  const raw = updatedParent.source.list?.[0] as Record<string, unknown>;
  assert.equal(raw.id, undefined);
  assert.equal(raw.thickness, 9);
  assert.equal(raw.color, 0x123456);
  assert.equal(raw.customLegacyFlag, "keep");

  const removed = removeSceneObjectFx(updated, "parent", effect.id);
  const removedParent = getSceneObjects(removed)[0];
  assert.ok(removedParent);
  assert.deepEqual(removedParent.source.list, []);
  assert.equal(legacyScene.displayList[0]?.list?.length, 1);
});
