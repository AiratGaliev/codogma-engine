# @codogma/cge

Host-neutral contracts and the first component-object Core slice.

## Boundaries

- project-model owns versioned project/scene/node/transform/component/prefab/asset contracts, validation, migration and deterministic serialization.
- components owns the component schema, registry, lifecycle and explicit-tick scheduler.
- The package does not depend on Phaser, DOM/editor UI, Colibri, Node-only APIs or platform SDKs.
- The Core never creates a game loop. A runtime adapter calls ComponentWorld.update(deltaSeconds) from its controlled tick.
- A scene host owns one ComponentWorld lifetime per active scene. Replacing a scene disposes the previous world before creating the next one.
- Component modules are supplied through explicit registration. Project data stores stable type/module references; it never supplies executable import paths or source code.

## Public runtime contract

### Component definitions and registry

- `ComponentTypeDefinition` is registered explicitly by its schema `typeId`; class names, filenames and UI labels are not identities.
- `typeId` identifies a component kind, while each attachment receives its own instance ID. The registry rejects duplicate type IDs, including attempts to register another version under an already registered ID.
- `schemaVersion` versions the property contract; `version` identifies the implementation/authoring definition. Keep a type ID stable for compatible changes. Incompatible property-contract changes require a schema-version change and an explicit migration policy.
- Registration validates and deep-freezes a schema snapshot and captures the factory function. Mutating the source definition after registration does not replace the registered factory.
- `unregister(typeId)` only affects future attachments. Existing worlds retain their captured definition until their components are destroyed or the world is disposed. Re-registering a removed ID does not hot-swap existing instances.

### Node and component lifecycle

- A `ComponentWorld` owns one scene-local Node/component lifetime. Node identity and activation are read-only through `getNode()` / `listNodes()`; update activation through `setNodeActive()`. Transform values remain mutable runtime state.
- Components are created in Node insertion and attachment order. For each active/enabled instance the Core invokes `onCreate`, `onEnable`, then on the first host update `onStart` followed by `onUpdate`; disabling/removing invokes `onDisable` when active and then `onDestroy`.
- A failed `onEnable`, `onDisable`, `onStart` or `onUpdate` removes the affected instance, attempts the remaining cleanup callbacks, continues processing siblings and aggregates errors. Failed activation never advances to start/update.
- Factories and lifecycle callbacks are synchronous. Promise-like results are rejected; perform asynchronous loading in an explicit host/service phase before attaching or activating components.
- Component properties are validated, cloned at the mutation request boundary and passed to factories as a deeply frozen JSON snapshot. Component behavior owns its external resources: acquire them in `onCreate`, release subscriptions/handles in `onDestroy`. Core invokes cleanup but does not own external resource implementations.

### Systems, update and disposal

- The host is the sole tick owner and calls `ComponentWorld.update(deltaSeconds)`. Delta must be finite and non-negative. Core creates no Game, Scene Manager, ticker or `requestAnimationFrame` loop.
- Component callbacks run in Node insertion / component attachment order; registered systems run afterwards in registration order. System registration/removal requested during update is queued to the operation boundary. Each system registration captures its ID and callbacks; removal disposes it once, and world disposal disposes remaining systems in reverse registration order.
- Structural mutations requested during update or lifecycle callbacks are drained FIFO at the safe boundary, with a 10,000-operation guard against an endlessly self-enqueuing callback chain.
- World disposal is idempotent, rejects reentrant mutations while disposing, attempts all component/system cleanup, aggregates failures and clears world-owned state even when a callback throws.
- The Phaser adapter owns the concrete Phaser tick binding (COD-28); Project Model hydration, live Inspector mapping and Preview session are separate integration responsibilities (COD-103, COD-31 and COD-30).

## Commands

Run from this directory:

```sh
npm ci
npm run quality:check
```

## SolidJS Editor Host integration

The SolidJS Host consumes this package through the local npm dependency
`file:../../packages/cge`. Vite and TypeScript resolve the package entry points
from `dist/`, so the Core output must exist before starting the Host.

From the repository root, install/update the Host dependency link once after
checking out a branch that adds or changes this dependency:

```sh
npm ci --prefix src/editor
npm run dev:editor-host
```

The Host package now builds Core automatically before `dev`, `typecheck`,
and `test` commands by using its pinned TypeScript compiler. There is no need
to install a second copy of TypeScript under `packages/cge` for this workflow.
For standalone Core development and its full quality suite, continue to use the
commands above in the Boundaries section from this package directory.


## Persisted Project migrations

Project v0 migration and legacy .scene compatibility converters are explicit in-memory APIs:

- migrateProjectDocument(input) deep-copies JSON data, defaults only absent v0 optional fields and rejects malformed present fields with structured diagnostics.
- migrateSceneDocument(input, options) and migratePrefabDocument(input, options) validate v1 documents or opt in to conversion from legacy sceneType: "SCENE" | "PREFAB" envelopes.
- migrateLegacySceneDocument / migrateLegacyPrefabDocument are legacy-only entry points. They preserve source payloads, require stable existing IDs and apply Component/Prefab mappings only when the caller supplies explicit mappings.
- Their results expose LegacyMigratedSceneDocument / LegacyMigratedPrefabDocument and recursive LegacyMigratedNodeDocument types, so callers can access legacySource, legacyCollection and legacyComponents without casting. The general migrateSceneDocument / migratePrefabDocument APIs return the versioned document or the typed legacy-migrated document; sourceVersion distinguishes cge-scene-v1 / cge-prefab-v1 from legacy source versions.
- Legacy renderer, texture/asset keys, plainObjects, nested Prefab metadata and other unrepresented fields are preserved with diagnostics rather than being assigned invented v1 runtime semantics.
- A present but malformed hierarchy/Component collection (displayList, Node list or components) is a blocking migration error; the converter does not return a partial Scene tree. Missing optional collections remain empty.

These functions do not perform file I/O, execute project code, resolve arbitrary module paths or rewrite source files. A caller must inspect diagnostics and own the save/confirmation workflow. See docs/legacy-project-model-compatibility.md for the field mapping, limits and fixture evidence.

Run the standalone Core suite from this directory with:

    npm run quality:check

## Initial contracts

Schema versions and API signatures are intentionally small and test-backed. The v0-to-v1 project migration is an in-memory compatibility operation; opening a file never writes migrated data automatically.
