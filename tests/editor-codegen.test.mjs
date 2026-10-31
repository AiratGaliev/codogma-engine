/**
 * Codegen / serialization / scene-data migration regression tests.
 *
 * These tests load the REAL compiled editor bundles (Phaser 4 runtime + all
 * editor plugins, in the server's plugin.json priority order) with a minimal
 * DOM shim, and exercise the same classes the editor runs in the browser:
 *
 *   - colibri.core.json read/write/copy (property serialization primitives)
 *   - phasereditor2d.scene.core.json.Serializer (prefab-aware property reads)
 *   - the v1→v2 / v2→v3 scene-data migrations (including the class of defect
 *     fixed in this branch: one broken prefab reference aborting the whole
 *     origin migration)
 *   - the code-DOM code generators (JavaScript + TypeScript output)
 *   - Particle Emitter texture fallback and frame configuration lifecycle
 *   - variable-name / JSON formatting helpers used by codegen
 */

import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { loadEditorBundles } from "./editor-bundle-loader.cjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PLUGINS_DIR = path.join(ROOT, "source", "editor", "plugins")

loadEditorBundles(PLUGINS_DIR)

const json = globalThis.colibri.core.json
const coreJson = globalThis.phasereditor2d.scene.core.json
const coreCode = globalThis.phasereditor2d.scene.core.code
const migrations = globalThis.phasereditor2d.scene.core.migrations
const isValidSceneData = coreJson.isValidSceneData
const SceneSettings = globalThis.phasereditor2d.scene.core.json.SceneSettings

/* ===================== property serialization ===================== */

test("colibri.core.json write/read keeps values and honors defaults", () => {
    const data = {}

    json.write(data, "alpha", 0.5)
    json.write(data, "tint", 0xff0000)
    json.write(data, "label", "hero", "default-label")
    json.write(data, "visible", true, true) // equals default → dropped

    assert.equal(json.read(data, "alpha"), 0.5)
    assert.equal(json.read(data, "tint"), 0xff0000)
    assert.equal(json.read(data, "label"), "hero")
    assert.equal(json.read(data, "visible", true), true)
    assert.equal("visible" in data, false, "values equal to the default must not be stored")
    assert.equal(json.read(data, "missing", 42), 42, "missing values must fall back to the default")
})

test("colibri.core.json copy produces deep-independent data", () => {
    const data = { nested: { list: [1, 2, { deep: true }] } }

    const copy = json.copy(data)

    assert.deepEqual(copy, data)
    copy.nested.list[2].deep = false
    assert.equal(data.nested.list[2].deep, true, "mutations of the copy must not leak into the source")
})

test("scene Serializer reads typed data without a prefab", () => {
    const serializer = new coreJson.Serializer({
        type: "Image",
        label: "dino",
        x: 10
    })

    assert.equal(serializer.getType(), "Image")
    assert.equal(serializer.read("x", 0), 10)
    assert.equal(serializer.read("y", 0), 0, "missing properties must fall back")
    assert.equal(serializer.isUnlocked("x"), true, "plain objects are fully unlocked")
})

test("scene Serializer.write keeps non-default values and drops default ones", () => {
    const data = { type: "Image", label: "dino" }
    const serializer = new coreJson.Serializer(data)

    serializer.write("visible", true, true) // equals default → dropped
    serializer.write("visible", false, true) // differs from default → kept

    assert.equal(data.visible, false)
})

test("legacy Box2D debug flag round-trips without enabling the current generated debug-draw option", () => {
    const settings = new SceneSettings()
    settings.readJSON({ box2dDebugDraw: true })

    assert.equal(settings.box2dDebugDraw, true,
        "old scene metadata must remain readable for compatibility")
    assert.equal(settings.box2dSceneGenerateDebugCode, false,
        "the legacy flag must not silently change the new generator option")

    const data = settings.toJSON()
    assert.equal(data.box2dDebugDraw, true,
        "the legacy setting must survive serialization")
})

/* ===================== scene-data migrations ===================== */

function makeV2Scene() {
    return {
        id: "test-scene",
        meta: { app: "test", version: 2 },
        type: "Scene",
        displayList: [
            { type: "Text", id: "text-1", label: "text-1" },
            { type: "Image", id: "img-1", label: "img-1" },
            {
                type: "Container",
                id: "container-1",
                list: [{ type: "BitmapText", id: "bmt-1", label: "bmt-1" }]
            }
        ]
    }
}

