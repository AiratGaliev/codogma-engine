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
const packUi = globalThis.phasereditor2d.pack.ui
const coreCode = globalThis.phasereditor2d.scene.core.code
const sceneUi = globalThis.phasereditor2d.scene.ui
const json = globalThis.colibri.core.json
const FileUtils = globalThis.colibri.ui.ide.FileUtils
const controls = globalThis.colibri.ui.controls

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


/* ======================= blob URL lifecycle ======================= */

async function withBlobUrlStubs(fn) {
    const originalCreateElement = document.createElement
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const revoked = []
    const listeners = new Map()
    const image = {
        src: "",
        addEventListener(type, listener, options) {
            const entries = listeners.get(type) || []
            entries.push({ listener, options })
            listeners.set(type, entries)
        }
    }
    let nextUrlId = 0

    try {
        URL.createObjectURL = () => `blob:codogma-thumbnail-${++nextUrlId}`
        URL.revokeObjectURL = url => revoked.push(url)
        document.createElement = tag => tag === "img" ? image : originalCreateElement.call(document, tag)

        await fn({ image, listeners, revoked })
    } finally {
        document.createElement = originalCreateElement
        URL.createObjectURL = originalCreateObjectURL
        URL.revokeObjectURL = originalRevokeObjectURL
    }
}

test("Controls.createImageFromBlob revokes its object URL after load", async () => {
    await withBlobUrlStubs(async ({ image, listeners, revoked }) => {
        const result = controls.Controls.createImageFromBlob(new Blob(["thumbnail"]))
        assert.equal(result, image)
        assert.equal(image.src, "blob:codogma-thumbnail-1")

        for (const type of ["load", "error"]) {
            const entries = listeners.get(type) || []
            assert.equal(entries.length, 1, `one ${type} cleanup listener must be installed`)
            assert.equal(entries[0].options?.once, true, `${type} cleanup listener must be one-shot`)
        }

        const [loadListener] = listeners.get("load")
        loadListener.listener(new Event("load"))
        assert.deepEqual(revoked, ["blob:codogma-thumbnail-1"],
            "a successfully decoded thumbnail must release its object URL")
    })
})

test("Controls.createImageFromBlob revokes its object URL after error", async () => {
    await withBlobUrlStubs(async ({ image, listeners, revoked }) => {
        const result = controls.Controls.createImageFromBlob(new Blob(["broken thumbnail"]))
        assert.equal(result, image)
        assert.equal(image.src, "blob:codogma-thumbnail-1")

        const [errorListener] = listeners.get("error")
        assert.ok(errorListener, "failed image decoding must still have a cleanup listener")
        assert.equal(errorListener.options?.once, true)
        errorListener.listener(new Event("error"))

        assert.deepEqual(revoked, ["blob:codogma-thumbnail-1"],
            "a failed thumbnail must release its object URL too")
    })
})


test("ThumbnailCache recovers from IndexedDB read failures using a fresh image", async () => {
    const localForage = window["localforage"]
    assert.ok(localForage && typeof localForage.createInstance === "function",
        "the real localForage module must be loaded by the editor bundle loader")

    const originalCreateInstance = localForage.createInstance
    const originalLog = console.log
    const image = {
        preload: async () => controls.PreloadResult.NOTHING_LOADED,
        getImageElement: () => null
    }
    let createImageCalls = 0
    localForage.createInstance = () => ({
        getItem: async () => { throw new Error("simulated IndexedDB read failure") },
        setItem: async () => { throw new Error("read-failure fallback must not try to persist") },
        clear: async () => {}
    })
    console.log = () => {}

    try {
        class TestThumbnailCache extends sceneUi.ThumbnailCache {
            constructor() { super("test-thumbnail-read-failure") }
            computeObjectHash() { return "test-hash" }
            computeObjectKey() { return "test-object" }
            createObjectImage() { createImageCalls += 1; return image }
        }

        const cache = new TestThumbnailCache()
        const file = { id: "test-file" }
        await assert.doesNotReject(() => cache.preload(file))
        assert.equal(createImageCalls, 1, "cache read errors must fall back to a fresh image")
        assert.equal(cache.getContent(file), image, "fallback image must be retained by ContentCache")
    } finally {
        localForage.createInstance = originalCreateInstance
        console.log = originalLog
    }
})

