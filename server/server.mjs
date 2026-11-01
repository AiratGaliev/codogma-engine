/**
 * Codogma Engine — local open-source server implementation.
 *
 * The official server binary is closed-source and only distributed from
 * updates.phasereditor2d.com (not reachable from this sandbox), so this
 * server re-implements the client/server protocol used by the open-source
 * IDE client (source/editor/plugins/**):
 *
 *   POST /editor/api            { method, body } -> JSON
 *   POST /editor/upload         multipart (uploadTo, file) -> JSON
 *   GET  /editor/               generated index.html (plugin scripts/styles)
 *   GET  /editor/product.json   product metadata
 *   GET  /editor/app/plugins/<id>/<path>   plugin static resources
 *   GET  /editor/app/editor-icons/<theme>/godot/<name>.svg shared Godot SVG resources
 *   GET  /editor/project/<path> project files (with ?m= cache busting)
 *   GET  /editor/external/*     project files for the "Play" mode
 *
 * Supported api methods:
 *   GetServerMode, GetProjectConfig, GetProjectFiles, GetProjectFilesHash,
 *   CreateFolder, SetFileString, DeleteFiles, RenameFile, CopyFile,
 *   MoveFiles, GetImageSize, GetNewVersionAvailable, UnlockEditor,
 *   OpenBrowser, OpenFileManager, OpenVSCode
 */

import 'dotenv/config'

import http from "http"
import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"
import {
    initMcp,
    handleMcpHttpRequest,
    handleBridgeRequest,
    handleOfficialBridgeRequest,
    handleBridgeEvents,
    handleBridgeActivate,
    handleBridgeResult,
    bridgeClientCount,
    getBridgeStatus,
    dispatchTool,
    getChatSystemPrompt
} from "./mcp.mjs"
import { isInsideBase, safeJoin, openSafeProjectFileForRead, openSafeProjectFileForWrite, isSafeOpenFileHandle, readFileSafely, readFilePrefixSafely, ensureProjectDirectorySafely, readProjectDirectoryEntriesSafelySync, removeProjectEntrySafely, renameProjectEntrySafely, copyProjectEntrySafely, statProjectDirectorySafelySync } from "./path-security.mjs"
import { evaluateRequestGuard, parseAllowedHosts, parseAllowedOrigins } from "./request-origin.mjs"
import { readRequestBuffer } from "./request-body.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const PORT = Number(process.env.PORT || 3000)
const PROJECT_DIR = path.resolve(process.env.PROJECT_DIR || path.join(ROOT, "tests", "workspace", "test-typescript"))
const MAX_API_BODY_BYTES = 32 * 1024 * 1024
const MAX_UPLOAD_BODY_BYTES = 128 * 1024 * 1024
const EDITOR_DIR = path.resolve(process.env.EDITOR_DIR || path.join(ROOT, "source", "editor"))
const EDITOR_HOST_DIR = path.resolve(process.env.EDITOR_HOST_DIR || path.join(ROOT, "src", "editor", "dist"))
const EDITOR_UI = process.env.CODOGMA_EDITOR_UI || "legacy"
if (!["legacy", "solidjs"].includes(EDITOR_UI)) {
    throw new Error(`Unsupported CODOGMA_EDITOR_UI value "${EDITOR_UI}". Use "legacy" or "solidjs".`)
}
const PLUGINS_DIR = path.join(EDITOR_DIR, "plugins")
const EDITOR_ICONS_DIR = path.resolve(ROOT, "src", "editor", "icons")
const DEV_MODE = process.env.DEV_MODE === "1"

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".cjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".ts": "text/plain; charset=utf-8",
    ".tsx": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".wasm": "application/wasm",
    ".zip": "application/zip",
    ".atlas": "text/plain; charset=utf-8",
    ".fnt": "text/plain; charset=utf-8",
    ".tmx": "application/xml; charset=utf-8",
    ".glsl": "text/plain; charset=utf-8",
    ".frag": "text/plain; charset=utf-8",
    ".vert": "text/plain; charset=utf-8",
    ".scene": "application/json; charset=utf-8",
    ".components": "application/json; charset=utf-8"
}

function log(...args) {
    console.log(new Date().toISOString().slice(11, 19), ...args)
}

/* ============================== file helpers ============================== */
/*
 * safeJoin / isWithinRealBase / isInsideBase live in ./path-security.mjs so
 * they can be unit-tested directly; the TOCTOU-specific write helper below
 * stays here because it depends on the server's PROJECT_DIR.
 */

function realBaseOrNull() {
    try {
        return fs.realpathSync(PROJECT_DIR)
    } catch {
        return null
    }
}

/*
 * Additional Host headers and browser Origins accepted from loopback peers,
 * e.g. when the editor is published through a trusted local reverse proxy
 * that forwards the public hostname (sandbox preview, tunnel) or rewrites
 * the Host header to an internal gateway name. Unset stays strictly
 * loopback; see server/request-origin.mjs for the threat model.
 */
const EXTRA_ALLOWED_HOSTS = parseAllowedHosts(process.env.CODOGMA_ALLOWED_HOSTS)
const EXTRA_ALLOWED_ORIGINS = parseAllowedOrigins(process.env.CODOGMA_ALLOWED_ORIGINS)

function rejectNonLocalRequest(req, res) {
    const reason = evaluateRequestGuard({
        peerAddress: req.socket.remoteAddress,
        hostHeader: req.headers.host,
        originHeader: req.headers.origin,
        extraAllowedHosts: EXTRA_ALLOWED_HOSTS,
        extraAllowedOrigins: EXTRA_ALLOWED_ORIGINS
    })
    if (reason === null) return false

    // A misconfigured proxy in front of the editor must be visible in the
    // server output instead of surfacing to the user as an opaque 403.
    log(`403 rejected (${reason}): peer=${req.socket.remoteAddress}`
        + ` host=${JSON.stringify(req.headers.host)}`
        + ` origin=${JSON.stringify(req.headers.origin)}`)

    res.writeHead(403, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Vary": "Origin"
    })
    res.end("Forbidden")
    return true
}

