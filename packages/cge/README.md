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

- A `ComponentWorld` owns one scene-local Node/component lifetime. Node identity and activation are read-only through `getNode()` / `listNodes()`; update activation through `setNodeActive()`. `isComponentEnabled(instanceId)` reads an instance's enabled flag without allocating a `listComponents()` snapshot; it returns `false` when the instance is absent. Transform values remain mutable runtime state.
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

### Live runtime inspection and identity (COD-31)

- ComponentBehavior.inspect() is an optional, synchronous, explicit inspection capability. It is not inferred from behavior fields and is never called by the simulation lifecycle.
- ComponentWorld.inspectComponent(instanceId) returns only schema properties declared with storage: runtime. Persisted and editor-only properties are not read through this API.
- Inspection reads own data properties only; accessors are never invoked. Returned values are copied into bounded immutable JSON snapshots. Functions, symbols, accessors, cycles, non-finite numbers, class instances, proxies that fail reflection and values exceeding depth/size budgets are reported as unsupported. An exception from the provider is isolated as an error for the corresponding fields.
- Runtime property values must also satisfy their declared schema type and constraints. The API never traverses arbitrary behavior fields and never exposes a Component behavior object, Phaser GameObject, DOM object or other live reference.
- Runtime Node and Component identities are scoped by Project ID, Scene ID and Preview session ID. A Component identity uses its persisted instance ID; typeId is descriptive metadata and never identifies an attachment. A Restart creates a new scope, so a previous selection cannot be reused.
- Preview snapshots keep persisted values and live runtime values in separate fields. They are immutable reads; they do not mutate Project/Scene data. Moving runtime selection to an authoring object is an explicit Host action that must verify the exact current session identity.

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

Install dependencies once from the repository root, then run the package-owned quality suite:

```sh
npm ci
npm run quality:check --workspace=@codogma/cge
npm run benchmark --workspace=@codogma/cge
```

The package remains an independently buildable/public-export boundary, but its development dependencies are resolved by the repository's root workspace lockfile. Do not run a separate `npm ci` inside this workspace.

## SolidJS Editor Host integration

The Host consumes this workspace through the versioned `@codogma/cge` dependency. npm Workspaces links the checked-out package at install time; Vite and TypeScript resolve its public `dist/` entry points.

From the repository root:

```sh
npm ci
npm run dev:editor-host
```

The Host workspace builds Core before `dev`, `typecheck`, `build` and `test` using the package's pinned TypeScript compiler. The root install owns both packages' dependencies; there is no second Host or Core lockfile.

## Initial contracts

Schema versions and API signatures are intentionally small and test-backed. Project Model v1 is the first supported persisted contract. The parser rejects unpublished schema snapshots instead of reinterpreting them; schema migrations are introduced only when a prior contract has been published and requires a versioned transition.


### Native contract field policy

Project, Scene, Prefab, Asset, Node, Transform, Component-instance and Prefab-instance envelopes accept only fields declared by the current native schema. Unknown envelope fields remain blocking validation errors. Unknown JSON-compatible Component properties are retained as extension data and reported with a `COMPONENT_UNKNOWN_PROPERTY` warning; non-JSON values and values that violate a declared property schema remain blocking errors.

The native extension points are explicit JSON data bags: `Project.runtime.settings` and `Scene.settings`. Component-instance `properties` remain JSON data owned by the Component; when a registered schema is present, declared `persisted` properties are validated and normalized, while `editorOnly` and `runtime` values are omitted by serialization. Asset properties use stable Project asset IDs and may select a registered sub-resource only when the schema opts in with `allowSubResource`. Node properties use stable Node IDs and can constrain targets with `nodeKinds` and `allowSelf`. JSON boundary safety rejects accessors, custom prototypes, symbols, sparse arrays, cyclic graphs and non-JSON values. Future Project, Scene and Prefab schema versions are blocking errors.

## Project validation and production dependency analysis (COD-33)

`analyzeProjectBuild(input)` performs deterministic, host-neutral preflight analysis for the native Project Model. It validates the Project/Scene/Prefab snapshots with the existing Core validators and combines them with explicit host-resolved inputs to build a production dependency graph.

The host supplies:

- a bounded project-relative file inventory, including regular files, directories, symbolic links and measured source sizes;
- parsed Scene and Prefab documents keyed by their registered Asset IDs;
- validated Component Schemas and an explicit Script/module import graph, including declared dynamic entry points;
- resolved npm package-lock metadata keyed by stable installed package-instance IDs, with exact name/version, Codogma scope/targets and dependency edges to the specific instances selected by npm;
- feature provider decisions already resolved by the Feature Registry, plus required/optional external runtime files;
- optional final production output metadata collected from the real bundler output.

Core does **not** traverse the filesystem, resolve or install npm packages, parse TypeScript imports, execute project modules, run a bundler or implement the Feature Registry. Those responsibilities stay with the Node/build host and the owning subsystems. Feature requirements/conflicts and registry semantics remain COD-34; HTML5 output generation and Build Profiles remain COD-35. Optional providers such as `@codogma/ecs` and `@codogma/ecs-phaser` are not pulled into a production graph unless the corresponding feature is explicitly selected and its provider is available and target-compatible.

### Analysis guarantees

- The graph uses stable project/asset/scene/Prefab/module/package/feature identities; file paths are locations, not identities.
- npm package nodes use stable IDs for exact installed package instances. Package dependencies, module imports and Feature Providers refer to those IDs rather than package names, preserving multiple installed versions of the same package and nested lockfile instances.
- Registered assets and script modules must resolve to regular files in the supplied snapshot. Missing files, unsafe paths, path collisions, invalid documents, unresolved imports/references, missing package dependencies and unsupported production package scopes produce structured diagnostics with a source kind/ID/path.
- Scene and Prefab Component instances contribute only persisted Asset-property references declared by their validated Component Schema. Additional importer-discovered references are supplied through `assetReferences`; external runtime files declare their referencing graph nodes.
- Static module/package imports and required package dependencies form transitive reachability. Dynamic imports are accepted only when the host resolves them and provides a matching explicit dynamic entry point.
- A feature provider is an inclusion root only when the supplied feature snapshot is selected, available and target-compatible and resolves to an installed package instance. A selected feature with a missing or unavailable provider remains excluded from `includedFeatures` and produces a blocking diagnostic. Core does not change project feature settings or invoke npm.
- `unusedAssets` is populated only when all five scanner coverage flags (resource references, module imports, package dependencies, dynamic imports and external runtime files) are complete. Otherwise Core emits a warning and labels unreachable resources as `reference-scan-incomplete`, not unused.
- `report.output` is `not-produced` unless the input contains a production output manifest for the same target with actual per-file sizes. Raw, gzip and Brotli totals are derived only from those measured files. Output entries list graph node IDs emitted by the real build, making physical inclusion evidence distinct from a logical feature selection.
- Diagnostics with severity `warning` (for example, unused resources or absent optional package dependencies) do not make the analysis invalid. Blocking validation, module, package, feature-provider and output errors do.

The Core fixture suite tests native Project Model inputs, missing files, path/ID conflicts, complete versus incomplete reference discovery, transitive npm dependencies, dynamic-entry declarations, editor-only package exclusion, explicit feature provider selection, external runtime files and measured output manifests. No standalone HTML5 builder or editor integration is implied by these Core contracts.
