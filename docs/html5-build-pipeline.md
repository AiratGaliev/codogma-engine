# HTML5 build pipeline — COD-35

## Scope and ownership

The game build is a separate engine workflow. It must not start, import or depend on the Editor Server, Editor UI, Tauri or Editor runtime state. This work adds versioned profile/artifact contracts and a clean Vite fixture; it does not claim that a complete playable Phaser game builder is finished.

- @codogma/cge owns native Project Model validation, dependency graph and the output-manifest contract.
- @codogma/feature-registry owns feature/provider selection and logical dependency closure. Logical exclusion is not proof that bytes were removed.
- @codogma/html5-build owns HTML5 profile defaults/validation, deterministic artifact manifests and clean-build comparison.
- The bundler host discovers TypeScript/package imports, supplies exact output-to-graph identity mapping and runs the selected bundler.
- COD-28 owns the Phaser runtime adapter. It remains a prerequisite for a browser fixture that renders a Project Model Scene through Phaser.
- COD-95 owns the SolidJS Build Profiles workflow and UI. It consumes the typed profile/build report contracts; it does not implement bundling.

## Profiles and browser target

Both profiles are project build configurations, not Editor Preferences or workspace layout.

| Profile | Minification | Source maps | Output directory |
|---|---:|---:|---|
| HTML5 Development | Off | On | build/html5/development |
| HTML5 Release | On | Off | build/html5/release |

Both target ECMAScript 2022. The html5-es2022-tla-v1 matrix records the initial module syntax/browser baseline:

| Browser | Minimum |
|---|---:|
| Chrome | 89 |
| Edge | 89 |
| Firefox | 89 |
| Safari / iOS Safari | 27.0 |
| Chrome for Android | 89 |

Safari 27 is required for full top-level-await module-loader compliance; Safari 15–26.6 has a partial implementation for concurrent imports of modules containing top-level await. This matrix is a syntax/module baseline only; it does not guarantee WebGL, Web Audio, storage, input, SDK or device capability. Those require feature detection and separate acceptance.

## Artifact manifest

The manifest is built from files the bundler actually emitted. It records, per file:
- normalized project-relative POSIX path;
- raw byte count, SHA-256, gzip and Brotli byte counts;
- normalized source-module identities from bundler output metadata;
- exact Core Build Analysis graph node IDs represented by that output file.

The manifest contains no timestamp, temporary output directory or absolute machine path. File paths and identity lists are sorted. The manifest sidecar is not included in its own file list. Gzip is measured in the host-neutral manifest package; the Node build host supplies Brotli sizes using the Node standard library.

A Release manifest converts to ProjectBuildOutputManifest and is passed to analyzeProjectBuild. Core rejects unknown graph identities, output nodes not selected for the target and non-runtime package nodes. Development manifests can be compared but are not reported as production output.

## Bundler candidate and Phaser distribution research

The repository pins Vite 8.3.5 in the Editor Host workspace; its lockfile resolves Rolldown 1.2.16. Vite is the initial bundler candidate for the isolated fixture because it is already present, supports programmatic builds and exposes generated chunk module IDs through the output hook. Use build.rolldownOptions; Vite 8.3.5 documents build.rollupOptions as a deprecated alias. Vite's built-in manifest maps source entry names to hashed output files, but does not itself provide the module-to-Core-node proof required by COD-35. The fixture captures OutputChunk.modules separately.

Pinned Phaser 4.2.1 source confirms three relevant candidates:
1. Full minified UMD: dist/phaser.min.js.
2. Arcade-only minified UMD: dist/phaser-arcade-physics.min.js, built from src/phaser-arcade-physics.js and explicitly excluding Matter.js.
3. Full ESM distribution: dist/phaser.esm.min.js.

The upstream Phaser 4.2.1 README reports approximately 1.29 MB raw / 345 KB gzip for full minified Phaser and 1.18 MB raw / 313 KB gzip for Arcade-only. The package exports map exposes only "." and "./package.json"; there is no public phaser/arcade export. Do not invent a subpath import. An ESM distribution is not evidence of tree shaking by itself.

These upstream size figures are reference measurements, not measurements from a Codogma game artifact. The active repository does not yet contain the @codogma/runtime-phaser adapter or an active standalone game bundle that consumes Phaser. API coverage, exact Codogma raw/gzip/Brotli size, parse/startup/first-frame cost and Phaser browser smoke therefore remain unmeasured. Do not select an artifact solely by upstream size.

## Current automated fixture

The Editor Host test workspace builds src/editor/tests/fixtures/html5-game twice for Development and twice for Release using Vite 8.3.5. This fixture imports the actual Project Model v1 acceptance project, FollowTarget.ts, the Core Scene Loader and the registered SVG asset. The Node test independently loads and activates the Scene through ProjectSceneLoader, validates the Component instances and disposes the session. The Release output is converted into the Core output manifest and analyzed.

The test checks clean-build byte/module-graph reproducibility, the stable Feature Registry report, presence of the Core package, user Component module and asset, and absence of Editor Host / optional ECS package nodes. Negative manifests deliberately inject the Editor Host package node and the unselected ECS package node and assert that Core rejects the output.

CI uploads the first Release fixture output and JSON reproducibility/Core-analysis evidence as the html5-build-evidence workflow artifact. This proves reproducibility and graph composition for the fixture only. The fixture does not create Phaser display objects, execute a Phaser frame loop or replace COD-28; independent browser/runtime acceptance remains a later integrated-candidate QA gate.
