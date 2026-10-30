import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv from "ajv";

import { createCodogmaMcpServer, resolveEngineMcpUrl } from "../dist/index.js";
import { dispatchTool, getBridgeToolsList, initMcp } from "../../../server/mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "cli.js");

const UPSTREAM_TOOL_NAMES = [
    "scene-enable-arcade-physics-body",
    "scene-disable-arcade-physics-body",
    "scene-add-editable-tilemap",
    "scene-add-tileset-to-editable-tilemap",
    "scene-delete-tileset-from-editable-tilemap",
    "scene-add-editable-tilemap-layer",
    "scene-resize-editable-tilemap-layer",
    "scene-write-editable-tilemap-layer-data",
    "scene-fill-editable-tilemap-layer-data",
    "scene-get-editable-tilemap-layer-selection-data",
    "scene-add-game-object-filters",
    "scene-update-game-object-filters",
    "scene-delete-game-object-filters",
    "scene-update-game-object-filter-list",
    "scene-move-game-object-in-render-list",
    "scene-delete-game-objects",
    "scene-move-game-objects-to-parent",
    "scene-pack-objects-in-container",
    "scene-add-game-objects",
    "scene-update-game-objects",
    "scene-delete-plain-objects",
    "scene-add-object-list",
    "scene-update-object-list",
    "scene-remove-object-list",
    "ide-create-new-prefab-scene",
    "ide-get-all-prefabs-in-project",
    "ide-get-prefab-inheritance",
    "scene-declare-prefab-property",
    "scene-delete-prefab-property",
    "scene-get-nested-prefabs-instances",
    "ide-get-all-scenes-in-project",
    "ide-get-active-scene",
    "ide-open-scene",
    "ide-create-new-scene",
    "ide-save-scene",
    "scene-clear-scene",
    "scene-get-scene-dimension",
    "scene-get-screenshot",
    "scene-get-scene-data",
    "scene-get-objects-data",
    "assets-get-available-asset-packs",
    "assets-get-available-textures",
    "assets-get-texture-binary",
    "assets-get-texture-size",
    "assets-get-available-bitmapfonts",
    "assets-get-bitmapfont-image",
    "assets-get-spritesheet-image",
    "assets-get-texture-content-bounding-box",
    "assets-get-available-animations",
    "assets-get-available-spine-skeletons",
    "assets-get-available-spine-atlases",
    "assets-get-spine-skeleton-info",
    "assets-get-spine-skin-image",
    "assets-get-available-tilemaps",
    "assets-get-tilemap-data",
    "assets-get-google-font-families",
    "assets-get-google-font-info",
    "assets-add-google-font-to-asset-pack"
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
            name: "ide-open-scene",
            description: "Open a scene in the editor.",
            inputSchema: {
                type: "object",
                properties: {
                    sceneId: { type: "string" },
                    scenePath: { type: "string" },
                    sceneKey: { type: "string" }
                },
                anyOf: [
                    { required: ["sceneId"] },
                    { required: ["scenePath"] },
                    { required: ["sceneKey"] }
                ]
            }
        },
        {
            name: "assets-get-spine-skin-image",
            description: "Render a preview of the selected Spine skin.",
            inputSchema: {
                type: "object",
                properties: {
                    dataKey: { type: "string" },
                    atlasKey: { type: "string" },
                    skinName: { type: "string" },
                    animationName: { type: "string" }
                },
                required: ["dataKey", "atlasKey", "skinName", "animationName"]
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
                    result = message.params.name === "assets-get-spine-skin-image"
                        ? {
                            content: [{
                                type: "image",
                                data: "c3BpbmUtc25hcHNob3Q=",
                                mimeType: "image/png"
                            }]
                        }
                        : {
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
            ["ide-get-all-scenes-in-project", "scene-add-object-list", "ide-open-scene", "assets-get-spine-skin-image", "get-system-instructions"]
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
        const invalidType = await client.request("tools/call", {
            name: "scene-add-object-list",
            arguments: {
                sceneId: 123,
                lists: [{ label: "Decorations", scope: 42 }]
            }
        });
        assert.equal(invalidType.result?.isError, true);
        assert.match(invalidType.result?.content?.[0]?.text ?? "", /validation error/);
        assert.equal(engine.calls.length, 0, "invalid arguments must be rejected before reaching the engine");

        const missingRequired = await client.request("tools/call", {
            name: "scene-add-object-list",
            arguments: { sceneId: "scene-1" }
        });
        assert.equal(missingRequired.result?.isError, true);
        assert.match(missingRequired.result?.content?.[0]?.text ?? "", /required/);
        assert.equal(engine.calls.length, 0, "missing required values must not be forwarded");

        const invalidAnyOf = await client.request("tools/call", {
            name: "ide-open-scene",
            arguments: {}
        });
        assert.equal(invalidAnyOf.result?.isError, true);
        assert.match(invalidAnyOf.result?.content?.[0]?.text ?? "", /validation error/);

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

        const imageCall = await client.request("tools/call", {
            name: "assets-get-spine-skin-image",
            arguments: {
                dataKey: "characters",
                atlasKey: "characters-atlas",
                skinName: "knight",
                animationName: "idle"
            }
        });
        assert.deepEqual(imageCall.result?.content, [{
            type: "image",
            data: "c3BpbmUtc25hcHNob3Q=",
            mimeType: "image/png"
        }], "image content blocks must survive the HTTP adapter unchanged");

        const stillAlive = await client.request("tools/call", {
            name: "ide-get-all-scenes-in-project",
            arguments: {}
        });
        assert.equal(stillAlive.result?.isError, undefined, "the stdio process must stay healthy after validation errors");

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


test("real Codogma registry preserves all upstream tools and every JSON Schema compiles", async () => {
    const engineTools = getBridgeToolsList();
    const names = new Set(engineTools.map(tool => tool.name));

    assert.equal(names.size, engineTools.length, "the engine registry must not expose duplicate tool names");
    assert.ok(engineTools.length >= UPSTREAM_TOOL_NAMES.length, "the Codogma registry must expose the complete upstream tool set");
    const missingUpstreamTools = UPSTREAM_TOOL_NAMES.filter(name => !names.has(name));
    assert.deepEqual(missingUpstreamTools, [], "all upstream Phaser MCP tools must remain available");

    const fetchImpl = async (_url, init) => {
        const request = JSON.parse(init.body);
        const result = request.method === "initialize"
            ? {
                protocolVersion: "2025-03-26",
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: "codogma-engine", version: "1.0.0" },
                instructions: "Call get-system-instructions."
            }
            : { tools: engineTools };

        return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result
        }), {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    };

    const adapter = await createCodogmaMcpServer({
        url: "http://127.0.0.1:3000/editor/mcp",
        fetchImpl
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

    for (const name of ["assets-get-texture-size", "assets-get-texture-binary"]) {
        const tool = adapter.tools.find(candidate => candidate.name === name);
        assert.ok(tool, `missing Codogma texture tool ${name}`);

        const validate = ajv.compile(tool.inputSchema);
        assert.equal(validate({}), false, `${name} must require a texture key`);
        assert.equal(validate({ texture: { key: 123 } }), false, `${name} must reject a non-string nested texture key`);
        assert.equal(validate({ texture: { key: "dino" } }), true, `${name} must accept the official nested texture shape`);
        assert.equal(validate({ key: "dino" }), true, `${name} must retain the flat key shape`);
    }

    assert.ok(names.has("project-read-file"), "Codogma-specific project tools must remain available");
    assert.ok(names.has("get-system-instructions"), "Codogma system guidance must remain available as a tool");

    const guidance = await dispatchTool("get-system-instructions", {});
    assert.match(guidance.content[0].text, /SpineGameObject/, "system instructions must describe the Spine object type");
    assert.match(guidance.content[0].text, /assets-get-spine-skin-image/, "system instructions must document the Spine preview workflow");
});


test("Spine game-object configuration survives scene JSON creation", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "codogma-mcp-spine-"));

    try {
        initMcp({ projectDir, log: () => {} });

        await dispatchTool("ide-create-new-scene", {
            name: "SpineContract",
            folder: "scenes"
        });

        const sceneFile = path.join(projectDir, "scenes", "SpineContract.scene");
        const originalScene = JSON.parse(await readFile(sceneFile, "utf8"));

        const spineProperties = {
            label: "heroSpine",
            dataKey: "hero-skeleton",
            atlasKey: "hero-atlas",
            skinName: "armored",
            bpType: 1,
            bpSkin: 1,
            bpAnimation: "walk",
            bpTimeStep: 0.04,
            animationMixes: [["walk", "run", 0.2]],
            defaultMix: 0.15,
            timeScale: 1.25
        };

        await dispatchTool("scene-add-game-objects", {
            sceneId: originalScene.id,
            objects: [{
                type: "SpineGameObject",
                properties: spineProperties
            }]
        });

        const updatedScene = JSON.parse(await readFile(sceneFile, "utf8"));
        const spineObject = updatedScene.displayList.find(object => object.type === "SpineGameObject");

        assert.ok(spineObject, "the Spine game object must be added to the scene");
        for (const [key, value] of Object.entries(spineProperties)) {
            assert.deepEqual(spineObject[key], value, `Spine property '${key}' must be serialized without loss`);
        }
    } finally {
        await rm(projectDir, { recursive: true, force: true });
    }
});

