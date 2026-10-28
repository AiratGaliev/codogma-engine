/**
 * Data & preview regression tests (PR #10 follow-up backlog).
 *
 * Loads the REAL compiled editor bundles (see tests/editor-bundle-loader.cjs)
 * and locks the behavior of:
 *
 *   - Video/Audio asset-pack URL forms: string, array of strings,
 *     array of { type, url } descriptors, mixed/malformed entries
 *     (a previous defect treated a plain string as an array and returned
 *     only its first character).
 *   - Spritesheet frame computation with margin/spacing, before and after
 *     the image is available, plus invalid frameConfig values.
 *   - Code printers: trailing "undefined" method-call arguments are trimmed
 *     in JS/TS output while mid-list "undefined" arguments are preserved.
 *   - colibri.core.json: undefined values must never leak into saved scene
 *     data (copy/write semantics).
 *   - ThumbnailCache: cache clearing must be safe before the database was
 *     ever created (thumbnail cache read/save failures are recoverable).
 */

import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { loadEditorBundles } from "./editor-bundle-loader.cjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PLUGINS_DIR = path.join(ROOT, "source", "editor", "plugins")

loadEditorBundles(PLUGINS_DIR)

const packCore = globalThis.phasereditor2d.pack.core
const coreCode = globalThis.phasereditor2d.scene.core.code
const sceneUi = globalThis.phasereditor2d.scene.ui
const json = globalThis.colibri.core.json
const FileUtils = globalThis.colibri.ui.ide.FileUtils

/**
 * Runs `fn` with FileUtils resolving no files and no images (data-only mode:
 * the asset items are constructed without a pack, mirroring “no files on
 * disk”). Restores the originals afterwards.
 */
async function withEmptyFileUtils(fn) {
    const originals = {
        getPublicRoot: FileUtils.getPublicRoot,
        getFileFromPath: FileUtils.getFileFromPath,
        getImage: FileUtils.getImage
    }
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null
    FileUtils.getImage = () => null
    try {
        return await fn()
    } finally {
        Object.assign(FileUtils, originals)
    }
}

/* ===================== audio/video URL forms ===================== */

test("VideoAssetPackItem accepts a plain string url", () => {
    const item = new packCore.VideoAssetPackItem(null, { url: "videos/intro.mp4" })

    assert.deepEqual(item.getUrls(), ["videos/intro.mp4"])
    assert.equal(item.getFirstUrl(), "videos/intro.mp4")
})

test("VideoAssetPackItem accepts an array of url strings", () => {
    const item = new packCore.VideoAssetPackItem(null, {
        url: ["videos/a.webm", "videos/a.mp4"]
    })

    assert.deepEqual(item.getUrls(), ["videos/a.webm", "videos/a.mp4"])
    assert.equal(item.getFirstUrl(), "videos/a.webm")
})

test("VideoAssetPackItem accepts { type, url } descriptors", () => {
    const item = new packCore.VideoAssetPackItem(null, {
        url: [
            { type: "video/webm", url: "videos/b.webm" },
            { type: "video/mp4", url: "videos/b.mp4" }
        ]
    })

    assert.deepEqual(item.getUrls(), ["videos/b.webm", "videos/b.mp4"])
    assert.equal(item.getFirstUrl(), "videos/b.webm")
})

test("VideoAssetPackItem skips malformed entries in mixed url arrays", () => {
    const item = new packCore.VideoAssetPackItem(null, {
        url: [
            "videos/ok.mp4",
            { type: "video/mp4" }, // missing url
            { url: "   " }, // blank
            42, // nonsense
            null,
            { type: "video/webm", url: "videos/good.webm" }
        ]
    })

    assert.deepEqual(item.getUrls(), ["videos/ok.mp4", "videos/good.webm"])
    assert.equal(item.getFirstUrl(), "videos/ok.mp4")
})

