import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Ajv } from "ajv";

import { createCodogmaMcpServer, resolveEngineMcpUrl } from "../dist/index.js";
import { dispatchTool, getBridgeToolsList, getChatSystemPrompt, getSystemInstructions, initMcp } from "../../../server/mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "cli.js");

const NATIVE_TOOL_NAMES = [
    "scene-list", "scene-get-active", "scene-open", "scene-save", "scene-create",
    "scene-get-document", "scene-get-nodes", "scene-create-node", "scene-update-node",
    "scene-delete-node", "scene-reparent-node", "scene-clear",
    "prefab-list", "prefab-get", "prefab-create", "prefab-instantiate",
    "component-attach", "component-detach", "component-set-enabled",
    "fx-add", "fx-update", "fx-remove", "scene-capture-screenshot"
];

const EXTERNAL_ASSET_TOOL_NAMES = [
    "assets-get-available-textures", "assets-get-texture-binary",
    "assets-get-available-animations", "assets-get-available-tilemaps",
    "assets-get-available-bitmapfonts", "assets-get-texture-content-bounding-box",
    "assets-get-available-asset-packs", "assets-get-texture-size",
    "assets-get-bitmapfont-image", "assets-get-spritesheet-image",
    "assets-get-available-spine-skeletons", "assets-get-available-spine-atlases",
    "assets-get-spine-skeleton-info", "assets-get-tilemap-data",
    "assets-get-google-font-families", "assets-get-google-font-info",
    "assets-add-google-font-to-asset-pack",
    "project-list-files", "project-read-file", "project-write-file",
    "project-delete-file", "project-compile-info"
];

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
            name: "scene-list",
            description: "List native Scene documents.",
            inputSchema: { type: "object", properties: {} }
        },
        {
            name: "scene-open",
            description: "Open a native Scene or Prefab document.",
            inputSchema: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"]
            }
        },
        {
            name: "scene-create-node",
            description: "Create a native Node.",
            inputSchema: {
                type: "object",
                properties: {
                    kind: { type: "string", enum: ["Image", "Text", "Container"] },
                    assetId: { type: "string" },
                    parentId: { type: ["string", "null"] }
                },
                required: ["kind"],
                additionalProperties: false
            }
        },
        {
            name: "assets-get-texture-binary",
            description: "Read an external Phaser texture asset.",
            inputSchema: {
                type: "object",
                properties: {
                    key: { type: "string" },
                    texture: {
                        type: "object",
                        properties: { key: { type: "string" } },
                        required: ["key"]
                    }
                },
                anyOf: [{ required: ["key"] }, { required: ["texture"] }]
            }
        },
        {
            name: "get-system-instructions",
            description: "Read native Codogma MCP guidance.",
            inputSchema: { type: "object", properties: {} }
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
                        instructions: "Use native Project Model v1 tools and get-system-instructions."
                    };
                    break;
                case "tools/list":
                    result = { tools };
                    break;
                case "tools/call":
                    calls.push(message.params);
                    result = message.params.name === "assets-get-texture-binary"
                        ? { content: [{ type: "image", data: "bmF0aXZlLWFzc2V0", mimeType: "image/png" }] }
                        : { content: [{ type: "text", text: JSON.stringify({
                            forwarded: message.params.name,
                            arguments: message.params.arguments
                        }) }] };
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
    return {
        calls,
        url: `http://127.0.0.1:${address.port}/editor/mcp`,
        close: () => new Promise((resolve, reject) =>
            server.close(error => error ? reject(error) : resolve()))
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
                resolve: message => { clearTimeout(timer); resolve(message); },
                reject: error => { clearTimeout(timer); reject(error); }
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

test("stdio adapter forwards native schemas and preserves external asset image content", async () => {
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
        assert.deepEqual(returnedTools.map(tool => tool.name), [
            "scene-list", "scene-open", "scene-create-node",
            "assets-get-texture-binary", "get-system-instructions"
        ]);

        const createNodeTool = returnedTools.find(tool => tool.name === "scene-create-node");
        assert.equal(createNodeTool.inputSchema.properties.kind.type, "string");
        assert.equal(createNodeTool.inputSchema.properties.assetId.type, "string");
        assert.equal(createNodeTool.inputSchema.required.includes("assetId"), false);
        assert.equal(createNodeTool.inputSchema.required.includes("parentId"), false);

        const invalidType = await client.request("tools/call", {
            name: "scene-create-node",
            arguments: { kind: 123 }
        });
        assert.equal(invalidType.result?.isError, true);
        assert.match(invalidType.result?.content?.[0]?.text ?? "", /validation error/);
        assert.equal(engine.calls.length, 0, "invalid arguments must be rejected before reaching the engine");

        const missingRequired = await client.request("tools/call", {
            name: "scene-open",
            arguments: {}
        });
        assert.equal(missingRequired.result?.isError, true);
        assert.match(missingRequired.result?.content?.[0]?.text ?? "", /required/);
        assert.equal(engine.calls.length, 0, "missing required values must not be forwarded");

        const callArgs = { kind: "Image", assetId: "asset-player" };
        const call = await client.request("tools/call", {
            name: "scene-create-node",
            arguments: callArgs
        });
        assert.equal(call.result?.isError, undefined);
        assert.equal(JSON.parse(call.result.content[0].text).forwarded, "scene-create-node");
        assert.deepEqual(engine.calls[0], { name: "scene-create-node", arguments: callArgs });

        const imageCall = await client.request("tools/call", {
            name: "assets-get-texture-binary",
            arguments: { texture: { key: "player" } }
        });
        assert.deepEqual(imageCall.result?.content, [{
            type: "image",
            data: "bmF0aXZlLWFzc2V0",
            mimeType: "image/png"
        }], "image content blocks must survive the HTTP adapter unchanged");

        const stillAlive = await client.request("tools/call", {
            name: "scene-list",
            arguments: {}
        });
        assert.equal(stillAlive.result?.isError, undefined);

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
    assert.match(client.stderr.join(""), /Connected to .* \(5 tools\)/);
});

test("endpoint validation rejects non-loopback hosts and unintended paths", () => {
    assert.equal(resolveEngineMcpUrl().toString(), "http://127.0.0.1:3000/editor/mcp");
    assert.equal(resolveEngineMcpUrl("http://localhost:3010/editor/mcp").toString(), "http://localhost:3010/editor/mcp");
    assert.equal(resolveEngineMcpUrl("http://[::1]:3000/editor/mcp").hostname, "[::1]");
    assert.throws(() => resolveEngineMcpUrl("http://example.com/editor/mcp"), /loopback host/);
    assert.throws(() => resolveEngineMcpUrl("https://127.0.0.1/editor/mcp"), /HTTP/);
    assert.throws(() => resolveEngineMcpUrl("http://127.0.0.1:3000/editor/mcp-bridge"), /\/editor\/mcp/);
    assert.throws(() => resolveEngineMcpUrl("http://user:pass@127.0.0.1:3000/editor/mcp"), /credentials/);
    assert.throws(() => resolveEngineMcpUrl("http://127.0.0.1:3000/editor/mcp?redirect=1"), /credentials/);
});

test("HTTP MCP adapter refuses redirect responses", async () => {
    const fetchImpl = async (_url, init) => {
        assert.equal(init.redirect, "error", "the adapter must disable automatic redirect following");
        return new Response(null, {
            status: 302,
            headers: { location: "https://example.com/editor/mcp" }
        });
    };
    await assert.rejects(
        createCodogmaMcpServer({ url: "http://127.0.0.1:3000/editor/mcp", fetchImpl }),
        /HTTP 302/
    );
});

test("native registry and preserved external asset tools expose valid schemas", async () => {
    const engineTools = getBridgeToolsList();
    const names = new Set(engineTools.map(tool => tool.name));
    assert.equal(names.size, engineTools.length, "the engine registry must not expose duplicate tool names");
    for (const name of NATIVE_TOOL_NAMES) assert.ok(names.has(name), `missing native tool: ${name}`);
    for (const name of EXTERNAL_ASSET_TOOL_NAMES) assert.ok(names.has(name), `missing preserved external asset tool: ${name}`);

    for (const name of [
        "ide-get-all-scenes-in-project", "ide-create-new-scene", "ide-open-scene",
        "scene-get-scene-data", "scene-add-game-objects", "scene-add-plain-objects",
        "ide-create-new-prefab-scene", "scene-declare-prefab-property",
        "scene-add-editable-tilemap", "scene-enable-arcade-physics-body",
        "scene-add-game-object-filters", "scene-add-object-list", "assets-get-spine-skin-image"
    ]) assert.ok(!names.has(name), `legacy or unsupported tool must not be exposed: ${name}`);

    const adapter = await createCodogmaMcpServer({
        url: "http://127.0.0.1:3000/editor/mcp",
        fetchImpl: async (_url, init) => {
            const request = JSON.parse(init.body);
            const result = request.method === "initialize"
                ? {
                    protocolVersion: "2025-03-26",
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: "codogma-engine", version: "1.0.0" },
                    instructions: "Use native tools."
                }
                : { tools: engineTools };
            return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }
    });
    assert.equal(adapter.tools.length, engineTools.length);

    const ajv = new Ajv({
        allErrors: true,
        strict: false,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
        validateFormats: false
    });
    for (const tool of engineTools) {
        assert.doesNotThrow(() => ajv.compile(tool.inputSchema), `invalid JSON Schema: ${tool.name}`);
    }

    for (const name of ["assets-get-texture-size", "assets-get-texture-binary"]) {
        const tool = adapter.tools.find(candidate => candidate.name === name);
        assert.ok(tool, `missing texture tool ${name}`);
        const validate = ajv.compile(tool.inputSchema);
        assert.equal(validate({}), false, `${name} must require a texture key`);
        assert.equal(validate({ texture: { key: 123 } }), false, `${name} must reject non-string texture keys`);
        assert.equal(validate({ texture: { key: "dino" } }), true, `${name} must accept the nested texture shape`);
        assert.equal(validate({ key: "dino" }), true, `${name} must retain the flat key shape`);
    }

    const guidance = getSystemInstructions().content[0].text;
    assert.match(guidance, /SceneDocumentV1/);
    assert.match(guidance, /PrefabDocumentV1/);
    assert.match(guidance, /stable IDs/i);
    assert.match(guidance, /External Phaser Asset Pack JSON/);
    assert.doesNotMatch(guidance, /Create it with ide-create-new-prefab-scene|displayList of game objects/);
    assert.match(getChatSystemPrompt(), /scene-create-node/);
});

