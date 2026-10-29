# phaser-editor-mcp-bridge

Standalone mini-service that connects the **official** @phaserjs/editor-mcp-server npm
package with the Codogma Engine browser client used in this
workspace. The official npm package is reused as-is — this service only implements the
HTTP/WebSocket endpoint the official server already talks to (port `1902`), it does **not**
re-implement the MCP protocol.

## Architecture

```
┌─────────────────┐  stdio (MCP)   ┌───────────────────────────────┐  HTTP POST :1902  ┌──────────────────────┐   WebSocket    ┌─────────────────────────────┐
│ AI host          │ ─────────────▶ │ @phaserjs/editor-mcp-server   │ ────────────────▶ │ phaser-editor-mcp    │ ─────────────▶ │ Codogma Engine (browser page)│
│ (Cursor/Claude/  │                │ (official, node, spawned by   │  {tool, args}     │ -bridge (this service│  {id,tool,args}│ phasereditor2d.ide.core.mcp │
│ VS Code / …)     │ ◀───────────── │  the AI host)                 │ ◀──────────────── │ node, port 1902)     │ ◀───────────── │ MCPBridge + MCPToolRegistry │
└─────────────────┘  MCP content  └───────────────────────────────┘  editor JSON      └──────────────────────┘  {id,result}   └─────────────────────────────┘
```

- The official server (running as an MCP stdio server) converts every tool call into
  `POST http://127.0.0.1:1902` with body `{ tool: "<name>", args: {...} }`
  (env vars `phaser-editor-mcp-hostname` / `phaser-editor-mcp-port` override host/port).
- This bridge forwards `{id, tool, args}` over WebSocket to the connected editor client(s)
  and waits (30 s timeout) for `{id, result}`.
- The official `bridge.ts` returns the editor's JSON response as the MCP tool content
  verbatim, so the editor answers with an array of MCP content items:
  `[{ type: "text", text: "…" }]` or `[{ type: "image", data: "<base64>", mimeType: "image/png" }]`.
- `GET /` returns `{ status: "ok", clients: <n>, … }` — used by the editor's
  *AI → MCP Server Configuration* dialog to verify connectivity.
- CORS grants are origin-validated: the bridge echoes a specific Origin only when it is
  loopback or listed in `MCP_BRIDGE_ALLOWED_ORIGINS`; it does not grant wildcard origins.
  HTTP bodies and WebSocket payloads are size-capped, as are clients and pending requests.

## Security boundary and limits

- Default bind: `127.0.0.1`; `MCP_BRIDGE_HOST` is a privileged local configuration override, not a public deployment setting.
- Browser Origins must be loopback or explicitly listed in `MCP_BRIDGE_ALLOWED_ORIGINS`; the response echoes that exact Origin, not `*`.
- The bridge caps HTTP request bodies, WebSocket payloads, clients, pending tool requests and request timeouts. These controls limit accidental/malicious load but do not replace authorization.
- Calls without an `Origin` are accepted for local official MCP stdio clients. A remote non-browser client can also omit or forge headers; Host/Origin checks are not authentication.
- No general authentication/authorization exists. Do not use a non-loopback bind or public/multi-user proxy without an authenticated front door and independent security review. The normal main-server security smoke does not prove this separate process is secure.

## Run

```bash
cd mini-services/phaser-editor-mcp
npm install
npm run dev        # node --watch index.mjs (dev)  |  npm start for plain node index.mjs
```

The bridge binds to `127.0.0.1:1902` by default (`PORT` changes the port; `MCP_BRIDGE_HOST` changes the bind host). Requests are checked with loopback Host/Origin policy; no general user authentication is implemented. Keep this as a local helper and **do not** bind it to `0.0.0.0` or expose it through an untrusted/public proxy. Host/Origin headers are not authentication for arbitrary non-browser callers.

> **Workspace note:** in this sandbox the **production** server (`node server/server.mjs`)
> is already running on port `1902` and serves the editor plus its own built-in MCP bridge
> (`POST /` with the same `{tool, args}` protocol, exposed at `/editor/mcp` too). Do NOT
> run this mini-service on `1902` while the production server is up. To test THIS
> standalone variant, use another port, e.g. `PORT=19021 npm run dev`, and set
> `"env": { "phaser-editor-mcp-port": "19021" }` in the AI host MCP config (the official
> server reads it — see its `src/bridge.ts`; the editor's *MCP Server Configuration*
> dialog writes it for you, and the host/port fields there must match the bridge).

## Run the official MCP server locally (stdio test)

```bash
cd mini-services/phaser-editor-mcp
npm run mcp        # node node_modules/@phaserjs/editor-mcp-server/build/index.js
```

## Configure AI hosts

The command line to put in the AI host MCP config (works because the package ships a
`bin` entry):

```json
{
    "mcpServers": {
        "phaser-editor": {
            "command": "npx",
            "args": ["@phaserjs/editor-mcp-server"]
        }
    }
}
```

- **Cursor** — project-relative `.cursor/mcp.json` (the editor's *AI → MCP Server
  Configuration → Auto-configure Cursor* button writes a root `.mcp.json` for you).
- **VS Code** — project-relative `.vscode/mcp.json` (auto-configured by the same dialog).
- **Claude Desktop** — global config file
  (`claude_desktop_config.json`, same `mcpServers` JSON shape).

## Editor side

In the editor (this workspace's build):

1. Start the bridge: `npm run dev` in this folder (use `PORT=19021` if the production
   server owns `1902`).
2. In the editor: **AI → Enable MCP Bridge** (toggle; persisted in the colibri global
   preferences). The editor connects to `ws://127.0.0.1:<port>/` and reconnects every 5 s.
3. **AI → MCP Server Configuration…** shows the bridge status and the config snippets.
4. **AI → MCP Message Log** shows the recent bridge traffic (tool, time, ok/error).

Implemented editor-side tools (graceful "not supported yet" answer for the rest of the
54 official tool names): `ide-get-all-scenes-in-project`, `ide-get-active-scene`,
`ide-open-scene`, `ide-create-new-scene`, `ide-save-scene`, `scene-get-scene-data`,
`scene-get-scene-dimension`, `scene-clear-scene`, `scene-get-screenshot`,
`assets-get-available-asset-packs`, `assets-get-available-textures`,
`assets-get-texture-size`, `assets-get-available-animations`,
`assets-get-available-tilemaps`, `assets-get-available-bitmapfonts`,
`assets-get-available-spine-skeletons`, `assets-get-available-spine-atlases`,
`assets-get-tilemap-data`.
