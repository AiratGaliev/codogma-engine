import test, { after } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
    dispatchTool,
    getBridgeStatus,
    handleBridgeActivate,
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
    assert.ok(eventIndex >= 0, `Host response should contain the "${eventName}" SSE event`)
    const dataLine = lines[eventIndex + 1]
    assert.ok(dataLine?.startsWith("data: "), `"${eventName}" event should be followed by an SSE data line`)
    return JSON.parse(dataLine.slice("data: ".length))
}

function parseLastCommand(response) {
    const lines = response.output.split(/\r?\n/)
    const eventIndexes = lines.flatMap((line, index) => line === "event: command" ? [index] : [])
    assert.ok(eventIndexes.length > 0, "active Host should receive the MCP command event")
    const dataLine = lines[eventIndexes.at(-1) + 1]
    assert.ok(dataLine?.startsWith("data: "), "command event should contain its payload")
    return JSON.parse(dataLine.slice("data: ".length))
}

async function connectHost() {
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

test("MCP bridge routes commands to the active Host and binds results to that session", async () => {
    const firstHost = await connectHost()
    const activeHost = await connectHost()

    try {
        assert.equal(getBridgeStatus().activeClientId, activeHost.session.clientId)

        const commandPromise = dispatchTool("scene-get-active", {})
        await new Promise(resolve => setImmediate(resolve))

        const command = parseLastCommand(activeHost.response)
        assert.equal(command.clientId, activeHost.session.clientId)
        assert.equal(command.tool, "scene-get-active")
        assert.doesNotMatch(firstHost.response.output, /event: command/,
            "a command must not be broadcast to an inactive Host session")

        const rejected = await sendResult({
            id: command.id,
            clientId: firstHost.session.clientId,
            result: { path: "scenes/Level.cge-scene.json", id: "wrong-session" }
        })
        assert.equal(rejected.payload.error, "command result belongs to a different editor session")

        const accepted = await sendResult({
            id: command.id,
            clientId: activeHost.session.clientId,
            result: { path: "scenes/Level.cge-scene.json", id: "scene-level", name: "Level", documentType: "scene" }
        })
        assert.equal(accepted.payload.ok, true)

        const result = await commandPromise
        assert.ok(result.content[0].text.includes("scenes/Level.cge-scene.json"))
    } finally {
        firstHost.response.emit("close")
        activeHost.response.emit("close")
    }
})

test("Host focus changes command ownership and disconnect selects the remaining Host", async () => {
    const firstHost = await connectHost()
    const secondHost = await connectHost()

    try {
        const activationResponse = new FakeResponse()
        await handleBridgeActivate(
            new FakeRequest("/editor/mcp-bridge/activate", { clientId: firstHost.session.clientId }),
            activationResponse
        )
        assert.equal(JSON.parse(activationResponse.body).activeClientId, firstHost.session.clientId)

        const firstCommandPromise = dispatchTool("scene-get-active", {})
        await new Promise(resolve => setImmediate(resolve))
        const firstCommand = parseLastCommand(firstHost.response)
        assert.equal(firstCommand.clientId, firstHost.session.clientId)
        assert.doesNotMatch(secondHost.response.output, /event: command/,
            "an inactive Host must not receive another session's command")

        await sendResult({
            id: firstCommand.id,
            clientId: firstHost.session.clientId,
            result: { path: "scenes/Level.cge-scene.json", id: "scene-level", name: "Level", documentType: "scene" }
        })
        await firstCommandPromise

        firstHost.response.emit("close")
        assert.equal(getBridgeStatus().activeClientId, secondHost.session.clientId)
        assert.equal(getBridgeStatus().clients, 1)

        const secondCommandPromise = dispatchTool("scene-get-active", {})
        await new Promise(resolve => setImmediate(resolve))
        const secondCommand = parseLastCommand(secondHost.response)
        assert.equal(secondCommand.clientId, secondHost.session.clientId)
        await sendResult({
            id: secondCommand.id,
            clientId: secondHost.session.clientId,
            result: { path: "scenes/Level.cge-scene.json", id: "scene-level", name: "Level", documentType: "scene" }
        })
        await secondCommandPromise
    } finally {
        firstHost.response.emit("close")
        secondHost.response.emit("close")
    }
})

test("MCP bridge rejects activation and command results for unknown sessions", async () => {
    const activation = new FakeResponse()
    await handleBridgeActivate(
        new FakeRequest("/editor/mcp-bridge/activate", { clientId: "not-a-session" }),
        activation
    )
    assert.equal(JSON.parse(activation.body).error, "Editor bridge session is not connected.")

    const result = await sendResult({
        id: "not-a-command",
        clientId: "not-a-session",
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
