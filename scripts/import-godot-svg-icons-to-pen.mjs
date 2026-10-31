import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const EDITOR_ROOT = path.join(ROOT, "src/editor")
const DEFAULT_INPUT = path.join(EDITOR_ROOT, "codogma-editor.pen")
const REVISION = "95c0fa5fe8a019adc29d074c16b64469b04571f7"
const DESIGN_TOKENS = JSON.parse(fs.readFileSync(path.join(EDITOR_ROOT, "design-system/tokens.json"), "utf8"))
const SOURCE_PREFIX = "./icons/"
const PREVIEW_PREFIX = "./design-assets/godot-icons/"

function fail(message) {
    throw new Error(message)
}

function parseAttributes(source) {
    const attributes = {}
    const expression = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g
    for (const match of source.matchAll(expression)) {
        attributes[match[1]] = match[3] ?? match[4] ?? ""
    }
    return attributes
}

function parseXml(source, fileName) {
    const root = { tag: "#root", attributes: {}, children: [] }
    const stack = [root]
    const tokens = source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[^>]+>|[^<]+/g) ?? []

    for (const token of tokens) {
        if (token.startsWith("<!--") || token.startsWith("<?") || !token.startsWith("<")) {
            continue
        }
        if (token.startsWith("</")) {
            const closingTag = token.slice(2, -1).trim()
            if (stack.length === 1 || stack.at(-1).tag !== closingTag) {
                fail("Malformed SVG nesting in " + fileName + ": " + closingTag)
            }
            stack.pop()
            continue
        }

        const selfClosing = /\/\s*>$/.test(token)
        const body = token.slice(1, selfClosing ? token.lastIndexOf("/") : -1).trim()
        const tagMatch = body.match(/^([^\s/>]+)/)
        if (!tagMatch) fail("Cannot parse SVG element in " + fileName + ": " + token)

        const tag = tagMatch[1]
        const element = {
            tag,
            attributes: parseAttributes(body.slice(tag.length)),
            children: [],
        }
        stack.at(-1).children.push(element)
        if (!selfClosing) stack.push(element)
    }

    if (stack.length !== 1) fail("Unclosed SVG elements in " + fileName)
    const svg = root.children.find((child) => child.tag === "svg")
    if (!svg) fail("SVG root element is missing in " + fileName)
    return svg
}

function parseNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "") return fallback
    const number = Number.parseFloat(value)
    if (!Number.isFinite(number)) fail("Invalid SVG numeric value: " + value)
    return number
}

function formatNumber(value) {
    const rounded = Math.round(value * 1_000_000) / 1_000_000
    return Object.is(rounded, -0) ? "0" : String(rounded)
}

function colorToRgba(value) {
    const color = String(value ?? "").trim().toLowerCase()
    const names = {
        black: "#000000",
        white: "#ffffff",
        gray: "#808080",
        grey: "#808080",
        red: "#ff0000",
        green: "#008000",
        blue: "#0000ff",
        yellow: "#ffff00",
        cyan: "#00ffff",
        magenta: "#ff00ff",
    }
    const normalized = names[color] ?? color
    if (!normalized.startsWith("#")) fail("Unsupported SVG color: " + value)

    let hex = normalized.slice(1)
    if (hex.length === 3 || hex.length === 4) {
        hex = [...hex].map((part) => part + part).join("")
    }
    if (hex.length === 6) hex += "ff"
    if (hex.length !== 8 || !/^[0-9a-f]{8}$/.test(hex)) {
        fail("Unsupported SVG color format: " + value)
    }
    return {
        red: Number.parseInt(hex.slice(0, 2), 16),
        green: Number.parseInt(hex.slice(2, 4), 16),
        blue: Number.parseInt(hex.slice(4, 6), 16),
        alpha: Number.parseInt(hex.slice(6, 8), 16) / 255,
    }
}

function rgbaToPenColor(color, opacity = 1) {
    const alpha = Math.max(0, Math.min(1, color.alpha * opacity))
    const rgb = [color.red, color.green, color.blue]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")
    if (alpha >= 0.999999) return "#" + rgb
    return "#" + rgb + Math.round(alpha * 255).toString(16).padStart(2, "0")
}

function colorForTheme(color, opacity, theme) {
    const hex = rgbaToPenColor(color, opacity).toLowerCase()
    const token = DESIGN_TOKENS.svgColorTokens[theme]?.[hex]
    return token ? "$" + token : hex
}

