/**
 * Generates the light-theme variants of the bundled Godot editor icons.
 *
 * Godot's dark-editor icons use a near-white glyph color (#e0e0e0) that is
 * unreadable on the editor's light theme background. Godot's own theme
 * generator solves this by darkening bright, desaturated icon colors for the
 * light theme while keeping chromatic accents untouched. This script applies
 * the same rules plus two size/contrast normalizations:
 *
 *   1. Root normalization: every icon renders in the editor's 16x16 grid;
 *      files without an explicit viewBox (e.g. Marker.svg is 10x10) get one
 *      derived from their declared size, and the root is set to 16x16 so all
 *      icons align and scale consistently.
 *   2. Recoloring for the light background:
 *      - grayscale colors (r ≈ g ≈ b) with luminance > 0.6 are scaled by 0.32
 *        (#e0e0e0 → ~#484848, WCAG-safe on white);
 *      - very bright chromatic colors (luminance > 0.8, e.g. #ffe345 yellow)
 *        keep their hue/saturation but their HSL lightness is clamped to 0.5;
 *      - other chromatic colors (#8da5f3 blue, #c38ef1 purple) pass through.
 *
 * Run:  node scripts/generate-godot-light-icons.mjs
 * Idempotent: re-running overwrites the generated files with the same output.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DARK_DIR = path.join(ROOT, "source/editor/plugins/phasereditor2d.resources/icons/dark/godot")
const LIGHT_DIR = path.join(ROOT, "source/editor/plugins/phasereditor2d.resources/icons/light/godot")

const LUMINANCE_THRESHOLD = 0.6
const DARKEN_FACTOR = 0.32
const BRIGHT_CHROMATIC_LUMINANCE = 0.8
const MAX_LIGHT_THEME_LUMINANCE = 0.75

function parseColor(hex) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
    if (!m) return null
    let body = m[1]
    if (body.length === 3) {
        body = body.split("").map(c => c + c).join("")
    }
    return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16)
    }
}

function formatColor({ r, g, b }) {
    const to2 = n => n.toString(16).padStart(2, "0")
    return `#${to2(r)}${to2(g)}${to2(b)}`
}

function isGrayscale({ r, g, b }) {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    return max - min <= 8
}

function luminance({ r, g, b }) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function darkenForLightTheme(hex) {
    const color = parseColor(hex)
    if (!color) return hex
    if (isGrayscale(color)) {
        if (luminance(color) <= LUMINANCE_THRESHOLD) return hex
        return formatColor({
            r: Math.round(color.r * DARKEN_FACTOR),
            g: Math.round(color.g * DARKEN_FACTOR),
            b: Math.round(color.b * DARKEN_FACTOR)
        })
    }
    if (luminance(color) <= BRIGHT_CHROMATIC_LUMINANCE) return hex
    // Bright chromatic accent (e.g. #ffe345): keep hue/saturation and find the
    // highest HSL lightness whose perceived luminance fits the light theme
    // (binary search — yellow needs a much lower L than magenta for the same
    // luminance, so a fixed clamp is not enough).
    const hsl = rgbToHsl(color.r, color.g, color.b)
    let low = 0
    let high = hsl.l
    while (high - low > 1 / 255) {
        const mid = (low + high) / 2
        const rgb = hslToRgb(hsl.h, hsl.s, mid)
        if (luminance(rgb) > MAX_LIGHT_THEME_LUMINANCE) high = mid
        else low = mid
    }
    return formatColor(hslToRgb(hsl.h, hsl.s, low))
}

function rgbToHsl(r, g, b) {
    const rf = r / 255, gf = g / 255, bf = b / 255
    const max = Math.max(rf, gf, bf)
    const min = Math.min(rf, gf, bf)
    const l = (max + min) / 2
    if (max === min) return { h: 0, s: 0, l }
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h
    if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6
    else if (max === gf) h = ((bf - rf) / d + 2) / 6
    else h = ((rf - gf) / d + 4) / 6
    return { h, s, l }
}

function hslToRgb(h, s, l) {
    if (s === 0) {
        const v = Math.round(l * 255)
        return { r: v, g: v, b: v }
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const channel = t => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
    }
    return {
        r: Math.round(channel(h + 1 / 3) * 255),
        g: Math.round(channel(h) * 255),
        b: Math.round(channel(h - 1 / 3) * 255)
    }
}

/**
 * Editor icons all render in a 16x16 grid. Files declaring a different
 * intrinsic size (Marker.svg ships as 10x10) keep their geometry through a
 * viewBox and are displayed at 16x16 like the rest of the set.
 */
function normalizeRoot(svg) {
    const sizeMatch = /<svg[^>]*?width="(\d+(?:\.\d+)?)"[^>]*?height="(\d+(?:\.\d+)?)"[^>]*?>/.exec(svg)
    if (!sizeMatch) return svg

    const declaredWidth = Number(sizeMatch[1])
    const declaredHeight = Number(sizeMatch[2])
    if (declaredWidth === 16 && declaredHeight === 16 && /viewBox="/.test(svg)) return svg

    let openTag = sizeMatch[0]
    if (!/viewBox="/.test(openTag)) {
        openTag = openTag.replace(/<svg/, `<svg viewBox="0 0 ${declaredWidth} ${declaredHeight}"`)
    }
    openTag = openTag.replace(/width="\d+(?:\.\d+)?"/, "width=\"16\"")
        .replace(/height="\d+(?:\.\d+)?"/, "height=\"16\"")

    return svg.replace(sizeMatch[0], openTag)
}

function generateLightVariant(svg) {
    return svg
        .replace(/(fill|stroke|stop-color)="(#[0-9a-fA-F]{3,6})"/g,
            (_, attr, hex) => `${attr}="${darkenForLightTheme(hex)}"`)
}

fs.mkdirSync(LIGHT_DIR, { recursive: true })

const files = fs.readdirSync(DARK_DIR).filter(f => f.endsWith(".svg"))

for (const file of files) {
    const svg = normalizeRoot(fs.readFileSync(path.join(DARK_DIR, file), "utf8"))

    // Write the normalized dark file back so dark and light stay in sync.
    fs.writeFileSync(path.join(DARK_DIR, file), svg)

    const light = generateLightVariant(svg)
    fs.writeFileSync(path.join(LIGHT_DIR, file), light)
    const changed = light !== svg
    console.log(`${changed ? "recolored" : "as-is    "} ${file}`)
}

console.log(`\n${files.length} light variants written to ${path.relative(ROOT, LIGHT_DIR)}`)