test("generic MCP file operations cannot read or overwrite legacy/native documents", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "codogma-mcp-native-boundary-"));
    try {
        initMcp({ projectDir, log: () => {} });
        await writeFile(path.join(projectDir, "project.json"), JSON.stringify({
            id: "project-native",
            assets: [{ id: "scene-asset-level", kind: "scene", path: "scenes/Level.cge-scene.json" }],
            scenes: [{ id: "scene-level", assetId: "scene-asset-level" }]
        }));

        await assert.rejects(dispatchTool("project-read-file", { path: "old.scene" }), /legacy Scene\/Component documents/);
        await assert.rejects(dispatchTool("project-read-file", { path: "old.components" }), /legacy Scene\/Component documents/);
        await assert.rejects(dispatchTool("project-write-file", { path: "old.scene", content: "{}" }), /legacy Scene\/Component documents/);
        await assert.rejects(dispatchTool("project-write-file", { path: "old.components", content: "{}" }), /legacy Scene\/Component documents/);
        await assert.rejects(dispatchTool("project-write-file", { path: "project.json", content: "{}" }), /Native Project, Scene and Prefab/);
        await assert.rejects(dispatchTool("project-write-file", { path: "scenes/Level.cge-scene.json", content: "{}" }), /Native Project, Scene and Prefab/);
        await assert.rejects(dispatchTool("project-delete-file", { path: "scenes/Level.cge-scene.json" }), /Native Project, Scene and Prefab/);

        const compileInfo = JSON.parse((await dispatchTool("project-compile-info", {})).content[0].text);
        assert.deepEqual(compileInfo.scenes, [{
            id: "scene-level",
            assetId: "scene-asset-level",
            path: "scenes/Level.cge-scene.json"
        }]);
    } finally {
        await rm(projectDir, { recursive: true, force: true });
    }
});