test("ThumbnailCache recovers when persisting a successfully loaded thumbnail fails", async () => {
    const localForage = window["localforage"]
    assert.ok(localForage && typeof localForage.createInstance === "function",
        "the real localForage module must be loaded by the editor bundle loader")

    const originalCreateInstance = localForage.createInstance
    const originalCreateBlobFromImage = controls.Controls.createBlobFromImage
    const originalWarn = console.warn
    const imageElement = {}
    const image = {
        preload: async () => controls.PreloadResult.RESOURCES_LOADED,
        getImageElement: () => imageElement
    }
    let persistedKeys = 0
    localForage.createInstance = () => ({
        getItem: async () => null,
        setItem: async () => {
            persistedKeys += 1
            throw new Error("simulated IndexedDB write failure")
        },
        clear: async () => {}
    })
    controls.Controls.createBlobFromImage = async () => new Blob(["thumbnail"])
    console.warn = () => {}

    try {
        class TestThumbnailCache extends sceneUi.ThumbnailCache {
            constructor() { super("test-thumbnail-write-failure") }
            computeObjectHash() { return "test-hash" }
            computeObjectKey() { return "test-object" }
            createObjectImage() { return image }
        }

        const cache = new TestThumbnailCache()
        const file = { id: "test-file" }
        await assert.doesNotReject(() => cache.preload(file))
        assert.equal(persistedKeys, 1, "the cache must attempt to persist the generated blob")
        assert.equal(cache.getContent(file), image,
            "a successful preview must remain available when IndexedDB persistence fails")
    } finally {
        localForage.createInstance = originalCreateInstance
        controls.Controls.createBlobFromImage = originalCreateBlobFromImage
        console.warn = originalWarn
    }
})


test("AudioPreviewSection resolves string, array, and { type, url } descriptor URLs", () => {
    const sectionPrototype = packUi.properties.AudioPreviewSection.prototype
    const originalLookup = packCore.AssetPackUtils.getFileFromPackUrl
    const resolved = new Map([
        ["audio/single.ogg", "/project/audio/single.ogg"],
        ["audio/array.mp3", "/project/audio/array.mp3"],
        ["audio/descriptor.webm", "/project/audio/descriptor.webm"]
    ])
    packCore.AssetPackUtils.getFileFromPackUrl = (_pack, url) => {
        const resolvedUrl = resolved.get(url)
        return resolvedUrl ? { getUrl: () => resolvedUrl } : null
    }

    try {
        const run = data => {
            const section = Object.create(sectionPrototype)
            section.getSelectionFirstElement = () => new packCore.AudioAssetPackItem(null, data)
            return section.getSelectedAudioUrl()
        }

        assert.equal(run({ url: "audio/single.ogg" }), "/project/audio/single.ogg")
        assert.equal(run({ url: ["audio/missing.ogg", "audio/array.mp3"] }), "/project/audio/array.mp3")
        assert.equal(run({ url: [
            { type: "audio/ogg", url: "audio/descriptor.webm" }
        ] }), "/project/audio/descriptor.webm")
        assert.equal(run({ url: [{ type: "audio/ogg" }, 42, null, { url: " " }] }), null)
    } finally {
        packCore.AssetPackUtils.getFileFromPackUrl = originalLookup
    }
})


/* =================== sprite asset metadata / reimport =================== */

const spriteMetadata = packCore.SpriteAssetMetadata

function sourceFile(size = 1024, modTime = 1000) {
    return {
        getSize: () => size,
        getModTime: () => modTime,
        isFile: () => true
    }
}

function spriteFrameDescriptors(entries = [
    { key: "0", sourceRect: { x: 0, y: 0, width: 16, height: 16 } },
    { key: "1", sourceRect: { x: 16, y: 0, width: 16, height: 16 } }
]) {
    return entries
}

