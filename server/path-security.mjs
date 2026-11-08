/**
 * Path containment helpers for the Codogma Engine local server.
 *
 * These are the security-critical primitives used by every file API method
 * (server.mjs). They live in their own module so they can be unit-tested
 * directly (tests/path-security.test.mjs) without booting the HTTP server.
 *
 * Threat model: the editor API accepts arbitrary relative paths from the
 * browser. A malicious or buggy client must not be able to read, write or
 * delete anything outside the project directory, including through symbolic
 * links created inside the project (symlink escape) and through dangling
 * links (which must fail closed instead of falling back to a parent walk).
 */

import fs from "fs"
import path from "path"
import fsp from "fs/promises"
import crypto from "crypto"

/**
 * True when `target`'s real location is the base itself or inside it.
 *
 * The walk tolerates not-yet-existing leaf components (a write may create
 * them) but fails closed on dangling symlinks: a link whose target does not
 * exist must never be treated as a missing file under a trusted parent.
 */
export function isWithinRealBase(base, target) {
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

/** Pure containment check against an already-resolved real base. */
export function isInsideBase(realBase, candidate) {
    return candidate === realBase || candidate.startsWith(realBase + path.sep)
}

/**
 * Resolve a client-supplied relative path against `base` and return the
 * absolute path, or null when the path escapes the base lexically (..,
 * absolute input) or through symbolic links.
 */
export function safeJoin(base, relPath) {
    if (typeof relPath !== "string") return null

    // Do not reinterpret drive-qualified or UNC paths as project-relative names.
    // A single leading slash/backslash remains supported for legacy editor paths.
    if (/^[a-zA-Z]:/.test(relPath) || /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(relPath)) {
        return null
    }

    const p = path.resolve(base, "." + path.sep + relPath.replace(/^[\\/]+/, ""))
    if (p !== base && !p.startsWith(base + path.sep)) return null

    // A lexical prefix check alone allows paths through symlinks inside the
    // project to read or modify files elsewhere on the user's machine.
    try {
        if (!isWithinRealBase(base, p)) return null
    } catch {
        return null
    }

    return p
}


function safeWriteContext(base, target) {
    if (typeof target !== "string") return null

    const lexicalBase = path.resolve(base)
    const full = path.resolve(target)
    if (!isInsideBase(lexicalBase, full) || full === lexicalBase) return null

    try {
        if (!isWithinRealBase(base, full)) return null
    } catch {
        return null
    }

    let existedBefore = false
    try {
        const entry = fs.lstatSync(full)
        if (entry.isSymbolicLink() || !entry.isFile()) return null
        existedBefore = true
    } catch (error) {
        if (error.code !== "ENOENT") return null
    }

    const flags = fs.constants.O_WRONLY
        | (fs.constants.O_NOFOLLOW ?? 0)
        | (existedBefore ? 0 : fs.constants.O_CREAT | fs.constants.O_EXCL)

    return { full, existedBefore, flags }
}

/**
 * Verify an opened write descriptor before any truncation or write occurs.
 * Comparing descriptor identity to the current path helps detect a
 * parent-directory swap between path resolution and open().
 */
export function isSafeOpenFileHandle(base, target, fd) {
    try {
        const lexicalBase = path.resolve(base)
        const full = path.resolve(target)
        if (!isInsideBase(lexicalBase, full) || full === lexicalBase) return false

        const realBase = fs.realpathSync(base)
        const opened = fs.fstatSync(fd)
        if (!opened.isFile()) return false

        // On Linux, verify the actual file referenced by the open descriptor.
        if (process.platform === "linux") {
            const fdPath = fs.readlinkSync(`/proc/self/fd/${fd}`)
            if (fdPath.endsWith(" (deleted)") || !isInsideBase(realBase, path.resolve(fdPath))) {
                return false
            }
        }

        const entry = fs.lstatSync(full)
        if (entry.isSymbolicLink() || !entry.isFile()) return false

        const resolved = fs.realpathSync(full)
        if (!isInsideBase(realBase, resolved)) return false

        const current = fs.statSync(full)
        return current.dev === opened.dev && current.ino === opened.ino
    } catch {
        return false
    }
}

function removeCreatedFileIfStillOwned(full, fd) {
    let opened
    try {
        opened = fs.fstatSync(fd)
    } catch {
        return
    }

    const candidates = []
    if (process.platform === "linux") {
        try {
            const fdPath = fs.readlinkSync(`/proc/self/fd/${fd}`)
            if (!fdPath.endsWith(" (deleted)")) candidates.push(fdPath)
        } catch {
            // Fall back to the requested path if the descriptor path is unavailable.
        }
    }
    candidates.push(full)

    for (const candidate of candidates) {
        try {
            const entry = fs.lstatSync(candidate)
            if (entry.isSymbolicLink() || !entry.isFile()) continue
            const current = fs.statSync(candidate)
            if (current.dev !== opened.dev || current.ino !== opened.ino) continue
            fs.unlinkSync(candidate)
            return
        } catch {
            // Best-effort cleanup only. Never remove a different file.
        }
    }
}

/**
 * Check that an already-open read descriptor resolves to a regular file inside
 * the selected project. The bytes are consumed from this descriptor after the
 * check, never by reopening the pathname.
 */
function isSafeOpenReadFileHandle(base, target, fd) {
    try {
        const lexicalBase = path.resolve(base)
        const full = path.resolve(target)
        if (!isInsideBase(lexicalBase, full) || full === lexicalBase) return false

        const realBase = fs.realpathSync(base)
        const opened = fs.fstatSync(fd)
        if (!opened.isFile()) return false

        if (process.platform === "linux") {
            // /proc/self/fd resolves the object actually opened, even when a
            // parent symlink was swapped between validation and open().
            const fdPath = fs.readlinkSync(`/proc/self/fd/${fd}`)
            if (fdPath.endsWith(" (deleted)") || !isInsideBase(realBase, path.resolve(fdPath))) {
                return false
            }
            return true
        }

        // Portable fallback: compare descriptor identity with the file reached
        // through the current path. This detects a swap during open(), though
        // platforms without descriptor-path introspection have weaker evidence.
        const resolved = fs.realpathSync(full)
        if (!isInsideBase(realBase, resolved)) return false
        const current = fs.statSync(full)
        return current.dev === opened.dev && current.ino === opened.ino
    } catch {
        return false
    }
}

function safeReadContext(base, target) {
    if (typeof target !== "string") return null

    const lexicalBase = path.resolve(base)
    const full = path.resolve(target)
    if (!isInsideBase(lexicalBase, full) || full === lexicalBase) return null

    try {
        if (!isWithinRealBase(base, full)) return null
    } catch {
        return null
    }

    return { full }
}

/**
 * Open a project file for reading and verify the actual object selected by the
 * kernel. Callers must consume the returned FileHandle instead of reopening
 * its pathname; symlinks resolving within the project remain supported.
 */
export async function openSafeProjectFileForRead(base, target) {
    const context = safeReadContext(base, target)
    if (!context) return null

    let handle
    try {
        handle = await fsp.open(context.full, fs.constants.O_RDONLY)
    } catch {
        return null
    }

    if (!isSafeOpenReadFileHandle(base, context.full, handle.fd)) {
        await handle.close().catch(() => {})
        return null
    }

    return handle
}

/**
 * Synchronous descriptor-based read for MCP helpers and small project files.
 * Unsafe paths fail closed with an error; callers never receive bytes obtained
 * by reopening a pathname after the containment check.
 */
export function readFileSafely(base, target, options, maxBytes) {
    const context = safeReadContext(base, target)
    if (!context) throw new Error("Refusing to read outside the project root")

    let fd
    try {
        fd = fs.openSync(context.full, fs.constants.O_RDONLY)
    } catch {
        throw new Error("Unable to open a safe project file")
    }

    try {
        if (!isSafeOpenReadFileHandle(base, context.full, fd)) {
            throw new Error("Refusing to read an unsafe project file")
        }

        if (Number.isFinite(maxBytes)) {
            if (fs.fstatSync(fd).size > maxBytes) {
                throw new Error("Project file exceeds the configured read limit")
            }

            // Do not rely on the initial fstat alone: another process may grow
            // the same inode after the size check. Consume at most maxBytes + 1
            // bytes from this descriptor so the cap remains effective under
            // concurrent writes as well.
            const chunks = []
            let total = 0
            let position = 0

            while (true) {
                const capacity = Math.min(64 * 1024, maxBytes + 1 - total)
                const chunk = Buffer.alloc(capacity)
                const bytesRead = fs.readSync(fd, chunk, 0, capacity, position)

                if (bytesRead === 0) break

                total += bytesRead
                if (total > maxBytes) {
                    throw new Error("Project file exceeds the configured read limit")
                }

                chunks.push(chunk.subarray(0, bytesRead))
                position += bytesRead
            }

            const data = Buffer.concat(chunks, total)
            if (typeof options === "string") return data.toString(options)
            if (options && typeof options === "object" && options.encoding) {
                return data.toString(options.encoding)
            }
            return data
        }

        return fs.readFileSync(fd, options)
    } finally {
        fs.closeSync(fd)
    }
}

/**
 * Read only a bounded prefix from a verified project file handle.
 * The returned buffer never exceeds maxBytes, even if the file is very large
 * or grows while being read. size is the opening fstat size; truncated also
 * accounts for growth observed before the read finishes.
 */
export async function readFilePrefixSafely(base, target, maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
        throw new TypeError("maxBytes must be a non-negative safe integer")
    }

    const handle = await openSafeProjectFileForRead(base, target)
    if (!handle) throw new Error("invalid or unreadable project file")

    try {
        const initial = await handle.stat()
        if (!initial.isFile()) throw new Error("project path is not a regular file")

        const limit = Math.min(initial.size, maxBytes)
        const buffer = Buffer.alloc(limit)
        let offset = 0
        while (offset < limit) {
            const { bytesRead } = await handle.read(buffer, offset, limit - offset, offset)
            if (bytesRead === 0) break
            offset += bytesRead
        }

        const finalStat = await handle.stat()
        return {
            buffer: buffer.subarray(0, offset),
            size: initial.size,
            truncated: initial.size > maxBytes || finalStat.size > offset
        }
    } finally {
        await handle.close().catch(() => {})
    }
}