function walkTree(dirPath, relPrefix, files, folders, metadata = new Map()) {
    const entries = readProjectDirectoryEntriesSafelySync(PROJECT_DIR, dirPath)
    if (!entries) return metadata

    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink) continue
        const rel = relPrefix ? relPrefix + "/" + entry.name : entry.name
        const full = path.join(dirPath, entry.name)
        if (entry.isDirectory) {
            folders.push(rel)
            metadata.set(rel, entry)
            walkTree(full, rel, files, folders, metadata)
        } else if (entry.isFile) {
            files.push(rel)
            metadata.set(rel, entry)
        }
    }
    return metadata
}

/*
 * The IDE client sends file paths with the project root folder as the first
 * segment, while /editor/project URLs are relative to the project root.
 */
function apiPath(p) {
    if (typeof p !== "string" || p.length === 0) return p
    const parts = p.split(/[\\/]/).filter(Boolean)
    if (parts.length > 1 && parts[0] === path.basename(PROJECT_DIR)) {
        return parts.slice(1).join("/")
    }
    return p
}

/**
 * Return metadata from a verified parent-directory enumeration rather than
 * following a client-controlled pathname with stat().
 */
function fileData(projectDir, relPath) {
    const full = safeJoin(projectDir, relPath)
    if (!full || full === projectDir) return null
    const entries = readProjectDirectoryEntriesSafelySync(projectDir, path.dirname(full))
    if (!entries) return null
    const entry = entries.find(candidate => candidate.name === path.basename(full))
    if (!entry || entry.isSymbolicLink || (!entry.isFile && !entry.isDirectory)) return null
    return {
        name: path.basename(relPath),
        isFile: entry.isFile,
        size: entry.isFile ? entry.size : 0,
        modTime: Math.floor(entry.mtimeMs),
        children: entry.isFile ? undefined : []
    }
}

function buildRootFileData(projectDir) {
    const name = path.basename(projectDir)
    const children = []
    const entries = readProjectDirectoryEntriesSafelySync(projectDir, projectDir) || []
    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink) continue
        const full = path.join(projectDir, entry.name)
        if (entry.isDirectory) {
            const sub = { name: entry.name, isFile: false, size: 0, modTime: Math.floor(entry.mtimeMs), children: [] }
            buildFolderData(projectDir, full, entry.name, sub)
            children.push(sub)
        } else if (entry.isFile) {
            children.push({ name: entry.name, isFile: true, size: entry.size, modTime: Math.floor(entry.mtimeMs) })
        }
    }
    return { name, isFile: false, size: 0, modTime: Date.now(), children }
}

function buildFolderData(projectRoot, dirPath, relPrefix, node) {
    const entries = readProjectDirectoryEntriesSafelySync(projectRoot, dirPath)
    if (!entries) return

    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink) continue
        const rel = relPrefix + "/" + entry.name
        const full = path.join(dirPath, entry.name)
        if (entry.isDirectory) {
            const sub = { name: entry.name, isFile: false, size: 0, modTime: Math.floor(entry.mtimeMs), children: [] }
            buildFolderData(projectRoot, full, rel, sub)
            node.children.push(sub)
        } else if (entry.isFile) {
            node.children.push({ name: entry.name, isFile: true, size: entry.size, modTime: Math.floor(entry.mtimeMs) })
        }
    }
}

const hashCache = { value: "", stamp: 0 }

function computeProjectHash() {
    const now = Date.now()
    if (hashCache.value && now - hashCache.stamp < 1000) {
        return hashCache.value
    }
    const files = [], folders = [], metadata = new Map()
    walkTree(PROJECT_DIR, "", files, folders, metadata)
    const parts = []
    for (const rel of files.concat(folders).sort()) {
        const entry = metadata.get(rel)
        if (entry) parts.push(`${rel}|${Math.floor(entry.mtimeMs)}|${entry.size}`)
    }
    const value = crypto.createHash("sha1").update(parts.join("\n")).digest("hex")
    hashCache.value = value
    hashCache.stamp = now
    return value
}

/* ============================== image size =============================== */

