import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs/promises"
import http from "node:http"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const EDITOR_DIR = path.join(ROOT, "source", "editor")

async function freePort() {
    const server = net.createServer()
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const address = server.address()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    return address.port
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
                body: Buffer.concat(chunks).toString("utf8")
            }))
        })
        req.on("error", reject)
        if (body !== undefined) req.write(body)
        req.end()
    })
}

async function waitForHttpServer(port, child, getLogs) {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Editor server exited early (${child.exitCode}):\n${getLogs()}`)
        }
        try {
            const response = await request(port, "/editor/product.json")
            if (response.status === 200) return
        } catch {
            // The server is still starting.
        }
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Editor server did not start in time:\n${getLogs()}`)
}

function createMcpClient(bridgePort, projectDir) {
    const child = spawn(process.execPath, [path.join(ROOT, "server", "mcp-launcher.mjs")], {
        cwd: ROOT,
        env: {
            ...process.env,
            PROJECT_DIR: projectDir,
            MCP_BRIDGE_PORT: String(bridgePort),
            MCP_BRIDGE_HOST: "127.0.0.1"
        },
        stdio: ["pipe", "pipe", "pipe"]
    })

    let buffer = ""
    let nextId = 1
    let stderr = ""
    const pending = new Map()

    child.stdout.on("data", chunk => {
        buffer += chunk.toString("utf8")
        let newline
        while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            if (!line) continue
            try {
                const message = JSON.parse(line)
                const waiter = pending.get(message.id)
                if (waiter) {
                    pending.delete(message.id)
                    clearTimeout(waiter.timer)
                    waiter.resolve(message)
                }
            } catch {
                // Ignore non-protocol diagnostics; stdio output may include them.
            }
        }
    })
    child.stderr.on("data", chunk => { stderr += chunk.toString("utf8") })
    child.on("error", error => {
        for (const waiter of pending.values()) {
            clearTimeout(waiter.timer)
            waiter.reject(error)
        }
        pending.clear()
    })
    child.on("exit", code => {
        for (const waiter of pending.values()) {
            clearTimeout(waiter.timer)
            waiter.reject(new Error(`MCP process exited (${code}):\n${stderr}`))
        }
        pending.clear()
    })

    return {
        child,
        request(method, params = {}) {
            const id = nextId++
            const message = { jsonrpc: "2.0", id, method, params }
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.delete(id)
                    reject(new Error(`MCP request timed out: ${method}\n${stderr}`))
                }, 10000)
                pending.set(id, { resolve, reject, timer })
                child.stdin.write(JSON.stringify(message) + "\n", error => {
                    if (!error) return
                    const waiter = pending.get(id)
                    if (waiter) {
                        pending.delete(id)
                        clearTimeout(waiter.timer)
                        reject(error)
                    }
                })
            })
        },
        notify(method, params = {}) {
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")
        }
    }
}

async function main() {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codogma-security-smoke-"))
    const projectDir = path.join(tempRoot, "project")
    const outsideDir = path.join(tempRoot, "outside")
    await fs.mkdir(projectDir, { recursive: true })
    await fs.mkdir(outsideDir, { recursive: true })
    await fs.writeFile(path.join(outsideDir, "secret.txt"), "outside-project-secret", "utf8")
    await fs.symlink(outsideDir, path.join(projectDir, "outside-link"), "dir")

    const port = await freePort()
    let bridgePort = await freePort()
    if (bridgePort === port) bridgePort = await freePort()

    let logs = ""
    const server = spawn(process.execPath, [path.join(ROOT, "server", "server.mjs")], {
        cwd: ROOT,
        env: {
            ...process.env,
            PORT: String(port),
            MCP_BRIDGE_PORT: String(bridgePort),
            PROJECT_DIR: projectDir,
            EDITOR_DIR
        },
        stdio: ["ignore", "pipe", "pipe"]
    })
    server.stdout.on("data", chunk => { logs += chunk.toString("utf8") })
    server.stderr.on("data", chunk => { logs += chunk.toString("utf8") })

    let mcp
    try {
        await waitForHttpServer(port, server, () => logs)
        const host = `127.0.0.1:${port}`

        const allowed = await request(port, "/editor/product.json", { headers: { host } })
        assert.equal(allowed.status, 200, "loopback request should be accepted")

        const hostileHost = await request(port, "/editor/product.json", {
            headers: { host: "attacker.example" }
        })
        assert.equal(hostileHost.status, 403, "non-loopback Host header should be rejected")

        const hostileOrigin = await request(port, "/editor/product.json", {
            headers: { host, origin: "http://attacker.example" }
        })
        assert.equal(hostileOrigin.status, 403, "cross-origin browser requests should be rejected")

        const symlinkRead = await request(port, "/editor/project/outside-link/secret.txt", { headers: { host } })
        assert.equal(symlinkRead.status, 403, "project static serving must reject a symlink escaping the project")

        const listing = await request(port, "/editor/api", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: JSON.stringify({ method: "GetProjectFiles" })
        })
        assert.equal(listing.status, 200)
        assert.equal(listing.body.includes("outside-link"), false, "project listings must not follow symlink directories")

        const symlinkWrite = await request(port, "/editor/api", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: JSON.stringify({
                method: "SetFileString",
                body: { path: "outside-link/created.txt", content: "should not escape" }
            })
        })
        assert.equal(JSON.parse(symlinkWrite.body).error, "invalid path", "API writes must reject symlink escapes")
        await assert.rejects(fs.access(path.join(outsideDir, "created.txt")), "no file may be created outside the project")

        // Exercise the officially distributed MCP stdio package after the Zod override.
        mcp = createMcpClient(bridgePort, projectDir)
        const initialized = await mcp.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "codogma-security-smoke", version: "1.0.0" }
        })
        assert.ok(initialized.result?.serverInfo, "official MCP package should initialize")
        mcp.notify("notifications/initialized", {})

        const toolList = await mcp.request("tools/list")
        const tools = toolList.result?.tools
        assert.ok(Array.isArray(tools), "official MCP package should list tools")
        assert.ok(tools.some(tool => tool.name === "ide-get-all-scenes-in-project"), "expected scene-list tool must exist")

        const toolCall = await mcp.request("tools/call", {
            name: "ide-get-all-scenes-in-project",
            arguments: {}
        })
        assert.ok(toolCall.result && !toolCall.result.isError, "MCP tool call should succeed with patched Zod")
        const toolText = (toolCall.result.content || []).filter(item => item.type === "text").map(item => item.text).join("\n")
        assert.ok(Array.isArray(JSON.parse(toolText).scenes), "scene-list tool should return valid scene data")

        console.log("Security smoke checks passed: loopback/origin guard, symlink containment, and official MCP/Zod compatibility.")
    } finally {
        if (mcp?.child && mcp.child.exitCode === null) mcp.child.kill()
        if (server.exitCode === null) server.kill()
        await fs.rm(tempRoot, { recursive: true, force: true })
    }
}

main().catch(error => {
    console.error("Security smoke test failed:", error.stack || error.message)
    process.exitCode = 1
})
