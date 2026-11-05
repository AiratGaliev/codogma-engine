# Acceptance slice: Project Model, User Components и TypeScript authoring

**Дата baseline:** 05.11.2026 (актуализация COD-23)  
**Связанные задачи:** COD-23, COD-24, COD-25, COD-26, COD-27, COD-28, COD-30, COD-35, COD-91, CODQA-21.  
**Область:** 2D, Web-first, SolidJS Editor Host + host-neutral Core.

## 1. Зачем зафиксирован slice

Первый end-to-end acceptance должен доказать не наличие отдельных панелей или классов, а единую цепочку данных:

`Project → versioned Scene → stable Node IDs / Transform → registered TypeScript component module → Component Schema → Inspector edit → validation → deterministic save/reopen → runtime adapter → Preview → standalone HTML5 build`.

Каждый переход использует явный контракт. Scene data не импортирует произвольные файлы, не угадывает module/class по имени сцены и не исполняет данные через `eval`. Type ID компонента и ID отдельного instance различаются. Для каждого persisted value остаётся один владелец истины.

**Acceptance boundary текущего PR:** реализованы и автоматизированы контрактные/Host slices до serialized authoring data и изолированного ComponentWorld. Phaser adapter, data-driven Scene Loader, Preview Host и standalone HTML5 production build этим изменением не объявляются готовыми.

## 2. Нормативные контракты

### Project Model v1

`ProjectDocumentV1` содержит стабильный project ID, имя, ссылки на Scenes/Assets/Prefabs, явный список component modules и runtime adapter configuration. Все ссылки разрешаются по ID, а не по порядку файлов или имени класса. Asset path — относительный путь внутри project root; абсолютные URL, traversal и некорректные сегменты не являются project asset paths. Текущий `ComponentModuleReference` в `ProjectDocumentV1` содержит только `typeId`, `moduleAssetId` и `version`. `schemaVersion` находится в экспортируемой Component Schema и в component instance. Manifest v1 пока не содержит отдельные `moduleId`, `exportName` или module-level `schemaVersion`; fixture фиксирует фактический contract COD-25/COD-91 и не добавляет поля самовольно.

### Scene / Node / Prefab v1

Scene хранится как versioned data: stable scene/node/component IDs, иерархия nodes, Transform, active state, component instances, prefab references/overrides и settings. Component instance содержит собственный ID, stable type ID, schema version, enabled flag и persisted properties.

### Component Schema v1

Schema задаёт типы `string`, `number`, `boolean`, `enum`, `asset`, `node`; ограничения, required/default values и storage semantics:

- `persisted` — единственные значения, записываемые в project data;
- `editorOnly` — метаданные редактора, не сериализуемые как runtime state;
- `runtime` — временное runtime state, не записываемое в authoring data.

Один Core validator применяется к schema registration, Inspector edits, Scene pre-save validation и сериализации. Diagnostics имеют machine-readable code, severity, property path, entity/component identity. Неизвестные JSON-compatible properties сохраняются с warning ради forward compatibility; некорректные значения не сериализуются.

Asset и node references используют стабильные IDs и проверяются через переданный validation context. Файловое имя/путь не служит идентичностью runtime type.

### Component lifecycle

`ComponentRegistry` принимает только явно зарегистрированные definitions. `ComponentWorld.update(deltaSeconds)` вызывается внешним владельцем tick; Core не создаёт свой `requestAnimationFrame`. Lifecycle: create → enable → start → update → disable → destroy; структурные attach/detach mutations, запрошенные как внутри update, так и из lifecycle callbacks вне tick, фиксируются на границе текущей операции. Во время dispose новые mutations отклоняются до завершения cleanup; повторный вход и orphan instances не допускаются. Registry сохраняет неизменяемый snapshot schema, а queued attach фиксирует properties на момент запроса. Disposal освобождает component/system state.

## 3. Host authoring workflow

Текущая SolidJS реализация сохраняет существующие `.scene` и `.components` форматы:

