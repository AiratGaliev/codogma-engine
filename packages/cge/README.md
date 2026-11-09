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

These contracts now have executable implementations. [COD-106](https://linear.app/codogma-engine/issue/COD-106/realizovat-bazovie-host-neutral-engine-services-v1-v-codogmacge) owns the runtime services; [COD-103](https://linear.app/codogma-engine/issue/COD-103/realizovat-data-driven-scene-loader-dlya-project-model-v1) remains the owner of Project Model-to-runtime Scene hydration.

Services are independent optional capabilities. No mandatory properties were added to `ComponentBehavior` or `ComponentFactoryContext`; hosts compose only the capabilities they need. The Core implementations contain no Phaser, DOM, Editor UI, Node-only API or platform SDK dependency.

All time values are seconds. The external host remains the sole tick owner and passes one immutable `RuntimeTimeFrame` to time-driven services. `AbortSignal` owns subscriptions, scheduled tasks, tweens and in-flight scene requests. Cleanup continues across sibling resources and callback failures are aggregated rather than silently swallowed.

### Runtime service implementations

- `createTimeService()` produces immutable scaled/unscaled frames, preserves frame stalls without hidden clamping and rejects invalid deltas/scales without corrupting the last frame.
- `createScheduler()` supports cancellable one-shot tasks, pause/resume, scaled/unscaled domains, owner cancellation and snapshot iteration (tasks created from callbacks start on the next frame).
- `createTweenService()` interpolates own writable finite numeric data properties with delay, easing, repeat/yoyo, pause/resume and owner cancellation. Accessors, readonly properties, non-finite values and zero-duration infinite loops are rejected.
- `createInputService()` consumes an injected normalized event source, routes each physical event to one UI/world audience, retains the initial route through a held keyboard/pointer interaction, synthesizes cancel events on focus loss, ignores keyboard/pointer input until focus is regained and exposes an injected coordinate mapper.
- `createTypedEventBus<TEvents>()` creates an isolated typed pub/sub channel. Subscriptions are disposable and may be bound to an owner signal; it never creates a process-wide singleton.
- `ComponentWorld` supplies an optional instance-lifetime signal through `ComponentFactoryContext.signal` and a fresh enabled-period signal through `onEnable({ signal })`. It aborts enabled resources before `onDisable` and instance resources before `onDestroy`, including during failed lifecycle cleanup.
- `createSceneManager(loader)` owns at most one active runtime session, uses latest-request-wins loading, disposes late candidates, restores the previous scene after activation failures and supports reusable stop plus terminal disposal.
- `createEngineRuntime<TEvents>()` composes these capabilities. Its `update(delta, updateWorld)` method consumes exactly one host delta in the fixed order **Time → Scheduler → Tween → active ComponentWorld callback**. It does not schedule or own a loop; the host calls it from its existing frame source and supplies the currently active world update explicitly.

The public package exports contracts and factories from the root entry point. Behavioral tests are in `tests/runtime-services.test.ts`; the existing contract-consumer tests remain separate. Scene Loader hydration/rollback tests continue to live in `tests/scene-loader.test.ts`.

All services are constructible in the Node test environment and require no browser globals.

## Public package verification

The Core quality suite includes an independent consumer check. It packs the package with `npm pack`, installs that tarball into a temporary project without network access, type-checks a consumer against the published declaration entry point, and executes the emitted ESM against the package export. The fixture exercises Project/Scene/Prefab serialization, manifest-backed Scene loading, independent Component instances, host-owned ticking and disposal.

The source-boundary test scans every Core TypeScript module and rejects non-relative imports and runtime npm dependencies. This protects the package boundary independently of the current Editor Host consumer.

Run `npm run quality:check` for typecheck, build, unit tests and the packed consumer smoke. Run `npm run benchmark` for the repeated native Scene serialization/hydration/lifecycle workload used by CI; the benchmark is diagnostic evidence, not a functional or browser-performance acceptance test.

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