/**
 * Open a project file for writing without truncating it. The caller MUST
 * truncate only after this function returns a verified handle.
 * Parent directories should be created by the caller first.
 */
export async function openSafeProjectFileForWrite(base, target) {
    const context = safeWriteContext(base, target)
    if (!context) return null

    let handle
    try {
        // No O_TRUNC here: failed validation must never destroy existing data.
        handle = await fsp.open(context.full, context.flags, 0o666)
    } catch {
        return null
    }

    if (!isSafeOpenFileHandle(base, context.full, handle.fd)) {
        if (!context.existedBefore) removeCreatedFileIfStillOwned(context.full, handle.fd)
        await handle.close().catch(() => {})
        return null
    }

    return handle
}

/**
 * Synchronous equivalent for MCP tools whose write pipeline is synchronous.
 * Returns false for an unsafe target and preserves the target's old contents.
 */
export function writeFileSafely(base, target, content) {
    const context = safeWriteContext(base, target)
    if (!context) return false

    let fd
    try {
        fd = fs.openSync(context.full, context.flags, 0o666)
    } catch {
        return false
    }

    try {
        if (!isSafeOpenFileHandle(base, context.full, fd)) {
            if (!context.existedBefore) removeCreatedFileIfStillOwned(context.full, fd)
            return false
        }

        fs.ftruncateSync(fd, 0)
        fs.writeFileSync(fd, content)
        return true
    } finally {
        fs.closeSync(fd)
    }
}