test("sprite metadata is versioned, serializable and keeps stable asset/frame IDs", () => {
    const itemData = {
        type: "spritesheet",
        url: "images/hero.png",
        frameConfig: { frameWidth: 16, frameHeight: 16 }
    }
    const first = spriteMetadata.ensure(itemData, sourceFile(), spriteFrameDescriptors())

    assert.equal(first.schemaVersion, 1)
    assert.match(first.assetId, /^[0-9a-f-]{36}$/)
    assert.match(first.frames["0"].id, /^[0-9a-f-]{36}$/)
    assert.match(first.frames["1"].id, /^[0-9a-f-]{36}$/)
    assert.equal(first.source.url, itemData.url)
    assert.equal(first.source.size, 1024)
    assert.equal(typeof first.source.signature, "string")

    itemData.codogma = first
    const restored = spriteMetadata.ensure(
        JSON.parse(JSON.stringify(itemData)),
        sourceFile(),
        spriteFrameDescriptors()
    )

    assert.equal(restored.assetId, first.assetId)
    assert.equal(restored.frames["0"].id, first.frames["0"].id)
    assert.equal(restored.frames["1"].id, first.frames["1"].id)
})

test("sprite metadata migrates unversioned metadata without dropping unknown fields", () => {
    const legacyData = {
        type: "image",
        url: "images/props.png",
        codogma: {
            assetId: "legacy-asset-id",
            customExtensionData: { keep: true }
        }
    }

    const migrated = spriteMetadata.ensure(legacyData, sourceFile(), [
        { key: "props", sourceRect: { x: 0, y: 0, width: 32, height: 24 } }
    ])

    assert.equal(migrated.schemaVersion, 1)
    assert.equal(migrated.assetId, "legacy-asset-id")
    assert.deepEqual(migrated.customExtensionData, { keep: true })
    assert.ok(migrated.frames.props.id)
})

test("sprite metadata refuses a future schema instead of overwriting it", () => {
    assert.throws(
        () => spriteMetadata.ensure(
            { codogma: { schemaVersion: 999 } },
            sourceFile(),
            spriteFrameDescriptors()
        ),
        /новее поддерживаемой/
    )
})

test("reimport preserves user settings when frame geometry is unchanged", () => {
    const previousData = {
        type: "spritesheet",
        url: "images/hero.png",
        frameConfig: { frameWidth: 16, frameHeight: 16 }
    }
    const metadata = spriteMetadata.ensure(previousData, sourceFile(), spriteFrameDescriptors())
    metadata.frames["0"].pivot = { x: 0.25, y: 0.8 }
    metadata.frames["0"].trim = { x: 1, y: 2, width: 12, height: 10 }
    metadata.frames["0"].collisionShapes = [
        { type: "rectangle", x: 1, y: 2, width: 12, height: 10 }
    ]
    previousData.codogma = metadata

    const updated = spriteMetadata.reconcile(
        previousData,
        { ...previousData, url: "images/hero.png" },
        spriteFrameDescriptors(),
        sourceFile(2048, 2000)
    )

    assert.equal(updated.assetId, metadata.assetId)
    assert.equal(updated.frames["0"].id, metadata.frames["0"].id)
    assert.deepEqual(updated.frames["0"].pivot, { x: 0.25, y: 0.8 })
    assert.deepEqual(updated.frames["0"].trim, { x: 1, y: 2, width: 12, height: 10 })
    assert.deepEqual(updated.frames["0"].collisionShapes, metadata.frames["0"].collisionShapes)
    assert.equal(updated.conflicts.length, 0)
    assert.notEqual(updated.source.signature, metadata.source.signature)
})

