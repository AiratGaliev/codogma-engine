/**
 * Codogma Engine — native Editor Host server.
 *
 * Serves the SolidJS Editor Host, native project files, and the first-party
 * Codogma MCP server/bridge. The server has one active UI and one Project
 * Model contract.
 */

import 'dotenv/config'

import http from "http"
import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import os from "os"
import crypto from "crypto"
import { fileURLToPath } from "url"
import {
    initMcp,
    handleMcpHttpRequest,
    handleBridgeEvents,
    handleBridgeResult,
    getBridgeStatus,
    dispatchTool,
    getChatSystemPrompt
} from "./mcp.mjs"
import { safeJoin, openSafeProjectFileForRead, openSafeProjectFileForWrite, isSafeOpenFileHandle, readFilePrefixSafely, ensureProjectDirectorySafely, readProjectDirectoryEntriesSafelySync, removeProjectEntrySafely, renameProjectEntrySafely, copyProjectEntrySafely, statProjectDirectorySafelySync, writeNewFileSafely } from "./path-security.mjs"
import { checkProjectTypeScript } from "./typescript-project-diagnostics.mts"
import { evaluateRequestGuard, parseAllowedHosts, parseAllowedOrigins } from "./request-origin.mjs"
import { readRequestBuffer } from "./request-body.mjs"
import {
    ProjectManagerError,
    createEmptyProject,
    getProjectManagerSnapshot,
    openProjectDirectory,
    removeRecentProject,
    validateProjectDirectory
} from "./project-manager.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const PORT = Number(process.env.PORT || 3000)
const CONFIGURED_PROJECT_DIR = process.env.PROJECT_DIR?.trim()
    ? path.resolve(process.env.PROJECT_DIR.trim())
    : null
const PROJECTS_DIR = path.resolve(
    process.env.PROJECTS_DIR?.trim()
        || (CONFIGURED_PROJECT_DIR ? path.dirname(CONFIGURED_PROJECT_DIR) : path.join(os.homedir(), "CodogmaProjects"))
)
const USER_DATA_DIR = path.resolve(
    process.env.CODOGMA_USER_DATA_DIR?.trim()
        || path.join(os.homedir(), ".codogma-engine")
)
await fsp.mkdir(PROJECTS_DIR, { recursive: true, mode: 0o700 })
const PROJECTS_ROOT = await fsp.realpath(PROJECTS_DIR)
let PROJECT_DIR = null
let startupProjectError = ""
const MAX_API_BODY_BYTES = 32 * 1024 * 1024
const EDITOR_HOST_DIR = path.resolve(process.env.EDITOR_HOST_DIR || path.join(ROOT, "src", "editor", "dist"))
const EDITOR_ICONS_DIR = path.resolve(ROOT, "src", "editor", "icons")

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
    ".vert": "text/plain; charset=utf-8"
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

function collectProjectEntries(projectRoot, directoryPath = projectRoot, prefix = "") {
    const entries = readProjectDirectoryEntriesSafelySync(projectRoot, directoryPath) || []
    const result = []

    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink) continue
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        const fullPath = path.join(directoryPath, entry.name)

        if (entry.isDirectory) {
            result.push({
                relativePath,
                kind: "directory",
                size: 0,
                modifiedAt: Math.floor(entry.mtimeMs)
            })
            result.push(...collectProjectEntries(projectRoot, fullPath, relativePath))
        } else if (entry.isFile) {
            result.push({
                relativePath,
                kind: "file",
                size: entry.size,
                modifiedAt: Math.floor(entry.mtimeMs)
            })
        }
    }

    return result
}

function buildProjectTree(projectRoot, directoryPath = projectRoot, relativePath = "", directoryMtime = null) {
    const entries = readProjectDirectoryEntriesSafelySync(projectRoot, directoryPath) || []
    const children = []

    for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink) continue
        const childPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
        const fullPath = path.join(directoryPath, entry.name)

        if (entry.isDirectory) {
            children.push(buildProjectTree(projectRoot, fullPath, childPath, entry.mtimeMs))
        } else if (entry.isFile) {
            children.push({
                name: entry.name,
                relativePath: childPath,
                kind: "file",
                size: entry.size,
                modifiedAt: Math.floor(entry.mtimeMs)
            })
        }
    }

    const stat = directoryMtime === null
        ? statProjectDirectorySafelySync(projectRoot, directoryPath)
        : null

    return {
        name: relativePath ? path.basename(directoryPath) : path.basename(projectRoot),
        relativePath,
        kind: "directory",
        size: 0,
        modifiedAt: Math.floor(directoryMtime ?? stat?.mtimeMs ?? Date.now()),
        children
    }
}

/**
 * Resolve one project entry from verified parent-directory metadata.
 */
function getProjectEntry(projectRoot, relativePath) {
    const fullPath = safeJoin(projectRoot, relativePath)
    if (!fullPath || fullPath === projectRoot) return null

    const entries = readProjectDirectoryEntriesSafelySync(projectRoot, path.dirname(fullPath))
    if (!entries) return null
    const entry = entries.find(candidate => candidate.name === path.basename(fullPath))
    if (!entry || entry.isSymbolicLink || (!entry.isFile && !entry.isDirectory)) return null

    if (entry.isDirectory) {
        return buildProjectTree(projectRoot, fullPath, relativePath, entry.mtimeMs)
    }

    return {
        name: path.basename(relativePath),
        relativePath,
        kind: "file",
        size: entry.size,
        modifiedAt: Math.floor(entry.mtimeMs)
    }
}

const hashCache = { value: "", stamp: 0 }

function computeProjectHash() {
    const now = Date.now()
    if (hashCache.value && now - hashCache.stamp < 1000) {
        return hashCache.value
    }

    const entries = collectProjectEntries(PROJECT_DIR)
    const parts = entries
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
        .map(entry => `${entry.relativePath}|${entry.modifiedAt}|${entry.size}`)
    const value = crypto.createHash("sha1").update(parts.join("\n")).digest("hex")
    hashCache.value = value
    hashCache.stamp = now
    return value
}

/* ============================== image size =============================== */

function parseImageDimensions(input, extension) {
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

/* ============================== native host ============================== */

function renderIndexHTML() {
    const indexPath = safeJoin(EDITOR_HOST_DIR, "index.html")
    if (!indexPath || !fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
        throw new Error(`Editor Host production bundle is missing at "${EDITOR_HOST_DIR}". Run "npm --prefix src/editor run build".`)
    }
    return fs.readFileSync(indexPath, "utf8")
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

function apiError(res, message, statusCode = 200, details = {}) {
    const body = JSON.stringify({ error: message || "unknown error", ...details })
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    })
    res.end(body)
}

