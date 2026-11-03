# @codogma/cge

Host-neutral contracts and the first component-object Core slice.

## Boundaries

- project-model owns versioned project/scene/node/transform/component/prefab/asset contracts, validation, migration and deterministic serialization.
- components owns the component schema, registry, lifecycle and explicit-tick scheduler.
- The package does not depend on Phaser, DOM/editor UI, Colibri, Node-only APIs or platform SDKs.
- The Core never creates a game loop. A runtime adapter calls ComponentWorld.update(deltaSeconds) from its controlled tick.
- A scene host owns one ComponentWorld lifetime per active scene. Replacing a scene disposes the previous world before creating the next one.
- Component modules are supplied through explicit registration. Project data stores stable type/module references; it never supplies executable import paths or source code.

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

Schema versions and API signatures are intentionally small and test-backed. The v0-to-v1 project migration is an in-memory compatibility operation; opening a file never writes migrated data automatically.


## Legacy Scene/Prefab migration (explicit opt-in)

`migrateLegacySceneDocument` and `migrateLegacyPrefabDocument` convert the existing Colibri `.scene` JSON shape to the versioned Core Scene/Prefab v1 envelope in memory. They never write the source file.

The mapping rules are intentionally conservative:

- Existing Scene/Prefab/Node IDs are mandatory and are preserved. Migration does not derive identity from names, file paths or array positions.
- Legacy display-list and plain-object entries become Scene root Nodes in their original collection order; nested `list` entries become child Nodes. Node names and the seven common Transform values are mapped explicitly.
- Legacy Component names are mapped only through the caller-provided `componentTypes` table. Each mapping supplies a stable Core `typeId` and `schemaVersion`. Namespaced values such as `PushOnClick.pushScale` become typed Component properties. Unmapped legacy references remain under `legacySource` and are reported as warnings.
- Prefab instance overrides are emitted only when the caller supplies an explicit `prefabReferences` mapping with root Node ID and the set of exposed property names. Without it, raw values remain available in `legacySource`; the migration does not guess which fields are overrides.
- Prefab exposed-property declarations, editor metadata, renderer-specific fields and the complete original JSON payload remain in extension data under `legacySource` / `legacyPrefabProperties`. They are not falsely presented as already converted runtime renderer or Inspector contracts.
- A legacy Prefab with multiple independent roots is rejected rather than silently changing the hierarchy into parent/child nodes. Supply a separately reviewed grouping migration if that legacy pattern is encountered.

The conversion result contains structured diagnostics. A caller must resolve warnings, register compatible component definitions and provide the appropriate Project/Prefab validation context before treating the converted document as load-ready. Scene hydration into a ComponentWorld remains COD-103.
