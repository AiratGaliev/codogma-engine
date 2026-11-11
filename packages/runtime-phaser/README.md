# @codogma/runtime-phaser

The Phaser 4.2.1 runtime integration for host-neutral Codogma Core sessions: a low-level view adapter plus a browser-first Preview Host composition.

## Responsibilities

- Consume a `ProjectRuntimeSceneSession` returned by the existing Core `SceneLoader`.
- Create one Phaser `Container` for each Node and preserve the Core graph's parent/child order.
- Create visual Component objects only through explicitly supplied type-ID factories.
- Keep stable Node ID ↔ Container and Component instance ID ↔ GameObject mappings for the lifetime of one loaded session.
- Synchronize Core-owned Transform, Node activity and Component enabled state into Phaser views on the Phaser Scene update event.
- Delegate activate/deactivate/pause/resume/dispose to the existing Core session and release Phaser-owned resources idempotently.
- Compose the native Scene Loader, Phaser adapter and Core Scene Manager behind one browser-owned Phaser Game through `createBrowserPreviewHost`.
- Expose session state, Play/Pause/Resume/Restart/Stop, viewport resize, session-tagged log/error events and immutable live runtime snapshots/selection to an external browser host.

The low-level adapter does **not** parse Project/Scene documents, discover modules, register Components, duplicate Core lifecycle, create a Game/Scene, install a ticker, call `requestAnimationFrame`, own physics, or import the optional ECS packages. The separate Browser Preview Host is the browser composition boundary; it owns exactly one Phaser Game and uses the existing Scene UPDATE event as the only frame source.

## Install and compose

The host supplies the compatible Core session loader and an existing Phaser Scene. Phaser is an exact peer dependency; Core remains independent of Phaser.

```ts
import Phaser from "phaser";
import { ProjectSceneLoader } from "@codogma/cge";
import { createPhaserRuntimeSceneLoader } from "@codogma/runtime-phaser";

const sceneLoader = new ProjectSceneLoader({
  project,
  registry,
  readAssetDocument,
});

const runtimeLoader = createPhaserRuntimeSceneLoader(this, sceneLoader, {
  projectId: project.id,
  componentViewFactories: {
    "com.example.sprite": (context) => {
      const assetId = (context.document.properties.sprite as { assetId: string }).assetId;
      const asset = context.getAsset(assetId);
      if (!asset) throw new Error("Component references an unknown Project Asset.");
      return context.scene.add.image(0, 0, resolveTextureKey(asset));
    },
  },
});
```

Factories are explicit and type-specific. Factory-created GameObjects use Node-local coordinates (normally starting at 0, 0). Each factory receives a frozen Node/Transform/Component snapshot and an isolated JSON copy of its validated Component document, so mutating factory input cannot alter the Core graph or source document. The adapter does not assume that every Core Component renders an object. Each returned Phaser GameObject must be live, belong to the supplied Scene, have no existing `parentContainer`, and have `ignoreDestroy === false`; one GameObject cannot be owned by multiple Components. Scene display-list objects may be adopted, but objects already owned by another Container are rejected rather than silently reparented. Once adopted, the adapter owns the view lifetime and resets Phaser's `ignoreDestroy` opt-out during disposal so cleanup cannot be bypassed by later mutation. The adapter does not adopt or destroy a view rejected by factory-result validation; its creator remains responsible for releasing it. A factory that throws before returning remains responsible for releasing resources it created but did not return.

Use the returned loader as the SceneLoader passed to Core's existing Scene Manager/runtime composition. The adapter wraps each loaded Core session; the Scene Manager remains responsible for transitions and lifecycle ordering.

## Browser Preview Host

Use the browser composition when an external browser host needs to run a native Project Model Scene without Tauri, Electron, the editor UI or the local HTTP server. It creates one Phaser Game for the Host lifetime and keeps the low-level adapter and Core Scene Manager as the only owners of runtime views and Scene lifecycle.