test("reimport archives customized frames and reports source-rectangle conflicts", () => {
    const previousData = {
        type: "spritesheet",
        url: "images/hero.png",
        frameConfig: { frameWidth: 16, frameHeight: 16 }
    }
    const metadata = spriteMetadata.ensure(previousData, sourceFile(), spriteFrameDescriptors())
    const previousFrameId = metadata.frames["0"].id
    metadata.frames["0"].pivot = { x: 0.2, y: 0.7 }
    metadata.frames["0"].collisionShapes = [
        { type: "circle", x: 8, y: 8, radius: 5 }
    ]
    previousData.codogma = metadata

    const updated = spriteMetadata.reconcile(
        previousData,
        previousData,
        [
            { key: "0", sourceRect: { x: 0, y: 0, width: 32, height: 16 } },
            { key: "1", sourceRect: { x: 32, y: 0, width: 32, height: 16 } }
        ],
        sourceFile(2048, 2000)
    )

    assert.notEqual(updated.frames["0"].id, previousFrameId)
    assert.equal(updated.orphanedFrames.length, 1)
    assert.equal(updated.orphanedFrames[0].id, previousFrameId)
    assert.equal(updated.conflicts.length, 1)
    assert.equal(updated.conflicts[0].type, "frame-geometry-changed")
    assert.deepEqual(updated.frames["0"].sourceRect, { x: 0, y: 0, width: 32, height: 16 })
})

test("reimport retains custom metadata for frames removed from a spritesheet", () => {
    const previousData = {
        type: "spritesheet",
        url: "images/hero.png",
        frameConfig: { frameWidth: 16, frameHeight: 16 }
    }
    const metadata = spriteMetadata.ensure(previousData, sourceFile(), spriteFrameDescriptors())
    metadata.frames["1"].trim = { x: 0, y: 0, width: 10, height: 10 }
    previousData.codogma = metadata

    const updated = spriteMetadata.reconcile(
        previousData,
        previousData,
        [spriteFrameDescriptors()[0]],
        sourceFile(512, 3000)
    )

    assert.equal(updated.frames["1"], undefined)
    assert.equal(updated.orphanedFrames.length, 1)
    assert.equal(updated.conflicts[0].type, "frame-removed")
})

test("collision geometry validation rejects malformed and degenerate shapes", () => {
    assert.equal(spriteMetadata.validateCollisionShapes([]), null)
    assert.equal(spriteMetadata.validateCollisionShapes([
        { type: "rectangle", x: 0, y: 0, width: 10, height: 8 },
        { type: "circle", x: 8, y: 8, radius: 4 },
        { type: "polygon", points: [[0, 0], [8, 0], [4, 8]] }
    ]), null)

    assert.match(
        spriteMetadata.validateCollisionShapes([{ type: "rectangle", x: -1, y: 0, width: 10, height: 8 }]),
        /x\/y >= 0/
    )
    assert.match(
        spriteMetadata.validateCollisionShapes([{ type: "circle", x: 0, y: 0, radius: 0 }]),
        /radius > 0/
    )
    assert.match(
        spriteMetadata.validateCollisionShapes([{ type: "polygon", points: [[0, 0], [1, 1]] }]),
        /минимум три точки/
    )
    assert.match(
        spriteMetadata.validateCollisionShapes([{ type: "unknown" }]),
        /неподдерживаемый тип/
    )
})


test("AssetPack.toJSON persists Codogma metadata with legacy entry fields", () => {
    const pack = new packCore.AssetPack(null, "")
    const item = new packCore.ImageAssetPackItem(pack, {
        type: "image",
        key: "icons",
        url: "images/icons.png"
    })
    const metadata = spriteMetadata.ensure(item.getData(), sourceFile(), [
        { key: "icons", sourceRect: { x: 0, y: 0, width: 64, height: 64 } }
    ])
    metadata.frames.icons.pivot = { x: 0.3, y: 0.75 }
    item.getData().codogma = metadata
    pack.addItem(item)

    const serialized = pack.toJSON()
    const restoredData = JSON.parse(JSON.stringify(serialized.section1.files[0]))
    const restoredItem = new packCore.ImageAssetPackItem(null, restoredData)

    assert.equal(restoredItem.getData().key, "icons")
    assert.equal(restoredItem.getData().url, "images/icons.png")
    assert.equal(restoredItem.getData().codogma.assetId, metadata.assetId)
    assert.equal(restoredItem.getData().codogma.frames.icons.id, metadata.frames.icons.id)
    assert.deepEqual(restoredItem.getData().codogma.frames.icons.pivot, { x: 0.3, y: 0.75 })
})

