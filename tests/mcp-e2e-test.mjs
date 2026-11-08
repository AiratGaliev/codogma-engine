/**
 * Проверка MCP stdio через @codogma/editor-mcp-server и HTTP MCP endpoint Codogma Engine.
 *
 * По умолчанию проверяются протокол и инструменты, работающие на стороне сервера.
 * Для проверки скриншотов и открытия сцены нужен подключённый браузер редактора:
 * MCP_E2E_WITH_EDITOR=1 node tests/mcp-e2e-test.mjs node server/mcp-launcher.mjs
 */
import assert from "node:assert/strict"
import { rm } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { assertToolInputSchema } from "./mcp-schema-contract.mjs"

const cmd = process.argv[2] || "node"
const args = process.argv.slice(3)
const cwd = process.env.MCP_E2E_CWD || process.cwd()
const projectDir = path.resolve(process.env.PROJECT_DIR || path.join(process.cwd(), "tests", "workspace", "test-typescript"))
let generatedScenePath

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
            // Игнорируем не-JSON строки: MCP diagnostics должны идти в stderr.
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
    if (!result) throw new Error(`${name}: пустой ответ MCP-сервера`)
    assert.ok(Array.isArray(result.content), `${name}: tools/call result.content должен быть массивом`)
    for (const [index, item] of result.content.entries()) {
        assert.ok(item && typeof item === "object" && typeof item.type === "string",
            `${name}: content[${index}] должен иметь строковый type`)
        if (item.type === "text") {
            assert.ok(typeof item.text === "string", `${name}: content[${index}].text должен быть строкой`)
        }
    }
    const output = result.content
        .map((item) => item.type === "text" ? item.text : `[${item.type}]`)
        .join("\n")

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
        "assets-get-texture-size",
        "assets-get-spine-skin-image"
    ]
    for (const name of requiredTools) {
        assert.ok(toolNames.includes(name), `В MCP не найден обязательный инструмент: ${name}`)
    }
    console.log(`\n== tools/list == ${toolNames.length} tools`)

    // --- engine JSON Schema / stdio adapter contract ---
    // Package contract tests compile every real registry schema with Ajv and
    // exercise nested, alternative and required argument validation. Here we
    // check the live MCP surface and content-array responses on the real engine.
    console.log("\n== tool input schemas (JSON Schema) ==")
    let nestedSchemaCount = 0
    let optionalFieldCount = 0
    for (const tool of list.result.tools) {
        const stats = assertToolInputSchema(tool.name, tool.inputSchema)
        nestedSchemaCount += stats.nestedSchemaCount
        optionalFieldCount += stats.optionalFieldCount
    }
    assert.ok(nestedSchemaCount > 0, "official MCP schemas must include nested properties")
    assert.ok(optionalFieldCount > 0, "official MCP schemas must include optional fields")
    console.log(`${list.result.tools.length} tools: recursive input schemas valid with Zod 4, ${nestedSchemaCount} nested fields and ${optionalFieldCount} optional fields checked`)

    console.log("\n== validation rejects malformed arguments without killing the server ==")
    // 1) неверный тип значения (Zod invalid_type)
    const badType = await request("tools/call", {
        name: "assets-get-texture-size",
        arguments: { texture: { key: 12345 } }
    })
    assert.ok(badType.error || badType.result?.isError,
        "невалидные аргументы (число вместо string) должны отклоняться, а не выполняться")
    // 2) полностью отсутствующие аргументы
    const missing = await request("tools/call", {
        name: "assets-get-texture-size",
        arguments: {}
    })
    const missingOutput = (missing.result?.content || [])
        .filter((item) => item.type === "text")
        .map((item) => item.text || "")
        .join("\n")
    assert.ok(
        missing.error
            || missing.result?.isError
            || /missing(?: or invalid)? texture key/i.test(missingOutput),
        "пустые аргументы должны явно отклоняться: ожидается протокольная ошибка либо текстовая ошибка валидации bridge"
    )
    // 3) неизвестный инструмент
    const unknown = await request("tools/call", {
        name: "definitely-not-a-real-tool",
        arguments: {}
    })
    assert.ok(unknown.error || unknown.result?.isError,
        "неизвестный инструмент должен возвращать ошибку")
    console.log("невалидные вызовы отклонены (3/3), сервер остался работоспособен")
    // сервер обязан остаться работоспособным после неудачных вызовов
    const stillAlive = JSON.parse(await callTool("ide-get-all-scenes-in-project", {}))
    assert.ok(Array.isArray(stillAlive.scenes),
        "после ошибок валидации сервер должен продолжать отвечать корректно")

    console.log("\n== ide-get-all-scenes-in-project ==")
    const initialScenes = JSON.parse(await callTool("ide-get-all-scenes-in-project", {}))
    assert.ok(Array.isArray(initialScenes.scenes), "Ответ со сценами должен содержать массив scenes")

    const sceneName = `OfficialE2E-${process.pid}`
    generatedScenePath = path.join(projectDir, "scenes", `${sceneName}.scene`)
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

    console.log("\n== optional nested object fields (Zod 4 compatibility) ==")
    const objectList = JSON.parse(await callTool("scene-add-object-list", {
        sceneId: scene.id,
        lists: [{ label: `E2E-optional-list-${process.pid}` }]
    }))
    assert.ok(Array.isArray(objectList.added) && objectList.added.length === 1,
        "scene-add-object-list must accept nested items while omitting optional scope/objectIds")

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
    .finally(async () => {
        if (generatedScenePath) {
            await rm(generatedScenePath, { force: true }).catch((error) => {
                console.error("Не удалось удалить временную сцену:", error.message)
                process.exitCode = 1
            })
        }
        if (child.exitCode === null && child.signalCode === null) child.kill()
    })
