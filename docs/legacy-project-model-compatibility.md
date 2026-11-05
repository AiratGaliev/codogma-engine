# Legacy Project Model compatibility inventory

**Дата проверки:** 03.11.2026  
**Scope:** реальные JSON fixtures из tests/workspace/test-typescript/; миграция в Project/Scene/Prefab Model v1 в packages/cge.  
**Статус inventory:** частичный repository-fixture baseline, не полный аудит всех пользовательских проектов и importer/reimport workflows.

## Источники и наблюдаемые форматы

| Источник | Наблюдаемая структура / metadata | Где используется |
|---|---|---|
| scenes/Level.scene | sceneType: SCENE, UUID document/node IDs, displayList, plainObjects, settings, meta, legacy component names and namespaced property values, Prefab instances | Scene/Node/Component/Prefab fixture |
| scenes/AgentLevel.scene | Scene с непустыми displayList и plainObjects | Разделение legacy collections |
| scenes/DinoPrefab.scene | sceneType: PREFAB, Container/Image roots, prefabProperties, nested component refs | Prefab/root/property fixture |
| scenes/CoinPrefab.scene | Prefab с numeric exposed property; meta.version: 5 | Prefab properties/version metadata |
| scenes/issue154/BaseContainerPrefab.scene | Container root с двумя дочерними объектами в list | Container hierarchy |
| scenes/issue154/DerivedContainer1Prefab.scene | Inherited Prefab через prefabId, unlock и nestedPrefabs | Inherited/nested Prefab payload |
| scenes/nestedPrefabInContanerIssue/NestedPrefabInContainerPrefab.scene | Container → nested Prefab instance + child nodes + nested Container | Nested hierarchy fixture |
| scenes/nestedPrefabInContanerIssue/NestedInsideContainerPrefabInstanceScene.scene | Prefab instance с вложенным nestedPrefabs tree | Nested override fixture |
| scenes/TestListFieldScene.scene | Дополнительное scene-level поле lists | Unsupported/extension field |
| components/Behaviors.components | Legacy components[], component names, property declarations, option values, default values, output language | Component definition source |
| assets/asset-pack.json | Asset pack metadata version 2; files с url, type, key | Legacy Asset Pack key/path lookup |

У формата .scene нет единого version marker во всех приведённых fixtures: meta.version присутствует, например, у Coin Prefab, но не является обязательным во всех наблюдаемых файлах. .components также не несёт общей числовой schema version. Поэтому мигратор не выводит version из имени файла и сохраняет исходные metadata.

## Field-by-field mapping: Scene / Node