test("collision geometry validation rejects shapes outside the source frame", () => {
    assert.match(
        spriteMetadata.validateCollisionShapes(
            [{ type: "rectangle", x: 10, y: 0, width: 8, height: 8 }],
            16,
            16
        ),
        /находиться внутри кадра/
    )
    assert.match(
        spriteMetadata.validateCollisionShapes(
            [{ type: "circle", x: 14, y: 8, radius: 4 }],
            16,
            16
        ),
        /полностью находиться внутри кадра/
    )
    assert.match(
        spriteMetadata.validateCollisionShapes(
            [{ type: "polygon", points: [[0, 0], [16, 0], [18, 8]] }],
            16,
            16
        ),
        /находиться внутри кадра/
    )
})


function createSourceFile(width, height, modifiedAt = 1000) {
    return {
        width,
        height,
        getSize: () => width * height * 4,
        getModTime: () => modifiedAt,
        isFile: () => true
    }
}

function createTestFrame(key, x, y, width, height) {
    return {
        getName: () => String(key),
        getWidth: () => width,
        getHeight: () => height,
        getFrameData: () => ({
            src: { x, y, width, height }
        })
    }
}

class TestImageFrameItem extends packCore.ImageFrameContainerAssetPackItem {
    constructor(data, source) {
        super(null, data)
        this.source = source
        this._frames = null
    }

    getFileFromAssetUrl() {
        return this.source
    }

    resetCache() {
        super.resetCache()
    }

    async preload() {
        const config = this.getData().frameConfig
        const frameWidth = config.frameWidth
        const frameHeight = config.frameHeight
        const columns = Math.floor(this.source.width / frameWidth)
        const rows = Math.floor(this.source.height / frameHeight)

        this._frames = []

        for (let index = 0; index < columns * rows; index++) {
            const column = index % columns
            const row = Math.floor(index / columns)
            this._frames.push(createTestFrame(
                index,
                column * frameWidth,
                row * frameHeight,
                frameWidth,
                frameHeight
            ))
        }

        return controls.PreloadResult.NOTHING_LOADED
    }

    getFrames() {
        return this._frames || []
    }
}

test("Importer.reimportItem preserves metadata and surfaces frame geometry conflicts", async () => {
    const originalGetAllPacks = packCore.AssetPackUtils.getAllPacks
    packCore.AssetPackUtils.getAllPacks = async () => []

    try {
        const originalSource = createSourceFile(32, 32, 1000)
        const item = new TestImageFrameItem({
            type: "spritesheet",
            key: "hero",
            url: "images/hero.png",
            frameConfig: { frameWidth: 16, frameHeight: 16 }
        }, originalSource)
        await item.preload()

        const metadata = spriteMetadata.ensure(
            item.getData(),
            originalSource,
            spriteMetadata.describeFrames(item.getFrames())
        )
        metadata.frames["0"].pivot = { x: 0.25, y: 0.75 }
        metadata.frames["2"].collisionShapes = [
            { type: "rectangle", x: 1, y: 1, width: 12, height: 12 }
        ]
        item.getData().codogma = metadata

        const importer = new class extends packUi.importers.Importer {
            constructor() {
                super("spritesheet")
            }

            acceptFile() {
                return true
            }

            createItemData() {
                return {
                    url: "images/hero.png",
                    frameConfig: { frameWidth: 16, frameHeight: 16 }
                }
            }
        }()

        const pack = { getItems: () => [item] }
        // Expanding the sheet width from two to three columns changes the
        // source rectangle for frame index 2. The old authored geometry must
        // be archived rather than silently attached to the new cell.
        item.source = createSourceFile(48, 32, 2000)

        await importer.reimportItem(pack, item)

        const updated = item.getData().codogma
        assert.equal(updated.assetId, metadata.assetId)
        assert.deepEqual(updated.frames["0"].pivot, { x: 0.25, y: 0.75 })
        assert.equal(updated.conflicts.some(conflict =>
            conflict.type === "frame-geometry-changed" && conflict.frameKey === "2"), true)
        assert.equal(updated.orphanedFrames.some(frame =>
            frame.frameKey === "2" && frame.id === metadata.frames["2"].id), true)
        assert.equal(updated.frames["2"].sourceRect.x, 32)
    } finally {
        packCore.AssetPackUtils.getAllPacks = originalGetAllPacks
    }
})

