#!/usr/bin/env node
/**
 * Codogma Engine — MCP stdio launcher.
 *
 * Zero-dependency Model Context Protocol server over stdio (JSON-RPC 2.0),
 * mirroring the official `@phaserjs/editor-mcp-server` bin: every tool call is
 * forwarded to the running editor instance through the MCP Bridge
 * (http://127.0.0.1:<port>/editor/mcp-bridge).
 *
 * Usage in Claude Desktop / Cursor / VS Code:
 * {
 *   "mcpServers": {
 *     "phaser-editor": {
 *       "command": "node",
 *       "args": ["/home/z/my-project/server/mcp-stdio.mjs"]
 *     }
 *   }
 * }
 *
 * Environment:
 *   PHASER_EDITOR_URL   full bridge URL (default http://127.0.0.1:3000/editor/mcp-bridge)
 *   PORT                editor server port if PHASER_EDITOR_URL not set (default 3000)
 */

import readline from "readline"

const BRIDGE_URL = process.env.PHASER_EDITOR_URL
    || `http://127.0.0.1:${process.env.PORT || 3000}/editor/mcp-bridge`

const SERVER_INFO = {
    name: "phaser-editor-mcp",
    title: "Codogma Engine MCP Server (local open-source implementation)",
    version: "1.0.0"
}

let toolsCache = null

async function postBridge(body) {
    try {
        const resp = await fetch(BRIDGE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        return await resp.json()
    } catch (e) {
        return {
            error: `Could not connect to Codogma Engine at ${BRIDGE_URL}. Ensure the editor server is running (node server/server.mjs) and the editor page is open in a browser.`,
            details: e.message
        }
    }
}

async function listTools() {
    if (toolsCache) return toolsCache
    const result = await postBridge({ tool: "__tools_list__", args: {} })
    toolsCache = result.tools || []
    return toolsCache
}

function writeMessage(msg) {
    process.stdout.write(JSON.stringify(msg) + "\n")
}

function reply(id, result) {
    writeMessage({ jsonrpc: "2.0", id, result })
}

function replyError(id, code, message) {
    writeMessage({ jsonrpc: "2.0", id, error: { code, message } })
}

const rl = readline.createInterface({ input: process.stdin, terminal: false })

rl.on("line", async line => {
    const trimmed = line.trim()
    if (!trimmed) return

    let msg
    try {
        msg = JSON.parse(trimmed)
    } catch (e) {
        return
    }

    const { id, method, params } = msg
    const isNotification = id === undefined || id === null

    try {
        switch (method) {

            case "initialize":
                reply(id, {
                    protocolVersion: params?.protocolVersion || "2024-11-05",
                    capabilities: { tools: {} },
                    serverInfo: SERVER_INFO,
                    instructions: "Codogma Engine MCP server. Call the `get-system-instructions` tool first to learn how to build the arguments of the scene/asset tools."
                })
                break

            case "notifications/initialized":
                // no response for notifications
                break

            case "ping":
                reply(id, {})
                break

            case "tools/list": {
                const tools = await listTools()
                reply(id, { tools })
                break
            }

            case "tools/call": {
                const name = params?.name
                const args = params?.arguments || {}
                if (name === "get-system-instructions") {
                    // served locally (also available through the bridge)
                }
                const result = await postBridge({ tool: name, args })
                if (result.error) {
                    reply(id, {
                        content: [{ type: "text", text: `Tool '${name}' error: ${result.error}` }],
                        isError: true
                    })
                } else {
                    reply(id, result)
                }
                break
            }

            default:
                if (!isNotification) {
                    replyError(id, -32601, `Method not found: ${method}`)
                }
        }
    } catch (e) {
        if (!isNotification) {
            replyError(id, -32603, String(e.message || e))
        }
    }
})

process.stderr.write(`Codogma Engine MCP stdio server -> ${BRIDGE_URL}\n`)
