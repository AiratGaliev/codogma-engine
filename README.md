# Codogma Engine

**Codogma Engine is an independent, actively evolving project for building 2D HTML5 games.** The goal is to grow it into a coherent engine with its own architecture, runtime workflow, visual editor, project model and developer tools.

The current implementation provides a browser-based authoring environment, a local Node.js server, Phaser 4.2.1 integration, scene/code-generation tools and MCP-based automation. Some parts are established editor functionality; the broader engine architecture is still evolving. This README describes verified behaviour and known limits without treating planned capabilities as already implemented.

- **Product:** Codogma Engine
- **Current product version:** 1.0 (see <code>source/editor/product.json</code>)
- **Current game framework/runtime integration:** Phaser 4.2.1
- **License:** MIT — see [LICENSE](LICENSE)
- **Build notes:** [BUILD.md](BUILD.md)

## Project direction

Codogma is being developed as its own engine, not as a feature-parity project for another editor. The existing codebase is a starting point that lets development continue while the engine's architecture and workflows are shaped around Codogma's needs.

Development priorities:

- Keep the editor, project files, runtime integration and tools working as one development workflow.
- Evolve engine-specific APIs and architecture deliberately, rather than adding features solely to match another product.
- Preserve working functionality while improving maintainability, tests and developer documentation.
- Clearly distinguish implemented behaviour, known limitations and future work.

This direction does **not** mean every planned engine subsystem already exists. Check the implementation and tests before relying on a capability or describing it as complete.

## Current capabilities

| Area | Available today |
|---|---|
| Browser-based IDE | A local Node.js server serves the editor at <code>/editor/</code> and connects it to a project directory. |
| Scene authoring | Visual scene editing, inspectors, serialization and generated game code. |
| Project assets | Asset Pack Editor and asset tools for textures, spritesheets, tilemaps and other supported asset types. |
| Animation and components | Animation tools, User Components Editor and code editors. |
| Phaser integration | Bundled Phaser 4.2.1 runtime files and TypeScript definitions, plus code-generation and API adaptations. |
| Scene effects and objects | Phaser 4 filters, supported game-object types and corresponding editor/compiler integration. |
| Editable tilemaps | Tilemap authoring tools, layers, tilesets, painting operations and MCP tools for modifying tilemap data. |
| Physics authoring | Arcade Physics-related scene tooling and Box2D body/world authoring and code generation. Box2D runtime setup may be needed in the game project separately. |
| MCP integration | Official <code>@phaserjs/editor-mcp-server</code> package connected through the local MCP bridge, plus built-in fallback entry points. |
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

Open **http://localhost:3000/editor/**.

