/**
 * Regression tests for the bundled Godot editor icons (node:test).
 *
 * Guards the integration contract:
 *   - every name in the resources plugin's GODOT_ICON_NAMES list has a dark
 *     and a light SVG file on disk, and vice versa;
 *   - every SVG declares the 16x16 editor icon size;
 *   - light variants differ from the dark ones exactly for icons that contain
 *     bright grayscale glyphs (recolor rule of
 *     scripts/generate-godot-light-icons.mjs);
 *   - generated light colors are dark enough for the light theme background.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const ICONS_DIR = path.join(ROOT, "source/editor/plugins/phasereditor2d.resources/icons")
const DARK_DIR = path.join(ICONS_DIR, "dark/godot")
const LIGHT_DIR = path.join(ICONS_DIR, "light/godot")
const COLIBRI_PLUGIN = path.join(ROOT, "source/editor/plugins/colibri/src/Plugin.ts")

// Mirrors phasereditor2d.resources.GODOT_ICON_NAMES (ResourcesPlugin.ts).
const GODOT_ICON_NAMES = [
    "godot/reload", "godot/search", "godot/external-link", "godot/marker",
    "godot/node-2d", "godot/sprite-2d", "godot/collision-shape-2d", "godot/camera-2d",
    "godot/timer", "godot/audio-stream-2d", "godot/path-2d", "godot/animation-player",
    "godot/particles-2d", "godot/particle-material", "godot/bone-2d", "godot/curve-2d",
    "godot/visibility-notifier-2d"
]

// Extracted from ResourcesPlugin.ts: the icons the editor UI actually wires
// into commands; they must stay registered and present.
const WIRED_ICONS = ["godot/reload", "godot/search", "godot/external-link", "godot/marker"]

function readSvg(variant, name) {
    const file = path.join(ICONS_DIR, variant, "godot", `${name.replace("godot/", "")}.svg`)
    assert.ok(fs.existsSync(file), `missing icon file: ${path.relative(ROOT, file)}`)
    return { file, svg: fs.readFileSync(file, "utf8") }
}

function luminance(hex) {
    const body = hex.length === 4
        ? hex.slice(1).split("").map(c => c + c).join("")
        : hex.slice(1)
    const r = parseInt(body.slice(0, 2), 16)
    const g = parseInt(body.slice(2, 4), 16)
    const b = parseInt(body.slice(4, 6), 16)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

test("every registered Godot icon exists as dark and light SVG", () => {
    for (const name of GODOT_ICON_NAMES) {
        readSvg("dark", name)
        readSvg("light", name)
    }
})

test("the SVG file sets on disk match the registered names exactly", () => {
    for (const variant of ["dark", "light"]) {
        const dir = path.join(ICONS_DIR, variant, "godot")
        const onDisk = fs.readdirSync(dir).filter(f => f.endsWith(".svg"))
            .map(f => `godot/${f.slice(0, -4)}`).sort()
        assert.deepEqual(onDisk, [...GODOT_ICON_NAMES].sort(),
            `${variant} icon files must match GODOT_ICON_NAMES (no dead or missing assets)`)
    }
})

test("Godot icons use the 16x16 editor icon size", () => {
    for (const name of GODOT_ICON_NAMES) {
        const { file, svg } = readSvg("dark", name)
        assert.match(svg, /width="16"/, `width=16 expected in ${file}`)
        assert.match(svg, /height="16"/, `height=16 expected in ${file}`)
    }
})

test("light variants recolor bright glyphs and keep dim chromatic icons", () => {
    for (const name of GODOT_ICON_NAMES) {
        const dark = readSvg("dark", name).svg
        const light = readSvg("light", name).svg

        const darkColors = [...dark.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{6})"/g)].map(m => m[1])
        const needsRecolor = darkColors.some(hex => {
            const r = parseInt(hex.slice(1, 3), 16)
            const g = parseInt(hex.slice(3, 5), 16)
            const b = parseInt(hex.slice(5, 7), 16)
            const lumReal = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
            const grayscale = Math.max(r, g, b) - Math.min(r, g, b) <= 8
            // grayscale glyphs brighter than 0.6 and any color brighter than
            // 0.8 must be darkened for the light theme
            return grayscale ? lumReal > 0.6 : lumReal > 0.8
        })

        if (needsRecolor) {
            assert.notEqual(light, dark, `light variant must recolor bright glyphs: ${name}`)
        } else {
            assert.equal(light, dark, `chromatic icon must pass through unchanged: ${name}`)
        }
    }
})

test("generated light colors are dark enough for the light theme", () => {
    for (const name of GODOT_ICON_NAMES) {
        const light = readSvg("light", name).svg
        for (const m of light.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{6})"/g)) {
            const lum = luminance(m[1])
            assert.ok(lum < 0.75,
                `color ${m[1]} in light variant of ${name} is too bright (luminance ${lum.toFixed(2)})`)
        }
    }
})

test("icons wired into editor commands stay registered", () => {
    for (const name of WIRED_ICONS) {
        assert.ok(GODOT_ICON_NAMES.includes(name), `${name} must stay registered`)
    }
})

test("the Godot icons MIT license file is shipped", () => {
    const license = path.join(ICONS_DIR, "GODOT-ICONS-LICENSE.txt")
    assert.ok(fs.existsSync(license), "GODOT-ICONS-LICENSE.txt must exist next to the icons")
    const text = fs.readFileSync(license, "utf8")
    assert.match(text, /Godot Engine contributors/, "license must credit Godot Engine contributors")
    assert.match(text, /Permission is hereby granted, free of charge/, "license must be the MIT grant")
})


test("SVG icon loader requests existing theme-specific asset paths", () => {
    const source = fs.readFileSync(COLIBRI_PLUGIN, "utf8")
    assert.ok(source.includes('? `${theme}/${name}.svg`'),
        "SVG icon paths must include dark/ or light/ before the registered icon name")
    assert.ok(source.includes('darkImage = this.getThemeIcon(name, "dark");'))
    assert.ok(source.includes('lightImage = this.getThemeIcon(name, "light");'))
})
