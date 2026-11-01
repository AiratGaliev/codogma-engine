import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAnimationFrame, createAnimation, createAnimationDocument, formatAnimationContent,
  getAnimations, isAnimationContent, moveAnimationFrame, parseAnimationContent,
  removeAnimation, removeAnimationFrame, updateAnimation, updateAnimationSettings,
} from "../src/domain/animation-model.mjs";

const fixture = {
  anims: [{ key: "walk", frameRate: 12, repeat: -1, frames: [{ key: "dino", frame: "walk_0" }, { key: "dino", frame: "walk_1", duration: 80 }], customMetadata: { source: "fixture" } }],
  globalTimeScale: 1,
  settings: { sourceLang: "TYPE_SCRIPT", generateCode: true, esModule: true, outputFolder: "src/animations" },
  meta: { app: "Phaser Editor", contentType: "Phaser v3 Animations", vendorField: "preserve" },
  vendorRootField: 42,
};

test("parses Phaser JSONAnimations and preserves unknown metadata", () => {
  const parsed = parseAnimationContent(JSON.stringify(fixture));
  assert.equal(parsed.anims[0].customMetadata.source, "fixture");
  assert.equal(parsed.vendorRootField, 42);
  assert.equal(parsed.meta.vendorField, "preserve");
  assert.equal(getAnimations(parsed)[0].frameCount, 2);
  assert.equal(isAnimationContent(parsed), true);
});

test("creates unique animations and updates properties immutably", () => {
  const first = createAnimation(fixture, "walk");
  const second = createAnimation(first, "walk");
  assert.equal(second.anims[1].key, "walk_1");
  assert.equal(second.anims[1].frameRate, 24);
  const changed = updateAnimation(second, "walk", { frameRate: 30, yoyo: true });
  assert.equal(changed.anims[0].yoyo, true);
  assert.equal(fixture.anims[0].frameRate, 12);
  assert.throws(() => updateAnimation(changed, "walk", { key: "walk_1" }), /Duplicate animation key/);
});

test("appends, reorders and removes animation frame references", () => {
  const appended = appendAnimationFrame(fixture, "walk", { key: "coins" });
  const moved = moveAnimationFrame(appended, "walk", 2, 0);
  assert.deepEqual(moved.anims[0].frames[0], { key: "coins" });
  assert.equal(removeAnimationFrame(moved, "walk", 1).anims[0].frames.length, 2);
  assert.equal(fixture.anims[0].frames.length, 2);
});

test("deletes animations and updates settings without losing unknown fields", () => {
  assert.deepEqual(removeAnimation(fixture, "walk").anims, []);
  const next = updateAnimationSettings(fixture, { esModule: false, customOption: "kept" });
  assert.equal(next.settings.customOption, "kept");
});

test("creates and formats a valid Phaser v3 animation file", () => {
  const created = createAnimation(createAnimationDocument(), "idle", { frames: [{ key: "dino" }] });
  const output = formatAnimationContent(created);
  assert.ok(output.endsWith("\n"));
  assert.equal(parseAnimationContent(output).anims[0].key, "idle");
});

test("rejects malformed animation JSON, duplicate keys and invalid frames", () => {
  assert.throws(() => parseAnimationContent("{"), /not valid JSON/);
  assert.throws(() => parseAnimationContent(JSON.stringify({ anims: [], meta: {} })), /not a Phaser/);
  assert.throws(() => parseAnimationContent(JSON.stringify({ meta: { contentType: "Phaser v3 Animations" }, anims: [{ key: "a", frames: [] }, { key: "a", frames: [] }] })), /Duplicate animation key/);
  assert.throws(() => parseAnimationContent(JSON.stringify({ meta: { contentType: "Phaser v3 Animations" }, anims: [{ key: "a", frames: [{ frame: "missing-key" }] }] })), /invalid frame reference/);
});
