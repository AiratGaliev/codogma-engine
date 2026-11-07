/**
 * Native MCP integration smoke test through the first-party stdio adapter.
 * Scene/Node/Prefab/Component/FX mutations are tested against the connected
 * SolidJS Host in promotion/browser acceptance, not by writing legacy files.
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { assertToolInputSchema } from "./mcp-schema-contract.mjs"

const cmd = process.argv[2] || "node"
const args = process.argv.slice(3)
const cwd = process.env.MCP_E2E_CWD || process.cwd()
const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], cwd })
let buffer = ""
let nextId = 1
const pending = new Map()

child.stdout.on("data", chunk => {
    buffer += chunk.toString("utf8")
    let index
    while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line) continue
        try {
            const message = JSON.parse(line)
            const waiter = pending.get(message.id)
            if (waiter) {
                pending.delete(message.id)
                waiter.resolve(message)
            }
        } catch { /* protocol diagnostics belong on stderr */ }
    }
})
child.stderr.on("data", chunk => process.stderr.write(chunk))
child.on("error", error => console.error("Could not start MCP client:", error.message))

function request(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (!pending.has(id)) return
            pending.delete(id)
            reject(new Error(`timeout: ${method}`))
        }, 30000)
        pending.set(id, {
            resolve: message => { clearTimeout(timeout); resolve(message) },
            reject
        })
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n", error => {
            if (!error || !pending.has(id)) return
            clearTimeout(timeout)
            pending.delete(id)
            reject(error)
        })
    })
}

function notify(method, params = {}) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")
}

async function callTool(name, args = {}) {
    const response = await request("tools/call", { name, arguments: args })
    if (response.error) throw new Error(`${name}: ${response.error.message}`)
    const result = response.result
    assert.ok(result && Array.isArray(result.content), `${name}: expected MCP content array`)
    for (const [index, item] of result.content.entries()) {
        assert.ok(item && typeof item.type === "string", `${name}: content[${index}] must have a type`)
        if (item.type === "text") assert.equal(typeof item.text, "string")
    }
    const output = result.content.map(item => item.type === "text" ? item.text : `[${item.type}]`).join("\n")
    if (result.isError) throw new Error(`${name}: ${output}`)
    return output
}

async function main() {
    const initialized = await request("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "codogma-native-mcp-ci", version: "1.0.0" }
    })
    assert.ok(initialized.result?.serverInfo, "MCP initialize must return serverInfo")
    notify("notifications/initialized")

    const listed = await request("tools/list")
    assert.ok(Array.isArray(listed.result?.tools), "MCP tools/list must return a tool list")
    const tools = listed.result.tools
    const names = new Set(tools.map(tool => tool.name))
    for (const name of [
        "scene-list", "scene-open", "scene-get-document", "scene-get-nodes",
        "scene-create-node", "scene-update-node", "scene-reparent-node",
        "prefab-list", "prefab-get", "prefab-create", "prefab-instantiate",
        "component-attach", "fx-add", "scene-capture-screenshot",
        "assets-get-available-textures", "assets-get-available-animations",
        "assets-get-available-spine-skeletons", "assets-get-tilemap-data"
    ]) assert.ok(names.has(name), `missing native MCP tool: ${name}`)
    for (const name of [
        "ide-get-all-scenes-in-project", "ide-create-new-scene",
        "scene-get-scene-data", "scene-add-game-objects",
        "ide-get-all-prefabs-in-project", "scene-declare-prefab-property"
    ]) assert.ok(!names.has(name), `legacy MCP tool must not be published: ${name}`)

    let nested = 0
    let optional = 0
    for (const tool of tools) {
        const stats = assertToolInputSchema(tool.name, tool.inputSchema)
        nested += stats.nestedSchemaCount
        optional += stats.optionalFieldCount
    }
    assert.ok(nested > 0 && optional > 0, "native registry must exercise nested and optional schemas")
    console.log(`tools/list: ${tools.length} tools; ${nested} nested fields and ${optional} optional fields validated`)

    const invalidTexture = await request("tools/call", {
        name: "assets-get-texture-size",
        arguments: { texture: { key: 12345 } }
    })
    assert.ok(invalidTexture.error || invalidTexture.result?.isError,
        "invalid asset arguments must be rejected")
    const unknown = await request("tools/call", {
        name: "not-a-codogma-tool",
        arguments: {}
    })
    assert.ok(unknown.error || unknown.result?.isError, "unknown tool must be rejected")

    const fileList = JSON.parse(await callTool("project-list-files", {}))
    assert.ok(Array.isArray(fileList.files), "project-list-files must return a files array")
    const textureList = JSON.parse(await callTool("assets-get-available-textures", {}))
    assert.ok(Array.isArray(textureList.textures), "texture discovery must return a textures array")

    if (process.env.MCP_E2E_WITH_EDITOR === "1") {
        assert.ok(process.env.PROJECT_DIR,
            "MCP_E2E_WITH_EDITOR=1 requires PROJECT_DIR to point to a native Project Model v1 fixture, not the frozen Colibri test workspace")
        const projectInfo = JSON.parse(await callTool("project-compile-info", {}))
        assert.ok(Array.isArray(projectInfo.scenes) && projectInfo.scenes.length > 0,
            "native MCP browser acceptance requires at least one Scene reference in project.json")
        const scenes = JSON.parse(await callTool("scene-list", {}))
        assert.ok(Array.isArray(scenes), "native scene-list must return a scene array")
        if (scenes.length > 0) {
            await callTool("scene-open", { path: scenes[0].path })
            const document = JSON.parse(await callTool("scene-get-document", {}))
            assert.equal(document.id, scenes[0].id)
            const nodes = JSON.parse(await callTool("scene-get-nodes", {}))
            assert.ok(Array.isArray(nodes), "native hierarchy must be an array")
            await callTool("scene-capture-screenshot", {})
        }
    } else {
        const noHost = await request("tools/call", { name: "scene-list", arguments: {} })
        assert.ok(noHost.result?.isError, "editor-dependent native tools must fail closed without a Host session")
        console.log("SolidJS Host acceptance skipped; no live editor session was requested.")
    }
    console.log("Native MCP integration smoke checks passed.")
}

main().catch(error => {
    console.error("Native MCP E2E FAIL:", error.stack || error.message)
    process.exitCode = 1
}).finally(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
})
