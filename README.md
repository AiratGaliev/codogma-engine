# Codogma Engine

**Codogma Engine** is a web-based IDE to develop HTML5 games. The games are powered by the popular [Phaser](https://phaser.io) framework (Phaser **4.2.1**).

> Codogma Engine is an open-source fork of the [Phaser Editor 2D v3](https://github.com/PhaserEditor2D/PhaserEditor2D-v3) client (MIT, by Arian Fornaris) with a full local server implementation, Phaser 4.2.1 support and the v5 feature set. The original product is not part of the Phaser project — [phaser.io](https://phaser.io).

![Codogma Engine screenshot](https://github.com/PhaserEditor2D/PhaserEditor2D-v3/raw/master/screens/preview.png "Codogma Engine preview")

* Version: **1.0** (see `source/editor/product.json`)
* License: **MIT**

### Main features

* The IDE runs in the browser. It has a small Node.js backend (`server/server.mjs`, zero npm dependencies) that can be run in the cloud or locally.

* It is lightweight and is focused on visual tools: Scene Editor, Asset Pack Editor, Animations Editor, User Components Editor, Code Mirror code editors.

* Friendly for collaborators: it is coded in TypeScript and provides an extensible plugin framework.

* It follows the Phaser standards and API. Extra plugins or runtimes are not required.

### Documentation

The editor is based on the Phaser Editor 2D v3 client, which is [fully documented](https://docs.codogma.com) — most documentation applies as-is.

### Build and run

See [BUILD.md](BUILD.md).

### Licensing

The code in this repository is under the MIT license (see [LICENSE](LICENSE)). Codogma Engine is based on the open-source Phaser Editor 2D v3 client by Arian Fornaris; the original Phaser Editor products remain (c) Arian Fornaris. Codogma Engine modifications and additions are (c) Airat Galiev.

### Branching & pull requests

Development follows the route `feat/* | fix/* | refactor/* | test/* | docs/* | chore/* | hotfix/*` → `dev` → `test` → `main`:

* work happens in topic branches (`feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`) and is merged into `dev` by PR;
* `dev` → `test` by PR (integration / acceptance);
* `test` → `main` by PR (releases); urgent fixes go through `hotfix/*` branches directly to `main`.

CI validates this routing on every PR (see `.github/workflows/ci.yml`) and rejects misplaced PRs. The PR template in `.github/pull_request_template.md` mirrors the required checks.

## What is included in this deployment

* **`server/server.mjs`** — a dependency-free Node.js implementation of the IDE server protocol
  (the official server binary is closed-source and only distributed from
  `updates.phasereditor2d.com`). It serves the editor UI at `/editor/`, the REST file API
  (`POST /editor/api`), project files (`/editor/project/…`), the play mode (`/editor/external/…`)
  and uploads (`/editor/upload`).

* **Phaser 4.2.1 runtime & types** — `source/editor/plugins/phasereditor2d.phaser` bundles the
  Phaser 4.2.1 dist (`scripts/phaser.js` / `phaser.min.js`) and the Phaser 4.2.1 TypeScript
  definitions (`src/phaser/phaser.ts`, `src/phaser/matter.ts`), so the Scene Editor previews and
  compiles games against Phaser 4.

* **Phaser 4 API adaptations** in the `phasereditor2d.scene` plugin:
  - FX controllers were migrated from `Phaser.FX.*` (v3) to `Phaser.Filters.*` (v4):
    the Glow / Shadow scene objects now create filters via
    `gameObject.enableFilters().filters.internal/external`.
  - The generated user code targets the Phaser 4 FilterList API.
  - `Phaser.Geom.Point` usages were migrated to `Phaser.Math.Vector2` (the `Point` class was
    removed in Phaser 4).
  - The docs database (`phasereditor2d.resources/_res/...`) includes the Phaser 4 `Filters.*`
    documentation entries.

* **Modernized UI themes** — refreshed dark / light palettes, cleaner buttons, tabs, menus,
  scrollbars and dialogs, and a modern system font stack.

* **MCP Server (AI agents integration) — the GENUINE official package** — reuses
  [`@phaserjs/editor-mcp-server`](https://github.com/phaserjs/editor-mcp-server)
  (the official Phaser Editor v5 MCP server, installed as an npm dependency) on top of a
  v5-compatible **MCP bridge port** implemented by the local server:

  - **Official stdio server (recommended)** — `npm run mcp` spawns the real
    `@phaserjs/editor-mcp-server` (tool schemas, descriptions and prompts come from
    upstream, so the tool set stays in sync with the official editor) and connects it
    with the running editor through `POST http://127.0.0.1:1902 {tool, args}`:
    ```json
    {
      "mcpServers": {
        "phaser-editor": {
          "command": "npx",
          "args": ["@phaserjs/editor-mcp-server"],
          "env": { "phaser-editor-mcp-port": "1902" }
        }
      }
    }
    ```
  - **Bridge port 1902** — `server/server.mjs` listens on it and implements the official
    bridge contract (`{tool, args}` in, MCP content array out) against the **full official
    tool set**: IDE tools (scenes, prefabs, prefab inheritance, nested prefabs, prefab
    user properties), scene tools (game objects, plain objects incl. `Collider`/`Tilemap`,
    render order, containers, **Phaser 4 filters** — Glow/Shadow/Blur/…, arcade physics
    enable/disable, object lists), asset tools (textures, sizes, bounding boxes,
    bitmap fonts, spritesheets, spine, tilemaps, **Google Fonts**) and
    `get-system-instructions`. Tools that need the running editor UI (open scene, active
    scene, screenshots) are forwarded to the editor page over an SSE bridge
    (`/editor/mcp-bridge/events`), exactly like the official server does with the
    desktop application. When agents modify project files, the editor re-syncs its
    file tree automatically (files-changed push).
  - **Built-in fallback servers** (zero-dependency, no npm install needed):
    `POST /editor/mcp` (Streamable HTTP JSON-RPC) and `node server/mcp-stdio.mjs` —
    same tool implementations plus project file utilities and Google Fonts tools.
  - **MCP Server Configuration dialog** in the editor toolbar (`MCP` button): shows the
    official package config, the HTTP endpoint, the bridge status and the tools list.
  - The Spine skin rendering preview is the only tool area with reduced fidelity in this build
    (this build is based on the v3 open-source client); everything else is fully functional,
    including the v5 **editable tilemap** tools (`scene-add-editable-tilemap`,
    `scene-add-tileset-to-editable-tilemap`, `scene-delete-tileset-from-editable-tilemap`,
    `scene-add-editable-tilemap-layer`, `scene-resize-editable-tilemap-layer`,
    `scene-write-editable-tilemap-layer-data`, `scene-fill-editable-tilemap-layer-data`,
    `scene-get-editable-tilemap-layer-selection-data`).

* **AI Chat (v5-style feature)** — the `AI` toolbar button opens an assistant
  that plans and executes game content creation through the same MCP tools (create scenes,
  add objects with arcade physics, take screenshots to verify, open scenes in the
  editor). The LLM backend runs in `mini-services/ai-chat` (port 3031,
  `npm run dev`), the agent loop lives in `server/server.mjs` (`POST /editor/ai-chat`).

## v5 feature parity

The editor client (version **1.0**, see `source/editor/product.json`) was extended to match the
official [Phaser Editor v5](https://docs.phaser.io/phaser-editor/) functionality (based on the
official v5.0.0 changelog and documentation):

* **All 24 Phaser 4 Filters as scene objects** (`Phaser.Filters.*` via
  `filters.internal/external`): Glow, Shadow, Barrel, Blend, Blocky, Blur, Bokeh, ColorMatrix,
  CombineColorMatrix, Displacement, GradientMap, ImageLight, Key, NormalTools, ObjectMask,
  PanoramaBlur, ParallelFilters, Pixelate, Quantize, Sampler, TextureMask, Threshold, Vignette,
  Wipe — each with Inspector sections (Internal/External list switch), Outline integration,
  serialization and compiler code generation (`addShadow(...)`, `addBlur(...)` …).
  The *Shader Effects* dialog lists them all.

* **New user property types**: `Array`, `JSON` (textarea + validation),
  `Game Object Reference`, `Spine Event`, `Spine Slot Name`.

* **New user property parameters**: *Editor Only* (kept out of the compiled output) and
  *Deprecated* (hidden in the Inspector view).

* **New commands**: *Expand All* (`E`, every viewer), *Toggle Editor Render* (`H` — hide an
  object from the scene editor rendering without affecting the game), *Set Editor Render to All*,
  *Unbox Prefab Instance* (inline a prefab instance into plain objects), *Find Duplicated
  Objects in Scene* (debug command), plus an Outline gutter icon to toggle the editor render.

* **New game objects**: `Video` (url/loop/mute/autoplay + loader support) and
  `ParticleEmitter` (texture/frame/animation, speed, angle, gravity, lifespan, scale, alpha,
  quantity, frequency, duration — full config code generation `this.add.particles(x, y, key, {...})`).

* **Rectangle Rounded** property (rounded corners), **Blend Mode** section for every
  game object (all 27 Phaser 4 blend modes).

* **Scene compiler user sections**: `/* START-USER-INTERFACES */` (declare custom TS interfaces,
  preserved between compilations) and `/* START-USER-CLASS-MODIFIERS */` (e.g. `abstract`),
  mirroring the official v5 compiler sections.

* **AI main menu** (`AI`) with *MCP Server Configuration…* (auto-configures `.mcp.json` for
  Cursor / VS Code / Claude Desktop), bridge enable toggle and the MCP message log;
  the editor connects to the MCP bridge over WebSocket (`mini-services/phaser-editor-mcp`,
  the standalone variant of the editor-side bridge).

* **Editable Tilemap subsystem** (the flagship v5 feature): create an *Editable Tilemap*
  from the Blocks view (creation wizard: label, columns, rows, tile size), add *tilesets*
  from the project's image/spritesheet assets (with Tiled global-id rebasing when tilesets
  are added/removed/edited), add *tilemap layers* (each layer is a selectable game object),
  and paint with the **Tilemap Palette** (tileset canvas with zoom/pan, rectangular brush
  selection) using the official tool set: *Stamp*, *Eraser* (Shift+click = bucket erase),
  *Bucket Fill*, *Rectangle Fill* and *Rectangular Selection* (Delete clears, Ctrl+C/Ctrl+X
  captures the region as a brush). Every stroke is one undoable operation. The layer is
  highlighted with an orange border + tile grid in the *edit tilemap* mode. The scene
  compiler embeds the map as Tiled-format JSON into the tilemap cache and generates the
  standard Phaser API code:
  ```ts
  this.cache.tilemap.add("levelMap_<id>", { format: 1, data: { /* Tiled JSON */ } });
  const levelMap = this.add.tilemap("levelMap_<id>");
  levelMap.addTilesetImage("dino");
  const mainLayer = levelMap.createLayer("mainLayer", ["dino"], 0, 0)!;
  ```
  All 8 official MCP tools mutate editable tilemaps in scene files server-side.

* **Box2D physics support**: a *Box2D Physics* scene-settings section (enable, gravity X/Y,
  allowSleep, debugDraw) and a *Box2D Body* component for the game objects (body type
  static/kinematic/dynamic, density, friction, restitution, linear/angular damping,
  gravity scale, fixedRotation, bullet, allowSleep, box/circle shape with size override),
  with an outline/body tool, serialization and compiler code generation
  (`new Phaser.Box2D.World(this, {gravity…})`, `box2dWorld.createBody({…})`,
  `box2dBody.createFixture(new Phaser.Box2D.Box(w, h), {…})`). The Phaser Box2D runtime
  ships as a separate Phaser module (it is not part of the bundled `phaser.js` dist);
  add it to your game to run the generated code. Minimal `Phaser.Box2D` ambient types
  are included so scenes compile.

* **Compressed Textures UI**: an Inspector section for image/spritesheet asset pack items
  to declare per-format variants (WEBP, AVIF, KTX2, PVR, DDS) with file browse + clear
  controls; variants round-trip through the `.assetPack` JSON (only when set) and count
  as used files for the ignore-file set. The loader keeps emitting the standard image URL
  (variants are metadata for export pipelines).

* **Start page**: a welcome dialog on project open (once per session, "Show on launch"
  preference) with quick actions (New Scene, New Asset Pack, Open File…, Settings…,
  Documentation) and the 8 most recently modified scene/pack/code files; also available
  via the *Start Page…* menu command.

* **Settings dialog**: unified categories — Appearance (theme + UI font size),
  Scene Editor (snap/grid defaults), AI & MCP (bridge host/port/enabled, shared with the
  MCP bridge preferences) and Updates (current version + *Check now*).

* **Go-To dialog** (`Ctrl+Alt+P`): fuzzy quick-open over all project files and asset
  pack entries; Enter opens the file in its editor.

* **AI chat scene-file attachments**: the AI Chat panel gains a `+` button to attach
  project files (multi-select tree dialog, max 8); attachments are sent with the message
  (`POST /editor/ai-chat {attachments: […]}`), the server reads them (path-traversal
  guarded, 24 KB per file / 96 KB total caps, binary skipped) and prepends a structured
  context block to the LLM prompt.

* **Check for Updates**: Help-cluster command comparing the product version (`1.0`) with
  the local update source — the editor server's `/editor/product.json` (5 s timeout,
  fully graceful offline).

Still not implemented from the official v5 (documented gaps): *Spine skin rendering
fidelity* in some preview cells, and the *desktop-only* features (auto-update binaries,
telemetry), which do not apply to a web deployment.

#### Run

```bash
npm run dev                                  # editor server at http://localhost:3000/editor/
cd mini-services/ai-chat && npm run dev      # optional: AI Chat backend on port 3031
```

Environment variables: `PORT` (default `3000`), `PROJECT_DIR`
(default `tests/workspace/test-typescript`), `EDITOR_DIR` (default `source/editor`),
`DEV_MODE=1` (loads the dev scripts of the plugins).

#### Build the client

```bash
cd source/editor
npm install
npm run build        # compiles all plugins with the TypeScript project references
```

### Credits

* **Phaser Editor 2D v3** (the base of this fork) — developed by
  [Arian Fornaris](https://twitter.com/boniatillo_com), MIT license:
  [github.com/PhaserEditor2D/PhaserEditor2D-v3](https://github.com/PhaserEditor2D/PhaserEditor2D-v3).
* **Phaser** — Copyright (c) Phaser Studio: [phaser.io](https://phaser.io).
* **MCP integration** — reuses the official
  [@phaserjs/editor-mcp-server](https://github.com/phaserjs/editor-mcp-server) package as-is.
