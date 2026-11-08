/**
 * Codogma Engine — MCP Server + Editor Bridge.
 *
 * Engine-owned Model Context Protocol server and Editor session bridge.
 *
 *   - POST /editor/mcp          Model Context Protocol (Streamable HTTP, JSON-RPC 2.0)
 *   - GET  /editor/mcp-bridge/events   SSE channel to the running editor client
 *   - POST /editor/mcp-bridge/result   editor client posts command results back
 *
 * Tools that operate purely on project files are executed server-side.
 * Native Scene/Node/Prefab/Component/FX operations and viewport screenshots
 * are forwarded only to the connected Editor Host over the SSE bridge.
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"
import { parseImageSize } from "./imgsize.mjs"
import { ensureProjectDirectorySafely, openSafeProjectFileForWrite, readFileSafely, readProjectDirectoryEntriesSafelySync, removeProjectEntrySafely, writeFileSafely, statProjectFileSafely } from "./path-security.mjs"

let PROJECT_DIR = null
let log = () => {}

export function initMcp(options) {
    PROJECT_DIR = options.projectDir
    log = options.log || (() => {})
}

/** Official asset tools pass `{ texture: { key, frame } }`; accept flat `{ key }` too. */
function textureKeyOf(args) {
    const key = args.key ?? args.texture?.key
    if (typeof key !== "string" || key.trim().length === 0) {
        throw new Error('Missing or invalid texture key: pass a non-empty string as { "key" } or { "texture": { "key" } }.')
    }
    return key
}

/* ============================== path helpers ============================== */

function isWithinRealBase(base, target) {
    const realBase = fs.realpathSync(base)
    const isInside = candidate => candidate === realBase || candidate.startsWith(realBase + path.sep)
    let candidate = target

    while (true) {
        try {
            // lstat sees the link itself, unlike realpath. A dangling symlink
            // must fail closed instead of being treated as a missing leaf
            // under an otherwise trusted parent directory.
            const linkOrFile = fs.lstatSync(candidate)

            if (linkOrFile.isSymbolicLink()) {
                return isInside(fs.realpathSync(candidate))
            }

            return isInside(fs.realpathSync(candidate))
        } catch (error) {
            if (error.code !== "ENOENT" && error.code !== "ENOTDIR") return false

            // realpath(2) also reports ENOENT for a dangling symlink. Detect
            // that case before walking up to a parent that may be in-base.
            try {
                if (fs.lstatSync(candidate).isSymbolicLink()) return false
            } catch (lstatError) {
                if (lstatError.code !== "ENOENT" && lstatError.code !== "ENOTDIR") return false
            }

            const parent = path.dirname(candidate)
            if (parent === candidate) return false
            candidate = parent
        }
    }
}

function safeJoin(base, relPath) {
    if (typeof relPath !== "string") return null

    const p = path.resolve(base, "." + path.sep + relPath.replace(/^[\\/]+/, ""))
    if (p !== base && !p.startsWith(base + path.sep)) return null

    // Prevent a project-local symlink from escaping the selected project root.
    try {
        if (!isWithinRealBase(base, p)) return null
    } catch {
        return null
    }

    return p
}

/**
 * Client file paths may include the project root folder name as the first
 * segment; normalize them before applying project-root confinement.
 */
function normPath(p) {
    if (typeof p !== "string" || p.length === 0) return p
    const parts = p.split(/[\\/]/).filter(Boolean)
    if (parts.length > 1 && parts[0] === path.basename(PROJECT_DIR)) {
        return parts.slice(1).join("/")
    }
    return p
}

function walkFiles(dir, relPrefix, out = []) {
    const entries = readProjectDirectoryEntriesSafelySync(PROJECT_DIR, dir)
    if (!entries) return out

    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink) continue
        const rel = relPrefix ? relPrefix + "/" + entry.name : entry.name
        const full = path.join(dir, entry.name)
        if (entry.isDirectory) walkFiles(full, rel, out)
        else if (entry.isFile) out.push(rel)
    }
    return out
}

/* =========================== bridge file helpers ========================== */

/** Notify connected editor sessions that project files changed on disk. */
function notifyFilesChanged() {
    if (!bridgeClient) return
    try {
        bridgeClient.res.write("event: files-changed\ndata: {}\n\n")
    } catch (error) {
        removeBridgeClient(bridgeClient)
    }
}

function findAssetPacks() {
    return walkFiles(PROJECT_DIR, "").filter(f => /pack.*\.json$/i.test(f) || f.toLowerCase().endsWith("asset-pack.json"))
}

function parseAssetPacks() {
    const packs = []
    for (const rel of findAssetPacks()) {
        try {
            const full = safeJoin(PROJECT_DIR, rel)
            if (!full) continue
            const data = JSON.parse(readFileSafely(PROJECT_DIR, full, "utf8", 8 * 1024 * 1024))
            const entries = []
            for (const section of Object.values(data)) {
                if (section && Array.isArray(section.files)) {
                    for (const e of section.files) entries.push(e)
                }
            }
            packs.push({ file: rel, entries })
        } catch (e) { /* ignore broken packs */ }
    }
    return packs
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"])

/* ================================ tools ================================== */

const TOOLS = new Map()

function defTool(name, description, inputSchema, exec) {
    TOOLS.set(name, { name, description, inputSchema, exec })
}

/* ------------------------------ External asset tools --------------------- */

defTool(
    "assets-get-available-textures",
    "List all textures available in the project (from Asset Pack files and loose image files).",
    { type: "object", properties: {} },
    async () => {
        const textures = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "image" || e.type === "spritesheet" || e.type === "atlas") {
                    textures.push({ key: e.key, type: e.type, url: e.url, packFile: pack.file })
                }
            }
        }
        const packUrls = new Set(textures.map(t => t.url))
        for (const f of walkFiles(PROJECT_DIR, "")) {
            const ext = path.extname(f).toLowerCase()
            if (IMAGE_EXTS.has(ext) && !packUrls.has(f)) {
                textures.push({ key: path.basename(f, ext), type: "image", url: f, packFile: null })
            }
        }
        return text(JSON.stringify({ textures }, null, 2))
    }
)

