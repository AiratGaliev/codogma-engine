import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createCodogmaMcpServer, resolveEngineMcpUrl } from "../dist/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "cli.js");

function readRequest(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}

async function startMockEngine({ redirectMethod } = {}) {
    const calls = [];
    const tools = [
        {
            name: "ide-get-all-scenes-in-project",
            description: "List project scenes.",
            inputSchema: {
                type: "object",
                properties: {}
            }
        },
        {
            name: "scene-add-object-list",
            description: "Add an object list to a scene.",
            inputSchema: {
                type: "object",
                properties: {
                    sceneId: { type: "string" },
                    lists: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                label: { type: "string" },
                                scope: { type: "string" },
                                objectIds: {
                                    type: "array",
                                    items: { type: "string" }
                                }
                            },
                            required: ["label"]
                        }
                    }
                },
                required: ["sceneId", "lists"]
            }
        },
        {
            name: "get-system-instructions",
            description: "Read Codogma Engine tool guidance.",
            inputSchema: {
                type: "object",
                properties: {}
            }
        }
    ];

    const server = http.createServer(async (req, res) => {
        try {
            assert.equal(req.method, "POST");
            assert.equal(req.url, "/editor/mcp");
            const message = await readRequest(req);
            if (message.method === redirectMethod) {
                res.writeHead(302, { location: "https://example.com/editor/mcp" });
                res.end();
                return;
            }
            let result;

            switch (message.method) {
                case "initialize":
                    result = {
                        protocolVersion: "2025-03-26",
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: "codogma-engine", version: "1.0.0" },
                        instructions: "Call get-system-instructions before authoring scenes."
                    };
                    break;
                case "tools/list":
                    result = { tools };
                    break;
                case "tools/call":
                    calls.push(message.params);
                    result = {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ forwarded: message.params.name, arguments: message.params.arguments })
                        }]
                    };
                    break;
                default:
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(JSON.stringify({
                        jsonrpc: "2.0",
                        id: message.id,
                        error: { code: -32601, message: "Method not found" }
                    }));
                    return;
            }

            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
        } catch (error) {
            res.writeHead(500, { "content-type": "text/plain" });
            res.end(error instanceof Error ? error.message : String(error));
        }
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/editor/mcp`;

    return {
        calls,
        url,
        close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    };
}

function createStdioClient(child) {
    let buffer = "";
    const pending = new Map();
    const stderr = [];
    let nextId = 1;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
        buffer += chunk;
        while (true) {
            const newline = buffer.indexOf("\n");
            if (newline < 0) break;
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;

            let message;
            try {
                message = JSON.parse(line);
            } catch (error) {
                for (const waiter of pending.values()) waiter.reject(error);
                pending.clear();
                continue;
            }

            if (typeof message.id === "number" && pending.has(message.id)) {
                const waiter = pending.get(message.id);
                pending.delete(message.id);
                waiter.resolve(message);
            }
        }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => stderr.push(chunk));

    function request(method, params = {}) {
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`Timed out waiting for MCP ${method}; stderr: ${stderr.join("")}`));
            }, 5000);

            pending.set(id, {
                resolve: message => {
                    clearTimeout(timer);
                    resolve(message);
                },
                reject: error => {
                    clearTimeout(timer);
                    reject(error);
                }
            });

            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n", error => {
                if (!error) return;
                clearTimeout(timer);
                pending.delete(id);
                reject(error);
            });
        });
    }

    function notify(method, params = {}) {
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    }

    return { request, notify, stderr };
}

test("stdio server preserves Codogma schemas and forwards tool calls to /editor/mcp", async () => {
    const engine = await startMockEngine();
    const child = spawn(process.execPath, [CLI], {
        cwd: ROOT,
        env: {
            ...process.env,
            CODOGMA_MCP_URL: engine.url,
            CODOGMA_MCP_TIMEOUT_MS: "5000"
        },
        stdio: ["pipe", "pipe", "pipe"]
    });
    const client = createStdioClient(child);

    try {
        const initialized = await client.request("initialize", {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "codogma-mcp-test", version: "1.0.0" }
        });

        assert.equal(initialized.result?.serverInfo?.name, "codogma-editor-mcp-server");
        assert.match(initialized.result?.instructions ?? "", /get-system-instructions/);

        client.notify("notifications/initialized");

        const listed = await client.request("tools/list");
        const returnedTools = listed.result?.tools;
        assert.ok(Array.isArray(returnedTools));
        assert.deepEqual(
            returnedTools.map(tool => tool.name),
            ["ide-get-all-scenes-in-project", "scene-add-object-list", "get-system-instructions"]
        );

        const objectListTool = returnedTools.find(tool => tool.name === "scene-add-object-list");
        assert.equal(objectListTool.inputSchema.properties.lists.items.properties.scope.type, "string");
        assert.equal(
            objectListTool.inputSchema.properties.lists.items.required.includes("scope"),
            false,
            "the optional nested scope field must remain optional"
        );
        assert.equal(
            objectListTool.inputSchema.properties.lists.items.required.includes("objectIds"),
            false,
            "the optional nested objectIds field must remain optional"
        );

        const args = {
            sceneId: "scene-1",
            lists: [{ label: "Decorations" }]
        };
        const call = await client.request("tools/call", {
            name: "scene-add-object-list",
            arguments: args
        });

        assert.equal(call.result?.isError, undefined);
        assert.equal(call.result?.content?.[0]?.type, "text");
        assert.equal(
            JSON.parse(call.result.content[0].text).forwarded,
            "scene-add-object-list"
        );
        assert.deepEqual(engine.calls[0], {
            name: "scene-add-object-list",
            arguments: args
        });

        const unknown = await client.request("tools/call", {
            name: "not-a-codogma-tool",
            arguments: {}
        });
        assert.equal(unknown.result?.isError, true);
        assert.match(unknown.result?.content?.[0]?.text ?? "", /Unknown Codogma Engine tool/);
    } finally {
        child.stdin.end();
        if (child.exitCode === null) {
            await Promise.race([
                once(child, "exit"),
                new Promise(resolve => setTimeout(resolve, 5000))
            ]);
        }
        if (child.exitCode === null) child.kill();
        await engine.close();
    }

    assert.match(client.stderr.join(""), /Connected to .* \(3 tools\)/);
});

test("endpoint validation rejects non-loopback hosts and unintended paths", () => {
    assert.equal(resolveEngineMcpUrl().toString(), "http://127.0.0.1:3000/editor/mcp");
    assert.equal(
        resolveEngineMcpUrl("http://localhost:3010/editor/mcp").toString(),
        "http://localhost:3010/editor/mcp"
    );
    assert.equal(
        resolveEngineMcpUrl("http://[::1]:3000/editor/mcp").hostname,
        "[::1]"
    );

    assert.throws(() => resolveEngineMcpUrl("http://example.com/editor/mcp"), /loopback host/);
    assert.throws(() => resolveEngineMcpUrl("https://127.0.0.1/editor/mcp"), /HTTP/);
    assert.throws(() => resolveEngineMcpUrl("http://127.0.0.1:3000/editor/mcp-bridge"), /\/editor\/mcp/);
    assert.throws(() => resolveEngineMcpUrl("http://user:pass@127.0.0.1:3000/editor/mcp"), /credentials/);
    assert.throws(() => resolveEngineMcpUrl("http://127.0.0.1:3000/editor/mcp?redirect=1"), /credentials/);
});


test("HTTP MCP adapter refuses redirects away from the loopback endpoint", async () => {
    const engine = await startMockEngine({ redirectMethod: "initialize" });

    try {
        await assert.rejects(
            createCodogmaMcpServer({ url: engine.url, timeoutMs: 5000 }),
            /Cannot reach Codogma Engine MCP endpoint/
        );
    } finally {
        await engine.close();
    }
});