1. Project Browser открывает `.components` metadata и TypeScript `.ts/.tsx` source.
2. User Component definition отображает attached component в Inspector; поля Number/String/Boolean/Enum выбираются из Core Schema adapter.
3. Изменение persisted property проходит schema validation перед созданием Scene history entry; Save Scene выполняет повторную проверку всех доступных registered definitions.
4. Неизвестные legacy component references и namespaced fields сохраняются, не удаляются молча.
5. TypeScript source редактируется в центральном Source view и сохраняется существующим project-file API. Для нового definition можно создать adjacent `.ts` file.
6. Source view использует закреплённый TypeScript compiler для syntax/emit diagnostics с line/column. Это **не** semantic project typecheck и не разрешение импортов всего проекта; за это отвечает project `tsc` build.

Compatibility adapter формирует временный `legacy.user-component:<class-name>` schema ID исключительно для старого `.components` Inspector workflow. Это **не** public runtime type ID, не ComponentRegistry registration и не module manifest.

## 4. Automated evidence

Core package: `packages/cge/`.

- Project v1 required envelope, stable references, duplicate IDs, safe asset paths, optional sub-resource ID validation и unknown JSON data.
- In-memory Project v0 → v1 migration; исходный файл автоматически не переписывается.
- Deterministic serialization/round-trip и parse/unsupported-version diagnostics.
- Scene duplicate node/component IDs и finite Transform checks.
- Defaults, required values, enum/numeric constraints, discriminator-specific schema metadata, non-JSON value rejection, asset/node reference validation и точные property diagnostics. `serializeComponentProperties()` покрывает persisted/editorOnly/runtime filtering и сохранение unknown JSON fields. Но интеграция этого нормализованного результата в Scene serializer в текущем `dev` неполна: `validateSceneDocument()` добавляет diagnostics, но возвращает исходный `input`; `serializeSceneDocument()` поэтому может сохранить editorOnly/runtime properties. Это открытый contract gap COD-27, а не пройденная acceptance.
- Registry duplicate protection/immutable schema snapshot; explicit-tick lifecycle, component-before-system update ordering, system removal/reverse-order disposal, deferred structural mutations at operation boundaries, disposal reentrancy protection, attach input snapshots, scene world disposal и invalid delta rejection.

SolidJS Host:

- Legacy `.components` → Core schema adapter, default initialization, enum/numeric Inspector validation, validation of definition/property edits, safe special property names и unknown namespaced field preservation.
- TypeScript single-file syntax diagnostics с line/column.
- Browser regression scenarios проверяют enum attach/detach/edit/save/reopen и TypeScript source open/edit/save/reopen; они запускаются как часть независимой acceptance на promotion candidate по CODQA-21.

## 5. Product UX reference: adopt / adapt / reject

