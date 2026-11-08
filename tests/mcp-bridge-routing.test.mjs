import test, { after } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
    dispatchTool,
    handleBridgeEvents,
    handleBridgeResult,
    initMcp
} from "../server/mcp.mjs"

class FakeRequest extends EventEmitter {
    constructor(url, body = {}) {
        super()
        this.url = url
        setImmediate(() => {
            this.emit("data", Buffer.from(JSON.stringify(body)))
            this.emit("end")
        })
    }
}

class FakeResponse extends EventEmitter {
    constructor() {
        super()
        this.statusCode = 0
        this.headers = {}
        this.output = ""
        this.body = ""
        this.writableEnded = false
    }

    writeHead(statusCode, headers = {}) {
        this.statusCode = statusCode
        this.headers = headers
        return this
    }

    write(chunk) {
        this.output += String(chunk)
        return true
    }

    end(chunk = "") {
        this.body += String(chunk)
        this.writableEnded = true
        return this
    }
}

function parseEventPayload(response, eventName) {
    const lines = response.output.split(/\r?\n/)
    const eventIndex = lines.indexOf(`event: ${eventName}`)
    assert.ok(eventIndex >= 0, `Editor Host response should contain the "${eventName}" SSE event`)
    const dataLine = lines[eventIndex + 1]
    assert.ok(dataLine?.startsWith("data: "), `"${eventName}" event should be followed by an SSE data line`)
    return JSON.parse(dataLine.slice("data: ".length))
}

function parseLastCommand(response) {
    const lines = response.output.split(/\r?\n/)
    const eventIndexes = lines.flatMap((line, index) => line === "event: command" ? [index] : [])
    assert.ok(eventIndexes.length > 0, "the connected Editor Host should receive the MCP command event")
    const dataLine = lines[eventIndexes.at(-1) + 1]
    assert.ok(dataLine?.startsWith("data: "), "command event should contain its payload")
    return JSON.parse(dataLine.slice("data: ".length))
}

async function connectEditorHost() {
    const response = new FakeResponse()
    await handleBridgeEvents(new FakeRequest("/editor/mcp-bridge/events"), response)
    return { response, session: parseEventPayload(response, "connected") }
}

async function sendResult(body) {
    const response = new FakeResponse()
    await handleBridgeResult(new FakeRequest("/editor/mcp-bridge/result", body), response)
    return { response, payload: JSON.parse(response.body) }
}

const projectDirectory = await mkdtemp(path.join(os.tmpdir(), "codogma-mcp-bridge-"))
initMcp({ projectDir: projectDirectory, log: () => {} })

after(async () => {
    await rm(projectDirectory, { recursive: true, force: true })
})

test("MCP bridge routes commands to the single Editor Host and binds results to its session", async () => {
    const editorHost = await connectEditorHost()

    try {
        const commandPromise = dispatchTool("scene-get-active", {})
        await new Promise(resolve => setImmediate(resolve))

        const command = parseLastCommand(editorHost.response)
        assert.equal(command.clientId, editorHost.session.clientId)
        assert.equal(command.tool, "scene-get-active")

        const rejected = await sendResult({
            id: command.id,
            clientId: "unrelated-session",
            result: { path: "scenes/Level.cge-scene.json", id: "wrong-session" }
        })
        assert.equal(rejected.payload.error, "command result belongs to a different editor session")

        const accepted = await sendResult({
            id: command.id,
            clientId: editorHost.session.clientId,
            result: { path: "scenes/Level.cge-scene.json", id: "scene-level", name: "Level", documentType: "scene" }
        })
        assert.equal(accepted.payload.ok, true)

        const result = await commandPromise
        assert.ok(result.content[0].text.includes("scenes/Level.cge-scene.json"))
    } finally {
        editorHost.response.emit("close")
    }
})

test("disconnecting the Editor Host rejects its pending MCP command", async () => {
    const editorHost = await connectEditorHost()
    const commandPromise = dispatchTool("scene-get-active", {})
    await new Promise(resolve => setImmediate(resolve))
    parseLastCommand(editorHost.response)

    editorHost.response.emit("close")
    await assert.rejects(commandPromise, /Editor Host session disconnected/)
})

test("MCP bridge rejects results for unknown commands", async () => {
    const result = await sendResult({
        id: "not-a-command",
        clientId: "unknown-session",
        result: {}
    })
    assert.equal(result.payload.error, "unknown command id")
})

test("native MCP tools require a connected Editor Host session", async () => {
    await assert.rejects(
        dispatchTool("scene-get-active", {}),
        /require a connected Editor Host session/
    )
})