test("external Spine metadata remains readable from Phaser Asset Pack files", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "codogma-mcp-spine-assets-"));
    try {
        await writeFile(path.join(projectDir, "hero.json"), JSON.stringify({
            skeleton: { name: "hero" },
            spine: "4.2",
            skins: [{ name: "armored" }, { name: "casual" }],
            animations: { idle: {}, run: {} }
        }));
        await writeFile(path.join(projectDir, "game-asset-pack.json"), JSON.stringify({
            section1: { files: [
                { type: "spineJson", key: "hero-skeleton", url: "hero.json" },
                { type: "spineAtlas", key: "hero-atlas", url: "hero.atlas" }
            ] }
        }));
        initMcp({ projectDir, log: () => {} });
        const info = JSON.parse((await dispatchTool("assets-get-spine-skeleton-info", {
            dataKey: "hero-skeleton",
            atlasKey: "hero-atlas"
        })).content[0].text);
        assert.deepEqual(info.skins, ["armored", "casual"]);
        assert.deepEqual(info.animations, ["idle", "run"]);
        assert.equal(info.skeletonName, "hero");
    } finally {
        await rm(projectDir, { recursive: true, force: true });
    }
});

test("all native server-forwarded commands have SolidJS Host handlers", async () => {
    const serverFile = path.resolve(ROOT, "..", "..", "server", "mcp.mjs");
    const appFile = path.resolve(ROOT, "..", "..", "src", "editor", "src", "App.tsx");
    const serverSource = await readFile(serverFile, "utf8");
    const appSource = await readFile(appFile, "utf8");
    const forwardedCommands = new Set([
        ...[...serverSource.matchAll(/nativeTool\(["']([^"']+)["']/g)].map(match => match[1]),
        ...[...serverSource.matchAll(/forwardToEditor\(\s*["']([^"']+)["']/g)].map(match => match[1])
    ]);
    const handlersMatch = appSource.match(/const editorMcpHandlers: Record<string, EditorMcpHandler> = \{([\s\S]*?)\n  \};/);
    assert.ok(handlersMatch, "SolidJS Host must expose its native editorMcpHandlers registry");
    const registeredHandlers = new Set(
        [...handlersMatch[1].matchAll(/["']([^"']+)["']\s*:/g)].map(match => match[1])
    );
    const missingHandlers = [...forwardedCommands].filter(name => !registeredHandlers.has(name));
    assert.deepEqual(missingHandlers, [], "every MCP-forwarded native command must have a SolidJS Host handler");
});