/**
 * Build a validated single-entry context. Destructive operations must never
 * receive a caller-controlled multi-component path after the parent directory
 * has been opened; only the final basename is appended to that handle.
 */
function safeProjectEntryContext(base, target) {
    if (typeof target !== "string") return null

    const lexicalBase = path.resolve(base)
    const full = path.resolve(target)
    if (!isInsideBase(lexicalBase, full) || full === lexicalBase) return null

    const leaf = path.basename(full)
    if (!leaf || leaf === "." || leaf === ".." || leaf.includes(path.sep)) return null

    try {
        if (!isWithinRealBase(base, full)) return null
    } catch {
        return null
    }

    return { full, parent: path.dirname(full), leaf }
}

/**
 * Verify that an opened directory descriptor and its current pathname still
 * identify the same directory inside the project. On Linux, /proc/self/fd
 * provides evidence for the object actually opened, not just its pathname.
 */
function isSafeOpenProjectDirectory(base, parentPath, fd) {
    try {
        const realBase = fs.realpathSync(base)
        const opened = fs.fstatSync(fd)
        if (!opened.isDirectory()) return false

        if (process.platform === "linux") {
            const descriptorPath = fs.readlinkSync(`/proc/self/fd/${fd}`)
            if (descriptorPath.endsWith(" (deleted)") || !isInsideBase(realBase, path.resolve(descriptorPath))) {
                return false
            }
        }

        const currentRealPath = fs.realpathSync(parentPath)
        if (!isInsideBase(realBase, currentRealPath)) return false
        const current = fs.statSync(parentPath)
        return current.isDirectory() && current.dev === opened.dev && current.ino === opened.ino
    } catch {
        return false
    }
}