test("VideoAssetPackItem.getVideoFile returns null for unresolvable urls without throwing", () => {
    const original = FileUtils.getPublicRoot
    const originalLookup = FileUtils.getFileFromPath
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null

    try {
        const single = new packCore.VideoAssetPackItem(null, { url: "videos/missing.mp4" })
        assert.equal(single.getVideoFile(), null)

        const malformed = new packCore.VideoAssetPackItem(null, {
            url: ["x", 42, { type: "video/mp4" }, null]
        })
        assert.equal(malformed.getVideoFile(), null,
            "malformed entries must be skipped, never read as character arrays")
    } finally {
        FileUtils.getPublicRoot = original
        FileUtils.getFileFromPath = originalLookup
    }
})

test("Audio item data keeps string and array url forms intact", () => {
    const single = new packCore.AudioAssetPackItem(null, { url: "audio/boom.ogg" })
    assert.equal(single.getData().url, "audio/boom.ogg")

    const multi = new packCore.AudioAssetPackItem(null, { url: ["audio/boom.ogg", "audio/boom.mp3"] })
    assert.deepEqual(multi.getData().url, ["audio/boom.ogg", "audio/boom.mp3"])
})

test("Audio item file lookup with a non-string url is safe", async () => {
    await withEmptyFileUtils(async () => {
        const multi = new packCore.AudioAssetPackItem(null, { url: ["a.ogg", "a.mp3"] })

        // getFileFromAssetUrl must not throw on array data (resolves no file).
        assert.doesNotThrow(() => multi.getFileFromAssetUrl(multi.getData().url))
        assert.equal(multi.getFileFromAssetUrl(undefined), undefined)
    })
})

/* ================= spritesheet frame computation ================= */

function stubImage(width, height) {
    return {
        getWidth: () => width,
        getHeight: () => height,
        preloadSize: async () => 1
    }
}

function makeSpritesheetItem(frameConfig) {
    return new packCore.SpritesheetAssetPackItem(null, {
        type: "spritesheet",
        key: "sheet",
        url: "images/sheet.png",
        frameConfig
    })
}

test("Spritesheet frames are empty before the image is available", async () => {
    await withEmptyFileUtils(async () => {
        const item = makeSpritesheetItem({ frameWidth: 32, frameHeight: 32 })

        assert.deepEqual(item.getFrames(), [], "no image means no frames, never a throw")
        assert.equal(item.findFrame(0), undefined)
        assert.equal(item.findFrame("0"), undefined)
    })
})

test("Spritesheet frame lookup honors margin and spacing after the image loads", () => {
    const original = FileUtils.getImage
    const originalRoot = FileUtils.getPublicRoot
    const originalLookup = FileUtils.getFileFromPath
    FileUtils.getImage = () => stubImage(100, 100)
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null

    try {
        const item = makeSpritesheetItem({
            frameWidth: 30, frameHeight: 30, margin: 5, spacing: 10
        })

        const frames = item.getFrames()

        // 100x100 image, 30x30 cells, margin 5, spacing 10:
        // x = 5, 45 (85 would end at 115 + spacing > 100) => 2 columns, 2 rows.
        assert.equal(frames.length, 4)
        assert.deepEqual(frames.map(f => f.getName()), [0, 1, 2, 3])

        const [f0, f1, f2, f3] = frames
        assert.deepEqual(
            [f0.getFrameData().src.x, f0.getFrameData().src.y], [5, 5])
        assert.deepEqual(
            [f1.getFrameData().src.x, f1.getFrameData().src.y], [45, 5])
        assert.deepEqual(
            [f2.getFrameData().src.x, f2.getFrameData().src.y], [5, 45])
        assert.deepEqual(
            [f3.getFrameData().src.x, f3.getFrameData().src.y], [45, 45])

        assert.equal(item.findFrame(2), f2, "frame lookup by index must work after load")
    } finally {
        FileUtils.getImage = original
        FileUtils.getPublicRoot = originalRoot
        FileUtils.getFileFromPath = originalLookup
    }
})

