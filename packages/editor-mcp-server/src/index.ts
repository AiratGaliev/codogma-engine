import { Server } from "@modelcontextprotocol/server";
import type { CallToolResult, ListToolsResult, ServerOptions, Tool } from "@modelcontextprotocol/server";

export const MCP_SERVER_NAME = "codogma-editor-mcp-server";
export const MCP_SERVER_VERSION = "0.1.0";
export const DEFAULT_ENGINE_MCP_URL = "http://127.0.0.1:3000/editor/mcp";

const MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const ENGINE_PROTOCOL_VERSION = "2025-03-26";

type JsonRecord = Record<string, unknown>;
type EngineMethod = "initialize" | "tools/list" | "tools/call";

interface EngineInitializeResult {
    instructions?: string;
}

interface EngineMcpServerOptions {
    url: URL;
    timeoutMs: number;
    fetchImpl: typeof fetch;
}

export interface CreateCodogmaMcpServerOptions {
    /** Local Codogma endpoint. Only loopback HTTP URLs ending in /editor/mcp are accepted. */
    url?: string;
    /** Request timeout in milliseconds; accepted range is 1000–120000. */
    timeoutMs?: number;
    /** Injectable fetch implementation for tests and embedders. */
    fetchImpl?: typeof fetch;
}

export interface CreatedCodogmaMcpServer {
    server: Server;
    endpointUrl: URL;
    tools: Tool[];
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve and validate the local Engine endpoint.
 *
 * The engine's HTTP API is intentionally loopback-only. This package does not
 * accept arbitrary remote URLs, credentials, query strings or alternative API
 * paths, so a typo cannot silently turn this local editor bridge into a remote
 * request proxy.
 */
export function resolveEngineMcpUrl(value = process.env.CODOGMA_MCP_URL ?? DEFAULT_ENGINE_MCP_URL): URL {
    let url: URL;

    try {
        url = new URL(value);
    } catch {
        throw new Error("CODOGMA_MCP_URL must be a valid absolute URL.");
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";

    if (url.protocol !== "http:" || !isLoopback) {
        throw new Error("CODOGMA_MCP_URL must use HTTP and a loopback host (127.0.0.1, localhost or ::1).");
    }

    if (url.pathname !== "/editor/mcp" || url.username || url.password || url.search || url.hash) {
        throw new Error("CODOGMA_MCP_URL must point to /editor/mcp without credentials, query parameters or a fragment.");
    }

    return url;
}

function resolveTimeoutMs(value: number | undefined): number {
    const configured = value ?? Number(process.env.CODOGMA_MCP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

    if (!Number.isInteger(configured) || configured < MIN_TIMEOUT_MS || configured > MAX_TIMEOUT_MS) {
        throw new RangeError(`MCP timeout must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms.`);
    }

    return configured;
}

async function readBoundedJson(response: Response, limit: number): Promise<unknown> {
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null) {
        const declaredLength = Number(contentLength);
        if (Number.isFinite(declaredLength) && declaredLength > limit) {
            throw new Error(`Codogma MCP response exceeds the ${limit}-byte limit.`);
        }
    }

    if (!response.body) {
        throw new Error("Codogma MCP endpoint returned an empty response body.");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            totalBytes += value.byteLength;
            if (totalBytes > limit) {
                await reader.cancel();
                throw new Error(`Codogma MCP response exceeds the ${limit}-byte limit.`);
            }

            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    try {
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
        throw new Error("Codogma MCP endpoint returned malformed JSON.");
    }
}

function parseTools(value: unknown): Tool[] {
    if (!isRecord(value) || !Array.isArray(value.tools)) {
        throw new Error("Codogma MCP tools/list response does not contain a tools array.");
    }

    const names = new Set<string>();

    return value.tools.map((entry, index): Tool => {
        if (!isRecord(entry) || typeof entry.name !== "string" || entry.name.length === 0) {
            throw new Error(`Codogma MCP tools/list contains an invalid tool at index ${index}.`);
        }

        if (names.has(entry.name)) {
            throw new Error(`Codogma MCP tools/list contains a duplicate tool name: ${entry.name}.`);
        }
        names.add(entry.name);

        const schema = entry.inputSchema;
        if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties)) {
            throw new Error(`Tool '${entry.name}' must expose an object inputSchema with a properties object.`);
        }

        const tool: Tool = {
            name: entry.name,
            inputSchema: schema as Tool["inputSchema"]
        };

        if (typeof entry.description === "string") {
            tool.description = entry.description;
        }

        if (typeof entry.title === "string") {
            tool.title = entry.title;
        }

        if (isRecord(entry.annotations)) {
            tool.annotations = entry.annotations as NonNullable<Tool["annotations"]>;
        }

        if (isRecord(entry.outputSchema)) {
            tool.outputSchema = entry.outputSchema as NonNullable<Tool["outputSchema"]>;
        }

        return tool;
    });
}

function parseCallToolResult(value: unknown): CallToolResult {
    if (!isRecord(value) || !Array.isArray(value.content)) {
        throw new Error("Codogma MCP tools/call response must contain a content array.");
    }

    for (const [index, item] of value.content.entries()) {
        if (!isRecord(item) || typeof item.type !== "string") {
            throw new Error(`Codogma MCP content[${index}] has an invalid content type.`);
        }

        if (item.type === "text" && typeof item.text !== "string") {
            throw new Error(`Codogma MCP content[${index}].text must be a string.`);
        }

        if (item.type === "image" && (typeof item.data !== "string" || typeof item.mimeType !== "string")) {
            throw new Error(`Codogma MCP content[${index}] has an invalid image payload.`);
        }
    }

    if (value.isError !== undefined && typeof value.isError !== "boolean") {
        throw new Error("Codogma MCP tools/call response has an invalid isError value.");
    }

    return value as unknown as CallToolResult;
}

function toolError(message: string): CallToolResult {
    return {
        content: [{ type: "text", text: message }],
        isError: true
    };
}

class EngineMcpBridge {
    private nextRequestId = 1;

