# @codogma/cge

Host-neutral contracts and the first component-object Core slice.

## Boundaries

- project-model owns versioned project/scene/node/transform/component/prefab/asset contracts, validation and deterministic serialization.
- components owns the component schema, registry, lifecycle and explicit-tick scheduler.
- The package does not depend on Phaser, browser DOM, Editor Host UI, Node-only APIs or platform SDKs.
- The Core never creates a game loop. A runtime adapter calls ComponentWorld.update(deltaSeconds) from its controlled tick.
- `ProjectSceneLoader` prepares one inactive `ComponentWorld` per Scene. Scene Manager owns activation, replacement and active-session ownership; the runtime host owns the tick.
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

### Project Scene Loader and runtime graph

- `ProjectSceneLoader` validates and snapshots a native Project Model v1 document and the explicitly registered `ComponentRegistry` at composition time.
- The host supplies `readAssetDocument(asset, signal)`; Core asks it only for the selected Scene asset's UTF-8 JSON. File access, asset bytes, TypeScript compilation and module evaluation remain outside Core.
- Each Scene Component must be declared by `Project.componentModules`, have a matching registered `typeId`, and use the manifest's implementation `version`. Project data never controls executable imports.
- Scene parsing uses the same registered Component schemas as the rest of Core. Asset, Node and Prefab references are resolved through Project/Scene stable-ID catalogs; Component values are not silently rewritten.
- The returned `ProjectRuntimeSceneSession` is fully hydrated but inactive. Its `graph` exposes immutable source data, root/child hierarchy, stable runtime Node IDs, Component instance IDs and Asset/Prefab lookups. Transform values remain local to the parent.
- Nodes are created inactive. Component `onCreate` runs during hydration; `onEnable` runs only when the Scene Manager activates the session. The host calls `world.update(deltaSeconds)` only while `session.isActive && !session.isPaused`.
- Aborted or failed hydration disposes the partial world. Session `dispose()` is idempotent and attempts every Component cleanup even if a callback throws.
- Prefab instances resolve their Project Prefab reference but are not expanded into instantiated subtrees by this slice; nested Prefab expansion, propagation and override behavior remain owned by COD-8.

### Systems, update and disposal

- The host is the sole tick owner and calls `ComponentWorld.update(deltaSeconds)`. Delta must be finite and non-negative. Core creates no Game, Scene Manager, ticker or `requestAnimationFrame` loop.
- Component callbacks run in Node insertion / component attachment order; registered systems run afterwards in registration order. System registration/removal requested during update is queued to the operation boundary. Each system registration captures its ID and callbacks; removal disposes it once, and world disposal disposes remaining systems in reverse registration order.
- Structural mutations requested during update or lifecycle callbacks are drained FIFO at the safe boundary, with a 10,000-operation guard against an endlessly self-enqueuing callback chain.
- World disposal is idempotent, rejects reentrant mutations while disposing, attempts all component/system cleanup, aggregates failures and clears world-owned state even when a callback throws.
- The Phaser adapter owns the concrete Phaser tick binding (COD-28); live Inspector mapping (COD-31) and Preview session lifecycle (COD-30) remain separate integration responsibilities.

## Optional runtime service contracts (COD-29)

The package exports host-neutral contracts for optional runtime services:

- **Input:** normalized keyboard and pointer/touch events, explicit UI/world routing, coordinate-space conversion and focus-loss cancellation.
- **Time and scheduler:** one immutable frame snapshot from the host-owned clock, scaled/unscaled time, cancellable scheduled callbacks and owner cancellation through `AbortSignal`.
- **Tween:** numeric property interpolation, delay, easing, repeat/yoyo, pause/resume and cancellation using that same frame snapshot.
- **Scene Manager:** asynchronous orchestration through an injected `SceneLoader` and inactive `RuntimeSceneSession`; the manager does not parse Project Model data or instantiate the scene graph.

These are **contracts only**, not implemented services. Their implementations, deterministic phase integration and runtime lifecycle tests belong to [COD-106](https://linear.app/codogma-engine/issue/COD-106/realizovat-bazovie-host-neutral-engine-services-v1-v-codogmacge). [COD-103](https://linear.app/codogma-engine/issue/COD-103/realizovat-data-driven-scene-loader-dlya-project-model-v1) owns the Project Model-to-runtime Scene Loader implementation.

Services are independent optional dependencies. No new mandatory properties were added to `ComponentBehavior` or `ComponentFactoryContext`; components receive only capabilities explicitly composed by the host. The contracts use no Phaser, DOM event objects, Editor UI, Node-only APIs or platform SDKs.

All time values are seconds. The host remains the sole tick owner and passes one `RuntimeTimeFrame` to time-driven services. `AbortSignal` is the shared cancellation boundary for subscriptions, scheduled tasks, tweens and in-flight scene requests.

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


## Initial contracts

Schema versions and API signatures are intentionally small and test-backed. Project Model v1 is the first supported persisted contract. The parser rejects unpublished schema snapshots instead of reinterpreting them; schema migrations are introduced only when a prior contract has been published and requires a versioned transition.


### Native contract field policy

Project, Scene, Prefab, Asset, Node, Transform, Component-instance and Prefab-instance envelopes accept only fields declared by the current native schema. Unknown envelope fields remain blocking validation errors. Unknown JSON-compatible Component properties are retained as extension data and reported with a `COMPONENT_UNKNOWN_PROPERTY` warning; non-JSON values and values that violate a declared property schema remain blocking errors.

The native extension points are explicit JSON data bags: `Project.runtime.settings` and `Scene.settings`. Component-instance `properties` remain JSON data owned by the Component; when a registered schema is present, declared `persisted` properties are validated and normalized, while `editorOnly` and `runtime` values are omitted by serialization. Asset properties use stable Project asset IDs and may select a registered sub-resource only when the schema opts in with `allowSubResource`. Node properties use stable Node IDs and can constrain targets with `nodeKinds` and `allowSelf`. JSON boundary safety rejects accessors, custom prototypes, symbols, sparse arrays, cyclic graphs and non-JSON values. Future Project, Scene and Prefab schema versions are blocking errors.
