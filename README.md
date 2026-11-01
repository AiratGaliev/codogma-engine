# Codogma Engine

**Codogma Engine is an independent, actively evolving project for building 2D HTML5 games.** The goal is to grow it into a coherent engine with its own architecture, runtime workflow, visual editor, project model and developer tools.

The current implementation provides a browser-based authoring environment, a local Node.js server, Phaser 4.2.1 integration, scene/code-generation tools and MCP-based automation. Some parts are established editor functionality; the broader engine architecture is still evolving. This README describes verified behaviour and known limits without treating planned capabilities as already implemented.

- **Product:** Codogma Engine
- **Current product version:** 1.0 (see <code>source/editor/product.json</code>)
- **Current game framework/runtime integration:** Phaser 4.2.1
- **License:** MIT — see [LICENSE](LICENSE)
- **Build notes:** [BUILD.md](BUILD.md)

## Project direction

Codogma is being developed as its own engine. The repository contains two independent browser-editor applications: the legacy Colibri client in `source/editor/` and the new **SolidJS + TypeScript/TSX Editor Host** in `src/editor/`, styled with Tailwind CSS 4. The new Host is an implemented standalone application; COD-80 / PR #30 delivers its first Workbench and Scene vertical slice. PR #30 is still open and not yet merged into `dev`, and production `/editor/` cutover has not happened. Until cutover, Colibri remains available for compatibility and reference only. Do not add new user-facing features to Colibri. Migration reuses verified workflows and domain/data/runtime contracts, but does not copy Colibri Workbench, Parts, controls, plugin registry, globals or private UI abstractions into SolidJS. The UI migration does not by itself rewrite Phaser runtime, server APIs, project formats, serializers, asset metadata or code generation. See [Editor UI migration plan](docs/editor-ui-migration.md), [ADR-0005](docs/decisions/ADR-0005-solidjs-editor-host.md) and [COD-82](https://linear.app/codogma-engine/issue/COD-82/zavershit-staged-migration-colibri-solidjs-editor-host).

Development priorities:

- Keep the editor, project files, runtime integration and tools working as one development workflow.
- Evolve engine-specific APIs and architecture deliberately, rather than adding features solely to match another product.
- Preserve working functionality while improving maintainability, tests and developer documentation.
- Clearly distinguish implemented behaviour, known limitations and future work.

This direction does **not** mean every planned engine subsystem already exists. Check the implementation and tests before relying on a capability or describing it as complete.

## AI-assisted development

Start every coding session with [AGENTS.md](AGENTS.md), including a new chat with no previous conversation context. It explains the project bootstrap, architecture guardrails and which installed skill to load for each kind of task. The curated, version-controlled skill snapshots live under `.agents/skills/`; their upstreams, scope, limitations and update process are recorded in [docs/agent-skills.md](docs/agent-skills.md). The source/hash manifest is [skills-lock.json](skills-lock.json). Read only the skills relevant to the current task, then verify their recommendations against the technical specification, pinned dependencies and actual code.

Web Runtime is a first-class target: browser lifecycle/audio activation, WebGL loss/recovery, iframe host contracts, resource/memory budgets, storage failures and mobile/embedded-host acceptance are explicit requirements. See [the architecture risk register](docs/architecture-risk-register.md).

## Current capabilities

