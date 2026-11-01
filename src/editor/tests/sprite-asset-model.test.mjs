import assert from "node:assert/strict";
import test from "node:test";
import {
  describeSpriteAssetFrames,
  ensureSpriteAssetMetadata,
  findSpriteAssetEntry,
  formatAssetPackContent,
  getSpriteAssetEntries,
  isAssetPackContent,
  parseAssetPackContent,
  reconcileSpriteAssetMetadata,
  setSpriteAssetEntry,
  updateSpriteFrameMetadata,
  validateSpriteCollisionShapes,
} from "../src/domain/sprite-asset-model.mjs";

const imageEntry = {
  type: "image",
  key: "hero",
  url: "assets/hero.png",
  customImporterOption: { keep: true },
};
const pack = {
  section: { files: [imageEntry] },
  meta: { contentType: "phasereditor2d.pack.core.AssetContentType", app: "Phaser Editor" },
  vendorRootField: 42,
};

test("parses Asset Pack JSON and keeps section/root metadata", () => {
  const parsed = parseAssetPackContent(JSON.stringify(pack));
  assert.equal(isAssetPackContent(parsed), true);
  assert.equal(getSpriteAssetEntries(parsed).length, 1);
  assert.equal(findSpriteAssetEntry(parsed, "hero")?.entry.url, "assets/hero.png");
  assert.equal(parseAssetPackContent(formatAssetPackContent(parsed)).vendorRootField, 42);
});

test("describes Image and Spritesheet frame geometry using Phaser frameConfig semantics", () => {
  const imageFrames = describeSpriteAssetFrames(imageEntry, 64, 32);
  assert.deepEqual(imageFrames[0], {
    key: "hero",
    sourceRect: { x: 0, y: 0, width: 64, height: 32 },
    sourceSize: { width: 64, height: 32 },
    trimRect: { x: 0, y: 0, width: 64, height: 32 },
  });

  const frames = describeSpriteAssetFrames({
    type: "spritesheet",
    key: "coin",
    url: "assets/coin.png",
    frameConfig: { frameWidth: 16, frameHeight: 16, margin: 2, spacing: 1, startFrame: 1, endFrame: 2 },
  }, 38, 20);
  assert.deepEqual(frames.map(frame => frame.key), ["1", "2"]);
  assert.deepEqual(frames.map(frame => frame.sourceRect), [
    { x: 19, y: 2, width: 16, height: 16 },
    { x: 2, y: 2, width: 16, height: 16 },
  ]);
});

test("ensures stable IDs/source fingerprints and preserves vendor fields", () => {
  const descriptors = describeSpriteAssetFrames(imageEntry, 64, 32);
  const first = ensureSpriteAssetMetadata(imageEntry, { size: 1024, modifiedAt: 100 }, descriptors);
  const second = ensureSpriteAssetMetadata({ ...imageEntry, codogma: first }, { size: 1024, modifiedAt: 100 }, descriptors);
  assert.equal(second.assetId, first.assetId);
  assert.equal(second.frames.hero.id, first.frames.hero.id);
  assert.equal(second.source.signature, first.source.signature);
  assert.equal(imageEntry.customImporterOption.keep, true);
  assert.throws(() => ensureSpriteAssetMetadata({ ...imageEntry, codogma: { schemaVersion: 99 } }), /newer than supported/);
});

