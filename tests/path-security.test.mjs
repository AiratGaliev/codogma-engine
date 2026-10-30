/**
 * Unit tests for server/path-security.mjs (node:test, no server required).
 *
 * Covers the negative scenarios the file API must survive: lexical escapes,
 * absolute paths, symlink escapes inside the project, dangling symlinks and
 * other unusual client-supplied paths.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { safeJoin, isWithinRealBase, isInsideBase, writeFileSafely, writeNewFileSafely, readFileSafely, readFilePrefixSafely, removeProjectEntrySafely, renameProjectEntrySafely, ensureProjectDirectorySafely, readProjectDirectoryEntriesSafelySync, copyProjectEntrySafely, statProjectDirectorySafelySync, statProjectFileSafely } from "../server/path-security.mjs"

function createTempTree() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "path-security-"))
    const base = path.join(root, "base")
    const outside = path.join(root, "outside")
    fs.mkdirSync(path.join(base, "assets", "nested"), { recursive: true })
    fs.mkdirSync(outside, { recursive: true })
    fs.writeFileSync(path.join(base, "assets", "hero.png"), "png")
    fs.writeFileSync(path.join(base, "file.txt"), "content")
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret")
    return { root, base, outside }
}

function withSymlinks(t, fn) {
    const { base, outside } = t
    fs.symlinkSync(outside, path.join(base, "outside-link"), "dir")
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(base, "outside-file-link"), "file")
    fs.symlinkSync(path.join(outside, "missing.txt"), path.join(base, "dangling-link"), "file")
    fs.symlinkSync(path.join(base, "assets"), path.join(base, "inside-link"), "dir")
    // link -> link -> outside
    fs.symlinkSync(path.join(base, "outside-link"), path.join(base, "chain-link"), "dir")
    try {
        fn()
    } finally {
        for (const name of ["outside-link", "outside-file-link", "dangling-link", "inside-link", "chain-link"]) {
            fs.rmSync(path.join(base, name), { force: true, recursive: true })
        }
    }
}

test("safeJoin resolves ordinary relative paths inside the base", () => {
    const t = createTempTree()
    try {
        assert.equal(safeJoin(t.base, "file.txt"), path.join(t.base, "file.txt"))
        assert.equal(safeJoin(t.base, "assets/hero.png"), path.join(t.base, "assets", "hero.png"))
        assert.equal(safeJoin(t.base, "assets/nested/deep/new.txt"), path.join(t.base, "assets", "nested", "deep", "new.txt"))
        assert.equal(safeJoin(t.base, "./assets/../assets/hero.png"), path.join(t.base, "assets", "hero.png"))
        // not-yet-existing leaf components stay allowed (creates go through here)
        assert.equal(safeJoin(t.base, "new-folder/new-file.json"), path.join(t.base, "new-folder", "new-file.json"))
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("safeJoin rejects lexical escapes and absolute paths", () => {
    const t = createTempTree()
    try {
        const rejects = [
            "../outside/secret.txt",
            "../../etc/passwd",
            "assets/../../outside/secret.txt",
            "..",
            "\0null-byte.txt",
            "file\0.txt",
            42,
            null,
            undefined,
            { path: "file.txt" }
        ]
        for (const input of rejects) {
            assert.equal(safeJoin(t.base, input), null, `expected null for ${String(input)}`)
        }

        // The base itself is a legitimate target (project root operations).
        assert.equal(safeJoin(t.base, ""), t.base)
        assert.equal(safeJoin(t.base, "."), t.base)

        // Absolute paths are not an escape: leading separators are stripped
        // and the remainder is contained inside the base.
        assert.equal(safeJoin(t.base, "/etc/passwd"), path.join(t.base, "etc", "passwd"))
        assert.equal(safeJoin(t.base, "/absolute/path.txt"), path.join(t.base, "absolute", "path.txt"))

        // Windows-style separators: an escape on win32, a literal (in-base)
        // file name on POSIX — both outcomes are safe.
        for (const input of ["..\\..\\etc\\passwd", "C:\\windows\\system32"]) {
            const result = safeJoin(t.base, input)
            if (process.platform === "win32") {
                assert.equal(result, null, `expected null on win32 for ${input}`)
            } else {
                assert.ok(result && result.startsWith(t.base + path.sep),
                    `expected an in-base literal filename on POSIX for ${input}`)
            }
        }
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("safeJoin rejects symlinks that escape the base", () => {
    const t = createTempTree()
    withSymlinks(t, () => {
        assert.equal(safeJoin(t.base, "outside-link/secret.txt"), null)
        assert.equal(safeJoin(t.base, "outside-link"), null)
        assert.equal(safeJoin(t.base, "outside-file-link"), null)
        assert.equal(safeJoin(t.base, "chain-link/secret.txt"), null, "chained symlink must not escape")
        assert.equal(safeJoin(t.base, "assets/../../../outside/secret.txt"), null)
        // inside symlink pointing at a real directory inside the base is fine
        // (safeJoin validates containment, it does not canonicalize the path)
        assert.equal(safeJoin(t.base, "inside-link/hero.png"), path.join(t.base, "inside-link", "hero.png"))
    })
})

test("safeJoin fails closed on dangling symlinks", () => {
    const t = createTempTree()
    withSymlinks(t, () => {
        assert.equal(safeJoin(t.base, "dangling-link"), null, "the dangling link itself must be rejected")
        assert.equal(safeJoin(t.base, "dangling-link/anything"), null, "children of a dangling link must be rejected")
    })
})

test("isWithinRealBase and isInsideBase agree with safeJoin", () => {
    const t = createTempTree()
    withSymlinks(t, () => {
        const realBase = fs.realpathSync(t.base)

        assert.equal(isWithinRealBase(t.base, path.join(t.base, "file.txt")), true)
        assert.equal(isWithinRealBase(t.base, path.join(t.outside, "secret.txt")), false)
        assert.equal(isWithinRealBase(t.base, path.join(t.base, "dangling-link")), false)
        assert.equal(isWithinRealBase(t.base, path.join(t.base, "inside-link", "hero.png")), true)

        assert.equal(isInsideBase(realBase, realBase), true)
        assert.equal(isInsideBase(realBase, path.join(realBase, "a", "b")), true)
        assert.equal(isInsideBase(realBase, realBase + "-sibling"), false, "prefix must respect path separator")
        assert.equal(isInsideBase(realBase, t.outside), false)
    })
})

test("safeJoin is stable for paths that do not exist anywhere", () => {
    const t = createTempTree()
    try {
        // fully virtual sub-trees are allowed (they may be created later)
        assert.equal(safeJoin(t.base, "a/b/c/d.txt"), path.join(t.base, "a", "b", "c", "d.txt"))
        // but a virtual path can not climb out with ..
        assert.equal(safeJoin(t.base, "a/b/../../../x"), null)
        // repeated separators and trailing slashes are normalized
        assert.equal(safeJoin(t.base, "assets//hero.png/"), path.join(t.base, "assets", "hero.png"))
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("writeFileSafely creates and overwrites only regular files inside the project", () => {
    const t = createTempTree()
    try {
        assert.equal(writeFileSafely(t.base, path.join(t.base, "file.txt"), "replacement"), true)
        assert.equal(fs.readFileSync(path.join(t.base, "file.txt"), "utf8"), "replacement")

        const created = path.join(t.base, "assets", "new.txt")
        assert.equal(writeFileSafely(t.base, created, "new content"), true)
        assert.equal(fs.readFileSync(created, "utf8"), "new content")
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("writeFileSafely rejects a final symlink without truncating its target", () => {
    const t = createTempTree()
    try {
        withSymlinks(t, () => {
            assert.equal(writeFileSafely(t.base, path.join(t.base, "outside-file-link"), "destroy"), false)
            assert.equal(fs.readFileSync(path.join(t.outside, "secret.txt"), "utf8"), "secret")
        })
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("writeFileSafely rejects a symlinked parent and preserves outside content", () => {
    const t = createTempTree()
    try {
        withSymlinks(t, () => {
            assert.equal(writeFileSafely(t.base, path.join(t.base, "outside-link", "secret.txt"), "destroy"), false)
            assert.equal(fs.readFileSync(path.join(t.outside, "secret.txt"), "utf8"), "secret")
        })
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("readFileSafely reads bytes from a verified descriptor and rejects outside symlinks", () => {
    const t = createTempTree()
    try {
        assert.equal(readFileSafely(t.base, path.join(t.base, "file.txt"), "utf8"), "content")
        fs.symlinkSync(path.join(t.outside, "secret.txt"), path.join(t.base, "secret-link.txt"), "file")
        assert.throws(
            () => readFileSafely(t.base, path.join(t.base, "secret-link.txt"), "utf8"),
            /unsafe project file|outside the project root/
        )
        assert.equal(fs.readFileSync(path.join(t.outside, "secret.txt"), "utf8"), "secret")
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("readFileSafely rejects a parent-symlink swap between path validation and open", () => {
    const t = createTempTree()
    const assets = path.join(t.base, "assets")
    const parkedAssets = path.join(t.base, "assets-internal")
    const target = path.join(assets, "race.txt")
    const outsideTarget = path.join(t.outside, "race.txt")
    fs.writeFileSync(target, "inside secret")
    fs.writeFileSync(outsideTarget, "OUTSIDE SECRET")
    const originalOpenSync = fs.openSync
    let swapped = false

    try {
        fs.openSync = function (filePath, ...args) {
            if (!swapped && filePath === target) {
                swapped = true
                fs.renameSync(assets, parkedAssets)
                fs.symlinkSync(t.outside, assets, "dir")
            }
            return originalOpenSync.call(fs, filePath, ...args)
        }

        assert.throws(
            () => readFileSafely(t.base, target, "utf8"),
            /unsafe project file|outside the project root/
        )
        assert.equal(swapped, true, "test must inject the symlink swap immediately before open()")
        assert.equal(fs.readFileSync(outsideTarget, "utf8"), "OUTSIDE SECRET",
            "the outside file must not be returned to the caller")
    } finally {
        fs.openSync = originalOpenSync
        try { fs.rmSync(assets, { recursive: true, force: true }) } catch {}
        try { fs.renameSync(parkedAssets, assets) } catch {}
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("writeFileSafely rejects a parent-symlink swap immediately before open without truncating outside data", () => {
    const t = createTempTree()
    const assets = path.join(t.base, "assets")
    const parkedAssets = path.join(t.base, "assets-internal")
    const target = path.join(assets, "race-write.txt")
    const outsideTarget = path.join(t.outside, "race-write.txt")
    fs.writeFileSync(target, "inside original")
    fs.writeFileSync(outsideTarget, "OUTSIDE MUST STAY")
    const originalOpenSync = fs.openSync
    let swapped = false

    try {
        fs.openSync = function (filePath, ...args) {
            if (!swapped && filePath === target) {
                swapped = true
                fs.renameSync(assets, parkedAssets)
                fs.symlinkSync(t.outside, assets, "dir")
            }
            return originalOpenSync.call(fs, filePath, ...args)
        }

        assert.equal(writeFileSafely(t.base, target, "attacker write"), false)
        assert.equal(swapped, true, "test must inject the symlink swap immediately before open()")
        assert.equal(fs.readFileSync(outsideTarget, "utf8"), "OUTSIDE MUST STAY",
            "failed validation must not truncate or overwrite the outside file")
    } finally {
        fs.openSync = originalOpenSync
        try { fs.rmSync(assets, { recursive: true, force: true }) } catch {}
        try { fs.renameSync(parkedAssets, assets) } catch {}
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("readFileSafely enforces maxBytes even when the file grows after fstat", () => {
    const t = createTempTree()
    const target = path.join(t.base, "file.txt")
    fs.writeFileSync(target, "small")
    const originalReadSync = fs.readSync
    let grew = false

    try {
        fs.readSync = function (fd, ...args) {
            if (!grew) {
                grew = true
                fs.appendFileSync(target, "-concurrent-growth")
            }
            return originalReadSync.call(fs, fd, ...args)
        }

        assert.throws(
            () => readFileSafely(t.base, target, "utf8", 5),
            /configured read limit/
        )
        assert.equal(grew, true, "test must grow the file between fstat and descriptor read")
    } finally {
        fs.readSync = originalReadSync
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("removeProjectEntrySafely anchors deletion to the opened parent if its path is swapped", { skip: process.platform !== "linux" }, async () => {
    const t = createTempTree()
    const assets = path.join(t.base, "assets")
    const parkedAssets = path.join(t.base, "assets-internal")
    const target = path.join(assets, "delete.txt")
    const outsideTarget = path.join(t.outside, "delete.txt")
    fs.writeFileSync(target, "inside file")
    fs.writeFileSync(outsideTarget, "OUTSIDE MUST SURVIVE")
    const originalRm = fsp.rm
    let swapped = false

    try {
        fsp.rm = async function (entryPath, options) {
            if (!swapped && typeof entryPath === "string" && entryPath.endsWith("/delete.txt")) {
                assert.match(entryPath, /^\/proc\/self\/fd\/\d+\/delete\.txt$/)
                fs.renameSync(assets, parkedAssets)
                fs.symlinkSync(t.outside, assets, "dir")
                swapped = true
            }
            return originalRm.call(fsp, entryPath, options)
        }

        assert.equal(await removeProjectEntrySafely(t.base, target, { recursive: true, force: true }), true)
        assert.equal(swapped, true, "test must swap the parent immediately before rm()")
        assert.equal(fs.readFileSync(outsideTarget, "utf8"), "OUTSIDE MUST SURVIVE")
        assert.equal(fs.existsSync(path.join(parkedAssets, "delete.txt")), false)
    } finally {
        fsp.rm = originalRm
        try { fs.rmSync(assets, { recursive: true, force: true }) } catch {}
        try { fs.renameSync(parkedAssets, assets) } catch {}
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("renameProjectEntrySafely anchors destination to the opened parent if its path is swapped", { skip: process.platform !== "linux" }, async () => {
    const t = createTempTree()
    const assets = path.join(t.base, "assets")
    const destination = path.join(t.base, "destination")
    const parkedDestination = path.join(t.base, "destination-internal")
    fs.mkdirSync(destination)
    const source = path.join(assets, "move.txt")
    const target = path.join(destination, "moved.txt")
    const outsideTarget = path.join(t.outside, "moved.txt")
    fs.writeFileSync(source, "original payload")
    const originalRename = fsp.rename
    let swapped = false

    try {
        fsp.rename = async function (fromPath, toPath) {
            if (!swapped && typeof toPath === "string" && toPath.endsWith("/moved.txt")) {
                assert.match(toPath, /^\/proc\/self\/fd\/\d+\/moved\.txt$/)
                fs.renameSync(destination, parkedDestination)
                fs.symlinkSync(t.outside, destination, "dir")
                swapped = true
            }
            return originalRename.call(fsp, fromPath, toPath)
        }

        assert.equal(await renameProjectEntrySafely(t.base, source, target), true)
        assert.equal(swapped, true, "test must swap the destination parent immediately before rename()")
        assert.equal(fs.existsSync(outsideTarget), false, "rename must not write through the swapped outside symlink")
        assert.equal(fs.readFileSync(path.join(parkedDestination, "moved.txt"), "utf8"), "original payload")
        assert.equal(fs.existsSync(source), false)
    } finally {
        fsp.rename = originalRename
        try { fs.rmSync(destination, { recursive: true, force: true }) } catch {}
        try { fs.renameSync(parkedDestination, destination) } catch {}
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("ensureProjectDirectorySafely does not create a directory through a swapped outside parent", { skip: process.platform !== "linux" }, async () => {
    const t = createTempTree()
    const assets = path.join(t.base, "assets")
    const parkedAssets = path.join(t.base, "assets-internal")
    const target = path.join(assets, "new-folder")
    const outsideTarget = path.join(t.outside, "new-folder")
    const originalMkdir = fsp.mkdir
    let swapped = false

    try {
        fsp.mkdir = async function (dirPath, options) {
            if (!swapped && typeof dirPath === "string" && dirPath.endsWith("/new-folder")) {
                assert.match(dirPath, /^\/proc\/self\/fd\/\d+\/new-folder$/)
                fs.renameSync(assets, parkedAssets)
                fs.symlinkSync(t.outside, assets, "dir")
                swapped = true
            }
            return originalMkdir.call(fsp, dirPath, options)
        }

        assert.equal(await ensureProjectDirectorySafely(t.base, target), false)
        assert.equal(swapped, true, "test must swap the parent immediately before mkdir()")
        assert.equal(fs.existsSync(outsideTarget), false, "mkdir must not create a directory through the swapped outside symlink")
    } finally {
        fsp.mkdir = originalMkdir
        try { fs.rmSync(assets, { recursive: true, force: true }) } catch {}
        try { fs.renameSync(parkedAssets, assets) } catch {}
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("readProjectDirectoryEntriesSafelySync does not enumerate an outside symlink after the path is swapped", { skip: process.platform !== "linux" }, () => {
    const t = createTempTree()
    const assets = path.join(t.base, "assets")
    const parkedAssets = path.join(t.base, "assets-internal")
    fs.writeFileSync(path.join(assets, "inside-only.txt"), "inside")
    fs.writeFileSync(path.join(t.outside, "outside-only.txt"), "outside")
    const originalReaddir = fs.readdirSync
    let swapped = false

    try {
        fs.readdirSync = function (directoryPath, ...args) {
            if (!swapped && typeof directoryPath === "string" && /^\/proc\/self\/fd\/\d+$/.test(directoryPath)) {
                fs.renameSync(assets, parkedAssets)
                fs.symlinkSync(t.outside, assets, "dir")
                swapped = true
            }
            return originalReaddir.call(fs, directoryPath, ...args)
        }

        const entries = readProjectDirectoryEntriesSafelySync(t.base, assets)
        assert.ok(entries, "the already-open internal directory should remain readable")
        assert.equal(swapped, true, "test must swap the path immediately before readdir()")
        const names = entries.map(entry => entry.name)
        assert.ok(names.includes("inside-only.txt"))
        assert.ok(!names.includes("outside-only.txt"), "enumeration must not be redirected to the outside symlink")
    } finally {
        fs.readdirSync = originalReaddir
        try { fs.rmSync(assets, { recursive: true, force: true }) } catch {}
        try { fs.renameSync(parkedAssets, assets) } catch {}
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("copyProjectEntrySafely copies regular files and safely replaces an existing destination", async () => {
    const t = createTempTree()
    const source = path.join(t.base, "file.txt")
    const destination = path.join(t.base, "copy.txt")
    fs.writeFileSync(source, "source payload")
    fs.writeFileSync(destination, "old payload")

    try {
        assert.equal(await copyProjectEntrySafely(t.base, source, destination), true)
        assert.equal(fs.readFileSync(destination, "utf8"), "source payload")
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("copyProjectEntrySafely copies a directory tree without following symbolic links", async () => {
    const t = createTempTree()
    const source = path.join(t.base, "assets")
    const destination = path.join(t.base, "copied-assets")
    fs.writeFileSync(path.join(source, "nested", "nested.txt"), "nested payload")
    fs.writeFileSync(path.join(source, ".hidden-asset"), "hidden payload")

    try {
        assert.equal(await copyProjectEntrySafely(t.base, source, destination), true)
        assert.equal(fs.readFileSync(path.join(destination, "hero.png"), "utf8"), "png")
        assert.equal(fs.readFileSync(path.join(destination, "nested", "nested.txt"), "utf8"), "nested payload")
        assert.equal(fs.readFileSync(path.join(destination, ".hidden-asset"), "utf8"), "hidden payload")
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("copyProjectEntrySafely rejects symbolic-link sources and preserves outside data", async () => {
    const t = createTempTree()
    const link = path.join(t.base, "copy-link.txt")
    const destination = path.join(t.base, "copy-destination.txt")

    try {
        fs.symlinkSync(path.join(t.outside, "secret.txt"), link, "file")
        assert.equal(await copyProjectEntrySafely(t.base, link, destination), false)
        assert.equal(fs.existsSync(destination), false)
        assert.equal(fs.readFileSync(path.join(t.outside, "secret.txt"), "utf8"), "secret")
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("copyProjectEntrySafely rejects an outside destination-parent swap before commit", { skip: process.platform !== "linux" }, async () => {
    const t = createTempTree()
    const destination = path.join(t.base, "destination")
    const parkedDestination = path.join(t.base, "destination-internal")
    const source = path.join(t.base, "file.txt")
    const target = path.join(destination, "copied.txt")
    const outsideTarget = path.join(t.outside, "copied.txt")
    fs.mkdirSync(destination)
    fs.writeFileSync(source, "new payload")
    fs.writeFileSync(outsideTarget, "OUTSIDE MUST SURVIVE")
    const originalOpen = fsp.open
    let swapped = false

    try {
        fsp.open = async function (filePath, ...args) {
            if (!swapped && typeof filePath === "string" && filePath.includes("/.codogma-copy-")) {
                fs.renameSync(destination, parkedDestination)
                fs.symlinkSync(t.outside, destination, "dir")
                swapped = true
            }
            return originalOpen.call(fsp, filePath, ...args)
        }

        assert.equal(await copyProjectEntrySafely(t.base, source, target), false)
        assert.equal(swapped, true, "test must inject the symlink swap before the temporary copy file is opened")
        assert.equal(fs.readFileSync(outsideTarget, "utf8"), "OUTSIDE MUST SURVIVE")
        assert.equal(fs.existsSync(path.join(parkedDestination, "copied.txt")), false)
        assert.deepEqual(
            fs.readdirSync(parkedDestination),
            [],
            "the temporary file created by the rejected copy must be cleaned up"
        )
    } finally {
        fsp.open = originalOpen
        try { fs.rmSync(destination, { recursive: true, force: true }) } catch {}
        try { fs.renameSync(parkedDestination, destination) } catch {}
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("readFilePrefixSafely returns only the requested prefix and marks truncation", async () => {
    const t = createTempTree()
    const source = path.join(t.base, "large.txt")
    fs.writeFileSync(source, "0123456789abcdef")
    try {
        const result = await readFilePrefixSafely(t.base, source, 8)
        assert.equal(result.buffer.toString("utf8"), "01234567")
        assert.equal(result.buffer.length, 8)
        assert.equal(result.size, 16)
        assert.equal(result.truncated, true)
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("readFilePrefixSafely does not mark an in-limit file as truncated", async () => {
    const t = createTempTree()
    const source = path.join(t.base, "small.txt")
    fs.writeFileSync(source, "short")
    try {
        const result = await readFilePrefixSafely(t.base, source, 8)
        assert.equal(result.buffer.toString("utf8"), "short")
        assert.equal(result.size, 5)
        assert.equal(result.truncated, false)
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("readFilePrefixSafely never returns content from an outside symlink", async () => {
    const t = createTempTree()
    const link = path.join(t.base, "external.txt")
    try {
        fs.symlinkSync(path.join(t.outside, "secret.txt"), link, "file")
        await assert.rejects(readFilePrefixSafely(t.base, link, 32), /invalid or unreadable project file/)
        assert.equal(fs.readFileSync(path.join(t.outside, "secret.txt"), "utf8"), "secret")
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})


test("copyProjectEntrySafely rejects a source-parent swap to an outside symlink", { skip: process.platform !== "linux" }, async () => {
    const t = createTempTree()
    const assets = path.join(t.base, "assets")
    const parkedAssets = path.join(t.base, "assets-internal")
    const source = path.join(assets, "source.txt")
    const destination = path.join(t.base, "copied-source.txt")
    const outsideSource = path.join(t.outside, "source.txt")
    fs.writeFileSync(source, "INSIDE SOURCE")
    fs.writeFileSync(outsideSource, "OUTSIDE SECRET MUST NOT BE COPIED")
    const originalOpen = fsp.open
    let swapped = false

    try {
        fsp.open = async function (filePath, ...args) {
            if (!swapped && typeof filePath === "string" && /\/source\.txt$/.test(filePath)
                && /^\/proc\/self\/fd\/\d+\//.test(filePath)) {
                fs.renameSync(assets, parkedAssets)
                fs.symlinkSync(t.outside, assets, "dir")
                swapped = true
            }
            return originalOpen.call(fsp, filePath, ...args)
        }

        assert.equal(await copyProjectEntrySafely(t.base, source, destination), false,
            "copy must fail closed when the source's pathname is swapped to an outside symlink")
        assert.equal(swapped, true, "test must swap the parent immediately before source open")
        assert.equal(fs.existsSync(destination), false, "no destination may be committed after source validation fails")
        assert.equal(fs.readFileSync(outsideSource, "utf8"), "OUTSIDE SECRET MUST NOT BE COPIED")
        assert.equal(fs.readFileSync(path.join(parkedAssets, "source.txt"), "utf8"), "INSIDE SOURCE")
    } finally {
        fsp.open = originalOpen
        try { fs.rmSync(assets, { recursive: true, force: true }) } catch {}
        try { fs.renameSync(parkedAssets, assets) } catch {}
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("writeNewFileSafely never overwrites an existing project file", () => {
    const t = createTempTree()
    const target = path.join(t.base, "file.txt")

    try {
        assert.equal(writeNewFileSafely(t.base, target, "replacement"), false)
        assert.equal(fs.readFileSync(target, "utf8"), "content",
            "exclusive create must preserve the original file bytes")
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("writeNewFileSafely rejects a parent symlink swap and does not create outside files", { skip: process.platform !== "linux" }, () => {
    const t = createTempTree()
    const parent = path.join(t.base, "assets")
    const parkedParent = path.join(t.base, "assets-internal")
    const target = path.join(parent, "new-scene.scene")
    const outsideTarget = path.join(t.outside, "new-scene.scene")
    const originalOpen = fs.openSync
    let swapped = false

    try {
        fs.openSync = function (filePath, ...args) {
            if (!swapped && typeof filePath === "string" && /^\/proc\/self\/fd\/\d+\/new-scene\.scene$/.test(filePath)) {
                fs.renameSync(parent, parkedParent)
                fs.symlinkSync(t.outside, parent, "dir")
                swapped = true
            }
            return originalOpen.call(fs, filePath, ...args)
        }

        assert.equal(writeNewFileSafely(t.base, target, "scene-data"), false)
        assert.equal(swapped, true, "the test must replace the parent immediately before the descriptor-anchored create")
        assert.equal(fs.existsSync(outsideTarget), false, "the outside directory must not receive the created file")
        assert.equal(fs.existsSync(path.join(parkedParent, "new-scene.scene")), false,
            "a rejected create must clean up its own staged file")
    } finally {
        fs.openSync = originalOpen
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("statProjectDirectorySafelySync returns the opened directory metadata after a pathname swap", { skip: process.platform !== "linux" }, () => {
    const t = createTempTree()
    const parent = path.join(t.base, "assets")
    const parkedParent = path.join(t.base, "assets-internal")
    const expected = fs.statSync(parent)
    const outside = fs.statSync(t.outside)
    const originalFstat = fs.fstatSync
    let calls = 0
    let swapped = false

    try {
        fs.fstatSync = function (fd, ...args) {
            calls += 1
            if (calls === 2 && !swapped) {
                fs.renameSync(parent, parkedParent)
                fs.symlinkSync(t.outside, parent, "dir")
                swapped = true
            }
            return originalFstat.call(fs, fd, ...args)
        }

        const actual = statProjectDirectorySafelySync(t.base, parent)
        assert.ok(actual, "the already-open in-project directory should remain stat-able")
        assert.equal(swapped, true, "the test must swap the pathname immediately before descriptor fstat")
        assert.equal(actual.dev, expected.dev)
        assert.equal(actual.ino, expected.ino)
        assert.notEqual(actual.ino, outside.ino, "metadata must belong to the opened project directory, not the outside symlink target")
    } finally {
        fs.fstatSync = originalFstat
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})

test("statProjectFileSafely returns metadata from an opened in-project file and rejects outside symlinks", async () => {
    const t = createTempTree()
    const inside = path.join(t.base, "file.txt")
    const outsideLink = path.join(t.base, "outside-file-link")

    try {
        const expected = fs.statSync(inside)
        const actual = await statProjectFileSafely(t.base, inside)
        assert.ok(actual)
        assert.equal(actual.dev, expected.dev)
        assert.equal(actual.ino, expected.ino)

        withSymlinks(t, () => {})
        assert.equal(await statProjectFileSafely(t.base, outsideLink), null,
            "metadata lookup must not follow a project symlink to an outside file")
    } finally {
        fs.rmSync(t.root, { recursive: true, force: true })
    }
})
