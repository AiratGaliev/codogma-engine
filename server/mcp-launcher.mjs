#!/usr/bin/env node
/**
 * Codogma Engine — MCP launcher.
 *
 * Preferred entry point: the repository-owned TypeScript package
 * packages/editor-mcp-server. It forwards the engine's live tool schemas and
 * calls through POST /editor/mcp; it does not maintain a second tool registry.
 *
 * The dependency-free server/mcp-stdio.mjs remains a fallback for checkouts
 * where the standalone package has not been installed and built yet.
 *
 * Start server/server.mjs before connecting an MCP client.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.join(__dirname, "..", "packages", "editor-mcp-server");
const packageCli = path.join(packageDirectory, "dist", "cli.js");
const packageRuntime = path.join(packageDirectory, "node_modules", "@modelcontextprotocol", "server", "package.json");

if (existsSync(packageCli) && existsSync(packageRuntime)) {
    await import(pathToFileURL(packageCli).href);
} else {
    console.error("[codogma-editor-mcp-server] Package is not built or its dependencies are missing.");
    console.error("[codogma-editor-mcp-server] Run: npm --prefix packages/editor-mcp-server ci");
    console.error("[codogma-editor-mcp-server] Starting the dependency-free legacy stdio fallback.");
    await import(pathToFileURL(path.join(__dirname, "mcp-stdio.mjs")).href);
}
