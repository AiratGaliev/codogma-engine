import assert from "node:assert/strict"
import { test } from "vitest";
import { spawn } from "node:child_process"
import { createServer as createNetServer } from "node:net"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(testDirectory, "../../..")
const projectDirectory = join(repositoryRoot, "tests", "workspace", "test-typescript")

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

async function startEditorServer(editorUi: "solidjs" | "legacy"): Promise<{ origin: string; stop: () => Promise<void> }> {
    const port = await reserveLoopbackPort()
    const child = spawn(process.execPath, [join(repositoryRoot, "server", "server.ts")], {
        cwd: repositoryRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
            ...process.env,
            PORT: String(port),
            PROJECT_DIR: projectDirectory,
            CODOGMA_EDITOR_UI: editorUi,
            EDITOR_HOST_DIR: join(repositoryRoot, "src", "editor", "dist"),
            CODOGMA_ALLOWED_ORIGINS: "",
            CODOGMA_ALLOWED_HOSTS: "",
            MCP_BRIDGE_PORT: "0"
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
            throw new Error(`Editor server exited during startup (${editorUi}):\n${output}`)
        }
        try {
            const response = await fetch(`${origin}/editor/host-mode`)
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
        throw new Error(`Editor server did not become ready (${editorUi}):\n${output}`)
    }

    return {
        origin,
        stop: async () => {
            if (child.exitCode !== null || child.signalCode !== null) return
            const exited = new Promise<void>((resolvePromise) => child.once("exit", () => resolvePromise()))
            child.kill("SIGTERM")
            await Promise.race([
                exited,
                new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 3000))
            ])
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
        }
    }
}

test("Node server switches between SolidJS production Host and legacy rollback without changing APIs", async () => {
    const solid = await startEditorServer("solidjs")
    try {
        const mode = await fetch(`${solid.origin}/editor/host-mode`).then(response => response.json())
        assert.equal(mode.ui, "solidjs")
        assert.equal(mode.rollbackAvailable, true)

        const pageResponse = await fetch(`${solid.origin}/editor/`)
        assert.equal(pageResponse.status, 200)
        const html = await pageResponse.text()
        assert.match(html, /<title>Codogma Engine/)
        assert.match(html, /\/editor\/assets\/[^"]+\.js/)
        assert.doesNotMatch(html, /phasereditor2d\.ide/i)

        const assetPath = html.match(/src="(\/editor\/assets\/[^"]+\.js)"/)?.[1]
        assert.ok(assetPath, "the SolidJS HTML should reference a Vite production chunk")
        const assetResponse = await fetch(`${solid.origin}${assetPath}`)
        assert.equal(assetResponse.status, 200)
        assert.match(assetResponse.headers.get("content-type") ?? "", /javascript/)
        assert.match(assetResponse.headers.get("cache-control") ?? "", /immutable/)
        assert.ok((await assetResponse.text()).length > 1000)

        const projectResponse = await fetch(`${solid.origin}/editor/api`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method: "GetProjectFiles", body: {} })
        })
        assert.equal(projectResponse.status, 200)
        const project = await projectResponse.json()
        assert.equal(project.rootFile.name, "test-typescript")
    } finally {
        await solid.stop()
    }

    const legacy = await startEditorServer("legacy")
    try {
        const mode = await fetch(`${legacy.origin}/editor/host-mode`).then(response => response.json())
        assert.equal(mode.ui, "legacy")
        assert.equal(mode.rollbackAvailable, false)

        const response = await fetch(`${legacy.origin}/editor/`)
        assert.equal(response.status, 200)
        const html = await response.text()
        assert.match(html, /\/editor\/app\/plugins\//)
        assert.doesNotMatch(html, /\/editor\/assets\/index-[^"]+\.js/)
    } finally {
        await legacy.stop()
    }
})
