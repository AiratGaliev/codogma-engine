# Build and Run Guide

Codogma Engine is a Web-first 2D game engine. The repository contains one browser-based editor application, native Project Model/Core packages, a Node.js backend and first-party MCP tooling.

## Requirements

- Node.js `>=22.12.0`.
- npm `>=11.21.2 <12` (repository pin: `npm@11.21.2`).
- A modern Chromium-based browser for development and browser acceptance.

## Install dependencies

Verify the toolchain, then install the root package and every active first-party workspace once from the repository root:

```bash
node --version
npm --version

# Only when the bundled npm is older than 11.21.2:
npm install --global npm@11.21.2

npm ci
```

The root manifest declares `packageManager: "npm@11.21.2"` and requires npm 11.21.2 or newer within the npm 11 major. This minimum is intentional: npm 10.9.9 crashes in Arborist's optional-peer resolution with the repository's Vitest 5.0.5 dependency graph; do not work around it by disabling peer dependency resolution.

The root lockfile includes the active packages in `packages/*` and the native Editor Host in `src/editor/`. The optional AI Chat service is not part of that workspace and keeps its own install lifecycle; install it only when working on the service:

```bash
npm ci --prefix mini-services/ai-chat
```

Do not run nested `npm ci` commands for Core, Localization, Editor MCP, Game Test Bridge or Editor Host.

## Build the Editor Host

```bash
npm run build
```

The root build command builds the SolidJS Editor Host from `src/editor/` into `src/editor/dist/`. Equivalent explicit command:

```bash
npm run build:editor-host
```

Package-owned quality checks:

```bash
npm run quality:check --workspace=@codogma/cge
npm run quality:check --workspace=@codogma/game-test-bridge-contract
npm run quality:check --workspace=@codogma/localization
npm test --workspace=@codogma/editor-mcp-server
npm run typecheck --workspace=@codogma/editor-host
npm test --workspace=@codogma/editor-host
npm run test:workspace-consumer
```

The Core quality suite also runs its existing packed-tarball consumer fixture: it packs the package, installs the resulting archive into a temporary consumer and compiles/executes consumer code against the published exports. The workspace consumer fixture imports every library package through its bare public specifier after the root install.

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