function activateProject(projectDirectory) {
    PROJECT_DIR = path.resolve(projectDirectory)
    startupProjectError = ""
    hashCache.value = ""
    hashCache.stamp = 0
    initMcp({ projectDir: PROJECT_DIR, log })
}
async function handleProjectOperation(req, res) {
    let request
    try {
        request = await readBodyJSON(req)
    } catch (error) {
        return apiError(
            res,
            error.statusCode === 413 ? error.message : "invalid project operation request",
            error.statusCode || 400
        )
    }

    const operation = request.operation
    const args = request.arguments || {}
    log("project operation:", operation)

    try {
        switch (operation) {
            case "projectManager.getSnapshot": {
                const snapshot = await getProjectManagerSnapshot({
                    projectsRoot: PROJECTS_ROOT,
                    userDataDirectory: USER_DATA_DIR,
                    activeProjectDirectory: PROJECT_DIR,
                    startupProjectError
                })
                return sendJSON(res, snapshot)
            }

            case "projectManager.create": {
                const result = await createEmptyProject({
                    projectsRoot: PROJECTS_ROOT,
                    userDataDirectory: USER_DATA_DIR,
                    name: args.name,
                    folderName: args.folderName,
                    parentRelativePath: args.parentRelativePath ?? "",
                    templateId: args.templateId ?? "empty-2d"
                })
                activateProject(result.projectDirectory)
                return sendJSON(res, {
                    activeProject: { projectId: result.project.id, name: result.project.name, relativePath: result.relativePath },
                    recentWarning: result.recentWarning
                })
            }

            case "projectManager.open": {
                const result = await openProjectDirectory({
                    projectsRoot: PROJECTS_ROOT,
                    userDataDirectory: USER_DATA_DIR,
                    relativePath: args.relativePath
                })
                activateProject(result.projectDirectory)
                return sendJSON(res, {
                    activeProject: { projectId: result.project.id, name: result.project.name, relativePath: result.relativePath },
                    recentWarning: result.recentWarning
                })
            }

            case "projectManager.removeRecent":
                await removeRecentProject({ userDataDirectory: USER_DATA_DIR, projectId: args.projectId })
                return sendJSON(res, {})

            case "project.getContentHash":
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                return sendJSON(res, { contentHash: computeProjectHash() })

            case "project.listEntries": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                const entries = collectProjectEntries(PROJECT_DIR)
                return sendJSON(res, {
                    contentHash: computeProjectHash(),
                    entryLimit: 1000000,
                    entryCount: entries.length,
                    root: buildProjectTree(PROJECT_DIR)
                })
            }

            case "project.createFile": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                if (typeof args.relativePath !== "string" || typeof args.text !== "string") {
                    return apiError(res, "relativePath and text are required")
                }

                const fullPath = safeJoin(PROJECT_DIR, args.relativePath)
                if (!fullPath || fullPath === PROJECT_DIR) return apiError(res, "invalid project path")
                if (!await ensureProjectDirectorySafely(PROJECT_DIR, path.dirname(fullPath))) {
                    return apiError(res, "invalid project path")
                }
                if (!writeNewFileSafely(PROJECT_DIR, fullPath, args.text)) {
                    return apiError(res, "Project file already exists or cannot be created safely.", 409)
                }

                hashCache.value = ""
                return sendJSON(res, {
                    entry: getProjectEntry(PROJECT_DIR, args.relativePath)
                })
            }

            case "project.checkTypeScript": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                const result = checkProjectTypeScript(PROJECT_DIR, args.relativePath, args.source)
                return sendJSON(res, result)
            }

            case "project.createDirectory": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                const fullPath = safeJoin(PROJECT_DIR, args.relativePath)
                if (!fullPath) return apiError(res, "invalid project path")

                let stat = statProjectDirectorySafelySync(PROJECT_DIR, fullPath)
                if (!stat) {
                    if (!await ensureProjectDirectorySafely(PROJECT_DIR, fullPath)) {
                        return apiError(res, "invalid project path")
                    }
                    stat = statProjectDirectorySafelySync(PROJECT_DIR, fullPath)
                }

                if (!stat || !stat.isDirectory()) return apiError(res, "invalid project path")
                hashCache.value = ""
                return sendJSON(res, {
                    relativePath: args.relativePath,
                    kind: "directory",
                    size: 0,
                    modifiedAt: Math.floor(stat.mtimeMs)
                })
            }

            case "project.writeFile": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                if (typeof args.relativePath !== "string" || typeof args.text !== "string") {
                    return apiError(res, "relativePath and text are required")
                }

                const fullPath = safeJoin(PROJECT_DIR, args.relativePath)
                if (!fullPath || fullPath === PROJECT_DIR) return apiError(res, "invalid project path")
                if (!await ensureProjectDirectorySafely(PROJECT_DIR, path.dirname(fullPath))) {
                    return apiError(res, "invalid project path")
                }

                const handle = await openSafeProjectFileForWrite(PROJECT_DIR, fullPath)
                if (!handle) return apiError(res, "invalid project path")
                let stat
                try {
                    await handle.truncate(0)
                    await handle.writeFile(args.text, "utf8")
                    stat = await handle.stat()
                } finally {
                    await handle.close().catch(() => {})
                }

                hashCache.value = ""
                return sendJSON(res, {
                    entry: {
                        name: path.basename(args.relativePath),
                        relativePath: args.relativePath,
                        kind: "file",
                        size: Buffer.byteLength(args.text, "utf8"),
                        modifiedAt: Math.floor(stat.mtimeMs)
                    }
                })
            }

            case "project.deleteEntries": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                const relativePaths = Array.isArray(args.relativePaths) ? args.relativePaths : []
                for (const relativePath of relativePaths) {
                    const fullPath = safeJoin(PROJECT_DIR, relativePath)
                    if (!fullPath || fullPath === PROJECT_DIR) continue
                    if (!await removeProjectEntrySafely(PROJECT_DIR, fullPath, { recursive: true, force: true })) {
                        return apiError(res, "invalid project path")
                    }
                }
                hashCache.value = ""
                return sendJSON(res, {})
            }

            case "project.renameEntry": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                const sourcePath = safeJoin(PROJECT_DIR, args.sourcePath)
                const destinationPath = safeJoin(PROJECT_DIR, args.destinationPath)
                if (!sourcePath || !destinationPath || sourcePath === PROJECT_DIR || destinationPath === PROJECT_DIR) {
                    return apiError(res, "invalid project path")
                }
                if (!await ensureProjectDirectorySafely(PROJECT_DIR, path.dirname(destinationPath))) {
                    return apiError(res, "invalid project path")
                }
                if (!await renameProjectEntrySafely(PROJECT_DIR, sourcePath, destinationPath)) {
                    return apiError(res, "invalid project path")
                }
                hashCache.value = ""
                return sendJSON(res, {})
            }

            case "project.copyEntry": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                const sourcePath = safeJoin(PROJECT_DIR, args.sourcePath)
                const destinationPath = safeJoin(PROJECT_DIR, args.destinationPath)
                if (!sourcePath || !destinationPath || sourcePath === PROJECT_DIR || destinationPath === PROJECT_DIR) {
                    return apiError(res, "invalid project path")
                }
                if (!await copyProjectEntrySafely(PROJECT_DIR, sourcePath, destinationPath)) {
                    return apiError(res, "invalid project path")
                }

                hashCache.value = ""
                return sendJSON(res, { entry: getProjectEntry(PROJECT_DIR, args.destinationPath) })
            }

            case "project.moveEntries": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                const destinationDirectory = safeJoin(PROJECT_DIR, args.destinationDirectory)
                if (!destinationDirectory) return apiError(res, "invalid project path")
                if (!await ensureProjectDirectorySafely(PROJECT_DIR, destinationDirectory)) {
                    return apiError(res, "invalid project path")
                }

                const sourcePaths = Array.isArray(args.sourcePaths) ? args.sourcePaths : []
                for (const sourcePath of sourcePaths) {
                    const fullSourcePath = safeJoin(PROJECT_DIR, sourcePath)
                    if (!fullSourcePath || fullSourcePath === PROJECT_DIR) continue
                    const fullDestinationPath = path.join(destinationDirectory, path.basename(sourcePath))
                    if (!await renameProjectEntrySafely(PROJECT_DIR, fullSourcePath, fullDestinationPath)) {
                        return apiError(res, "invalid project path")
                    }
                }
                hashCache.value = ""
                return sendJSON(res, {})
            }

            case "project.readImageDimensions": {
                if (!PROJECT_DIR) return apiError(res, "No project is open.", 409)
                const fullPath = safeJoin(PROJECT_DIR, args.relativePath)
                if (!fullPath) return apiError(res, "project file not found")
                const handle = await openSafeProjectFileForRead(PROJECT_DIR, fullPath)
                if (!handle) return apiError(res, "project file not found")
                let data
                try {
                    const buffer = Buffer.alloc(65536)
                    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
                    data = buffer.subarray(0, bytesRead)
                } finally {
                    await handle.close().catch(() => {})
                }
                const dimensions = parseImageDimensions(data, path.extname(fullPath))
                if (!dimensions) return apiError(res, "cannot read image dimensions")
                return sendJSON(res, dimensions)
            }

            default:
                log("unknown project operation:", operation)
                return apiError(res, `unknown project operation "${operation}"`)
        }
    } catch (error) {
        log("project operation error:", operation, error.message)
        if (error instanceof ProjectManagerError) {
            return apiError(res, error.message, error.statusCode, { diagnostics: error.diagnostics })
        }
        return apiError(res, error.message, error.statusCode || 200)
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
            if (!PROJECT_DIR) {
                res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" })
                return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Open a project before using MCP." }, id: null }))
            }
            return await handleMcpHttpRequest(req, res)
        }

        // MCP editor bridge (SSE channel to the running editor client)
        if (urlPath === "/editor/mcp-bridge/events" && req.method === "GET") {
            return await handleBridgeEvents(req, res)
        }

        // MCP editor bridge (editor client posts command results)
        if (urlPath === "/editor/mcp-bridge/result" && req.method === "POST") {
            return await handleBridgeResult(req, res)
        }

        // Single Editor Host bridge readiness.
        if (urlPath === "/editor/mcp-bridge-status") {
            return sendJSON(res, getBridgeStatus())
        }

        // AI Chat (v5-style feature): LLM agent with MCP tool access
        if (urlPath === "/editor/ai-chat" && req.method === "POST") {
            if (!PROJECT_DIR) return apiError(res, "Open a project before using AI Chat.", 409)
            return await handleAiChat(req, res)
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

        // Immutable Vite assets for the native Editor Host production bundle.
        // The path is resolved and served only from the configured build root.
        if (rest.startsWith("assets/")) {
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

        // Native project operations use their own request/response contract.
        if (rest === "project/operations") {
            if (req.method !== "POST") {
                res.writeHead(405, { "Content-Type": "text/plain", "Allow": "POST" })
                res.end("Method Not Allowed")
                return
            }
            return await handleProjectOperation(req, res)
        }

        // SVG assets used by the native Editor Host workbench.
        if (rest.startsWith("icons/")) {
            const relativeIconPath = rest.slice("icons/".length).split("?")[0]
            if (!/^(dark|light)\/godot\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/.test(relativeIconPath)) {
                res.writeHead(404, { "Content-Type": "text/plain" })
                res.end("Not Found")
                return
            }
            const full = safeJoin(EDITOR_ICONS_DIR, relativeIconPath)
            if (!full) {
                res.writeHead(403)
                res.end("Forbidden")
                return
            }
            return serveFile(req, res, full, "public, max-age=3600", EDITOR_ICONS_DIR)
        }

        // project files (editor views)
        if (rest.startsWith("project/")) {
            if (!PROJECT_DIR) {
                res.writeHead(409, { "Content-Type": "text/plain; charset=utf-8" })
                res.end("No project is open")
                return
            }
            const rel = rest.slice("project/".length).split("?")[0]
            const full = safeJoin(PROJECT_DIR, rel)
            if (!full) {
                res.writeHead(403)
                res.end("Forbidden")
                return
            }
            return serveFile(req, res, full, "no-cache", PROJECT_DIR)
        }

        // Generated runtime output loaded by the native Editor Host Game View.
        if (rest.startsWith("external/")) {
            if (!PROJECT_DIR) {
                res.writeHead(409, { "Content-Type": "text/plain; charset=utf-8" })
                res.end("No project is open")
                return
            }
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

if (CONFIGURED_PROJECT_DIR) {
    const initialProject = await validateProjectDirectory(CONFIGURED_PROJECT_DIR)
    const projectRelativePath = path.relative(PROJECTS_ROOT, initialProject.projectDirectory || CONFIGURED_PROJECT_DIR)
    const isInsideProjectsRoot = projectRelativePath !== ""
        && projectRelativePath !== ".."
        && !projectRelativePath.startsWith(".." + path.sep)
        && !path.isAbsolute(projectRelativePath)
    if (initialProject.valid && initialProject.project && isInsideProjectsRoot) {
        PROJECT_DIR = initialProject.projectDirectory
        initMcp({ projectDir: PROJECT_DIR, log })
    } else {
        startupProjectError = initialProject.diagnostics
            .map(item => (item.path ? item.path + ": " : "") + item.message)
            .join("\n")
            || (isInsideProjectsRoot
                ? "The configured project could not be opened."
                : "The configured project is outside PROJECTS_DIR. Set PROJECTS_DIR to a parent directory that contains it.")
    }
}

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
 * AI Chat project-file attachments. Paths are project-relative and resolved
 * against the configured native project root before any file is read.
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
    if (ext === ".json" || ext === ".prefab" || ext === ".assetpack") return "json"
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

        // Supported project-file attachments are added to the LLM context.
        if (Array.isArray(body.attachments)) {

            const attachments = []

            for (const raw of body.attachments) {

                const att = normalizeAttachmentPath(raw)

                if (!att) {
                    log(`ai-chat: attachment rejected (outside the project directory): ${raw}`)
                    continue
                }

                if (/\.(?:scene|components)$/i.test(att.rel)) {
                    log(`ai-chat: attachment rejected (unsupported internal document format): ${att.rel}`)
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

server.listen(PORT, "127.0.0.1", () => {
    log(`Codogma Engine server running at http://localhost:${PORT}/editor/`)
    log(`  project:  ${PROJECT_DIR || "none (Project Manager)"}`)
    log(`  projects: ${PROJECTS_ROOT}`)
    log(`  host:     ${EDITOR_HOST_DIR}`)
    log(`  mcp:      http://localhost:${PORT}/editor/mcp (Streamable HTTP)`)
    log(`  stdio:    node server/mcp-launcher.mjs (@codogma/editor-mcp-server)`)
    log(`            set CODOGMA_MCP_URL=http://127.0.0.1:${PORT}/editor/mcp when using a non-default HTTP port`)
})


