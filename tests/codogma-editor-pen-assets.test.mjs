import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import test from "node:test"

const ROOT = process.cwd()
const EDITOR_ROOT = path.join(ROOT, "src/editor")
const PEN_PATH = path.join(EDITOR_ROOT, "codogma-editor.pen")
const PEN = JSON.parse(fs.readFileSync(PEN_PATH, "utf8"))
const GODOT_SOURCE_REVISION = "95c0fa5fe8a019adc29d074c16b64469b04571f7"

function walk(node, visitor) {
    if (!node || typeof node !== "object") return
    visitor(node)
    for (const child of node.children ?? []) walk(child, visitor)
}

function collectGodotIconFrames() {
    const frames = []
    walk(PEN, (node) => {
        if (node.metadata?.type === "godot-svg-source") frames.push(node)
    })
    return frames
}

function collectImageFills() {
    const images = []
    walk(PEN, (node) => {
        if (node.fill?.type === "image") images.push({ node, fill: node.fill })
    })
    return images
}

const godotFrames = collectGodotIconFrames()
const imageFills = collectImageFills()

test("Godot icons are native vector paths, not PNG image fills", () => {
    assert.equal(godotFrames.length, 332, "all Godot icon instances, including compact Workbench, must be converted")
    assert.equal(imageFills.filter(({ fill }) => fill.url?.startsWith("./design-assets/godot-icons/")).length, 0)
    assert.ok(!fs.existsSync(path.join(ROOT, "design-assets", "godot-icons")),
        "raster preview copies must not be kept in the repository")

    for (const frame of godotFrames) {
        assert.equal(frame.type, "frame", frame.name + " must remain a frame")
        assert.ok(Array.isArray(frame.children) && frame.children.length > 0,
            frame.name + " must contain editable vector paths")
        assert.equal(frame.layout, "none", frame.name + " must position SVG paths over the full icon box")
        assert.notEqual(frame.fill?.type, "image", frame.name + " must not retain an image fill")

        for (const child of frame.children) {
            assert.equal(child.type, "path", frame.name + " must contain native path nodes")
            assert.ok(typeof child.geometry === "string" && child.geometry.length > 0,
                child.name + " must retain SVG path geometry")
            assert.ok(Array.isArray(child.viewBox) && child.viewBox.length === 4,
                child.name + " must declare its SVG viewBox")
            assert.ok(child.width > 0 && child.height > 0, child.name + " must have non-zero bounds")
        }
    }
})

test("each vector icon links back to its pinned official Godot SVG source", () => {
    const uniqueSources = new Set()
    const themeCounts = { dark: 0, light: 0 }

    for (const frame of godotFrames) {
        const source = frame.metadata.source
        const match = source?.match(/^\.\/icons\/(dark|light)\/godot\/([^/]+)\.svg$/)
        assert.ok(match, frame.name + " must have a source SVG link")
        assert.equal(frame.metadata.revision, GODOT_SOURCE_REVISION)
        assert.equal(frame.metadata.license, "MIT")

        const [, theme, iconName] = match
        themeCounts[theme]++
        uniqueSources.add(theme + "/" + iconName)
        const sourcePath = path.resolve(EDITOR_ROOT, source.slice(2))
        assert.ok(fs.existsSync(sourcePath), frame.name + " source SVG must exist")
        assert.ok(fs.readFileSync(sourcePath, "utf8").includes("<svg"),
            frame.name + " source must remain an SVG document")
    }

    assert.equal(themeCounts.dark, 268)
    assert.equal(themeCounts.light, 64)
    assert.equal(uniqueSources.size, 122)
})

test("the remaining raster image fills are only the original dinosaur preview", () => {
    assert.equal(imageFills.length, 18)
    for (const { fill } of imageFills) {
        assert.equal(fill.url, "../../tests/workspace/test-typescript/assets/dino.png")
        assert.ok(fs.existsSync(path.resolve(EDITOR_ROOT, fill.url)), "Dino preview asset must resolve from the Pen document")
    }
})

test("all nodes follow Pencil container rules", () => {
    const invalid = []
    walk(PEN, (node) => {
        if (node !== PEN && !["frame", "group"].includes(node.type) && Object.hasOwn(node, "children")) {
            invalid.push({ id: node.id, name: node.name, type: node.type })
        }
    })
    assert.deepEqual(invalid, [], "only frame/group nodes may have a children property")
})

