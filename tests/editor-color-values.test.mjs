/**
 * Color value regression tests (PR #10 follow-up backlog).
 *
 * Loads the REAL compiled editor bundles (see tests/editor-bundle-loader.cjs)
 * and locks the behavior of color properties when values arrive in the two
 * conventions the editor meets in the wild:
 *
 *   - `#hex` strings (editor scene JSON / Inspector), and
 *   - numbers (Phaser convention: 0xRRGGBB tint / fillColor values coming
 *     from external tools or prefabs).
 *
 * Previously a numeric value threw inside `Colors.parseColor` (vanilla-color
 * calls String methods on its input), the surrounding try/catch swallowed the
 * error, and the outcome depended on the property:
 *
 *   - TintProperty: tint silently became 0 (black) AND the raw number was
 *     persisted into the model cache, so every scene reload re-threw
 *     ("this.color.replace is not a function" console spam) forever.
 *   - NumberColorProperty (shapes, FX colors): value dropped, default applied.
 *
 * Both paths now normalize through `colorValueToHexString` first; these tests
 * pin the normalized behavior against the compiled bundles.
 */

import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { loadEditorBundles } from "./editor-bundle-loader.cjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PLUGINS_DIR = path.join(ROOT, "source", "editor", "plugins")

loadEditorBundles(PLUGINS_DIR)

// parseColor reads `window["VanillaColor"]`; the vanilla-picker script exports
// the class on globalThis, the test window shim is a separate object.
globalThis.window.VanillaColor = globalThis.VanillaColor

const sceneobjects = globalThis.phasereditor2d.scene.ui.sceneobjects

function PhaserColor(r, g, b) {

    return globalThis.Phaser.Display.Color.GetColor(r, g, b)
}

/* ===================== colorValueToHexString ===================== */

test("colorValueToHexString normalizes Phaser numeric colors to #hex", () => {

    assert.equal(sceneobjects.colorValueToHexString(0xff0000, "#ffffff"), "#ff0000")
    assert.equal(sceneobjects.colorValueToHexString(0x00ff00, "#ffffff"), "#00ff00")
    assert.equal(sceneobjects.colorValueToHexString(0x0000ff, "#ffffff"), "#0000ff")
    assert.equal(sceneobjects.colorValueToHexString(16711680, "#ffffff"), "#ff0000")
    assert.equal(sceneobjects.colorValueToHexString(0x0a0b0c, "#ffffff"), "#0a0b0c")
})

test("colorValueToHexString keeps alpha-less hex strings untouched", () => {

    // the editor stores the original string: 3/6/8-digit forms pass through
    assert.equal(sceneobjects.colorValueToHexString("#f75bb1ff", "#ffffff"), "#f75bb1ff")
    assert.equal(sceneobjects.colorValueToHexString("#fff", "#ffffff"), "#fff")
    assert.equal(sceneobjects.colorValueToHexString("red", "#ffffff"), "red")
})

test("colorValueToHexString falls back to the default on unusable values", () => {

    assert.equal(sceneobjects.colorValueToHexString(undefined, "#ffffff"), "#ffffff")
    assert.equal(sceneobjects.colorValueToHexString(null, "#ffffff"), "#ffffff")
    assert.equal(sceneobjects.colorValueToHexString("", "#ffffff"), "#ffffff")
    assert.equal(sceneobjects.colorValueToHexString("   ", "#ffffff"), "#ffffff")
    assert.equal(sceneobjects.colorValueToHexString(Number.NaN, "#ffffff"), "#ffffff")
    // non-finite numbers and out-of-range values are masked, not trusted
    assert.equal(sceneobjects.colorValueToHexString(Number.POSITIVE_INFINITY, "#ffffff"), "#ffffff")
    assert.equal(sceneobjects.colorValueToHexString(-1, "#ffffff"), "#ffffff")
    assert.equal(sceneobjects.colorValueToHexString(0x1ff0000, "#ffffff"), "#ff0000")
})

/* ===================== TintProperty (numeric tint) ===================== */

test("TintProperty.setValue accepts numeric tint without turning it into 0 (black)", () => {

    const obj = {}
    const prop = sceneobjects.TintProperty("tintTopLeft", "Tint Top Left")

    prop.setValue(obj, 0xff0000)

    // the live tint MUST be the real color, not the old silent 0
    assert.equal(obj.tintTopLeft, PhaserColor(0xff, 0x00, 0x00))

    // the model cache is what writeJSON persists: it MUST be the canonical
    // #hex string, never the raw number (raw numbers re-threw on every load)
    assert.equal(obj["tint_tintTopLeft"], "#ff0000")
    assert.equal(typeof obj["tint_tintTopLeft"], "string")
})

test("TintProperty round-trip: numeric JSON value survives reload as a string", () => {

    const obj = {}
    const prop = sceneobjects.TintProperty("tintBottomLeft", "Tint Bottom Left")

    // first load from a numeric scene/prefab JSON
    prop.setValue(obj, 16711680)

    // save + reload through the same property (readJSON -> setValue again)
    const persisted = obj["tint_tintBottomLeft"]
    const reloaded = {}
    prop.setValue(reloaded, persisted)

    assert.equal(reloaded.tintBottomLeft, PhaserColor(0xff, 0x00, 0x00))
    assert.equal(reloaded["tint_tintBottomLeft"], "#ff0000")
})

