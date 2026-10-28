#!/usr/bin/env node
/**
 * Codogma Engine — MCP launcher.
 *
 * Spawns the GENUINE official `@phaserjs/editor-mcp-server` npm package
 * (https://github.com/phaserjs/editor-mcp-server) and connects it with this
 * running editor instance through the v5-compatible MCP bridge port (1902):
 *
 *     official stdio MCP server  --{tool, args}-->  POST 127.0.0.1:1902  -->  this editor
 *
 * The official package validates the tool arguments with its own schemas and
 * serves the official system prompts, so external MCP hosts (Claude Desktop,
 * Cursor, VS Code, CLI agents) get exactly the same tool set and behavior as
 * with Codogma Engine — driven by this open-source editor build.
 *
 * Usage in an MCP host config:
 * {
 *   "mcpServers": {
 *     "phaser-editor": {
 *       "command": "node",
 *       "args": ["<project>/server/mcp-launcher.mjs"]
 *     }
 *   }
 * }
 *
 * Environment:
 *   MCP_BRIDGE_PORT   bridge port of the running editor server (default 1902)
 *   MCP_BRIDGE_HOST   bridge host (default 127.0.0.1)
 */

import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const BRIDGE_PORT = process.env.MCP_BRIDGE_PORT || "1902"
const BRIDGE_HOST = process.env.MCP_BRIDGE_HOST || "127.0.0.1"

function findOfficialPackage() {

    // 1) installed in this project
    const local = path.join(__dirname, "..", "node_modules", "@phaserjs", "editor-mcp-server", "build", "index.js")
    if (fs.existsSync(local)) return local

    // 2) resolvable from anywhere in NODE_PATH
    try {
        return require.resolve("@phaserjs/editor-mcp-server/build/index.js")
    } catch (e) {
        return null
    }
}

const official = findOfficialPackage()

/**
 * Probes the configured official-package bridge: it must answer a real tool
 * call with the documented contract (a JSON ARRAY of MCP content items). A
 * bridge that answers with an error object (e.g. "No Codogma Engine client is
 * connected") or does not answer at all would make the official server fail
 * its own CallToolResult validation ("content: expected array") for every
 * tool call — the launcher must fall back to the built-in stdio server in
 * that case, so external MCP hosts keep working.
 */
async function bridgeHasConnectedEditor() {

    try {

        const res = await fetch(`http://${BRIDGE_HOST}:${BRIDGE_PORT}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tool: "ide-get-all-scenes-in-project", args: {} }),
            signal: AbortSignal.timeout(5000)
        })

        if (!res.ok) {

            return false
        }

        return Array.isArray(await res.json())

    } catch (e) {

        return false
    }
}

if (official && await bridgeHasConnectedEditor()) {

    const child = spawn(process.execPath, [official], {
        stdio: "inherit",
        env: {
            ...process.env,
            "phaser-editor-mcp-port": BRIDGE_PORT,
            "phaser-editor-mcp-hostname": BRIDGE_HOST
        }
    })

    child.on("error", (e) => {
        console.error(`[phaser-editor-mcp] failed to start the official package: ${e.message}`)
        process.exit(1)
    })

    child.on("exit", (code) => process.exit(code ?? 0))

} else {

    // Fallback: zero-dependency built-in stdio server (same tool set via the
    // editor HTTP bridge at /editor/mcp-bridge).
    if (!official) {
        console.error("[phaser-editor-mcp] official package not installed; using the built-in stdio fallback.")
        console.error("[phaser-editor-mcp] run `npm install` in the project root to use the official package.")
    } else {
        console.error(`[phaser-editor-mcp] bridge ${BRIDGE_HOST}:${BRIDGE_PORT} has no connected editor or answers a wrong contract; using the built-in stdio fallback.`)
    }
    const fallback = spawn(process.execPath, [path.join(__dirname, "mcp-stdio.mjs")], {
        stdio: "inherit",
        env: { ...process.env }
    })
    fallback.on("exit", (code) => process.exit(code ?? 0))
}
