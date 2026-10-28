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
