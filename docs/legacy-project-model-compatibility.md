# Совместимость Project Model с legacy Project / Scene / Prefab

**Статус:** реализация COD-25 находится в отдельной feature-ветке PR #48 от актуального dev. Последний полный CI Fast run #751 (`42062632448`) завершился success на точном HEAD `341109e559c5a860274d0a8f054a461cff4e2769`: `fast-checks` и `editor-host` успешны; Core tests 79/79, root tests 188/188, localization 81/81, MCP 8/8. PR открыт для review; merge ещё не выполнен, поэтому изменение пока не является частью dev.  
**Проверенная база:** dev / d8496b06085f3d90db45acbd0bb8343dc9c111fd (2026-11-05).  
**Источники legacy evidence:** [inventory COD-17](legacy-project-asset-importer-inventory.md), 27 checked-in .scene fixtures, две .components definitions и Asset Pack v2 fixture.

## 1. Граница совместимости

Миграция — opt-in преобразование JSON в памяти. Она не открывает файлы через FileStorage, не записывает результат обратно, не меняет пользовательский проект и не запускает код из документа. Вызывающая сторона отвечает за выбор источника, явное сопоставление компонентов и Prefab references и последующее сохранение результата после проверки пользователем.

Совместимость данных не означает функциональную или визуальную эквивалентность старой игры. Переводится только семантика, которая однозначно укладывается в текущий host-neutral контракт. Renderer/object type, FX, physics, Tilemap, Text, compiler metadata, custom fields и иные legacy payload не получают выдуманного runtime поведения.

Нормативные контракты Project Model v1 не расширяются этой миграцией:

- ComponentModuleReference остаётся { typeId, moduleAssetId, version };
- не добавляются moduleId, exportName, exports[] или module-level schemaVersion;
- у NodeDocument не появляется отдельный Node-level Asset Reference список;
- Asset identity остаётся в ProjectDocumentV1.assets[].id; Component Asset properties ссылаются на неё через { assetId, subResourceId? };
- ID проекта, сцены, узла, типа/экземпляра компонента и Project Prefab reference не выводятся из имени, пути, позиции элемента или renderer class.

## 2. Project v0 → v1

migrateProjectDocument(input) является единственной envelope migration для Project:

| Вход | Правило |
|---|---|
| schemaVersion: 0 | Мигрируется в Project v1 после проверки и валидации. |
| Отсутствующие scenes, assets, prefabs, componentModules | Получают пустые массивы как определённые v0 defaults. |
| Отсутствующий runtime | Получает { adapterId: "phaser", settings: {} }. |
| Присутствующий массив не-массив | Ошибка PROJECT_MIGRATION_INVALID_INPUT; исходное значение не затирается пустым массивом. |
| Присутствующий runtime не-объект, без строкового adapterId, либо с не-объектным settings | Ошибка PROJECT_MIGRATION_INVALID_INPUT; default не подставляется поверх повреждённого поля. |
| schemaVersion: 1 | Валидируется и возвращается изолированная копия документа. |
| Неизвестная/будущая версия | Ошибка PROJECT_UNSUPPORTED_VERSION; автоматического downgrade нет. |

JSON-совместимые extension fields сохраняются. Результат не разделяет вложенные mutable объекты с аргументом. Ошибки возвращаются через ProjectMigrationError.diagnostics. Функция не меняет файл и не вызывает I/O.

## 3. Legacy Scene → Scene v1

В legacy .scene версия сериализации находится в meta.version (fixtures показывают версии 2, 3, 5 и отсутствие поля). Это не schemaVersion Project Model. Legacy документ распознаётся по sceneType: "SCENE"; исходная версия возвращается как sourceVersion, а исходный JSON сохраняется. Наличие meta.version сопровождается warning: converter фиксирует историческую версию, но не исполняет старые Colibri SceneDataMigrationExtension цепочки.

