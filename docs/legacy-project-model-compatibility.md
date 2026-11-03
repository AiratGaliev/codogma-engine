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
| label / name / type | NodeDocument.name | Приоритет label → name → type → ID; оригинал остаётся в legacySource |
| list[] | NodeDocument.children[] | Рекурсивно мигрирует Container hierarchy и стабильные child IDs |
| x/y/rotation/scaleX/scaleY/originX/originY | NodeDocument.transform | Числовые конечные значения переносятся; Core defaults применяются к отсутствующим; неверные заданные значения дают warning и сохраняются в source |
| active | NodeDocument.active | Сохраняется при наличии; при отсутствии используется Core default true |
| components[] | NodeDocument.components[] | Только с внешним mapping legacy name → stable typeId + schemaVersion; неизвестные ссылки сохраняются и дают warning |
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
- Неизвестные Component types, неизвестные fields, несопоставленные texture keys, invalid transforms и nested Prefab payload выдаются как machine-readable warnings.
- Отсутствующие stable document/node IDs, несовместимый discriminator и Prefab с несколькими roots отклоняются как blocking diagnostics.
- Component IDs строятся детерминированно из уже существующего Node ID + legacy component name; runtime type ID всегда берётся из явного mapping.
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
