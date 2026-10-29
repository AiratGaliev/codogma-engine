/**
 * Negative-scenario security tests for the loopback mini-services:
 *
 *   - mini-services/ai-chat            (LLM completions proxy, default :3031)
 *   - mini-services/phaser-editor-mcp  (editor MCP bridge,          default :1902)
 *
 * Both services are local helpers and must fail closed for anything that is
 * not their documented local caller: foreign Host headers, foreign browser
 * origins, oversized bodies, malformed payloads and request floods.
 */

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createRequire } from "node:module"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer()
        server.listen(0, "127.0.0.1")
        server.on("listening", () => {
            const port = server.address().port
            server.close(error => error ? reject(error) : resolve(port))
        })
        server.on("error", reject)
    })
}

function request(port, requestPath, { method = "GET", headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: "127.0.0.1",
            port,
            path: requestPath,
            method,
            headers
        }, res => {
            const chunks = []
            res.on("data", chunk => chunks.push(chunk))
            res.on("end", () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString("utf8")
            }))
        })
        req.on("error", reject)
        if (body !== undefined) req.write(body)
        req.end()
    })
}

function spawnService(serviceDir, script, env = {}) {
    const child = spawn(process.execPath, [script], {
        cwd: serviceDir,
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"]
    })

    let logs = ""
    child.stdout.on("data", chunk => { logs += chunk.toString("utf8") })
    child.stderr.on("data", chunk => { logs += chunk.toString("utf8") })

    return { child, logs: () => logs }
}

async function stopChild(child) {
    if (!child || child.exitCode !== null) return

    const exited = once(child, "exit").catch(() => undefined)
    child.kill()
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))])
}

async function assertRemoteBindRejected(serviceDir, script, env, label) {
    const service = spawnService(serviceDir, script, env)

    try {
        // "close" fires after stdout/stderr streams are drained, so the
        // startup-rejection message is available for the assertion below.
        const exitPromise = once(service.child, "close")
        let timer
        const outcome = await Promise.race([
            exitPromise.then(([code, signal]) => ({ type: "exit", code, signal })),
            new Promise(resolve => {
                timer = setTimeout(() => resolve({ type: "timeout" }), 5000)
            })
        ])
        clearTimeout(timer)

        assert.equal(outcome.type, "exit", `${label} must refuse an external bind instead of starting`)
        assert.notEqual(outcome.code, 0, `${label} must exit unsuccessfully for a non-loopback bind`)
        assert.match(service.logs(), /refusing non-loopback bind/i, `${label} must explain the rejected bind`)
    } finally {
        await stopChild(service.child)
    }
}

async function testRemoteBindGuards() {
    await assertRemoteBindRejected(
        path.join(ROOT, "mini-services", "ai-chat"),
        "index.mjs",
        { AI_CHAT_PORT: "0", AI_CHAT_HOST: "0.0.0.0" },
        "ai-chat"
    )
    await assertRemoteBindRejected(
        path.join(ROOT, "mini-services", "phaser-editor-mcp"),
        "index.mjs",
        { PORT: "0", MCP_BRIDGE_HOST: "0.0.0.0" },
        "phaser-editor-mcp"
    )
}