| Legacy field | Project Model v1 | Статус / ограничение |
|---|---|---|
| document id | Scene/Prefab id | Сохраняется без изменения; отсутствующий ID — blocking error |
| sceneType | Выбор Scene или Prefab migration API | Только явное значение SCENE или PREFAB |
| displayList | SceneDocumentV1.rootNodes | Порядок внутри коллекции сохраняется; legacyCollection: displayList сохраняет происхождение |
| plainObjects | Продолжение rootNodes после display list | Исходная коллекция фиксируется как legacyCollection: plainObjects; межколлекционный порядок не придумывается |
| node id | NodeDocument.id | Сохраняется; пропуск ID — blocking error, никакой генерации из имени/позиции |
| label / name | NodeDocument.name | Приоритет label → name → stable Node ID; legacy renderer/object kind `type` не используется как имя |
| renderer `type` | `legacySource.type` | Значения Image/Text/Container/EditableTilemapLayer описывают legacy renderer/object kind; сохраняются с warning до появления versioned rendering Component contract |
| compiler `scope` | `legacySource.scope` | CLASS/METHOD/NESTED_PREFAB — legacy compiler/editor metadata; сохраняется с warning, не является Node name или runtime type ID |
| list[] | NodeDocument.children[] | Рекурсивно мигрирует Container hierarchy и стабильные child IDs |
| x/y/rotation/scaleX/scaleY/originX/originY | NodeDocument.transform | Числовые конечные значения переносятся; Core defaults применяются к отсутствующим; неверные заданные значения дают warning и сохраняются в source |
| active | NodeDocument.active | Boolean сохраняется; при отсутствии используется Core default true; некорректное заданное значение даёт warning и default true, исходное значение остаётся в legacySource |
| components[] | NodeDocument.components[] | Только с mapping legacy name → stable typeId + schemaVersion **и** explicit stable component instance ID; без любого mapping source reference/values остаются в `legacySource` с warning |
| ComponentName.property | ComponentInstanceDocument.properties[property] | JSON-совместимые значения переносятся по явному mapping компонента; исходные namespaced fields сохраняются |
| prefabId | NodeDocument.prefabInstance.prefabId | Стабильный ID сохраняется; resolver/existence check требует Project/Prefab validation context |
| texture.key | NodeDocument.assetReferences[{propertyPath: texture, assetId}] | Только при явном asset key → stable Asset ID mapping и Project Asset registry context |
| settings, meta, renderer-specific fields | legacySource и settings.legacySettings/legacyMeta | Исходные значения сохраняются; это не заявляется как готовый runtime Renderer contract |
| scene-level lists и unknown extension fields | Scene legacySource | Сохраняется с structured warning, пока не существует v1 contract |

## Field-by-field mapping: Prefab / Component / Asset

| Legacy field | Project Model v1 | Статус / ограничение |
|---|---|---|
| Prefab root displayList / plainObjects | PrefabDocumentV1.root | Ровно один root поддерживается текущим контрактом; несколько независимых roots отклоняются, не превращаясь в parent/child |
| prefabProperties[] | legacyPrefabProperties extension payload | Объявления сохраняются verbatim; текущий Core не делает вид, что они уже стали versioned Component Schema |
| unlock[] | legacySource.unlock | Сохраняется с warning; policy доступных overrides ещё не мигрирована |
| nestedPrefabs[] | legacySource.nestedPrefabs | Сохраняется с warning; nested source/override graph остаётся в scope COD-8 |
| .components.components[] | Источник явного legacy component mapping | Текущая migration API принимает mapping от вызывающего кода; она не угадывает stable typeId из class/file/display name и не регистрирует runtime module |
| asset-pack files[].key/url/type | Вход для явного asset key → Project Asset ID mapping | Сам Asset Pack не создаёт stable IDs; key/URL не используются как ID |
| Asset subResourceId | AssetReference.subResourceId | Уже поддерживается Project Model validator; importer-specific slicing/atlas mapping не входит в текущий legacy adapter |

## Diagnostics и loss-avoidance policy

- Все миграции opt-in и in-memory: исходные файлы автоматически не переписываются.
- Полный исходный Scene/Prefab JSON и каждый исходный Node сохраняются под legacySource; Prefab properties остаются в legacyPrefabProperties.
- Неизвестные Component types, unknown legacy renderer `type` / compiler `scope`, несопоставленные texture keys, unmapped fields, invalid transforms и nested Prefab payload выдаются как machine-readable warnings.
- Отсутствующие stable document/node IDs, несовместимый discriminator и Prefab с несколькими roots отклоняются как blocking diagnostics.
- Некорректные legacy `active`, `displayList` и `plainObjects` не интерпретируются молча: применяется documented fallback только для Scene/Prefab roots и добавляется warning с точным source path; исходное значение сохраняется.
- Component instance ID не выводится из Node ID + legacy component name: legacy format не сохраняет instance identity. Для преобразования caller обязан передать явный stable instance ID через `componentInstanceIds`; runtime type ID также берётся только из явного mapping.
- Asset ID никогда не выводится из texture key или URL. Validation проверяет ссылку через переданный Project Asset registry.
- Наличие legacySource означает отсутствие потери исходного JSON payload, но не завершение всех semantic conversions, renderers, reimport и runtime behavior.