test("OriginMigration_v2_to_v3 fixes Text/BitmapText origins of v2 scenes", () => {
    const migration = new migrations.OriginMigration_v2_to_v3()
    const scene = makeV2Scene()

    migration.migrate(scene)

    assert.equal(scene.displayList[0].originX, 0.5)
    assert.equal(scene.displayList[0].originY, 0.5, "v2 Text must gain the v3 origin default")
    assert.equal(scene.displayList[1].originX, undefined, "non-Text objects must not gain origin")
    assert.equal(scene.displayList[2].list[0].originY, 0.5, "nested lists must be traversed")
})

test("OriginMigration_v2_to_v3 preserves explicit origins and skips v3 scenes", () => {
    const migration = new migrations.OriginMigration_v2_to_v3()

    const v2 = makeV2Scene()
    v2.displayList[0].originX = 0
    migration.migrate(v2)
    assert.equal(v2.displayList[0].originX, 0, "explicit origins must be kept")

    const v3 = makeV2Scene()
    v3.meta.version = 3
    migration.migrate(v3)
    assert.equal(v3.displayList[0].originX, undefined, "v3 scenes must not be migrated again")
})

test("OriginMigration_v2_to_v3 survives a broken prefab reference (regression)", () => {
    // This is the class of defect fixed in this branch: during batch indexing a
    // scene referencing a prefab sorted later aborted the whole origin
    // migration ("Cannot find scene prefab with id"). A missing prefab entry
    // must only skip its own object, never the rest of the scene.
    const migration = new migrations.OriginMigration_v2_to_v3()
    const scene = makeV2Scene()

    scene.displayList.splice(1, 0, {
        type: "Image",
        id: "broken",
        label: "broken-prefab-user",
        prefabId: "missing-prefab-id"
    })

    assert.doesNotThrow(() => migration.migrate(scene),
        "one broken prefab reference must not abort the migration")

    assert.equal(scene.displayList[0].originX, 0.5, "the Text before the broken object must still be migrated")
    assert.equal(scene.displayList[2].originX, undefined)
    assert.equal(scene.displayList[3].list[0].originY, 0.5, "objects after the broken entry must still be migrated")
})

test("UnlockPositionMigration_v1_to_v2 unlocks x/y of prefab instances", () => {
    const migration = new migrations.UnlockPositionMigration_v1_to_v2()

    const v1 = {
        meta: { version: 1 },
        displayList: [
            { type: "Image", id: "a", prefabId: "prefab-1" },
            { type: "Image", id: "b" }
        ]
    }
    migration.migrate(v1)

    assert.deepEqual(v1.displayList[0].unlock, ["x", "y"])
    assert.equal(v1.displayList[1].unlock, undefined)

    const v2 = { meta: { version: 2 }, displayList: [{ type: "Image", id: "a", prefabId: "p" }] }
    migration.migrate(v2)
    assert.equal(v2.displayList[0].unlock, undefined, "v2 scenes must not be touched")
})

test("TextAlignMigration converts numeric align to the named value", () => {
    const migration = new migrations.TextAlignMigration()
    const alignProp = globalThis.phasereditor2d.scene.ui.sceneobjects.TextComponent.align

    const scene = {
        displayList: [
            { type: "Text", id: "t1", align: 1 },
            { type: "Text", id: "t2", align: alignProp.defValue },
            { type: "Image", id: "i1", align: 1 }
        ]
    }
    migration.migrate(scene)

    assert.equal(scene.displayList[0].align, alignProp.values[1],
        "numeric align must become the named value")
    assert.equal(scene.displayList[1].align, alignProp.defValue)
    assert.equal(scene.displayList[2].align, 1, "only Text objects are migrated")
})

/* ========================= code generation ========================= */

function buildSampleUnit() {
    const call = new coreCode.MethodCallCodeDOM("add", "this.scene")
    call.arg("this.sprite")
    call.arg("1.5")

    const method = new coreCode.MethodDeclCodeDOM("execute")
    method.setBody([call])

    const field = new coreCode.FieldDeclCodeDOM("sprite", "Phaser.GameObjects.Sprite", false)

    const klass = new coreCode.ClassDeclCodeDOM("MyPrefab")
    klass.getBody().push(method, field)
    klass.setExportClass(true)

    return new coreCode.UnitCodeDOM([klass])
}

