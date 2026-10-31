import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const TOKENS = JSON.parse(fs.readFileSync(path.join(ROOT, "design-system/tokens.json"), "utf8"))
const DEFAULT_INPUT = path.join(ROOT, "codogma-editor.pen")

function fail(message) {
    throw new Error(message)
}

function createPenVariables() {
    const variables = {}
    for (const [name, definition] of Object.entries(TOKENS.variables)) {
        if (definition.type) {
            variables[name] = { type: definition.type, value: definition.value }
            continue
        }
        variables[name] = {
            type: "color",
            value: TOKENS.themes.map((mode) => ({
                value: definition[mode],
                theme: { mode },
            })),
        }
    }
    return variables
}

function replaceColorReferences(value, theme, counters, propertyKey) {
    const isColorProperty = propertyKey === "fill" || propertyKey === "stroke" || propertyKey === "color"
    if (isColorProperty && typeof value === "string" && value.startsWith("$")) {
        const token = value.slice(1)
        if (!Object.hasOwn(TOKENS.variables, token)) fail("Unknown design token: " + value)
        counters[token] = (counters[token] ?? 0) + 1
        return value
    }
    if (isColorProperty && typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value)) {
        const token = TOKENS.uiColorTokens[theme]?.[value.toLowerCase()]
        if (!token) return value
        counters[token] = (counters[token] ?? 0) + 1
        return "$" + token
    }
    if (Array.isArray(value)) {
        return value.map((item) => replaceColorReferences(item, theme, counters, propertyKey))
    }
    if (value && typeof value === "object") {
        const result = {}
        for (const [key, child] of Object.entries(value)) {
            result[key] = replaceColorReferences(child, theme, counters, key)
        }
        return result
    }
    return value
}

function apply(document) {
    if (document.version !== "2.21" || !Array.isArray(document.children)) {
        fail("Unsupported or invalid Pencil .pen document")
    }
    document.variables = createPenVariables()

    const counters = {}
    const seenModes = new Set()
    let themedIconFrames = 0
    let tokenizedIconPaths = 0
    let unfilledIconPaths = 0
    let gradientIconPaths = 0
    let gradientStopTokenCount = 0

    function visit(node, inheritedTheme, isRoot = false) {
        const theme = node.theme?.mode ?? inheritedTheme
        if (!TOKENS.themes.includes(theme)) fail("Unknown theme mode on " + (node.name ?? node.id) + ": " + theme)
        seenModes.add(theme)

        if (node.metadata?.type === "godot-svg-source") {
            themedIconFrames++
            if (node.theme?.mode !== theme) fail("Godot icon frame has no explicit theme: " + node.name)
            if (!node.children?.length) fail("Godot icon has no vector paths: " + node.name)
            for (const child of node.children) {
                if (child.type !== "path") fail("Godot icon contains a non-path child: " + node.name)
                if (typeof child.fill === "string" && child.fill.startsWith("$")) {
                    tokenizedIconPaths++
                } else if (child.fill?.type === "gradient") {
                    gradientIconPaths++
                    gradientStopTokenCount += (child.fill.colors ?? []).filter((stop) =>
                        typeof stop.color === "string" && stop.color.startsWith("$"),
                    ).length
                } else if (child.fill === undefined || child.fill === "none") {
                    unfilledIconPaths++
                } else {
                    fail("Godot icon contains a non-tokenized fill: " + node.name + " / " + child.id)
                }
            }
        }

        if (node !== document) {
            const foundationArtboard = isRoot && node.name === "00 - Foundations and UI components"
            for (const key of ["fill", "stroke", "effect", "content"]) {
                if (foundationArtboard && key !== "fill" && key !== "stroke") continue
                if (Object.hasOwn(node, key)) {
                    node[key] = replaceColorReferences(node[key], theme, counters, key)
                }
            }
        }

        if (Array.isArray(node.children)) {
            for (const child of node.children) visit(child, theme)
        }
    }

    for (const board of document.children) visit(board, board.theme?.mode ?? "dark", true)

    const tokenReferences = Object.values(counters).reduce((total, count) => total + count, 0)
    if (tokenReferences === 0) fail("No colour values were connected to design tokens")
    if (themedIconFrames !== 304) fail("Expected 304 imported Godot icon instances; found " + themedIconFrames)
    if (tokenizedIconPaths !== 290) fail("Expected 290 tokenized Godot path fills; found " + tokenizedIconPaths)
    if (gradientIconPaths !== 1 || gradientStopTokenCount !== 12) fail("Particle material gradient was not fully tokenized")
    if (unfilledIconPaths !== 59) fail("Unexpected number of intentionally unfilled Godot vector paths: " + unfilledIconPaths)

    return {
        artboards: document.children.length,
        themeModes: [...seenModes].sort(),
        colorTokenCount: Object.keys(TOKENS.variables).length,
        colorReferencesCreated: tokenReferences,
        tokenUsage: Object.fromEntries(Object.entries(counters).sort((a, b) => b[1] - a[1])),
        godotIconFrames: themedIconFrames,
        tokenizedGodotPathFills: tokenizedIconPaths,
        unfilledGodotPaths: unfilledIconPaths,
        gradientGodotPaths: gradientIconPaths,
        gradientStopTokenCount,
    }
}

const [inputArgument, outputArgument] = process.argv.slice(2)
const inputPath = path.resolve(inputArgument ?? DEFAULT_INPUT)
const outputPath = path.resolve(outputArgument ?? inputPath)
const document = JSON.parse(fs.readFileSync(inputPath, "utf8"))
const summary = apply(document)
fs.writeFileSync(outputPath, JSON.stringify(document, null, 2) + "\n", "utf8")
console.log(JSON.stringify({ inputPath, outputPath, ...summary }, null, 2))