**Unity 6.6 (6000.6), основной 2D UX reference.** Script Component является отдельным script asset: его можно прикрепить к GameObject, а параметры видны в Inspector. Unity Script asset Inspector показывает информацию о файле/preview и предоставляет переход Open; редактирование выполняется в script editor, а не в Inspector. Сохраняем separation между source asset и component instance; адаптируем переход к source в центральный Source view SolidJS Host. Не копируем Unity `MonoBehaviour`, C# serialization semantics или Unity-specific lifecycle. На проверенной странице Unity Manual 6000.6 указано состояние Alpha, поэтому её используем только как UX reference, а не как stable API baseline:
- [Create components with scripts](https://docs.unity.cn/6000.6/Documentation/Manual/CreatingComponents.html)
- [Inspector items](https://docs.unity.com/en-us/engine/6000.6/manual/unity-editor/editor-windows-views-reference/using-the-inspector/inspector-items)

**Cocos Creator 4.0 LTS, дополнительный TypeScript workflow reference.** TypeScript script создаётся как project asset, редактируется и сохраняется, затем добавляется к Scene Node через Add Component/Custom Component и отображается в Properties/Inspector. Это близкий workflow reference для asset → source → node component → Inspector:
- [Cocos Creator 4.0 scripting](https://docs.cocos.com/creator/4.0/manual/en/scripting/index.html)

**Adopt:** source script как project asset; отдельное действие Attach/Add Component; Inspector component block; typed/default property presentation; переход от component definition к source.

**Adapt:** используем существующий Project Browser, центральный Source tab, backend/file API и единый Core Component Schema. Существующий legacy `.components` формат остаётся совместимым до миграции data/runtime contracts. Не вводим editor dependency на Monaco/CodeMirror только ради первой стадии source authoring.

**Reject/defer:** не переносим Colibri registry/controls/lifecycle; не копируем Cocos `cc.Component` или Unity `MonoBehaviour`; не связываем runtime identity с именем source-файла; не считаем syntax-only diagnostics полной TypeScript project compilation.

## 6. Owner map, handoff contracts и acceptance по каждому переходу

Статусы ниже сверены с Linear на 05.11.2026 и кодом `dev` SHA `afa8a0ced826253b65aef8854089a564c05e76fe`. Статус owner issue не равен статусу проверки всей цепочки.

| Переход / owner | Вход → выход, контракт и diagnostics | Automated coverage / текущее доказательство | Functional acceptance: владелец и ожидаемый результат |
|---|---|---|---|
| Workspace → public Core package — [COD-24](https://linear.app/codogma-engine/issue/COD-24/sozdat-minimalnyj-workspace-i-paket-codogmacge) | Consumer импортирует только публичный `@codogma/cge` entry point; package exports не открывают private source modules. | `packages/cge/package.json`, `src/index.ts`; CI Fast package consumer smoke + `npm run quality:check`. Issue `Done`. | Отдельный browser workflow не требуется: package resolution и consumer smoke — автоматический критерий. |
| Project/Scene/Asset/module manifest → persisted documents — [COD-25](https://linear.app/codogma-engine/issue/COD-25/opredelit-serializuemuyu-project-model-i-versioned-schema) | `ProjectDocumentV1` / `SceneDocumentV1`, stable IDs, `AssetReference`, `ComponentModuleReference`, parse/serialize/migration. Ошибки версии, ссылок и IDs возвращаются как Core diagnostics. | `project-model.test.ts`, `acceptance-slice.test.ts`; Project/Scene fixture, JSON round-trip. COD-25 — `In Progress`: legacy Scene/Prefab migration и полная compatibility policy остаются отдельной работой. | [CODQA-18](https://linear.app/codogma-engine/issue/CODQA-18/provesti-nezavisimuyu-browser-acceptance-novogo-solidjs-editor-host) checks Scene open/edit/save/reopen on `test`. [CODQA-21](https://linear.app/codogma-engine/issue/CODQA-21/provesti-browser-acceptance-user-components-authoring-v-solidjs-editor) additionally checks manifest and component values in the integrated User Components flow. |
| User Component source + manifest → stable definition identity — [COD-91](https://linear.app/codogma-engine/issue/COD-91/zavershit-user-components-i-typescript-script-authoring-v-solidjs) | Project source asset and explicit manifest resolve a definition by stable `typeId`; source path/export/display name are locators, not runtime identity. Missing module/export, duplicate type and incompatible schema require distinct diagnostics. Current Host `.components` compatibility model is not equivalent to the new Project Model manifest. | `components-model.test.ts`, `typescript-diagnostics.test.ts`, `workbench.spec.ts` (legacy component attach/detach, Inspector enum round-trip, source open/edit/save/reopen). These tests do not prove new manifest registration or project-wide semantic TypeScript analysis. COD-91 — `In Progress`. | CODQA-21: create/import a source definition, verify identity survives source/class/display rename, attach to two Nodes, and observe diagnostics/recovery without executing source in the privileged Host. |
| Component Schema → validation/Inspector/save contract — [COD-27](https://linear.app/codogma-engine/issue/COD-27/svyazat-component-schemametadata-inspector-i-serializaciej) | `ComponentTypeSchemaV1`; `validateComponentTypeSchema`, `validateComponentProperties`, `serializeComponentProperties`. Diagnostics must be property-specific and include persisted path/component identity. Asset/Node values use project-local stable IDs. | `component-schema.test.ts`, `components-model.test.ts`, `acceptance-slice.test.ts`. Core helper filters non-persisted fields; integrated `validateSceneDocument → serializeSceneDocument` filtering is an identified gap (см. раздел 12). COD-27 — `In Progress`. | CODQA-21: typed Inspector values/defaults/required validation, Asset/Node reference selection, stale-reference diagnostics, Undo/Redo, save/reopen. Must use the same Core schema; browser check is not replaced by unit tests. |
| Registered definition → ComponentWorld lifecycle — [COD-26](https://linear.app/codogma-engine/issue/COD-26/realizovat-typescript-component-core-i-determinirovannyj-lifecycle) | `ComponentRegistry` accepts explicit `ComponentTypeDefinition`; `ComponentWorld` owns transient instances and receives external `update(deltaSeconds)`. Factory receives immutable per-instance properties. | `component-world.test.ts` and `acceptance-slice.test.ts` cover registry identity, lifecycle ordering, mutation boundaries, error-safe dispose and isolation across Nodes/worlds. COD-26 — `Done` for host-neutral primitives, not loaded Scene hydration or Phaser integration. | CODQA-21: after Loader/Preview exist, attach the same definition to two loaded Nodes and confirm unique instance IDs, independent state, lifecycle and cleanup. A hand-built World is not evidence of Loader integration. |
| SceneDocument → runtime graph — [COD-103](https://linear.app/codogma-engine/issue/COD-103/realizovat-data-driven-scene-loader-dlya-project-model-v1) | Validated/migrated Scene + trusted definitions/resolvers → runtime Node hierarchy and ComponentWorld. Loader owns deterministic hydration, stable ID mapping, references, diagnostics and atomic rollback. API is not implemented in current `dev`; do not invent a callable name in this contract. | Required future unit/integration tests consume this exact project fixture, never hand-construct the World as a substitute. Cover successful graph, missing module/asset/node, duplicate IDs, invalid schema/version, two-instance isolation, partial-load failure and unload. Not implemented. | CODQA-21: load `Level` from Project Model, verify two persisted Nodes/instances and cross-node references, then force failure and confirm complete rollback/cleanup. |
| Runtime graph → Phaser views — [COD-28](https://linear.app/codogma-engine/issue/COD-28/realizovat-minimalny-phaser-runtime-adapter) | Loaded Core graph → Phaser display objects with explicit one-owner Transform mapping, stable node/component identity and adapter-owned cleanup. | Future adapter integration tests on pinned Phaser; fixture must come from COD-103. Cover transforms, two independent views, repeated update/resize, scene unload and adapter failure cleanup. Not implemented. | CODQA-21: both Nodes render from loaded SceneDocument, transform updates do not drift, and shutdown removes each view/listener once. |
| Active scene / async transition / cancellation — [COD-29](https://linear.app/codogma-engine/issue/COD-29/utverdit-minimalnye-kontrakty-input-timetween-i-scene-manager) | Scene Manager orchestrates loader/provider, transition policy, cancellation and disposal; it does not create the graph or depend on Editor UI/filesystem. | Future state-machine tests use a fake loader for manager behavior only; loader integration tests belong to COD-103. Cover cancellation before/during/after load, repeated switch and rollback. Not implemented. | CODQA-15 checks Preview scene lifecycle, focus/visibility, restart/stop and absence of orphan resources on the integrated candidate. |
| Runtime snapshot → Preview session — [COD-30](https://linear.app/codogma-engine/issue/COD-30/realizovat-browser-first-game-preview-host) | Immutable Project snapshot + target Scene + allowlisted module/asset providers → one browser-owned session/game loop; Play/Pause/Resume/Restart/Stop/resize have explicit transitions and session-scoped diagnostics. | Future API/integration tests cover idempotency, startup failure, stale events, restart isolation and resource cleanup. Not implemented; current Game View iframe is not this Host. | [CODQA-15](https://linear.app/codogma-engine/issue/CODQA-15/provesti-browser-acceptance-preview-host-lifecycle): real browser Play/Pause/Resume/Restart/Stop, resize, focus/visibility, reload and repeated cleanup. CODQA-21 adds User Component runtime behavior. |
| Preview runtime entity → persisted project selection/live Inspector — [COD-31](https://linear.app/codogma-engine/issue/COD-31/svyazat-runtime-identity-s-project-model-i-live-inspector) | Mapping includes project, scene-load/session, persisted Node ID and component instance ID; runtime type ID is never used as instance identity. Live values are transient and do not silently mutate Project Model. | Future tests cover mapping collisions, duplicate instances, restart/stale events, persisted-vs-runtime values, selection sync and subscription cleanup. Not implemented. | CODQA-21: select a live entity, navigate to its authoring Node/Component, distinguish live from persisted values, stop session and verify stale selection/events disappear. |
| Project validation/resource graph → build preflight — [COD-33](https://linear.app/codogma-engine/issue/COD-33/realizovat-project-validation-i-resource-dependency-graph) | Project/Scene/module/asset references → machine-readable validation and dependency graph with source paths and bundle composition evidence. | Future positive/negative fixture tests cover missing assets/modules, unresolved imports, conflicting IDs, unused resources and diagnostics. Not implemented. | Verify diagnostics and dependency report on the integrated build candidate; no separate Editor/Core build can satisfy this. |
| Feature providers → selected game composition — [COD-34](https://linear.app/codogma-engine/issue/COD-34/sproektirovat-featurecapability-registry-i-vybor-funkcij-dlya-sborki) | Feature Registry resolves provider, target, requirements/conflicts and required/optional/default policy into an explicit build composition. | Future fixture tests cover missing/incompatible providers, conflicts, inclusion/exclusion and output-level absence for disabled/editor-only code. Not implemented. | Candidate Release acceptance verifies selected features and physical artifact composition; a UI checkbox alone is not evidence of code exclusion. |
| Build composition → standalone HTML5 artifact — [COD-35](https://linear.app/codogma-engine/issue/COD-35/poluchit-vosproizvodimuyu-nezavisimuyu-html5-production-build) | Clean Project Model input → independent artifact with manifest/hash, resolved resources, pinned runtime and deterministic composition; no Editor server/source view dependency. | Future clean-build CI compares normalized file list/content hashes, bundle sizes and bare-browser requests. Not implemented. `npm run build` in root, Editor or Core is not game production build. | Candidate-specific Release acceptance on `test` verifies bare-browser load, resource paths/MIME/CORS assumptions, no dev-server requests and reproducibility evidence. CODQA-21 checks this only when the game artifact is included; CODQA-9 is codegen/asset-preview acceptance, not standalone build acceptance. |

**Cross-cutting ownership:** COD-17 owns legacy-format/importer compatibility inventory; COD-8 owns nested Prefab/override semantics. Neither replaces COD-25's Project Model schema/migrations. Optional `@codogma/ecs` / `@codogma/ecs-phaser` (COD-111/112) is not a prerequisite for this baseline object/component slice and is excluded from every acceptance gate here.

## 7. Definition of end-to-end acceptance

Полный slice принимается только после того, как один независимый TypeScript component module:
1. внесён в явный project module manifest с stable type ID;
2. проходит project semantic typecheck и schema validation;
3. назначается как отдельный component instance на два разных stable node IDs;
4. переживает сохранение/закрытие/повторное открытие проекта без изменения значений и unknown fields;
5. загружается data-driven loader без generated TS class для Scene;
6. получает детерминированный lifecycle через Phaser-controlled tick, а не отдельный Core loop;
7. корректно запускается/останавливается в Preview с проверяемой очисткой;
8. попадает в reproducible standalone HTML5 build с проверенными asset/module references.

Пункты 5–8 нельзя считать закрытыми по результатам unit tests Core или Host typecheck. Для них нужны отдельные integration/browser/runtime/build evidence и соответствующие owner issues.


## 8. Проверяемый Project Model acceptance fixture

Полноценный для Core-контрактов минимальный project fixture находится в `packages/cge/tests/fixtures/acceptance-project/`. Его `project.json` — корневой Project Model v1 document; все asset paths разрешаются относительно этой директории:

- `project.json` содержит Scene, script и image Asset references, runtime config, явный `componentModules` entry и unknown JSON-compatible plugin data.
- `scenes/Level.cge-scene.json` содержит два Nodes с разными stable IDs (`node-player` и `node-enemy`), по одному Component instance одного `typeId` на каждом Node, разные instance IDs, общий image Asset reference и взаимные Node references.
- `src/FollowTarget.ts` экспортирует для Core явный `ComponentTypeDefinition` contract: stable `typeId`, `schemaVersion`, definition/module version и factory. Имя файла/экспорта/display name не является runtime identity. Тест импортирует definition и регистрирует её в `ComponentRegistry`; это не доказывает runtime module resolution или исполнение внутри Preview.
- `assets/player.svg` — реальный локальный image asset. Test проверяет, что каждый путь из Project manifest существует и остаётся внутри fixture root.
- Fixture schema объявляет `persisted`, `editorOnly` и `runtime` свойства, чтобы property serializer contract проверялся на одном реальном definition.
- `packages/cge/tests/fixtures/acceptance-negative-cases.json` содержит отрицательные входы. Ожидаемые diagnostics перечислены в `12.

Automated Core evidence: `packages/cge/tests/acceptance-slice.test.ts` проверяет Project/Scene parsing, manifest→definition identity, registry registration, два независимых factory state, positive asset/node references, Project/Scene round-trip и unknown fields, property-level persisted filtering и negative diagnostics. `packages/cge/tests/component-world.test.ts` независимо покрывает lifecycle/instance isolation на ручных Core Nodes.

**Граница:** acceptance test всё ещё не гидратирует `SceneDocument` в `ComponentWorld`. Сейчас нет Scene Loader API; такое доказательство появится в COD-103. Запрещено создавать ручные Nodes для unit-теста и выдавать их за загрузку этой fixture.

## 9. Component Core public contract и isolation guarantees

Публичная поверхность Core экспортируется через `packages/cge/src/index.ts`. Component definition содержит versioned schema и factory; factory получает отдельный immutable JSON snapshot для каждого instance. Factory должна быть side-effect-free: внешние ресурсы приобретаются в `onCreate`, чтобы returned behavior участвовал в disable/destroy cleanup. Ошибка factory не регистрирует частичный instance.

`ComponentRegistry.unregister(typeId)` удаляет definition только для будущих attach/resolve операций. Уже созданные ComponentWorld instances удерживают зарегистрированную definition snapshot до собственного teardown. Повторная регистрация того же type ID разрешена после unregister; она не подменяет definition уже существующих instances.

Versioning policy для текущего контракта:
- `typeId` — постоянная identity типа, не имя файла/класса и не отображаемый label.
- `schemaVersion` — версия структуры/семантики schema contract; несовместимое изменение требует новой schema version и явного migration/diagnostic path.
- `version` — версия конкретной component definition/implementation; обновление реализации не меняет identity типа.
- Component instance ID независим от type ID и локален в пределах Project/Scene owner.
- ComponentWorld не создаёт ticker: внешний runtime adapter управляет update(deltaSeconds) и временем жизни World.

Проверки изоляции, unregister/re-register и factory failure добавлены в `packages/cge/tests/component-world.test.ts`. Они не заменяют Phaser tick integration, Scene Loader hydration или отдельную runtime acceptance.


## 10. ComponentWorld performance baseline

CI Fast runs `npm run benchmark` from `packages/cge/` after the strict typecheck/build/test suite. The benchmark warms up the runtime and measures representative worlds with 100, 1,000 and 10,000 Nodes/components:

- construction: stable Node creation and explicit ComponentRegistry attach;
- update: 25 explicit `ComponentWorld.update(1 / 60)` ticks;
- teardown: `ComponentWorld.dispose()` including component cleanup;
- throughput: component updates per second and average update tick duration.

The benchmark records Node.js version, OS/architecture and raw durations in the Actions log. It intentionally has no absolute pass/fail latency threshold: shared GitHub runners are noisy, so the measurement is evidence for comparisons on the same runner/runtime, not a cross-machine performance claim. Changes to internal storage/scheduler must preserve functional tests and compare this baseline before claiming an optimization.

ADR-0004 supersedes the earlier deferral wording: Data-Oriented ECS is an approved optional package direction, but it is not part of this Core acceptance slice and is not implemented by COD-26/PR #43. The current benchmark measures only the object-component ComponentWorld; it is not ECS performance evidence. EVA.js remains an architecture/package reference, not a runtime dependency.

## 11. Граница optional Data-Oriented ECS

Этот acceptance slice остаётся независимым от optional ECS. Он должен завершить базовый host-neutral object/component путь и не блокируется реализацией Data-Oriented storage.

- `@codogma/cge` / `ComponentWorld` — object/component Core для Project Model, Component Schema, Inspector, lifecycle и базовых пользовательских компонентов.
- `@codogma/ecs` (COD-111) — отдельный optional runtime package для Data-Oriented storage, Queries и Systems. Он не является зависимостью Core, не входит в обязательный acceptance первого Project Model/Preview/Build пути и не должен появляться в consumer project автоматически.
- `@codogma/ecs-phaser` (COD-112) — отдельный optional Phaser adapter. Базовый `@codogma/runtime-phaser` остаётся независимым от ECS.
- Persisted Component Schema / Inspector metadata описывает authoring data; ECS component storage описывает runtime memory layout. Между ними нужен явный mapping/serializer contract, а не автоматическое отождествление.
- Project Model Node IDs и ECS runtime Entity handles различны. Их mapping привязан к scene/runtime session и имеет явный lifecycle. Каждый mutable runtime value должен иметь одного owner.
- ECS не создаёт второй Game/Scene/Ticker/requestAnimationFrame. Любая интеграция использует внешний host tick и документированные phases.
- Отсутствие ECS в project dependencies должно физически исключать ECS packages/modules из production game artifact. Это проверяется отдельными consumer/build fixtures и не подменяется feature checkbox.

Для COD-26 benchmark остаётся базовой регрессией object-component ComponentWorld. Он не задаёт порог 10 000 entities, 1.67 ms или любой другой универсальный критерий запуска ECS. Data-Oriented ECS сравнивается в отдельном browser/device workload по ADR-0004 и [performance baseline](performance-baseline.md): object-component, centralized object systems, ECS storage и ECS+Phaser adapter, с frame/system CPU, p50/p95/p99, allocations/GC и heap metrics.


## 12. Negative fixture matrix и известные интеграционные пробелы

### Negative fixtures и ожидаемые diagnostics

`acceptance-negative-cases.json` задаёт следующие входы; тесты должны проверять точный класс ошибки, а не просто факт отказа:

| Случай | Ожидаемый результат |
|---|---|
| Unknown component `typeId` | `COMPONENT_UNKNOWN_TYPE` |
| Component type отсутствует в project module manifest, хотя source Asset остаётся в Project | `COMPONENT_UNKNOWN_TYPE` при Scene validation; Project envelope сам по себе остаётся валидным |
| Module manifest ссылается на отсутствующий script Asset | `PROJECT_INVALID_REFERENCE` |
| Неизвестный Asset ID или Node ID в Component property | `COMPONENT_INVALID_REFERENCE` |
| Повторный Node ID | `SCENE_DUPLICATE_ID` |
| Повторный component instance ID | `COMPONENT_DUPLICATE_INSTANCE` |
| Противоречивые schema constraints (`min > max`) | `COMPONENT_INVALID_SCHEMA` |
| Значение `speed < min` | `COMPONENT_INVALID_VALUE` с property-specific path |
| `schemaVersion` instance не совпадает с зарегистрированной schema version | `COMPONENT_INVALID_SCHEMA` |
| Неизвестная Project document version | `PROJECT_UNSUPPORTED_VERSION`; исходник не переписывается |

### Подтверждённый storage/serialization gap — owner COD-27

В `component-schema.ts` helper `serializeComponentProperties()` вызывает общий validator и возвращает нормализованный JSON только с persisted полями, сохраняя неизвестные JSON-compatible extensions. Это подтверждается `component-schema.test.ts` и fixture-проверкой.

Однако текущий Project/Scene path не применяет это нормализованное значение:

1. `validateNode()` в `packages/cge/src/project-model/validation.ts` вызывает `validateComponentProperties()`, переносит diagnostics, но не заменяет `component.properties` на `result.value`.
2. `validateSceneDocument()` при успехе возвращает исходный `input` как `SceneDocumentV1`.
3. `serializeSceneDocument()` сериализует это значение после validation, поэтому `editorOnly` / `runtime` keys, включённые вызывающим кодом в Scene properties, могут попасть в JSON.

Следовательно, property-level serializer test **не является** доказательством полного Scene save/reopen invariant. Нужен integration regression test на `serializeSceneDocument → parseSceneDocument`, который подтверждает исключение `editorOnly/runtime` и сохранение persisted + unknown JSON-compatible properties. Владелец реализации и теста — COD-27; здесь этот дефект не скрывается и не исправляется обходным поведением fixture.

### Граница Project module manifest — owner COD-25 / COD-91

В текущем v1 `ComponentModuleReference` идентифицирует type через `typeId`, source через `moduleAssetId`, а implementation version — через `version`. Нет отдельного module ID/export name и manifest-level schema version. Fixture явно связывает текущие поля с экспортированной definition и component instance schema version; это проверяет существующий contract, но не заявляет, что полный module graph/module authoring уже реализован. Расширение формата принадлежит COD-25, authoring/resolution — COD-91/COD-103.

### Runtime/build gaps, которые fixture не маскирует

- Нет SceneDocument → ComponentWorld hydration/rollback: COD-103.
- Нет loaded graph → Phaser object mapping: COD-28.
- Нет полной Scene Manager orchestration/cancellation: COD-29.
- Нет browser Preview session contract: COD-30.
- Нет runtime identity/live selection mapping: COD-31.
- Нет Project build dependency validation, Feature Registry и standalone HTML5 artifact: COD-33/34/35.
- Текущий SolidJS Host browser coverage для `.components`, Inspector и source open/save не доказывает выполнение новой Project Model module manifest цепочки.
- CODQA-15, CODQA-18 и CODQA-21 остаются `Todo` до интегрированного `test` promotion candidate. Не запускать browser/runtime acceptance на topic PR и не переводить QA issues в работу только из-за этой fixture.

## 13. Reproduction и evidence rules

Из каталога `packages/cge/`:

```bash
npm ci
npm run quality:check
```

`quality:check` выполняет strict TypeScript проверки исходников/тестов, Core build и unit tests. В CI Fast для изменений `packages/cge/**` также запускается `npm run benchmark`; Markdown validator проверяет изменённые Markdown-файлы. Host browser E2E не является scoped check этой Core fixture задачи.

При отчёте различать:

- Core unit/contract tests — только соответствующие Core data/API guarantees;
- Host domain/browser tests — только реальные Host workflow, которые они запускают;
- Scene Loader/Phaser integration tests — только загруженный Project Model fixture, не ручной ComponentWorld;
- CODQA browser/runtime acceptance — только конкретный `test` SHA с environment/fixture/viewport/DPR/expected/actual/logs;
- standalone production build — отдельный game artifact и его composition/hash/bare-browser evidence. Editor/Core build не заменяет его.