    constructor(private readonly options: EngineMcpServerOptions) {}

    async initialize(): Promise<EngineInitializeResult> {
        const result = await this.request("initialize", {
            protocolVersion: ENGINE_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {
                name: MCP_SERVER_NAME,
                version: MCP_SERVER_VERSION
            }
        });

        if (!isRecord(result)) {
            throw new Error("Codogma MCP initialize response is invalid.");
        }

        return {
            ...(typeof result.instructions === "string" ? { instructions: result.instructions } : {})
        };
    }

    async listTools(): Promise<Tool[]> {
        return parseTools(await this.request("tools/list", {}));
    }

    async callTool(name: string, args: JsonRecord): Promise<CallToolResult> {
        return parseCallToolResult(await this.request("tools/call", { name, arguments: args }));
    }

    private async request(method: EngineMethod, params: JsonRecord): Promise<unknown> {
        const id = this.nextRequestId++;
        const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

        if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
            throw new Error(`MCP request exceeds the ${MAX_REQUEST_BYTES}-byte limit.`);
        }

        let response: Response;
        try {
            response = await this.options.fetchImpl(this.options.url, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "application/json"
                },
                redirect: "error",
                body,
                signal: AbortSignal.timeout(this.options.timeoutMs)
            });
        } catch (error) {
            throw new Error(
                `Cannot reach Codogma Engine MCP endpoint ${this.options.url.toString()}: ${errorMessage(error)}`,
                { cause: error }
            );
        }

        if (!response.ok) {
            throw new Error(`Codogma MCP endpoint returned HTTP ${response.status}.`);
        }

        const message = await readBoundedJson(response, MAX_RESPONSE_BYTES);
        if (!isRecord(message) || message.jsonrpc !== "2.0" || message.id !== id) {
            throw new Error("Codogma MCP endpoint returned an unexpected JSON-RPC response.");
        }

        if (isRecord(message.error)) {
            const remoteMessage = typeof message.error.message === "string"
                ? message.error.message
                : "Unknown JSON-RPC error";
            throw new Error(`Codogma MCP ${method} failed: ${remoteMessage}`);
        }

        if (!Object.hasOwn(message, "result")) {
            throw new Error("Codogma MCP endpoint returned neither result nor error.");
        }

        return message.result;
    }
}

/**
 * Create a stdio-facing MCP server backed by the Engine's existing HTTP MCP
 * endpoint. Tool schemas and execution stay owned by server/mcp.mjs; this
 * adapter deliberately does not duplicate the editor's tool registry.
 */
export async function createCodogmaMcpServer(
    options: CreateCodogmaMcpServerOptions = {}
): Promise<CreatedCodogmaMcpServer> {
    const endpointUrl = resolveEngineMcpUrl(options.url);
    const timeoutMs = resolveTimeoutMs(options.timeoutMs);
    const bridge = new EngineMcpBridge({
        url: endpointUrl,
        timeoutMs,
        fetchImpl: options.fetchImpl ?? fetch
    });

    const initialize = await bridge.initialize();
    const tools = await bridge.listTools();
    const toolNames = new Set(tools.map(tool => tool.name));

    const serverOptions: ServerOptions = {
        capabilities: {
            tools: { listChanged: false }
        },
        instructions: initialize.instructions
            ?? "Codogma Engine MCP server. Call the get-system-instructions tool first to learn the editor tool contracts."
    };

    const server = new Server(
        {
            name: MCP_SERVER_NAME,
            version: MCP_SERVER_VERSION
        },
        serverOptions
    );

    server.setRequestHandler("tools/list", async (): Promise<ListToolsResult> => ({ tools }));

    server.setRequestHandler("tools/call", async (request): Promise<CallToolResult> => {
        const name = request.params.name;
        if (!toolNames.has(name)) {
            return toolError(`Unknown Codogma Engine tool: ${name}`);
        }

        const args = request.params.arguments ?? {};
        if (!isRecord(args)) {
            return toolError(`Arguments for '${name}' must be a JSON object.`);
        }

        try {
            return await bridge.callTool(name, args);
        } catch (error) {
            return toolError(`Codogma Engine tool '${name}' failed: ${errorMessage(error)}`);
        }
    });

    return { server, endpointUrl, tools };
}

export { MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES };
