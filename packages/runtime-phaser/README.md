# @codogma/runtime-phaser

The optional Phaser 4.2.1 view adapter for host-neutral Codogma Core runtime sessions.

## Responsibilities

- Consume a `ProjectRuntimeSceneSession` returned by the existing Core `SceneLoader`.
- Create one Phaser `Container` for each Node and preserve the Core graph's parent/child order.
- Create visual Component objects only through explicitly supplied type-ID factories.
- Keep stable Node ID ↔ Container and Component instance ID ↔ GameObject mappings for the lifetime of one loaded session.
- Synchronize Core-owned Transform, Node activity and Component enabled state into Phaser views on the Phaser Scene update event.
- Delegate activate/deactivate/pause/resume/dispose to the existing Core session and release Phaser-owned resources idempotently.

The adapter does **not** parse Project/Scene documents, discover modules, register Components, duplicate Core lifecycle, create a Game/Scene, install a ticker, call `requestAnimationFrame`, own physics, or import the optional ECS packages.

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
    "com.example.sprite": ({ scene, document, node }) => {
      const asset = document.properties.sprite;
      // Resolve this reference through the host's asset service.
      return scene.add.image(0, 0, resolveTextureKey(asset));
    },
  },
});
```

Factories are explicit and type-specific. Factory-created GameObjects use Node-local coordinates (normally starting at 0, 0). Each factory receives a frozen Node/Transform/Component snapshot and an isolated JSON copy of its validated Component document, so mutating factory input cannot alter the Core graph or source document. The adapter does not assume that every Core Component renders an object. Each returned Phaser GameObject must belong to the supplied Scene; one GameObject cannot be owned by multiple Components. A factory that throws before returning remains responsible for releasing resources it created but did not return.

Use the returned loader as the SceneLoader passed to Core's existing Scene Manager/runtime composition. The adapter wraps each loaded Core session; the Scene Manager remains responsible for transitions and lifecycle ordering.

## Ownership and synchronization

- **Core owns mutable state.** Node Transform and Component enabled state are read from the Core runtime session. Factories receive immutable identity/state snapshots plus an isolated copy of their Component document. The adapter never copies Phaser mutations back into Core and never mutates the persisted Scene snapshot.
- **Phaser owns views.** Node Containers and factory-created GameObjects are adapter-owned and destroyed on session disposal, Scene shutdown or Scene destruction.
- **Hierarchy is local-space.** Every Core Node maps to a Phaser Container. Root Containers are attached to the Scene display list; child Containers are attached to their parent. Phaser 4.2.1 Containers use a fixed local origin of `(0, 0)`; Core `originX/originY` are applied to each Component GameObject that supports `setOrigin`, not to the Container itself.
- **Sibling order is deterministic.** Component views for a Node are inserted first in persisted component order, then child Node Containers in Scene graph order.
- **Activity follows Core.** A Node view is active/visible only while its session is active and its Core Node is active. A Component view additionally requires that Component to be enabled. Pausing a session stops simulation but leaves active views visible.
- **One frame owner.** The adapter subscribes to the existing Phaser Scene `UPDATE` event and converts milliseconds to seconds. By default it updates `session.world` once. When composing `EngineRuntime`, supply `update` to invoke that runtime's ordered frame pipeline and pass its scaled delta to the Core World; do not also update the World separately.
- **Cleanup.** Scene `SHUTDOWN` and `DESTROY` detach listeners and dispose the session. Repeated disposal is safe. Phaser's exclusive Container ownership recursively destroys attached children; the adapter also checks and releases any still-live owned objects after partial failures.

## Public API

- `createPhaserRuntimeSceneLoader(scene, coreLoader, options)`
- `PhaserRuntimeSceneLoader`
- `PhaserRuntimeSceneSession`
- `PhaserComponentViewFactory` / `PhaserComponentViewContext`
- `PhaserRuntimeAdapterError` / `PhaserRuntimeDiagnostic`

`getNodeView`, `getComponentView`, `getNodeId`, and `getComponentInstanceId` expose session-scoped runtime identity mappings.

## Deliberate limits

This first adapter slice supports display-object hierarchy and Transform projection only. It does not create physics bodies, load assets, infer rendering from arbitrary Component properties, synchronize arbitrary Phaser-side Transform edits, update Core's persisted documents, or provide the complete Preview Host. Those capabilities require explicit owner contracts and separate acceptance.

## Verification and performance

`npm run test:runtime-phaser` (from the repository root) builds Core first, then builds the adapter declarations and executes deterministic tests using a structural Phaser host double against the exact Phaser 4.2.1 type declarations. The lower-level workspace `quality:check` command assumes Core has already been built.

`npm run benchmark --workspace=@codogma/runtime-phaser` compares Core-only and adapter bridge startup, update and cleanup costs at 100, 1,000 and 10,000 Nodes. It is a **Node.js synthetic benchmark with a mock Phaser host**; it is not evidence of browser FPS, GPU performance, real rendering cost, mobile performance, or physics performance. Browser/runtime measurements remain a separate acceptance requirement.
