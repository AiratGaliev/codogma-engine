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
- Legacy Component names are converted only when the caller supplies both `componentTypes` (stable `typeId` + `schemaVersion`) and `componentInstanceIds` (stable instance ID keyed by `legacyComponentInstanceKey(nodeId, legacyName)`). Namespaced values such as `PushOnClick.pushScale` then become typed Component properties. Without either mapping the legacy reference and values remain in `legacySource` with warnings; IDs are never derived from names or array positions.
- Prefab instance overrides are emitted only when the caller supplies an explicit `prefabReferences` mapping with root Node ID and the set of exposed property names. Without it, raw values remain available in `legacySource`; the migration does not guess which fields are overrides.
- Prefab exposed-property declarations, editor metadata, renderer-specific fields and the complete original JSON payload remain in extension data under `legacySource` / `legacyPrefabProperties`. They are not falsely presented as already converted runtime renderer or Inspector contracts.
- A legacy Prefab with multiple independent roots is rejected rather than silently changing the hierarchy into parent/child nodes. Supply a separately reviewed grouping migration if that legacy pattern is encountered.

The conversion result contains structured diagnostics. A caller must resolve warnings, register compatible component definitions and provide the appropriate Project/Prefab validation context before treating the converted document as load-ready. Scene hydration into a ComponentWorld remains COD-103.


## Compatibility inventory

A field-by-field inventory of the checked-in legacy Scene/Prefab/Component/Asset Pack fixtures, including migrated fields and deliberately preserved-only fields, is maintained in [docs/legacy-project-model-compatibility.md](../../docs/legacy-project-model-compatibility.md). The inventory is representative of repository test projects; it is not yet a complete importer/reimport audit of every project format.

## Node Asset references in the Project Model

Scene v1 Nodes may contain `assetReferences`: each item stores an explicit property path and stable Project `assetId`. Scene validation resolves these IDs against the supplied Project Asset registry. Legacy texture-key conversion is opt-in through `LegacySceneMigrationOptions.assetReferences`; no Asset ID is generated from a texture key or URL.

The checked-in `asset-pack.json` fixture identifies the image by legacy key `dino` and URL `assets/dino.png`. A caller must create or select the Project Asset record and pass its stable ID to the migration. The original renderer-specific texture object remains in `legacySource` until the renderer/adapter contract defines its canonical representation.

## Project Component Module manifest

Project v1 stores component modules as explicit manifest entries:

- id — stable module identity, independent from its filename/path and from any exported component type IDs;
- moduleAssetId — stable ID of a Project Asset whose kind is script; the source path is resolved from that Asset record;
- version — version of the module implementation;
- exports[] — all public component definitions exported by the module, each with its stable typeId and positive integer schemaVersion.

The validator enforces unique module IDs and globally unique exported component type IDs, validates the source Asset kind and validates every export schema version. It does not infer exports from class names or execute source files.

Stable IDs are opaque, case-sensitive identifiers of 1–256 ASCII characters: the first character is a letter or digit; remaining characters may additionally contain dot, underscore, colon and hyphen. They are identifiers, not paths or display labels.

Unknown JSON-compatible fields on Project/Scene/Prefab/Node/Transform/Component/Asset manifest records are preserved and returned as PROJECT_UNKNOWN_FIELD_PRESERVED warnings with their exact path. Arbitrary runtime.settings remains an extension configuration object and is not recursively interpreted by Core.

The opt-in migrateSceneDocument and migratePrefabDocument helpers accept both legacy inputs and already versioned v1 documents. Repeated migration validates/clones v1 data without regenerating IDs or overrides and never writes source files automatically.

### Legacy Component instance identity

Legacy scene component lists do not carry persisted instance IDs. The migration API therefore requires the caller to supply an explicit stable ID mapping in `LegacySceneMigrationOptions.componentInstanceIds`, keyed by `legacyComponentInstanceKey(nodeId, legacyName)`. A legacy component is left inside the preserved source payload with a warning when that mapping is missing. Core never derives instance identity from class names, type IDs, file names or array positions.
