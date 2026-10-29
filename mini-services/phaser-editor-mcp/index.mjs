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
 *
 * Security posture (local helper service, never a public API):
 *   - Binds to 127.0.0.1 explicitly (both AI hosts and the editor connect locally).
 *   - CORS is origin-validated (loopback origins and MCP_BRIDGE_ALLOWED_ORIGINS),
 *     not a wildcard; requests with a foreign Origin header are rejected.
 *   - HTTP bodies and WebSocket payloads are size-capped.
 *   - Tool names/args are shape-validated before forwarding to the editor.
 *   - The number of WS clients and pending forwarded requests is capped.
 */

import { createServer } from "node:http"

import { WebSocketServer } from "ws"

const HOST = process.env["MCP_BRIDGE_HOST"] || "127.0.0.1"
const PORT = Number(process.env["PORT"] || 1902);
const TOOL_TIMEOUT_MS = 30_000;

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_WS_PAYLOAD = 64 * 1024 * 1024;
const MAX_TOOL_NAME_LENGTH = 300;
const MAX_CLIENTS = 32;
const MAX_PENDING = 128;

/** extra browser origins (comma-separated URLs) allowed to call the bridge */
const ALLOWED_ORIGINS = new Set(
    (process.env["MCP_BRIDGE_ALLOWED_ORIGINS"] || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean));

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

function isLoopbackHostname(hostname) {

    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}

/**
 * Non-browser callers (the official MCP stdio server, curl) omit Origin and are
 * accepted. Browser callers must be loopback (the editor page) or explicitly
 * allow-listed, so a random web page cannot drive the editor's tools.
 */
function isAllowedOrigin(originHeader) {

    if (originHeader === undefined) return true;

    if (typeof originHeader !== "string") return false;

    try {

        const origin = new URL(originHeader);

        if (origin.protocol === "http:" && isLoopbackHostname(origin.hostname)) return true;

        return ALLOWED_ORIGINS.has(originHeader);

    } catch (e) {

        return false;
    }
}

function corsHeaders(req) {

    const origin = req?.headers?.origin;

    const headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin",
    };

    // Echo the specific origin instead of a wildcard: credentials-free GET/POST
    // still work for the editor page, foreign pages get no CORS grant.
    if (typeof origin === "string" && isAllowedOrigin(origin)) {

        headers["Access-Control-Allow-Origin"] = origin;
    }

    return headers;
}

function reject(res, status, message, req) {

    const data = JSON.stringify({ error: message });

    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...corsHeaders(req),
    });

    res.end(data);
}

function json(res, body, status = 200, req) {

    const data = JSON.stringify(body);

    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...corsHeaders(req),
    });

    res.end(data);
}

function readBody(req, maxBytes) {

    return new Promise((resolve, reject) => {

        const chunks = [];
        let size = 0;
        let settled = false;

        const fail = error => {

            if (settled) return;

            settled = true;
            req.resume();
            reject(error);
        };

        req.on("data", chunk => {

            if (settled) return;

            size += chunk.length;

            if (size > maxBytes) {

                const error = new Error("Request body too large");
                error.statusCode = 413;
                fail(error);
                return;
            }

            chunks.push(chunk);
        });

        req.on("end", () => {

            if (settled) return;

            settled = true;
            resolve(Buffer.concat(chunks).toString("utf8"));
        });

        req.on("error", fail);
    });
}

function isPlainObject(value) {

    return value !== null && typeof value === "object" && !Array.isArray(value);
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

    // Browser callers with a foreign Origin cannot drive editor tools.
    if (!isAllowedOrigin(req.headers.origin)) {

        reject(res, 403, "Forbidden origin.", req);

        return;
    }

    // CORS preflight
    if (req.method === "OPTIONS") {

        res.writeHead(204, corsHeaders(req));

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
        }, 200, req);

        return;
    }

    if (req.method === "POST") {

        let body;

        try {

            body = JSON.parse(await readBody(req, MAX_BODY_BYTES));

        } catch (e) {

            reject(res, e.statusCode === 413 ? 413 : 400,
                e.statusCode === 413 ? e.message : "Invalid JSON body.", req);

            return;
        }

        const tool = body?.tool;
        const args = body?.args ?? {};

        if (typeof tool !== "string" || tool.length === 0 || tool.length > MAX_TOOL_NAME_LENGTH) {

            reject(res, 400, "Missing 'tool' field in request body.", req);

            return;
        }

        if (!isPlainObject(args)) {

            reject(res, 400, "'args' must be a JSON object.", req);

            return;
        }

        if (clients.size === 0) {

            log(`POST ${tool} → rejected (no editor client connected)`);

            reject(res, 503, "No Codogma Engine client is connected to the MCP bridge. " +
                    "Open Codogma Engine and enable the MCP Bridge (main menu → AI → Enable MCP Bridge).", req);

            return;
        }

        if (pending.size >= MAX_PENDING) {

            log(`POST ${tool} → rejected (bridge busy: ${pending.size} pending)`);

            reject(res, 503, "The MCP bridge is busy; too many pending tool requests.", req);

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
        json(res, result, 200, req);

        return;
    }

    reject(res, 405, `Unsupported method ${req.method}.`, req);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });

server.on("upgrade", (req, socket, head) => {

    if (!isAllowedOrigin(req.headers.origin)) {

        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();

        return;
    }

    if (clients.size >= MAX_CLIENTS) {

        socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
        socket.destroy();

        return;
    }

    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

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

server.listen(PORT, HOST, () => {

    console.log(`phaser-editor-mcp-bridge listening on http://${HOST}:${PORT} (loopback-only by default)`);
    console.log(`- GET  /  : status endpoint ({status, clients})`);
    console.log(`- POST /  : official MCP server requests ({tool, args})`);
    console.log(`- WS   /  : editor clients connect here`);

    if (HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1") {

        console.warn(`phaser-editor-mcp-bridge: MCP_BRIDGE_HOST="${HOST}" exposes this service beyond loopback.`);
    }
});
