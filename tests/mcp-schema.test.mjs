import test from "node:test"
import assert from "node:assert/strict"

import { dispatchTool, getBridgeToolsList } from "../server/mcp.mjs"
import { assertToolInputSchema } from "./mcp-schema-contract.mjs"

test("assets-get-texture-size schema requires one supported texture-key shape", () => {
    const tool = getBridgeToolsList().find(item => item.name === "assets-get-texture-size")
    assert.ok(tool, "texture-size MCP tool must be registered")
    assert.deepEqual(tool.inputSchema.anyOf, [
        { required: ["key"] },
        { required: ["texture"] }
    ])
    assert.deepEqual(tool.inputSchema.properties.texture.required, ["key"])
})

test("assets-get-texture-size rejects missing or non-string keys before touching project files", async () => {
    await assert.rejects(
        dispatchTool("assets-get-texture-size", {}),
        /Missing or invalid texture key/
    )
    await assert.rejects(
        dispatchTool("assets-get-texture-size", { key: 123 }),
        /Missing or invalid texture key/
    )
    await assert.rejects(
        dispatchTool("assets-get-texture-size", { texture: { key: "   " } }),
        /Missing or invalid texture key/
    )
})


test("native Editor MCP replaces unpublished legacy scene and prefab tools", () => {
    const names = new Set(getBridgeToolsList().map(tool => tool.name))
    for (const name of [
        "scene-list", "scene-get-active", "scene-open", "scene-save", "scene-create",
        "scene-get-document", "scene-get-nodes", "scene-create-node", "scene-update-node",
        "scene-delete-node", "scene-reparent-node", "scene-clear",
        "prefab-list", "prefab-get", "prefab-create", "prefab-instantiate",
        "component-attach", "component-detach", "component-set-enabled",
        "fx-add", "fx-update", "fx-remove", "scene-capture-screenshot"
    ]) assert.ok(names.has(name), `native MCP tool must be registered: ${name}`)
    for (const name of [
        "ide-get-all-scenes-in-project", "ide-create-new-scene", "ide-open-scene",
        "scene-get-scene-data", "scene-add-game-objects", "scene-add-plain-objects",
        "scene-add-editable-tilemap", "scene-enable-arcade-physics-body",
        "ide-create-new-prefab-scene", "scene-declare-prefab-property"
    ]) assert.ok(!names.has(name), `legacy MCP tool must not be exposed: ${name}`)
})

test("external Phaser asset inspection tools remain available", () => {
    const names = new Set(getBridgeToolsList().map(tool => tool.name))
    for (const name of [
        "assets-get-available-textures", "assets-get-texture-binary",
        "assets-get-available-animations", "assets-get-available-tilemaps",
        "assets-get-tilemap-data", "assets-get-available-spine-skeletons",
        "assets-get-available-spine-atlases", "assets-get-spine-skeleton-info",
        "assets-get-available-asset-packs", "assets-get-google-font-info"
    ]) assert.ok(names.has(name), `external asset tool must be preserved: ${name}`)
    assert.ok(!names.has("assets-get-spine-skin-image"),
        "legacy editor-rendered Spine skin preview must not be exposed without a native Host handler")
})

test("all built-in MCP input schemas have valid nested JSON Schema and optional fields", () => {
    const tools = getBridgeToolsList()
    assert.ok(tools.length > 0, "built-in MCP tools must be registered")
    const names = new Set()
    let nestedSchemaCount = 0
    let optionalFieldCount = 0

    for (const tool of tools) {
        assert.ok(!names.has(tool.name), `duplicate MCP tool name: ${tool.name}`)
        names.add(tool.name)
        const stats = assertToolInputSchema(tool.name, tool.inputSchema)
        nestedSchemaCount += stats.nestedSchemaCount
        optionalFieldCount += stats.optionalFieldCount
    }

    assert.ok(nestedSchemaCount > 0, "test must inspect nested schemas, not only tool roots")
    assert.ok(optionalFieldCount > 0, "test must inspect optional fields in nested schemas")
})

test("native editor operations fail closed when no SolidJS Host session is connected", async () => {
    await assert.rejects(dispatchTool("scene-list", {}), /not connected to an active MCP bridge session/)
})
