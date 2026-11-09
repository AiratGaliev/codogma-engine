# Codogma Engine

**Codogma Engine is an independent, actively evolving project for building 2D HTML5 games.** The goal is to grow it into a coherent engine with its own architecture, runtime workflow, visual editor, project model and developer tools.

The current implementation provides a browser-based authoring environment, a local Node.js server, Phaser 4.2.1 integration, scene/code-generation tools and MCP-based automation. Some parts are established editor functionality; the broader engine architecture is still evolving. This README describes verified behaviour and known limits without treating planned capabilities as already implemented.

- **Product:** Codogma Engine
- **Current product version:** 1.0.0 (root <code>package.json</code>)
- **Current game framework/runtime integration:** Phaser 4.2.1
- **License:** MIT — see [LICENSE](LICENSE)
- **Build notes:** [BUILD.md](BUILD.md)

## Project direction

Codogma Engine is a standalone 2D Web-first engine with its own native Project Model, TypeScript Component system, runtime and SolidJS Editor Host. The single supported editor application lives in `src/editor/`; Core, runtime, build, server and MCP use native Codogma contracts. The Node.js server serves this application at `/editor/`, while Vite provides the development server. See [ADR-0007](docs/decisions/ADR-0007-native-codogma-project-model.md), [Editor Host plan](docs/editor-ui-migration.md), [ADR-0005](docs/decisions/ADR-0005-solidjs-editor-host.md) and [ADR-0004](docs/decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md) (sole normative source for optional Data-Oriented ECS).

Development priorities:

- Keep the editor, project files, runtime integration and tools working as one development workflow.
- Evolve engine-specific APIs and architecture deliberately, rather than adding features solely to match another product.
- Preserve working functionality while improving maintainability, tests and developer documentation.
- Clearly distinguish implemented behaviour, known limitations and future work.

**Source-language standard:** all new first-party functionality and tests are authored in TypeScript (`.ts`); UI components that contain JSX use `.tsx`. Tool configurations use TypeScript when supported natively; declarative formats such as `package.json`, `tsconfig.json`, GitHub Actions YAML, HTML, CSS and `.pen` remain in their native formats. New strict scopes use the full compiler profile and do not add JavaScript feature logic. Existing JavaScript/MJS sources, generated files and vendored sources remain outside a new strict scope unless that scope explicitly includes them; see [ADR-0002](docs/decisions/ADR-0002-typescript-toolchain.md) for the exact boundary.

This direction does **not** mean every planned engine subsystem already exists. Check the implementation and tests before relying on a capability or describing it as complete.

## AI-assisted development

Start every coding session with [AGENTS.md](AGENTS.md), including a new chat with no previous conversation context. It explains the project bootstrap, architecture guardrails and which installed skill to load for each kind of task. The curated, version-controlled skill snapshots live under `.agents/skills/`; their upstreams, scope, limitations and update process are recorded in [docs/agent-skills.md](docs/agent-skills.md). The source/hash manifest is [skills-lock.json](skills-lock.json). Read only the skills relevant to the current task, then verify their recommendations against the technical specification, pinned dependencies and actual code.

Web Runtime is a first-class target: browser lifecycle/audio activation, WebGL loss/recovery, iframe host contracts, resource/memory budgets, storage failures and mobile/embedded-host acceptance are explicit requirements. See [the architecture risk register](docs/architecture-risk-register.md).

## Current capabilities