defTool(
    "assets-get-texture-binary",
    "Get the binary (base64) data of a texture by key.",
    {
        type: "object",
        properties: {
            key: { type: "string", description: "The key of the texture." },
            frame: { description: "Optional frame (for atlases/spritesheets)." },
            texture: {
                type: "object",
                properties: { key: { type: "string" }, frame: { description: "Optional frame." } },
                required: ["key"],
                description: "Alternative official shape: { texture: { key, frame } }."
            }
        },
        anyOf: [{ required: ["key"] }, { required: ["texture"] }]
    },
    async (args) => {
        const key = textureKeyOf(args)
        let url = null
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && (e.type === "image" || e.type === "spritesheet"))
            if (e) { url = e.url; break }
        }
        if (!url) {
            const files = walkFiles(PROJECT_DIR, "").filter(f => {
                const ext = path.extname(f).toLowerCase()
                return IMAGE_EXTS.has(ext) && path.basename(f, ext) === key
            })
            url = files[0]
        }
        if (!url) throw new Error(`Texture "${key}" not found`)
        const full = safeJoin(PROJECT_DIR, url)
        if (!full) throw new Error(`Texture file not found: ${url}`)
        const buf = readFileSafely(PROJECT_DIR, full)
        const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".svg": "image/svg+xml" }[path.extname(full).toLowerCase()] || "application/octet-stream"
        return image(buf.toString("base64"), mime)
    }
)

defTool(
    "assets-get-available-animations",
    "List all sprite animations available in the project.",
    { type: "object", properties: {} },
    async () => {
        const animations = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "animations" && Array.isArray(e.animations)) {
                    animations.push({ key: e.key, packFile: pack.file, animations: e.animations.map(a => ({ key: a.key, frameRate: a.frameRate, frames: (a.frames || []).length })) })
                }
            }
        }
        return text(JSON.stringify({ animations }, null, 2))
    }
)

defTool(
    "assets-get-available-tilemaps",
    "List all tilemap files available in the project.",
    { type: "object", properties: {} },
    async () => {
        const tilemaps = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type && e.type.startsWith("tilemap")) tilemaps.push({ key: e.key, type: e.type, url: e.url, packFile: pack.file })
            }
        }
        const packUrls = new Set(tilemaps.map(t => t.url))
        for (const f of walkFiles(PROJECT_DIR, "")) {
            if (/\.(json|tmx|csv)$/.test(f.toLowerCase()) && /tilemap|map/.test(path.basename(f).toLowerCase()) && !packUrls.has(f)) {
                tilemaps.push({ key: path.basename(f), url: f, packFile: null })
            }
        }
        return text(JSON.stringify({ tilemaps }, null, 2))
    }
)

defTool(
    "assets-get-available-bitmapfonts",
    "List all bitmap fonts available in the project.",
    { type: "object", properties: {} },
    async () => {
        const fonts = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "bitmapFont") fonts.push({ key: e.key, url: e.url, packFile: pack.file })
            }
        }
        return text(JSON.stringify({ bitmapFonts: fonts }, null, 2))
    }
)

defTool(
    "assets-get-texture-content-bounding-box",
    "Get the bounding box of the non-transparent content of a texture (computed in the browser editor).",
    {
        type: "object",
        properties: {
            key: { type: "string", description: "The key of the texture." },
            frame: { description: "Optional frame (for atlases/spritesheets)." },
            texture: {
                type: "object",
                properties: { key: { type: "string" }, frame: { description: "Optional frame." } },
                description: "Alternative official shape: { texture: { key, frame } }."
            }
        }
    },
    async (args) => {
        const key = textureKeyOf(args)
        let url = null
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && (e.type === "image" || e.type === "spritesheet"))
            if (e) { url = e.url; break }
        }
        if (!url) {
            const files = walkFiles(PROJECT_DIR, "").filter(f => {
                const ext = path.extname(f).toLowerCase()
                return IMAGE_EXTS.has(ext) && path.basename(f, ext) === key
            })
            url = files[0]
        }
        if (!url) throw new Error(`Texture "${key}" not found`)
        return forwardToEditor("assets-get-texture-content-bounding-box", { key, url })
    }
)

/* ------------------------- project file utilities ------------------------ */

defTool(
    "project-list-files",
    "List the files of the project (optionally filtered by folder or extension).",
    {
        type: "object",
        properties: {
            folder: { type: "string", description: "Optional project-relative folder to list." },
            extension: { type: "string", description: "Optional extension filter, e.g. '.json' or '.ts'." }
        }
    },
    async ({ folder, extension }) => {
        let files = walkFiles(PROJECT_DIR, "")
        if (folder) {
            const prefix = normPath(folder).replace(/\/$/, "") + "/"
            files = files.filter(f => f.startsWith(prefix))
        }
        if (extension) files = files.filter(f => f.toLowerCase().endsWith(extension.toLowerCase()))
        return text(JSON.stringify({ files }, null, 2))
    }
)

defTool(
    "project-read-file",
    "Read a text file of the project (code, config and external asset metadata).",
    { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    async ({ path: p }) => {
        const rel = normPath(p)
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full) throw new Error("invalid path")
        return text(readFileSafely(PROJECT_DIR, full, "utf8", 1024 * 512))
    }
)