async function openSafeProjectParentDirectory(base, parentPath) {
    try {
        if (!isWithinRealBase(base, parentPath)) return null
    } catch {
        return null
    }

    let handle
    try {
        const directoryFlag = fs.constants.O_DIRECTORY ?? 0
        handle = await fsp.open(parentPath, fs.constants.O_RDONLY | directoryFlag)
    } catch {
        return null
    }

    if (!isSafeOpenProjectDirectory(base, parentPath, handle.fd)) {
        await handle.close().catch(() => {})
        return null
    }

    return handle
}

function entryPathAtDirectoryHandle(handle, parentPath, leaf) {
    if (process.platform === "linux") {
        return `/proc/self/fd/${handle.fd}/${leaf}`
    }
    return path.join(parentPath, leaf)
}

/**
 * Create a directory path component-by-component through verified parent
 * directory handles on Linux. This prevents a parent pathname swapped to an
 * outside symlink from redirecting recursive mkdir. Non-Linux platforms retain
 * the necessary legacy path-based behavior with before/after containment checks;
 * that fallback is explicitly not a portable race-free guarantee.
 */
export async function ensureProjectDirectorySafely(base, target) {
    if (typeof target !== "string") return false

    const lexicalBase = path.resolve(base)
    const full = path.resolve(target)
    if (!isInsideBase(lexicalBase, full)) return false

    if (full === lexicalBase) {
        try {
            return fs.statSync(base).isDirectory() && fs.realpathSync(base) === fs.realpathSync(lexicalBase)
        } catch {
            return false
        }
    }

    try {
        if (!isWithinRealBase(base, full)) return false
    } catch {
        return false
    }

    if (process.platform !== "linux") {
        try {
            await fsp.mkdir(full, { recursive: true })
            const realBase = fs.realpathSync(base)
            const realFull = fs.realpathSync(full)
            return isInsideBase(realBase, realFull) && fs.statSync(full).isDirectory()
        } catch {
            return false
        }
    }

    const relative = path.relative(lexicalBase, full)
    if (!relative || relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) {
        return false
    }

    const segments = relative.split(path.sep).filter(Boolean)
    let currentPath = lexicalBase
    let currentHandle = await openSafeProjectParentDirectory(base, currentPath)
    if (!currentHandle) return false

    try {
        for (const segment of segments) {
            if (segment === "." || segment === ".." || segment.includes(path.sep)) return false
            if (!isSafeOpenProjectDirectory(base, currentPath, currentHandle.fd)) return false

            const childPath = path.join(currentPath, segment)
            const operationPath = entryPathAtDirectoryHandle(currentHandle, currentPath, segment)

            try {
                await fsp.mkdir(operationPath)
            } catch (error) {
                if (error.code !== "EEXIST") return false
            }

            let childHandle
            try {
                childHandle = await fsp.open(operationPath, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0))
            } catch {
                return false
            }

            if (!isSafeOpenProjectDirectory(base, childPath, childHandle.fd)) {
                await childHandle.close().catch(() => {})
                return false
            }

            await currentHandle.close().catch(() => {})
            currentHandle = childHandle
            currentPath = childPath
        }
        return true
    } finally {
        await currentHandle.close().catch(() => {})
    }
}

/**
 * Open a project directory and return a descriptor whose actual target and
 * current pathname match. Returns null on any failed containment/identity check.
 */
function openSafeProjectDirectorySync(base, target) {
    if (typeof target !== "string") return null
    const lexicalBase = path.resolve(base)
    const full = path.resolve(target)
    if (!isInsideBase(lexicalBase, full)) return null

    try {
        if (!isWithinRealBase(base, full)) return null
    } catch {
        return null
    }

    let fd
    try {
        fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0))
    } catch {
        return null
    }

    if (!isSafeOpenProjectDirectory(base, full, fd)) {
        try { fs.closeSync(fd) } catch {}
        return null
    }
    return { fd, full }
}

