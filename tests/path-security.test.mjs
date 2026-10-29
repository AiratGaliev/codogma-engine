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
import os from "node:os"
import path from "node:path"

import { safeJoin, isWithinRealBase, isInsideBase, writeFileSafely } from "../server/path-security.mjs"

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

        // Windows-style traversal is platform-dependent because backslashes
        // are ordinary filename characters on POSIX.
        const windowsTraversal = safeJoin(t.base, "..\\..\\etc\\passwd")
        if (process.platform === "win32") {
            assert.equal(windowsTraversal, null)
        } else {
            assert.ok(windowsTraversal && windowsTraversal.startsWith(t.base + path.sep))
        }

        // Drive-qualified and UNC paths are rejected on every platform instead
        // of silently being reinterpreted as relative project filenames.
        for (const input of [
            "C:\\windows\\system32",
            "C:/windows/system32",
            "C:relative.txt",
            "\\\\server\\share\\secret.txt",
            "//server/share/secret.txt"
        ]) {
            assert.equal(safeJoin(t.base, input), null, "expected path rejection for " + input)
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
