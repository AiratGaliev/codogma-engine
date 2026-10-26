/**
 * phaser-editor-mcp-bridge
 *
 * The OFFICIAL @phaserjs/editor-mcp-server npm package (spawned by AI hosts like
 * Cursor / Claude Desktop / VS Code over stdio) talks to the editor through plain HTTP POSTs:
 *
 *     POST http://127.0.0.1:1902   body: { tool: "<tool-name>", args: {...} }
 *
 * The official bridge.ts simply returns whatever JSON the editor produced as the MCP tool
 * "content", so the editor side must answer with an array of MCP content items, e.g.:
 *
 *     [{ type: "text", text: "..." }]
 *     [{ type: "image", data: "<base64>", mimeType: "image/png" }]
 *
 * This mini-service is that HTTP endpoint. It forwards every request to the connected
 * Codogma Engine browser client(s) over WebSocket and relays the editor's response back.
 *
 *   AI host (stdio) → @phaserjs/editor-mcp-server → HTTP :1902 → (this file) → WS → editor client
 *
 * Endpoints:
 *   GET  /          → { status: "ok", clients: <count>, ... }  (connectivity check used by the
 *                     editor's "MCP Server Configuration" dialog)
 *   POST /          → { tool, args } forwarded over WS; resolves with the editor's JSON result
 *   WS upgrade /    → editor clients connect here; protocol:
 *                        bridge → client: { id, tool, args }
 *                        client → bridge: { id, result }
 */

import { createServer } from "node:http"

import { WebSocketServer } from "ws"

const PORT = Number(process.env["PORT"] || 1902);
const TOOL_TIMEOUT_MS = 30_000;

/** connected editor clients (browser WebSockets) */
const clients = new Set();

/** requests waiting for an editor answer */
const pending = new Map();

/** small ring of recent events, exposed on GET / for debugging */
const activity = [];

function log(text) {

    activity.unshift({ time: new Date().toISOString(), text });

    if (activity.length > 50) {

        activity.pop();
    }
}

function corsHeaders() {

    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function json(res, body, status = 200) {

    const data = JSON.stringify(body);

    res.writeHead(status, {
        "Content-Type": "application/json",
        ...corsHeaders(),
    });

    res.end(data);
}

function readBody(req) {

    return new Promise((resolve, reject) => {

        let data = "";

        req.on("data", chunk => data += chunk);

        req.on("end", () => resolve(data));

        req.on("error", reject);
    });
}

function sendToEditors(message) {

    const data = JSON.stringify(message);

    for (const ws of clients) {

        try {

            ws.send(data);

        } catch (e) {

            console.error("bridge: error sending to editor client", e);
        }
    }
}

const server = createServer(async (req, res) => {

    // CORS preflight
    if (req.method === "OPTIONS") {

        res.writeHead(204, corsHeaders());

        res.end();

        return;
    }

    if (req.method === "GET") {

        json(res, {
            status: "ok",
            service: "phaser-editor-mcp-bridge",
            clients: clients.size,
            pending: pending.size,
            port: PORT,
            activity,
        });

        return;
    }

    if (req.method === "POST") {

        let body;

        try {

            body = JSON.parse(await readBody(req));

        } catch (e) {

            json(res, { error: "Invalid JSON body." }, 400);

            return;
        }

        const tool = body?.tool;
        const args = body?.args ?? {};

        if (typeof tool !== "string" || tool.length === 0) {

            json(res, { error: "Missing 'tool' field in request body." }, 400);

            return;
        }

        if (clients.size === 0) {

            log(`POST ${tool} → rejected (no editor client connected)`);

            json(res, {
                error: "No Codogma Engine client is connected to the MCP bridge. " +
                    "Open Codogma Engine and enable the MCP Bridge (main menu → AI → Enable MCP Bridge).",
            }, 503);

            return;
        }

        const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const result = await new Promise((resolve) => {

            const timer = setTimeout(() => {

                pending.delete(id);

                resolve({
                    error: `Tool '${tool}' timed out after ${TOOL_TIMEOUT_MS / 1000}s: ` +
                        `the Codogma Engine client did not answer.`,
                });

            }, TOOL_TIMEOUT_MS);

            pending.set(id, { id, tool, resolve, timer });

            sendToEditors({ id, tool, args });

            log(`POST ${tool} → forwarded to ${clients.size} editor client(s) [${id}]`);
        });

        clearTimeout((pending.get(id))?.timer);
        pending.delete(id);

        log(`POST ${tool} ← answered [${id}]`);

        // The official MCP server returns this JSON as-is as the MCP tool "content",
        // so the editor is expected to answer with an array of MCP content items.
        json(res, result);

        return;
    }

    json(res, { error: `Unsupported method ${req.method}.` }, 405);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {

    clients.add(ws);

    console.log(`bridge: editor client connected (${clients.size} connected)`);

    log("editor client connected");

    ws.on("message", (data) => {

        let msg;

        try {

            msg = JSON.parse(String(data));

        } catch (e) {

            console.error("bridge: invalid WS message", e);

            return;
        }

        if (msg && typeof msg.id === "string" && pending.has(msg.id)) {

            const req = pending.get(msg.id);

            pending.delete(msg.id);

            clearTimeout(req.timer);

            req.resolve(msg.result ?? { error: "Editor returned no result." });

        } else if (msg && msg.event) {

            log(`editor event: ${msg.event}`);
        }
    });

    ws.on("close", () => {

        clients.delete(ws);

        console.log(`bridge: editor client disconnected (${clients.size} connected)`);

        log("editor client disconnected");
    });
});

server.listen(PORT, () => {

    console.log(`phaser-editor-mcp-bridge listening on http://127.0.0.1:${PORT}`);
    console.log(`- GET  /  : status endpoint ({status, clients})`);
    console.log(`- POST /  : official MCP server requests ({tool, args})`);
    console.log(`- WS   /  : editor clients connect here`);
});
