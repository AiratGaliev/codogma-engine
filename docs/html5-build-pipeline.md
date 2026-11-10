# HTML5 build pipeline (COD-35)

## Scope and current boundary

The V1 package owns versioned HTML5 Development/Release profiles, Project Component module-resolution contracts and reproducible emitted-artifact evidence. The Vite/Rolldown build currently lives in a headless Editor Host fixture and produces a real, independently loadable HTML5 game from the native Project Model v1 acceptance project.

This is an integration/evidence slice, not yet a generic user-facing build CLI for arbitrary projects, nor the COD-95 Build Profiles UI. The existing Editor Phaser viewport is a Preview path: it discovers a project-local Phaser script and loads project assets through the Editor endpoint. It is not an independent production builder. Vite 8.3.5 with locked Rolldown 1.2.16 is the selected bundler candidate for the standalone fixture because it is already available and exposes emitted module metadata through build output hooks.

## Runtime composition and Component module contract

The generated fixture consumes the same stable Project Model contract as Preview and Scene Loader:

1. Core validates the persisted Project document and resolves only Component `typeId`s required by the selected Scene through `Project.componentModules`.
2. `resolveProjectComponentRegistry` in `@codogma/cge` checks the manifest stable `typeId`, version and registered script Asset, invokes a host-owned importer and returns a complete `ComponentRegistry` only when every required module resolves.
3. `ProjectSceneLoader` validates/hydrates the native Scene using that Registry; `createPhaserRuntimeSceneLoader` from `@codogma/runtime-phaser` adapts the Core session to a real Phaser Scene.
4. The Component view factory creates a Phaser Image from the Scene registered sprite Asset and attaches an Arcade Physics Body. The browser smoke verifies the resulting Scene, Components and body.

The Editor Host authoring path intentionally does not execute arbitrary user scripts: `component-schema-source.ts` parses only the static Component schema from TypeScript source and checks its manifest `typeId`/version. The build/runtime host uses the shared Core manifest contract with its own controlled importer. This is a common declarative identity/version contract, not a claim that Editor Preview currently executes user Component modules.

The fixture does not import the Editor Host UI, Node Editor server, Editor compiler or Tauri. It imports the pinned Phaser UMD distribution as a static asset, reads Project/Scene documents and SVG assets through the fixture build graph, and produces a game artifact that is served by a minimal static HTTP server during promotion smoke. The game itself does not request the Vite dev server or Editor endpoint.

## Profiles, toolchain and reproducibility

Development and Release profiles pin HTML5 target, ES2022 syntax/module baseline, output directory, minification and source-map policy. The toolchain reads exact Vite/Rolldown versions from the lockfile and records them in the artifact manifest. Repeated clean builds compare profile/toolchain metadata, normalized relative output paths, SHA-256, gzip/Brotli sizes, source-module identities and Core graph node identities. Development source maps are included in the all-files reproducibility comparison; they are diagnostic sidecars, not runtime Project graph inputs. Release has no source maps.

The fixture reads an explicit allowlist of relevant workspace manifests plus the pinned Phaser lockfile record. Vite actual output module graph comes from emitted `OutputChunk.modules` and import metadata; unknown runtime modules and emitted runtime files without Core graph attribution fail the fixture. Vite generated preload helpers are represented as explicit runtime graph nodes. This is a strict fixture adapter, not yet automatic discovery of every possible package or plugin in an arbitrary workspace.

CI Fast runs package checks, repeated Development/Release builds, negative Core graph cases and uploads both candidate artifacts plus JSON evidence. It also builds the native release archive and verifies `@codogma/html5-build` is included. This provides artifact evidence without requiring local build output.

## Phaser 4.2.1 candidate comparison

Both candidates use the same Project, Scene, Component script, registered assets, Core Scene Loader and Phaser adapter:

| Candidate | Vendor UMD raw | Vendor UMD gzip | Vendor UMD Brotli |
|---|---:|---:|---:|
| Full Phaser 4.2.1 | 1,375,976 B | 356,107 B | 282,694 B |
| Arcade Physics UMD | 1,266,396 B | 323,105 B | 256,037 B |

In the captured CI Release artifact, total game output (including the Component chunk, runtime chunk, HTML and SVG) was 1,442,439 B raw / 374,246 B gzip / 298,870 B Brotli for Full, and 1,332,888 B raw / 341,262 B gzip / 272,229 B Brotli for Arcade-only. The Arcade-only candidate reduced this fixture by 109,551 B raw, 32,984 B gzip and 26,641 B Brotli. These are measurements of this exact fixture/toolchain, not universal savings for every game.

Both candidates must run the same generated fixture APIs: `Game`, `Scene`, `AUTO`, SVG loading, Image creation and Arcade Body creation. The promotion Playwright smoke checks this API contract and Scene/Component readiness in Chromium, Firefox and WebKit. It also verifies Arcade is available in both variants and Matter is available only in Full. This proves the APIs actually used by this fixture; it does not claim complete equivalence of every Phaser API or compatibility with arbitrary projects. Matter-based projects must use the full distribution.

The package exports map does not expose a public Arcade-only ESM subpath. The upstream `src/phaser-arcade-physics.js` source and UMD distribution are separate candidates; an undocumented ESM import path or assumed tree shaking is not used. A custom tree-shaken ESM build remains unselected until its public API coverage and generated-game compatibility are proven.

## Browser acceptance and remaining boundaries

The declared `html5-es2022-tla-v1` baseline is Chrome 94+, Edge 94+, Firefox 93+, Safari 27+, iOS Safari 27+ and Chrome for Android 94+. Safari 27 is intentional: WebKit September 2, 2026 article and Safari 27 release notes describe the standards-compliant module-loader rewrite that fixes top-level-await execution ordering. This is a syntax/module baseline only; it does not guarantee WebGL, Web Audio, storage, input, SDK or device capabilities.

Per repository policy, Fast CI runs on this feature PR. The bare-artifact browser smoke runs only on the `dev → test` promotion PR; it serves both candidates under distinct nested base paths and verifies relative asset paths, JavaScript/SVG MIME types, same-origin requests, no Vite/Editor requests, runtime API coverage and time-to-first-frame. Edge is covered through Chromium; actual Safari/iOS Safari and Chrome Android devices still require device/browser acceptance.

The ECS and ECS-Phaser features are currently unavailable because their provider packages are not installed in this workspace. The feature report records that reason and the current artifact contains neither package. The negative Core-output cases verify that known build/editor-only packages cannot leak into Release. Full selective-pruning acceptance against installed optional ECS packages remains conditional on those packages existing as selectable providers.
