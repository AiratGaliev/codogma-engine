# Core v1: native Scene-to-Build acceptance slice

**Purpose:** define one reproducible, native Codogma scenario from project creation through runtime Preview and independent HTML5 Build. This document is the engineering acceptance contract; formal browser/device QA is tracked separately.

## 1. Canonical scenario

1. Create a native Project v1.
2. Create a SceneDocument with multiple Nodes, Transforms and typed Asset References.
3. Register a TypeScript Script module through the explicit Project manifest.
4. Add two Component instances from the same Definition with independent persisted properties.
5. Edit values through the schema-driven Inspector; verify validation and Undo/Redo.
6. Save, close and reopen the Project; verify stable IDs, hierarchy/order, properties, manifest and references.
7. Load the SceneDocument through the Core Scene Loader and Phaser runtime adapter.
8. Start Preview from a Project snapshot; select a runtime entity and inspect live state without changing persisted source data.
9. Build a standalone HTML5 game without starting the Editor UI or backend.

## 2. Native persisted contract

Optional Data-Oriented ECS is outside the scope of this acceptance slice; its normative contract is defined in [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md).

The fixture and tests cover:

- Project/Scene/Node/Transform/Component/Prefab/Asset/Script schemas and version fields.
- Stable document, Node, Component definition, Component instance, module and Asset identities.
- Typed Asset/Node/Prefab references and invalid/missing reference diagnostics.
- Explicit Script/module manifest registration and deterministic resolution.
- Schema-driven property types, defaults, required/optional fields and constraints, including typed Asset/Node pickers backed by Project/Scene resolver contexts.
- Stable Asset/Node IDs and permitted Asset sub-resource IDs survive Scene/Prefab round-trip; stale/missing/incompatible references remain diagnosable and are never silently reassigned.
- JSON-safe serialization, deterministic round-trip and strict validation of typed envelope fields; unknown JSON-compatible Component properties are preserved as extension data with warning, while non-JSON values and declared-schema violations block mutation/save.
- Rejection of unknown future schema versions without downgrade or mutation.
- Scene as a data document; no companion TypeScript Scene class/file is required.

## 3. Core acceptance

- [x] Parse and validate Project/Scene/Prefab documents using native fixtures (`project-model`, `acceptance-slice` and `scene-loader` tests).
- [x] Serialize/deserialize with deterministic output and stable identities (`project-model`, `acceptance-slice` and `component-schema` tests).
- [x] Validate IDs, asset paths, module declarations and typed references (`project-model`, `acceptance-slice` and `scene-loader` tests).
- [x] Apply the same Component Schema validator during registration, Inspector edits, Undo/Redo, pre-save and serialization (Core schema tests and the integrated COD-27 Editor Host tests).
- [x] Preserve independent values for multiple instances of the same Component Definition (Core Scene Loader fixture).
- [x] Resolve Script modules through the explicit Project manifest and the matching pre-registered Component definition.
- [x] Create an inactive runtime Node/Transform/Component graph from SceneDocument data with stable source IDs and parent/child hierarchy.
- [x] Fail atomically on invalid Scene, missing module/reference or cancelled load; dispose all partial resources.
- [x] Keep Core independent of Phaser, DOM, Editor UI, Node-only APIs and platform SDKs.
- [x] Consume the packed `@codogma/cge` artifact from an independent ESM/TypeScript project; verify declarations, runtime exports and the native Scene Loader lifecycle (`tests/consumer`).
- [x] Verify that every Core source module uses only relative imports and that the package declares no runtime npm dependencies (`tests/package-boundary.test.ts`).
- [ ] TimeService, Scheduler, TweenService, InputService, typed Event Bus and Scene Manager have executable behavior tests for timing, ownership, routing, cancellation, transitions and failure cleanup.
- [ ] Host-owned runtime composition consumes one frame in a fixed Time → Scheduler → Tween → active ComponentWorld order; no Core-owned ticker or loop is created.
- [ ] Integration tests compose a real ComponentWorld, fake normalized input provider, SceneLoader and SceneManager; repeated load/stop/dispose leaves no active session or owned subscriptions.


## 4. Preview and runtime acceptance

- [ ] Phaser adapter creates actual runtime views for the loaded graph.
- [ ] Runtime identity maps to Project/Scene/Node/Component IDs.
- [ ] Start/stop/restart and scene replacement clean up objects, listeners, systems and resources.
- [ ] Runtime mutations operate on the Preview snapshot and do not silently rewrite persisted Project files.
- [ ] Live Inspector reads state through an explicit runtime message/selection contract.
- [ ] Runtime diagnostics identify the source Project entity and module.

## 5. Independent HTML5 Build

