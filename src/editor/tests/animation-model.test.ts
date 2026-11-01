import assert from "node:assert/strict";
import { test } from "vitest";
import type { AnimationDocument } from "../src/domain/animation-model.ts";
import {
  appendAnimationFrame, createAnimation, createAnimationDocument, formatAnimationContent,
  getAnimations, isAnimationContent, moveAnimationFrame, parseAnimationContent,
  removeAnimation, removeAnimationFrame, updateAnimation, updateAnimationSettings,
  getAnimationFrameDurationMs, getAnimationDurationMs, getAnimationTimelinePosition,
} from "../src/domain/animation-model.ts";


function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Expected item at index ${index}.`);
  return item;
}

const fixture: AnimationDocument = {
  anims: [{ key: "walk", frameRate: 12, repeat: -1, frames: [{ key: "dino", frame: "walk_0" }, { key: "dino", frame: "walk_1", duration: 80 }], customMetadata: { source: "fixture" } }],
  globalTimeScale: 1,
  settings: { sourceLang: "TYPE_SCRIPT", generateCode: true, esModule: true, outputFolder: "src/animations" },
  meta: { app: "Phaser Editor", contentType: "Phaser v3 Animations", vendorField: "preserve" },
  vendorRootField: 42,
};

test("parses Phaser JSONAnimations and preserves unknown metadata", () => {
  const parsed = parseAnimationContent(JSON.stringify(fixture));
  assert.equal((at(parsed.anims, 0).customMetadata as { source: string }).source, "fixture");
  assert.equal(parsed.vendorRootField, 42);
  assert.equal(parsed.meta.vendorField, "preserve");
  assert.equal(at(getAnimations(parsed), 0).frameCount, 2);
  assert.equal(isAnimationContent(parsed), true);
});

test("creates unique animations and updates properties immutably", () => {
  const first = createAnimation(fixture, "walk");
  const second = createAnimation(first, "walk");
  assert.equal(at(second.anims, 1).key, "walk_1");
  assert.equal(at(second.anims, 1).frameRate, 24);
  const changed = updateAnimation(second, "walk", { frameRate: 30, yoyo: true });
  assert.equal(at(changed.anims, 0).yoyo, true);
  assert.equal(at(fixture.anims, 0).frameRate, 12);
  assert.throws(() => updateAnimation(changed, "walk", { key: "walk_1" }), /Duplicate animation key/);
});

test("appends, reorders and removes animation frame references", () => {
  const appended = appendAnimationFrame(fixture, "walk", { key: "coins" });
  const moved = moveAnimationFrame(appended, "walk", 2, 0);
  assert.deepEqual(at(at(moved.anims, 0).frames, 0), { key: "coins" });
  assert.equal(at(removeAnimationFrame(moved, "walk", 1).anims, 0).frames.length, 2);
  assert.equal(at(fixture.anims, 0).frames.length, 2);
});

test("deletes animations and updates settings without losing unknown fields", () => {
  assert.deepEqual(removeAnimation(fixture, "walk").anims, []);
  const next = updateAnimationSettings(fixture, { esModule: false, customOption: "kept" });
  assert.equal(next.settings?.customOption, "kept");
});

test("creates and formats a valid Phaser v3 animation file", () => {
  const created = createAnimation(createAnimationDocument(), "idle", { frames: [{ key: "dino" }] });
  const output = formatAnimationContent(created);
  assert.ok(output.endsWith("\n"));
  assert.equal(at(parseAnimationContent(output).anims, 0).key, "idle");
});

test("rejects malformed animation JSON, duplicate keys and invalid frames", () => {
  assert.throws(() => parseAnimationContent("{"), /not valid JSON/);
  assert.throws(() => parseAnimationContent(JSON.stringify({ anims: [], meta: {} })), /not a Phaser/);
  assert.throws(() => parseAnimationContent(JSON.stringify({ meta: { contentType: "Phaser v3 Animations" }, anims: [{ key: "a", frames: [] }, { key: "a", frames: [] }] })), /Duplicate animation key/);
  assert.throws(() => parseAnimationContent(JSON.stringify({ meta: { contentType: "Phaser v3 Animations" }, anims: [{ key: "a", frames: [{ frame: "missing-key" }] }] })), /invalid frame reference/);
});


test("calculates the Phaser frame timeline from explicit durations, frame rate and time scale", () => {
  const animation = {
    key: "walk",
    frameRate: 10,
    repeat: 0,
    frames: [
      { key: "dino", frame: "walk_0", duration: 80 },
      { key: "dino", frame: "walk_1" },
      { key: "dino", frame: "walk_2" },
    ],
  };

  assert.equal(getAnimationFrameDurationMs(animation, at(animation.frames, 0)), 80);
  assert.equal(getAnimationFrameDurationMs(animation, at(animation.frames, 1)), 100);
  assert.equal(getAnimationDurationMs(animation), 280);
  assert.equal(getAnimationDurationMs(animation, 2), 140);

  const first = getAnimationTimelinePosition(animation, 40);
  assert.equal(first.frameIndex, 0);
  assert.equal(first.progress, 0.5);
  assert.equal(first.completed, false);

  const second = getAnimationTimelinePosition(animation, 100);
  assert.equal(second.frameIndex, 1);
  assert.equal(second.elapsedInFrameMs, 20);

  const complete = getAnimationTimelinePosition(animation, 280);
  assert.equal(complete.completed, true);
  assert.equal(complete.frameIndex, 2);
  assert.equal(complete.progress, 1);
});

test("handles Phaser repeat delay, infinite repeat and yoyo without changing serialized frames", () => {
  const animation = {
    key: "bounce",
    frameRate: 10,
    repeat: 1,
    repeatDelay: 50,
    yoyo: true,
    frames: [{ key: "sheet", frame: 0 }, { key: "sheet", frame: 1, duration: 200 }],
  };

  const repeatGap = getAnimationTimelinePosition(animation, 325);
  assert.equal(repeatGap.waiting, true);
  assert.equal(repeatGap.cycleIndex, 0);

  const reverseCycle = getAnimationTimelinePosition(animation, 350);
  assert.equal(reverseCycle.frameIndex, 1);
  assert.equal(reverseCycle.elapsedInFrameMs, 0);
  assert.equal(reverseCycle.progress, 0);
  assert.equal(reverseCycle.cycleIndex, 1);

  const infinite = getAnimationTimelinePosition({ ...animation, repeat: -1 }, 10_000);
  assert.equal(infinite.completed, false);
  assert.ok(infinite.cycleIndex > 1);

  assert.deepEqual(animation.frames, [{ key: "sheet", frame: 0 }, { key: "sheet", frame: 1, duration: 200 }],
    "preview calculations must not mutate Phaser JSONAnimations.");
});

test("handles empty animation timelines and rejects invalid preview time", () => {
  const empty = getAnimationTimelinePosition({ key: "empty", frames: [] }, 0);
  assert.equal(empty.frameIndex, -1);
  assert.equal(empty.completed, true);
  assert.equal(getAnimationDurationMs({ key: "empty", frames: [] }), 0);
  assert.throws(() => getAnimationTimelinePosition({ key: "x", frames: [] }, Number.NaN), /non-negative finite/);
});