function parseTransform(source) {
    if (!source) return [1, 0, 0, 1, 0, 0]

    const multiply = (left, right) => [
        left[0] * right[0] + left[2] * right[1],
        left[1] * right[0] + left[3] * right[1],
        left[0] * right[2] + left[2] * right[3],
        left[1] * right[2] + left[3] * right[3],
        left[0] * right[4] + left[2] * right[5] + left[4],
        left[1] * right[4] + left[3] * right[5] + left[5],
    ]

    let matrix = [1, 0, 0, 1, 0, 0]
    const expression = /([a-zA-Z]+)\s*\(([^)]*)\)/g
    for (const match of source.matchAll(expression)) {
        const values = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)
        let next
        switch (match[1]) {
            case "matrix":
                if (values.length !== 6) fail("Invalid SVG matrix transform: " + source)
                next = values
                break
            case "translate":
                next = [1, 0, 0, 1, values[0] ?? 0, values[1] ?? 0]
                break
            case "scale":
                next = [values[0], 0, 0, values[1] ?? values[0], 0, 0]
                break
            case "rotate": {
                const angle = values[0] * Math.PI / 180
                const cosine = Math.cos(angle)
                const sine = Math.sin(angle)
                const cx = values[1] ?? 0
                const cy = values[2] ?? 0
                next = [
                    cosine,
                    sine,
                    -sine,
                    cosine,
                    cx - cosine * cx + sine * cy,
                    cy - sine * cx - cosine * cy,
                ]
                break
            }
            default:
                fail("Unsupported SVG transform: " + match[1])
        }
        matrix = multiply(matrix, next)
    }
    return matrix
}

function transformPathData(source, matrix, fileName) {
    const [a, b, c, d, e, f] = matrix
    const scaleX = Math.hypot(a, b)
    const scaleY = Math.hypot(c, d)
    const dot = a * c + b * d
    const determinant = a * d - b * c
    if (Math.abs(scaleX - scaleY) > 0.00001 || Math.abs(dot) > 0.00001 || determinant <= 0) {
        fail("Only positive uniform scale + rotation is supported in " + fileName)
    }
    const angle = Math.atan2(b, a) * 180 / Math.PI
    const transformPoint = (x, y) => [a * x + c * y + e, b * x + d * y + f]
    const tokens = source.match(/[a-zA-Z]|[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g) ?? []
    let index = 0
    let command = null
    let currentX = 0
    let currentY = 0
    let startX = 0
    let startY = 0
    const output = []

    const number = () => {
        if (index >= tokens.length || /^[a-zA-Z]$/.test(tokens[index])) {
            fail("Incomplete transformed SVG path in " + fileName)
        }
        const value = Number(tokens[index++])
        if (!Number.isFinite(value)) fail("Invalid SVG path value in " + fileName)
        return value
    }
    const point = (x, y) => transformPoint(x, y)
    const emitPoint = (letter, x, y) => {
        const transformed = point(x, y)
        output.push(letter + formatNumber(transformed[0]) + " " + formatNumber(transformed[1]))
    }

    while (index < tokens.length) {
        if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++]
        if (!command) fail("Missing SVG path command in " + fileName)

        const relative = command === command.toLowerCase()
        const upper = command.toUpperCase()
        if (upper === "Z") {
            output.push("Z")
            currentX = startX
            currentY = startY
            command = null
            continue
        }
        if (upper === "M") {
            let first = true
            while (index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index])) {
                const x = number()
                const y = number()
                currentX = relative ? currentX + x : x
                currentY = relative ? currentY + y : y
                emitPoint(first ? "M" : "L", currentX, currentY)
                if (first) {
                    startX = currentX
                    startY = currentY
                }
                first = false
            }
            command = relative ? "l" : "L"
            continue
        }
        if (upper === "A") {
            while (index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index])) {
                const rx = number()
                const ry = number()
                const rotation = number()
                const largeArc = number()
                const sweep = number()
                const x = number()
                const y = number()
                const nextX = relative ? currentX + x : x
                const nextY = relative ? currentY + y : y
                const transformed = point(nextX, nextY)
                output.push(
                    "A" + formatNumber(rx * scaleX) + " " + formatNumber(ry * scaleX) +
                    " " + formatNumber(rotation + angle) + " " + largeArc + " " + sweep +
                    " " + formatNumber(transformed[0]) + " " + formatNumber(transformed[1]),
                )
                currentX = nextX
                currentY = nextY
            }
            continue
        }
        if (upper === "H" || upper === "V") {
            while (index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index])) {
                const value = number()
                if (upper === "H") currentX = relative ? currentX + value : value
                else currentY = relative ? currentY + value : value
                emitPoint("L", currentX, currentY)
            }
            command = null
            continue
        }
        fail("Unsupported transformed SVG path command " + command + " in " + fileName)
    }
    return output.join(" ")
}