async function waitForHttp(port, service, probe) {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (service.child.exitCode !== null) {
            throw new Error(`Service exited early (${service.child.exitCode}):\n${service.logs()}`)
        }
        try {
            if (await probe(port)) return
        } catch {
            // still starting
        }
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Service did not start in time:\n${service.logs()}`)
}

/* ============================== ai-chat ============================== */

async function testAiChat() {
    const port = await freePort()
    const service = spawnService(
        path.join(ROOT, "mini-services", "ai-chat"),
        "index.mjs",
        { AI_CHAT_PORT: String(port), AI_CHAT_HOST: "127.0.0.1" })

    try {
        await waitForHttp(port, service, async p => {
            const r = await request(p, "/health", { headers: { host: `127.0.0.1:${p}` } })
            return r.status === 200
        })
        const host = `127.0.0.1:${port}`

        const health = await request(port, "/health", { headers: { host } })
        assert.equal(health.status, 200, "loopback health check must pass")
        assert.equal(JSON.parse(health.body).ok, true)

        const rebinding = await request(port, "/health", { headers: { host: "attacker.example" } })
        assert.equal(rebinding.status, 403, "non-loopback Host header must be rejected (DNS rebinding guard)")

        const ipv6LoopbackHost = await request(port, "/health", { headers: { host: `[::1]:${port}` } })
        assert.equal(ipv6LoopbackHost.status, 200, "IPv6 loopback Host headers must be normalized and accepted")

        const ipv6LoopbackOrigin = await request(port, "/health", {
            headers: { host, origin: `http://[::1]:${port}` }
        })
        assert.equal(ipv6LoopbackOrigin.status, 200, "IPv6 loopback Origin headers must be normalized and accepted")

        const csrf = await request(port, "/chat", {
            method: "POST",
            headers: { host, "content-type": "application/json", origin: "https://attacker.example" },
            body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
        })
        assert.equal(csrf.status, 403, "browser cross-origin POST must be rejected")

        const oversized = await request(port, "/chat", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: "x".repeat(3 * 1024 * 1024) }] })
        })
        assert.equal(oversized.status, 413, "oversized request bodies must be rejected with 413")

        const formPost = await request(port, "/chat", {
            method: "POST",
            headers: { host, "content-type": "application/x-www-form-urlencoded" },
            body: "messages=1"
        })
        assert.equal(formPost.status, 415, "form-encoded posts must be rejected")

        const badJson = await request(port, "/chat", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: "{not json"
        })
        assert.equal(badJson.status, 400, "malformed JSON must be rejected")

        const badMessages = [
            undefined,
            [],
            "nope",
            [{ role: "user" }],
            [{ role: "hacker", content: "hi" }],
            [{ role: "user", content: { nested: true } }],
            Array.from({ length: 65 }, () => ({ role: "user", content: "hi" }))
        ]
        for (const messages of badMessages) {
            const r = await request(port, "/chat", {
                method: "POST",
                headers: { host, "content-type": "application/json" },
                body: JSON.stringify({ messages })
            })
            assert.equal(r.status, 400, `malformed messages must be rejected: ${String(JSON.stringify(messages)).slice(0, 60)}`)
        }

        // Token bucket: the requests above consumed the 10-token capacity, so
        // the flood must be throttled with 429. None of the rejected requests
        // reach the LLM SDK.
        let throttled = null
        for (let i = 0; i < 12; i++) {
            const r = await request(port, "/chat", {
                method: "POST",
                headers: { host, "content-type": "application/json" },
                body: JSON.stringify({ messages: [] })
            })
            if (r.status === 429) { throttled = r; break }
        }
        assert.ok(throttled, "request floods must eventually be throttled with 429")

        console.log("ai-chat: host/origin guards, body caps, message validation and rate limiting passed")
    } finally {
        await stopChild(service.child)
    }
}

/* ========================= phaser-editor-mcp ========================= */