```ts
import Phaser from "phaser";
import { ComponentRegistry } from "@codogma/cge";
import { createBrowserPreviewHost } from "@codogma/runtime-phaser";

const preview = createBrowserPreviewHost({
  phaser: Phaser,
  parent: document.querySelector("#preview")!,
  project,
  sceneId: "scene-level",
  resolveComponentRegistry: async ({ project, sceneId, signal }) =>
    resolvePreviewModules(project, sceneId, signal), // Core module resolver + TypeScript diagnostics
  readAssetDocument: (asset, signal) => projectFiles.readText(asset.path, signal),
  componentViewFactories: {
    "com.example.sprite": (context) => {
      const assetReference = context.getAsset("asset-player");
      if (!assetReference) throw new Error("Sprite Asset is not declared by the Project.");
      return createSpriteView(context.scene, assetReference, context.document);
    },
  },
});

preview.subscribe("error", (event) => reportPreviewError(event));
await preview.play();
```

`BrowserPreviewHostOptions` captures and freezes the Project JSON when the Host is created. Supply either a pre-resolved `registry` or `resolveComponentRegistry`; the resolver runs after a Preview `sessionId` is allocated and before Phaser Game boot. It can compose Core `resolveProjectComponentRegistry` with the Editor's TypeScript diagnostics and return structured module/compiler diagnostics. Errors are emitted with that session ID and prevent Phaser startup; warnings/info are routed as session-scoped log events. A successful registry is snapshotted and reused on Restart. A Scene document is cached after its first successful read. Create a new Host to adopt changed authoring data or module definitions. The resolver's document provider accepts only Asset references declared by the captured Project and caches successful reads. Component factories receive `getAsset(assetId)`, which returns only frozen copies of Asset references validated from that captured Project snapshot; actual file loading/rendering stays with the host's explicit providers.

- `play()` loads the selected Scene through `ProjectSceneLoader` → `PhaserRuntimeSceneLoader` → `SceneManager`.
- `pause()` / `resume()` pause or resume Core simulation; the Phaser Game continues rendering. The Host does not pause the entire Game loop.
- `restart()` disposes the current Scene session and starts a clean session from the captured inputs, reusing the same Game.
- `stop()` disposes the current runtime session but keeps the Game available for another Play.
- `resize(width, height)` validates finite positive dimensions and delegates to Phaser Scale; dimensions set before the first Play are used for the initial Game configuration.
- `dispose()` is terminal: it disposes Core/Phaser session resources and destroys the Game. Phaser completes Game destruction asynchronously and signals `Phaser.Core.Events.DESTROY`. Phaser boot is bounded by `startupTimeoutMs` (default 15 seconds; accepted range 1–60,000 ms); a boot timeout or external pre-ready Game destruction fails the session and releases the partial Game.

Host states are `idle`, `starting`, `running`, `paused`, `stopping`, `stopped`, `failed` and `disposed`. Repeated Play/Pause/Resume/Stop/Dispose calls are safe; Restart always requests a new session. Each run has a distinct `sessionId`. Log and error events carry `sessionId`, `projectId` and `sceneId`; runtime diagnostics retain the Phaser/Core source and relevant Node/Component identity. Event observer exceptions are isolated from the game lifecycle.

The Host does not create an iframe, browser window, worker, process, RAF loop or alternate ticker. It does not resolve arbitrary TypeScript modules or download arbitrary asset paths: module registrations and document/asset providers are explicitly supplied by the embedding host. The browser renderer/focus/visibility and full user workflow remain subject to independent browser acceptance in CODQA-15; asset loading, live Inspector transport, physics and Preview/Build parity are separate capabilities.

### Live runtime identity and inspection

While a Preview is running or paused, getRuntimeSnapshot() returns an immutable view scoped to the current Project, Scene and Preview session. Each Node is mapped by its Project Model Node ID; each Component is mapped by its exact instance ID, with typeId retained only as descriptive type metadata. Mapping is validated against the captured Scene document and the live Core graph; missing or mismatched targets make the snapshot unavailable rather than falling back to names or paths.

Every Node snapshot keeps the persisted Transform/activity beside a separate copy of its live runtime Transform/activity. Each Component snapshot keeps persisted properties beside values reported by ComponentWorld.inspectComponent(). Only schema-declared storage: runtime properties are eligible for live inspection. Providers opt in with ComponentBehavior.inspect(); the Core reads own data properties only, validates their safe data types/reference shapes and returns bounded immutable JSON. Persisted authoring constraints do not filter transient live observations. Unsupported values and provider exceptions are represented as per-property states, never as raw runtime references.

