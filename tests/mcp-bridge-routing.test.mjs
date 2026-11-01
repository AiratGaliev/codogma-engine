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

function parseConnectedSession(response) {
    const match = response.output.match(/event: connected\ndata: ([^\n]+)/)
    assert.ok(match, "SSE client should receive its server-issued session id")
    const data = JSON.parse(match[1])
    assert.equal(typeof data.clientId, "string")
    assert.ok(data.clientId.length >= 30, "session ids must be unpredictable UUIDs")
    return data
}

function parseLastCommand(response) {
    const matches = [...response.output.matchAll(/event: command\ndata: ([^\n]+)/g)]
    assert.ok(matches.length > 0, "active editor should receive the MCP command event")
    return JSON.parse(matches.at(-1)[1])
}

async function connectEditor(clientType) {
    const response = new FakeResponse()
    await handleBridgeEvents(
        new FakeRequest(`/editor/mcp-bridge/events?clientType=${clientType}`),
        response
    )
    return { response, session: parseConnectedSession(response) }
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

test("MCP bridge sends commands only to the active editor and binds results to that session", async () => {
    const legacy = await connectEditor("legacy")
    const solid = await connectEditor("solidjs")

    try {
        const commandPromise = dispatchTool("ide-get-active-scene", {})
        await new Promise((resolve) => setImmediate(resolve))

        const command = parseLastCommand(solid.response)
        assert.equal(command.clientId, solid.session.clientId)
        assert.equal(command.tool, "ide-get-active-scene")
        assert.doesNotMatch(legacy.response.output, /event: command/,
            "a command must not be broadcast to the inactive legacy editor")

        const rejected = await sendResult({
            id: command.id,
            clientId: legacy.session.clientId,
            result: { scenePath: "scenes/Legacy.scene" }
        })
        assert.equal(rejected.payload.error, "command result belongs to a different editor session")

        const accepted = await sendResult({
            id: command.id,
            clientId: solid.session.clientId,
            result: { scenePath: "scenes/Level.scene", sceneKey: "Level", sceneId: "scene-level" }
        })
        assert.equal(accepted.payload.ok, true)

        const result = await commandPromise
        assert.match(result.content[0].text, /scenes\/Level\.scene/)
    } finally {
        legacy.response.emit("close")
        solid.response.emit("close")
    }
})

test("editor focus changes command ownership and disconnect selects the remaining Host", async () => {
    const legacy = await connectEditor("legacy")
    const solid = await connectEditor("solidjs")

    try {
        assert.equal(getBridgeStatus().activeClientType, "solidjs")

        const activationResponse = new FakeResponse()
        await handleBridgeActivate(
            new FakeRequest("/editor/mcp-bridge/activate", { clientId: legacy.session.clientId }),
            activationResponse
        )
        assert.equal(JSON.parse(activationResponse.body).activeClientType, "legacy")

        const commandPromise = dispatchTool("ide-get-active-scene", {})
        await new Promise((resolve) => setImmediate(resolve))
        const command = parseLastCommand(legacy.response)
        assert.equal(command.clientId, legacy.session.clientId)
        await sendResult({
            id: command.id,
            clientId: legacy.session.clientId,
            result: { scenePath: "scenes/Legacy.scene", sceneKey: "Legacy", sceneId: "legacy-id" }
        })
        await commandPromise

        legacy.response.emit("close")
        assert.equal(getBridgeStatus().activeClientType, "solidjs")
        assert.equal(getBridgeStatus().clients, 1)
    } finally {
        legacy.response.emit("close")
        solid.response.emit("close")
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