test("the .pen document keeps all eleven editor and design-system artboards", () => {
    assert.equal(PEN.children.length, 11)
    assert.deepEqual(
        PEN.children.map((node) => node.name),
        [
            "00 - Foundations and UI components",
            "01 - Workbench Dark",
            "02 - Workbench Light",
            "03 - Animation workspace and command palette",
            "04 - Game Preview and diagnostics",
            "05 - Sprite Authoring and Import",
            "06 - Future Capability Map",
            "07 - Additional 2D editor surfaces",
            "08 - Godot editor icon library",
            "09 - Design token reference & contrast",
            "10 - Compact Workbench 1280 × 720",
        ],
    )
})

test("compact Workbench preserves minimum panels and collapses secondary docks", () => {
    const board = PEN.children.find((node) => node.name === "10 - Compact Workbench 1280 × 720")
    assert.ok(board, "compact Workbench artboard must exist")
    assert.deepEqual(
        { x: board.x, y: board.y, width: board.width, height: board.height },
        { x: 0, y: 5100, width: 1280, height: 720 },
    )

    const child = (name) => {
        const node = board.children.find((item) => item.name === name)
        assert.ok(node, "compact Workbench must contain " + name)
        return node
    }

    assert.deepEqual(
        ["Compact hierarchy panel", "Compact scene panel", "Compact inspector panel"].map((name) => {
            const node = child(name)
            return { x: node.x, y: node.y, width: node.width, height: node.height }
        }),
        [
            { x: 0, y: 88, width: 194, height: 395 },
            { x: 194, y: 88, width: 836, height: 395 },
            { x: 1030, y: 88, width: 250, height: 395 },
        ],
    )

    assert.deepEqual(
        { x: child("Compact bottom dock").x, y: child("Compact bottom dock").y,
            width: child("Compact bottom dock").width, height: child("Compact bottom dock").height },
        { x: 0, y: 483, width: 1280, height: 207 },
    )
    assert.deepEqual(
        { x: child("Compact status bar").x, y: child("Compact status bar").y,
            width: child("Compact status bar").width, height: child("Compact status bar").height },
        { x: 0, y: 690, width: 1280, height: 30 },
    )
    assert.ok(child("Compact Console tab label"))
})

function withoutSerializedPathGeometry(value) {
    if (Array.isArray(value)) return value.map(withoutSerializedPathGeometry)
    if (!value || typeof value !== "object") return value

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key, item]) => !(
                (value.type === "path" &&
                    (key === "geometry" || (key === "fill" && item?.type === "gradient"))) ||
                (value.metadata?.type === "godot-svg-source" && key === "children")
            ))
            .map(([key, item]) => [key, withoutSerializedPathGeometry(item)]),
    )
}

function normalizedImportedVectorPath(pathNode) {
    const normalized = withoutSerializedPathGeometry(pathNode)
    delete normalized.id
    delete normalized.name
    return normalized
}

