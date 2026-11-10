# HTML5 build pipeline (COD-35)

## Scope

The HTML5 build package owns versioned profile and artifact-evidence contracts. The Vite fixture builds a clean, independent HTML5 output from the native Project Model v1 acceptance fixture.

## Runtime composition

The fixture uses the same runtime contracts as Preview:

1. ProjectSceneLoader validates the persisted Project/Scene documents and resolves the registered Component module.
2. createPhaserRuntimeSceneLoader from @codogma/runtime-phaser adapts the loaded Core session to a real Phaser Scene.
3. A fixture Component view factory resolves the Scene's registered sprite asset and creates Phaser GameObjects.
4. Phaser owns the browser canvas and frame loop; Core owns Scene/Component state.

The fixture does not import the Editor Host UI, Node server, editor compiler, or Tauri. Phaser 4.2.1 is bundled as an explicit runtime dependency. The generated output is served by a minimal static HTTP server for the promotion browser smoke; no Vite dev server or Editor endpoint is involved.

## Profiles and evidence

Development and Release profiles pin the HTML5 target, ES2022 syntax/module baseline, output directory, minification and source-map policy. The active builder inventory is the workspace's Vite 8.x toolchain; the exact installed Vite version is read from node_modules and recorded in the evidence manifest. The emitted artifact manifest records normalized output paths, SHA-256, raw/gzip/Brotli byte counts, source module IDs and Core graph node identities. Repeated clean builds are compared by file path, content hashes, compressed sizes and module composition.

CI Fast runs the package contract checks and repeated Vite fixture builds, then uploads the Release artifact and evidence. The promotion workflow (dev to test) serves each emitted candidate independently and runs a Chromium smoke that verifies the native Scene has loaded through the Phaser adapter, confirms the Arcade/Matter API surface, records time-to-first-frame and ensures no Vite/Editor requests occur. The declared browser baseline is Chromium 94+, Edge 94+, Firefox 93+, Safari 27+, iOS Safari 27+ and Chrome Android 94+; Chromium, Firefox and WebKit engines are exercised at promotion; Edge is covered only by the Chromium engine, while real Safari/iOS Safari and Chrome Android devices remain outside this CI environment and require device/browser acceptance.

## Package composition

The fixture's Feature Registry and project feature selection are persisted JSON inputs. The package inventory is derived from the actual workspace manifests and lockfile records; emitted source-module attribution comes from Vite's actual Rollup module graph. The build analysis is not a substitute for a complete project compiler/import resolver, but it does not fabricate the runtime module graph from a fixed list of source files.

## Remaining comparison work

The fixture builds both full and Arcade-only UMD candidates from the same Project/Scene, Component module, Core loader and Phaser adapter. Both candidates receive identical module/asset analysis and the same bare-browser smoke; evidence records raw/gzip/Brotli totals and browser time-to-first-frame. The browser smoke additionally verifies that Arcade Physics exists in both and Matter is absent from the Arcade-only candidate. A custom tree-shaken ESM build is not selected: Phaser exposes no public Arcade-only ESM export, and an undocumented subpath is not used.
