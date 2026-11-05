# ADR-0007: Нативный Project Model Codogma без совместимости с Colibri

**Статус:** принято  
**Дата:** 05.11.2026  
**Область:** Project Model, Core, Editor Host, Preview, Build, Script/Component authoring  
**Связанные документы:** [Техническое задание](../technical-specification.md), [ADR-0001](ADR-0001-core-architecture.md), [ADR-0005](ADR-0005-solidjs-editor-host.md), [Core acceptance slice](../core-component-acceptance-slice.md), [Editor reference standard](../editor-reference-standard.md).

## Контекст

Codogma Engine разрабатывается как самостоятельный 2D Web-first движок со своей моделью проекта, редактором, runtime API, компонентной системой и build pipeline. Старые форматы Colibri/Phaser Editor описывают другую архитектуру: .scene с sceneType, .components, legacy Asset Pack, renderer-specific object payload и per-scene code generation.

Инвентаризация старого репозитория полезна для понимания существующего кода и истории редакторских workflows. Она не создаёт продуктового обязательства поддерживать эти форматы. Наличие старых файлов и regression fixtures в tests/workspace/test-typescript не означает, что новый Codogma Core, SolidJS Host, Preview или Build должны их открывать.

Продуктовый reference — Unity 6.6: Scene является самостоятельным проектным asset; GameObjects/Nodes живут внутри Scene; Components прикрепляются к объектам; scripts являются отдельными project assets, а Prefabs — самостоятельными повторно используемыми asset templates. Codogma адаптирует эту организацию к TypeScript и Web-first архитектуре, не копируя Unity runtime, C# или serialization.

## Решение

### 1. Только нативный формат Codogma

1. Новый проект создаётся сразу в актуальном Codogma Project Model.
2. Project, Scene, Node, Component Definition/Instance, Prefab, Asset и Script имеют собственные versioned contracts и stable IDs.
3. Scene — самостоятельный сериализуемый документ и источник истины для иерархии, настроек, компонентов и связей. Scene не является TypeScript-классом.
4. Node — объект внутри Scene с Transform, состоянием и Component instances. Его runtime-представление создаётся Data-driven Scene Loader из проверенных данных.
5. Prefab — самостоятельный reusable asset с source hierarchy, stable identity, instances и явными overrides.
6. Script — отдельный source asset проекта. Он может объявлять одно или несколько явных Component definitions по утверждённому module contract. Script/definition/instance имеют независимые идентификаторы и жизненные циклы.

### 2. Именование и identity

- Имя Scene не определяет имя файла Script, имя класса или Component type.
- Не создаются обязательные Scene.ts, Level01.ts или иные companion-файлы с именем соответствующей Scene.
- Имя файла, export name, display label и путь — адресация/представление, но не runtime identity.
- typeId, instanceId, moduleAssetId, sceneId, nodeId, prefabId и assetId имеют отдельную семантику.
- Один Script/Component type может использоваться в разных Nodes и Scenes; каждый attachment получает независимый instanceId и persisted properties.
- Никаких поисков класса по имени Scene, имени файла, порядку элементов или эвристике пути.

### 3. Scene authoring и запуск

- Editor Scene View и Hierarchy редактируют один Scene document.
- Save/reopen сериализует и восстанавливает ту же versioned модель.
- Preview и production Build загружают Scene непосредственно из Project Model через общие validation, module resolution и loader contracts.
- Обязательная генерация per-scene TypeScript source запрещена. Генерация build artifacts допускается только как внутренняя деталь компиляции/упаковки всего Project Model и не создаёт второй редактируемый источник истины.
- Runtime objects, Preview state и Editor transient state не записываются как persisted Scene source.

### 4. Версионирование и миграции

- До первого публичного выпуска Project Model breaking changes допустимы; внутренние экспериментальные schema versions не создают обязательства поддерживать их.
- После выпуска сохраняются только миграции между реально опубликованными версиями собственного Codogma формата.
- Миграции собственных версий являются явными, детерминированными, проверяемыми и не переписывают файл при простом открытии.
- Неизвестная/будущая версия отклоняется с blocking diagnostic; downgrade и best-effort parsing запрещены.
- Unknown fields сохраняются только в пределах политики расширяемости текущей Codogma schema; произвольный legacy payload не переносится в документ ради round-trip со старым движком.