test("the source importer refreshes native paths from the linked SVGs", () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codogma-svg-import-"))

    try {
        const outputPath = path.join(tempDirectory, "refreshed.pen")
        const importerPath = path.join(ROOT, "scripts", "import-godot-svg-icons-to-pen.mjs")
        const result = spawnSync(process.execPath, [importerPath, PEN_PATH, outputPath], {
            cwd: ROOT,
            encoding: "utf8",
        })
        assert.equal(result.status, 0, result.stderr || result.stdout)
        const refreshed = JSON.parse(fs.readFileSync(outputPath, "utf8"))

        // Pencil normalizes equivalent SVG path command syntax when saving a
        // document. Compare the complete node tree and all vector styling,
        // while validating that refreshed path geometry remains non-empty.
        assert.deepEqual(
            withoutSerializedPathGeometry(refreshed),
            withoutSerializedPathGeometry(PEN),
            "re-import must preserve document structure, icon metadata and vector styling",
        )

        const refreshedIconFrames = []
        const originalIconFrames = []
        walk(refreshed, (node) => {
            if (node.metadata?.type === "godot-svg-source") refreshedIconFrames.push(node)
        })
        walk(PEN, (node) => {
            if (node.metadata?.type === "godot-svg-source") originalIconFrames.push(node)
        })

        assert.equal(refreshedIconFrames.length, 332)
        assert.equal(originalIconFrames.length, refreshedIconFrames.length)
        const originalById = new Map(originalIconFrames.map((frame) => [frame.id, frame]))
        let pathCount = 0

        for (const frame of refreshedIconFrames) {
            const original = originalById.get(frame.id)
            assert.ok(original, "refreshed icon frame must preserve its parent ID: " + frame.name)
            const refreshedPaths = (frame.children ?? []).filter((node) => node.type === "path")
            const originalPaths = (original.children ?? []).filter((node) => node.type === "path")
            assert.equal(refreshedPaths.length, originalPaths.length, frame.name + " path count")
            pathCount += refreshedPaths.length

            assert.deepEqual(
                refreshedPaths.map(normalizedImportedVectorPath),
                originalPaths.map(normalizedImportedVectorPath),
                frame.name + " vector styling must survive source re-import",
            )
            assert.ok(refreshedPaths.every((node) =>
                typeof node.geometry === "string" && node.geometry.trim().length > 0),
            frame.name + " must retain non-empty vector geometry")
        }

        assert.equal(pathCount, 382)
        assert.match(result.stdout, /"frames": 332/)
        assert.match(result.stdout, /"pathNodes": 382/)
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true })
    }
})


const TOKENS = JSON.parse(fs.readFileSync(path.join(EDITOR_ROOT, "design-system", "tokens.json"), "utf8"))
const ICON_SOURCE_DIR = path.join(EDITOR_ROOT, "icons")

function tokenValue(name, mode) {
    const definition = TOKENS.variables[name]
    assert.ok(definition, "design token must exist: " + name)
    return definition[mode]
}