function pathFromCircle(attributes) {
    const cx = parseNumber(attributes.cx)
    const cy = parseNumber(attributes.cy)
    const radius = parseNumber(attributes.r)
    return [
        "M" + formatNumber(cx - radius) + " " + formatNumber(cy),
        "A" + formatNumber(radius) + " " + formatNumber(radius) + " 0 1 0 " +
            formatNumber(cx + radius) + " " + formatNumber(cy),
        "A" + formatNumber(radius) + " " + formatNumber(radius) + " 0 1 0 " +
            formatNumber(cx - radius) + " " + formatNumber(cy) + " Z",
    ].join(" ")
}

function pathFromRectangle(attributes) {
    const x = parseNumber(attributes.x)
    const y = parseNumber(attributes.y)
    const width = parseNumber(attributes.width)
    const height = parseNumber(attributes.height)
    const rx = Math.min(parseNumber(attributes.rx), width / 2, height / 2)
    const right = x + width
    const bottom = y + height
    if (rx <= 0) {
        return "M" + formatNumber(x) + " " + formatNumber(y) +
            " H" + formatNumber(right) + " V" + formatNumber(bottom) +
            " H" + formatNumber(x) + " Z"
    }
    return [
        "M" + formatNumber(x + rx) + " " + formatNumber(y),
        "H" + formatNumber(right - rx),
        "A" + formatNumber(rx) + " " + formatNumber(rx) + " 0 0 1 " + formatNumber(right) + " " + formatNumber(y + rx),
        "V" + formatNumber(bottom - rx),
        "A" + formatNumber(rx) + " " + formatNumber(rx) + " 0 0 1 " + formatNumber(right - rx) + " " + formatNumber(bottom),
        "H" + formatNumber(x + rx),
        "A" + formatNumber(rx) + " " + formatNumber(rx) + " 0 0 1 " + formatNumber(x) + " " + formatNumber(bottom - rx),
        "V" + formatNumber(y + rx),
        "A" + formatNumber(rx) + " " + formatNumber(rx) + " 0 0 1 " + formatNumber(x + rx) + " " + formatNumber(y),
        "Z",
    ].join(" ")
}

function gradientFill(id, gradients, viewBox, opacity, fileName, theme) {
    const gradient = gradients.get(id)
    if (!gradient) fail("Missing SVG gradient #" + id + " in " + fileName)
    if (gradient.tag !== "linearGradient") fail("Only linear SVG gradients are supported in " + fileName)
    const attrs = gradient.attributes
    const [vx, vy, vw, vh] = viewBox
    const readCoordinate = (value, fallback, extent, origin = 0) => {
        if (value === undefined) return fallback
        if (value.endsWith("%")) return origin + parseNumber(value) * extent / 100
        return parseNumber(value)
    }
    const x1 = readCoordinate(attrs.x1, 0, vw, vx)
    const y1 = readCoordinate(attrs.y1, 0, vh, vy)
    const x2 = readCoordinate(attrs.x2, attrs.gradientUnits === "userSpaceOnUse" ? 0 : 1, vw, vx)
    const y2 = readCoordinate(attrs.y2, 0, vh, vy)
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    if (length <= 0) fail("Zero-length SVG gradient in " + fileName)

    const colors = []
    let previousOffset = 0
    for (const stop of gradient.children.filter((child) => child.tag === "stop")) {
        const stopAttrs = stop.attributes
        let position = stopAttrs.offset === undefined ? 0 : (
            stopAttrs.offset.endsWith("%")
                ? parseNumber(stopAttrs.offset) / 100
                : parseNumber(stopAttrs.offset)
        )
        position = Math.max(previousOffset, Math.max(0, Math.min(1, position)))
        previousOffset = position
        const stopColor = colorToRgba(stopAttrs["stop-color"] ?? "#000000")
        colors.push({
            color: colorForTheme(stopColor, parseNumber(stopAttrs["stop-opacity"], 1), theme),
            position,
        })
    }
    if (colors.length < 2) fail("SVG gradient must have at least two stops in " + fileName)

    return {
        type: "gradient",
        gradientType: "linear",
        rotation: (Math.atan2(-dx, -dy) * 180 / Math.PI + 360) % 360,
        center: { x: (x1 + x2) / 2 / vw, y: (y1 + y2) / 2 / vh },
        size: { width: 1, height: length / Math.max(vw, vh) },
        opacity,
        colors,
    }
}