- [ ] Build starts from a validated native Project snapshot.
- [ ] Scene hierarchy and registered Script/Component modules are included in the runtime graph.
- [ ] Asset and module references are validated before output is written.
- [ ] The build runs without Editor UI, Node development server or Editor-only dependencies.
- [ ] Build artifacts are reproducible for identical Project inputs and toolchain versions.

## 6. Responsibility boundaries

| Contract/capability | Engineering owner |
|---|---|
| Project Model and serialization | [COD-25](https://linear.app/codogma-engine/issue/COD-25/opredelit-serializuemuyu-project-model-i-versioned-schema) |
| Component lifecycle and registry | [COD-26](https://linear.app/codogma-engine/issue/COD-26/realizovat-typescript-component-core-i-determinirovannyj-lifecycle) |
| Input, Time/Scheduler/Tween and Scene Manager contracts | [COD-29](https://linear.app/codogma-engine/issue/COD-29/utverdit-minimalnye-kontrakty-input-timetween-i-scene-manager) |
| Runtime service implementations and integration | [COD-106](https://linear.app/codogma-engine/issue/COD-106/realizovat-bazovie-host-neutral-engine-services-v1-v-codogmacge) |
| Component Schema and Inspector validation | [COD-27](https://linear.app/codogma-engine/issue/COD-27/svyazat-component-schemametadata-inspector-i-serializaciej) |
| Script/Component authoring | [COD-91](https://linear.app/codogma-engine/issue/COD-91/zavershit-user-components-i-typescript-script-authoring-v-solidjs) |
| Native Scene Loader | [COD-103](https://linear.app/codogma-engine/issue/COD-103/realizovat-data-driven-scene-loader-dlya-project-model-v1) |
| Phaser runtime adapter | [COD-28](https://linear.app/codogma-engine/issue/COD-28/realizovat-minimalnyj-phaser-runtime-adapter) |
| Preview lifecycle/live identity | [COD-30](https://linear.app/codogma-engine/issue/COD-30/realizovat-browser-first-game-preview-host), [COD-31](https://linear.app/codogma-engine/issue/COD-31/svyazat-runtime-identity-s-project-model-i-live-inspector) |
| Native Prefab behavior | [COD-8](https://linear.app/codogma-engine/issue/COD-8/stabilizirovat-prefab-workflow-vlozhennost-overrides-i-obnovlenie) |
| Independent production build | [COD-35](https://linear.app/codogma-engine/issue/COD-35/poluchit-vosproizvodimuyu-nezavisimuyu-html5-production-build) |

## 7. Automated evidence

Core tests use native Project/Scene/Prefab/Component fixtures authored against the current Codogma schema. The packed consumer fixture is run by `npm run test:consumer`; it validates the generated package artifact rather than importing Core source by relative path. CI Fast runs the same quality suite and the native Scene benchmark. Tests cover validation, serialization, stable identities, module resolution, references, lifecycle ordering, cancellation and cleanup.

SolidJS Host tests cover Script authoring, Component attach/detach, typed Inspector controls, invalid draft preservation, Asset/Node picker filtering, Undo/Redo and save/reopen. Browser tests use disposable native Project fixtures and record the exact build/commit SHA. The COD-27 browser scenario is defined separately from the normal feature-branch CI path; independent browser/runtime acceptance remains owned by CODQA-21.

## 8. UX and implementation references

Unity 6.6 is the primary 2D UX reference; Cocos Creator 4.0 LTS is the additional 2D workflow cross-check. Godot source may be used as an implementation reference. Codogma acceptance is based on the actual native workflow and runtime behavior, not visual resemblance alone.

## 9. Formal browser/runtime QA

Formal QA runs on an integrated `test` promotion candidate and records exact SHA, fixture revision, OS/browser/device, viewport/DPR, expected/actual behavior, diagnostics and evidence. Related QA tasks:

- [CODQA-1 — native Box2D Scene/Prefab](https://linear.app/codogma-engine/issue/CODQA-1/provesti-browser-runtime-acceptance-native-box2d-scene-i-prefab-workflow)
- [CODQA-9 — native Script Build/Asset Preview](https://linear.app/codogma-engine/issue/CODQA-9/provesti-browser-acceptance-native-script-build-i-asset-preview-workflows)
- [CODQA-10 — native Asset Library/Sprite](https://linear.app/codogma-engine/issue/CODQA-10/provesti-funkcionalnuyu-priyomku-sprite-editor-i-asset-authoring)
- [CODQA-11 — native Prefab](https://linear.app/codogma-engine/issue/CODQA-11/provesti-funkcionalnuyu-priyomku-prefab-workflow)
- [CODQA-21 — native Script/Component authoring](https://linear.app/codogma-engine/issue/CODQA-21/provesti-browser-acceptance-user-components-authoring-v-solidjs)