| Area | Available today |
|---|---|
| Browser-based IDE | The Node.js server currently serves the legacy Colibri client at <code>/editor/</code>. The independent SolidJS Host runs in parallel from <code>src/editor/</code> on Vite during migration; production cutover is not complete. |
| Scene authoring | The legacy client retains broader existing workflows. The new SolidJS Host has a tested first Scene slice: open/edit/save/reopen, Phaser-backed viewport, Hierarchy/selection, Transform, Inspector and Undo/Redo. Editing a <code>.scene</code> file does not automatically regenerate <code>game.js</code>; Game View currently loads the project's existing generated <code>index.html</code>. |
| Project assets | Existing Asset Pack/import/Sprite Metadata and conflict-aware reimport contracts are implemented in the legacy workflow; full Asset Browser, Asset Pack and Sprite Authoring UI migration to SolidJS remains open in [COD-86](https://linear.app/codogma-engine/issue/COD-86/perenesti-asset-browser-asset-pack-i-sprite-authoring-v-solidjs-editor). See [Sprite asset metadata](docs/sprite-asset-metadata.md) for the UI-independent contract and runtime boundaries. |
| Animation and components | The new Host has basic Phaser JSON animation clip/frame operations and initial Components/Prefab models. Full Timeline/tracks/keyframes/curves/events belong to COD-84; full User Components and TypeScript script authoring to COD-91 (using Core contracts COD-26/COD-27); complete nested Prefab overrides remain in COD-8. |
| Phaser integration | Phaser 4.2.1 is vendored in the editor plugin: production loads `scripts/phaser.min.js`, while development loads `scripts/phaser.js`. TypeScript definitions and code-generation/API adaptations are included; feature-based selection of Phaser runtime code is not implemented. |
| Scene effects and objects | Legacy Colibri contains Phaser filters, supported game-object types and compiler integration. FX authoring/preview is **not yet migrated** to SolidJS; see COD-89 and independent acceptance CODQA-19. |
| Editable tilemaps | Existing legacy Colibri workflows include Tilemap tools, layers, tilesets, painting and MCP data operations. Tilemap authoring UI is **not yet migrated** to SolidJS; see COD-40 and CODQA-14. |
| Physics authoring | Existing legacy editor has Arcade Physics tooling and component-based Box2D body/world settings/codegen on Phaser GameObjects. New Host Physics UI is **not yet migrated** (COD-42); Box2D runtime acceptance remains in CODQA-1. External Box2D runtime setup may be required. Standalone B2Body/B2Shape nodes are not currently supported. |
| MCP integration | Private TypeScript package <code>@codogma/editor-mcp-server</code> exposes the engine-owned registry over stdio and forwards requests to <code>POST /editor/mcp</code>. The live Editor SSE bridge is still legacy-owned and broadcasts to connected clients; the new Host must not attach until session-aware routing COD-85 is implemented and accepted. |
| AI Chat | Optional separate backend under <code>mini-services/ai-chat</code>; it is not required to start the editor itself. |

This table is a practical overview, not a guarantee that every feature has identical behaviour in every runtime. Tools that open a scene in the live editor or capture a screenshot require the editor UI to be running and connected. Some generated game code can also require runtime modules that are not included in the core Phaser bundle. Verify the relevant feature and runtime dependencies before shipping a game.

## Quick start

### Requirements

- Node.js 22 (the version used by CI).
- npm, included with Node.js.
- A modern browser.
- Git to clone the repository.

### Install and run

Clone the repository and install both root and editor dependencies:

~~~bash
git clone https://github.com/AiratGaliev/codogma-engine.git
cd codogma-engine

npm ci

cd source/editor
npm ci
npm run build
cd ../..

npm start
~~~

This default command serves the **legacy Colibri** client at `http://127.0.0.1:3000/editor/`. It does not start the new SolidJS Host. To preview the new Host during migration, start the backend with an exact Origin allow-list and run Vite separately:

**Terminal 1 — backend**

~~~bash
CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173 npm start
~~~

PowerShell equivalent:

~~~powershell
$env:CODOGMA_ALLOWED_ORIGINS="http://127.0.0.1:5173"
npm start
~~~

**Terminal 2 — SolidJS Host**

~~~bash
npm --prefix src/editor ci
npm run dev:editor-host
~~~

Open `http://127.0.0.1:5173/`. Vite proxies `/editor/*` to the local backend. During dual-run, do not edit the same `PROJECT_DIR` in both clients: only one editor may write a project until a concurrency/locking contract exists. Production `/editor/` remains on Colibri until COD-87 cutover.

Open **http://localhost:3000/editor/**.

The server should respond at that address, and product metadata should be available at [http://localhost:3000/editor/product.json](http://localhost:3000/editor/product.json).

**Security boundary:** the main editor server (`server/server.mjs`) and its built-in MCP bridge bind to IPv4 loopback (`127.0.0.1`) and are intended for trusted local development, not direct public-network exposure. Host/Origin, request-size and common path/symlink escapes are checked. Project-file reads and content-file writes use opened file handles that are validated against the selected project root. On Linux, project directory creation, deletion, rename, one-level enumeration, exclusive MCP scene/Prefab creation and copy use operations anchored to already-open directory descriptors; symlink entries are rejected or skipped, and regression tests exercise parent-symlink swaps. This is **not** a portable race-free filesystem guarantee: non-Linux mutation fallbacks still use pathname operations after containment/identity rechecks, and a directory already opened and verified can still be moved outside the project root before a descriptor-anchored operation completes. Keep the server loopback-only and do not treat the entire filesystem API as race-proof; cross-platform guarantees remain subject to the acceptance tracked in [CODQA-7](https://linear.app/codogma-engine/issue/CODQA-7/provesti-cross-platform-acceptance-fajlovoj-bezopasnosti). The optional standalone services under `mini-services/` are separate processes and do **not** inherit the main server's guard. Both currently default to loopback and implement Host/Origin validation and request limits, but host binding can be overridden by environment variables and neither is an authenticated public API. Keep them local; do not bind them to a public interface or expose them through a multi-user proxy without separate authentication/authorization design and service-level security tests.

**Running behind a reverse proxy:** a local proxy that publishes the editor (a sandbox preview, a tunnel, a container port-mapping) connects from loopback but forwards the public `Host` header, which the guard above rejects by default. Prefer an explicit comma-separated `CODOGMA_ALLOWED_HOSTS` allow-list. `npm run dev:proxy` is a convenience for a trusted development tunnel, not a production-safe security profile: it sets wildcard Host/Origin allowances unless overridden. Loopback binding protects the local server socket from direct remote connections; it does **not** protect users from malicious requests sent through a proxy that is already exposed to the network.

**Gateways that rewrite the `Host` header:** some platforms serve the page from one domain while the local gateway forwards an internal `Host` name the browser never sees, so the browser `Origin` can never equal `Host` and every API call would get a 403. Set <code>CODOGMA_ALLOWED_ORIGINS</code> to the narrowest trusted browser-origin allow-list that works (exact origins first; scheme-locked subdomain wildcards only when required). Setting it to `*` disables the effective Origin allow-list and accepts requests from any browser origin; this is **not** protected by a claim that same-origin checks still block cross-site requests. Never use a wildcard Origin on a public or multi-user proxy. Prefer, for example, <code>CODOGMA_ALLOWED_ORIGINS='https://editor.example.com' CODOGMA_ALLOWED_HOSTS='editor.example.com' npm start</code> in a trusted private environment, and keep the server bound to loopback.

### Run the new SolidJS Editor Host (parallel migration mode)

The new Host runs independently from the retained Colibri editor. Keep the Node backend and Vite UI in separate terminals:

**Terminal 1 — existing backend:**

Bash:

```bash
CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173 npm start
```

PowerShell:

```powershell
$env:CODOGMA_ALLOWED_ORIGINS = "http://127.0.0.1:5173"
npm start
```

**Terminal 2 — SolidJS Host:**

```bash
cd src/editor
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. The Vite server binds to IPv4 loopback, uses strict port 5173 and proxies only the existing `/editor/*` backend routes to port 3000. The exact Origin allow-list is required because the proxy rewrites the backend Host header; do not replace it with a wildcard.

The first Host slice opens a project selected by `PROJECT_DIR`, discovers `.scene` files, renders a Phaser-backed Scene Canvas, supports object selection and Move/Rotate/Scale gestures, synchronizes Hierarchy and Inspector/Transform, and saves the existing scene JSON through the backend API. Save/reopen and Undo/Redo are covered by automated and Chromium tests. Game View loads the project's existing generated `index.html` in a disposable iframe; saving a `.scene` does not run code generation or rebuild `game.js`. The legacy Colibri editor remains available at **http://127.0.0.1:3000/editor/**.

Root shortcuts:

```bash
npm run dev:editor-host
npm run build:editor-host
npm run test:editor-host
npm run test:editor-host:browser
```

Browser acceptance uses a temporary copy of `tests/workspace/test-typescript`; it never points the test backend at a developer's project. Until the new Host gains session-aware MCP routing and a cross-client write/version contract, use only one UI to write to a given project directory at a time.

### Select a game project

By default, the server opens the test project in <code>tests/workspace/test-typescript</code>. This is useful for local development and CI, but it is not intended to be your own game project. Point <code>PROJECT_DIR</code> at the directory you want to edit.

Bash:

~~~bash
PROJECT_DIR=/absolute/path/to/my-game npm start
~~~

PowerShell:

~~~powershell
$env:PROJECT_DIR = "C:\path\to\my-game"
npm start
~~~

The server uses these defaults unless overridden:

| Variable | Default | Purpose |
|---|---|---|
| <code>PORT</code> | <code>3000</code> | HTTP port for the editor server. |
| <code>PROJECT_DIR</code> | <code>tests/workspace/test-typescript</code> | Game project files served and edited by the IDE. |
| <code>EDITOR_DIR</code> | <code>source/editor</code> | Editor client directory served by the server. |
| <code>DEV_MODE</code> | Unset / disabled | Set to <code>1</code> to load plugin development scripts where available. |
| <code>CODOGMA_MCP_URL</code> | <code>http://127.0.0.1:3000/editor/mcp</code> | Loopback HTTP MCP endpoint used by <code>@codogma/editor-mcp-server</code>; only the exact local endpoint path is accepted. |
| <code>MCP_BRIDGE_PORT</code> | <code>1902</code> | Port for the legacy WebSocket bridge used by older editor-side MCP configuration. The new stdio package does not use this port. |
| <code>MCP_BRIDGE_HOST</code> | <code>127.0.0.1</code> | Host for the legacy local bridge. |
| <code>AI_CHAT_SERVICE</code> | <code>http://127.0.0.1:3031</code> | URL of the optional AI Chat backend. |

Use a project directory you control. Avoid pointing the development server at a directory containing private files that should not be accessible to the editor or its tools.

## Repository layout

| Path | Responsibility |
|---|---|
| <code>server/server.mjs</code> | Local HTTP server, editor/project APIs, file operations, play-mode serving, AI Chat endpoint and MCP bridge. |
| <code>server/mcp-launcher.mjs</code> | Starts the Codogma-owned MCP package when installed and built; otherwise falls back to the dependency-free stdio implementation. |
| <code>server/mcp-stdio.mjs</code> | Dependency-free stdio MCP fallback entry point. |
| <code>packages/editor-mcp-server/</code> | Private TypeScript stdio adapter, its independent npm manifest/lockfile, tests and documentation. It reuses the engine MCP schemas and execution through <code>POST /editor/mcp</code>. |
| <code>mini-services/phaser-editor-mcp/</code> | Legacy HTTP/WebSocket bridge retained for existing editor-side MCP workflows; not used by the new package. |
| <code>tests/security-smoke-test.mjs</code> | Verifies local-only HTTP access, symlink containment and MCP compatibility. |
| <code>source/editor/</code> | Legacy Colibri-based browser editor client, TypeScript sources, plugins, assets, product metadata and client build configuration; compatibility/reference only until cutover and later removal. |
| <code>src/editor/</code> | Implemented independent SolidJS + TypeScript/TSX Editor Host with its own <code>package.json</code>, lockfile, Vite config, design system, Godot SVG icons, domain/browser tests and CI job. It becomes the default client after staged migration and cutover. |
| <code>mini-services/ai-chat/</code> | Optional standalone AI Chat backend. |
| <code>tests/mcp-e2e-test.mjs</code> | MCP integration test driver used by the local test command and CI. |
| <code>tests/workspace/test-typescript/</code> | Default fixture project for development and CI. |
| <code>.github/workflows/ci.yml</code> | Fast pull-request checks and branch-route validation. |
| <code>.github/workflows/e2e.yml</code> | MCP integration checks for promotion to <code>test</code> and <code>main</code>. |
| <code>.github/workflows/release.yml</code> | Build, smoke-test and ZIP artifact workflow for <code>main</code>. |
| <code>BUILD.md</code> | Additional build notes. |
| <code>.github/pull_request_template.md</code> | Pull Request description and acceptance checklist. |

**Package source layout:** the first standalone tooling package follows the ТЗ layout in `packages/editor-mcp-server/` and owns its manifest, lockfile, exports, tests and documentation. This does **not** mean npm Workspaces have been enabled: root/editor/local package boundaries and lockfiles remain separate. The SolidJS Editor Host is a new application under `src/editor/`, not a mechanical move of the legacy tree. The Colibri client stays under `source/editor/` during migration and is removed only after cutover acceptance. npm Workspaces, Feature/Capability Registry and a public/versioned Extension API remain separate future steps. Consumer projects must not acquire every engine package as a dependency; only explicitly selected packages and their npm-resolved transitive dependencies belong in a game project.

**SolidJS frontend model:** the new Host uses JSX/TSX and fine-grained reactivity. Solid compiles JSX into DOM operations and updates nodes that depend on changed signals/stores; it does not use Virtual DOM reconciliation. Its JSX is familiar to React developers, but its component execution and reactive-state model are different: components are not re-rendered as React function components on each state update. Use Solid primitives such as `createSignal`, `createMemo`, `createStore`, `createEffect` and `onCleanup`, and the `vite-plugin-solid` integration rather than copying React Hooks patterns.

## Daily development commands

Run these commands from the repository root unless noted otherwise.

| Command | Purpose |
|---|---|
| <code>npm start</code> | Start the local editor server. |
| <code>npm run dev</code> | Start the server and pipe its output to <code>dev.log</code> (requires a shell with <code>tee</code>). |
| <code>npm run dev:proxy</code> | Like <code>npm run dev</code>, but accept any `Host` header from loopback peers (<code>CODOGMA_ALLOWED_HOSTS=*</code>) and any browser `Origin` (<code>CODOGMA_ALLOWED_ORIGINS=*</code>, overridable) for publishing behind a trusted local reverse proxy. |
| <code>npm run build</code> | Build/type-check the editor client through TypeScript project references. |
| <code>npm run watch</code> | Run the editor TypeScript compiler in watch mode. Start the server separately if you need to use the editor. |
| <code>npm run mcp</code> | Start the Codogma stdio MCP package through the launcher (when package dependencies are installed and built); the editor server must be running. |
| <code>npm run mcp:builtin</code> | Start the dependency-free stdio MCP fallback. |
| <code>npm run build:mcp</code> | Build the standalone MCP package TypeScript sources. |
| <code>npm run test:mcp-package</code> | Run isolated stdio/HTTP bridge contract tests for the package. |
| <code>npm run build:editor-host</code> | Typecheck and production-build the independent SolidJS Host in <code>src/editor/</code>. |
| <code>npm run test:editor-host</code> | Run SolidJS Host domain tests. |
| <code>npm run test:editor-host:browser</code> | Run Chromium browser acceptance for the implemented Host slice. |
| <code>npm run test:e2e</code> | Run the engine MCP integration test driver. Start the editor server first. |
| <code>npm run test:all</code> | Run unit, security, mini-service, localization, package, project-diagnostics, localization-runtime acceptance and MCP E2E checks. Install dependencies in each package first and start the editor server for MCP E2E. |

For a typical local code change:

1. Start the relevant client: legacy Colibri only for compatibility investigations, or the SolidJS Host at port 5173 for all new UI/authoring work.
2. Make the change in the target Host or shared server/domain subsystem; do not add new user-facing features to Colibri.
3. For legacy TypeScript/compiler changes, run the root <code>npm run build</code>; for SolidJS Host changes, run <code>npm run build:editor-host</code> and the relevant Host domain/browser tests.
4. For MCP work, start the server in one terminal and run <code>npm run test:e2e</code> in a second terminal.
5. Verify the relevant functionality in the browser if the change affects the UI, generated code or runtime behaviour. Server-side MCP tests are not a replacement for visual acceptance testing.

### MCP integration tests

The standard test command checks MCP initialization and tool registration (including the upstream Spine skin-image tool), queries scenes, creates a temporary scene, adds objects, exercises prefab/asset tools and verifies that a texture size can be read. The package contract suite also compares the full upstream tool-name set, compiles every real engine JSON Schema and checks nested/alternative argument validation plus image-content forwarding. The generated test scene is removed during cleanup. The Spine image renderer itself remains a browser/SSE acceptance path, not part of the default headless E2E.

Terminal 1:

~~~bash
npm start
~~~

Terminal 2:

~~~bash
npm run test:e2e
~~~

By default, these checks exercise server-side MCP capabilities. Optional checks that open a scene and request a screenshot require a running and connected editor UI and can be enabled with <code>MCP_E2E_WITH_EDITOR=1</code>. The default CI job does not enable this UI-specific mode.

## Architecture and integration boundaries

The current implementation has three main runtime areas:

1. **New Editor Host** — the independent SolidJS application under <code>src/editor/</code>, target for all new UI and authoring workflows.
2. **Legacy Editor client** — the Colibri-based TypeScript application under <code>source/editor/</code>, retained temporarily for compatibility and workflow reference only; no new user-facing features are developed there.
3. **Local server** — <code>server/server.mjs</code> serves the legacy client until cutover, exposes shared project/file APIs and hosts MCP/bridge services used by both editor applications.
4. **Game project/runtime** — the editable project is selected by <code>PROJECT_DIR</code>. The editor integrates with Phaser 4.2.1 and generates game code; the game project's runtime dependencies still need to be appropriate for the code it uses.

The server also integrates with the optional AI Chat backend. That backend is a separate service and can be run independently.

### Transitional dual-editor development

During staged migration, the two independent UIs run as separate browser applications. Their coexistence does not make the Colibri UI the architectural base for SolidJS:

| UI host | Development address | Role |
|---|---|---|
| Legacy Colibri editor | `http://127.0.0.1:3000/editor/` | Existing client served by the Node.js backend |
| New SolidJS Editor Host | `http://127.0.0.1:5173/` | Independent Vite dev server; configurable port with strict-port behaviour |

The intended development topology is **two UI hosts, one backend API**. The Vite server proxies the existing `/editor/*` project/API routes to the Node.js server on port 3000; browser code should call relative proxied paths rather than making direct cross-origin requests to the backend. The Node server supports an exact Origin allow-list: configure only `CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173` for the Vite origin. Do not use `*`, do not bind either development server to a public interface, and keep the backend's loopback and Host protections enabled. The Vite port is not the Node server's `PORT` variable.

Both clients may be open for visual comparison, but **do not edit the same project from both clients at the same time**. They maintain independent in-browser state, selection, undo histories and caches; the current project-file API does not provide a cross-client editing lock or conflict-resolution protocol. Use one writer at a time, or separate fixture/project copies and independent backend instances for write acceptance.

The current MCP editor SSE bridge broadcasts commands to every connected editor client and accepts the first matching result. Until session-aware routing is implemented in [COD-85](https://linear.app/codogma-engine/issue/COD-85/realizovat-session-aware-mcp-sse-routing-dlya-neskolkih-editor-host), only one UI may own that SSE connection. Initially the legacy client remains the MCP SSE owner; the new Host must not attach to the same bridge. This restriction is separate from HTTP MCP tools that do not need a live editor session.

The two-port arrangement is a development/transition setup, not a permanent production requirement. At cutover, the built SolidJS UI is served by the existing local backend under the normal editor URL; the legacy route is retained only for a bounded rollback window and removed after acceptance. Full details and gates are in the [migration plan](docs/editor-ui-migration.md).

### HTTP endpoints

The local server exposes editor routes including:

- <code>/editor/</code> — editor UI;
- <code>/editor/product.json</code> — product metadata used by the editor;
- <code>POST /editor/api</code> — editor project/file API;
- <code>/editor/project/...</code> — project file access used by editor components;
- <code>/editor/external/...</code> — project files for play mode;
- <code>/editor/upload</code> — uploads;
- <code>/editor/mcp</code> — built-in Streamable HTTP MCP endpoint;
- <code>/archive/</code> and <code>/archive/&lt;filename&gt;</code> — development-only download of a prepared full-project snapshot (see below).

The legacy editor-side WebSocket MCP bridge listens on port <code>1902</code> by default. The new <code>@codogma/editor-mcp-server</code> does not use that port: it sends JSON-RPC requests to <code>POST /editor/mcp</code> on the main local HTTP server.

### Full-project development snapshots

The <code>/archive/</code> endpoint is a development hand-off mechanism for retrieving an archive of the current project snapshot. It is separate from the Release workflow's <code>codogma-engine-release</code> artifact: this endpoint serves a prepared full-project archive from the repository root, including the files captured by the development snapshot process.

- <code>GET /archive/</code> selects the most recently modified matching archive in the repository root and responds with a redirect to its download URL.
- <code>GET /archive/&lt;filename&gt;</code> downloads a specific snapshot by name. <code>HEAD</code> is supported for metadata checks without downloading the body.
- Accepted filenames match <code>codogma-engine-&lt;snapshot-id&gt;.zip</code> or <code>codogma-engine-&lt;snapshot-id&gt;.tar.gz</code>, where the snapshot ID contains only letters, digits, <code>+</code>, <code>.</code>, <code>_</code> and <code>-</code>. The endpoint does not build an archive itself; the snapshot must already exist as a regular file in the repository root.
- If no matching snapshot exists, <code>/archive/</code> responds with <code>404</code>. An invalid filename is rejected; unsupported HTTP methods return <code>405</code>.

**Access boundary:** snapshots may contain the complete source tree, development fixtures and documentation, so treat this as a trusted development endpoint, not a public artifact distribution service. The server binds to loopback and the route goes through the same Host/Origin guard as other HTTP routes. If access is provided through a reverse proxy, allow only the required trusted hosts and browser origins; do not expose this endpoint to an untrusted network or use wildcard proxy allow-lists in shared/public environments. Do not commit generated snapshots to the repository.

## MCP and AI tooling

Repository-wide instructions for coding agents are in [AGENTS.md](AGENTS.md). The curated third-party skills used during engine development, their upstream sources, limitations and update procedure are documented in [docs/agent-skills.md](docs/agent-skills.md). The source/hash manifest is [skills-lock.json](skills-lock.json); the selected skill snapshots live under `.agents/skills/` and are committed with the project.

Codogma now owns a private TypeScript MCP stdio package at
<code>packages/editor-mcp-server/</code>. Its npm package name is
<code>@codogma/editor-mcp-server</code>. The adapter uses the official MCP TypeScript SDK,
but it does not define a second copy of the editor tools: it fetches the actual JSON
Schemas from the engine and forwards tool calls to <code>POST /editor/mcp</code>.
The registry, instructions, validation and execution remain owned by
<code>server/mcp.mjs</code>.

The package is private while its API and release process are being validated. It is
not published to npm yet. The <code>npx</code> configuration below is the target form
after a future publication, not a currently installable public package.

### Local development

Start the editor server:

~~~bash
npm start
~~~

In another terminal, install and build the package dependencies:

~~~bash
npm --prefix packages/editor-mcp-server ci
~~~

Configure the MCP host to launch the package-backed launcher from this checkout
(use an absolute path):

~~~json
{
  "mcpServers": {
    "codogma-engine": {
      "command": "node",
      "args": ["/absolute/path/to/codogma-engine/server/mcp-launcher.mjs"],
      "env": {
        "CODOGMA_MCP_URL": "http://127.0.0.1:3000/editor/mcp"
      }
    }
  }
}
~~~

The launcher starts <code>packages/editor-mcp-server/dist/cli.js</code> when the
package and its dependencies are installed. Otherwise it explicitly falls back
to the dependency-free <code>server/mcp-stdio.mjs</code> implementation.

After a future npm publication, the intended direct configuration will be:

~~~json
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
~~~

The stdio adapter loads the tool list when its process starts. Restart the MCP process
after changing the engine or its tool registry. Project/file operations are executed by
the engine server. Tools that need the active scene, screenshots or other live editor
state also require the editor page to be open and its SSE bridge connected.

### Legacy bridge

<code>mini-services/phaser-editor-mcp/</code> and port <code>1902</code> remain for
older editor-side WebSocket workflows. The new Codogma MCP package does not use
that service. The legacy bridge has a separate security and lifecycle surface and
must not be exposed to an untrusted network; its remaining security work is tracked
separately in the capability matrix/roadmap.

### Optional AI Chat service

The AI Chat backend is located in <code>mini-services/ai-chat/</code> and listens on port <code>3031</code> by default when started with its development command.

~~~bash
cd mini-services/ai-chat
npm install
npm run dev
~~~

The editor server forwards its AI Chat endpoint to the URL configured by <code>AI_CHAT_SERVICE</code>. This service is optional; it is not required for the editor server, scene editing or the standard MCP integration tests. Follow the backend's own setup requirements for its model/provider integration.

## CI and release workflow

CI is designed to check changes quickly and to run MCP integration tests on promotion branches.

| Workflow / job | Trigger | Main checks |
|---|---|---|
| **CI Fast** — <code>fast-checks</code> | PR targeting <code>dev</code>, <code>test</code> or <code>main</code>; manual dispatch | Markdown-only PRs run changed-document checks (final newline, LF, fenced blocks and newly added relative links) and skip npm installation/build/runtime tests. PRs with non-Markdown changes run the full fast code checks. Dependency audits run only for package scopes whose manifest/lockfile changed (or when <code>.npmrc</code> changes); manual dispatch audits every scope. |
| **E2E** — <code>mcp-integration</code> | PR targeting <code>test</code> or <code>main</code>; manual dispatch | Installs/builds the standalone MCP package, starts the engine server and tests the stdio adapter through <code>POST /editor/mcp</code>. UI-dependent acceptance remains separate. |
| **Release Codogma Engine** — <code>release-archive</code> | Push to <code>main</code>; manual dispatch | Builds the client and MCP package, smoke-tests the server and uploads a ZIP artifact named <code>codogma-engine-release</code>. |

The release workflow uploads a GitHub Actions artifact; it does not automatically publish a GitHub Release. The archive contains the server, editor client and selected root metadata/documentation. Check <code>.github/workflows/release.yml</code> before assuming an optional service or development fixture is included in the package.

### Required status checks

Branch Rulesets require these exact status names:

| Target branch | Required checks |
|---|---|
| <code>dev</code> | <code>fast-checks</code> |
| <code>test</code> | <code>fast-checks</code>, <code>mcp-integration</code> |
| <code>main</code> | <code>fast-checks</code>, <code>mcp-integration</code> |

A successful server-side MCP test, TypeScript build or security smoke test does not guarantee that every UI workflow, generated game or browser-rendering path works. Run and document additional acceptance checks when the change affects those areas. The pending runtime and security follow-ups for the Scene Editor, FX/Box2D code generation, Asset Pack and project-file containment are tracked in [the roadmap](docs/roadmap.md); do not treat a green Fast CI run as browser acceptance evidence.

## Branches, Pull Requests and Mandatory Development Rules

The branch flow is part of the project workflow, not a convention to bypass when a change is inconvenient. Treat these rules as mandatory for contributors and agents working in the repository.

For the required Linear issue-state lifecycle (`Todo`, `In Progress`, `In Review`, `Done`) and the task-start/review/acceptance checklist, follow [Engineering and Linear Workflow Rules](docs/engineering-workflow.md). In particular, `In Review` means implementation is finished but evidence or acceptance is still pending; `Done` requires all applicable criteria to be verified.
### Linear teams and issue ownership

Linear work is split by responsibility across two teams in the shared **Codogma Engine** project:

| Team | Issue identifiers | Owns |
|---|---|---|
| **Codogma-engine (COD)** | **COD-N** | Engineering delivery: implementation, fixes, architecture, automated tests and CI/tooling. |
| **Codogma QA (CODQA)** | **CODQA-N** | Functional acceptance of editor/game workflows and release-candidate acceptance. |

Create Engineering issues in COD and QA/acceptance issues in CODQA. Keep cross-team parent/sub-issue or related links so an acceptance task points to the Engineering work it verifies. A defect discovered during QA becomes a separate Engineering/Bug issue in COD; do not move implementation work into the QA team.

Both teams belong to the same [Codogma Engine Linear project](https://linear.app/codogma-engine/project/codogma-engine-1a4353b33f63), whose lead team remains COD. Use the [Development Kanban](https://linear.app/codogma-engine/project/codogma-engine-1a4353b33f63/view/development-kanban-4db756f5f1c6) for engineering work and [QA Kanban](https://linear.app/codogma-engine/project/codogma-engine-1a4353b33f63/view/qa-kanban-918c848c9880) for QA work. Detailed ownership, Work type labels, acceptance evidence and state semantics are defined in [docs/engineering-workflow.md](docs/engineering-workflow.md). Team landing guides: [COD](https://linear.app/codogma-engine/document/codogma-engine-cod-team-home-and-working-agreement-c2f17d6e0e98) and [CODQA](https://linear.app/codogma-engine/document/codogma-qa-codqa-team-home-and-acceptance-guide-aac02e93222c).

### Permanent branches

| Branch | Purpose | What may be merged into it |
|---|---|---|
| `dev` | Daily integration branch | Topic branches through a PR; an explicitly justified hotfix integration when needed |
| `test` | Acceptance branch for a release candidate | Only `dev` through a PR |
| `main` | Stable branch and source of release archives | Only `test` or an emergency `hotfix/*` branch through a PR |

The intended promotion route is **`topic branch → dev → test → main`**. Do not skip a stage for ordinary development work.

### Non-negotiable rules

1. **Never push changes directly to `dev`, `test` or `main`.** Create a branch and open a PR, including for documentation-only changes. The active GitHub Rulesets require PRs and passing status checks, block branch deletion and non-fast-forward updates, and do not allow bypassing the rules.
2. **Never send routine feature or bug-fix branches directly to `test` or `main`.** Do not open `dev → main` or `test → dev` PRs. A routine release candidate must flow through `dev → test → main`.
3. **Start ordinary work from the latest `dev`.** Do not create a new feature branch from a stale local branch, an unrelated topic branch or `test`/`main`.
4. **Keep each PR focused on one coherent task.** Avoid unrelated refactors, speculative cleanup and unfinished partial work in the same PR. Split independently reviewable work into separate topic branches.
5. **Do not promote a partial release candidate.** A `dev → test` PR means the changes proposed for that candidate are implemented, integrated and ready for acceptance—not that development needs to pause or that the entire long-term engine vision must be finished. Keep unfinished work in topic branches and merge it into `dev` when it is ready.
6. **Do not bypass a failing check.** Do not disable a workflow, rename or remove a required status, weaken a test, or change the PR target solely to make a red check disappear. Fix the cause and rerun the checks, or document a genuine infrastructure failure and rerun the affected workflow.
7. **Update tests and documentation with the change.** If behaviour, an API, generated code, a project format, setup, or a developer workflow changes, update the corresponding tests and documentation in the same PR. Never describe an unimplemented capability as complete.
8. **Report evidence honestly.** List the commands run and their results. Explicitly call out checks not run and known limitations; do not mark skipped checks as passed.
9. **Do not keep long-lived branches without a clear reason.** Keep topic branches aligned with the current integration work and remove them after they are no longer needed, subject to repository permissions and team coordination.

### Creating a normal topic branch

Start from an up-to-date `dev` and ensure your working tree is clean:

~~~bash
git status --short
git switch dev
git pull --ff-only origin dev
git switch -c feat/<short-name>
~~~

Use a short, descriptive branch name and one of these prefixes:

| Prefix | Use |
|---|---|
| `feat/*` or `feature/*` | New user-facing or engine functionality |
| `fix/*` | Normal bug fix |
| `refactor/*` | Internal restructuring without intended behaviour change |
| `test/*` | Test coverage or test infrastructure |
| `docs/*` | Documentation-only changes |
| `chore/*` | Maintenance and tooling |
| `hotfix/*` | Emergency fix for a release-blocking problem; not a substitute for an ordinary `fix/*` |

Do not use branch names such as `work`, `changes` or `update` that do not communicate the change type. If a branch already contains changes based on an old `dev`, update it deliberately before opening the PR; do not silently change its base to another permanent branch.

### Allowed PR routes

| PR source → target | Status | Rule |
|---|---|---|
| `feat/*`, `feature/*`, `fix/*`, `refactor/*`, `test/*`, `docs/*`, `chore/*` → `dev` | Standard | Use for normal development; keep the PR scoped and ready to merge |
| `dev → test` | Promotion | Only a complete, internally consistent acceptance candidate |
| `test → main` | Release | Only after acceptance checks pass and the candidate is ready to become the stable version |
| `hotfix/* → main` | Emergency exception | Only for a release-blocking defect that cannot wait for the normal promotion route; explain the urgency and test impact in the PR |
| `hotfix/* → dev` | Exceptional integration | The routing workflow currently accepts this, but it is not the standard development route. Explain why a hotfix must be integrated this way |

A hotfix merged directly into `main` must subsequently be integrated back into `dev` through a PR, unless the fix is already present there. Include the backport plan in the hotfix PR. Do not use an emergency route for ordinary feature work.

### Promotion gates

Before opening **`dev → test`**, verify all of the following:

- Every change intended for this candidate is merged into `dev`; there are no known release-blocking defects in the candidate.
- The editor build and server smoke checks pass.
- The MCP integration check is expected to run on this PR and must pass.
- Any affected UI, scene-authoring, generated-code or live-editor workflow has also been manually checked in the browser. The default MCP integration suite is not a substitute for UI acceptance testing.
- Relevant tests, setup notes and user/developer documentation are updated.
- The PR description states the candidate scope, acceptance evidence, and any known limitations.

Before opening **`test → main`**, confirm the candidate has been accepted on `test`, required checks pass, no known release-blocking issue remains, and the release notes/documentation accurately describe the shipped behaviour. Do not merge a release candidate just because the branch has accumulated changes or because a release is desired.

If a promotion gate fails, stop the promotion. Fix the issue in the appropriate topic branch, merge the fix to `dev`, and create a fresh promotion PR when the candidate is ready. Do not use a partial `dev → test` PR as a way to deploy incomplete work.

### Local checks before a PR

For implementation changes, run commands from the repository root. Root, editor, localization and standalone MCP package dependencies are installed separately (there are no npm Workspaces yet). A Markdown-only PR does not require dependency installation or a game/editor build: CI runs the changed-document checks directly.

~~~bash
npm ci
cd source/editor
npm ci
cd ../..
cd packages/localization
npm ci
cd ../..
cd packages/editor-mcp-server
npm ci
cd ../..
npm run build
npm run test:security
npm run test:mcp-package
~~~

Run `npm audit --audit-level=low` in the affected package scope when its `package.json`, `package-lock.json` or applicable `.npmrc` changes. CI Fast applies the same scope selection; manual workflow dispatch runs every configured audit.

Then run checks relevant to the change:

| Change type | Required local acceptance |
|---|---|
| Documentation-only (`*.md`, `*.mdx`, `*.rst`) | No npm install/build is required. CI checks changed Markdown line endings, fenced blocks and newly added relative links. Run `git diff --check` locally when reviewing the patch. |
| Code/build changes | Run `npm run build` before requesting merge; CI runs it as well |
| Dependencies | Run `npm audit --audit-level=low` in every affected package scope. CI audits scopes whose manifest/lockfile changed, or all scopes when `.npmrc` changes; manual dispatch runs all audits. |
| Server, bridge or MCP tools | Run `npm run test:security`; start the server with `npm start`; in a second terminal run `npm run test:e2e` |
| Editor UI, scene authoring, generated code or play mode | Open `http://localhost:3000/editor/` and manually exercise the affected workflow; check browser console and server output |
| Localization package, locale tables, fallback or project diagnostics | Run `npm run test:localization`, `npm run test:localization:project` and `npm run test:localization:acceptance`; verify project diagnostics on representative locale tables |
| Release candidate (`dev → test` or `test → main`) | Check the complete candidate in addition to the required CI integration test; document manual acceptance for any affected UI path |

The optional UI-specific MCP checks can be enabled with `MCP_E2E_WITH_EDITOR=1` (PowerShell: `$env:MCP_E2E_WITH_EDITOR = "1"` before running `npm run test:e2e`). They require the editor UI to be running and connected. The default CI E2E job does **not** enable that mode.

### Line endings and generated files

The repository uses `.gitattributes` to keep ordinary source, configuration, documentation and SVG files on LF line endings across operating systems. Do not use a repository-wide `git add --renormalize .` as a routine cleanup: a line-ending migration must be reviewed and committed separately.

`source/editor/plugins/phasereditor2d.phaser/src/phaser/phaser.ts` is generated Phaser TypeScript declaration output. Its current upstream-generated blob contains non-standard mixed carriage-return bytes, so Git deliberately does not apply end-of-line conversion to that one file and EditorConfig leaves its line-ending policy unset. It is also excluded from formatting. **Do not open and save it with automatic line-ending conversion, run a formatter on it, or hand-edit it.** Change the generator/input instead, regenerate the declarations, and review that generated output separately.

When reviewing a diff that may contain line-ending noise, compare with `git diff --ignore-space-at-eol` to identify whether meaningful code changes remain. This is a diagnostic aid, not a substitute for checking the actual generated output.

### Pull Request description checklist

Every PR must describe:

- **Goal:** the problem being solved and why the change is needed.
- **Scope:** the main implementation changes and any intentionally excluded work.
- **Checks:** exact commands or manual checks completed, with results.
- **Gaps:** checks not run, environmental constraints, risks and known limitations.
- **Documentation:** what was updated, or why no documentation change is needed.
- **Routing:** why this source and target branch are correct; for promotions, the candidate scope and acceptance evidence; for hotfixes, the urgency and backport plan.

Use the repository's [Pull Request template](.github/pull_request_template.md).

### CI status checks and merge requirements

The required GitHub Actions status names are:

| PR target | Required status checks |
|---|---|
| `dev` | `fast-checks` |
| `test` | `fast-checks`, `mcp-integration` |
| `main` | `fast-checks`, `mcp-integration` |

`fast-checks` validates the branch route, installs and audits the locked root/editor/localization dependencies, builds the editor client, runs unit regression and security checks, smoke-tests the server/editor response, and runs localization package tests, project diagnostics and runtime acceptance. `mcp-integration` runs on PRs targeting `test` and `main`; it starts the server and MCP bridge and runs `npm run test:e2e`. Normal PRs into `dev` do not run this slower MCP integration suite as a routine CI gate, so run it locally whenever the change touches MCP/server behaviour and run targeted browser acceptance for UI changes.

The active Rulesets require PRs and successful checks, but **currently do not require reviewer approval**. That is a repository setting, not permission to bypass the PR, test, documentation or promotion rules in this section.

## Troubleshooting

### The editor page does not open

- Confirm the server process is running and read its terminal output.
- Open the configured URL, normally <code>http://localhost:3000/editor/</code>.
- Check whether another process is using <code>PORT</code>; choose another free port if necessary.

### The editor reports missing files or shows the wrong project

Check <code>PROJECT_DIR</code>. If it is unset, the server uses the test fixture at <code>tests/workspace/test-typescript</code>. Use an absolute path to select your game project.

### Changes to editor TypeScript are not visible

Run <code>npm run build</code> from the repository root or <code>npm run watch</code> while developing. Confirm the server is serving the expected <code>EDITOR_DIR</code>.

### MCP tools cannot connect

- Start the Codogma Engine HTTP server before starting an MCP client.
- Confirm that <code>CODOGMA_MCP_URL</code> points to the exact loopback endpoint <code>http://127.0.0.1:3000/editor/mcp</code> (adjust the port when the engine HTTP server uses a non-default port).
- For active-scene, screenshot, tile-selection and Spine image-preview tools, open the editor page and wait for the SSE MCP bridge connection.
- The <code>phaser-editor-mcp-port</code> setting and port <code>1902</code> belong only to the retained legacy WebSocket bridge; the new stdio adapter does not use them.

### MCP E2E fails

Start the server first, then run <code>npm run test:e2e</code>. Inspect the first MCP error in the terminal output and verify that root dependencies are installed. The standard test uses the fixture project unless <code>PROJECT_DIR</code> is overridden.

## Documentation and contribution notes

- [Build guide](BUILD.md)
- [Editor documentation](https://docs.codogma.com)
- [Technical specification (RU)](docs/technical-specification.md)
- [Roadmap (RU)](docs/roadmap.md)
- [Technical reference catalog (RU)](docs/REFERENCE-SOURCES.md)
- [Capability matrix (RU)](docs/capability-matrix.md)
- [Dependency and capability matrix (RU)](docs/dependency-capability-matrix.md)
- [Code quality baseline (RU)](docs/code-quality-baseline.md)
- [Performance baseline protocol (RU)](docs/performance-baseline.md)
- [Core architecture ADR (RU)](docs/decisions/ADR-0001-core-architecture.md)
- [TypeScript toolchain ADR (RU)](docs/decisions/ADR-0002-typescript-toolchain.md)
- [Package architecture and npm-based Package Manager ADR (RU)](docs/decisions/ADR-0003-package-architecture-and-management.md)
- [CI Fast workflow](.github/workflows/ci.yml)
- [MCP E2E workflow](.github/workflows/e2e.yml)
- [Release workflow](.github/workflows/release.yml)

When changing architecture, project formats, compiler output, runtime integration or public editor/server APIs, update the relevant documentation and tests in the same PR. Prefer documenting stable contracts and verified behaviour; track broad engine goals and unfinished subsystems in the project's development plan rather than claiming them as implemented here.

## Origins and licensing

The current editor client includes code derived from the open-source Phaser Editor 2D v3 client. Its origin is relevant to attribution and license compliance, but it does not define Codogma's product direction. Preserve the copyright and license notices in [LICENSE](LICENSE).

Codogma Engine uses Phaser 4.2.1 as its current game framework/runtime integration. Phaser and other third-party components remain subject to their own licenses and terms; review those terms when distributing the engine or a game built with it.


MCP scene-object round-trip tests also cover editor-specific properties for Sprite, TileSprite, NineSlice/ThreeSlice, Text/BitmapText, shapes, Video and ParticleEmitter config, in addition to SpineGameObject serialization.

MCP scene-object round-trip coverage also checks Shape stroke fields, HitArea serialization, current-editor ArcadeComponent key normalization, and Arcade enable/disable behaviour on supported display objects; unsupported object types return explicit errors.

Arcade MCP tools preserve the upstream body.* argument contract while translating fields to the current editor's ArcadeComponent serialization. The enable tool rejects object types that do not install ArcadeComponent; the package suite exercises direct aliases, the arcade shortcut, enable and disable paths.


The engine-owned get-system-instructions response documents the current scene and tool workflows: object hierarchy, plain objects and Tiled maps, editable tilemaps, prefabs and nested instances, object lists, Phaser 4 filters, Arcade physics, assets and Google Fonts, project-file operations, and UI/SSE requirements for visual tools. Package tests assert that these workflow sections remain present.
