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


test("external Phaser asset inspection tools remain available", () => {
    const names = new Set(getBridgeToolsList().map(tool => tool.name))
    for (const name of [
        "assets-get-available-textures", "assets-get-texture-binary",
        "assets-get-available-animations", "assets-get-available-tilemaps",
        "assets-get-tilemap-data", "assets-get-available-spine-skeletons",
        "assets-get-available-spine-atlases", "assets-get-spine-skeleton-info",
        "assets-get-available-asset-packs", "assets-get-google-font-info"
    ]) assert.ok(names.has(name), `external asset tool must be preserved: ${name}`)
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

test("native editor operations require a connected Editor Host session", async () => {
    await assert.rejects(dispatchTool("scene-list", {}), /require a connected Editor Host session/)
})

test("scene-update-node exposes only validated native Node patch properties", () => {
    const tool = getBridgeToolsList().find(item => item.name === "scene-update-node")
    assert.ok(tool, "native Scene Node update MCP tool must be registered")
    const patch = tool.inputSchema.properties.patch
    assert.equal(patch.type, "object")
    assert.equal(patch.additionalProperties, false)
    assert.deepEqual(Object.keys(patch.properties).sort(), [
        "active", "align", "alpha", "assetId", "color", "depth", "fontFamily",
        "fontSize", "label", "name", "originX", "originY", "rotation", "scaleX",
        "scaleY", "text", "wordWrapWidth", "x", "y"
    ])
    assert.deepEqual(patch.properties.align.enum, ["left", "center", "right"])
    assert.equal(patch.properties.alpha.minimum, 0)
    assert.equal(patch.properties.alpha.maximum, 1)
})