async function testMcpBridge() {
    const port = await freePort()
    const service = spawnService(
        path.join(ROOT, "mini-services", "phaser-editor-mcp"),
        "index.mjs",
        { PORT: String(port), MCP_BRIDGE_HOST: "127.0.0.1" })

    try {
        await waitForHttp(port, service, async p => {
            const r = await request(p, "/", { headers: { host: `127.0.0.1:${p}` } })
            return r.status === 200
        })
        const host = `127.0.0.1:${port}`

        const status = await request(port, "/", { headers: { host } })
        assert.equal(status.status, 200, "loopback status check must pass")
        assert.equal(JSON.parse(status.body).status, "ok")

        const rebinding = await request(port, "/", { headers: { host: "attacker.example" } })
        assert.equal(rebinding.status, 403, "the MCP bridge must reject foreign Host headers even without Origin")

        const foreignOrigin = await request(port, "/", {
            headers: { host, origin: "https://attacker.example" }
        })
        assert.equal(foreignOrigin.status, 403, "foreign browser origins must be rejected")

        const editorOrigin = await request(port, "/", {
            headers: { host, origin: "http://127.0.0.1:3000" }
        })
        assert.equal(editorOrigin.status, 200, "the editor page origin (loopback) must be accepted")
        assert.equal(editorOrigin.headers["access-control-allow-origin"], "http://127.0.0.1:3000",
            "CORS must echo the specific allowed origin, not a wildcard")

        const ipv6Origin = await request(port, "/", {
            headers: { host, origin: "http://[::1]:3000" }
        })
        assert.equal(ipv6Origin.status, 200, "IPv6 loopback origins must be accepted")
        assert.equal(ipv6Origin.headers["access-control-allow-origin"], "http://[::1]:3000")

        const preflight = await request(port, "/", {
            method: "OPTIONS",
            headers: { host, origin: "http://127.0.0.1:3000" }
        })
        assert.equal(preflight.status, 204, "CORS preflight for allowed origins must pass")

        const preflightForeign = await request(port, "/", {
            method: "OPTIONS",
            headers: { host, origin: "https://attacker.example" }
        })
        assert.ok(!preflightForeign.headers["access-control-allow-origin"],
            "CORS preflight must not grant foreign origins")

        const badJson = await request(port, "/", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: "{oops"
        })
        assert.equal(badJson.status, 400, "malformed JSON must be rejected")

        const noTool = await request(port, "/", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: JSON.stringify({ args: {} })
        })
        assert.equal(noTool.status, 400, "requests without a tool name must be rejected")

        const badArgs = await request(port, "/", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: JSON.stringify({ tool: "ide-get-project-data", args: [1, 2, 3] })
        })
        assert.equal(badArgs.status, 400, "non-object args must be rejected")

        const oversized = await request(port, "/", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: JSON.stringify({ tool: "x", args: { blob: "y".repeat(11 * 1024 * 1024) } })
        })
        assert.equal(oversized.status, 413, "oversized request bodies must be rejected with 413")

        const noClients = await request(port, "/", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: JSON.stringify({ tool: "ide-get-project-data", args: {} })
        })
        assert.equal(noClients.status, 503, "tool requests without a connected editor must answer 503")

        // Full loop with a fake editor client over WebSocket.
        const require = createRequire(path.join(ROOT, "mini-services", "phaser-editor-mcp", "index.mjs"))
        const { WebSocket } = require("ws")

        const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { headers: { host } })
        await once(ws, "open")
        const forwarded = new Promise(resolve => {
            ws.on("message", data => resolve(JSON.parse(String(data))))
        })

        const toolCall = request(port, "/", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: JSON.stringify({ tool: "ide-get-project-data", args: { hello: "world" } })
        })

        const msg = await forwarded
        assert.equal(msg.tool, "ide-get-project-data")
        assert.deepEqual(msg.args, { hello: "world" })
        ws.send(JSON.stringify({ id: msg.id, result: [{ type: "text", text: "fake-editor-result" }] }))

        const toolResponse = await toolCall
        assert.equal(toolResponse.status, 200)
        assert.equal(JSON.parse(toolResponse.body)[0]?.text, "fake-editor-result",
            "the bridge must relay the editor's answer back to the HTTP caller")

        ws.close()

        const hostileWs = new WebSocket(`ws://127.0.0.1:${port}/`, {
            headers: { host, origin: "https://attacker.example" }
        })
        // Note: events.once(emitter, "error") rejects, so wait explicitly.
        const wsOutcome = await new Promise(resolve => {
            const timer = setTimeout(() => resolve("closed"), 2000)
            hostileWs.once("open", () => { clearTimeout(timer); resolve("opened") })
            hostileWs.once("unexpected-response", () => { clearTimeout(timer); resolve("rejected") })
            hostileWs.once("error", () => { clearTimeout(timer); resolve("rejected") })
        })
        assert.notEqual(wsOutcome, "opened", "WebSocket upgrades from foreign origins must be rejected")
        hostileWs.terminate()

        const hostileHostWs = new WebSocket(`ws://127.0.0.1:${port}/`, {
            headers: { host: "attacker.example" }
        })
        const hostOutcome = await new Promise(resolve => {
            const timer = setTimeout(() => resolve("closed"), 2000)
            hostileHostWs.once("open", () => { clearTimeout(timer); resolve("opened") })
            hostileHostWs.once("unexpected-response", () => { clearTimeout(timer); resolve("rejected") })
            hostileHostWs.once("error", () => { clearTimeout(timer); resolve("rejected") })
        })
        assert.notEqual(hostOutcome, "opened", "WebSocket upgrades with a foreign Host must be rejected")
        hostileHostWs.terminate()

        console.log("phaser-editor-mcp: Host/Origin guards, body caps, validation and WS forwarding passed")
    } finally {
        await stopChild(service.child)
    }
}

async function main() {
    await testRemoteBindGuards()
    await testAiChat()
    await testMcpBridge()
    console.log("Mini-services security checks passed.")
}

main().catch(error => {
    console.error("Mini-services security test failed:", error.stack || error.message)
    process.exitCode = 1
})
