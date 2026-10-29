import test from "node:test"
import assert from "node:assert/strict"

import { dispatchTool, getBridgeToolsList } from "../server/mcp.mjs"

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
