/**
 * Проверка MCP stdio через официальный @phaserjs/editor-mcp-server и мост Codogma Engine.
 *
 * По умолчанию проверяются протокол и инструменты, работающие на стороне сервера.
 * Для проверки скриншотов и открытия сцены нужен подключённый браузер редактора:
 * MCP_E2E_WITH_EDITOR=1 node tests/mcp-e2e-test.mjs node server/mcp-launcher.mjs
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"

const cmd = process.argv[2] || "node"
const args = process.argv.slice(3)
const cwd = process.env.MCP_E2E_CWD || process.cwd()

const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], cwd })

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
        } catch {
            // Официальный MCP-сервер может писать диагностические строки в stdout.
        }
    }
})

child.stderr.on("data", (chunk) => process.stderr.write(chunk))
child.on("error", (error) => {
    console.error("Не удалось запустить MCP-клиент:", error.message)
})

function request(method, params) {
    const id = nextId++
    const message = JSON.stringify({ jsonrpc: "2.0", id, method, params })

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id)
                reject(new Error(`timeout: ${method}`))
            }
        }, 30000)

        pending.set(id, (response) => {
            clearTimeout(timeout)
            resolve(response)
        })

        child.stdin.write(message + "\n", (error) => {
            if (error && pending.has(id)) {
                clearTimeout(timeout)
                pending.delete(id)
                reject(error)
            }
        })
    })
}

function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")
}

async function callTool(name, args) {
    const response = await request("tools/call", { name, arguments: args })
    if (response.error) throw new Error(`${name}: ${response.error.message}`)

    const result = response.result
    const output = (result?.content || [])
        .map((item) => item.type === "text" ? item.text : `[${item.type}]`)
        .join("\n")

    if (!result) throw new Error(`${name}: пустой ответ MCP-сервера`)
    if (result.isError) throw new Error(`${name}: ${output}`)
    return output
}

async function main() {
    const init = await request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "codogma-ci-e2e", version: "1.0.0" }
    })
    assert.ok(init.result?.serverInfo, "MCP initialize должен возвращать serverInfo")
    console.log("== initialize ==")
    console.log(JSON.stringify(init.result.serverInfo))
    notify("notifications/initialized", {})

    const list = await request("tools/list", {})
    assert.ok(Array.isArray(list.result?.tools), "MCP tools/list должен возвращать список инструментов")
    const toolNames = list.result.tools.map((tool) => tool.name)
    const requiredTools = [
        "ide-get-all-scenes-in-project",
        "ide-create-new-scene",
        "scene-add-game-objects",
        "ide-get-all-prefabs-in-project",
        "assets-get-texture-size"
    ]
    for (const name of requiredTools) {
        assert.ok(toolNames.includes(name), `В MCP не найден обязательный инструмент: ${name}`)
    }
    console.log(`\n== tools/list == ${toolNames.length} tools`)

    console.log("\n== ide-get-all-scenes-in-project ==")
    const initialScenes = JSON.parse(await callTool("ide-get-all-scenes-in-project", {}))
    assert.ok(Array.isArray(initialScenes.scenes), "Ответ со сценами должен содержать массив scenes")

    const sceneName = `OfficialE2E-${process.pid}`
    console.log("\n== ide-create-new-scene ==")
    await callTool("ide-create-new-scene", { name: sceneName })

    const updatedScenes = JSON.parse(await callTool("ide-get-all-scenes-in-project", {}))
    const scene = updatedScenes.scenes.find((item) => item.sceneKey === sceneName)
    assert.ok(scene?.id, `Новая сцена ${sceneName} должна появиться в проекте`)

    console.log("\n== scene-add-game-objects ==")
    await callTool("scene-add-game-objects", {
        sceneId: scene.id,
        objects: [
            { type: "Image", properties: { label: "player", texture: { key: "dino" }, x: 400, y: 300 } },
            { type: "Text", properties: { label: "score", text: "Codogma CI passed", x: 250, y: 60, color: "#ff9d45" } }
        ]
    })

    console.log("\n== ide-get-all-prefabs-in-project ==")
    await callTool("ide-get-all-prefabs-in-project", {})

    console.log("\n== assets-get-texture-size ==")
    const texture = JSON.parse(await callTool("assets-get-texture-size", { texture: { key: "dino" } }))
    assert.ok(Number.isFinite(texture.width) && texture.width > 0, "Для dino должна определяться ширина текстуры")
    assert.ok(Number.isFinite(texture.height) && texture.height > 0, "Для dino должна определяться высота текстуры")

    if (process.env.MCP_E2E_WITH_EDITOR === "1") {
        console.log("\n== ide-open-scene ==")
        await callTool("ide-open-scene", { sceneId: scene.id })
        console.log("\n== scene-get-screenshot ==")
        const screenshot = await callTool("scene-get-screenshot", {
            sceneId: scene.id, x: 0, y: 0, width: 800, height: 600
        })
        assert.ok(screenshot.length > 0, "Скриншот открытой сцены не должен быть пустым")
    } else {
        console.log("\nUI-проверки пропущены: для них нужен подключённый браузер редактора.")
    }

    console.log("\nMCP integration checks passed.")
}

main()
    .catch((error) => {
        console.error("MCP E2E FAIL:", error.stack || error.message)
        process.exitCode = 1
    })
    .finally(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill()
    })