test("Importer.reimportItem restores the original project data when the new source cannot be sliced", async () => {
    const originalGetAllPacks = packCore.AssetPackUtils.getAllPacks
    packCore.AssetPackUtils.getAllPacks = async () => []

    try {
        const source = createSourceFile(32, 32, 1000)
        const item = new TestImageFrameItem({
            type: "spritesheet",
            key: "hero",
            url: "images/hero.png",
            frameConfig: { frameWidth: 16, frameHeight: 16 }
        }, source)
        await item.preload()

        const metadata = spriteMetadata.ensure(
            item.getData(),
            source,
            spriteMetadata.describeFrames(item.getFrames())
        )
        metadata.frames["0"].pivot = { x: 0.2, y: 0.8 }
        item.getData().codogma = metadata

        const before = JSON.parse(JSON.stringify(item.getData()))
        const importer = new class extends packUi.importers.Importer {
            constructor() {
                super("spritesheet")
            }

            acceptFile() {
                return true
            }

            createItemData() {
                return {
                    url: "images/hero.png",
                    frameConfig: { frameWidth: 16, frameHeight: 16 }
                }
            }
        }()

        item.source = createSourceFile(0, 0, 2000)

        await assert.rejects(
            importer.reimportItem({ getItems: () => [item] }, item),
            /could not produce any valid frames/
        )
        assert.deepEqual(item.getData(), before)
    } finally {
        packCore.AssetPackUtils.getAllPacks = originalGetAllPacks
    }
})


test("sprite metadata frame map safely preserves special frame names", () => {
    const frames = Object.create(null)
    frames["__proto__"] = {
        id: "special-frame",
        sourceRect: { x: 0, y: 0, width: 8, height: 8 }
    }
    const itemData = JSON.parse(JSON.stringify({
        type: "atlas",
        url: "images/atlas.png",
        codogma: {
            schemaVersion: 1,
            assetId: "asset-with-special-frame",
            frames
        }
    }))

    const metadata = spriteMetadata.ensure(itemData, sourceFile(), [
        { key: "__proto__", sourceRect: { x: 0, y: 0, width: 8, height: 8 } },
        { key: "constructor", sourceRect: { x: 8, y: 0, width: 8, height: 8 } }
    ])

    assert.equal(Object.getPrototypeOf(metadata.frames), null)
    assert.equal(metadata.frames["__proto__"].id, "special-frame")
    assert.ok(metadata.frames.constructor.id)
    const restored = JSON.parse(JSON.stringify(metadata))
    assert.equal(restored.frames["__proto__"].id, "special-frame")
})

test("batch image import rolls back earlier entries when a later file fails", async () => {
    const originalGetAllPacks = packCore.AssetPackUtils.getAllPacks
    packCore.AssetPackUtils.getAllPacks = async () => []

    try {
        const imported = []
        const pack = {
            getItems: () => imported,
            createPackItem(data) {
                return {
                    getKey: () => data.key,
                    async preload() {
                        if (data.url === "broken.png") {
                            throw new Error("broken source")
                        }
                    },
                    async build() {},
                    resetCache() {}
                }
            },
            addItem(item) {
                imported.push(item)
            },
            deleteItem(item) {
                const index = imported.indexOf(item)
                if (index >= 0) imported.splice(index, 1)
            }
        }

        const importer = new class extends packUi.importers.Importer {
            constructor() {
                super("image")
            }

            acceptFile() {
                return true
            }

            createItemData(_pack, file) {
                return { url: file.getName() }
            }
        }()

        const file = name => ({
            getName: () => name,
            getNameWithoutExtension: () => name.replace(/\.[^.]+$/, "")
        })

        await assert.rejects(
            importer.autoImport(pack, [file("first.png"), file("broken.png")]),
            /broken source/
        )

        assert.equal(imported.length, 0,
            "the failed current entry and all earlier batch entries must be removed")
    } finally {
        packCore.AssetPackUtils.getAllPacks = originalGetAllPacks
    }
})