| Area | Available today |
|---|---|
| Browser-based IDE | The Node.js server serves the native SolidJS Editor Host at <code>/editor/</code>; Vite serves the same application during development. |
| Scene authoring | The SolidJS Host provides the initial Phaser-backed Scene Canvas, selection and Transform interactions. The complete native Project/Scene save/reopen workflow and data-driven Preview are being integrated through the Project Model and Scene Loader. |
| Project assets | Native Asset Library, Sprite metadata, import and reimport workflows are being implemented for the SolidJS Host in [COD-86](https://linear.app/codogma-engine/issue/COD-86/sozdat-native-asset-library-i-realizovat-sprite-authoring-v-solidjs). See [Sprite asset metadata](docs/sprite-asset-metadata.md) for the target metadata contract. |
| Animation and components | The Host has basic animation clip/frame operations and initial Component surfaces. Full Timeline/tracks/keyframes/curves/events belong to COD-84; native Script Asset + manifest-backed User Components belong to COD-91 (using Core contracts COD-26/COD-27); native Prefab overrides remain in COD-8. |
| Phaser integration | Phaser 4.2.1 is vendored in the editor plugin: production loads `scripts/phaser.min.js`, while development loads `scripts/phaser.js`. TypeScript definitions and code-generation/API adaptations are included; feature-based selection of Phaser runtime code is not implemented. |
| Core and ECS | `@codogma/cge` currently provides the initial host-neutral Project Model, object/component `ComponentWorld` foundation and contract-only interfaces for optional Input, Time/Tween and Scene Manager services. The service implementations remain a separate Core work item. Optional Data-Oriented ECS and its Phaser adapter are **not implemented**; their architecture and acceptance source is [ADR-0004](docs/decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md), with implementation owned by COD-111/112. |
| HTML5 build optimization | The current Phaser delivery uses a vendored full Phaser 4.2.1 bundle. A verified selective Phaser build, physical feature pruning and complete Feature/Capability Registry are **not yet implemented**. Upstream Arcade-only UMD and custom/ESM paths must be compared on reproducible generated-game fixtures before making bundle-size or tree-shaking claims. |
| Scene effects and objects | SolidJS Host implements Circle/Bloom/Gradient/Shine Inspector controls and Phaser-backed preview. Persisted Project Model integration and Preview/Build runtime parity remain separate capabilities; independent UX/reference review is tracked by CODQA-19. |
| Spine authoring and preview | A complete native SolidJS Host authoring/preview workflow is not yet implemented. See COD-90, session-aware routing COD-85 and browser/runtime acceptance CODQA-20 (live MCP checks also CODQA-8). |
| Audio groups and particle preview | Native SolidJS authoring/preview controls are not yet implemented. See COD-61 and CODQA-13. |
| Editable tilemaps | Native Tilemap authoring is not yet implemented in SolidJS Host. See COD-40 and CODQA-14. |
| Physics authoring | Native Arcade/Box2D authoring and runtime integration are being developed in COD-42; live Box2D runtime acceptance remains in CODQA-1. Standalone B2Body/B2Shape nodes are not currently supported. |
| MCP integration | Private TypeScript package <code>@codogma/editor-mcp-server</code> exposes native Project Model v1 tools over stdio and routes live editor operations to the single connected native Editor Host; COD-85 owns single-Host bridge reliability and CODQA-8 owns live operations acceptance. |
| AI Chat | Optional separate backend under <code>mini-services/ai-chat</code>; it is not required to start the editor itself. |

This table is a practical overview, not a guarantee that every feature has identical behaviour in every runtime. Tools that open a scene in the live editor or capture a screenshot require the editor UI to be running and connected. Some generated game code can also require runtime modules that are not included in the core Phaser bundle. Verify the relevant feature and runtime dependencies before shipping a game.

## Quick start

### Requirements

- Node.js 22 (the version used by CI).
- npm, included with Node.js.
- A modern browser.
- Git to clone the repository.

### Install and run

Clone the repository and install the engine and Editor Host dependencies:

~~~bash
git clone https://github.com/AiratGaliev/codogma-engine.git
cd codogma-engine

npm ci

npm --prefix src/editor ci
npm run build
npm start
~~~

The server serves the built native Editor Host at `http://127.0.0.1:3000/editor/`. For hot reload during development, use [Run the Editor Host](#run-the-editor-host).

Open **http://127.0.0.1:3000/editor/**.

The server should respond at that address. MCP bridge status is available at [http://localhost:3000/editor/mcp-bridge-status](http://localhost:3000/editor/mcp-bridge-status).

**Security boundary:** the main editor server (`server/server.mjs`) and its built-in MCP bridge bind to IPv4 loopback (`127.0.0.1`) and are intended for trusted local development, not direct public-network exposure. Host/Origin, request-size and common path/symlink escapes are checked. Project-file reads and content-file writes use opened file handles that are validated against the selected project root. On Linux, project directory creation, deletion, rename, one-level enumeration, exclusive MCP scene/Prefab creation and copy use operations anchored to already-open directory descriptors; symlink entries are rejected or skipped, and regression tests exercise parent-symlink swaps. This is **not** a portable race-free filesystem guarantee: non-Linux mutation fallbacks still use pathname operations after containment/identity rechecks, and a directory already opened and verified can still be moved outside the project root before a descriptor-anchored operation completes. Keep the server loopback-only and do not treat the entire filesystem API as race-proof; cross-platform guarantees remain subject to the acceptance tracked in [CODQA-7](https://linear.app/codogma-engine/issue/CODQA-7/provesti-cross-platform-acceptance-fajlovoj-bezopasnosti). The optional standalone services under `mini-services/` are separate processes and do **not** inherit the main server's guard. Both currently default to loopback and implement Host/Origin validation and request limits, but host binding can be overridden by environment variables and neither is an authenticated public API. Keep them local; do not bind them to a public interface or expose them through a multi-user proxy without separate authentication/authorization design and service-level security tests.

**Running behind a reverse proxy:** a local proxy that publishes the editor (a sandbox preview, a tunnel, a container port-mapping) connects from loopback but forwards the public `Host` header, which the guard above rejects by default. Prefer an explicit comma-separated `CODOGMA_ALLOWED_HOSTS` allow-list. `npm run dev:proxy` is a convenience for a trusted development tunnel, not a production-safe security profile: it sets wildcard Host/Origin allowances unless overridden. Loopback binding protects the local server socket from direct remote connections; it does **not** protect users from malicious requests sent through a proxy that is already exposed to the network.

**Gateways that rewrite the `Host` header:** some platforms serve the page from one domain while the local gateway forwards an internal `Host` name the browser never sees, so the browser `Origin` can never equal `Host` and every API call would get a 403. Set <code>CODOGMA_ALLOWED_ORIGINS</code> to the narrowest trusted browser-origin allow-list that works (exact origins first; scheme-locked subdomain wildcards only when required). Setting it to `*` disables the effective Origin allow-list and accepts requests from any browser origin; this is **not** protected by a claim that same-origin checks still block cross-site requests. Never use a wildcard Origin on a public or multi-user proxy. Prefer, for example, <code>CODOGMA_ALLOWED_ORIGINS='https://editor.example.com' CODOGMA_ALLOWED_HOSTS='editor.example.com' npm start</code> in a trusted private environment, and keep the server bound to loopback.

### Run the Editor Host

Install the Host dependencies once with `npm --prefix src/editor ci`. Then start the backend and Vite development server together:

Bash:

```bash
CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173 npm run dev:editor-host
```

PowerShell:

```powershell
$env:CODOGMA_ALLOWED_ORIGINS = "http://127.0.0.1:5173"
npm run dev:editor-host
```

Open **http://127.0.0.1:5173/**. Vite binds to IPv4 loopback, uses strict port 5173 and proxies the native `/editor/*` backend API to port 3000. Keep the exact Origin allow-list; do not replace it with a wildcard.

The Host provides a Phaser-backed Scene Canvas, object selection, Move/Rotate/Scale gestures, Hierarchy and Inspector/Transform synchronization, and an initial Game View iframe. Complete Project Model persistence, Scene Loader and Preview lifecycle continue as separate implementation stages.

Root shortcuts:

```bash
npm run dev:editor-host
npm run build:editor-host
npm run test:editor-host
npm run test:editor-host:browser
```

Browser acceptance uses a temporary copy of `packages/cge/tests/fixtures/acceptance-project`; it never points the test backend at a developer's project. Live MCP commands target the single connected native Editor Host. The SSE bridge owns one connection at a time; multiple simultaneous editor clients and shared multi-Host project ownership are not supported. Use one writer per project directory.

### Select a game project

By default, the server opens the native Project Model v1 fixture in <code>packages/cge/tests/fixtures/acceptance-project</code>. Point <code>PROJECT_DIR</code> at your own native project directory to edit it.

Bash:

~~~bash
PROJECT_DIR=/absolute/path/to/my-game npm start
~~~

PowerShell:

~~~powershell
$env:PROJECT_DIR = "C:\path\to\my-game"
npm start
~~~

The server uses these defaults unless overridden. `PROJECT_DIR` must point to the root of a native Codogma Project Model v1 directory containing `project.json`; the Editor Host development launcher checks this before starting Vite so a legacy workspace cannot fail later as a browser 404:

| Variable | Default | Purpose |
|---|---|---|
| <code>PORT</code> | <code>3000</code> | HTTP port for the editor server. |
| <code>PROJECT_DIR</code> | <code>packages/cge/tests/fixtures/acceptance-project</code> | Native project files served and edited by the Editor Host. |
| <code>EDITOR_HOST_DIR</code> | <code>src/editor/dist</code> | Production build directory for the Editor Host. |
| <code>CODOGMA_MCP_URL</code> | <code>http://127.0.0.1:3000/editor/mcp</code> | Loopback HTTP MCP endpoint used by <code>@codogma/editor-mcp-server</code>; only the exact local endpoint path is accepted. |
| <code>AI_CHAT_SERVICE</code> | <code>http://127.0.0.1:3031</code> | URL of the optional AI Chat backend. |

Use a project directory you control. Avoid pointing the development server at a directory containing private files that should not be accessible to the editor or its tools.

## Repository layout

| Path | Responsibility |
|---|---|
| <code>server/server.mjs</code> | Local HTTP server for the native Editor Host, project files, runtime output, AI Chat endpoint and engine-owned MCP HTTP endpoint. |
| <code>server/mcp-launcher.mjs</code> | Starts the Codogma-owned MCP package; startup fails with an actionable error if the package is missing or has not been built. |
| <code>packages/editor-mcp-server/</code> | Private TypeScript stdio adapter, its independent npm manifest/lockfile, tests and documentation. It reuses engine MCP schemas and execution through <code>POST /editor/mcp</code>. |
| <code>tests/security-smoke-test.mjs</code> | Verifies local-only HTTP access, symlink containment and the MCP HTTP/stdio security boundary. |
| <code>src/editor/</code> | Independent SolidJS + TypeScript/TSX Editor Host with its own <code>package.json</code>, lockfile, Vite config, design system, Godot SVG icons and domain/browser tests. Build and domain tests run in CI Fast; browser E2E runs only in the promotion E2E workflow. |
| <code>mini-services/ai-chat/</code> | Optional standalone AI Chat backend. |
| <code>tests/mcp-e2e-test.mjs</code> | MCP integration test driver used by the local test command and CI. |
| <code>packages/cge/tests/fixtures/acceptance-project/</code> | Default native Project Model v1 fixture for server development and MCP acceptance. |
| <code>.github/workflows/ci.yml</code> | Fast pull-request checks and branch-route validation. |
| <code>.github/workflows/e2e.yml</code> | Full E2E gate (MCP integration + SolidJS Host Playwright browser acceptance) for promotion PRs to <code>test</code> and <code>main</code>. |
| <code>.github/workflows/release.yml</code> | Build, smoke-test and ZIP artifact workflow for <code>main</code>. |
| <code>BUILD.md</code> | Additional build notes. |
| <code>.github/pull_request_template.md</code> | Pull Request description and acceptance checklist. |

**Optional runtime packages:** ECS remains an approved but not yet implemented optional workstream, owned by COD-111/112. Current status is tracked in the [capability matrix](docs/capability-matrix.md); the sole normative architecture and acceptance source is [ADR-0004](docs/decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md).

**Package source layout:** the first standalone tooling package follows the ТЗ layout in `packages/editor-mcp-server/` and owns its manifest, lockfile, exports, tests and documentation. This does **not** mean npm Workspaces have been enabled: root, Editor Host and local package boundaries and lockfiles remain separate. The Editor Host is an independent application under `src/editor/` and is the only supported editor application. npm Workspaces, Feature/Capability Registry and a public/versioned Extension API remain separate future steps. Consumer projects must not acquire every engine package as a dependency; only explicitly selected packages and their npm-resolved transitive dependencies belong in a game project.

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

| <code>npm run build:mcp</code> | Build the standalone MCP package TypeScript sources. |
| <code>npm run test:mcp-package</code> | Run isolated stdio/HTTP bridge contract tests for the package. |
| <code>npm run build:editor-host</code> | Typecheck and production-build the independent SolidJS Host in <code>src/editor/</code>. |
| <code>npm run test:editor-host</code> | Run SolidJS Host domain tests. |
| <code>npm run test:editor-host:browser</code> | Run Chromium browser acceptance for the implemented Host slice. |
| <code>npm run test:e2e</code> | Run the engine MCP integration test driver. Start the editor server first. |
| <code>npm run test:all</code> | Run the complete local test collection, including MCP E2E. This is not the routine feature-PR gate; automated E2E gating starts at promotion (<code>dev → test</code>). Install dependencies in each package first and start the editor server for MCP E2E. |

For a typical local code change:

1. Use the native Editor Host for all authoring and Project Model work.
2. Make the change in the SolidJS Host or shared native domain/runtime subsystem.
3. For root/server changes,
4. For MCP work, run the package contract tests and relevant security tests. Full MCP and browser E2E suites are not run on topic-branch PRs; their CI gate starts only on <code>dev → test</code> promotion.
5. For UI, generated-code or runtime changes, add/update scoped automated regression coverage and the relevant browser-test source/fixtures in the topic PR. Do not run formal manual/browser/runtime acceptance after each Engineering issue and do not block the COD issue or the next dev task on that acceptance. Queue it in CODQA and execute it against the integrated `test` branch only after the relevant changes for the candidate have arrived there.

### MCP integration tests

The standard MCP integration test checks initialization, the native tool registry, JSON Schema validity, project-file boundaries, project listing and external texture discovery. The stdio package contract suite verifies schema forwarding, argument validation, image content blocks, native Host handler coverage and external Spine metadata inspection. Live Scene/Node/Prefab/Component/FX operations are exercised against a connected Editor Host session.

Terminal 1:

~~~bash
npm start
~~~

Terminal 2:

~~~bash
npm run test:e2e
~~~

By default, these checks exercise server-side MCP and external asset inspection. Optional checks that open a native Scene, read its Node hierarchy and request a viewport screenshot require a running, connected Editor Host plus <code>PROJECT_DIR</code> pointing to a native Project Model v1 fixture with at least one Scene; enable them with <code>MCP_E2E_WITH_EDITOR=1</code>. The default fast-checks CI job does not enable this live-editor mode; the full E2E gate remains on promotion PRs.

## Architecture and integration boundaries

The current implementation has three runtime areas:

1. **Editor Host** — the SolidJS + TypeScript application under <code>src/editor/</code>, owning UI, authoring workflows and the MCP bridge.
2. **Local server** — <code>server/server.mjs</code> serves the built Host, native project files, generated runtime output and the engine-owned HTTP MCP endpoint.
3. **Game project/runtime** — the editable project is selected by <code>PROJECT_DIR</code>. Project/Scene documents and registered Script/Component modules follow native Codogma contracts; runtime dependencies must match the native project/build contract.

The server also integrates with the optional AI Chat backend. That backend is a separate service and can be run independently.

### Editor Host development and backend proxy

Production runs the built Editor Host from <code>src/editor/dist</code> under the Node server at <code>/editor/</code>. Development runs the same Host through Vite at <code>http://127.0.0.1:5173/</code>, with requests to <code>/editor/*</code> proxied to the Node backend on port 3000. The Vite proxy requires an exact <code>CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173</code> entry because it forwards browser requests to the loopback backend. Do not use a wildcard Origin or bind development services to a public interface.

The Editor SSE bridge connects one native Editor Host instance to the engine-owned MCP registry. The server issues a session ID and binds every command/result to that connection. Disconnect/reconnect invalidates stale pending operations. Multiple simultaneous Host windows, focus switching, active-client arbitration and multi-Host write ownership are not supported. Use one Editor Host writer per project directory. File-only HTTP MCP tools do not require a connected Host.

### HTTP endpoints

The local server exposes editor routes including:

- <code>/editor/</code> — editor UI;
- <code>POST /editor/project/operations</code> — native Project File operations (listing, writing, directory and entry mutations);
- <code>/editor/project/...</code> — project file access used by editor components;
- <code>/editor/external/...</code> — project files for play mode;
- <code>/editor/mcp</code> — built-in Streamable HTTP MCP endpoint;
- <code>/archive/</code> and <code>/archive/&lt;filename&gt;</code> — development-only download of a prepared full-project snapshot (see below).


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

The launcher starts only the repository-owned <code>@codogma/editor-mcp-server</code> package. If the package or its dependencies are missing, it exits with a non-zero status and prints the installation command; it never switches to a second stdio implementation or transport.

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
after changing the engine or its tool registry. External asset/file inspection runs on the
engine server. Scene/Node/Prefab/Component/FX and screenshot tools require the project to
be open in the Editor Host with its SSE bridge connected.

### Optional AI Chat service

The AI Chat backend is located in <code>mini-services/ai-chat/</code> and listens on port <code>3031</code> by default when started with its development command.

~~~bash
cd mini-services/ai-chat
npm install
npm run dev
~~~

The editor server forwards its AI Chat endpoint to the URL configured by <code>AI_CHAT_SERVICE</code>. This service is optional; it is not required for the editor server, scene editing or the standard MCP integration tests. Follow the backend's own setup requirements for its model/provider integration.

## CI and release workflow

CI Fast is the routine development gate. **No E2E suite is run on topic-branch PRs into <code>dev</code>. All automated E2E suites start only at the <code>dev → test</code> promotion PR and continue on later release-promotion PRs. There are no path-based or per-subsystem E2E exceptions.

| Workflow / job | Trigger | Main checks |
|---|---|---|
| **CI Fast** — <code>fast-checks</code> | PR targeting <code>dev</code>, <code>test</code> or <code>main</code>; manual dispatch | Markdown-only PRs run changed-document checks (final newline, LF, fenced blocks and newly added relative links) and skip npm installation/build/runtime tests. PRs with non-Markdown changes run the full fast code checks. Dependency audits run only for package scopes whose manifest/lockfile changed (or when <code>.npmrc</code> changes); manual dispatch audits every scope. |
| **E2E** — <code>mcp-integration</code> | Promotion PR <code>dev → test</code>, then <code>test → main</code> or allowed emergency <code>hotfix/* → main</code> | Runs the complete existing E2E gate: SolidJS Host Playwright browser acceptance and MCP stdio integration through <code>POST /editor/mcp</code>. No manual dispatch or feature-PR E2E run. |
| **Release Codogma Engine** — <code>release-archive</code> | Push to <code>main</code>; manual dispatch | Builds the client and MCP package, smoke-tests the server and uploads a ZIP artifact named <code>codogma-engine-release</code>. |

The release workflow uploads a GitHub Actions artifact; it does not automatically publish a GitHub Release. The archive contains the server, editor client and selected root metadata/documentation. Check <code>.github/workflows/release.yml</code> before assuming an optional service or development fixture is included in the package.

### Required status checks

Branch Rulesets require these exact status names:

| Target branch | Required checks |
|---|---|
| <code>dev</code> | <code>fast-checks</code> |
| <code>test</code> | <code>fast-checks</code>, <code>mcp-integration</code> |
| <code>main</code> | <code>fast-checks</code>, <code>mcp-integration</code> |

A successful build, unit/contract test or security smoke test does not guarantee that every UI workflow, generated game or browser-rendering path works. The full automated E2E suite is intentionally deferred until the promotion PR <code>dev → test</code> (and subsequent release promotions); do not add E2E execution to routine feature/fix PRs into <code>dev</code>.

This defers the **full-suite run**, not the development of E2E coverage. When a change affects a cross-layer user workflow or an existing E2E scenario, add or update its scenario, fixture, assertions and cleanup alongside the subsystem change in the same topic PR. The routine PR gate remains fast; the mandatory full-suite run and system-level integration debugging happen on promotion. A small engineering task must not be forced to repair or rerun the entire aggregate suite. The remaining runtime and security follow-ups for the Scene Editor, Box2D, Asset Pack and project-file containment are tracked in [the roadmap](docs/roadmap.md). FX generated-game parity is verified on the CODQA-19 fixture; independent visual/reference review remains open.

## Branches, Pull Requests and Mandatory Development Rules

The branch flow is part of the project workflow, not a convention to bypass when a change is inconvenient. Treat these rules as mandatory for contributors and agents working in the repository.

For the required Linear issue-state lifecycle (`Todo`, `In Progress`, `In Review`, `Done`), follow [Engineering and Linear Workflow Rules](docs/engineering-workflow.md). COD statuses describe Engineering delivery: `In Review` means code review/required CI checks are pending; `Done` means implementation criteria, scoped automated tests and CI Fast passed, and the reviewed PR is merged into `dev`. Functional/manual/browser/runtime acceptance belongs to separate top-level CODQA issues and is not a prerequisite for closing or advancing Engineering work.
### Linear teams and issue ownership

Linear work is split by responsibility across two teams in the shared **Codogma Engine** project:

| Team | Issue identifiers | Owns |
|---|---|---|
| **Codogma-engine (COD)** | **COD-N** | Engineering delivery: implementation, fixes, architecture, automated tests and CI/tooling. |
| **Codogma QA (CODQA)** | **CODQA-N** | Functional acceptance of editor/game workflows and release-candidate acceptance. |

Create Engineering issues in COD and QA/acceptance issues in CODQA. **Never create CODQA issues as children/sub-issues of Engineering issues.** Keep each QA task as a top-level issue on QA Kanban and link it to relevant COD implementation scope only with the neutral `relatedTo` relation; do not use `blocks`/`blockedBy` across the teams. A defect discovered during QA becomes a separate Engineering/Bug issue in COD; do not move implementation work into the QA team.

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
- The full automated E2E gate passes on the promotion candidate. **Formal manual/browser/runtime acceptance is not a prerequisite to opening this PR or to continuing Engineering work.** After the `dev → test` PR is merged, CODQA executes applicable functional acceptance against the integrated `test` SHA and records evidence on QA Kanban. The default MCP integration suite is not a substitute for UI acceptance testing.
- Relevant tests, setup notes and user/developer documentation are updated.
- The PR description states the candidate scope, acceptance evidence, and any known limitations.

Before opening **`test → main`**, confirm the candidate has been accepted on `test`, required checks pass, no known release-blocking issue remains, and the release notes/documentation accurately describe the shipped behaviour. Do not merge a release candidate just because the branch has accumulated changes or because a release is desired.

If a promotion gate fails, stop the promotion. Fix the issue in the appropriate topic branch, merge the fix to `dev`, and create a fresh promotion PR when the candidate is ready. Do not use a partial `dev → test` PR as a way to deploy incomplete work.

### Local checks before a PR

For implementation changes, run commands from the repository root. Root, editor, localization and standalone MCP package dependencies are installed separately (there are no npm Workspaces yet). A Markdown-only PR does not require dependency installation or a game/editor build: CI runs the changed-document checks directly.

~~~bash
npm ci
npm --prefix src/editor ci
npm --prefix packages/localization ci
cd packages/editor-mcp-server
npm ci
cd ../..
npm run build
npm run test:security
npm run test:mcp-package
~~~

Run `npm audit --audit-level=low` in the affected package scope when its `package.json`, `package-lock.json` or applicable `.npmrc` changes. CI Fast applies the same scope selection; manual workflow dispatch runs every configured audit.

Для запуска SolidJS Editor Host (`src/editor/`) выполните из корня репозитория:

```bash
npm ci --prefix src/editor
npm run dev:editor-host
```

`npm ci` обновляет локальную ссылку `file:../../packages/cge`. Команда `dev:editor-host`
сначала собирает Core, затем одновременно запускает Node backend и Vite Host.
Откройте `http://127.0.0.1:5173/` (порт берётся из `VITE_PORT`); backend API
обслуживается на порту `PORT` из корневого `.env` (по умолчанию `3000`).
Нажатие Ctrl+C останавливает оба процесса. Отдельно устанавливать зависимости
`packages/cge` для обычной разработки Host не требуется.

Then run checks relevant to the change. The full automated E2E suites are not part of a topic PR into <code>dev</code>; they start at the promotion PR <code>dev → test</code>:

| Change type | Required local acceptance |
|---|---|
| Documentation-only (`*.md`, `*.mdx`, `*.rst`) | No npm install/build is required. CI checks changed Markdown line endings, fenced blocks and newly added relative links. Run `git diff --check` locally when reviewing the patch. |
| Code/build changes | Run `npm run build` before requesting merge; CI runs it as well |
| Dependencies | Run `npm audit --audit-level=low` in every affected package scope. CI audits scopes whose manifest/lockfile changed, or all scopes when `.npmrc` changes; manual dispatch runs all audits. |
| Server, bridge or MCP tools | Run `npm run test:security` and the isolated MCP package contract tests. The full MCP E2E suite runs only in promotion CI from `dev → test`. |
| Editor UI, scene authoring, generated code or play mode | Run the relevant scoped typecheck/build/unit/domain/contract regression checks and update browser-test sources/fixtures when the workflow changes. Do not require formal manual/browser/runtime acceptance on each topic PR; CODQA performs it against an integrated `test` candidate. |
| Localization package, locale tables, fallback or project diagnostics | Run `npm run test:localization`, `npm run test:localization:project` and `npm run test:localization:acceptance`; verify project diagnostics on representative locale tables |
| Release candidate (`dev → test`) | Require the complete automated promotion E2E gate (MCP + Host browser suite). After merge to `test`, run the applicable CODQA browser/runtime/manual checks on the exact integrated SHA. |
| Release candidate (`test → main`) | Require the complete promotion E2E gate and completed Release acceptance/evidence for the candidate SHA. |

The optional UI-specific MCP checks can be enabled with `MCP_E2E_WITH_EDITOR=1` (PowerShell: `$env:MCP_E2E_WITH_EDITOR = "1"` before running `npm run test:e2e`). They require the editor UI to be running and connected. The default CI E2E job does **not** enable that mode.

### Line endings and generated files

The repository uses `.gitattributes` to keep ordinary source, configuration, documentation and SVG files on LF line endings across operating systems. Do not use a repository-wide `git add --renormalize .` as a routine cleanup: a line-ending migration must be reviewed and committed separately.

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

`fast-checks` validates branch routing, build/typecheck, unit/contract regression and security checks, server smoke tests, localization package tests and project diagnostics. It may run on ordinary topic PRs into `dev`, but it never installs Chromium or executes Playwright/MCP E2E. The required `mcp-integration` job runs only on promotion PRs: first `dev → test`, then `test → main` (and the documented emergency hotfix route). It executes both the SolidJS Host browser E2E suite and `npm run test:e2e`; the required status name stays `mcp-integration` so existing branch rules remain valid.

The active Rulesets require PRs and successful checks, but **currently do not require reviewer approval**. That is a repository setting, not permission to bypass the PR, test, documentation or promotion rules in this section.

## Troubleshooting

### The editor page does not open

- Confirm the server process is running and read its terminal output.
- Open the configured URL, normally <code>http://localhost:3000/editor/</code>.
- Check whether another process is using <code>PORT</code>; choose another free port if necessary.

### The editor reports missing files or shows the wrong project

Check <code>PROJECT_DIR</code>. If it is unset, the server uses the native Project Model v1 fixture at <code>packages/cge/tests/fixtures/acceptance-project</code>. Use an absolute path to select your game project.

### Changes to editor TypeScript are not visible

Run <code>npm run build</code> from the repository root or <code>npm run dev:editor-host</code> while developing. Confirm the server is serving the expected <code>EDITOR_HOST_DIR</code>.

### MCP tools cannot connect

- Start the Codogma Engine HTTP server before starting an MCP client.
- Confirm that <code>CODOGMA_MCP_URL</code> points to the exact loopback endpoint <code>http://127.0.0.1:3000/editor/mcp</code> (adjust the port when the engine HTTP server uses a non-default port).
- For Scene/Node/Prefab/Component/FX operations and screenshots, open the project in the Editor Host and wait for its SSE MCP bridge connection.

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
- [Optional Data-Oriented ECS and runtime performance ADR (RU)](docs/decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md)
- [CI Fast workflow](.github/workflows/ci.yml)
- [MCP E2E workflow](.github/workflows/e2e.yml)
- [Release workflow](.github/workflows/release.yml)

When changing architecture, project formats, compiler output, runtime integration or public editor/server APIs, update the relevant documentation and tests in the same PR. Prefer documenting stable contracts and verified behaviour; track broad engine goals and unfinished subsystems in the project's development plan rather than claiming them as implemented here.

## Origins and licensing

Third-party source material and assets in the repository retain their applicable copyright and license notices. Preserve these notices in [LICENSE](LICENSE) and in the corresponding package/file metadata until the related material is removed. Attribution requirements do not define Codogma's product architecture or runtime dependencies.

Codogma Engine uses Phaser 4.2.1 as its current game framework/runtime integration. Phaser and other third-party components remain subject to their own licenses and terms; review those terms when distributing the engine or a game built with it.


## MCP native contract

The engine-owned get-system-instructions response and MCP package tests describe the supported Project Model v1 Scene/Node/Prefab/Component/FX workflows. The registry exposes native document operations through the single connected Editor Host and external asset inspection through project services. Phaser Asset Pack, animation JSON, Tiled tilemap and Spine skeleton/atlas metadata remain separate asset workflows; a Spine skin screenshot is not exposed until the Editor Host has a renderer/handler.