test("Spritesheet without margin/spacing fills the image edge to edge", () => {
    const original = FileUtils.getImage
    const originalRoot = FileUtils.getPublicRoot
    const originalLookup = FileUtils.getFileFromPath
    FileUtils.getImage = () => stubImage(64, 32)
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null

    try {
        const item = makeSpritesheetItem({ frameWidth: 16, frameHeight: 16 })

        const frames = item.getFrames()
        assert.equal(frames.length, 8, "4 columns x 2 rows")
        assert.deepEqual(frames.map(f => f.getName()), [0, 1, 2, 3, 4, 5, 6, 7])
    } finally {
        FileUtils.getImage = original
        FileUtils.getPublicRoot = originalRoot
        FileUtils.getFileFromPath = originalLookup
    }
})

test("Spritesheet startFrame/endFrame window is respected", () => {
    const original = FileUtils.getImage
    const originalRoot = FileUtils.getPublicRoot
    const originalLookup = FileUtils.getFileFromPath
    FileUtils.getImage = () => stubImage(64, 16)
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null

    try {
        const item = makeSpritesheetItem({
            frameWidth: 16, frameHeight: 16, startFrame: 1, endFrame: 2
        })

        const frames = item.getFrames()
        // Phaser names window frames sequentially and keeps their sheet positions.
        assert.deepEqual(frames.map(f => f.getName()), [0, 1],
            "window frames are named sequentially, exactly like Phaser names them")
        assert.deepEqual(
            [frames[0].getFrameData().src.x, frames[0].getFrameData().src.y], [16, 0])
        assert.deepEqual(
            [frames[1].getFrameData().src.x, frames[1].getFrameData().src.y], [32, 0])
    } finally {
        FileUtils.getImage = original
        FileUtils.getPublicRoot = originalRoot
        FileUtils.getFileFromPath = originalLookup
    }
})

test("Spritesheet column count matches Phaser when spacing would overflow the row", () => {
    const original = FileUtils.getImage
    const originalRoot = FileUtils.getPublicRoot
    const originalLookup = FileUtils.getFileFromPath
    FileUtils.getImage = () => stubImage(84, 40)
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null

    try {
        // 84x40 image, 30x30 cells, margin 5, spacing 10:
        // Phaser: row = floor((84-5+10)/40) = 2, column = floor((40-5+10)/40) = 1.
        // The old parser skipped the second column (its fit check added spacing).
        const item = makeSpritesheetItem({
            frameWidth: 30, frameHeight: 30, margin: 5, spacing: 10
        })

        const frames = item.getFrames()
        assert.equal(frames.length, 2)
        assert.deepEqual(
            frames.map(f => [f.getFrameData().src.x, f.getFrameData().src.y]),
            [[5, 5], [45, 5]])
    } finally {
        FileUtils.getImage = original
        FileUtils.getPublicRoot = originalRoot
        FileUtils.getFileFromPath = originalLookup
    }
})

test("Spritesheet endFrame 0 selects exactly the first frame", () => {
    const original = FileUtils.getImage
    const originalRoot = FileUtils.getPublicRoot
    const originalLookup = FileUtils.getFileFromPath
    FileUtils.getImage = () => stubImage(64, 16)
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null

    try {
        const item = makeSpritesheetItem({
            frameWidth: 16, frameHeight: 16, endFrame: 0
        })

        const frames = item.getFrames()
        assert.equal(frames.length, 1, "endFrame 0 must stay 0, not become -1 (all frames)")
        assert.equal(frames[0].getName(), 0)
    } finally {
        FileUtils.getImage = original
        FileUtils.getPublicRoot = originalRoot
        FileUtils.getFileFromPath = originalLookup
    }
})

test("Spritesheet negative startFrame skips frames from the end like Phaser", () => {
    const original = FileUtils.getImage
    const originalRoot = FileUtils.getPublicRoot
    const originalLookup = FileUtils.getFileFromPath
    FileUtils.getImage = () => stubImage(64, 16)
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null

    try {
        const item = makeSpritesheetItem({
            frameWidth: 16, frameHeight: 16, startFrame: -2
        })

        const frames = item.getFrames()
        assert.deepEqual(frames.map(f => f.getName()), [0, 1])
        assert.deepEqual(frames.map(f => f.getFrameData().src.x), [32, 48])
    } finally {
        FileUtils.getImage = original
        FileUtils.getPublicRoot = originalRoot
        FileUtils.getFileFromPath = originalLookup
    }
})