defTool(
    "project-write-file",
    "Write (create or overwrite) a text file of the project (code files, configs and external Asset Pack metadata). Native Project/Scene/Prefab documents are handled by dedicated tools.",
    {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"]
    },
    async ({ path: p, content }) => {
        const rel = normPath(p)
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full) throw new Error("invalid path")
        const normalized = rel.replace(/\\/g, "/").toLowerCase()
        if (normalized === "project.json" || normalized.endsWith(".cge-scene.json") || normalized.endsWith(".cge-prefab.json")) {
            throw new Error("Native Project, Scene and Prefab documents must be changed through validated native Editor MCP tools.")
        }
        if (!await ensureProjectDirectorySafely(PROJECT_DIR, path.dirname(full))) throw new Error("invalid path")
        const handle = await openSafeProjectFileForWrite(PROJECT_DIR, full)
        if (!handle) throw new Error("invalid path")
        try {
            await handle.truncate(0)
            await handle.writeFile(content ?? "", "utf8")
        } finally {
            await handle.close().catch(() => {})
        }
        notifyFilesChanged()
        return text(`Written: ${rel} (${Buffer.byteLength(content || "")} bytes)`)
    }
)

defTool(
    "project-delete-file",
    "Delete a file or folder from the project.",
    { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    async ({ path: p }) => {
        const rel = normPath(p)
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full || full === PROJECT_DIR) throw new Error("invalid path")
        const normalized = rel.replace(/\\/g, "/").toLowerCase()
        if (normalized === "project.json" || normalized.endsWith(".cge-scene.json") || normalized.endsWith(".cge-prefab.json")) {
            throw new Error("Native Project, Scene and Prefab documents cannot be deleted through generic file operations.")
        }
        if (!await removeProjectEntrySafely(PROJECT_DIR, full, { recursive: true, force: true })) throw new Error("invalid path")
        notifyFilesChanged()
        return text(`Deleted: ${rel}`)
    }
)

defTool(
    "project-compile-info",
    "Get the project entry files, Phaser version and native Scene asset references from Project Model v1.",
    { type: "object", properties: {} },
    async () => {
        const manifestPath = safeJoin(PROJECT_DIR, "project.json")
        if (!manifestPath) throw new Error("Native project.json manifest is unavailable.")
        const project = JSON.parse(readFileSafely(PROJECT_DIR, manifestPath, "utf8", 4 * 1024 * 1024))
        if (!Array.isArray(project.assets) || !Array.isArray(project.scenes)) {
            throw new Error("project.json does not contain the native Project Model v1 assets and scenes collections.")
        }
        const assets = new Map(project.assets.map(asset => [asset.id, asset]))
        const scenes = project.scenes.map(reference => {
            const asset = assets.get(reference.assetId)
            return { id: reference.id, assetId: reference.assetId, path: asset?.path ?? null }
        })
        const entryFiles = ["index.html", "game.js", "main.ts", "src/main.ts", "src/main.js"]
            .filter(file => fs.existsSync(path.join(PROJECT_DIR, file)))
        let phaserVersion = "unknown"
        const phaserFile = walkFiles(PROJECT_DIR, "").find(file => /(^|\/)(phaser\.js|phaser\.min\.js)$/.test(file))
        if (phaserFile) {
            try {
                const full = safeJoin(PROJECT_DIR, phaserFile)
                if (!full) throw new Error("invalid path")
                const head = readFileSafely(PROJECT_DIR, full, "utf8", 16 * 1024 * 1024).slice(0, 300)
                const match = head.match(/Phaser v([\d.]+)/) || head.match(/version:\s*["']([\d.]+)/)
                if (match) phaserVersion = match[1]
            } catch { /* optional runtime version probe */ }
        }
        return text(JSON.stringify({ entryFiles, phaserVersion, scenes }, null, 2))
    }
)

/* --------------------------- system instructions -------------------------- */

const SYSTEM_INSTRUCTIONS = `You are an engineering assistant for Codogma Engine. The active editor data contract is the native, versioned Codogma Project Model v1.

## Native document model
- The project manifest is 'project.json'; it declares stable project, asset, scene and component-module identities.
- Scene documents use '.cge-scene.json' and the native SceneDocumentV1 contract: a tree of Nodes with stable IDs, Transform data, Component instances and native references.
- Prefab documents use '.cge-prefab.json' and PrefabDocumentV1. Prefab instances reference a stable Prefab ID and carry native overrides.
- Component definitions are declared by native Project manifest componentModules with stable typeId, moduleAssetId, export and version. Component instances have their own stable IDs.
- FX are native Component instances attached to Nodes. Supported authoring types are Circle, Bloom, Gradient and Shine.
- Use only the documented native Project, Scene, Prefab, Node and Component contracts with stable IDs.

## Workflow
1. Inspect the project and available assets with project-list-files and assets-* tools.
2. Use scene-list / prefab-list to discover native documents. Use scene-open to open a document before node mutations.
3. Use scene-get-document and scene-get-nodes to inspect the active native document.
4. Use scene-create-node, scene-update-node, scene-delete-node and scene-reparent-node for native hierarchy edits. Use prefab-create / prefab-instantiate for existing Prefab operations.
5. Use component-attach / component-detach / component-set-enabled for registered native modules. Use fx-add / fx-update / fx-remove for native FX.
6. Verify changes by reading the native document again and, when a live editor is connected, use scene-capture-screenshot.
7. Save through scene-save. Native document mutations performed by editor tools are persisted by the Host; do not bypass validation with project-write-file.

## Safety and correctness
- Use stable IDs returned by the tools; never infer identity from names or paths.
- Do not invent component typeIds or asset IDs. Read the Project manifest and use registered values.
- Do not overwrite project.json, native Scene/Prefab documents or registered native assets with generic file-write operations.
- External Phaser Asset Pack JSON and Phaser animation JSON remain supported external contracts. Preserve their vendor-defined fields when editing them through asset tools.
- Tilemap, physics, object-list and filter authoring are not exposed by the current native tool registry. Report this limitation instead of attempting an unsupported mutation.
- If a workflow has no native tool yet, report the limitation instead of falling back to an unpublished internal format.
- File-only asset inspection may work without an open editor. Scene/Node/Prefab/Component/FX mutations and screenshots require a connected Editor Host MCP session.

## Response
Execute requested work using the available tools, verify each persisted change, and report concrete results and any unavailable capabilities. Do not claim visual verification unless a screenshot was actually returned.`

function findTextureUrl(key, types) {
    const wanted = types || ["image", "spritesheet", "atlas", "atlasXML", "multiatlas", "unityAtlas", "svg"]
    for (const pack of parseAssetPacks()) {
        const entry = pack.entries.find(item => item.key === key && wanted.includes(item.type))
        if (entry) return entry.url
    }
    const files = walkFiles(PROJECT_DIR, "").filter(file => {
        const extension = path.extname(file).toLowerCase()
        return IMAGE_EXTS.has(extension) && path.basename(file, extension) === key
    })
    return files[0] || null
}

/* ------------------------ external asset-pack tools ----------------------- */

defTool(
    "assets-get-available-asset-packs",
    "Get all available asset packs in the project, with their entries.",
    { type: "object", properties: {} },
    async () => {
        const packs = parseAssetPacks().map(p => ({
            file: p.file,
            entryCount: p.entries.length,
            entries: p.entries.map(e => ({ key: e.key, type: e.type, url: e.url }))
        }))
        return text(JSON.stringify({ assetPacks: packs }, null, 2))
    }
)

defTool(
    "assets-get-texture-size",
    "Get the width and height (in pixels) of a texture.",
    {
        type: "object",
        properties: {
            key: { type: "string", description: "The key of the texture." },
            texture: {
                type: "object",
                properties: { key: { type: "string" } },
                required: ["key"],
                description: "Alternative official shape."
            }
        },
        anyOf: [{ required: ["key"] }, { required: ["texture"] }]
    },
    async (args) => {
        const key = textureKeyOf(args)
        const url = findTextureUrl(key)
        if (!url) throw new Error(`Texture "${key}" not found`)
        const full = safeJoin(PROJECT_DIR, url)
        if (!full) throw new Error(`Texture file not found: ${url}`)
        const size = parseImageSize(readFileSafely(PROJECT_DIR, full))
        if (!size) throw new Error(`Cannot parse image size of ${url}`)
        return text(JSON.stringify({ key, url, ...size }, null, 2))
    }
)

defTool(
    "assets-get-bitmapfont-image",
    "Get the PNG image/texture of the given bitmap font.",
    { type: "object", properties: { key: { type: "string", description: "The key of the bitmap font." } }, required: ["key"] },
    async ({ key }) => {
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && e.type === "bitmapFont")
            if (e) {
                // the font page image: textureFilename or same base name as the .fnt/.xml
                const imgUrl = e.textureFilename
                    || e.url.replace(/\.(fnt|xml|json)$/i, ".png")
                const full = safeJoin(PROJECT_DIR, imgUrl)
                if (!full) throw new Error(`Bitmap font image not found: ${imgUrl}`)
                const mime = path.extname(full).toLowerCase() === ".jpg" ? "image/jpeg" : "image/png"
                return image(readFileSafely(PROJECT_DIR, full).toString("base64"), mime)
            }
        }
        throw new Error(`Bitmap font "${key}" not found`)
    }
)