test("ImageFrameContainerAssetPackItem.resetCache clears stale frame thumbnails", () => {
    const item = new TestImageFrameItem({
        type: "spritesheet",
        key: "hero",
        url: "images/hero.png",
        frameConfig: { frameWidth: 16, frameHeight: 16 }
    }, createSourceFile(32, 32))

    const cache = packCore.ImageFrameContainerAssetPackItem._cache
    const oldThumbnail = { id: "old-source-thumbnail" }
    item._thumbnail = oldThumbnail
    item._thumbnailCacheKey = "image.png@1024@1000"
    cache.set(item._thumbnailCacheKey, oldThumbnail)

    item.resetCache()

    assert.equal(item.getThumbnail(), null)
    assert.equal(item._frames, null)
    assert.equal(cache.has("image.png@1024@1000"), false)
})


test("single Image Asset Pack metadata is resolved by its actual frame key", () => {
    const BaseImageExtension = globalThis.phasereditor2d.scene.ui.sceneobjects.BaseImageExtension
    const image = new packCore.ImageAssetPackItem(null, {
        type: "image",
        key: "hero",
        url: "images/hero.png",
        codogma: {
            schemaVersion: 1,
            assetId: "single-image-asset",
            frames: {
                "0": {
                    id: "single-image-frame",
                    sourceRect: { x: 0, y: 0, width: 16, height: 24 },
                    pivot: { x: 0.5, y: 1 },
                    crop: { x: 1, y: 2, width: 12, height: 18 },
                    trim: { x: 2, y: 1, width: 12, height: 20 },
                    collisionShapes: [
                        { type: "rectangle", x: 2, y: 1, width: 12, height: 20 }
                    ]
                }
            }
        }
    })
    image._frames = [{ getName: () => "0" }]

    const result = BaseImageExtension.prototype.getKeyFrameFromAsset.call({}, image)

    assert.equal(result.key, "hero")
    assert.equal(result.frame, undefined)
    assert.deepEqual(result.pivot, { x: 0.5, y: 1 })
    assert.deepEqual(result.crop, { x: 1, y: 2, width: 12, height: 18 })
    assert.deepEqual(result.sourceSize, { width: 16, height: 24 })
    assert.deepEqual(result.trim, {
        x: 2, y: 1, width: 12, height: 20,
        actualWidth: 16, actualHeight: 24
    })
    assert.deepEqual(result.collisionShapes, [
        { type: "rectangle", x: 2, y: 1, width: 12, height: 20 }
    ])
})


test("atlas frame descriptors preserve packed rect, source size and trim offset", () => {
    const descriptor = spriteMetadata.describeFrames([{
        getName: () => "hero",
        getWidth: () => 20,
        getHeight: () => 30,
        getFrameData: () => ({
            src: { x: 64, y: 96, w: 20, h: 30 },
            dst: { x: 5, y: 7, w: 20, h: 30 },
            srcSize: { x: 40, y: 48 }
        })
    }])[0]

    assert.deepEqual(descriptor, {
        key: "hero",
        sourceRect: { x: 64, y: 96, width: 20, height: 30 },
        sourceSize: { width: 40, height: 48 },
        trimRect: { x: 5, y: 7, width: 20, height: 30 }
    })
})

test("reimport reports atlas trim geometry changes even when packed rect is unchanged", () => {
    const previousData = {
        type: "atlas",
        url: "images/atlas.png",
        codogma: {
            schemaVersion: 1,
            assetId: "atlas-asset",
            frames: {
                hero: {
                    id: "hero-frame",
                    sourceRect: { x: 64, y: 96, width: 20, height: 30 },
                    sourceSize: { width: 40, height: 48 },
                    trimRect: { x: 5, y: 7, width: 20, height: 30 },
                    pivot: { x: 0.25, y: 0.75 }
                }
            },
            orphanedFrames: [],
            conflicts: []
        }
    }

    const updated = spriteMetadata.reconcile(
        previousData,
        previousData,
        [{
            key: "hero",
            sourceRect: { x: 64, y: 96, width: 20, height: 30 },
            sourceSize: { width: 48, height: 48 },
            trimRect: { x: 8, y: 7, width: 20, height: 30 }
        }],
        sourceFile(2048, 2000)
    )

    assert.equal(updated.frames.hero.id !== "hero-frame", true)
    assert.equal(updated.orphanedFrames[0].id, "hero-frame")
    assert.equal(updated.conflicts[0].type, "frame-geometry-changed")
    assert.deepEqual(updated.conflicts[0].previousSourceSize, { width: 40, height: 48 })
    assert.deepEqual(updated.conflicts[0].currentTrimRect, { x: 8, y: 7, width: 20, height: 30 })
})


test("collision polygon validation rejects duplicate and collinear points", () => {
    assert.match(
        spriteMetadata.validateCollisionShapes([{
            type: "polygon",
            points: [[0, 0], [8, 0], [8, 0], [0, 8]]
        }]),
        /минимум три различные точки/
    )

    assert.match(
        spriteMetadata.validateCollisionShapes([{
            type: "polygon",
            points: [[0, 0], [8, 8], [16, 16]]
        }]),
        /нулевую площадь/
    )
})

test("single-file importer imports a selected batch as separate Asset Pack entries", async () => {
    const originalGetAllPacks = packCore.AssetPackUtils.getAllPacks
    packCore.AssetPackUtils.getAllPacks = async () => []

    try {
        const items = []
        const pack = {
            getItems: () => items,
            createPackItem(data) {
                return {
                    data,
                    getKey: () => data.key,
                    async preload() {},
                    async build() {},
                    resetCache() {}
                }
            },
            addItem(item) { items.push(item) },
            deleteItem(item) {
                const index = items.indexOf(item)
                if (index >= 0) items.splice(index, 1)
            }
        }
        const importer = new class extends packUi.importers.Importer {
            constructor() { super("image") }
            acceptFile() { return true }
            createItemData(_pack, file) { return { url: file.getName() } }
        }()
        const files = ["hero.png", "enemy.png"].map(name => ({
            getName: () => name,
            getNameWithoutExtension: () => name.replace(/\.[^.]+$/, "")
        }))

        const imported = await importer.autoImport(pack, files)

        assert.equal(imported.length, 2)
        assert.deepEqual(imported.map(item => item.getKey()), ["hero", "enemy"])
        assert.equal(items.length, 2)
    } finally {
        packCore.AssetPackUtils.getAllPacks = originalGetAllPacks
    }
})

test("multi-file importer keeps a selected batch in one Asset Pack entry", async () => {
    const originalGetAllPacks = packCore.AssetPackUtils.getAllPacks
    packCore.AssetPackUtils.getAllPacks = async () => []

    try {
        const items = []
        const pack = {
            getItems: () => items,
            createPackItem(data) {
                return {
                    data,
                    getKey: () => data.key,
                    async preload() {},
                    async build() {},
                    resetCache() {}
                }
            },
            addItem(item) { items.push(item) },
            deleteItem(item) {
                const index = items.indexOf(item)
                if (index >= 0) items.splice(index, 1)
            }
        }
        const importer = new class extends packUi.importers.Importer {
            constructor() {
                super("atlas")
                this.setMultipleFiles(true)
            }
            acceptFile() { return true }
            createItemData(_pack, files) {
                return { url: files.map(file => file.getName()) }
            }
        }()
        const files = ["atlas.json", "atlas.png"].map(name => ({
            getName: () => name,
            getNameWithoutExtension: () => name.replace(/\.[^.]+$/, "")
        }))

        const imported = await importer.autoImport(pack, files)

        assert.equal(imported.length, 1)
        assert.equal(imported[0].getKey(), "atlas")
        assert.deepEqual(imported[0].data.url, ["atlas.json", "atlas.png"])
        assert.equal(items.length, 1)
    } finally {
        packCore.AssetPackUtils.getAllPacks = originalGetAllPacks
    }
})
