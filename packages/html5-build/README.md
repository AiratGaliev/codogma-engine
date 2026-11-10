# @codogma/html5-build

Versioned HTML5 build-profile and artifact-evidence contracts for Codogma Engine.

## Responsibilities in v1

- Define independent Development and Release HTML5 profile defaults and validate project-relative output paths.
- Pin the initial ES2022 browser syntax/module baseline used by the HTML5 target.
- Build deterministic manifests from files the bundler actually emitted: normalized paths, SHA-256, gzip and Brotli sizes, source-module identities and exact Core Build Analysis node IDs.
- Compare clean builds and report added, removed or changed files and module composition.
- Convert a real Release manifest to the existing @codogma/cge ProjectBuildOutputManifest contract.

The package does not run a bundler, resolve/install npm dependencies, discover TypeScript imports, generate a Phaser adapter, render a Scene or implement the SolidJS Build Profiles UI. Those are separate host/runtime responsibilities. The Vite fixture lives in the Editor Host test workspace because Vite 8.3.5 is already pinned there; the generated artifact itself does not use the Editor server or Tauri.

## Browser baseline

html5-es2022-tla-v1 records the initial ES2022 module baseline: Chrome 89+, Edge 89+, Firefox 89+, Safari 27+, iOS Safari 27+ and Chrome for Android 89+. Safari 27 is required for full top-level-await module-loader compliance; Safari 15–26.6 has partial support for concurrent imports of top-level-await modules. This matrix is a syntax/module baseline only. It does not guarantee WebGL, Web Audio, storage, input, SDK or device capability; those require feature detection and separate acceptance.

## Artifact evidence

The manifest is built from emitted bytes. It contains no timestamp, temporary output directory or absolute machine path. File paths and identity lists are sorted. Gzip size is measured from emitted bytes with the Compression Streams API. The Node build host supplies Brotli sizes from the emitted bytes using the Node standard library. The manifest sidecar is not included in its own file list.

Only a Release manifest is accepted as production evidence by Core Build Analysis. Development manifests are useful for clean-build comparison but are not reported as production output.

Run npm run test:html5-build from the repository root.