defTool(
    "assets-get-spritesheet-image",
    "Get the PNG image/texture of the given spritesheet (to understand frame positions).",
    { type: "object", properties: { key: { type: "string", description: "The key of the spritesheet." } }, required: ["key"] },
    async ({ key }) => {
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && e.type === "spritesheet")
            if (e) {
                const full = safeJoin(PROJECT_DIR, e.url)
                if (!full) throw new Error(`Spritesheet image not found: ${e.url}`)
                const mime = path.extname(full).toLowerCase() === ".jpg" ? "image/jpeg" : "image/png"
                return image(readFileSafely(PROJECT_DIR, full).toString("base64"), mime)
            }
        }
        throw new Error(`Spritesheet "${key}" not found`)
    }
)

defTool(
    "assets-get-available-spine-skeletons",
    "Get all the Spine skeletons (spineJson/spineBinary assets) in the project.",
    { type: "object", properties: {} },
    async () => {
        const skeletons = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "spineJson" || e.type === "spineBinary") {
                    skeletons.push({ key: e.key, type: e.type, url: e.url, packFile: pack.file })
                }
            }
        }
        return text(JSON.stringify({ spineSkeletons: skeletons }, null, 2))
    }
)

defTool(
    "assets-get-available-spine-atlases",
    "Get all the Spine atlases in the project.",
    { type: "object", properties: {} },
    async () => {
        const atlases = []
        for (const pack of parseAssetPacks()) {
            for (const e of pack.entries) {
                if (e.type === "spineAtlas") atlases.push({ key: e.key, url: e.url, packFile: pack.file })
            }
        }
        return text(JSON.stringify({ spineAtlases: atlases }, null, 2))
    }
)

