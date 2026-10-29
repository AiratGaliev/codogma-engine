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