test("JavaScript unit generator emits class, method and calls", () => {
    const unit = buildSampleUnit()
    const output = new coreCode.JavaScriptUnitCodeGenerator(unit).generate("")

    assert.match(output, /export default class MyPrefab/, "exported class declaration must be emitted")
    assert.match(output, /this\.scene\.add\(this\.sprite, 1\.5\);/, "method call with args must be emitted")
    assert.match(output, /execute\(\)/, "method declaration must be emitted")
})

test("TypeScript unit generator emits typed fields", () => {
    const unit = buildSampleUnit()
    const output = new coreCode.TypeScriptUnitCodeGenerator(unit).generate("")

    assert.match(output, /class MyPrefab/)
    assert.match(output, /sprite: Phaser\.GameObjects\.Sprite/, "TypeScript output must carry field type annotations")
})

test("Box2D world ID expression preserves legacy variables and template-owned scene/prefab IDs", () => {
    const component = globalThis.phasereditor2d.scene.ui.sceneobjects.Box2DBodyComponent;

    assert.equal(component.getWorldIdExpression(false, false), "box2dWorldId");
    assert.equal(component.getWorldIdExpression(false, true), "box2dWorldId",
        "legacy prefab code must use the world variable created in the consuming scene");
    assert.equal(component.getWorldIdExpression(true, false), "this.worldId");
    assert.equal(component.getWorldIdExpression(true, true), "this.scene.worldId");
})

test("ES module import paths use emitted .js extensions for scene and TypeScript sources", () => {
    const FilePath = globalThis.colibri.core.io.FilePath;
    const codeUtils = globalThis.phasereditor2d.ide.core.code;
    const root = new FilePath(null, {
        name: "project",
        isFile: false,
        size: 0,
        modTime: 0,
        children: [{
            name: "scenes",
            isFile: false,
            size: 0,
            modTime: 0,
            children: [
                { name: "main.scene", isFile: true, size: 0, modTime: 0 },
                { name: "prefabs", isFile: false, size: 0, modTime: 0, children: [
                    { name: "enemy.scene", isFile: true, size: 0, modTime: 0 }
                ] },
                { name: "components", isFile: false, size: 0, modTime: 0, children: [
                    { name: "Player.ts", isFile: true, size: 0, modTime: 0 },
                    { name: "Helper.js", isFile: true, size: 0, modTime: 0 }
                ] }
            ]
        }]
    });

    const scenes = root.getFile("scenes");
    const scene = scenes.getFile("main.scene");
    const prefab = scenes.getFile("prefabs").getFile("enemy.scene");
    const component = scenes.getFile("components").getFile("Player.ts");
    const helper = scenes.getFile("components").getFile("Helper.js");

    assert.equal(codeUtils.getImportPath(scene, prefab, true).importPath, "./prefabs/enemy.js");
    assert.equal(codeUtils.getImportPath(scene, component, true).importPath, "./components/Player.js");
    assert.equal(codeUtils.getImportPath(scene, helper, true).importPath, "./components/Helper.js");
    assert.equal(codeUtils.getImportPath(scene, prefab, false).importPath, "./prefabs/enemy");
})

/* =========================== code helpers =========================== */

test("formatToValidVarName produces identifier-safe names", () => {
    assert.equal(coreCode.formatToValidVarName("Dino"), "dino", "leading char is lowercased")
    assert.equal(coreCode.formatToValidVarName("my sprite 2!"), "my_sprite_2_", "non-alphanumerics become underscores")
})