defTool(
    "assets-get-spine-skeleton-info",
    "Get the info (animations and skins) of a Spine skeleton by parsing its JSON data file.",
    {
        type: "object",
        properties: {
            dataKey: { type: "string", description: "The key of the spine data (skeleton) asset." },
            atlasKey: { type: "string", description: "The key of the spine atlas asset." }
        },
        required: ["dataKey", "atlasKey"]
    },
    async ({ dataKey, atlasKey }) => {
        let url = null
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === dataKey && (e.type === "spineJson" || e.type === "spineBinary"))
            if (e) { url = e.url; break }
        }
        if (!url) throw new Error(`Spine skeleton "${dataKey}" not found`)
        const full = safeJoin(PROJECT_DIR, url)
        if (!full) throw new Error(`Spine data file not found: ${url}`)
        const fileStat = await statProjectFileSafely(PROJECT_DIR, full)
        if (!fileStat?.isFile()) throw new Error(`Spine data file not found: ${url}`)
        if (!url.toLowerCase().endsWith(".json")) {
            return text(`Skeleton "${dataKey}" is binary (.skel): parse it in the editor for full info.`)
        }
        const data = JSON.parse(readFileSafely(PROJECT_DIR, full, "utf8", 16 * 1024 * 1024))
        const skins = (Array.isArray(data.skins) ? data.skins : [])
            .map(s => typeof s === "string" ? s : s.name).filter(Boolean)
        return text(JSON.stringify({
            dataKey, atlasKey, spineVersion: data.spine, skeletonName: data.skeleton?.name,
            skins, animations: Object.keys(data.animations || {})
        }, null, 2))
    }
)

defTool(
    "assets-get-tilemap-data",
    "Get the data (layers, tilesets, objects) of a Tiled tilemap file.",
    { type: "object", properties: { key: { type: "string", description: "The key of the tilemap in the asset pack." } }, required: ["key"] },
    async ({ key }) => {
        let url = null
        for (const pack of parseAssetPacks()) {
            const e = pack.entries.find(e => e.key === key && e.type && e.type.startsWith("tilemap"))
            if (e) { url = e.url; break }
        }
        if (!url) throw new Error(`Tilemap "${key}" not found`)
        const full = safeJoin(PROJECT_DIR, url)
        if (!full) throw new Error(`Tilemap file not found: ${url}`)
        const raw = readFileSafely(PROJECT_DIR, full, "utf8", 16 * 1024 * 1024)
        if (url.toLowerCase().endsWith(".json")) {
            const data = JSON.parse(raw)
            return text(JSON.stringify({
                key, url, width: data.width, height: data.height, tileWidth: data.tilewidth, tileHeight: data.tileheight,
                orientation: data.orientation, layers: (data.layers || []).map(l => ({ name: l.name, type: l.type, width: l.width, height: l.height })),
                tilesets: (data.tilesets || []).map(t => ({ name: t.name, image: t.image }))
            }, null, 2))
        }
        return text(raw.slice(0, 4000))
    }
)

/* ============================== google fonts ============================== */

async function fetchGoogleFontFamilies(filter) {
    const resp = await fetch("https://fonts.google.com/metadata/fonts", {
        headers: { "User-Agent": "Codogma Engine MCP" }
    })
    let raw = await resp.text()
    if (raw.startsWith(")]}'")) raw = raw.slice(raw.indexOf("\n") + 1)
    const data = JSON.parse(raw)
    const list = data.familyMetadataList || data.families || []
    const families = list
        .map(f => f.family)
        .filter(f => typeof f === "string")
        .filter(f => !filter || f.toLowerCase().includes(String(filter).toLowerCase()))
    return families
}

defTool(
    "assets-get-google-font-families",
    "Get the Google Fonts list of families (connects to the Google Fonts API). Optionally filtered.",
    { type: "object", properties: { filter: { type: "string", description: "Optional filter string." } } },
    async ({ filter }) => {
        try {
            const families = await fetchGoogleFontFamilies(filter)
            return text(JSON.stringify({ count: families.length, families: families.slice(0, 200) }, null, 2))
        } catch (e) {
            return text(`Could not reach the Google Fonts service: ${e.message}`)
        }
    }
)

defTool(
    "assets-get-google-font-info",
    "Get the Google Fonts info (TTF URL) for a given font family.",
    { type: "object", properties: { family: { type: "string", description: "The font family, exactly as in Google Fonts." } }, required: ["family"] },
    async ({ family }) => {
        const resp = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`, {
            headers: { "User-Agent": "" }
        })
        if (!resp.ok) throw new Error(`Google Fonts responded ${resp.status} for family "${family}"`)
        const css = await resp.text()
        const m = css.match(/url\((https:[^)]+\.ttf)\)/)
        if (!m) throw new Error(`Could not find a TTF URL for family "${family}"`)
        return text(JSON.stringify({ family, url: m[1] }, null, 2))
    }
)

defTool(
    "assets-add-google-font-to-asset-pack",
    "Add a Google Font configuration to the given asset pack (required to use the font in scene Text objects).",
    {
        type: "object",
        properties: {
            assetPackFileName: { type: "string", description: "The project-relative path of the asset pack file." },
            key: { type: "string", description: "The key of the font, unique in the project." },
            family: { type: "string", description: "The font family, exactly as in Google Fonts." },
            url: { type: "string", description: "The TTF URL (from assets-get-google-font-info). Optional: fetched automatically if omitted." }
        },
        required: ["assetPackFileName", "key", "family"]
    },
    async ({ assetPackFileName, key, family, url }) => {
        const rel = normPath(assetPackFileName)
        const full = safeJoin(PROJECT_DIR, rel)
        if (!full) throw new Error(`Asset pack not found: ${rel}`)
        if (!url) {
            const info = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`, { headers: { "User-Agent": "" } })
            const css = await info.text()
            const m = css.match(/url\((https:[^)]+\.ttf)\)/)
            if (!m) throw new Error(`Could not resolve the TTF URL for family "${family}"`)
            url = m[1]
        }
        const pack = JSON.parse(readFileSafely(PROJECT_DIR, full, "utf8", 8 * 1024 * 1024))
        const sectionName = Object.keys(pack).find(k => pack[k] && Array.isArray(pack[k].files)) || "section1"
        pack[sectionName] = pack[sectionName] || { files: [] }
        if (pack[sectionName].files.some(f => f.key === key)) throw new Error(`Key "${key}" already exists in ${rel}`)
        pack[sectionName].files.push({ key, type: "font", url, family })
        if (!writeFileSafely(PROJECT_DIR, full, JSON.stringify(pack, null, 4))) {
            throw new Error("invalid asset pack path: " + rel)
        }
        notifyFilesChanged()
        return text(`Font "${key}" (${family}) added to ${rel}.`)
    }

)

