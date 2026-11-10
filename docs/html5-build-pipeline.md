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

Development and Release profiles pin the HTML5 target, ES2022 syntax/module baseline, output directory, minification and source-map policy. The emitted artifact manifest records normalized output paths, SHA-256, raw/gzip/Brotli byte counts, source module IDs and Core graph node identities. Repeated clean builds are compared by file path, content hashes, compressed sizes and module composition.

CI Fast runs the package contract checks and repeated Vite fixture builds, then uploads the Release artifact and evidence. The promotion workflow (dev to test) serves the emitted artifact independently and runs a Chromium smoke that verifies the native Scene has loaded through the Phaser adapter and that no Vite/Editor requests occur.

## Package composition

The fixture's Feature Registry and project feature selection are persisted JSON inputs. The package inventory is derived from the actual workspace manifests and lockfile records; emitted source-module attribution comes from Vite's actual Rollup module graph. The build analysis is not a substitute for a complete project compiler/import resolver, but it does not fabricate the runtime module graph from a fixed list of source files.

## Remaining comparison work

The current fixture establishes the real full Phaser 4.2.1 path and reports actual Codogma artifact sizes. A full-vs-Arcade-only/custom ESM comparison must be treated as a separate controlled experiment: each candidate must pass the same API-coverage, Scene/Component behavior and browser smoke before size or startup measurements are considered comparable. Do not treat upstream package-size references as Codogma artifact measurements.