test("edits pivot, trim, crop and collision shapes while preserving unknown frame properties", () => {
  const descriptor = describeSpriteAssetFrames(imageEntry, 64, 32);
  const metadata = ensureSpriteAssetMetadata(imageEntry, { size: 1024, modifiedAt: 100 }, descriptor);
  const entry = { ...imageEntry, codogma: { ...metadata, frames: {
    ...metadata.frames,
    hero: { ...metadata.frames.hero, vendorFrameField: "retained" },
  } } };
  const edited = updateSpriteFrameMetadata(entry, "hero", {
    pivot: { x: 0.5, y: 1 },
    trim: { x: 2, y: 1, width: 60, height: 30 },
    crop: { x: 4, y: 2, width: 32, height: 16 },
    collisionShapes: [{ type: "rectangle", x: 1, y: 2, width: 20, height: 10 }],
  });
  assert.equal(edited.codogma.frames.hero.vendorFrameField, "retained");
  assert.deepEqual(edited.codogma.frames.hero.pivot, { x: 0.5, y: 1 });
  assert.throws(() => updateSpriteFrameMetadata(edited, "hero", { pivot: { x: 2, y: 0.5 } }), /between 0 and 1/);
  assert.throws(() => updateSpriteFrameMetadata(edited, "hero", { crop: { x: 60, y: 0, width: 10, height: 10 } }), /inside its frame bounds/);
});

test("validates rectangle, circle and polygon collision geometry without flattening polygons", () => {
  assert.equal(validateSpriteCollisionShapes([{ type: "circle", x: 10, y: 10, radius: 5 }], 32, 32), null);
  assert.equal(validateSpriteCollisionShapes([{ type: "polygon", points: [[0, 0], [16, 0], [8, 12]] }], 32, 32), null);
  assert.match(validateSpriteCollisionShapes([{ type: "circle", x: 2, y: 2, radius: 5 }], 32, 32), /circle/);
  assert.match(validateSpriteCollisionShapes([{ type: "polygon", points: [[0, 0], [1, 1], [2, 2]] }], 32, 32), /non-zero area/);
});

test("reimport preserves compatible frames and archives changed/removed authored metadata", () => {
  const previous = {
    ...imageEntry,
    codogma: ensureSpriteAssetMetadata(imageEntry, { size: 1024, modifiedAt: 100 }, [
      { key: "0", sourceRect: { x: 0, y: 0, width: 32, height: 32 }, sourceSize: { width: 32, height: 32 }, trimRect: { x: 0, y: 0, width: 32, height: 32 } },
      { key: "1", sourceRect: { x: 32, y: 0, width: 32, height: 32 }, sourceSize: { width: 32, height: 32 }, trimRect: { x: 0, y: 0, width: 32, height: 32 } },
    ]),
  };
  previous.codogma.frames["0"].pivot = { x: 0.5, y: 1 };
  previous.codogma.frames["1"].collisionShapes = [{ type: "rectangle", x: 0, y: 0, width: 12, height: 12 }];

  const next = reconcileSpriteAssetMetadata(previous, { ...previous, url: "assets/hero.png" }, { size: 2048, modifiedAt: 200 }, [
    { key: "0", sourceRect: { x: 0, y: 0, width: 32, height: 32 }, sourceSize: { width: 32, height: 32 }, trimRect: { x: 0, y: 0, width: 32, height: 32 } },
    { key: "1", sourceRect: { x: 32, y: 0, width: 16, height: 32 }, sourceSize: { width: 16, height: 32 }, trimRect: { x: 0, y: 0, width: 16, height: 32 } },
  ]);
  assert.deepEqual(next.codogma.frames["0"].pivot, { x: 0.5, y: 1 });
  assert.equal(next.codogma.frames["1"].collisionShapes, undefined);
  assert.equal(next.codogma.orphanedFrames.length, 1);
  assert.equal(next.codogma.conflicts.length, 1);
  assert.equal(next.codogma.conflicts[0].type, "frame-geometry-changed");
});

test("sets a single Asset Pack item immutably and preserves unrelated sections", () => {
  const nextEntry = { ...imageEntry, codogma: ensureSpriteAssetMetadata(imageEntry, { size: 10, modifiedAt: 1 }, describeSpriteAssetFrames(imageEntry, 2, 2)) };
  const next = setSpriteAssetEntry(pack, "hero", nextEntry);
  assert.notEqual(next, pack);
  assert.equal(next.section.files[0].codogma.assetId, nextEntry.codogma.assetId);
  assert.equal(next.vendorRootField, 42);
  assert.equal(pack.section.files[0].codogma, undefined);
});
