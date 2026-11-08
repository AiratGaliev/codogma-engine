import assert from "node:assert/strict";
import { test } from "vitest";
import { colorPreview } from "../src/components/fx-color.ts";

test("renders Phaser HEX strings and numeric colours in the FX Inspector swatch", () => {
  assert.equal(colorPreview("#abc"), "#abc");
  assert.equal(colorPreview("#A1B2C3"), "#A1B2C3");
  assert.equal(colorPreview("0xA1B2C3"), "#A1B2C3");
  assert.equal(colorPreview("0xFFA1B2C3"), "#A1B2C3");
  assert.equal(colorPreview(0xA1B2C3), "#a1b2c3");
  assert.equal(colorPreview(0xFFA1B2C3), "#a1b2c3");
});

test("does not treat invalid FX colour values as a visible swatch", () => {
  assert.equal(colorPreview("red"), "transparent");
  assert.equal(colorPreview("0xGGGGGG"), "transparent");
  assert.equal(colorPreview(Number.NaN), "transparent");
});