## Automated evidence

packages/cge/tests/legacy-migrations.test.ts покрывает representative real fixtures:

- Level Scene: display list, component instance/property mapping, stable prefab ID, explicit Prefab override mapping и preservation of source;
- AgentLevel: displayList + plainObjects;
- Dino/Coin Prefabs: root ID, component data и exposed properties;
- BaseContainer/Nested Prefab: Container child hierarchy и child IDs;
- inherited/nested Prefab fixtures: raw nested override preservation + warning;
- TestListFieldScene: scene-level unknown lists field preservation;
- Asset Pack: dino → assets/dino.png explicit key/URL evidence, затем явное stable Asset ID mapping;
- deterministic serialization round-trip, invalid ID, multi-root refusal, invalid Transform, unknown component type.

CI evidence is attached to PR #41 after its run completes.

## Что этот inventory ещё НЕ покрывает

Это не закрывает COD-17 полностью. До утверждения полной backward compatibility ещё нужно инвентаризировать и проверить:

- все оставшиеся scene/prefab fixtures и importer variants, включая Tilemap/Tiled, Aseprite/PSD, atlas/sprite slicing, animation/audio/font metadata;
- реальный reimport behavior и сохранение importer-specific metadata;
- все вложенные Prefab override/propagation combinations из issue154/nestedPrefab cases — это также требует COD-8;
- path changes, deleted/moved files, sub-resources and broken references на уровне реальных проектов;
- IFileStorage, HTTP API, plugin registry, Undo/Redo boundaries и безопасные migration flows;
- реальные пользовательские проекты, отличающиеся от checked-in test workspace.

Пока эти данные не покрыты fixtures/tests, COD-25/COD-17 не должны утверждать полную migration compatibility для всех существующих проектов.

## Project Component Module manifest v1

Persisted Project Model v1 now separates module identity from source location and component type identity. Each module stores stable id, moduleAssetId (a Project Asset reference of kind script), module implementation version and exports[]. Every export stores stable typeId and positive schemaVersion. Validation enforces unique module IDs and globally unique exported type IDs across the Project.

The module source path is resolved through the referenced AssetReference; it is not an identity. Runtime/module execution and source introspection are not part of this manifest schema.

Stable IDs use a documented opaque grammar: case-sensitive ASCII, 1–256 characters, first character alphanumeric and remaining characters alphanumeric or dot/underscore/colon/hyphen.

Unknown JSON-compatible fields at the Project/Scene/Prefab/Node/Transform/Component/Asset reference boundaries are retained and produce PROJECT_UNKNOWN_FIELD_PRESERVED warnings with exact field paths. Arbitrary runtime.settings is passed through as adapter-owned extension configuration.

### Legacy Component instance IDs

The checked-in legacy Scene/Prefab examples store component class names in an array and namespaced properties on the owning Node; they do not persist a separate component instance ID. The migration consequently cannot create a Core ComponentInstance from the class name alone. Callers must supply an explicit stable ID through `componentInstanceIds`, indexed by `legacyComponentInstanceKey(nodeId, legacyName)`. If no mapping exists, the component reference/property fields remain in `legacySource` and a warning is returned. This avoids deriving instance identity from class name, type ID, source path or array order. Duplicate legacy component names on one Node are ambiguous in this format and require source-level disambiguation before conversion.


## Future-version and migration purity checks

The current v1 validators return `PROJECT_UNSUPPORTED_VERSION` with the exact `schemaVersion` path for future Project, Scene and Prefab documents. The parser does not reinterpret future schemas as v1 and never writes them. Project v0 migration clones the JSON tree before normalization/validation: it leaves the source object unchanged and the migrated result does not alias nested mutable values from the input.
 

## Complete checked-in test project inventory — 27 legacy Scene/Prefab files