function getImageSize(input, extension) {
    if (!Buffer.isBuffer(input)) return null
    const data = input.subarray(0, 65536)

    // PNG
    if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
        return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
    }

    // GIF
    if (data.length > 10 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
        return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) }
    }

    // BMP
    if (data.length > 26 && data[0] === 0x42 && data[1] === 0x4D) {
        return { width: data.readInt32LE(18), height: Math.abs(data.readInt32LE(22)) }
    }

    // JPEG
    if (data.length > 4 && data[0] === 0xFF && data[1] === 0xD8) {
        let off = 2
        while (off + 9 < data.length) {
            if (data[off] !== 0xFF) { off++; continue }
            const marker = data[off + 1]
            if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
                return { height: data.readUInt16BE(off + 5), width: data.readUInt16BE(off + 7) }
            }
            const len = data.readUInt16BE(off + 2)
            off += 2 + len
        }
    }

    // WEBP
    if (data.length > 30 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
        const chunk = data.toString("ascii", 12, 16)
        if (chunk === "VP8X") {
            const w = 1 + (data[24] | (data[25] << 8) | (data[26] << 16))
            const h = 1 + (data[27] | (data[28] << 8) | (data[29] << 16))
            return { width: w, height: h }
        }
        if (chunk === "VP8L") {
            const b = data.readUInt32LE(21)
            return { width: (b & 0x3FFF) + 1, height: ((b >> 14) & 0x3FFF) + 1 }
        }
        if (chunk === "VP8 ") {
            const w = data.readUInt16LE(26) & 0x3FFF
            const h = data.readUInt16LE(28) & 0x3FFF
            return { width: w, height: h }
        }
    }

    // SVG
    const ext = String(extension || "").toLowerCase()
    if (ext === ".svg") {
        const text = data.toString("utf8")
        const w = text.match(/width\s*=\s*["']([\d.]+)/)
        const h = text.match(/height\s*=\s*["']([\d.]+)/)
        if (w && h) return { width: Math.round(+w[1]), height: Math.round(+h[1]) }
        const vb = text.match(/viewBox\s*=\s*["'][^\s"']+[\s]+([\d.]+)[\s]+([\d.]+)/)
        if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]) }
    }

    return null
}

/* ============================== index.html =============================== */

function readPluginsManifest() {
    const plugins = []
    for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const pjPath = path.join(PLUGINS_DIR, entry.name, "plugin.json")
        if (!fs.existsSync(pjPath)) continue
        try {
            const meta = JSON.parse(fs.readFileSync(pjPath, "utf8"))
            plugins.push({ folder: entry.name, meta })
        } catch (e) {
            log("bad plugin.json:", pjPath)
        }
    }
    plugins.sort((a, b) => {
        const pa = a.meta.priority ?? 0
        const pb = b.meta.priority ?? 0
        if (pa !== pb) return pa - pb
        return a.folder.localeCompare(b.folder)
    })
    return plugins
}

function pluginAssetURL(pluginId, rel) {
    return `/editor/app/plugins/${pluginId}/${rel}`
}

function renderIndexHTML() {
    if (EDITOR_UI === "solidjs") {
        const indexPath = safeJoin(EDITOR_HOST_DIR, "index.html")
        if (!indexPath || !fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
            throw new Error(`SolidJS Editor Host production bundle is missing at "${EDITOR_HOST_DIR}". Run "npm --prefix src/editor run build" or roll back with CODOGMA_EDITOR_UI=legacy.`)
        }
        return fs.readFileSync(indexPath, "utf8")
    }

    const productPath = path.join(EDITOR_DIR, "product.json")
    const product = JSON.parse(fs.readFileSync(productPath, "utf8"))
    const plugins = readPluginsManifest()

    const styles = []
    const scripts = []
    for (const { meta } of plugins) {
        for (const s of (DEV_MODE ? (meta["scripts-dev"] || meta.scripts || []) : (meta.scripts || []))) {
            scripts.push(pluginAssetURL(meta.id, s))
        }
        for (const s of (meta.styles || [])) {
            styles.push(pluginAssetURL(meta.id, s))
        }
    }

    const version = product.version || "1.0"

    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${product.title || "Codogma Engine"} v${version}</title>
    <link rel="icon" href="/editor/static/favicon.png">
${styles.map(s => `    <link rel="stylesheet" href="${s}">`).join("\n")}
</head>

<body>
${scripts.map(s => `    <script src="${s}"></script>`).join("\n")}
</body>

</html>`
}

/* =============================== API layer =============================== */

async function readBodyJSON(req) {
    const body = await readRequestBuffer(req, MAX_API_BODY_BYTES)
    return JSON.parse(body.toString("utf8") || "{}")
}

function sendJSON(res, data) {
    const body = JSON.stringify(data)
    res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    })
    res.end(body)
}

function apiError(res, message, statusCode = 200) {
    const body = JSON.stringify({ error: message || "unknown error" })
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    })
    res.end(body)
}

async function handleAPI(req, res) {
    let reqData
    try {
        reqData = await readBodyJSON(req)
    } catch (e) {
        return apiError(
            res,
            e.statusCode === 413 ? e.message : "invalid request body",
            e.statusCode || 400
        )
    }
    const method = reqData.method
    const body = reqData.body || {}
    log("api:", method)

    try {
        switch (method) {

            case "GetServerMode":
                return sendJSON(res, {
                    desktop: false,
                    unlocked: true,
                    externalEditorName: "VSCode"
                })

            case "GetProjectConfig": {
                // The project root can contain symlinks too. Keep this read under
                // the same real-path containment policy as other project files.
                const configPath = safeJoin(PROJECT_DIR, "phasereditor2d.json")
                if (configPath && fs.existsSync(configPath)) {
                    try {
                        return sendJSON(res, JSON.parse(readFileSafely(PROJECT_DIR, configPath, "utf8", 1024 * 1024)))
                    } catch (e) { /* fallthrough */ }
                }
                return sendJSON(res, {})
            }

            case "GetNewVersionAvailable":
                return sendJSON(res, { available: false })

            case "GetProjectFilesHash":
                return sendJSON(res, { hash: computeProjectHash() })

            case "GetProjectFiles": {
                const hash = computeProjectHash()
                const files = [], folders = []
                walkTree(PROJECT_DIR, "", files, folders)
                const rootFile = buildRootFileData(PROJECT_DIR)
                return sendJSON(res, {
                    hash,
                    maxNumberOfFiles: 1000000,
                    projectNumberOfFiles: files.length + folders.length,
                    rootFile,
                    error: ""
                })
            }

            case "CreateFolder": {
                const full = safeJoin(PROJECT_DIR, apiPath(body.path))
                if (!full) return apiError(res, "invalid path")

                // Read metadata from the verified directory descriptor. A
                // second fsp.stat(pathname) here would reopen a race window
                // after the descriptor-anchored validation/creation.
                let st = statProjectDirectorySafelySync(PROJECT_DIR, full)
                if (!st) {
                    if (!await ensureProjectDirectorySafely(PROJECT_DIR, full)) {
                        return apiError(res, "invalid path")
                    }
                    st = statProjectDirectorySafelySync(PROJECT_DIR, full)
                }

                if (!st || !st.isDirectory()) return apiError(res, "invalid path")
                return sendJSON(res, { modTime: Math.floor(st.mtimeMs) })
            }

            case "SetFileString": {
                const full = safeJoin(PROJECT_DIR, apiPath(body.path))
                if (!full) return apiError(res, "invalid path")
                if (!await ensureProjectDirectorySafely(PROJECT_DIR, path.dirname(full))) return apiError(res, "invalid path")
                const handle = await openSafeProjectFileForWrite(PROJECT_DIR, full)
                if (!handle) return apiError(res, "invalid path")
                let st
                try {
                    await handle.truncate(0)
                    await handle.writeFile(body.content ?? "", "utf8")
                    st = await handle.stat()
                } finally {
                    await handle.close().catch(() => { })
                }
                hashCache.value = ""
                return sendJSON(res, {
                    name: path.basename(body.path),
                    isFile: true,
                    size: Buffer.byteLength(body.content ?? "", "utf8"),
                    modTime: Math.floor(st.mtimeMs)
                })
            }

            case "DeleteFiles": {
                for (const p of (body.paths || [])) {
                    const full = safeJoin(PROJECT_DIR, apiPath(p))
                    if (!full || full === PROJECT_DIR) continue
                    if (!await removeProjectEntrySafely(PROJECT_DIR, full, { recursive: true, force: true })) {
                        return apiError(res, "invalid path")
                    }
                }
                hashCache.value = ""
                return sendJSON(res, {})
            }

            case "RenameFile": {
                const from = safeJoin(PROJECT_DIR, apiPath(body.oldPath))
                const to = safeJoin(PROJECT_DIR, apiPath(body.newPath))
                if (!from || !to || from === PROJECT_DIR || to === PROJECT_DIR) return apiError(res, "invalid path")
                if (!await ensureProjectDirectorySafely(PROJECT_DIR, path.dirname(to))) {
                    return apiError(res, "invalid path")
                }
                if (!await renameProjectEntrySafely(PROJECT_DIR, from, to)) {
                    return apiError(res, "invalid path")
                }
                hashCache.value = ""
                return sendJSON(res, {})
            }

            case "CopyFile": {
                const from = safeJoin(PROJECT_DIR, apiPath(body.fromPath))
                const to = safeJoin(PROJECT_DIR, apiPath(body.toPath))
                if (!from || !to || from === PROJECT_DIR || to === PROJECT_DIR) return apiError(res, "invalid path")
                if (!await copyProjectEntrySafely(PROJECT_DIR, from, to)) return apiError(res, "invalid path")

                hashCache.value = ""
                return sendJSON(res, { file: fileData(PROJECT_DIR, apiPath(body.toPath)) })
            }

            case "MoveFiles": {
                const toDir = safeJoin(PROJECT_DIR, apiPath(body.movingToPath))
                if (!toDir) return apiError(res, "invalid path")
                if (!await ensureProjectDirectorySafely(PROJECT_DIR, toDir)) return apiError(res, "invalid path")

                for (const p of (body.movingPaths || [])) {
                    const from = safeJoin(PROJECT_DIR, apiPath(p))
                    if (!from || from === PROJECT_DIR) continue
                    const to = path.join(toDir, path.basename(p))
                    if (!await renameProjectEntrySafely(PROJECT_DIR, from, to)) {
                        return apiError(res, "invalid path")
                    }
                }
                hashCache.value = ""
                return sendJSON(res, {})
            }

            case "GetImageSize": {
                const full = safeJoin(PROJECT_DIR, apiPath(body.path))
                if (!full) return apiError(res, "file not found")
                const handle = await openSafeProjectFileForRead(PROJECT_DIR, full)
                if (!handle) return apiError(res, "file not found")
                let data
                try {
                    const buffer = Buffer.alloc(65536)
                    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
                    data = buffer.subarray(0, bytesRead)
                } finally {
                    await handle.close().catch(() => {})
                }
                const size = getImageSize(data, path.extname(full))
                if (!size) return apiError(res, "cannot read image size")
                return sendJSON(res, size)
            }

            case "UnlockEditor":
                return sendJSON(res, { unlocked: true })

            case "OpenBrowser":
            case "OpenFileManager":
            case "OpenVSCode":
                log(`external request ignored: ${method}`)
                return sendJSON(res, {})

            default:
                log("unknown api method:", method)
                return apiError(res, `unknown method "${method}"`)
        }
    } catch (e) {
        log("api error:", method, e.message)
        return apiError(res, e.message, e.statusCode || 200)
    }
}

/* ============================ multipart upload =========================== */

async function handleUpload(req, res) {
    try {
        const contentType = req.headers["content-type"] || ""
        const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)
        if (!m) return apiError(res, "no boundary")
        const boundary = "--" + (m[1] || m[2])

        const buffer = await readRequestBuffer(req, MAX_UPLOAD_BODY_BYTES)

        const parts = []
        let start = buffer.indexOf(boundary)
        while (start !== -1) {
            const next = buffer.indexOf(boundary, start + boundary.length)
            if (next === -1) break
            parts.push(buffer.subarray(start + boundary.length, next))
            start = next
        }

        let uploadTo = ""
        let fileDataOut = null

        for (const part of parts) {
            const headerEnd = part.indexOf("\r\n\r\n")
            if (headerEnd === -1) continue
            const header = part.toString("utf8", 0, headerEnd)
            const data = part.subarray(headerEnd + 4, part.length - 2) // strip trailing \r\n

            const nameMatch = header.match(/name="([^"]*)"/)
            const fileMatch = header.match(/filename="([^"]*)"/)
            const fieldName = nameMatch ? nameMatch[1] : ""

            if (fieldName === "uploadTo") {
                uploadTo = apiPath(data.toString("utf8"))
            } else if (fileMatch && fileMatch[1]) {
                const fileName = path.basename(fileMatch[1])
                const dirFull = safeJoin(PROJECT_DIR, uploadTo)
                if (!dirFull) return apiError(res, "invalid upload path")
                const fileFull = safeJoin(PROJECT_DIR, path.join(uploadTo, fileName))
                if (!fileFull) return apiError(res, "invalid upload path")

                if (!await ensureProjectDirectorySafely(PROJECT_DIR, dirFull)) return apiError(res, "invalid upload path")
                // Same TOCTOU discipline as SetFileString: verified handle at open,
                // kernel-path re-verification after the open.
                const handle = await openSafeProjectFileForWrite(PROJECT_DIR, fileFull)
                if (!handle) return apiError(res, "invalid upload path")
                let st
                try {
                    await handle.truncate(0)
                    await handle.writeFile(data)
                    st = await handle.stat()
                } finally {
                    await handle.close().catch(() => { })
                }
                fileDataOut = {
                    name: fileName,
                    isFile: true,
                    size: st.size,
                    modTime: Math.floor(st.mtimeMs)
                }
            }
        }

        hashCache.value = ""

        if (!fileDataOut) return apiError(res, "no file in request")
        return sendJSON(res, { file: fileDataOut })
    } catch (e) {
        log("upload error:", e.message)
        return apiError(res, e.message, e.statusCode || 200)
    }
}

/* ============================== static files ============================= */

/*
 * Full-project snapshot archives (codogma-engine-<stamp>-dev+<N>commits.zip|tar.gz)
 * are produced in the repository root for workspace hand-off. They are workspace
 * artifacts, never committed; this route makes them downloadable through the
 * same guarded server (loopback peer + Host/Origin checks apply to every
 * request) without exposing anything else from the repository root.
 */
const ARCHIVE_NAME_PATTERN = /^codogma-engine-[A-Za-z0-9+._-]+\.(zip|tar\.gz)$/

function listArchiveSnapshots() {
    try {
        return fs.readdirSync(ROOT, { withFileTypes: true })
            .filter(entry => entry.isFile() && ARCHIVE_NAME_PATTERN.test(entry.name))
            .map(entry => {
                const full = path.join(ROOT, entry.name)
                const stat = fs.lstatSync(full)
                if (stat.isSymbolicLink() || !stat.isFile()) return null
                return { name: entry.name, full, mtimeMs: stat.mtimeMs }
            })
            .filter(Boolean)
    } catch {
        return []
    }
}

async function serveArchive(req, res, name) {
    if (!ARCHIVE_NAME_PATTERN.test(name) || path.dirname(path.join(ROOT, name)) !== ROOT) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
        res.end(req.method === "HEAD" ? undefined : "Invalid archive name")
        return
    }

    const archivePath = path.join(ROOT, name)
    let handle
    let st
    try {
        // Stream only the actual object selected by a validated descriptor.
        // The initial lstat/name validation alone would leave a swap window.
        handle = await fsp.open(
            archivePath,
            fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
        )
        if (!isSafeOpenFileHandle(ROOT, archivePath, handle.fd)) {
            throw new Error("Archive is not a safe regular file")
        }
        st = await handle.stat()
        if (!st.isFile()) throw new Error("Archive is not a regular file")
    } catch {
        if (handle) await handle.close().catch(() => {})
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
        res.end(req.method === "HEAD" ? undefined : "Archive not found — GET /archive/ lists the newest snapshot")
        return
    }

    res.writeHead(200, {
        "Content-Type": name.endsWith(".zip") ? "application/zip" : "application/gzip",
        "Content-Length": st.size,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store"
    })

    if (req.method === "HEAD") {
        await handle.close().catch(() => {})
        res.end()
        return
    }

    const stream = handle.createReadStream({ autoClose: true })
    stream.on("error", error => {
        if (!res.destroyed) res.destroy(error)
    })
    stream.pipe(res)
}

async function serveFile(req, res, absPath, cacheControl, projectBase) {
    // Determine directories through a verified directory handle rather than a
    // path-based stat()/existsSync() pair that can follow a swapped symlink.
    const directoryEntries = readProjectDirectoryEntriesSafelySync(projectBase, absPath)
    if (directoryEntries !== null) {
        const indexEntry = directoryEntries.find(entry =>
            entry.name === "index.html" && entry.isFile && !entry.isSymbolicLink
        )
        if (indexEntry) {
            return serveFile(req, res, path.join(absPath, "index.html"), cacheControl, projectBase)
        }
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("Not Found")
        return
    }

    // Re-open and validate the object actually selected by the OS. The
    // response body is streamed from this verified descriptor, not from the
    // pathname (which could be retargeted after safeJoin/stat).
    let handle = await openSafeProjectFileForRead(projectBase, absPath)
    if (!handle) {
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("Not Found")
        return
    }

    let streamOwnsHandle = false
    try {
        const st = await handle.stat()
        if (!st.isFile()) {
            res.writeHead(404, { "Content-Type": "text/plain" })
            res.end("Not Found")
            return
        }

        const ext = path.extname(absPath).toLowerCase()
        const mime = MIME[ext] || "application/octet-stream"
        const headers = {
            "Content-Type": mime,
            "Content-Length": st.size,
            "Cache-Control": cacheControl || "no-cache",
            "Last-Modified": st.mtime.toUTCString()
        }

        if (req.method === "HEAD") {
            res.writeHead(200, headers)
            res.end()
            return
        }

        const inm = req.headers["if-none-match"]
        const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`
        headers["ETag"] = etag
        if (inm === etag) {
            res.writeHead(304, headers)
            res.end()
            return
        }

        res.writeHead(200, headers)
        if (req.method === "GET") {
            const stream = handle.createReadStream({ autoClose: true })
            streamOwnsHandle = true
            stream.on("error", error => {
                if (!res.destroyed) res.destroy(error)
            })
            stream.pipe(res)
        } else {
            res.end()
        }
    } finally {
        if (!streamOwnsHandle) {
            await handle.close().catch(() => {})
        }
    }
}

