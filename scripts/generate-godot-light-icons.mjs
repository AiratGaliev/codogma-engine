/**
 * Generate contrast-safe light Godot icons from the pinned dark SVG sources.
 *
 * The color map is part of design-system/tokens.json. Particle-material keeps
 * its multi-colour particle swatches because they represent actual particle
 * preview colours rather than UI accents.
 *
 * Run: node scripts/generate-godot-light-icons.mjs
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const TOKENS = JSON.parse(fs.readFileSync(path.join(ROOT, "design-system/tokens.json"), "utf8"))
const DARK_DIR = path.join(ROOT, "source/editor/plugins/phasereditor2d.resources/icons/dark/godot")
const LIGHT_DIR = path.join(ROOT, "source/editor/plugins/phasereditor2d.resources/icons/light/godot")

function normalizeColor(hex) {
    const value = hex.trim().toLowerCase()
    const match = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)
    if (!match) return value

    let body = match[1]
    if (body.length === 3 || body.length === 4) {
        body = [...body].map((character) => character + character).join("")
    }
    return "#" + body
}

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
    openTag = openTag
        .replace(/width="\d+(?:\.\d+)?"/, 'width="16"')
        .replace(/height="\d+(?:\.\d+)?"/, 'height="16"')

    return svg.replace(sizeMatch[0], openTag)
}

function generateLightVariant(svg, fileName) {
    let light = svg.replace(
        /(fill|stroke|stop-color)=(["'])(#[0-9a-fA-F]{3,8}|gray)\2/gi,
        (match, attribute, quote, rawColor) => {
            const sourceColor = normalizeColor(rawColor)
            const targetColor = TOKENS.lightIconColorMap[sourceColor] ?? sourceColor
            if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(targetColor)) {
                throw new Error(`Invalid light icon colour ${targetColor} in ${fileName}`)
            }
            return `${attribute}=${quote}${targetColor}${quote}`
        },
    )

    // The tree disclosure chevrons were designed as 40%-opacity white glyphs
    // for Godot's dark theme. In the light theme opacity must not reduce the
    // contrast of the muted neutral token after its base colour is remapped.
    if (fileName === "gui-tree-arrow-down.svg" || fileName === "gui-tree-arrow-right.svg") {
        light = light.replace(/stroke-opacity="\.4"/g, 'stroke-opacity="1"')
    }

    return light
}

fs.mkdirSync(LIGHT_DIR, { recursive: true })
const files = fs.readdirSync(DARK_DIR).filter((file) => file.endsWith(".svg")).sort()
const changedFiles = []
const preservedFiles = []

for (const file of files) {
    const sourcePath = path.join(DARK_DIR, file)
    const dark = normalizeRoot(fs.readFileSync(sourcePath, "utf8"))
    if (dark !== fs.readFileSync(sourcePath, "utf8")) {
        fs.writeFileSync(sourcePath, dark)
    }

    const light = generateLightVariant(dark, file)
    fs.writeFileSync(path.join(LIGHT_DIR, file), light, "utf8")
    if (light === dark) preservedFiles.push(file)
    else changedFiles.push(file)
}

console.log(JSON.stringify({
    sourceIconCount: files.length,
    recolouredLightIcons: changedFiles.length,
    palettePreservedIcons: preservedFiles.length,
    sourceTheme: "dark",
    generatedTheme: "light",
    tokenSource: "design-system/tokens.json",
    lightColorMapEntries: Object.keys(TOKENS.lightIconColorMap).length,
    examples: changedFiles.slice(0, 12),
}, null, 2))