The server should respond at that address, and product metadata should be available at [http://localhost:3000/editor/product.json](http://localhost:3000/editor/product.json).

**Security boundary:** the editor server and MCP bridge bind to IPv4 loopback (`127.0.0.1`) and are intended for local development, not direct public-network exposure. Browser requests with a mismatched `Origin` or `Host` are rejected. File operations also reject paths that escape the chosen project through symbolic links, and request bodies have explicit size limits. These checks are defense-in-depth, not a substitute for keeping your machine and project files trusted.

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
| <code>MCP_BRIDGE_PORT</code> | <code>1902</code> | Port used for the MCP bridge. |
| <code>MCP_BRIDGE_HOST</code> | <code>127.0.0.1</code> | Host passed to the official MCP server launcher. |
| <code>AI_CHAT_SERVICE</code> | <code>http://127.0.0.1:3031</code> | URL of the optional AI Chat backend. |

Use a project directory you control. Avoid pointing the development server at a directory containing private files that should not be accessible to the editor or its tools.

## Repository layout

| Path | Responsibility |
|---|---|
| <code>server/server.mjs</code> | Local HTTP server, editor/project APIs, file operations, play-mode serving, AI Chat endpoint and MCP bridge. |
| <code>server/mcp-launcher.mjs</code> | Starts the official MCP package when installed; otherwise falls back to the built-in stdio implementation. |
| <code>server/mcp-stdio.mjs</code> | Built-in stdio MCP entry point. |
| <code>tests/security-smoke-test.mjs</code> | Verifies local-only HTTP access, symlink containment and official MCP package compatibility. |
| <code>source/editor/</code> | Browser-based editor client, TypeScript sources, plugins, assets, product metadata and client build configuration. |
| <code>mini-services/ai-chat/</code> | Optional standalone AI Chat backend. |
| <code>tests/mcp-e2e-test.mjs</code> | MCP integration test driver used by the local test command and CI. |
| <code>tests/workspace/test-typescript/</code> | Default fixture project for development and CI. |
| <code>.github/workflows/ci.yml</code> | Fast pull-request checks and branch-route validation. |
| <code>.github/workflows/e2e.yml</code> | MCP integration checks for promotion to <code>test</code> and <code>main</code>. |
| <code>.github/workflows/release.yml</code> | Build, smoke-test and ZIP artifact workflow for <code>main</code>. |
| <code>BUILD.md</code> | Additional build notes. |
| <code>.github/pull_request_template.md</code> | Pull Request description and acceptance checklist. |

## Daily development commands

Run these commands from the repository root unless noted otherwise.

| Command | Purpose |
|---|---|
| <code>npm start</code> | Start the local editor server. |
| <code>npm run dev</code> | Start the server and pipe its output to <code>dev.log</code> (requires a shell with <code>tee</code>). |
| <code>npm run build</code> | Build/type-check the editor client through TypeScript project references. |
| <code>npm run watch</code> | Run the editor TypeScript compiler in watch mode. Start the server separately if you need to use the editor. |
| <code>npm run mcp</code> | Start the MCP launcher for a connected MCP client. The editor server must be running. |
| <code>npm run mcp:builtin</code> | Start the built-in stdio MCP implementation. |
| <code>npm run test:e2e</code> | Run the MCP integration test driver. Start the editor server first. |

For a typical local code change:

1. Start the server and open the editor.
2. Make the change in the relevant client or server subsystem.
3. Run <code>npm run build</code> from the repository root when changing editor TypeScript or compiler code.
4. For MCP work, start the server in one terminal and run <code>npm run test:e2e</code> in a second terminal.
5. Verify the relevant functionality in the browser if the change affects the UI, generated code or runtime behaviour. Server-side MCP tests are not a replacement for visual acceptance testing.

### MCP integration tests

The standard test command checks MCP initialization and required tool registration, queries scenes, creates a temporary scene, adds objects, exercises prefab/asset tools and verifies that a texture size can be read. It removes the generated test scene during cleanup.

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

1. **Editor client** — the TypeScript application under <code>source/editor/</code>. It owns the visual authoring experience and editor-side functionality.
2. **Local server** — <code>server/server.mjs</code> serves the client and project files, exposes the editor's HTTP APIs, performs project-file operations and hosts the MCP bridge.
3. **Game project/runtime** — the editable project is selected by <code>PROJECT_DIR</code>. The editor integrates with Phaser 4.2.1 and generates game code; the game project's runtime dependencies still need to be appropriate for the code it uses.

The server also integrates with the optional AI Chat backend. That backend is a separate service and can be run independently.

### HTTP endpoints

The local server exposes editor routes including:

- <code>/editor/</code> — editor UI;
- <code>/editor/product.json</code> — product metadata used by the editor;
- <code>POST /editor/api</code> — editor project/file API;
- <code>/editor/project/...</code> — project file access used by editor components;
- <code>/editor/external/...</code> — project files for play mode;
- <code>/editor/upload</code> — uploads;
- <code>/editor/mcp</code> — built-in Streamable HTTP MCP endpoint.

The server also listens on the MCP bridge port (default <code>1902</code>) for the contract used by the official MCP package. Keep the HTTP port and MCP bridge port distinct.

## MCP and AI tooling

Codogma can expose editor tools over MCP. The default launcher uses the official <code>@phaserjs/editor-mcp-server</code> npm dependency and connects it to the running server through the local bridge. Built-in MCP implementations are available as fallback entry points.

Start the editor server first. Then configure your MCP host to launch <code>server/mcp-launcher.mjs</code> from this checkout. Use an absolute path in client configuration and make sure the root dependencies have been installed.

Example configuration shape:

~~~json
{
  "mcpServers": {
    "codogma-engine": {
      "command": "node",
      "args": ["/absolute/path/to/codogma-engine/server/mcp-launcher.mjs"],
      "env": {
        "phaser-editor-mcp-port": "1902",
        "phaser-editor-mcp-hostname": "127.0.0.1"
      }
    }
  }
}
~~~

Tools that manipulate project files can work through the server bridge. Tools that need the active scene, live editor state or screenshots require the editor page to be open and the editor-side bridge connected.

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
| **CI Fast** — <code>fast-checks</code> | PR targeting <code>dev</code>, <code>test</code> or <code>main</code>; manual dispatch | Installs locked root/editor dependencies, validates PR routing, builds the editor client and smoke-tests the server and editor response. |
| **E2E** — <code>mcp-integration</code> | PR targeting <code>test</code> or <code>main</code>; manual dispatch | Starts the server and MCP bridge, then runs the MCP integration test driver. |
| **Release Codogma Engine** — <code>release-archive</code> | Push to <code>main</code>; manual dispatch | Builds the client, smoke-tests the server and uploads a ZIP artifact named <code>codogma-engine-release</code>. |

The release workflow uploads a GitHub Actions artifact; it does not automatically publish a GitHub Release. The archive contains the server, editor client and selected root metadata/documentation. Check <code>.github/workflows/release.yml</code> before assuming an optional service or development fixture is included in the package.

### Required status checks

Branch Rulesets require these exact status names:

| Target branch | Required checks |
|---|---|
| <code>dev</code> | <code>fast-checks</code> |
| <code>test</code> | <code>fast-checks</code>, <code>mcp-integration</code> |
| <code>main</code> | <code>fast-checks</code>, <code>mcp-integration</code> |

A successful server-side MCP test does not guarantee that every UI workflow, generated game or browser-rendering path works. Run and document additional acceptance checks when the change affects those areas.

## Branches, Pull Requests and Mandatory Development Rules

The branch flow is part of the project workflow, not a convention to bypass when a change is inconvenient. Treat these rules as mandatory for contributors and agents working in the repository.

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

Run commands from the repository root. Root and editor dependencies are installed separately:

~~~bash
npm ci
npm audit --audit-level=low
cd source/editor
npm ci
npm audit --audit-level=low
cd ../..
npm run build
npm run test:security
~~~

Then run checks relevant to the change:

| Change type | Required local acceptance |
|---|---|
| Any change | Run `npm run build` before requesting merge; CI runs it as well |
| Dependencies | Run `npm audit --audit-level=low` from the root and `source/editor`; CI blocks any reported vulnerability |
| Server, bridge or MCP tools | Run `npm run test:security`; start the server with `npm start`; in a second terminal run `npm run test:e2e` |
| Editor UI, scene authoring, generated code or play mode | Open `http://localhost:3000/editor/` and manually exercise the affected workflow; check browser console and server output |
| Release candidate (`dev → test` or `test → main`) | Check the complete candidate in addition to the required CI integration test; document manual acceptance for any affected UI path |

The optional UI-specific MCP checks can be enabled with `MCP_E2E_WITH_EDITOR=1` (PowerShell: `$env:MCP_E2E_WITH_EDITOR = "1"` before running `npm run test:e2e`). They require the editor UI to be running and connected. The default CI E2E job does **not** enable that mode.

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

`fast-checks` validates the branch route, installs locked dependencies, builds the editor client and smoke-tests the server/editor response. `mcp-integration` runs on PRs targeting `test` and `main`; it starts the server and MCP bridge and runs `npm run test:e2e`. Normal PRs into `dev` do not run this slower integration suite as a routine CI gate, so run it locally whenever the change touches MCP/server behaviour and run targeted browser acceptance for UI changes.

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

- Start the editor server before starting an MCP client.
- Confirm that the server's MCP bridge port and the client's <code>phaser-editor-mcp-port</code> agree (default <code>1902</code>).
- Check whether the bridge port is already occupied.
- For tools that require UI state, open the editor page and wait for the editor-side connection.

### MCP E2E fails

Start the server first, then run <code>npm run test:e2e</code>. Inspect the first MCP error in the terminal output and verify that root dependencies are installed. The standard test uses the fixture project unless <code>PROJECT_DIR</code> is overridden.

## Documentation and contribution notes

- [Build guide](BUILD.md)
- [Editor documentation](https://docs.codogma.com)
- [CI Fast workflow](.github/workflows/ci.yml)
- [MCP E2E workflow](.github/workflows/e2e.yml)
- [Release workflow](.github/workflows/release.yml)

When changing architecture, project formats, compiler output, runtime integration or public editor/server APIs, update the relevant documentation and tests in the same PR. Prefer documenting stable contracts and verified behaviour; track broad engine goals and unfinished subsystems in the project's development plan rather than claiming them as implemented here.

## Origins and licensing

The current editor client includes code derived from the open-source Phaser Editor 2D v3 client. Its origin is relevant to attribution and license compliance, but it does not define Codogma's product direction. Preserve the copyright and license notices in [LICENSE](LICENSE).

Codogma Engine uses Phaser 4.2.1 as its current game framework/runtime integration. Phaser and other third-party components remain subject to their own licenses and terms; review those terms when distributing the engine or a game built with it.