The following file set was read from `tests/workspace/test-typescript/scenes/` on `dev` and copied verbatim into `packages/cge/tests/fixtures/legacy/`. The migration regression test iterates the complete list, rather than sampling only the nine original fixtures.

| Legacy file | Observed format / capability represented |
|---|---|
| `AgentLevel.scene` | Scene; `displayList` + `plainObjects`; Image/Text/EditableTilemapLayer/EditableTilemap; `scope: METHOD` |
| `CoinPrefab.scene` | Prefab; exposed numeric Prefab property; `meta.version: 5` |
| `CoinRush.scene` | Scene; Image/Text and ordinary Transform/texture fields |
| `DinoPrefab.scene` | Prefab; User Component names and namespaced properties; exposed bool/option properties |
| `DoubleDinoPrefab.scene` | Prefab; Container with multiple nested Prefab instances; Prefab-level `lists` and exposed properties |
| `Level.scene` | Scene; User Components, Prefab instances, `unlock`, `scope: CLASS`, namespaced properties |
| `MyGame.scene` | Scene; Image/Text |
| `OfficialE2E.scene` | Scene; Image/Text/Glow/Collider, Arcade body properties, nested object `list`, scene-level `lists` |
| `TestListFieldScene.scene` | Scene; scene-level `lists` |
| `TestOneObjectScene.scene` | Scene; `scope: PUBLIC` |
| `TestTileSpriteSizeInInspector.scene` | Scene; TileSprite/Rectangle; width/height/isFilled |
| `TextWordWrapScene.scene` | Scene; Text origin, font and word-wrap properties |
| `box2d-acceptance.scene` | Scene; Box2D body enabled/type/shape/friction/restitution/density properties |
| `componentsAwake/TestComponentsAwakeEvent.scene` | Scene; two legacy User Component names and Prefab instance |
| `fx-acceptance.scene` | Scene; Circle/Bloom/Shine/Gradient FX objects and Container hierarchy |
| `issue147/Issue147.scene` | Scene; scene-level `lists` |
| `issue154/BaseContainerPrefab.scene` | Prefab; Container and nested children |
| `issue154/DerivedContainer1Prefab.scene` | Prefab; inherited Prefab link, `unlock`, `nestedPrefabs` override data |
| `issue154/Issue154.scene` | Scene; Prefab instance with nested override data |
| `nestedPrefabInContanerIssue/AnotherPrefabPrefab.scene` | Prefab; nested Container/Text objects and `scope: NESTED_PREFAB` |
| `nestedPrefabInContanerIssue/NestedInsideContainerPrefabInstanceScene.scene` | Scene; nested Prefab-instance structure |
| `nestedPrefabInContanerIssue/NestedPrefabInContainerPrefab.scene` | Prefab; Container hierarchy with nested Prefab instances |
| `originMigration/OriginMigration.scene` | Scene; Prefab instance with origin override/unlock metadata |
| `originMigration/TextWithOriginPrefab.scene` | Prefab; Text origin, line spacing, stroke and padding properties |
| `prefabAwake/PrefabAwakeTest.scene` | Scene; multiple Prefab instances exercising Awake handling |
| `prefabAwake/WithAwakeEventPrefab.scene` | Prefab; Text and `settings.generateAwakeHandler` |
| `prefabAwake/WithoutAwakeEventPrefab.scene` | Prefab; Text padding and `settings.generateAwakeEvent` |

## Additional legacy format fixtures

- `components/Behaviors.components`: `PushOnClick` and `Tint`, base class, Phaser GameObject type, property descriptors/defaults/options, `customDefinition`, `generateAwakeEvent`, metadata and `outputLang`.
- `scenes/componentsAwake/AwakeTest.components`: `ComponentWithAwake` / `ComponentWithoutAwake`, GameObject type and `generateAwakeEvent`.
- `assets/asset-pack.json`: Asset Pack metadata v2 with file keys, URLs and asset kinds. The migration test proves only explicit `dino → stable Asset ID` conversion; key/URL is never used as Project identity.