/** Read-only tool catalog used by MCP schema/contract tests. */
export function getBridgeToolsList() {
    return [...TOOLS.values()].map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
    }))
}

/* =========================== bridge (SSE channel) ========================= */

let bridgeClient = null
const pendingCommands = new Map()

const BRIDGE_COMMAND_TIMEOUT_MS = 20000

function rejectPendingForClient(clientId, reason) {
    for (const [id, pending] of pendingCommands) {
        if (pending.clientId !== clientId) continue
        clearTimeout(pending.timer)
        pendingCommands.delete(id)
        pending.reject(new Error(reason))
    }
}

function removeBridgeClient(expectedClient = null) {
    const client = bridgeClient
    if (!client || (expectedClient && client !== expectedClient)) return false

    bridgeClient = null
    rejectPendingForClient(client.clientId, "The Editor Host session disconnected before responding to the MCP command.")
    log("mcp-bridge: Editor Host disconnected")
    return true
}

function bridgeCommand(command) {
    return new Promise((resolve, reject) => {
        const client = bridgeClient
        if (!client) {
            return reject(new Error("Native Codogma MCP commands require a connected Editor Host session. Open the Codogma Editor and retry."))
        }

        const id = crypto.randomUUID()
        const timer = setTimeout(() => {
            pendingCommands.delete(id)
            reject(new Error(`Editor Host did not respond to command "${command.tool}" in time (20s).`))
        }, BRIDGE_COMMAND_TIMEOUT_MS)
        timer.unref?.()

        pendingCommands.set(id, {
            resolve,
            reject,
            timer,
            command,
            clientId: client.clientId
        })
        const payload = `event: command\ndata: ${JSON.stringify({ id, clientId: client.clientId, ...command })}\n\n`
        try {
            client.res.write(payload)
        } catch (error) {
            clearTimeout(timer)
            pendingCommands.delete(id)
            removeBridgeClient(client)
            reject(new Error(`Could not send command to Editor Host: ${error.message}`))
        }
    })
}

async function forwardToEditor(tool, args) {
    const result = await bridgeCommand({ tool, args })
    if (result && result.__error) throw new Error(String(result.__error))
    if (result && result.__image) {
        return image(result.data, result.mimeType || "image/png")
    }
    return text(typeof result === "string" ? result : JSON.stringify(result, null, 2))
}

export async function handleBridgeEvents(req, res) {
    // A single Editor Host owns the MCP bridge. A reconnect replaces the
    // previous transport and invalidates every command bound to that session.
    if (bridgeClient) {
        const previous = bridgeClient
        removeBridgeClient(previous)
        previous.res.end()
    }

    const client = {
        clientId: crypto.randomUUID(),
        res
    }
    bridgeClient = client

    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
    })
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId: client.clientId })}\n\n`)
    log("mcp-bridge: Editor Host connected")

    const ping = setInterval(() => {
        try {
            if (!res.write(": ping\n\n")) return
        } catch (error) {
            removeBridgeClient(client)
        }
    }, 15000)
    ping.unref?.()

    const disconnect = () => {
        clearInterval(ping)
        removeBridgeClient(client)
    }
    res.on?.("close", disconnect)
    res.on?.("error", disconnect)
}

export function getBridgeStatus() {
    return {
        connected: bridgeClient !== null,
        clientId: bridgeClient?.clientId ?? null
    }
}

export async function handleBridgeResult(req, res) {
    const body = await readBody(req)
    const pending = pendingCommands.get(body.id)
    if (!pending) return sendJSON(res, { error: "unknown command id" })

    if (typeof body.clientId !== "string" || body.clientId !== pending.clientId) {
        return sendJSON(res, { error: "command result belongs to a different editor session" })
    }

    clearTimeout(pending.timer)
    pendingCommands.delete(body.id)
    if (body.result && body.result.__error) {
        pending.reject(new Error(String(body.result.__error)))
    } else {
        pending.resolve(body.result)
    }
    return sendJSON(res, { ok: true })
}

/* ============================ MCP HTTP handler ============================ */

export async function handleMcpHttpRequest(req, res) {
    if (req.method === "GET") {
        // server-initiated SSE not required; stateless JSON server
        res.writeHead(405, { "Content-Type": "application/json" })
        return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "GET not supported (stateless server)" }, id: null }))
    }
    if (req.method === "OPTIONS") {
        // This endpoint sits behind the server's loopback/origin guard, so
        // cross-origin browser use is not a supported scenario. Only echo a
        // loopback http origin back; never grant a wildcard.
        let allowOrigin = null
        const origin = req.headers.origin
        if (typeof origin === "string") {
            try {
                const parsed = new URL(origin)
                const host = parsed.hostname
                if (parsed.protocol === "http:"
                    && (host === "127.0.0.1" || host === "localhost" || host === "::1")) {
                    allowOrigin = origin
                }
            } catch (e) {
                // keep allowOrigin = null
            }
        }
        const headers = {
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Authorization",
            "Vary": "Origin"
        }
        if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin
        res.writeHead(204, headers)
        return res.end()
    }
    if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" })
        return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }))
    }

    let msg
    try {
        msg = await readBody(req)
    } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" })
        return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }))
    }

    const isNotification = msg.id === undefined || msg.id === null
    const reply = (result) => {
        if (isNotification) {
            res.writeHead(202, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
            return res.end()
        }
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }))
    }
    const replyError = (code, message) => {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } }))
    }

    try {
        switch (msg.method) {

            case "initialize":
                return reply({
                    protocolVersion: msg.params?.protocolVersion || "2025-03-26",
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: {
                        name: "codogma-engine",
                        title: "Codogma Engine MCP Server",
                        version: "1.0.0"
                    },
                    instructions: "Codogma Engine MCP server. Call the `get-system-instructions` tool first to learn how to build the arguments of the scene/asset tools."
                })

            case "notifications/initialized":
                return reply({})

            case "ping":
                return reply({})

            case "tools/list":
                return reply({
                    tools: [...TOOLS.values()].map(t => ({
                        name: t.name,
                        description: t.description,
                        inputSchema: t.inputSchema
                    }))
                })

            case "tools/call": {
                const name = msg.params?.name
                const args = msg.params?.arguments || {}
                const tool = TOOLS.get(name)
                if (!tool) {
                    return replyError(-32602, `Unknown tool: ${name}`)
                }
                log(`mcp: tools/call ${name}`)
                try {
                    const result = await tool.exec(args)
                    return reply(result)
                } catch (e) {
                    return reply({
                        content: [{ type: "text", text: `Tool '${name}' error: ${e.message}` }],
                        isError: true
                    })
                }
            }

            default:
                return replyError(-32601, `Method not found: ${msg.method}`)
        }
    } catch (e) {
        return replyError(-32603, String(e.message || e))
    }
}

/* =============================== dispatcher =============================== */

function text(t) {
    return { content: [{ type: "text", text: t }] }
}

function image(base64, mimeType) {
    return { content: [{ type: "image", data: base64, mimeType }] }
}

export async function dispatchTool(name, args) {
    const tool = TOOLS.get(name)
    if (!tool) throw new Error(`Unknown tool: ${name}`)
    return tool.exec(args || {})
}

export function getSystemInstructions() {
    return text(SYSTEM_INSTRUCTIONS)
}

/** System prompt + tool-call protocol for the AI Chat loop. */
export function getChatSystemPrompt() {
    const toolLines = [...TOOLS.values()]
        .map(tool => `- ${tool.name}: ${tool.description.split(".")[0]}.`)
        .join("\n")
    return `${SYSTEM_INSTRUCTIONS}

