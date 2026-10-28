/**
 * Outline "Tile Map" duplicated-section regression tests.
 *
 * Defect: on scenes with a tilemap (e.g. test-typescript/scenes/AgentLevel.scene)
 * the Scene Editor Outline rendered the "Tile Map" section - and every plain
 * object inside it - TWICE.
 *
 * Root cause: the fork registers two ScenePlainObjectExtensions in the same
 * "Tile Map" category (the legacy Tilemap AND the editable EditableTilemap),
 * while ScenePlugin.getPlainObjectCategories() mapped the extensions without
 * de-duplicating. SceneEditorOutlineContentProvider.getRoots() pushes one root
 * per category, so the duplicated category string produced two identical
 * Outline roots, both listing the same tilemap plain objects.
 *
 * These tests load the REAL compiled editor bundles, register the extensions
 * exactly like the workbench start-up does, and pin the contract the Outline
 * relies on: one root per unique category.
 */

import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { loadEditorBundles } from "./editor-bundle-loader.cjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PLUGINS_DIR = path.join(ROOT, "source", "editor", "plugins")

loadEditorBundles(PLUGINS_DIR)

const colibri = globalThis.colibri
const scenePlugin = globalThis.phasereditor2d.scene.ScenePlugin.getInstance()

// The workbench calls registerExtensions() on start-up; the tests must do the
// same before any getPlainObject* query has data to return.
scenePlugin.registerExtensions(colibri.Platform.getExtensionRegistry())

test("plain-object categories are unique (Outline roots must not duplicate)", () => {

    const categories = scenePlugin.getPlainObjectCategories()

    assert.equal(new Set(categories).size, categories.length,
        `duplicated plain-object categories: ${JSON.stringify(categories)}`)
})

test("the 'Tile Map' category is exposed exactly once", () => {

    const categories = scenePlugin.getPlainObjectCategories()

    assert.equal(categories.filter(c => c === "Tile Map").length, 1,
        `the Outline renders one root per category, "Tile Map" must appear once, got ${JSON.stringify(categories)}`)
})

test("both tilemap plain-object extensions still share the 'Tile Map' category", () => {

    // The fork registers the legacy Tilemap and the editable EditableTilemap
    // as separate plain-object extensions in the same category. The dedup in
    // getPlainObjectCategories() exists precisely because of this setup - if
    // one of the extensions disappears this test stops guarding anything, and
    // if their categories diverge the "Add Object" UI splits unexpectedly.

    const tilemapTypes = scenePlugin
        .getPlainObjectExtensions()
        .filter(e => e.getCategory() === "Tile Map")
        .map(e => e.getTypeName())
        .sort()

    assert.deepEqual(tilemapTypes, ["EditableTilemap", "Tilemap"])
})

test("both tilemap plain-object types remain resolvable for scene reading", () => {

    assert.ok(scenePlugin.getPlainObjectExtensionByObjectType("Tilemap"),
        "legacy Tilemap plain-object type must stay registered")
    assert.ok(scenePlugin.getPlainObjectExtensionByObjectType("EditableTilemap"),
        "editable EditableTilemap plain-object type must stay registered")
})

test("dedup preserves the registration order of categories", () => {

    const categories = scenePlugin.getPlainObjectCategories()
    const rawOrder = scenePlugin.getPlainObjectExtensions().map(e => e.getCategory())
    const firstOccurrence = [...new Set(rawOrder)]

    assert.deepEqual(categories, firstOccurrence,
        "dedup must keep first-occurrence order: the Outline is a user-facing tree")
})