The checked Scene/Prefab fixtures do not share one uniform version marker: some contain `meta.version` values 2, 3 or 5, while many omit it. Neither the migrator nor the compatibility test derives a version from the filename or silently treats `meta.version` as Project Model `schemaVersion`.

## Observed legacy field families and current migration disposition

| Field family | Observed fields / examples | Current disposition |
|---|---|---|
| Renderer / GameObject kind | `type: Image/Text/Container/TileSprite/Rectangle/EditableTilemap/EditableTilemapLayer/Glow/Circle/Bloom/Shine/Gradient/Collider` | Preserved under each Node's `legacySource` with `PROJECT_LEGACY_FIELD_PRESERVED`; not yet a v1 renderer component contract |
| Compiler / editor scope | `scope: CLASS/METHOD/PUBLIC/NESTED_PREFAB` | Preserved with warning; never used as Node name or component type identity |
| FX | `preFX`, `thickness`, `feather`, `threshold`, `blurRadius`, `blurSteps`, `blurQuality`, `blendAmount`, `radius`, `direction`, `duration`, `reveal`, `yoyo`, gradient coordinates/colors | Preserved with warning; no automatic FX schema conversion |
| Arcade / Collider | `Arcade.active`, `body.physicsType`, `body.geometry`, `body.velocity.x`, `body.collideWorldBounds`, `object1`, `object2`, `overlapOnly` | Preserved with warning; not represented as runtime Physics/Collider components |
| Box2D | `Box2DBodyComponent.active`, `box2dBody.enabled/bodyType/shapeType/friction/restitution/density`, `angle` | Preserved with warning; physics schema/adapter migration is not claimed |
| Tilemap / TileSprite | `tilemapId`, `layerName`, `data`, `width`, `height`, `isFilled` | Preserved with warning; no Tilemap asset/importer contract migration |
| Text | `fontFamily`, `fontSize`, `wordWrapWidth`, `wordWrapUseAdvanced`, `lineSpacing`, `stroke`, `strokeThickness`, `paddingLeft/Top/Right/Bottom`, `backgroundColor` | Preserved with warning; only common Transform is normalized |
| User Components | `components[]`, `ComponentName.property`, `.components` manifest declarations and `generateAwakeEvent` | Converted to Core instances only with explicit stable `typeId`, schema version and independent stable instance ID mappings. Without them, original declarations/properties remain in `legacySource`; `.components` definitions remain source metadata |
| Scene / Prefab lists | document `lists[]`, Node `list[]` | Node `list[]` maps to ordered `children[]`; document-level list/reference semantics remain in extension payload with warning |
| Prefab inheritance/overrides | `prefabId`, `unlock[]`, `nestedPrefabs[]`, `prefabProperties[]` | Stable prefab link and explicitly supplied root/property mappings may be converted; nested override propagation, unlock policy and exposed-property schema remain compatibility payload (COD-8) |

### What the 27-file test does and does not prove

The automated test migrates every listed legacy Scene or one-root Prefab fixture using the public converter. It asserts document identity, top-level root count, the exact original document payload, each Node's exact legacy source payload, recursive `list[]`/children cardinality and Prefab exposed-property payload. It also confirms that all legacy `.components` definitions remain inspectable with their Awake metadata.

This proves loss-avoidance for the checked-in test-project JSON payload and a conservative structural conversion. It does **not** prove semantic conversion or runtime parity for renderers, Text, FX, Arcade/Matter/Box2D, Tilemap/Tiled, Collider, Awake callbacks, importer/reimport, Prefab nested override propagation, or actual user projects. Those fields are intentionally reported as preserved-only until their owning versioned contracts and runtime/editor integrations exist. COD-17 therefore remains an active inventory task for importer/reimport and file/API boundaries; COD-25 remains open for the semantic mappings and broader project compatibility gates.
