/**
 * Minimal MCP stdio client — E2E test driver for the official
 * @phaserjs/editor-mcp-server package running against our bridge.
 * Run: node tests/mcp-e2e-test.mjs node server/mcp-launcher.mjs
 */
import { spawn } from "child_process"

const cmd = process.argv[2] || "node"
const args = process.argv.slice(3)

const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], cwd: "/home/z/my-project" })

let buf = ""
const pending = new Map()
let nextId = 1

child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8")
    let idx
    while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        try {
            const msg = JSON.parse(line)
            if (msg.id && pending.has(msg.id)) {
                pending.get(msg.id)(msg)
                pending.delete(msg.id)
            }
        } catch (e) { /* ignore non-json */ }
    }
})

child.stderr.on("data", (c) => process.stderr.write(c))

function request(method, params) {
    const id = nextId++
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params })
    return new Promise((resolve, reject) => {
        pending.set(id, resolve)
        setTimeout(() => {
            if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)) }
        }, 30000)
        child.stdin.write(msg + "\n")
    })
}

function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")
}

async function callTool(name, args) {
    const r = await request("tools/call", { name, arguments: args })
    if (r.error) throw new Error(`${name}: ${r.error.message}`)
    const text = (r.result.content || []).map(c => c.type === "text" ? c.text : `[${c.type}]`).join("\n")
    return text
}

async function main() {
    const init = await request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e-test", version: "1.0.0" }
    })
    console.log("== initialize ==")
    console.log(JSON.stringify(init.result.serverInfo))
    notify("notifications/initialized", {})

    const list = await request("tools/list", {})
    const tools = list.result.tools.map(t => t.name)
    console.log(`\n== tools/list == ${tools.length} tools`)
    console.log(tools.join(", "))

    console.log("\n== ide-get-all-scenes-in-project ==")
    console.log(await callTool("ide-get-all-scenes-in-project", {}))

    console.log("\n== ide-create-new-scene (official arg: name only) ==")
    console.log(await callTool("ide-create-new-scene", { name: "OfficialE2E" }))

    console.log("\n== scene-add-game-objects (official shape: sceneId + objects[{type, properties}]) ==")
    const scenes = JSON.parse(await callTool("ide-get-all-scenes-in-project", {}))
    const scene = scenes.scenes.find(s => s.sceneKey === "OfficialE2E")
    console.log(await callTool("scene-add-game-objects", {
        sceneId: scene.id,
        objects: [
            { type: "Image", properties: { label: "player", texture: { key: "dino" }, x: 400, y: 300 } },
            { type: "Text", properties: { label: "score", text: "Official package works!", x: 250, y: 60, color: "#ff9d45" } }
        ]
    }))

    console.log("\n== scene-get-screenshot ==")
    const shot = await callTool("scene-get-screenshot", {
        sceneId: scene.id, x: 0, y: 0, width: 800, height: 600
    })
    console.log(shot.slice(0, 120))

    console.log("\n== ide-open-scene ==")
    console.log(await callTool("ide-open-scene", { sceneId: scene.id }))

    console.log("\n== ide-get-all-prefabs-in-project ==")
    console.log((await callTool("ide-get-all-prefabs-in-project", {})).slice(0, 200))

    console.log("\n== assets-get-texture-size (official shape) ==")
    console.log(await callTool("assets-get-texture-size", { texture: { key: "dino" } }))

    console.log("\n== unsupported tool degrades gracefully ==")
    console.log(await callTool("scene-add-editable-tilemap", { sceneId: scene.id, name: "x" }))

    child.kill()
    process.exit(0)
}

main().catch(e => { console.error("E2E FAIL:", e.message); child.kill(); process.exit(1) })