### 5. Явный отказ от legacy compatibility

Новый Core, SolidJS Host, Preview и Build **не поддерживают** импорт, открытие, запуск, сохранение или миграцию следующих форматов:

- Colibri/Phaser Editor .scene, включая sceneType, displayList, plainObjects, lists, meta.version и старые SceneDataMigrationExtension;
- Colibri .components definitions и class-name-based attachments;
- старый Colibri Prefab serialization, prefabId, unlock, nestedPrefabs и старые override payload;
- старый Asset Pack wire format и старые name/key-based resource references;
- старые generated Scene.ts / Level*.ts companion workflows и связанный runtime codegen.

Вход старого формата должен завершаться понятной диагностикой UNSUPPORTED_PROJECT_FORMAT/эквивалентом без изменения исходных файлов и без создания частичного Project. Не добавлять legacySource, legacy class mappings, permissive format sniffing или compatibility adapters в публичный Core API.

Это решение не запрещает отдельные внешние importers для общепринятых исходных media/content formats (PNG, SVG, audio, Tiled JSON и т. п.). Такие importer contracts разрабатываются как собственные Codogma pipelines с явной спецификацией; они не являются импортом старого Colibri project graph.

### 6. Граница временной Colibri UI migration

Пока SolidJS Host не прошёл production cutover и rollback window, source/editor может физически оставаться в репозитории как временный старый UI. Это исключительно engineering transition. Она не означает поддержку Colibri project files в новой модели, сохранение старых serializers/codegen как целевого контракта, перенос Colibri UI/registry/controls/lifecycle или право новых Host workflows зависеть от legacy project schema.

Colibri source можно изучать только как историческое evidence пользовательских действий и технических ограничений. Каждая новая возможность реализуется заново на нативных Codogma contracts и по принятым UX references. Legacy source, fixtures и importer inventory не являются спецификацией или acceptance baseline для нового Project Model.

## Последствия

**Положительные:** единый собственный формат; ясные source-of-truth boundaries; отсутствие name-based binding; меньше ветвлений и неисполняемого compatibility payload в Core; Scene, Script и Prefab становятся отдельными понятными сущностями; новые проекты не зависят от исторических Colibri решений.

**Издержки:** текущий @codogma/cge и SolidJS Host содержат уже добавленные compatibility paths; они подлежат удалению отдельной инженерной задачей. SolidJS Host должен перейти на новый Project Model как единственный authoring format. Legacy Colibri UI можно удалить только через предусмотренный cutover/rollback workflow — это не основание сохранять старые project formats.

## Критерии соответствия

- Чистый проект создаётся в нативном Project Model и открывается только новым Host.
- Scene создаётся/переименовывается/сохраняется без создания или переименования TS-файла.
- Script Asset и Component Definition подключаются к любому числу Nodes/Scenes через stable IDs.
- Изменение display/file/class name не меняет runtime identity.
- Prefab является отдельным asset и поддерживает собственные instance/override semantics.
- Preview/Build используют Scene data + явные modules; per-scene generated source не требуется.
- Старые Colibri fixtures не входят в Core/Host acceptance suite и не используются как conversion tests.
- Открытие старого Colibri project заканчивается blocking diagnostic и не мутирует input.
- Миграционные tests покрывают только выпущенные версии собственного Codogma schema.

## Официальные продуктовые references

- [Unity 6.6 — Key concepts](https://docs.unity.com/en-us/engine/6000.6/manual/get-started/first-time-user/key-concepts)
- [Unity 6.6 — Scenes: creating, loading and saving](https://docs.unity.com/en-us/engine/6000.6/manual/working-with-scenes/scenes-working-with)
- [Unity 6.6 — GameObjects](https://docs.unity.com/en-us/engine/6000.6/manual/working-with-gameobjects)
- [Unity 6.6 — Create components with scripts](https://docs.unity.com/en-us/engine/6000.6/manual/working-with-gameobjects/unity-components/creating-components)
- [Unity 6.6 — Prefabs](https://docs.unity.com/en-us/engine/6000.6/manual/working-with-gameobjects/prefabs)
- [Unity 6.6 — Importing assets](https://docs.unity.com/en-us/engine/6000.6/manual/assets-and-media/import-assets)
