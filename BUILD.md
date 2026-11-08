# Build and Run Guide

Codogma Engine is a Web-first 2D game engine. The repository contains one browser-based editor application, native Project Model/Core packages, a Node.js backend and first-party MCP tooling.

## Requirements

- Node.js 22 or newer.
- npm.
- A modern Chromium-based browser for development and browser acceptance.

## Install dependencies

From the repository root:

```bash
npm ci
npm --prefix src/editor ci
```

Install optional package dependencies only when working in those packages, for example:

```bash
npm --prefix packages/editor-mcp-server ci
npm --prefix mini-services/ai-chat ci
```

## Build the Editor Host

```bash
npm run build
```

The root build command builds the SolidJS Editor Host from `src/editor/` into `src/editor/dist/`. Equivalent explicit command:

```bash
npm run build:editor-host
```

Typecheck and tests:

```bash
npm --prefix src/editor run typecheck
npm --prefix src/editor run test
npm --prefix packages/cge run typecheck
npm --prefix packages/cge run test
```

Use the scripts declared in each package manifest as the authoritative list of available commands.

## Run the Editor Host in development

Bash:

```bash
CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173 npm run dev:editor-host
```

PowerShell:

```powershell
$env:CODOGMA_ALLOWED_ORIGINS = "http://127.0.0.1:5173"
npm run dev:editor-host
```

Open:

```
http://127.0.0.1:5173/
```

Vite binds to loopback and proxies native `/editor/*` backend requests to the Node.js server. The exact Origin allow-list is required; do not use a wildcard or expose the development services on a public interface.

## Run the production-like local server

Build the Host, then start the Node.js server:

```bash
npm run build
npm start
```

Open:

```
http://127.0.0.1:3000/editor/
```

The server serves the build from `EDITOR_HOST_DIR`, which defaults to `src/editor/dist`.

## Select a project

By default, the server opens the native Project Model v1 fixture at:

```
packages/cge/tests/fixtures/acceptance-project
```

To open another project, set `PROJECT_DIR` to its absolute path before starting the server.

## MCP

The engine-owned MCP endpoint is:

```
http://127.0.0.1:3000/editor/mcp
```

For live Scene, Node, Prefab, Component, FX and viewport operations, open the project in the Editor Host and wait for the session bridge to connect. The first-party stdio adapter is available under `packages/editor-mcp-server/`.

## Runtime and game preview

Game View loads generated project runtime output through the server's project-scoped runtime-file route. The runtime output is separate from the Editor Host production bundle. Runtime adapter, Scene Loader, Preview lifecycle and reproducible HTML5 Build are validated through their respective engine tasks and native project fixtures.