function luminance(hex) {
    const value = hex.replace("#", "")
    assert.match(value, /^[0-9a-f]{6}$/i, "contrast calculation expects opaque RGB")
    const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    const linear = channels.map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

function contrastRatio(first, second) {
    const a = luminance(first)
    const b = luminance(second)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function normalizeSvgColor(hex) {
    const value = hex.toLowerCase()
    if (value === "gray") return "#808080"
    const body = value.slice(1)
    if (body.length === 3 || body.length === 4) {
        return "#" + [...body].map((part) => part + part).join("")
    }
    if (body.length === 6) return value
    if (body.length === 8) return value
    assert.fail("unsupported SVG color literal: " + hex)
}

function countColorTokenReferences(document) {
    const counts = {}
    function scan(value, propertyKey) {
        const isColorProperty = propertyKey === "fill" || propertyKey === "stroke" || propertyKey === "color"
        if (isColorProperty && typeof value === "string" && value.startsWith("$")) {
            const name = value.slice(1)
            counts[name] = (counts[name] ?? 0) + 1
            return
        }
        if (Array.isArray(value)) {
            value.forEach((child) => scan(child, propertyKey))
            return
        }
        if (value && typeof value === "object") {
            for (const [key, child] of Object.entries(value)) scan(child, key)
        }
    }
    walk(document, (node) => {
        for (const key of ["fill", "stroke", "effect", "content"]) {
            if (Object.hasOwn(node, key)) scan(node[key], key)
        }
    })
    return counts
}

test("Pencil theme variables are generated from the canonical design token source", () => {
    assert.deepEqual(PEN.themes?.mode, ["dark", "light"])
    assert.deepEqual(Object.keys(PEN.variables).sort(), Object.keys(TOKENS.variables).sort())

    for (const [name, definition] of Object.entries(TOKENS.variables)) {
        const actual = PEN.variables[name]
        assert.ok(actual, "Pencil document must declare " + name)
        if (definition.type) {
            assert.equal(actual.type, definition.type, name + " token type")
            assert.equal(actual.value, definition.value, name + " token value")
            continue
        }
        assert.equal(actual.type, "color", name + " must be a color variable")
        assert.deepEqual(actual.value, [
            { value: definition.dark, theme: { mode: "dark" } },
            { value: definition.light, theme: { mode: "light" } },
        ], name + " must define both theme variants")
    }
})

test("UI, semantic and icon token roles meet their contrast targets in both themes", () => {
    const backgrounds = {
        dark: ["surface-workspace", "surface-panel", "surface-inset"].map((name) => tokenValue(name, "dark")),
        light: ["surface-workspace", "surface-panel", "surface-inset"].map((name) => tokenValue(name, "light")),
    }
    const textRoles = ["text-primary", "text-secondary", "text-tertiary", "semantic-success", "semantic-warning", "semantic-danger", "semantic-info"]
    const iconRoles = ["icon-primary", "icon-object", "icon-animation", "icon-ui", "icon-resource", "icon-warning", "icon-danger", "icon-physics", "icon-placeholder"]

    for (const mode of ["dark", "light"]) {
        for (const name of textRoles) {
            for (const background of backgrounds[mode]) {
                const ratio = contrastRatio(tokenValue(name, mode), background)
                assert.ok(ratio >= 4.5, mode + " " + name + " contrast is " + ratio.toFixed(2) + ":1 on " + background)
            }
        }
        for (const name of iconRoles) {
            for (const background of backgrounds[mode]) {
                const ratio = contrastRatio(tokenValue(name, mode), background)
                assert.ok(ratio >= 3, mode + " " + name + " contrast is " + ratio.toFixed(2) + ":1 on " + background)
            }
        }
    }
})

test("every source SVG colour has a semantic token mapping for its theme", () => {
    for (const mode of ["dark", "light"]) {
        const directory = path.join(ICON_SOURCE_DIR, mode, "godot")
        const files = fs.readdirSync(directory).filter((file) => file.endsWith(".svg"))
        assert.equal(files.length, 90, mode + " SVG library must contain all 90 icons")

        for (const file of files) {
            const svg = fs.readFileSync(path.join(directory, file), "utf8")
            const expression = /(?:fill|stroke|stop-color)=(["'])(#[0-9a-fA-F]{3,8}|gray)\1/gi
            for (const match of svg.matchAll(expression)) {
                const colour = normalizeSvgColor(match[2])
                assert.ok(TOKENS.svgColorTokens[mode][colour],
                    mode + "/" + file + " colour " + colour + " must map to a semantic token")
            }
        }
    }
})

test("the design uses theme-aware token references instead of duplicated UI hex values", () => {
    const references = countColorTokenReferences(PEN)
    const total = Object.values(references).reduce((sum, count) => sum + count, 0)
    assert.ok(total >= 1500, "expected at least 1500 design token references, found " + total)
    assert.ok(references["surface-workspace"] >= 10)
    assert.ok(references["text-primary"] >= 200)
    assert.ok(references["border-subtle"] >= 300)
    assert.ok(references["accent-selection"] >= 80)
    assert.ok(references["semantic-warning"] >= 30)

    for (const name of Object.keys(references)) {
        assert.ok(Object.hasOwn(PEN.variables, name), "referenced token must be declared: " + name)
    }
})

test("Godot vector paths use explicit theme tokens and preserve the particle gradient", () => {
    let pathCount = 0
    let solidTokenFills = 0
    let unfilledPaths = 0
    let gradientPaths = 0
    let gradientStopTokens = 0

    for (const frame of godotFrames) {
        const sourceTheme = frame.metadata.source.match(/icons\/(dark|light)\/godot\//)?.[1]
        assert.equal(frame.theme?.mode, sourceTheme, frame.name + " must explicitly select its icon theme")

        for (const child of frame.children) {
            pathCount++
            if (typeof child.fill === "string" && child.fill.startsWith("$")) {
                solidTokenFills++
            } else if (child.fill?.type === "gradient") {
                gradientPaths++
                for (const stop of child.fill.colors ?? []) {
                    assert.ok(typeof stop.color === "string" && stop.color.startsWith("$"),
                        child.name + " gradient stop must use a particle palette token")
                    gradientStopTokens++
                }
            } else {
                assert.equal(child.fill, undefined, child.name + " may only be unfilled when the source SVG has no fill")
                unfilledPaths++
            }
        }
    }

    assert.equal(pathCount, 382)
    assert.equal(solidTokenFills, 320)
    assert.equal(unfilledPaths, 61)
    assert.equal(gradientPaths, 1)
    assert.equal(gradientStopTokens, 12)
})

test("inspector Tint values remain literal data while their text styling uses tokens", () => {
    const tintValues = []
    walk(PEN, (node) => {
        if (node.name === "Tint value") tintValues.push(node)
    })
    assert.equal(tintValues.length, 2)
    for (const node of tintValues) {
        assert.equal(node.content, "#FFFFFF")
        assert.equal(node.fill, "$text-primary")
    }
})

test("applying the token source to an already-tokenized document is idempotent", () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "codogma-design-token-roundtrip-"))
    try {
        const outputPath = path.join(temporaryDirectory, "tokenized.pen")
        const scriptPath = path.join(ROOT, "scripts", "apply-design-tokens-to-pen.mjs")
        const result = spawnSync(process.execPath, [scriptPath, PEN_PATH, outputPath], {
            cwd: ROOT,
            encoding: "utf8",
        })
        assert.equal(result.status, 0, result.stderr || result.stdout)
        assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), PEN)
        const summary = JSON.parse(result.stdout)
        const expectedReferences = Object.values(countColorTokenReferences(PEN)).reduce((sum, count) => sum + count, 0)
        assert.equal(summary.colorReferencesCreated, expectedReferences)
    } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true })
    }
})