/**
 * Read one directory level and its entry metadata through an opened descriptor.
 * Symlink entries are reported as links, never followed; callers should skip
 * them. Linux reads through /proc/self/fd so swapping the requested directory
 * pathname after open cannot redirect enumeration to an outside symlink.
 */
export function readProjectDirectoryEntriesSafelySync(base, target) {
    const opened = openSafeProjectDirectorySync(base, target)
    if (!opened) return null

    try {
        const directoryPath = process.platform === "linux"
            ? `/proc/self/fd/${opened.fd}`
            : opened.full
        const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
        const result = []

        for (const entry of entries) {
            if (entry.name === "." || entry.name === "..") continue
            const entryPath = process.platform === "linux"
                ? `${directoryPath}/${entry.name}`
                : path.join(opened.full, entry.name)
            let stat
            try {
                stat = fs.lstatSync(entryPath)
            } catch {
                // Entries concurrently removed or inaccessible are not exposed.
                continue
            }

            result.push({
                name: entry.name,
                isFile: stat.isFile(),
                isDirectory: stat.isDirectory(),
                isSymbolicLink: stat.isSymbolicLink(),
                size: stat.size,
                mtimeMs: stat.mtimeMs
            })
        }
        return result
    } catch {
        return null
    } finally {
        try { fs.closeSync(opened.fd) } catch {}
    }
}

/**
 * Synchronous counterpart for existing synchronous MCP scene helpers.
 * Linux operations are descriptor-anchored; the non-Linux fallback is path-based
 * and therefore retains the documented portable race limitation.
 */
export function ensureProjectDirectorySafelySync(base, target) {
    if (typeof target !== "string") return false

    const lexicalBase = path.resolve(base)
    const full = path.resolve(target)
    if (!isInsideBase(lexicalBase, full)) return false

    if (full === lexicalBase) {
        try {
            return fs.statSync(base).isDirectory() && fs.realpathSync(base) === fs.realpathSync(lexicalBase)
        } catch {
            return false
        }
    }

    try {
        if (!isWithinRealBase(base, full)) return false
    } catch {
        return false
    }

    if (process.platform !== "linux") {
        try {
            fs.mkdirSync(full, { recursive: true })
            const realBase = fs.realpathSync(base)
            const realFull = fs.realpathSync(full)
            return isInsideBase(realBase, realFull) && fs.statSync(full).isDirectory()
        } catch {
            return false
        }
    }

    const relative = path.relative(lexicalBase, full)
    if (!relative || relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) {
        return false
    }

    const segments = relative.split(path.sep).filter(Boolean)
    let currentPath = lexicalBase
    let currentFd
    try {
        currentFd = fs.openSync(currentPath, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0))
        if (!isSafeOpenProjectDirectory(base, currentPath, currentFd)) return false

        for (const segment of segments) {
            if (segment === "." || segment === ".." || segment.includes(path.sep)) return false
            if (!isSafeOpenProjectDirectory(base, currentPath, currentFd)) return false

            const childPath = path.join(currentPath, segment)
            const operationPath = `/proc/self/fd/${currentFd}/${segment}`
            try {
                fs.mkdirSync(operationPath)
            } catch (error) {
                if (error.code !== "EEXIST") return false
            }

            let childFd
            try {
                childFd = fs.openSync(operationPath, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0))
            } catch {
                return false
            }

            if (!isSafeOpenProjectDirectory(base, childPath, childFd)) {
                fs.closeSync(childFd)
                return false
            }

            fs.closeSync(currentFd)
            currentFd = childFd
            currentPath = childPath
        }
        return true
    } catch {
        return false
    } finally {
        if (currentFd !== undefined) {
            try { fs.closeSync(currentFd) } catch {}
        }
    }
}

/**
 * Remove one project entry through an already-open parent directory descriptor
 * on Linux. The operation path is anchored to that descriptor, so swapping the
 * original parent pathname for an outside symlink after validation does not
 * redirect the delete to the symlink target. Other platforms use the existing
 * path-based operation after immediate containment/identity revalidation;
 * that fallback is best-effort and is not a portable race-free guarantee.
 */
