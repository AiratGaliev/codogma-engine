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

function requestHeadersOnly(port, requestPath, headers) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1")
        let responseHead = ""
        let settled = false

        const finish = (error, status) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            socket.destroy()
            if (error) reject(error)
            else resolve({ status })
        }

        const timer = setTimeout(() => {
            finish(new Error(`Timed out waiting for early HTTP rejection for ${requestPath}`))
        }, 5000)

        socket.on("connect", () => {
            const lines = [
                `POST ${requestPath} HTTP/1.1`,
                ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
                "",
                ""
            ]
            socket.write(lines.join("\r\n"))
        })
        socket.on("data", chunk => {
            responseHead += chunk.toString("latin1")
            const headerEnd = responseHead.indexOf("\r\n\r\n")
            if (headerEnd < 0) return
            const statusLine = responseHead.slice(0, responseHead.indexOf("\r\n"))
            const match = statusLine.match(/^HTTP\/\d(?:\.\d)? (\d{3})/)
            if (!match) return finish(new Error(`Invalid HTTP status line: ${statusLine}`))
            finish(null, Number(match[1]))
        })
        socket.on("error", error => finish(error))
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

async function stopChild(child) {
    if (!child || child.exitCode !== null) return

    const exited = once(child, "exit").catch(() => undefined)
    child.kill()
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))])
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
    await fs.writeFile(path.join(outsideDir, "project-config.json"), JSON.stringify({ outsideSecret: "outside-project-config-secret" }), "utf8")

    let symlinkChecksAvailable = true
    try {
        await fs.symlink(outsideDir, path.join(projectDir, "outside-link"), "dir")
        await fs.symlink(path.join(outsideDir, "dangling-file.txt"), path.join(projectDir, "dangling-file"), "file")
        await fs.symlink(path.join(outsideDir, "dangling-folder"), path.join(projectDir, "dangling-folder"), "dir")
        await fs.symlink(path.join(outsideDir, "secret.txt"), path.join(projectDir, "upload-link.txt"), "file")
        await fs.symlink(path.join(outsideDir, "project-config.json"), path.join(projectDir, "phasereditor2d.json"), "file")
        await fs.mkdir(path.join(projectDir, "inside-dir"), { recursive: true })
        await fs.symlink(path.join(projectDir, "inside-dir"), path.join(projectDir, "inside-link"), "dir")
    } catch (error) {
        const canSkipForWindows = process.platform === "win32"
            && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)

        if (!canSkipForWindows) throw error

        symlinkChecksAvailable = false
        for (const name of ["outside-link", "dangling-file", "dangling-folder", "upload-link.txt", "phasereditor2d.json", "inside-link", "inside-dir"]) {
            await fs.rm(path.join(projectDir, name), { force: true, recursive: true })
        }
        console.warn("Skipping symlink-specific checks: Windows does not permit creating symbolic links in this environment.")
    }

    const port = await freePort()
    let bridgePort = await freePort()
    if (bridgePort === port) bridgePort = await freePort()

    let logs = ""
    let server = spawn(process.execPath, [path.join(ROOT, "server", "server.mjs")], {
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

        // Declared oversize bodies must be rejected from headers without
        // buffering the claimed body or returning an HTTP 200 error payload.
        const oversizedJson = await requestHeadersOnly(port, "/editor/api", {
            host,
            "content-type": "application/json",
            "content-length": String(32 * 1024 * 1024 + 1),
            connection: "close"
        })
        assert.equal(oversizedJson.status, 413, "oversized JSON API bodies must receive HTTP 413")

        const oversizedUpload = await requestHeadersOnly(port, "/editor/upload", {
            host,
            "content-type": "multipart/form-data; boundary=codogma-limit-test",
            "content-length": String(128 * 1024 * 1024 + 1),
            connection: "close"
        })
        assert.equal(oversizedUpload.status, 413, "oversized multipart bodies must receive HTTP 413")

        const malformedJson = await request(port, "/editor/api", {
            method: "POST",
            headers: { host, "content-type": "application/json" },
            body: "{"
        })
        assert.equal(malformedJson.status, 400, "malformed JSON API bodies must receive HTTP 400")
        assert.equal(JSON.parse(malformedJson.body).error, "invalid request body")

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

        if (symlinkChecksAvailable) {
            const configRead = await request(port, "/editor/api", {
                method: "POST",
                headers: { host, "content-type": "application/json" },
                body: JSON.stringify({ method: "GetProjectConfig" })
            })
            assert.deepEqual(JSON.parse(configRead.body), {},
                "GetProjectConfig must not read a project-root symlink that points outside the project")

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
            await assert.rejects(fs.access(path.join(outsideDir, "created.txt")), /ENOENT/, "no file may be created outside the project")

            const danglingWrite = await request(port, "/editor/api", {
                method: "POST",
                headers: { host, "content-type": "application/json" },
                body: JSON.stringify({
                    method: "SetFileString",
                    body: { path: "dangling-file", content: "must not follow a dangling link" }
                })
            })
            assert.equal(JSON.parse(danglingWrite.body).error, "invalid path", "dangling file symlinks must be rejected")
            await assert.rejects(fs.access(path.join(outsideDir, "dangling-file.txt")), /ENOENT/, "dangling symlink writes must not create files outside the project")

            // Multipart uploads must validate the final file target, not only its parent directory.
            const boundary = "----codogma-upload-security-boundary"
            const multipartBody = [
                `--${boundary}`,
                `Content-Disposition: form-data; name="uploadTo"`,
                "",
                "",
                `--${boundary}`,
                `Content-Disposition: form-data; name="file"; filename="upload-link.txt"`,
                "Content-Type: text/plain",
                "",
                "attempted-overwrite",
                `--${boundary}--`,
                ""
            ].join("\r\n")

            const symlinkUpload = await request(port, "/editor/upload", {
                method: "POST",
                headers: { host, "content-type": `multipart/form-data; boundary=${boundary}` },
                body: multipartBody
            })

            assert.equal(JSON.parse(symlinkUpload.body).error, "invalid upload path",
                "multipart uploads must reject a file symlink escaping the project")
            assert.equal(await fs.readFile(path.join(outsideDir, "secret.txt"), "utf8"), "outside-project-secret",
                "multipart uploads must not overwrite a file outside the project")

            // --- success-path sanity for the hardened write path ---
            const api = (method, body) => request(port, "/editor/api", {
                method: "POST",
                headers: { host, "content-type": "application/json" },
                body: JSON.stringify({ method, body })
            })

            const writeOk = await api("SetFileString", { path: "in-project.txt", content: "project file content" })
            assert.equal(writeOk.status, 200, `SetFileString must still succeed for plain project files: ${writeOk.body}`)
            assert.equal(JSON.parse(writeOk.body).error, undefined, "SetFileString success must not carry an error")
            const written = await fs.readFile(path.join(projectDir, "in-project.txt"), "utf8")
            assert.equal(written, "project file content", "written content must be readable back from disk")

            const uploadedOk = await request(port, "/editor/upload", {
                method: "POST",
                headers: { host, "content-type": `multipart/form-data; boundary=${boundary}` },
                body: [
                    `--${boundary}`,
                    `Content-Disposition: form-data; name="uploadTo"`,
                    "",
                    "",
                    `--${boundary}`,
                    `Content-Disposition: form-data; name="file"; filename="uploaded.txt"`,
                    "Content-Type: text/plain",
                    "",
                    "uploaded-content",
                    `--${boundary}--`,
                    ""
                ].join("\r\n")
            })
            assert.equal(uploadedOk.status, 200, `plain upload must still succeed: ${uploadedOk.body}`)
            assert.equal(await fs.readFile(path.join(projectDir, "uploaded.txt"), "utf8"), "uploaded-content",
                "uploaded content must be readable back from disk")

            const copyOk = await api("CopyFile", { fromPath: "in-project.txt", toPath: "copy-in-project.txt" })
            assert.equal(copyOk.status, 200, `CopyFile must still succeed inside the project: ${copyOk.body}`)
            await assert.doesNotReject(fs.access(path.join(projectDir, "copy-in-project.txt")),
                "copied file must exist")

            // --- create-folder escape attempts ---
            const mkdirEscape = await api("CreateFolder", { path: "outside-link/newdir" })
            assert.equal(JSON.parse(mkdirEscape.body).error, "invalid path",
                "CreateFolder must reject a symlinked parent pointing outside the project")
            await assert.rejects(fs.access(path.join(outsideDir, "newdir")), /ENOENT/,
                "CreateFolder must not create folders outside the project")

            const mkdirDangling = await api("CreateFolder", { path: "dangling-folder/sub" })
            assert.equal(JSON.parse(mkdirDangling.body).error, "invalid path",
                "CreateFolder must reject dangling-symlink parents")
            await assert.rejects(fs.access(path.join(outsideDir, "dangling-folder")), /ENOENT/,
                "CreateFolder must not create the dangling symlink target")

            // --- copy escape attempts ---
            const copyFromOutside = await api("CopyFile", { fromPath: "outside-link/secret.txt", toPath: "copy-outside.txt" })
            assert.equal(JSON.parse(copyFromOutside.body).error, "invalid path",
                "CopyFile must reject a source symlink escaping the project")
            await assert.rejects(fs.access(path.join(projectDir, "copy-outside.txt")), /ENOENT/,
                "CopyFile must not copy outside content into the project through a symlink")

            const copyToSymlink = await api("CopyFile", { fromPath: "in-project.txt", toPath: "upload-link.txt" })
            assert.equal(JSON.parse(copyToSymlink.body).error, "invalid path",
                "CopyFile must reject a symlink destination it would write through")
            assert.equal(await fs.readFile(path.join(outsideDir, "secret.txt"), "utf8"), "outside-project-secret",
                "CopyFile must not overwrite the symlink's outside target")

            // --- rename / move escape attempts ---
            const renameFromOutside = await api("RenameFile", { oldPath: "outside-link/secret.txt", newPath: "renamed.txt" })
            assert.equal(JSON.parse(renameFromOutside.body).error, "invalid path",
                "RenameFile must reject a source symlink escaping the project")
            await assert.doesNotReject(fs.access(path.join(outsideDir, "secret.txt")),
                "RenameFile must not move the outside target")

            const renameToOutside = await api("RenameFile", { oldPath: "in-project.txt", newPath: "outside-link/renamed.txt" })
            assert.equal(JSON.parse(renameToOutside.body).error, "invalid path",
                "RenameFile must reject a destination parent outside the project")
            await assert.doesNotReject(fs.access(path.join(projectDir, "in-project.txt")),
                "RenameFile must keep the source file")

            const moveOutside = await api("MoveFiles", { movingPaths: ["in-project.txt"], movingToPath: "outside-link" })
            assert.equal(JSON.parse(moveOutside.body).error, "invalid path",
                "MoveFiles must reject a destination folder outside the project")
            await assert.doesNotReject(fs.access(path.join(projectDir, "in-project.txt")),
                "MoveFiles must keep the moved file")

            // --- delete attempts through symlinks ---
            const deleteThroughSymlink = await api("DeleteFiles", { paths: ["outside-link/secret.txt"] })
            assert.equal(deleteThroughSymlink.status, 200)
            assert.equal(await fs.readFile(path.join(outsideDir, "secret.txt"), "utf8"), "outside-project-secret",
                "DeleteFiles must not delete the target of an outside symlink")

            const deleteSymlink = await api("DeleteFiles", { paths: ["outside-link"] })
            assert.equal(deleteSymlink.status, 200, "deleting an outside-pointing symlink entry must not fail")
            assert.equal(await fs.readFile(path.join(outsideDir, "secret.txt"), "utf8"), "outside-project-secret",
                "DeleteFiles must never touch the symlink's outside target")
            // Fail-closed: outside-pointing symlinks are invisible to the editor
            // listings and are never followed; their removal is left to the user.

            // An inside-pointing symlink is unlinked as the link itself; the
            // target directory must survive.
            const deleteInsideLink = await api("DeleteFiles", { paths: ["inside-link"] })
            assert.equal(deleteInsideLink.status, 200, "deleting an inside-pointing symlink entry must succeed")
            await assert.rejects(fs.lstat(path.join(projectDir, "inside-link")), /ENOENT/,
                "DeleteFiles must remove the inside-pointing link itself")
            await assert.doesNotReject(fs.access(path.join(projectDir, "inside-dir")),
                "DeleteFiles must not delete the link's target directory")
        }

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

        if (symlinkChecksAvailable) {
            // Verify the built-in MCP dispatcher directly so this is testing the
            // repository's safeJoin path, not optional-argument defaults in the
            // third-party stdio adapter.
            const danglingMcpWrite = await request(port, "/editor/mcp", {
                method: "POST",
                headers: { host, "content-type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 2,
                    method: "tools/call",
                    params: {
                        name: "ide-create-new-scene",
                        arguments: { name: "MustNotEscape", folder: "dangling-folder" }
                    }
                })
            })
            const danglingMcpResponse = JSON.parse(danglingMcpWrite.body)
            assert.ok(danglingMcpResponse.result?.isError || danglingMcpResponse.error
                || /invalid folder|invalid path/i.test(JSON.stringify(danglingMcpResponse.result?.content || [])),
                `Built-in MCP scene creation must reject a dangling symlink folder; response: ${danglingMcpWrite.body}`)
            await assert.rejects(fs.access(path.join(outsideDir, "dangling-folder")), /ENOENT/,
                "MCP scene creation must not create an outside folder through a dangling symlink")
        }

        // --- /archive/ snapshot download route ---
        // Full-project archives live in the repository root and are never
        // committed. The route must serve them through the standard guard,
        // redirect /archive/ to the newest snapshot, and reject traversal,
        // non-archive names, wrong methods and missing files.
        const smokeArchiveName = "codogma-engine-smoketest-20260101-0000-dev+0commits.zip"
        const smokeArchivePath = path.join(ROOT, smokeArchiveName)
        const smokeArchiveBody = "codogma-security-smoke archive payload"
        await fs.writeFile(smokeArchivePath, smokeArchiveBody)

        try {
            const archiveRedirect = await request(port, "/archive/")
            assert.equal(archiveRedirect.status, 302, "/archive/ must redirect to the newest snapshot")
            assert.ok(
                String(archiveRedirect.headers.location || "").includes(encodeURIComponent(smokeArchiveName)),
                "/archive/ must redirect to the newest codogma-engine-*.zip")

            const archiveUrl = "/archive/" + encodeURIComponent(smokeArchiveName)
            const archiveFetch = await request(port, archiveUrl)
            assert.equal(archiveFetch.status, 200, "a valid archive name must be served")
            assert.equal(archiveFetch.headers["content-type"], "application/zip")
            assert.equal(archiveFetch.body, smokeArchiveBody, "the served bytes must match the file")

            const archiveHead = await request(port, archiveUrl, { method: "HEAD" })
            assert.equal(archiveHead.status, 200, "HEAD must return archive metadata")
            assert.equal(archiveHead.headers["content-length"], String(Buffer.byteLength(smokeArchiveBody)))
            assert.equal(archiveHead.body, "", "HEAD must not return the archive body")

            // A matching filename must not make an arbitrary symlink target
            // downloadable through this development-only archive endpoint.
            const symlinkArchiveName = "codogma-engine-linktest-20260101-0000-dev+0commits.zip"
            const symlinkArchivePath = path.join(ROOT, symlinkArchiveName)
            try {
                await fs.symlink(path.join(ROOT, "package.json"), symlinkArchivePath)
                const archiveSymlink = await request(port, "/archive/" + encodeURIComponent(symlinkArchiveName))
                assert.equal(archiveSymlink.status, 404, "symlinked archives must not be served")
            } catch (error) {
                if (!["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP"].includes(error.code)) throw error
                console.warn("Skipping archive symlink check: this environment does not permit creating symbolic links.")
            } finally {
                await fs.rm(symlinkArchivePath, { force: true })
            }

            const archiveTraversal = await request(port, "/archive/..%2Fpackage.json")
            assert.equal(archiveTraversal.status, 400, "traversal names must be rejected")

            const archiveBadName = await request(port, "/archive/evil.txt")
            assert.equal(archiveBadName.status, 400, "non-archive names must be rejected")

            const archiveMissing = await request(port, "/archive/codogma-engine-missing-20260101-0000-dev+0commits.zip")
            assert.equal(archiveMissing.status, 404, "a missing archive must 404")

            const archivePost = await request(port, "/archive/", { method: "POST" })
            assert.equal(archivePost.status, 405, "only GET/HEAD are allowed")
        } finally {
            await fs.rm(smokeArchivePath, { force: true })
        }

        const symlinkSummary = symlinkChecksAvailable
            ? "symlink containment and dangling-link protection"
            : "symlink checks skipped (permissions unavailable)"

        // --- trusted reverse proxy scenario (CODOGMA_ALLOWED_HOSTS) ---
        // Sandbox previews and tunnels put a local proxy in front of the
        // loopback server; it connects from 127.0.0.1 but forwards the public
        // Host header. The default must stay strict and the explicit
        // allow-list must open exactly the listed hosts while keeping the
        // same-origin Origin enforcement.
        await stopChild(server)
        server = spawn(process.execPath, [path.join(ROOT, "server", "server.mjs")], {
            cwd: ROOT,
            env: {
                ...process.env,
                PORT: String(port),
                MCP_BRIDGE_PORT: String(bridgePort),
                PROJECT_DIR: projectDir,
                EDITOR_DIR,
                CODOGMA_ALLOWED_HOSTS: "preview.example,alt.example"
            },
            stdio: ["ignore", "pipe", "pipe"]
        })
        server.stdout.on("data", chunk => { logs += chunk.toString("utf8") })
        server.stderr.on("data", chunk => { logs += chunk.toString("utf8") })
        await waitForHttpServer(port, server, () => logs)

        const proxyOk = await request(port, "/editor/product.json", { headers: { host: "preview.example" } })
        assert.equal(proxyOk.status, 200, "an allow-listed Host from a loopback proxy must be accepted")

        const proxyPorted = await request(port, "/editor/product.json", { headers: { host: "alt.example:8443" } })
        assert.equal(proxyPorted.status, 200, "the allow-list must be port-insensitive on Host")

        const proxyUnknown = await request(port, "/editor/product.json", { headers: { host: "attacker.example" } })
        assert.equal(proxyUnknown.status, 403, "non-listed Host headers must stay rejected under an allow-list")

        const proxySameOrigin = await request(port, "/editor/product.json", {
            headers: { host: "preview.example", origin: "https://preview.example" }
        })
        assert.equal(proxySameOrigin.status, 200, "an https same-origin request behind the proxy must be accepted")

        const proxyCrossOrigin = await request(port, "/editor/product.json", {
            headers: { host: "preview.example", origin: "https://attacker.example" }
        })
        assert.equal(proxyCrossOrigin.status, 403, "cross-origin requests must stay rejected behind the proxy")

        // --- Host-rewriting gateway scenario (CODOGMA_ALLOWED_ORIGINS) ---
        // Some platforms (the sandbox preview among them) rewrite the Host
        // header to an internal gateway name the browser never sees, so the
        // browser Origin can never equal Host. The origin allow-list must
        // open exactly the listed origins while the attacker-origin rejection
        // and the Host allow-list keep applying.
        await stopChild(server)
        server = spawn(process.execPath, [path.join(ROOT, "server", "server.mjs")], {
            cwd: ROOT,
            env: {
                ...process.env,
                PORT: String(port),
                MCP_BRIDGE_PORT: String(bridgePort),
                PROJECT_DIR: projectDir,
                EDITOR_DIR,
                CODOGMA_ALLOWED_HOSTS: "gateway.internal.example",
                CODOGMA_ALLOWED_ORIGINS: "https://*.preview.example"
            },
            stdio: ["ignore", "pipe", "pipe"]
        })
        server.stdout.on("data", chunk => { logs += chunk.toString("utf8") })
        server.stderr.on("data", chunk => { logs += chunk.toString("utf8") })
        await waitForHttpServer(port, server, () => logs)

        const originAllowListed = await request(port, "/editor/product.json", {
            headers: { host: "gateway.internal.example", origin: "https://app.preview.example" }
        })
        assert.equal(originAllowListed.status, 200, "an allow-listed origin must pass even when Host is rewritten by the gateway")

        const originWildcardSubdomain = await request(port, "/editor/product.json", {
            headers: { host: "gateway.internal.example", origin: "https://preview-chat-1234.preview.example" }
        })
        assert.equal(originWildcardSubdomain.status, 200, "the subdomain wildcard must match real subdomains")

        const originWrongScheme = await request(port, "/editor/product.json", {
            headers: { host: "gateway.internal.example", origin: "http://app.preview.example" }
        })
        assert.equal(originWrongScheme.status, 403, "the origin allow-list must stay scheme-locked")

        const originUnlisted = await request(port, "/editor/product.json", {
            headers: { host: "gateway.internal.example", origin: "https://attacker.example" }
        })
        assert.equal(originUnlisted.status, 403, "unrelated origins must stay rejected by the origin allow-list")

        const originUnlistedHost = await request(port, "/editor/product.json", {
            headers: { host: "attacker.example", origin: "https://app.preview.example" }
        })
        assert.equal(originUnlistedHost.status, 403, "the origin allow-list must not open unlisted Host headers")

        console.log(`Security smoke checks passed: loopback/origin guard, /archive/ route, reverse-proxy allow-list, origin allow-list, ${symlinkSummary}, and official MCP/Zod compatibility.`)
    } finally {
        await stopChild(mcp?.child)
        await stopChild(server)
        await fs.rm(tempRoot, { recursive: true, force: true })
    }
}

main().catch(error => {
    console.error("Security smoke test failed:", error.stack || error.message)
    process.exitCode = 1
})