## Available tools
${toolLines}

Use the registered tools directly. For each operation, inspect the relevant native Project/Scene/Prefab/Component data first, mutate through native tools, then read it back to verify.`
}

defTool(
    "get-system-instructions",
    "Get the native Codogma Project Model v1 instructions and the supported MCP workflows.",
    { type: "object", properties: {} },
    async () => text(SYSTEM_INSTRUCTIONS)
)

const nativeSceneSelector = {
    path: { type: "string", description: "Project-relative path of an active native Scene or Prefab document." }
}
const nativeNodeSelector = {
    nodeId: { type: "string", description: "Stable native Node ID." }
}
const nativeInstanceSelector = {
    ...nativeNodeSelector,
    instanceId: { type: "string", description: "Stable native Component instance ID." }
}
const nativeTool = (name, description, properties = {}, required = []) => {
    defTool(name, description, {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false
    }, async args => forwardToEditor(name, args))
}

nativeTool("scene-list", "List native Scene documents registered in project.json.")
nativeTool("scene-get-active", "Get the native Scene or Prefab document currently open in the Editor Host.")
nativeTool("scene-open", "Open a native Scene or Prefab document by its project-relative path.", {
    path: { type: "string", description: "Path to a .cge-scene.json or .cge-prefab.json document." }
}, ["path"])
nativeTool("scene-save", "Save the active native Scene or Prefab document.", nativeSceneSelector)
nativeTool("scene-create", "Create and register a native Scene document in Project Model v1.", {
    name: { type: "string", minLength: 1 },
    path: { type: "string", description: "New .cge-scene.json path, for example scenes/Level.cge-scene.json." }
}, ["name", "path"])
nativeTool("scene-get-document", "Read the active native SceneDocumentV1 or PrefabDocumentV1.", nativeSceneSelector)
nativeTool("scene-get-nodes", "Read the active native Node hierarchy, including stable IDs, parent IDs and component instances.", nativeSceneSelector)
nativeTool("scene-create-node", "Create a native Image, Text or Container Node in the active Scene.", {
    ...nativeSceneSelector,
    kind: { type: "string", enum: ["Image", "Text", "Container"] },
    assetId: { type: "string", description: "Optional stable Project Asset ID for an Image Node." },
    parentId: { type: ["string", "null"], description: "Optional parent Node ID." }
}, ["kind"])
nativeTool("scene-update-node", "Update native Node fields using a validated partial native Node patch. Only the documented fields are accepted.", {
    ...nativeSceneSelector,
    ...nativeNodeSelector,
    patch: {
        type: "object",
        description: "Partial Node fields: Transform (x, y, rotation, scaleX, scaleY, originX, originY), name/label, active, alpha, depth; Text Renderer (text, fontFamily, fontSize, color, align, wordWrapWidth); Image Renderer (assetId). Renderer fields must match the Node's built-in Renderer.",
        properties: {
            x: { type: "number" },
            y: { type: "number" },
            rotation: { type: "number" },
            scaleX: { type: "number" },
            scaleY: { type: "number" },
            originX: { type: "number" },
            originY: { type: "number" },
            name: { type: "string" },
            label: { type: "string" },
            active: { type: "boolean" },
            alpha: { type: "number", minimum: 0, maximum: 1 },
            depth: { type: "number" },
            text: { type: "string" },
            fontFamily: { type: "string", minLength: 1 },
            fontSize: { type: "string", minLength: 1 },
            color: { type: "string", minLength: 1 },
            align: { type: "string", enum: ["left", "center", "right"] },
            wordWrapWidth: { type: "number", minimum: 0 },
            assetId: { type: "string", minLength: 1 }
        },
        additionalProperties: false
    }
}, ["nodeId", "patch"])
nativeTool("scene-delete-node", "Delete a native Node from the active Scene.", { ...nativeSceneSelector, ...nativeNodeSelector }, ["nodeId"])
nativeTool("scene-reparent-node", "Reparent a native Node. Pass parentId null to move it to the Scene root.", {
    ...nativeSceneSelector,
    ...nativeNodeSelector,
    parentId: { type: ["string", "null"], description: "Parent Node ID or null for root." }
}, ["nodeId", "parentId"])
nativeTool("scene-clear", "Remove all root Nodes from the active native Scene.", nativeSceneSelector)
nativeTool("prefab-list", "List native Prefab documents registered in the Project manifest.")
nativeTool("prefab-get", "Read a native PrefabDocumentV1 by its stable ID.", {
    prefabId: { type: "string", description: "Stable native Prefab ID." }
}, ["prefabId"])
nativeTool("prefab-create", "Create a native PrefabDocumentV1 from a Node in the active Scene.", {
    nodeId: { type: "string", description: "Stable source Node ID." },
    path: { type: "string", description: "New .cge-prefab.json path." },
    name: { type: "string" }
}, ["nodeId", "path"])
nativeTool("prefab-instantiate", "Instantiate a registered native Prefab into the active Scene.", {
    ...nativeSceneSelector,
    prefabId: { type: "string", description: "Stable native Prefab ID." },
    name: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
    parentId: { type: "string" }
}, ["prefabId"])
nativeTool("component-attach", "Attach a registered native Component module to a Node.", {
    ...nativeSceneSelector,
    ...nativeNodeSelector,
    typeId: { type: "string", description: "Stable registered native Component typeId from project.json." },
    properties: { type: "object", additionalProperties: true }
}, ["nodeId", "typeId"])
nativeTool("component-detach", "Detach a native Component instance from a Node.", {
    ...nativeSceneSelector,
    ...nativeInstanceSelector
}, ["nodeId", "instanceId"])
nativeTool("component-set-enabled", "Set the enabled state of a native Component instance.", {
    ...nativeSceneSelector,
    ...nativeInstanceSelector,
    enabled: { type: "boolean" }
}, ["nodeId", "instanceId", "enabled"])
nativeTool("fx-add", "Add a native FX Component (Circle, Bloom, Gradient or Shine) to a Node.", {
    ...nativeSceneSelector,
    ...nativeNodeSelector,
    type: { type: "string", enum: ["Circle", "Bloom", "Gradient", "Shine"] }
}, ["nodeId", "type"])
nativeTool("fx-update", "Update properties of a native FX Component instance.", {
    ...nativeSceneSelector,
    ...nativeNodeSelector,
    effectId: { type: "string", description: "Stable FX Component instance ID." },
    patch: { type: "object", additionalProperties: true }
}, ["nodeId", "effectId", "patch"])
nativeTool("fx-remove", "Remove a native FX Component instance from a Node.", {
    ...nativeSceneSelector,
    ...nativeNodeSelector,
    effectId: { type: "string", description: "Stable FX Component instance ID." }
}, ["nodeId", "effectId"])
nativeTool("scene-capture-screenshot", "Capture a screenshot of the active native Scene viewport.", nativeSceneSelector)

const supportedExternalToolNames = new Set([
    "assets-get-available-textures", "assets-get-texture-binary",
    "assets-get-available-animations", "assets-get-available-tilemaps", "assets-get-available-bitmapfonts",
    "assets-get-texture-content-bounding-box",
    "project-list-files", "project-read-file", "project-write-file", "project-delete-file", "project-compile-info",
    "assets-get-available-asset-packs", "assets-get-texture-size",
    "assets-get-bitmapfont-image", "assets-get-spritesheet-image",
    "assets-get-available-spine-skeletons", "assets-get-available-spine-atlases",
    "assets-get-spine-skeleton-info", "assets-get-tilemap-data",
    "assets-get-google-font-families", "assets-get-google-font-info", "assets-add-google-font-to-asset-pack"
])
const supportedNativeToolNames = new Set([
    "get-system-instructions",
    "scene-list", "scene-get-active", "scene-open", "scene-save", "scene-create",
    "scene-get-document", "scene-get-nodes", "scene-create-node", "scene-update-node",
    "scene-delete-node", "scene-reparent-node", "scene-clear",
    "prefab-list", "prefab-get", "prefab-create", "prefab-instantiate",
    "component-attach", "component-detach", "component-set-enabled",
    "fx-add", "fx-update", "fx-remove", "scene-capture-screenshot"
])
for (const name of TOOLS.keys()) {
    if (!supportedExternalToolNames.has(name) && !supportedNativeToolNames.has(name)) TOOLS.delete(name)
}

/* =============================== small utils ============================== */

const MAX_MCP_BODY_BYTES = 32 * 1024 * 1024

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        let settled = false

        const cleanup = () => {
            req.off("data", onData)
            req.off("end", onEnd)
            req.off("error", onError)
        }

        const onData = chunk => {
            if (settled) return
            size += chunk.length
            if (size > MAX_MCP_BODY_BYTES) {
                settled = true
                cleanup()
                req.resume()
                const error = new Error("Request body too large")
                error.statusCode = 413
                reject(error)
                return
            }
            chunks.push(chunk)
        }

        const onEnd = () => {
            if (settled) return
            settled = true
            cleanup()
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"))
            } catch {
                reject(new Error("invalid JSON body"))
            }
        }

        const onError = error => {
            if (settled) return
            settled = true
            cleanup()
            reject(error)
        }

        req.on("data", onData)
        req.on("end", onEnd)
        req.on("error", onError)
    })
}

function sendJSON(res, data) {
    res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
    })
    res.end(JSON.stringify(data))
}