/* ================================ server ================================= */

const server = http.createServer(async (req, res) => {

    if (rejectNonLocalRequest(req, res)) return

    let urlPath
    try {
        urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
    } catch (e) {
        urlPath = "/"
    }

    try {
        // redirects
        if (urlPath === "/" || urlPath === "/editor") {
            res.writeHead(302, { Location: "/editor/" })
            res.end()
            return
        }

        // full-project archive snapshots: /archive/ redirects to the newest
        // codogma-engine-*.zip|tar.gz, /archive/<name> streams that file
        if (urlPath === "/archive" || urlPath === "/archive/" || urlPath.startsWith("/archive/")) {
            if (req.method !== "GET" && req.method !== "HEAD") {
                res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Allow": "GET, HEAD" })
                res.end("Method Not Allowed")
                return
            }
            if (urlPath === "/archive" || urlPath === "/archive/") {
                const latest = listArchiveSnapshots().sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
                if (!latest) {
                    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
                    res.end("No archive snapshots found in the project root")
                    return
                }
                res.writeHead(302, { Location: "/archive/" + encodeURIComponent(latest.name) })
                res.end()
                return
            }
            return serveArchive(req, res, urlPath.slice("/archive/".length))
        }

        // MCP server (Model Context Protocol, JSON-RPC over Streamable HTTP)
        if (urlPath === "/editor/mcp" || urlPath === "/editor/mcp/") {
            return await handleMcpHttpRequest(req, res)
        }

        // MCP editor bridge (official-style { tool, args } endpoint)
        if (urlPath === "/editor/mcp-bridge" && req.method === "POST") {
            return await handleBridgeRequest(req, res)
        }

        // MCP editor bridge (SSE channel to the running editor client)
        if (urlPath === "/editor/mcp-bridge/events" && req.method === "GET") {
            return await handleBridgeEvents(req, res)
        }

        // MCP editor bridge (the focused editor tab claims command ownership)
        if (urlPath === "/editor/mcp-bridge/activate" && req.method === "POST") {
            return await handleBridgeActivate(req, res)
        }

        // MCP editor bridge (editor client posts command results)
        if (urlPath === "/editor/mcp-bridge/result" && req.method === "POST") {
            return await handleBridgeResult(req, res)
        }

        // MCP editor bridge status (for the MCP Server Configuration dialog)
        if (urlPath === "/editor/mcp-bridge-status") {
            return sendJSON(res, getBridgeStatus())
        }

        // AI Chat (v5-style feature): LLM agent with MCP tool access
        if (urlPath === "/editor/ai-chat" && req.method === "POST") {
            return await handleAiChat(req, res)
        }

        if (urlPath === "/favicon.png") {
            return serveFile(req, res, path.join(EDITOR_DIR, "static", "favicon.png"), "max-age=3600", EDITOR_DIR)
        }

        if (!urlPath.startsWith("/editor/")) {
            res.writeHead(404, { "Content-Type": "text/plain" })
            res.end("Not Found — open /editor/")
            return
        }

        const rest = urlPath.slice("/editor/".length)

        // editor page
        if (rest === "") {
            const html = renderIndexHTML()
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
            res.end(html)
            return
        }

        // Immutable Vite assets for the opt-in SolidJS production entrypoint.
        // The path is resolved and served only from the configured dist root.
        if (EDITOR_UI === "solidjs" && rest.startsWith("assets/")) {
            // Preserve the "assets/" segment: Vite emits URLs relative to the
            // dist root, not relative to dist/assets.
            const relativeAssetPath = rest.split("?")[0]
            const full = safeJoin(EDITOR_HOST_DIR, relativeAssetPath)
            if (!full) {
                res.writeHead(403, { "Content-Type": "text/plain" })
                res.end("Forbidden")
                return
            }
            return serveFile(req, res, full, "public, max-age=31536000, immutable", EDITOR_HOST_DIR)
        }

        if (rest === "host-mode") {
            return sendJSON(res, { ui: EDITOR_UI, rollbackAvailable: EDITOR_UI !== "legacy" })
        }

        if (rest === "product.json") {
            return serveFile(req, res, path.join(EDITOR_DIR, "product.json"), "no-store", EDITOR_DIR)
        }

        if (rest === "static/favicon.png") {
            return serveFile(req, res, path.join(EDITOR_DIR, "static", "favicon.png"), "max-age=3600", EDITOR_DIR)
        }

        // api
        if (rest === "api") {
            if (req.method !== "POST") {
                res.writeHead(405, { "Content-Type": "text/plain" })
                res.end("Method Not Allowed")
                return
            }
            return await handleAPI(req, res)
        }

        if (rest === "upload") {
            if (req.method !== "POST") {
                res.writeHead(405, { "Content-Type": "text/plain" })
                res.end("Method Not Allowed")
                return
            }
            return await handleUpload(req, res)
        }

        // plugin resources
        if (rest.startsWith("app/editor-icons/")) {
            const rel = rest.slice("app/editor-icons/".length).split("?")[0]
            if (!/^(dark|light)\/godot\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/.test(rel)) {
                res.writeHead(404, { "Content-Type": "text/plain" })
                res.end("Not Found")
                return
            }
            const full = safeJoin(EDITOR_ICONS_DIR, rel)
            if (!full) {
                res.writeHead(403)
                res.end("Forbidden")
                return
            }
            return serveFile(req, res, full, "no-cache", EDITOR_ICONS_DIR)
        }

        if (rest.startsWith("app/plugins/")) {
            const rel = rest.slice("app/plugins/".length)
            const full = safeJoin(PLUGINS_DIR, rel)
            if (!full) {
                res.writeHead(403)
                res.end("Forbidden")
                return
            }
            return serveFile(req, res, full, "no-cache", PLUGINS_DIR)
        }

        // project files (editor views)
        if (rest.startsWith("project/")) {
            const rel = rest.slice("project/".length).split("?")[0]
            const full = safeJoin(PROJECT_DIR, rel)
            if (!full) {
                res.writeHead(403)
                res.end("Forbidden")
                return
            }
            return serveFile(req, res, full, "no-cache", PROJECT_DIR)
        }

        // play mode
        if (rest.startsWith("external/")) {
            const rel = rest.slice("external/".length).split("?")[0]
            const full = safeJoin(PROJECT_DIR, rel)
            if (!full) {
                res.writeHead(403)
                res.end("Forbidden")
                return
            }
            return serveFile(req, res, full, "no-cache", PROJECT_DIR)
        }

        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("Not Found")
    } catch (e) {
        log("request error:", urlPath, e.message)
        res.writeHead(500, { "Content-Type": "text/plain" })
        res.end("Internal Server Error")
    }
})

