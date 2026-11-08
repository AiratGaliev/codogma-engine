# @codogma/editor-mcp-server

Standalone stdio entry point for Codogma Engine's existing MCP tool registry.

> **Development status:** this package is currently private to the engine monorepository. npm publication is intentionally deferred until the public API, compatibility policy and release process meet the requirements in the engine's technical specification.

## Architecture

```text
MCP client (stdio)
       |
       v
@codogma/editor-mcp-server
       |
       | JSON-RPC over HTTP
       v
POST http://127.0.0.1:3000/editor/mcp
       |
       v
server/mcp.mjs  -- tool registry, schemas and execution
       |
       +-- project/file operations on the engine server
       |
       +-- SSE bridge to the running editor for UI-dependent tools
```

This package is deliberately an adapter, not a second implementation of editor tools:

- It requests `tools/list` from the engine and exposes the returned schemas without rebuilding or translating them.
- It forwards `tools/call` arguments and returns the engine's MCP content blocks, including images.
- The engine remains the source of truth for tool registration, schemas, instructions, editor state and project-file security. The stdio adapter compiles every advertised JSON Schema with Ajv and validates arguments before forwarding; the engine still enforces operation-specific runtime and filesystem constraints.
- `get-system-instructions` remains an engine-owned tool. The engine's initialization instructions are passed through to the stdio server.
- The tool list is read when this process starts. Restart the MCP process after updating the engine or its tool registry.

The adapter connects directly to `POST /editor/mcp`. It does not use the legacy WebSocket helper on port `1902` and does not import Phaser-specific MCP tool definitions.

## Requirements

- Node.js 22 or newer.
- Codogma Engine server running locally.
- For active-scene, screenshot and other UI-dependent tools, the editor page must be open and its SSE bridge connected.

## Local development

From this directory:

```bash
npm ci
npm test
```

`npm ci` builds the TypeScript CLI through the package's `prepare` script. To run it directly:

```bash
npm start
```

Or use the root launcher after installing this package's dependencies:

```bash
npm --prefix packages/editor-mcp-server ci
npm run mcp
```

The engine endpoint defaults to `http://127.0.0.1:3000/editor/mcp`.

### Configuration

Use the compiled CLI from this checkout:

```json
{
  "mcpServers": {
    "codogma-engine": {
      "command": "node",
      "args": ["/absolute/path/to/codogma-engine/packages/editor-mcp-server/dist/cli.js"],
      "env": {
        "CODOGMA_MCP_URL": "http://127.0.0.1:3000/editor/mcp"
      }
    }
  }
}
```

After a future npm release, the intended client configuration will be:

```json
{
  "mcpServers": {
    "codogma-engine": {
      "command": "npx",
      "args": ["-y", "@codogma/editor-mcp-server"],
      "env": {
        "CODOGMA_MCP_URL": "http://127.0.0.1:3000/editor/mcp"
      }
    }
  }
}
```

The npm example is a target installation form, not an available public release today.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `CODOGMA_MCP_URL` | `http://127.0.0.1:3000/editor/mcp` | Local Engine MCP endpoint. Only loopback HTTP URLs with the exact `/editor/mcp` path are accepted. |
| `CODOGMA_MCP_TIMEOUT_MS` | `30000` | Per-request timeout. Allowed range: 1000–120000 ms. |

Requests are limited to 32 MiB and responses to 64 MiB. Diagnostics go to stderr; stdout is reserved for MCP stdio messages.

## Compatibility and boundaries

- This adapter uses the official `@modelcontextprotocol/server` SDK and the low-level `Server` API because the engine already owns complete JSON Schemas. Returning these schemas unchanged avoids a second schema registry or lossy schema conversion.
- The engine currently serves a stateless JSON-RPC MCP endpoint. This package performs the engine-side initialize handshake before exposing its own stdio transport.
- Invalid tool arguments are rejected by the adapter's Ajv validation against the unmodified engine JSON Schemas before they reach the engine. Editor/runtime and project-file errors are still reported by the engine's actual tool handlers.
- The legacy `server/mcp-stdio.mjs` remains as a dependency-free fallback. The old `mini-services/phaser-editor-mcp` WebSocket bridge is retained for legacy editor-side compatibility and security testing; this new package does not depend on it.
- This package does not install dependencies into game projects and is not a Core/runtime package. It is editor/developer tooling and must stay out of production game bundles.