| Legacy field | Scene v1 mapping |
|---|---|
| id | Тот же stable Scene ID. Если ID отсутствует/невалиден — ошибка, не генерация нового ID. |
| settings.sceneKey / name | Название Scene (fallback — существующий ID). |
| displayList[] | Упорядоченные rootNodes[]; если поле отсутствует — пустой Scene; если присутствует не как массив — blocking PROJECT_MIGRATION_INVALID_INPUT. |
| Node list[] | Упорядоченные children[]; hierarchy не flatten-ится. Отсутствующее поле означает отсутствие children; присутствующее не-массивом — blocking error, чтобы не выдать частичное дерево. |
| components[] | Отсутствующее поле означает отсутствие Component instances; присутствующее не-массивом — blocking error. Имена классов без явного mapping остаются в legacySource с warning. | |
| label / name | Node name (fallback — существующий Node ID). |
| active | Node active; при отсутствующем значении используется v1 default true, некорректное присутствующее значение сопровождается warning. |
| x/y/rotation/scaleX/scaleY/originX/originY | TransformData; finite numbers переносятся. Некорректные значения default-ятся по v1 Transform с diagnostic. |
| components[] и ClassName.property | Component instances только при наличии явных type/schema и instance ID mappings (см. §5). |
| prefabId | Prefab instance только при явном сопоставлении с Project Prefab ID, root Node ID и набором разрешённых override properties (см. §6). |
| plainObjects[], lists[], codeSnippets, meta, texture, type, compiler/FX/physics/Tilemap/Text payload и неизвестные поля | Не превращаются в игровые Nodes/Assets/Components автоматически; остаются в legacySource и сопровождаются diagnostics там, где значение не представлено контрактом. |

**plainObjects не добавляются в rootNodes.** В legacy сериализации это отдельная коллекция serializable non-GameObject objects; преобразование её элементов в Node без отдельного типа означало бы изменение модели данных. Аналогично legacy texture key не является Project Asset ID, а Node v1 не имеет самостоятельного Asset-reference поля. До появления утверждённого mapping/contract эти данные сохраняются, а не угадываются.

Полный исходный legacy JSON хранится ровно один раз на уровне Scene/Prefab документа в legacySource. Мигрированный Node содержит только legacySourcePath (например, displayList[0].list[1]), legacyCollection и, при необходимости, legacyComponents; дочерний list не копируется в payload каждого предка. Исходные Prefab declarations доступны в legacySource.prefabProperties. Такое представление сохраняет данные и ограничивает дополнительный объём path/metadata.

## 4. Legacy Prefab → Prefab v1

Legacy Prefab — тот же .scene envelope с sceneType: "PREFAB".

- Сохраняется существующий Prefab document ID.
- Требуется ровно один объект в displayList. Ноль или несколько корневых объектов завершаются диагностируемой ошибкой: миграция не создаёт дополнительный grouping Node и не меняет hierarchy.
- list[] преобразуется в children по тем же правилам, что и у Scene.
- prefabProperties, unlock, nestedPrefabs и исходный документ сохраняются. Их декларации, nested propagation и overrides не реализуются этим конвертером.
- Вложенный prefabId становится v1 prefabInstance только через явный mapping; иначе исходная ссылка сохраняется и диагностируется.

## 5. User Components: только явная идентичность

TypeScript API экспортирует LegacyMigratedNodeDocument, LegacyMigratedSceneDocument и LegacyMigratedPrefabDocument. Явные legacy-only функции возвращают LegacyMigrationResult с этими типами; nested children тоже типизированы как LegacyMigratedNodeDocument. Полный legacySource доступен на уровне Scene/Prefab документа; Node предоставляет legacySourcePath, legacyCollection и legacyComponents без дублирования дерева. Prefab declarations читаются из document.legacySource.prefabProperties. Универсальные migrateSceneDocument / migratePrefabDocument принимают как текущие v1 документы, так и legacy envelope; sourceVersion различает cge-scene-v1 / cge-prefab-v1 и исходные legacy версии.

LegacySceneMigrationOptions.componentTypes задаёт legacy class name → typeId + schemaVersion. Это не module manifest и не способ загрузки TypeScript source.

componentInstanceIds задаёт отдельный stable ID для каждого attachment по ключу:

    legacyComponentInstanceKey(nodeId, legacyComponentName)

Если отсутствует type mapping или instance ID, компонент не создаётся. Его class reference и namespaced values остаются в legacySource; diagnostic имеет code PROJECT_LEGACY_COMPONENT_PRESERVED. ID не генерируется из имени класса/узла или индекса массива. Пустой или некорректный переданный instance ID отклоняется как ошибка, а не трактуется как отсутствие mapping.

Component mapping — это запрос на конвертацию, а не регистрация нового типа. Если для Node предоставлены одновременно type mapping и instance ID mapping, validationContext обязателен: registeredComponentTypes должен содержать typeId, а componentSchemas — schema с тем же typeId и schemaVersion. Отсутствие registry или schema, а также несовпадение версии завершаются blocking diagnostic; мигратор не создаёт непроверенный ComponentInstance. Доступная schema проверяет mapped properties и применяет persisted/default semantics. Неразмеченные legacy Components остаются в исходном document. Выполнение старого класса, генерация нового файла и module resolution не входят в миграцию.