test("all server-forwarded editor commands have browser SSE handlers", async () => {
    const serverFile = path.resolve(ROOT, "..", "..", "server", "mcp.mjs");
    const bridgeFile = path.resolve(
        ROOT,
        "..",
        "..",
        "source",
        "editor",
        "plugins",
        "phasereditor2d.mcp",
        "scripts",
        "mcp-bridge-client.js"
    );

    const serverSource = await readFile(serverFile, "utf8");
    const bridgeSource = await readFile(bridgeFile, "utf8");
    const forwardedCommands = new Set([
        ...[...serverSource.matchAll(/forwardToEditor\(\s*["']([^"']+)["']/g)].map(match => match[1]),
        ...[...serverSource.matchAll(/bridgeCommand\(\s*\{\s*tool:\s*["']([^"']+)["']/gs)].map(match => match[1])
    ]);
    const handlersMatch = bridgeSource.match(/const commandHandlers = \{([\s\S]*?)\n    \};/);

    assert.ok(handlersMatch, "the editor SSE bridge must expose its commandHandlers registry");

    const registeredHandlers = new Set(
        [...handlersMatch[1].matchAll(/["']([^"']+)["']\s*:/g)].map(match => match[1])
    );
    const missingHandlers = [...forwardedCommands].filter(name => !registeredHandlers.has(name));

    assert.deepEqual(missingHandlers, [], "every server-forwarded tool must have an editor SSE command handler");
});

test("the editor SSE bridge script is valid JavaScript", () => {
    const script = path.resolve(
        ROOT,
        "..",
        "..",
        "source",
        "editor",
        "plugins",
        "phasereditor2d.mcp",
        "scripts",
        "mcp-bridge-client.js"
    );
    const result = spawnSync(process.execPath, ["--check", script], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr || "mcp-bridge-client.js failed node --check");
});
