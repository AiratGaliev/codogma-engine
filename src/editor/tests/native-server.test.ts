import assert from "node:assert/strict"
import { test } from "vitest"
import { spawn } from "node:child_process"
import { createServer as createNetServer } from "node:net"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(testDirectory, "../../..")
const projectDirectory = join(repositoryRoot, "packages", "cge", "tests", "fixtures", "acceptance-project")
const editorHostDirectory = join(repositoryRoot, "src", "editor", "dist")

async function reserveLoopbackPort(): Promise<number> {
    const server = createNetServer()
    await new Promise<void>((resolvePromise, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolvePromise)
    })
    const address = server.address()
    assert.ok(address && typeof address === "object")
    await new Promise<void>((resolvePromise, reject) => server.close(error => error ? reject(error) : resolvePromise()))
    return address.port
}

async function startNativeEditorServer(): Promise<{ origin: string; stop: () => Promise<void> }> {
    const port = await reserveLoopbackPort()
    const child = spawn(process.execPath, [join(repositoryRoot, "server", "server.mjs")], {
        cwd: repositoryRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
            ...process.env,
            PORT: String(port),
            PROJECT_DIR: projectDirectory,
            EDITOR_HOST_DIR: editorHostDirectory,
            CODOGMA_ALLOWED_ORIGINS: "",
            CODOGMA_ALLOWED_HOSTS: ""
        }
    })

    let output = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", chunk => { output += chunk })
    child.stderr.on("data", chunk => { output += chunk })

    const origin = `http://127.0.0.1:${port}`
    let ready = false
    for (let attempt = 0; attempt < 80; attempt++) {
        if (child.exitCode !== null || child.signalCode !== null) {
            throw new Error(`Editor server exited during startup:\n${output}`)
        }
        try {
            const response = await fetch(`${origin}/editor/mcp-bridge-status`)
            if (response.ok) {
                ready = true
                break
            }
        } catch {
            // The loopback server has not bound its socket yet.
        }
        await new Promise(resolvePromise => setTimeout(resolvePromise, 50))
    }

    if (!ready) {
        child.kill("SIGTERM")
        throw new Error(`Editor server did not become ready:\n${output}`)
    }

    return {
        origin,
        stop: async () => {
            if (child.exitCode !== null || child.signalCode !== null) return
            const exited = new Promise<void>(resolvePromise => child.once("exit", () => resolvePromise()))
            child.kill("SIGTERM")
            await Promise.race([
                exited,
                new Promise<void>(resolvePromise => setTimeout(resolvePromise, 3000))
            ])
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
        }
    }
}

test("Node server serves the native Editor Host, Project Model and runtime assets", async () => {
    const server = await startNativeEditorServer()
    try {
        const pageResponse = await fetch(`${server.origin}/editor/`)
        assert.equal(pageResponse.status, 200)
        const html = await pageResponse.text()
        assert.match(html, /<title>Codogma Engine/)
        assert.match(html, /\/editor\/assets\/[^"]+\.js/)

        const assetPath = html.match(/src="(\/editor\/assets\/[^"]+\.js)"/)?.[1]
        assert.ok(assetPath, "the native Host HTML should reference a Vite production chunk")
        const assetResponse = await fetch(`${server.origin}${assetPath}`)
        assert.equal(assetResponse.status, 200)
        assert.match(assetResponse.headers.get("content-type") ?? "", /javascript/)
        assert.match(assetResponse.headers.get("cache-control") ?? "", /immutable/)
        assert.ok((await assetResponse.text()).length > 1000)

        const iconResponse = await fetch(`${server.origin}/editor/icons/dark/godot/folder.svg`)
        assert.equal(iconResponse.status, 200)
        assert.match(iconResponse.headers.get("content-type") ?? "", /image\/svg\+xml/)
        assert.match(await iconResponse.text(), /<svg\b/)

        const projectResponse = await fetch(`${server.origin}/editor/project/project.json`)
        assert.equal(projectResponse.status, 200)
        const projectDocument = await projectResponse.json()
        assert.equal(projectDocument.schemaVersion, 1)

        const projectAssetResponse = await fetch(`${server.origin}/editor/external/assets/player.svg`)
        assert.equal(projectAssetResponse.status, 200)
        assert.match(projectAssetResponse.headers.get("content-type") ?? "", /image\/svg\+xml/)

        const bridgeResponse = await fetch(`${server.origin}/editor/mcp-bridge-status`)
        assert.equal(bridgeResponse.status, 200)
        const bridge = await bridgeResponse.json()
        assert.equal(bridge.connected, false)
        assert.equal(bridge.clients, 0)
        assert.deepEqual(bridge.sessions, [])
    } finally {
        await server.stop()
    }
})