export async function removeProjectEntrySafely(base, target, options = {}) {
    const context = safeProjectEntryContext(base, target)
    if (!context) return false

    if (process.platform !== "linux") {
        try {
            if (!isWithinRealBase(base, context.full)) return false
            const realBase = fs.realpathSync(base)
            const parentReal = fs.realpathSync(context.parent)
            if (!isInsideBase(realBase, parentReal)) return false
            await fsp.rm(context.full, options)
            return true
        } catch (error) {
            return Boolean(options.force && error.code === "ENOENT")
        }
    }

    const handle = await openSafeProjectParentDirectory(base, context.parent)
    if (!handle) return false

    try {
        // Recheck immediately before dispatch. The syscall remains anchored to
        // the opened directory even if another process swaps the pathname next.
        if (!isSafeOpenProjectDirectory(base, context.parent, handle.fd)) return false
        const operationPath = entryPathAtDirectoryHandle(handle, context.parent, context.leaf)
        await fsp.rm(operationPath, options)
        return true
    } catch (error) {
        return Boolean(options.force && error.code === "ENOENT")
    } finally {
        await handle.close().catch(() => {})
    }
}

/**
 * Rename an entry using open parent-directory descriptors on Linux. Both ends
 * use one-component names relative to their verified directories. Platforms
 * without procfs use containment/identity rechecks around the pathname syscall;
 * that fallback still has a documented race window.
 */
export async function renameProjectEntrySafely(base, fromTarget, toTarget) {
    const source = safeProjectEntryContext(base, fromTarget)
    const destination = safeProjectEntryContext(base, toTarget)
    if (!source || !destination || source.full === destination.full) return false

    if (process.platform !== "linux") {
        try {
            if (!isWithinRealBase(base, source.full) || !isWithinRealBase(base, destination.parent)) return false
            const realBase = fs.realpathSync(base)
            const sourceParent = fs.realpathSync(source.parent)
            const destinationParent = fs.realpathSync(destination.parent)
            if (!isInsideBase(realBase, sourceParent) || !isInsideBase(realBase, destinationParent)) return false
            await fsp.rename(source.full, destination.full)
            return true
        } catch {
            return false
        }
    }

    const sourceHandle = await openSafeProjectParentDirectory(base, source.parent)
    if (!sourceHandle) return false
    const destinationHandle = await openSafeProjectParentDirectory(base, destination.parent)
    if (!destinationHandle) {
        await sourceHandle.close().catch(() => {})
        return false
    }

    try {
        if (!isSafeOpenProjectDirectory(base, source.parent, sourceHandle.fd)
            || !isSafeOpenProjectDirectory(base, destination.parent, destinationHandle.fd)) {
            return false
        }

        const sourcePath = entryPathAtDirectoryHandle(sourceHandle, source.parent, source.leaf)
        const destinationPath = entryPathAtDirectoryHandle(destinationHandle, destination.parent, destination.leaf)
        await fsp.rename(sourcePath, destinationPath)
        return true
    } catch {
        return false
    } finally {
        await Promise.all([
            sourceHandle.close().catch(() => {}),
            destinationHandle.close().catch(() => {})
        ])
    }
}



/**
 * Copy a regular file or directory tree without delegating to path-based
 * recursive fs.cp(). Entries are opened from verified project-parent handles;
 * Linux destination writes are staged in a temporary sibling and renamed
 * through the already-open directory descriptor.
 *
 * Symbolic links are rejected rather than followed or copied. The non-Linux
 * fallback uses the same checks but cannot promise an atomic directory-relative
 * operation against a hostile local process that moves an opened directory.
 */