test("stringifyJSON formats scene data deterministically", () => {
    const data = { b: 1, a: { c: [1, 2] } }

    const text = coreCode.stringifyJSON(data)
    const text2 = coreCode.stringifyJSON(data)

    assert.equal(text, text2, "formatting must be deterministic")
    assert.match(text, /b: 1/, "output is JavaScript-like, not strict JSON")
    assert.match(text, /c: \[1, 2\]/)
    // raw expressions survive serialization (e.g. constructor call arguments):
    const raw = coreCode.stringifyJSON({ x: "@code:new Phaser.Math.Vector2(1, 2)" })
    assert.match(raw, /x: new Phaser\.Math\.Vector2\(1, 2\)/,
        "@code: markers must be emitted as raw expressions")
    // __extends keys become spread entries (prefab inheritance support):
    const spread = coreCode.stringifyJSON({ __extends: "PREFAB_PARENT", y: 2 })
    assert.match(spread, /\.\.\.PREFAB_PARENT/, "__extends entries must be emitted as spreads")
})


test("SceneFinder rejects syntactically valid but structurally invalid scene data", () => {
    assert.equal(isValidSceneData(null), false)
    assert.equal(isValidSceneData([]), false)
    assert.equal(isValidSceneData({ id: "missing-display-list" }), false)
    assert.equal(isValidSceneData({ displayList: {} }), false)
    assert.equal(isValidSceneData({ displayList: [], settings: null }), false)
    assert.equal(isValidSceneData({ displayList: [], settings: [] }), false)

    assert.equal(isValidSceneData({ displayList: [] }), true)
    assert.equal(isValidSceneData({ displayList: [], settings: {} }), true)
})


/* ====================== Particle Emitter codegen ====================== */

const sceneObjects = globalThis.phasereditor2d.scene.ui.sceneobjects

function buildParticleEmitterFactoryArgs(texture, frame) {
    const emitter = {
        x: 12,
        y: 34,
        configTexture: texture,
        configFrame: frame
    }

    // Exercise the real compiler-config builder without constructing Phaser's
    // runtime emitter (which requires a live Scene and WebGL/DOM services).
    const support = Object.create(sceneObjects.ParticleEmitterEditorSupport.prototype)
    support.getObject = () => emitter
    support.isUnlockedProperty = () => false
    support.isPrefabInstance = () => false
    emitter.getEditorSupport = () => support

    const builder = Object.create(sceneObjects.ParticleEmitterCodeDOMBuilder.prototype)
    const call = builder.buildCreateObjectWithFactoryCodeDOM({
        obj: emitter,
        gameObjectFactoryExpr: "this.add"
    })

    return call.getArgs()
}

test("Particle Emitter codegen uses Phaser's __DEFAULT texture and preserves configured frames", () => {
    const args = buildParticleEmitterFactoryArgs(undefined, [0, 1])

    assert.deepEqual(args.slice(0, 2), ["12", "34"])
    assert.equal(args[2], '"__DEFAULT"', "unset texture must use Phaser's default particle texture")
    assert.match(args[3], /\bframe\b/, "configured frames must be included in generated config")
    assert.match(args[3], /\[0, 1\]/, "generated config must keep the complete frame list")
})

test("Particle Emitter codegen omits removed frames and uses an explicit texture key", () => {
    const configuredArgs = buildParticleEmitterFactoryArgs("spark", [2])
    const clearedArgs = buildParticleEmitterFactoryArgs("spark", [])

    assert.equal(configuredArgs[2], '"spark"')
    assert.match(configuredArgs[3], /\bframe\b/)
    assert.match(configuredArgs[3], /\[2\]/)

    assert.equal(clearedArgs[2], '"spark"')
    assert.doesNotMatch(clearedArgs[3], /\bframe\b/,
        "clearing the frame selection must remove the stale frame config from generated code")
})


/* ================= asset-authored Arcade geometry ================= */

test("Arcade Body applies a single rectangle from sprite asset metadata", () => {
    const ArcadeComponent = globalThis.phasereditor2d.scene.ui.sceneobjects.ArcadeComponent
    let size
    let offset

    const body = {
        setSize: (width, height, center) => { size = { width, height, center } },
        setOffset: (x, y) => { offset = { x, y } }
    }
    const obj = {
        body,
        getEditorSupport: () => ({
            hasComponent: () => true,
            getComponent: () => ({
                getTextureKeys: () => ({
                    collisionShapes: [{ type: "rectangle", x: 3, y: 4, width: 12, height: 10 }]
                })
            })
        })
    }

    assert.equal(ArcadeComponent.applyAssetCollisionGeometry(obj), true)
    assert.equal(body.__isCircle, false)
    assert.deepEqual(size, { width: 12, height: 10, center: false })
    assert.deepEqual(offset, { x: 3, y: 4 })
})