selectRuntimeIdentity(identity) accepts only a Node/Component present in the exact current session and emits a runtime-selection event. A Restart invalidates the previous selection scope; Stop/disposal clears the mapping and selection. The Preview API does not write runtime values into authoring data. An Editor Host must explicitly map the validated Node/Component identity to its selection model; the API itself does not claim that a UI workflow is connected.

## Ownership and synchronization

- **Core owns mutable state.** Node Transform and Component enabled state are read from the Core runtime session. Factories receive immutable identity/state snapshots, an isolated copy of their Component document and a lookup for Asset references validated in the Project snapshot. The adapter never copies Phaser mutations back into Core and never mutates the persisted Scene snapshot.
- **Phaser owns views.** Node Containers and factory-created GameObjects are adapter-owned and destroyed on session disposal, Scene shutdown or Scene destruction.
- **Hierarchy is local-space.** Every Core Node maps to a Phaser Container. Root Containers are attached to the Scene display list; child Containers are attached to their parent. Phaser 4.2.1 Containers use a fixed local origin of `(0, 0)`; Core `originX/originY` are applied to each Component GameObject that supports `setOrigin`, not to the Container itself.
- **Sibling order is deterministic.** Component views for a Node are inserted first in persisted component order, then child Node Containers in Scene graph order.
- **Activity follows Core.** A Node view is active/visible only while its session is active and its Core Node is active. A Component view additionally requires that Component to be enabled. The adapter uses Core's allocation-free `isComponentEnabled` query instead of snapshotting all Components every frame. Unchanged Node transforms, visibility and origins are not re-applied. Pausing a session stops simulation but leaves active views visible.
- **One frame owner.** The adapter subscribes to the existing Phaser Scene `UPDATE` event and converts milliseconds to seconds. By default it updates `session.world` once. When composing `EngineRuntime`, supply `update` to invoke that runtime's ordered frame pipeline and pass its scaled delta to the Core World; do not also update the World separately.
- **Cleanup.** Scene `SHUTDOWN` and `DESTROY` detach listeners and dispose the session. Repeated disposal is safe. Phaser's exclusive Container ownership recursively destroys attached children; the adapter also checks and releases any still-live owned objects after partial failures.

## Public API

- `createBrowserPreviewHost(options)`
- `BrowserPreviewHost` / `BrowserPreviewHostOptions` / `BrowserPreviewHostEvents`
- `createPhaserRuntimeSceneLoader(scene, coreLoader, options)`
- `PhaserRuntimeSceneLoader`
- `PhaserRuntimeSceneSession`
- `PhaserComponentViewFactory` / `PhaserComponentViewContext`
- `PhaserRuntimeAdapterError` / `PhaserRuntimeDiagnostic`

`getNodeView`, `getComponentView`, `getNodeId`, and `getComponentInstanceId` expose session-scoped runtime identity mappings.

## Deliberate limits

The low-level adapter supports display-object hierarchy and Transform projection only. It does not create physics bodies, load assets, infer rendering from arbitrary Component properties, synchronize arbitrary Phaser-side Transform edits or update Core's persisted documents. Browser Preview Host lifecycle is implemented, while concrete asset loading, physics, live Inspector transport and complete Preview/Build parity require separate owner contracts and acceptance.

## Verification and performance

`npm run test:runtime-phaser` (from the repository root) builds Core first, then builds the adapter declarations and executes deterministic tests using a structural Phaser host double against the exact Phaser 4.2.1 type declarations. The lower-level workspace `quality:check` command assumes Core has already been built.

`npm run benchmark --workspace=@codogma/runtime-phaser` compares Core-only and adapter bridge startup, update and cleanup costs at 100, 1,000 and 10,000 Nodes. It is a **Node.js synthetic benchmark with a mock Phaser host**; it is not evidence of browser FPS, GPU performance, real rendering cost, mobile performance, or physics performance. Browser/runtime measurements remain a separate acceptance requirement.
