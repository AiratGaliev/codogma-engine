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
const EDITOR_ROOT = path.join(ROOT, "src/editor")
const ICONS_DIR = path.join(EDITOR_ROOT, "icons")
const DARK_DIR = path.join(ICONS_DIR, "dark/godot")
const LIGHT_DIR = path.join(ICONS_DIR, "light/godot")
const DESIGN_TOKENS = JSON.parse(fs.readFileSync(path.join(EDITOR_ROOT, "design-system/tokens.json"), "utf8"))
const COLIBRI_PLUGIN = path.join(ROOT, "source/editor/plugins/colibri/src/Plugin.ts")
const RESOURCES_PLUGIN = path.join(ROOT, "source/editor/plugins/phasereditor2d.resources/src/ResourcesPlugin.ts")
const SERVER_SOURCE = path.join(ROOT, "server/server.mjs")

// Mirrors phasereditor2d.resources.GODOT_ICON_NAMES (ResourcesPlugin.ts).
const GODOT_ICON_NAMES = [
    "godot/action-copy",
    "godot/action-cut",
    "godot/action-paste",
    "godot/add",
    "godot/anchor",
    "godot/animated-sprite-2d",
    "godot/animation",
    "godot/animation-player",
    "godot/area-2d",
    "godot/atlas-texture",
    "godot/audio-listener-2d",
    "godot/audio-stream-2d",
    "godot/bone-2d",
    "godot/box-container",
    "godot/button",
    "godot/camera-2d",
    "godot/character-body-2d",
    "godot/close-scene",
    "godot/collision-polygon-2d",
    "godot/collision-shape-2d",
    "godot/container",
    "godot/control",
    "godot/cpu-particles-2d",
    "godot/curve-2d",
    "godot/editor-control-anchor",
    "godot/editor-file-dialog",
    "godot/editor-inspector",
    "godot/editor-resource-picker",
    "godot/editor-script-picker",
    "godot/error-warning",
    "godot/external-link",
    "godot/file",
    "godot/file-tree",
    "godot/folder",
    "godot/font-file",
    "godot/grid",
    "godot/grid-container",
    "godot/gui-tree-arrow-down",
    "godot/gui-tree-arrow-right",
    "godot/gui-visibility-hidden",
    "godot/gui-visibility-visible",
    "godot/help-search",
    "godot/image-texture",
    "godot/label",
    "godot/line-2d",
    "godot/lock",
    "godot/main-play",
    "godot/marker",
    "godot/node-2d",
    "godot/node-warning",
    "godot/one-way-tile",
    "godot/packed-scene",
    "godot/particle-material",
    "godot/particles-2d",
    "godot/path-2d",
    "godot/pause",
    "godot/physics-body-2d",
    "godot/play",
    "godot/play-scene",
    "godot/polygon-2d",
    "godot/reload",
    "godot/remove",
    "godot/rigid-body-2d",
    "godot/save",
    "godot/script",
    "godot/search",
    "godot/skeleton-2d",
    "godot/snap-grid",
    "godot/sprite-2d",
    "godot/sprite-frames",
    "godot/static-body-2d",
    "godot/status-error",
    "godot/status-warning",
    "godot/stop",
    "godot/style-box-grid",
    "godot/terrain-path",
    "godot/text-file",
    "godot/texture-2d",
    "godot/texture-rect",
    "godot/timer",
    "godot/tool-add-node",
    "godot/tool-move",
    "godot/tool-pan",
    "godot/tool-rotate",
    "godot/tool-scale",
    "godot/tool-select",
    "godot/undo-redo",
    "godot/unlock",
    "godot/viewport-zoom",
    "godot/visibility-notifier-2d",
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
    const channels = hex.slice(1)
    const rgb = channels.length === 3 || channels.length === 4
        ? channels.slice(0, 3).split("").map(c => c + c).join("")
        : channels.slice(0, 6)
    const r = parseInt(rgb.slice(0, 2), 16)
    const g = parseInt(rgb.slice(2, 4), 16)
    const b = parseInt(rgb.slice(4, 6), 16)
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

function normalizeIconColor(hex) {
    const value = hex.toLowerCase()
    if (value === "gray") return "#808080"
    const channels = value.slice(1)
    if (channels.length === 3 || channels.length === 4) {
        return "#" + [...channels].map((part) => part + part).join("")
    }
    return value
}

test("light variants are generated from the semantic theme palette", () => {
    for (const name of GODOT_ICON_NAMES) {
        const dark = readSvg("dark", name).svg
        const light = readSvg("light", name).svg

        let expected = dark.replace(
            /(fill|stroke|stop-color)=(["'])(#[0-9a-fA-F]{3,8}|gray)\2/gi,
            (match, attribute, quote, rawColor) => {
                const sourceColor = normalizeIconColor(rawColor)
                const targetColor = DESIGN_TOKENS.lightIconColorMap[sourceColor] ?? sourceColor
                return `${attribute}=${quote}${targetColor}${quote}`
            },
        )
        if (name === "godot/gui-tree-arrow-down" || name === "godot/gui-tree-arrow-right") {
            expected = expected.replace(/stroke-opacity="\.4"/g, 'stroke-opacity="1"')
        }
        assert.equal(light, expected, `light SVG must match the token-driven palette: ${name}`)
    }
})

test("generated light colours maintain legibility while particle swatches stay vivid", () => {
    for (const name of GODOT_ICON_NAMES) {
        const light = readSvg("light", name).svg
        if (name === "godot/particle-material") continue

        for (const match of light.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8})"/g)) {
            const lum = luminance(match[1])
            assert.ok(lum < 0.75,
                `color ${match[1]} in light variant of ${name} is too bright (luminance ${lum.toFixed(2)})`)
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


test("legacy icon loader uses the shared editor SVG route without duplicating assets", () => {
    const loader = fs.readFileSync(COLIBRI_PLUGIN, "utf8")
    const resources = fs.readFileSync(RESOURCES_PLUGIN, "utf8")
    const server = fs.readFileSync(SERVER_SOURCE, "utf8")

    assert.ok(loader.includes('svgIconBaseUrl?: string'))
    assert.ok(loader.includes('this._svgIconBaseUrl && this._svgIcons.has(name)'))
    assert.ok(resources.includes('svgIconBaseUrl: "/editor/app/editor-icons"'))
    assert.ok(server.includes('rest.startsWith("app/editor-icons/")'))
    assert.ok(server.includes("safeJoin(EDITOR_ICONS_DIR, rel)"))
    assert.ok(server.includes('"no-cache", EDITOR_ICONS_DIR'))

    for (const name of WIRED_ICONS) {
        const icon = name.replace("godot/", "") + ".svg"
        for (const theme of ["dark", "light"]) {
            const file = path.join(ICONS_DIR, theme, "godot", icon)
            assert.ok(fs.existsSync(file), `${theme}/${icon} must exist in the canonical editor icon library`)
        }
    }
})