## 6. Prefab и resource mappings

prefabReferences сопоставляет legacy Prefab document ID с текущим Project Prefab reference ID, root Node ID и белым списком имён properties, которые разрешено превратить в overrides. Это не автоматическое равенство между legacy document ID, Project Asset ID и Prefab reference ID. Для mapped Prefab обязателен полный документ в validationContext.prefabs: только он позволяет проверить, что rootNodeId совпадает со stable ID фактического корня. Одного validationContext.prefabIds недостаточно и такой mapping отклоняется с PROJECT_INVALID_REFERENCE.

В текущей v1 Node contract нет поля для произвольных asset references. Поэтому legacy texture/atlas/frame keys не превращаются в Node Asset refs. Перенос Asset references возможен только через существующий Project AssetReference и соответствующее typed Component property либо после отдельного утверждения расширения контракта. Asset Pack v2 и importer metadata инвентаризированы в COD-17, но импорт/reimport не запускается этим API.

## 7. Diagnostics и сохранение исходных данных

Основные migration diagnostics:

| Code | Назначение |
|---|---|
| PROJECT_MIGRATION_INVALID_INPUT | Невалидный envelope, отсутствие stable identity, неоднозначная Prefab hierarchy или некорректный explicit mapping. |
| PROJECT_UNKNOWN_FIELD_PRESERVED | Неизвестное JSON-compatible поле Project/Scene/Prefab/Node/Transform/Asset/Component envelope сохранено с точным path; unknown Component property uses COMPONENT_UNKNOWN_PROPERTY. |
| PROJECT_UNSUPPORTED_VERSION | Неизвестная/будущая версия или попытка передать versioned документ в legacy-only entry point. |
| PROJECT_LEGACY_FIELD_PRESERVED | Legacy поле не имеет утверждённого эквивалента и сохранено. |
| PROJECT_LEGACY_TRANSFORM_DEFAULTED | Повреждённый Transform value заменён безопасным v1 default; original value остаётся в source. |
| PROJECT_LEGACY_COMPONENT_PRESERVED | Нет однозначного type/schema/instance mapping. |
| PROJECT_LEGACY_ASSET_REFERENCE_PRESERVED | Legacy resource key не является стабильной Asset reference. |
| PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED | Нет явной Prefab mapping либо нужны отдельные nested/override semantics. |

Миграция не считает warning успехом полной функциональной совместимости. Вызывающая сторона должна показать diagnostics пользователю и сохранить исходный файл, пока пользователь не подтвердит новый документ.

## 8. Automated evidence and limitations

Core tests exercise all 27 .scene fixtures from the COD-17 inventory (17 SCENE + 10 PREFAB), both .components definitions and the Asset Pack v2 fixture. Regression coverage includes stable IDs, explicit component/instance mappings, Prefab target mappings, invalid transforms, unknown component/texture/prefab payload preservation, hierarchy retention, multiple-root Prefab rejection, deterministic v1 save/reopen and migration idempotency.

Это подтверждает преобразование checked-in test workspace, а не всех пользовательских проектов. Не утверждаются:

- миграция произвольных .scene документов, которых нет в выбранном inventory;
- применение всех исторических Colibri SceneDataMigrationExtension перед переводом (legacy meta.version сохраняется и отражается в sourceVersion);
- равенство старого renderer/codegen/runtime поведения и нового Core;
- импорт/reimport Asset Pack, image/audio codec support или browser/GPU acceptance;
- полная семантика Prefab overrides/nested Prefabs (COD-8);
- Scene Loader, Project module resolver, Phaser adapter, Preview Host или standalone HTML5 build;
- автоматическая запись мигрированного файла или destructive project-wide rewrite.

Выполнение этих сценариев требует отдельных owner tasks и browser/runtime acceptance. Текущий converter — безопасная граница для дальнейшей явной интеграции, а не заменитель этих подсистем.


Для текущих Project/Scene/Prefab v1 validators unknown JSON-compatible envelope fields не отбрасываются: они сохраняются в результате и возвращаются как warning `PROJECT_UNKNOWN_FIELD_PRESERVED` с точным path. Component properties, не описанные schema, отдельно сохраняются с `COMPONENT_UNKNOWN_PROPERTY`. JSON boundary отвергает accessors/getters, custom prototypes, symbols, sparse arrays и cyclic object graphs до обхода полей; getters не исполняются. Future Project/Scene/Prefab versions дают blocking `PROJECT_UNSUPPORTED_VERSION`.