test("each editor artboard declares its intended theme and Workbench uses both palettes", () => {
    for (const board of PEN.children) {
        assert.ok(["dark", "light"].includes(board.theme?.mode),
            board.name + " must declare an explicit theme mode")
    }

    const dark = PEN.children.find((board) => board.name === "01 - Workbench Dark")
    const light = PEN.children.find((board) => board.name === "02 - Workbench Light")
    assert.equal(dark?.theme?.mode, "dark")
    assert.equal(light?.theme?.mode, "light")

    const darkReferences = countColorTokenReferences(dark)
    const lightReferences = countColorTokenReferences(light)
    assert.ok(Object.values(darkReferences).reduce((sum, count) => sum + count, 0) >= 350)
    assert.ok(Object.values(lightReferences).reduce((sum, count) => sum + count, 0) >= 350)

    for (const token of ["surface-workspace", "surface-panel", "text-primary", "text-secondary", "border-subtle", "accent-selection"]) {
        assert.ok(darkReferences[token] > 0, "dark Workbench must reference " + token)
        assert.ok(lightReferences[token] > 0, "light Workbench must reference " + token)
    }
})


test("the token reference artboard documents every colour token in both themes", () => {
    const board = PEN.children.find((node) => node.name === "09 - Design token reference & contrast")
    assert.ok(board, "the design-token reference artboard must exist")
    assert.deepEqual({ x: board.x, y: board.y, width: board.width, height: board.height },
        { x: 1560, y: 4080, width: 1440, height: 900 })

    const columns = ["dark", "light"].map((mode) => {
        const column = board.children.find((node) => node.name === mode + " token palette")
        assert.ok(column, mode + " token palette column must exist")
        assert.equal(column.theme?.mode, mode)
        return column
    })

    const expectedTokens = Object.entries(TOKENS.variables)
        .filter(([, definition]) => !definition.type)
        .map(([name]) => name)
        .sort()
    assert.equal(expectedTokens.length, 47)

    for (let index = 0; index < columns.length; index++) {
        const mode = index === 0 ? "dark" : "light"
        const column = columns[index]
        const tiles = column.children.filter((node) => node.type === "frame" && node.name.startsWith("Token "))
        assert.equal(tiles.length, expectedTokens.length, mode + " column must document every colour token")

        const tokensInColumn = []
        for (const tile of tiles) {
            const token = tile.name.slice("Token ".length)
            tokensInColumn.push(token)
            assert.ok(expectedTokens.includes(token), "unknown token in matrix: " + token)

            const swatch = tile.children.find((node) => node.name === token + " swatch")
            const value = tile.children.find((node) => node.name === token + " value")
            assert.ok(swatch, token + " must have a real token-coloured swatch")
            assert.equal(swatch.fill, "$" + token)
            assert.ok(value, token + " must show its current HEX value")
            assert.equal(value.content, TOKENS.variables[token][mode])

            for (const child of tile.children) {
                assert.ok(child.x >= 0 && child.y >= 0, token + " child must stay inside its tile")
                assert.ok(child.x + child.width <= tile.width, token + " child must not overflow horizontally")
                assert.ok(child.y + child.height <= tile.height, token + " child must not overflow vertically")
            }
        }
        assert.deepEqual(tokensInColumn.sort(), expectedTokens)
    }
})