test("Arcade Body applies a single circle from sprite asset metadata", () => {
    const ArcadeComponent = globalThis.phasereditor2d.scene.ui.sceneobjects.ArcadeComponent
    let radius
    let offset

    const body = {
        setCircle: value => { radius = value },
        setOffset: (x, y) => { offset = { x, y } }
    }
    const obj = {
        body,
        getEditorSupport: () => ({
            hasComponent: () => true,
            getComponent: () => ({
                getTextureKeys: () => ({
                    collisionShapes: [{ type: "circle", x: 12, y: 10, radius: 5 }]
                })
            })
        })
    }

    assert.equal(ArcadeComponent.applyAssetCollisionGeometry(obj), true)
    assert.equal(body.__isCircle, true)
    assert.equal(body.__radius, 5)
    assert.equal(radius, 5)
    assert.deepEqual(offset, { x: 7, y: 5 })
})

test("Arcade Body does not approximate polygon or compound asset collision geometry", () => {
    const ArcadeComponent = globalThis.phasereditor2d.scene.ui.sceneobjects.ArcadeComponent
    const body = {
        setSize: () => { throw new Error("polygon must not be converted to a rectangle") },
        setCircle: () => { throw new Error("polygon must not be converted to a circle") },
        setOffset: () => { throw new Error("unsupported geometry must not mutate the body") }
    }

    for (const collisionShapes of [
        [{ type: "polygon", points: [[0, 0], [16, 0], [8, 16]] }],
        [
            { type: "rectangle", x: 0, y: 0, width: 8, height: 8 },
            { type: "circle", x: 8, y: 8, radius: 4 }
        ]
    ]) {
        const obj = {
            body,
            getEditorSupport: () => ({
                hasComponent: () => true,
                getComponent: () => ({ getTextureKeys: () => ({ collisionShapes }) })
            })
        }

        assert.equal(ArcadeComponent.applyAssetCollisionGeometry(obj), false)
    }
})


test("TextureComponent applies asset crop and trim to Phaser frame and object", () => {
    const TextureComponent = globalThis.phasereditor2d.scene.ui.sceneobjects.TextureComponent
    const calls = { texture: null, origin: null, crop: null, trim: null, updated: false }
    const originalFrame = {
        setTrim: () => { throw new Error("shared Texture Manager frame must not be mutated") },
        clone() {
            return {
                setTrim: (...args) => { calls.trim = args }
            }
        }
    }
    const obj = {
        originX: 0.2,
        originY: 0.8,
        frame: originalFrame,
        setTexture: (key, frameKey) => {
            calls.texture = [key, frameKey]
            obj.frame = originalFrame
        },
        setFrame: (frame, updateSize, updateOrigin) => {
            calls.setFrame = [frame, updateSize, updateOrigin]
            obj.frame = frame
        },
        setOrigin: (x, y) => { calls.origin = [x, y] },
        setCrop: (...args) => { calls.crop = args },
        getEditorSupport: () => ({
            hasComponent: () => true,
            onUpdateAfterSetTexture: () => { calls.updated = true }
        })
    }
    const component = Object.create(TextureComponent.prototype)
    component._textureKeys = {}
    component.getObject = () => obj

    component.setTextureKeys({
        key: "hero",
        frame: 2,
        crop: { x: 1, y: 2, width: 12, height: 10 },
        trim: { actualWidth: 16, actualHeight: 16, x: 2, y: 3, width: 10, height: 9 }
    })

    assert.deepEqual(calls.texture, ["hero", 2])
    assert.deepEqual(calls.origin, [0.2, 0.8])
    assert.deepEqual(calls.crop, [1, 2, 12, 10])
    assert.deepEqual(calls.trim, [16, 16, 2, 3, 10, 9])
    assert.equal(calls.setFrame[1], true)
    assert.equal(calls.setFrame[2], false)
    assert.notEqual(calls.setFrame[0], originalFrame)
    assert.equal(calls.updated, true)
})