test("Invalid spritesheet frameConfig produces no frames instead of throwing", () => {
    const original = FileUtils.getImage
    const originalRoot = FileUtils.getPublicRoot
    const originalLookup = FileUtils.getFileFromPath
    FileUtils.getImage = () => stubImage(100, 100)
    FileUtils.getPublicRoot = () => null
    FileUtils.getFileFromPath = () => null

    try {
        for (const bad of [
            { frameWidth: 0, frameHeight: 16 },
            { frameWidth: 16, frameHeight: -5 },
            { frameWidth: 16, frameHeight: 16, spacing: -1 },
            { frameWidth: 16, frameHeight: 16, margin: -3 }
        ]) {
            const item = makeSpritesheetItem(bad)
            assert.deepEqual(item.getFrames(), [], `invalid config ${JSON.stringify(bad)} must yield no frames`)
        }
    } finally {
        FileUtils.getImage = original
        FileUtils.getPublicRoot = originalRoot
        FileUtils.getFileFromPath = originalLookup
    }
})

/* ==================== code printer: undefined ==================== */

function buildCallOutput(generatorCtor, args) {
    const call = new coreCode.MethodCallCodeDOM("setOrigin", "this.sprite")
    for (const a of args) {
        call.arg(a)
    }
    const method = new coreCode.MethodDeclCodeDOM("execute")
    method.setBody([call])
    const klass = new coreCode.ClassDeclCodeDOM("MyPrefab")
    klass.getBody().push(method)
    klass.setExportClass(true)
    const unit = new coreCode.UnitCodeDOM([klass])
    return new generatorCtor(unit).generate("")
}

test("JS printer trims trailing undefined call arguments", () => {
    const out = buildCallOutput(coreCode.JavaScriptUnitCodeGenerator, ["0.5", "undefined", "undefined"])
    assert.match(out, /this\.sprite\.setOrigin\(0\.5\);/,
        "trailing undefined arguments must not reach the generated code")
})

test("JS printer keeps mid-list undefined call arguments", () => {
    const out = buildCallOutput(coreCode.JavaScriptUnitCodeGenerator, ["0.5", "undefined", "1"])
    assert.match(out, /this\.sprite\.setOrigin\(0\.5, undefined, 1\);/,
        "a mid-list undefined is a positional placeholder and must be preserved")
})

test("TS printer trims trailing undefined call arguments too", () => {
    const out = buildCallOutput(coreCode.TypeScriptUnitCodeGenerator, ["0.5", "undefined"])
    assert.match(out, /this\.sprite\.setOrigin\(0\.5\)/)
    assert.doesNotMatch(out, /setOrigin\(0\.5,\s*undefined\)/)
})

/* ============== json printer: undefined & defaults ============== */

test("colibri JSON copy drops undefined-valued keys", () => {
    const data = { a: 1, b: undefined, c: { d: undefined, e: 2 } }
    const copy = json.copy(data)

    assert.deepEqual(copy, { a: 1, c: { e: 2 } },
        "undefined values must never reach saved scene/pack JSON")
    assert.equal("b" in copy, false)
    assert.equal("d" in copy.c, false)
})

test("colibri JSON write never stores an undefined value", () => {
    const data = {}
    json.write(data, "x", undefined)
    json.write(data, "y", undefined, undefined)

    assert.equal("x" in data, false)
    assert.equal("y" in data, false)
})

/* ==================== thumbnail cache safety ==================== */

test("ThumbnailCache clearing is safe before the database exists", async () => {
    // window.localforage is not shimmed; the cache must tolerate clearing
    // before any content was requested (no database instance yet).
    const cache = new sceneUi.ThumbnailCache("test-thumb-db")

    await assert.doesNotReject(() => cache.clearCache())
})