test("colorStringToColorNumberConverter (valueToCodeConverter) accepts numbers", () => {

    assert.equal(sceneobjects.colorStringToColorNumberConverter(0xff0000), PhaserColor(0xff, 0x00, 0x00))
    assert.equal(sceneobjects.colorStringToColorNumberConverter("#ff0000"), PhaserColor(0xff, 0x00, 0x00))
    assert.equal(sceneobjects.colorStringToColorNumberConverter("0xff0000"), PhaserColor(0xff, 0x00, 0x00))
    assert.equal(sceneobjects.colorStringToColorNumberConverter(""), PhaserColor(0xff, 0xff, 0xff))
})

/* ===================== NumberColorProperty (shapes / FX) ===================== */

test("NumberColorProperty.setValue normalizes numeric colors (shape fillColor)", () => {

    const obj = {}
    const prop = sceneobjects.NumberColorProperty("fillColor", "#fff", "Fill Color", "phaser:Phaser.GameObjects.Shape.fillColor")

    prop.setValue(obj, 0x9bddb3)

    assert.equal(obj.fillColor, PhaserColor(0x9b, 0xdd, 0xb3))
    assert.equal(obj["color__fillColor"], "#9bddb3")

    // string path unchanged
    prop.setValue(obj, "#123456")
    assert.equal(obj.fillColor, PhaserColor(0x12, 0x34, 0x56))
    assert.equal(obj["color__fillColor"], "#123456")

    // empty string falls back to the property default
    prop.setValue(obj, "")
    assert.equal(obj.fillColor, PhaserColor(0xff, 0xff, 0xff))
})

test("NumberColorPropertyCodeDomAdapter emits the numeric color from the cache", () => {

    const base = sceneobjects.NumberColorProperty("fillColor", "#fff", "Fill Color", "phaser:Phaser.GameObjects.Shape.fillColor")
    const obj = {}

    base.setValue(obj, 0x1a2b3c)

    const adapter = sceneobjects.NumberColorPropertyCodeDomAdapter(base)

    assert.equal(adapter.getValue(obj), PhaserColor(0x1a, 0x2b, 0x3c))
})

/* ===================== FXColorProperty ===================== */

test("FXColorProperty normalizes numeric values before applying to the live FX", () => {

    const applied = []
    const fx = {}
    const prop = sceneobjects.FXColorProperty(
        "color", "#ff33b2", "Ring Color", "The colour of the circular outline.",
        (target, hex) => applied.push(hex))

    prop.setValue(fx, 0xffd24a)

    assert.deepEqual(applied, ["#ffd24a"])
    assert.equal(fx["color__color"], "#ffd24a")

    // string path unchanged
    prop.setValue(fx, "#2233aa")
    assert.deepEqual(applied, ["#ffd24a", "#2233aa"])
    assert.equal(fx["color__color"], "#2233aa")
})

/* ===================== colorValueToNumber (FX wrappers / codegen) ===================== */

test("colorValueToNumber parses both representations for Phaser APIs and codegen", () => {

    assert.equal(sceneobjects.colorValueToNumber("#ffd24a", 0), 0xffd24a)
    assert.equal(sceneobjects.colorValueToNumber("ffd24a", 0), 0xffd24a)
    assert.equal(sceneobjects.colorValueToNumber("0xffd24a", 0), 0xffd24a)
    // numbers already stored by NumberColorProperty pass through untouched
    assert.equal(sceneobjects.colorValueToNumber(0xffd24a, 0), 0xffd24a)
    // unusable values fall back to the provided default
    assert.equal(sceneobjects.colorValueToNumber(undefined, 0xff0000), 0xff0000)
    assert.equal(sceneobjects.colorValueToNumber(null, 0xff0000), 0xff0000)
    assert.equal(sceneobjects.colorValueToNumber("", 0xff0000), 0xff0000)
    assert.equal(sceneobjects.colorValueToNumber("not-a-color", 0xff0000), 0xff0000)
    assert.equal(sceneobjects.colorValueToNumber(Number.NaN, 0xff0000), 0xff0000)
})

/* ===================== FX helper objects ===================== */

test("FX render helpers are marked and detected by isFXHelperObject", () => {

    // the marker must survive on plain Phaser objects (Rectangle/Graphics/Gradient)
    const helper = { name: "phaser-rectangle" }

    assert.equal(sceneobjects.isFXHelperObject(helper), false)

    sceneobjects.markFXHelperObject(helper)

    assert.equal(sceneobjects.isFXHelperObject(helper), true)
    assert.equal(sceneobjects.isFXHelperObject(null), false)
    assert.equal(sceneobjects.isFXHelperObject(undefined), false)
    assert.equal(sceneobjects.isFXHelperObject({}), false)
})