initMcp({ projectDir: PROJECT_DIR, log })

/* ============================== AI chat loop ============================== */

const AI_CHAT_SERVICE = process.env.AI_CHAT_SERVICE || "http://127.0.0.1:3031"
const AI_CHAT_MAX_ITERATIONS = 8
const AI_CHAT_MAX_ATTACHMENTS = 8
const AI_CHAT_ATTACHMENT_MAX_BYTES = 24 * 1024
const AI_CHAT_ATTACHMENTS_MAX_BYTES = 96 * 1024

async function callLlm(messages) {
    const resp = await fetch(`${AI_CHAT_SERVICE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.timeout(120000)
    })
    const data = await resp.json()
    if (data.error) throw new Error(data.error)
    return data.text || ""
}

function parseToolCalls(text) {
    const calls = []
    const re = /```tool\s*([\s\S]*?)```/g
    let m
    while ((m = re.exec(text)) !== null) {
        try {
            const parsed = JSON.parse(m[1].trim())
            if (parsed && typeof parsed.name === "string") {
                calls.push({ name: parsed.name, args: parsed.args || {} })
            }
        } catch (e) {
            calls.push({ name: "__invalid__", args: { raw: m[1].slice(0, 200), error: e.message } })
        }
    }
    return calls
}

/*
 * AI chat scene-file attachments: the client sends project-relative paths
 * ("scenes/Level.scene", no leading project folder name). Paths that start
 * with the project folder name (getFullName() style) are accepted too.
 * Anything outside the project directory (path traversal) is rejected.
 */
function normalizeAttachmentPath(rawPath) {

    if (typeof rawPath !== "string") return null

    if (rawPath.startsWith("/") || rawPath.startsWith("\\") || /^[a-zA-Z]:/.test(rawPath)) return null

    let parts = rawPath.replace(/\\/g, "/").split("/").filter(p => p.length > 0 && p !== ".")

    if (parts.length === 0) return null

    if (parts[0] === path.basename(PROJECT_DIR)) parts = parts.slice(1)

    if (parts.length === 0 || parts.some(p => p === "..")) return null

    const rel = parts.join("/")
    const abs = safeJoin(PROJECT_DIR, rel)

    if (!abs) return null

    return { abs, rel }
}

function attachmentFence(relPath) {

    const ext = path.extname(relPath).toLowerCase()

    if (ext === ".ts" || ext === ".tsx") return "ts"
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "js"
    if (ext === ".json" || ext === ".scene" || ext === ".prefab"
        || ext === ".assetpack" || ext === ".components") return "json"
    if (ext === ".md") return "markdown"
    if (ext === ".html" || ext === ".htm") return "html"
    if (ext === ".css") return "css"
    if (ext === ".xml") return "xml"
    if (ext === ".yml" || ext === ".yaml") return "yaml"

    return "text"
}

function fencedCode(fence, content) {
    // avoid breaking the markdown fence when the file content itself has ```
    const ticks = content.includes("```") ? "````" : "```"
    return ticks + fence + "\n" + content + "\n" + ticks
}

async function buildAttachmentsContext(attachments) {

    const lines = ["### Attached project files", ""]
    const warnings = []
    let totalBytes = 0
    let fileCount = 0

    for (const att of attachments) {

        if (totalBytes >= AI_CHAT_ATTACHMENTS_MAX_BYTES) {
            warnings.push(`${att.rel}: total attachments cap (${AI_CHAT_ATTACHMENTS_MAX_BYTES / 1024} KB) reached — not included`)
            lines.push(`#### ${att.rel}`, "[not included: total attachments size cap reached]", "")
            continue
        }

        try {

            const attachment = await readFilePrefixSafely(PROJECT_DIR, att.abs, AI_CHAT_ATTACHMENT_MAX_BYTES)
            const buf = attachment.buffer

            if (buf.subarray(0, Math.min(buf.length, 8000)).includes(0)) {
                warnings.push(`${att.rel}: binary file — not included`)
                lines.push(`#### ${att.rel}`, `[binary file, ${attachment.size} bytes — text content not included]`, "")
                continue
            }

            const truncated = attachment.truncated
            let text = buf.toString("utf8")

            if (truncated) {
                text += "\n…(file truncated at 24 KB)"
                log(`ai-chat: attachment truncated at 24 KB: ${att.rel}`)
            }

            const bytes = Buffer.byteLength(text, "utf8")

            if (totalBytes + bytes > AI_CHAT_ATTACHMENTS_MAX_BYTES) {
                warnings.push(`${att.rel}: would exceed the total attachments cap (${AI_CHAT_ATTACHMENTS_MAX_BYTES / 1024} KB) — not included`)
                lines.push(`#### ${att.rel}`, "[not included: total attachments size cap reached]", "")
                continue
            }

            lines.push(`#### ${att.rel}`, fencedCode(attachmentFence(att.rel), text), "")

            totalBytes += bytes
            fileCount += 1

        } catch (e) {
            warnings.push(`${att.rel}: ${e.message}`)
            lines.push(`#### ${att.rel}`, `[could not read file: ${e.message}]`, "")
        }
    }

    return { text: lines.join("\n"), fileCount, totalBytes, warnings }
}

async function handleAiChat(req, res) {

    let body
    try {
        body = await readBodyJSON(req)
    } catch (e) {
        return apiError(res, e.statusCode === 413 ? e.message : "invalid JSON body", e.statusCode || 400)
    }

    const userMessages = (Array.isArray(body.messages) ? body.messages : [])
        .filter(m => m && typeof m.content === "string")
        .slice(-20)

    if (userMessages.length === 0 || userMessages[userMessages.length - 1].role !== "user") {
        return apiError(res, "messages must end with a user message")
    }

    const trace = []
    let responseAttachments = null

    try {
        const messages = [
            { role: "assistant", content: getChatSystemPrompt() },
            ...userMessages
        ]

        // scene-file attachments: prepend a context block to the LLM prompt
        if (Array.isArray(body.attachments)) {

            const attachments = []

            for (const raw of body.attachments) {

                const att = normalizeAttachmentPath(raw)

                if (!att) {
                    log(`ai-chat: attachment rejected (outside the project directory): ${raw}`)
                    continue
                }

                if (attachments.some(a => a.rel === att.rel)) continue

                attachments.push(att)

                if (attachments.length >= AI_CHAT_MAX_ATTACHMENTS) {
                    log(`ai-chat: attachment limit reached (${AI_CHAT_MAX_ATTACHMENTS}), ignoring the rest`)
                    break
                }
            }

            if (attachments.length > 0) {

                const context = await buildAttachmentsContext(attachments)

                // the tool loop below runs unchanged
                messages[messages.length - 1].content = context.text + "\n\n" + messages[messages.length - 1].content

                log(`ai-chat: ${attachments.length} attachment(s) accepted, ${context.fileCount} file(s) included, ${context.totalBytes} bytes of context: ${attachments.map(a => a.rel).join(", ")}`)

                if (context.warnings.length > 0) {
                    log(`ai-chat: attachment warnings: ${context.warnings.join(" | ")}`)
                }

                responseAttachments = attachments.map(a => a.rel)
            }
        }

        for (let i = 0; i < AI_CHAT_MAX_ITERATIONS; i++) {

            const text = await callLlm(messages)

            const calls = parseToolCalls(text)

            if (calls.length === 0) {
                return sendJSON(res, { reply: text, trace, ...(responseAttachments ? { attachments: responseAttachments } : {}) })
            }

            messages.push({ role: "assistant", content: text })

            const results = []

            for (const call of calls) {

                log(`ai-chat: tool ${call.name}`)

                if (call.name === "__invalid__") {
                    results.push(`[invalid tool call JSON: ${call.args.error}]`)
                    continue
                }

                try {
                    const result = await dispatchTool(call.name, call.args)
                    const textParts = (result.content || [])
                        .filter(c => c.type === "text")
                        .map(c => c.text)
                    let out = textParts.join("\n")
                    if ((result.content || []).some(c => c.type === "image")) {
                        out += "\n[screenshot image captured]"
                    }
                    if (out.length > 8000) out = out.slice(0, 8000) + "\n…(truncated)"
                    if (result.isError) {
                        log(`ai-chat: tool ${call.name} FAILED: ${out.slice(0, 300)}`)
                        trace.push(`${call.name} ✗`)
                    } else {
                        trace.push(call.name)
                    }
                    results.push(`RESULT OF ${call.name}:\n${out || "(empty)"}`)
                } catch (e) {
                    log(`ai-chat: tool ${call.name} threw: ${e.message}`)
                    results.push(`ERROR IN ${call.name}: ${e.message}`)
                    trace.push(`${call.name} ✗`)
                }
            }

            messages.push({
                role: "user",
                content: "TOOL RESULTS:\n\n" + results.join("\n\n") + "\n\nContinue with the next step, or give the final answer when everything is done."
            })
        }

        return sendJSON(res, {
            reply: "⚠ Reached the maximum number of tool iterations. The last results are applied, but the task may be incomplete.",
            trace,
            ...(responseAttachments ? { attachments: responseAttachments } : {})
        })

    } catch (e) {
        log("ai-chat error:", e.message)
        return sendJSON(res, { error: `AI Chat backend error: ${e.message}. Is the ai-chat service running (npm run dev in mini-services/ai-chat)?`, trace })
    }
}

/* ==========================================================================
 * MCP Bridge port (1902) — v5-compatible endpoint for the OFFICIAL
 * `@phaserjs/editor-mcp-server` npm package. That package forwards every
 * tool call as `POST http://127.0.0.1:<port>` with `{ tool, args }` and
 * expects the MCP content array as the response body. Run the official
 * server against this port with:
 *
 *   phaser-editor-mcp-port=1902 npx @phaserjs/editor-mcp-server
 * ========================================================================== */

const MCP_BRIDGE_PORT = Number(process.env.MCP_BRIDGE_PORT || 1902)

server.listen(PORT, "127.0.0.1", () => {
    log(`Codogma Engine server running at http://localhost:${PORT}/editor/`)
    log(`  project:  ${PROJECT_DIR}`)
    log(`  editor:   ${EDITOR_DIR}`)
    log(`  editor ui: ${EDITOR_UI}${EDITOR_UI === "solidjs" ? ` (bundle: ${EDITOR_HOST_DIR})` : ""}`)
    log(`  dev mode: ${DEV_MODE}`)
    log(`  mcp:      http://localhost:${PORT}/editor/mcp (Streamable HTTP)`)
    log(`  stdio:    node server/mcp-launcher.mjs (@codogma/editor-mcp-server)`)
    log(`            set CODOGMA_MCP_URL=http://127.0.0.1:${PORT}/editor/mcp when using a non-default HTTP port`)
})

const bridgeServer = http.createServer(async (req, res) => {

    if (rejectNonLocalRequest(req, res)) return

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        })
        return res.end()
    }

    if (req.method !== "POST") {
        res.writeHead(404, { "Content-Type": "application/json" })
        return res.end(JSON.stringify([{ type: "text", text: "POST { tool, args } only" }]))
    }

    try {
        return await handleOfficialBridgeRequest(req, res)
    } catch (e) {
        log("mcp-bridge-1902 error:", e.message)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify([{ type: "text", text: `Bridge error: ${e.message}` }]))
    }
})

bridgeServer.listen(MCP_BRIDGE_PORT, "127.0.0.1", () => {
    log(`  legacy MCP bridge: http://127.0.0.1:${MCP_BRIDGE_PORT} (older editor-side WebSocket clients)`)
})

bridgeServer.on("error", (e) => {
    log(`mcp bridge port ${MCP_BRIDGE_PORT} unavailable: ${e.message}`)
})