export async function copyProjectEntrySafely(base, fromTarget, toTarget) {
    const source = safeProjectEntryContext(base, fromTarget)
    const destination = safeProjectEntryContext(base, toTarget)
    if (!source || !destination || source.full === destination.full) return false

    const relativeDestination = path.relative(source.full, destination.full)
    if (relativeDestination && !relativeDestination.startsWith(".." + path.sep)
        && relativeDestination !== ".." && !path.isAbsolute(relativeDestination)) {
        // Copying a directory into itself would recurse indefinitely.
        try {
            const st = fs.lstatSync(source.full)
            if (st.isDirectory() && !st.isSymbolicLink()) return false
        } catch {
            // The recursive copy below will fail closed for missing source paths.
        }
    }

    async function copyEntry(from, to, depth = 0) {
        if (depth > 256) return false
        const sourceContext = safeProjectEntryContext(base, from)
        const destinationContext = safeProjectEntryContext(base, to)
        if (!sourceContext || !destinationContext) return false

        const sourceParent = await openSafeProjectParentDirectory(base, sourceContext.parent)
        if (!sourceParent) return false

        let sourceHandle
        let destinationParent
        let temporaryPath
        let temporaryHandle
        try {
            const sourceEntryPath = entryPathAtDirectoryHandle(sourceParent, sourceContext.parent, sourceContext.leaf)
            let sourceEntry
            try {
                sourceEntry = await fsp.lstat(sourceEntryPath)
            } catch {
                return false
            }

            if (sourceEntry.isSymbolicLink()) return false
            if (!sourceEntry.isFile() && !sourceEntry.isDirectory()) return false

            if (sourceEntry.isDirectory()) {
                const relativeChild = path.relative(sourceContext.full, destinationContext.full)
                if (relativeChild === "" || (relativeChild !== ".."
                    && !relativeChild.startsWith(".." + path.sep)
                    && !path.isAbsolute(relativeChild))) {
                    return false
                }

                if (!await ensureProjectDirectorySafely(base, destinationContext.parent)) return false

                destinationParent = await openSafeProjectParentDirectory(base, destinationContext.parent)
                if (!destinationParent) return false

                const destinationEntryPath = entryPathAtDirectoryHandle(
                    destinationParent, destinationContext.parent, destinationContext.leaf
                )
                try {
                    const destinationEntry = await fsp.lstat(destinationEntryPath)
                    if (destinationEntry.isSymbolicLink() || !destinationEntry.isDirectory()) return false
                } catch (error) {
                    if (error.code !== "ENOENT") return false
                    if (!await ensureProjectDirectorySafely(base, destinationContext.full)) return false
                }

                const entries = readProjectDirectoryEntriesSafelySync(base, sourceContext.full)
                if (!entries) return false
                for (const entry of entries) {
                    if (entry.isSymbolicLink) return false
                    const childFrom = path.join(sourceContext.full, entry.name)
                    const childTo = path.join(destinationContext.full, entry.name)
                    if (!await copyEntry(childFrom, childTo, depth + 1)) return false
                }
                return true
            }

            // Open source relative to the verified parent, without following a
            // final symlink, then validate the object actually opened.
            try {
                sourceHandle = await fsp.open(
                    sourceEntryPath,
                    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
                )
            } catch {
                return false
            }
            if (!isSafeOpenReadFileHandle(base, sourceContext.full, sourceHandle.fd)) return false
            const sourceStat = await sourceHandle.stat()
            if (!sourceStat.isFile()) return false

            if (!await ensureProjectDirectorySafely(base, destinationContext.parent)) return false
            if (!isSafeOpenProjectDirectory(base, sourceContext.parent, sourceParent.fd)) return false

            destinationParent = await openSafeProjectParentDirectory(base, destinationContext.parent)
            if (!destinationParent) return false

            const destinationEntryPath = entryPathAtDirectoryHandle(
                destinationParent, destinationContext.parent, destinationContext.leaf
            )
            try {
                const destinationEntry = await fsp.lstat(destinationEntryPath)
                if (destinationEntry.isSymbolicLink() || !destinationEntry.isFile()) return false
            } catch (error) {
                if (error.code !== "ENOENT") return false
            }

            const temporaryName = `.codogma-copy-${crypto.randomUUID()}.tmp`
            temporaryPath = entryPathAtDirectoryHandle(destinationParent, destinationContext.parent, temporaryName)
            try {
                temporaryHandle = await fsp.open(
                    temporaryPath,
                    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
                    sourceStat.mode & 0o777
                )
            } catch {
                return false
            }

            const buffer = Buffer.alloc(64 * 1024)
            let position = 0
            while (true) {
                if (!isSafeOpenReadFileHandle(base, sourceContext.full, sourceHandle.fd)
                    || !isSafeOpenProjectDirectory(base, destinationContext.parent, destinationParent.fd)) {
                    return false
                }

                const { bytesRead } = await sourceHandle.read(buffer, 0, buffer.length, position)
                if (bytesRead === 0) break

                let written = 0
                while (written < bytesRead) {
                    const result = await temporaryHandle.write(buffer, written, bytesRead - written, position + written)
                    if (!result.bytesWritten) return false
                    written += result.bytesWritten
                }
                position += bytesRead
            }

            await temporaryHandle.chmod(sourceStat.mode & 0o777)
            await temporaryHandle.close()
            temporaryHandle = null

            if (!isSafeOpenProjectDirectory(base, destinationContext.parent, destinationParent.fd)) return false
            await fsp.rename(temporaryPath, destinationEntryPath)
            temporaryPath = null
            return true
        } catch {
            return false
        } finally {
            if (temporaryHandle) await temporaryHandle.close().catch(() => {})
            if (temporaryPath && destinationParent) {
                try {
                    await fsp.unlink(temporaryPath)
                } catch {
                    // Best-effort cleanup of the temporary file created here.
                }
            }
            if (sourceHandle) await sourceHandle.close().catch(() => {})
            if (destinationParent) await destinationParent.close().catch(() => {})
            await sourceParent.close().catch(() => {})
        }
    }

    try {
        if (!await ensureProjectDirectorySafely(base, destination.parent)) return false
        return await copyEntry(source.full, destination.full)
    } catch {
        return false
    }
}

