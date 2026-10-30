#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createCodogmaMcpServer } from "./index.js";

try {
    const { server, endpointUrl, tools } = await createCodogmaMcpServer();
    await server.connect(new StdioServerTransport());
    process.stderr.write(
        `[codogma-editor-mcp-server] Connected to ${endpointUrl.toString()} (${tools.length} tools).\n`
    );
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[codogma-editor-mcp-server] ${message}\n`);
    process.exitCode = 1;
}