test("TextureComponent rejects trim metadata when the Phaser Frame cannot apply it", () => {
    const TextureComponent = globalThis.phasereditor2d.scene.ui.sceneobjects.TextureComponent
    const obj = {
        originX: 0.5,
        originY: 0.5,
        frame: {},
        setTexture() {},
        setOrigin() {},
        getEditorSupport: () => ({
            hasComponent: () => false,
            onUpdateAfterSetTexture() {}
        })
    }
    const component = Object.create(TextureComponent.prototype)
    component._textureKeys = {}
    component.getObject = () => obj

    assert.throws(() => component.setTextureKeys({
        key: "hero",
        trim: { actualWidth: 16, actualHeight: 16, x: 1, y: 1, width: 14, height: 14 }
    }), /cannot apply isolated trim metadata/)
})


/* ================= retained 9-slice and tiled draw authoring ================= */

test("NineSlice Inspector properties preserve the other slice edges", () => {
    const NineSliceComponent = globalThis.phasereditor2d.scene.ui.sceneobjects.NineSliceComponent
    const calls = []
    const obj = {
        width: 120,
        height: 80,
        leftWidth: 8,
        rightWidth: 12,
        topHeight: 6,
        bottomHeight: 10,
        setSlices: (...values) => calls.push(values)
    }

    NineSliceComponent.leftWidth.setValue(obj, 14)
    NineSliceComponent.rightWidth.setValue(obj, 16)
    NineSliceComponent.topHeight.setValue(obj, 9)
    NineSliceComponent.bottomHeight.setValue(obj, 11)

    assert.deepEqual(calls, [
        [120, 80, 14, 12, 6, 10],
        [120, 80, 8, 16, 6, 10],
        [120, 80, 8, 12, 9, 10],
        [120, 80, 8, 12, 6, 11]
    ])
})

test("TileSprite Inspector stores repeat position and scale independently", () => {
    const TileSpriteComponent = globalThis.phasereditor2d.scene.ui.sceneobjects.TileSpriteComponent
    const tile = {
        tilePositionX: 0,
        tilePositionY: 0,
        tileScaleX: 1,
        tileScaleY: 1
    }

    TileSpriteComponent.tilePositionX.setValue(tile, 24)
    TileSpriteComponent.tilePositionY.setValue(tile, 12)
    TileSpriteComponent.tileScaleX.setValue(tile, 0.5)
    TileSpriteComponent.tileScaleY.setValue(tile, 2)

    assert.deepEqual(tile, {
        tilePositionX: 24,
        tilePositionY: 12,
        tileScaleX: 0.5,
        tileScaleY: 2
    })
})


test("TextureComponent codegen clones a shared frame before applying trim", () => {
    const TextureComponent = globalThis.phasereditor2d.scene.ui.sceneobjects.TextureComponent
    const trim = {
        actualWidth: 32,
        actualHeight: 24,
        x: 2,
        y: 1,
        width: 28,
        height: 20
    }
    const support = {
        isNestedPrefabInstance: () => false,
        getComponent: () => ({ getTextureKeys: () => ({ trim }) })
    }
    const obj = {
        getEditorSupport: () => support
    }
    const args = {
        objectVarName: "sprite",
        statements: []
    }

    TextureComponent.prototype.buildSetObjectPropertiesCodeDOM.call(
        { getObject: () => obj },
        args
    )

    assert.deepEqual(
        args.statements.map(statement => ({
            method: statement.getMethodName(),
            args: statement.getArgs()
        })),
        [
            { method: "setFrame", args: ["sprite.frame.clone()", "true", "false"] },
            { method: "setTrim", args: ["32", "24", "2", "1", "28", "20"] }
        ]
    )
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
    image._frames = [createTestFrame("0", 0, 0, 16, 24)]

    const result = BaseImageExtension.prototype.getKeyFrameFromAsset.call({}, image)

    assert.equal(result.key, "hero")
    assert.equal(result.frame, undefined)
    assert.equal(result.metadataFrameKey, undefined)
    assert.deepEqual(result.pivot, { x: 0.5, y: 1 })
    assert.deepEqual(result.crop, { x: 1, y: 2, width: 12, height: 18 })
    assert.deepEqual(result.trim, {
        x: 2, y: 1, width: 12, height: 20,
        actualWidth: 16, actualHeight: 24
    })
    assert.deepEqual(result.collisionShapes, [
        { type: "rectangle", x: 2, y: 1, width: 12, height: 20 }
    ])
})