/**
 * Return metadata for the directory object selected by the kernel, not by a
 * second pathname lookup after validation. The descriptor remains the object
 * of record if the directory pathname is concurrently replaced.
 */
export function statProjectDirectorySafelySync(base, target) {
    const opened = openSafeProjectDirectorySync(base, target)
    if (!opened) return null

    try {
        return fs.fstatSync(opened.fd)
    } catch {
        return null
    } finally {
        try { fs.closeSync(opened.fd) } catch {}
    }
}

/**
 * Create a new project file without replacing an existing entry.
 *
 * The parent is opened and verified first. On Linux, O_EXCL creation is
 * anchored to that directory descriptor through /proc/self/fd, so a parent
 * pathname swap cannot redirect the create to an outside symlink. Existing
 * files are never truncated by this operation.
 */
export function writeNewFileSafely(base, target, content) {
    if (typeof target !== "string") return false

    const lexicalBase = path.resolve(base)
    const full = path.resolve(target)
    if (!isInsideBase(lexicalBase, full) || full === lexicalBase) return false

    const parentPath = path.dirname(full)
    const leaf = path.basename(full)
    if (!leaf || leaf === "." || leaf === ".." || leaf.includes(path.sep)) return false

    const parent = openSafeProjectDirectorySync(base, parentPath)
    if (!parent) return false

    const operationPath = entryPathAtDirectoryHandle(parent, parentPath, leaf)
    let fd
    let created = false
    let written = false

    try {
        const flags = fs.constants.O_WRONLY
            | fs.constants.O_CREAT
            | fs.constants.O_EXCL
            | (fs.constants.O_NOFOLLOW ?? 0)

        fd = fs.openSync(operationPath, flags, 0o666)
        created = true

        if (!isSafeOpenFileHandle(base, full, fd)
            || !isSafeOpenProjectDirectory(base, parentPath, parent.fd)) {
            return false
        }

        fs.writeFileSync(fd, content)
        written = true
        return true
    } catch {
        return false
    } finally {
        // Remove only the inode created by this call. The path is still
        // anchored to the opened parent on Linux; lstat prevents unlinking a
        // replacement symlink or another process' replacement file.
        if (created && !written && fd !== undefined) {
            try {
                const opened = fs.fstatSync(fd)
                const entry = fs.lstatSync(operationPath)
                if (!entry.isSymbolicLink()
                    && entry.isFile()
                    && entry.dev === opened.dev
                    && entry.ino === opened.ino) {
                    fs.unlinkSync(operationPath)
                }
            } catch {
                // Best-effort cleanup; never follow a replacement symlink.
            }
        }

        if (fd !== undefined) {
            try { fs.closeSync(fd) } catch {}
        }
        try { fs.closeSync(parent.fd) } catch {}
    }
}

/** Read file metadata from a verified descriptor without exposing pathname stats. */
export async function statProjectFileSafely(base, target) {
    const handle = await openSafeProjectFileForRead(base, target)
    if (!handle) return null

    try {
        return await handle.stat()
    } catch {
        return null
    } finally {
        await handle.close().catch(() => {})
    }
}