function createStyle(attributes, inherited) {
    const style = { ...inherited }
    for (const key of [
        "fill", "stroke", "stroke-width", "stroke-linejoin", "stroke-linecap",
        "fill-rule", "fill-opacity", "stroke-opacity", "opacity",
    ]) {
        if (attributes[key] !== undefined) style[key] = attributes[key]
    }
    return style
}

function svgToPaths(svgText, fileName, frame, theme) {
    const svg = parseXml(svgText, fileName)
    const viewBox = String(svg.attributes.viewBox ?? "").trim().split(/[\s,]+/).map(Number)
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
        fail("Invalid SVG viewBox in " + fileName)
    }

    const gradients = new Map()
    for (const child of svg.children) {
        if (child.tag === "linearGradient" || child.tag === "radialGradient") {
            const id = child.attributes.id
            if (id) gradients.set(id, child)
        }
    }

    const shapes = []
    const initialStyle = {
        fill: "#000000",
        stroke: "none",
        opacity: 1,
        "fill-opacity": 1,
        "stroke-opacity": 1,
    }

    function addShape(element, inheritedStyle) {
        const style = createStyle(element.attributes, inheritedStyle)
        const attrs = element.attributes
        let geometry
        if (element.tag === "path") geometry = attrs.d
        else if (element.tag === "circle") geometry = pathFromCircle(attrs)
        else if (element.tag === "rect") geometry = pathFromRectangle(attrs)
        else fail("Unsupported SVG drawing element " + element.tag + " in " + fileName)
        if (!geometry) fail("SVG shape has no geometry in " + fileName)

        if (attrs.transform) geometry = transformPathData(geometry, parseTransform(attrs.transform), fileName)

        const item = {
            type: "path",
            id: frame.id + "-svg-" + String(shapes.length + 1).padStart(2, "0"),
            name: (frame.name ?? "Godot icon") + " vector " + String(shapes.length + 1),
            x: 0,
            y: 0,
            width: frame.width,
            height: frame.height,
            viewBox,
            geometry,
        }

        const opacity = parseNumber(style.opacity, 1)
        const fillOpacity = opacity * parseNumber(style["fill-opacity"], 1)
        if (style.fill && style.fill !== "none") {
            const gradientMatch = style.fill.match(/^url\(#([^)]+)\)$/)
            item.fill = gradientMatch
                ? gradientFill(gradientMatch[1], gradients, viewBox, fillOpacity, fileName, theme)
                : colorForTheme(colorToRgba(style.fill), fillOpacity, theme)
        }
        if (style.stroke && style.stroke !== "none") {
            item.stroke = colorForTheme(
                colorToRgba(style.stroke),
                opacity * parseNumber(style["stroke-opacity"], 1),
                theme,
            )
            const strokeWidth = parseNumber(style["stroke-width"], 1)
            if (strokeWidth > 0) item.strokeWidth = strokeWidth
            if (style["stroke-linejoin"]) item.strokeLinejoin = style["stroke-linejoin"]
            if (style["stroke-linecap"]) item.strokeLinecap = style["stroke-linecap"]
        }
        if (style["fill-rule"] === "evenodd") item.fillRule = "evenodd"
        shapes.push(item)
    }

    function walk(elements, inheritedStyle) {
        for (const element of elements) {
            if (element.tag === "g") {
                if (element.attributes.transform) {
                    fail("Group-level SVG transforms are not yet supported in " + fileName)
                }
                walk(element.children, createStyle(element.attributes, inheritedStyle))
            } else if (["path", "circle", "rect"].includes(element.tag)) {
                addShape(element, inheritedStyle)
            } else if (["linearGradient", "radialGradient", "stop", "title", "desc"].includes(element.tag)) {
                continue
            } else {
                fail("Unsupported SVG element " + element.tag + " in " + fileName)
            }
        }
    }
    walk(svg.children, initialStyle)
    if (shapes.length === 0) fail("SVG contains no vector shapes: " + fileName)
    return shapes
}

function convertDocument(document, rootPath) {
    const ids = new Set()
    const frames = []
    const nonContainerChildren = []
    let remainingPngImages = 0
    let removedEmptyChildren = 0

    function collect(node) {
        if (node.id) {
            if (ids.has(node.id)) fail("Duplicate .pen node id: " + node.id)
            ids.add(node.id)
        }
        if (node.type === "frame" || node.type === "group") {
            if (node.children) node.children.forEach(collect)
        } else if (node.children !== undefined) {
            if (Array.isArray(node.children) && node.children.length === 0) {
                delete node.children
                removedEmptyChildren++
            } else {
                nonContainerChildren.push(node.id ?? node.name ?? node.type)
            }
        }
    }
    document.children.forEach(collect)
    if (nonContainerChildren.length) {
        fail("Non-container nodes have children: " + nonContainerChildren.slice(0, 10).join(", "))
    }

    function visit(node) {
        const fill = node.fill
        let sourceRelative = null
        let theme = null
        let iconName = null
        const sourceMetadata = node.metadata?.type === "godot-svg-source"

        if (sourceMetadata) {
            sourceRelative = node.metadata.source
            if (typeof sourceRelative !== "string" || !sourceRelative.startsWith(SOURCE_PREFIX)) {
                fail("Invalid Godot SVG source metadata on " + node.name)
            }
            const sourceMatch = sourceRelative.slice(SOURCE_PREFIX.length).match(/^(dark|light)\/godot\/([^/]+)\.svg$/)
            if (!sourceMatch) fail("Unexpected Godot SVG source path: " + sourceRelative)
            theme = sourceMatch[1]
            iconName = sourceMatch[2]
        } else if (fill?.type === "image" && typeof fill.url === "string" && fill.url.startsWith(PREVIEW_PREFIX)) {
            if (node.type !== "frame") fail("Godot SVG preview is not inside a frame: " + node.name)
            const previewMatch = fill.url.match(/^\.\/design-assets\/godot-icons\/(dark|light)\/([^/]+)\.png$/)
            if (!previewMatch) fail("Unexpected Godot preview URL: " + fill.url)
            theme = previewMatch[1]
            iconName = previewMatch[2]
            sourceRelative = SOURCE_PREFIX + theme + "/godot/" + iconName + ".svg"
        }

        if (sourceRelative) {
            if (node.type !== "frame") fail("Godot SVG source is not attached to a frame: " + node.name)
            const sourceAbsolute = path.resolve(rootPath, sourceRelative.slice(2))
            if (!fs.existsSync(sourceAbsolute)) fail("Missing source SVG: " + sourceRelative)
            if (!sourceMetadata && node.children?.length) {
                fail("Cannot replace non-empty children while importing " + sourceRelative)
            }

            const svgText = fs.readFileSync(sourceAbsolute, "utf8")
            const vectorPaths = svgToPaths(svgText, sourceRelative, node, theme)
            delete node.fill
            node.layout = "none"
            node.theme = { ...(node.theme ?? {}), mode: theme }
            node.children = vectorPaths
            node.metadata = {
                ...(node.metadata ?? {}),
                type: "godot-svg-source",
                source: sourceRelative,
                revision: REVISION,
                license: "MIT",
            }
            frames.push({ id: node.id, theme, iconName, pathCount: vectorPaths.length })
        } else if (fill?.type === "image" && typeof fill.url === "string" && fill.url.endsWith(".png")) {
            remainingPngImages++
        }

        if (node.type === "frame" || node.type === "group") {
            for (const child of node.children ?? []) visit(child)
        }
    }
    document.children.forEach(visit)

    if (frames.length === 0) fail("No Godot SVG source metadata or legacy preview fills were found in the input .pen file")

    let pathNodes = 0
    const countPaths = (node) => {
        if (node.type === "path" && node.id?.includes("-svg-")) pathNodes++
        for (const child of node.children ?? []) countPaths(child)
    }
    document.children.forEach(countPaths)

    return {
        frames: frames.length,
        pathNodes,
        remainingPngImages,
        removedEmptyChildren,
        themes: {
            dark: frames.filter((frame) => frame.theme === "dark").length,
            light: frames.filter((frame) => frame.theme === "light").length,
        },
        uniqueSourceIcons: new Set(frames.map((frame) => frame.theme + "/" + frame.iconName)).size,
        sample: frames.slice(0, 8),
        alreadyConverted: false,
    }
}

const [inputArgument, outputArgument] = process.argv.slice(2)
const inputPath = path.resolve(inputArgument ?? DEFAULT_INPUT)
const outputPath = path.resolve(outputArgument ?? inputPath)
const source = JSON.parse(fs.readFileSync(inputPath, "utf8"))
const summary = convertDocument(source, path.dirname(inputPath))
fs.writeFileSync(outputPath, JSON.stringify(source, null, 2) + "\n", "utf8")
console.log(JSON.stringify({ inputPath, outputPath, revision: REVISION, ...summary }, null, 2))
