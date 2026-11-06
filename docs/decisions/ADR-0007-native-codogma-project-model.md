# ADR-0007: Native Codogma Project Model

**Статус:** принято  
**Дата:** 06.11.2026  
**Область:** Project Model, Core, Editor Host, Preview, Build, Script/Component authoring  
**Связанные документы:** [Техническое задание](../technical-specification.md), [ADR-0001](ADR-0001-core-architecture.md), [ADR-0005](ADR-0005-solidjs-editor-host.md), [Core acceptance slice](../core-component-acceptance-slice.md).

## Контекст

Codogma Engine — самостоятельный 2D Web-first движок. Project Model является единым источником истины для Editor, Core, Preview и Build. Все проектные документы и runtime identities должны иметь собственные типизированные contracts, валидацию и стабильные идентификаторы.

## Решение

### 1. Единая модель проекта

- Поддерживаемая начальная версия — native Codogma Project Model v1.
- Project, Scene, Node, Transform, Component Definition/Instance, Prefab, Asset и Script имеют явные versioned contracts и stable IDs.
- Scene — самостоятельный сериализуемый документ и источник истины для иерархии, настроек, компонентов и references.
- Node содержит Transform и независимые Component instances.
- Prefab — самостоятельный reusable asset с source hierarchy, stable identity, instances и явными overrides.
- Script — отдельный source asset проекта. Он объявляет Component definitions через explicit module contract.
- Component Definition определяется stable `typeId`; attachment имеет отдельный `instanceId`; module reference включает `moduleAssetId` и version.
- Asset reference использует stable `assetId`, project-relative path, kind и optional `subResourceId`.

### 2. Identity и именование

- Имя файла, путь, class name, export name и display label не являются runtime identity.
- Один Script/Component Definition может использоваться в разных Scenes и Nodes.
- Каждый Component attachment получает отдельный instance ID и независимые persisted properties.
- Разрешение modules и references выполняется явно через manifest/registry; эвристики по имени, пути или порядку элементов не используются.

### 3. Serialization и schema evolution

- Serialization детерминирована для одинакового семантического состояния.
- Editor-only state и transient runtime state не записываются в Project documents.
- JSON boundary принимает только безопасные JSON values и проверяет документы до использования.
- Unknown fields обрабатываются документированной политикой текущей Codogma schema.
- Будущая неизвестная версия отклоняется blocking diagnostic без downgrade, частичного открытия или мутации исходного документа.
- Schema migrations разрешены только между реально опубликованными версиями Codogma.
- Открытие/валидация не переписывает исходный файл автоматически.

### 4. Scene authoring, Preview и Build

- Editor Scene View и Hierarchy изменяют один native Scene document.
- Save/reopen восстанавливает ту же versioned модель и stable identities.
- Preview и production Build используют один loader contract и explicit module manifest.
- Scene запускается из сериализованных данных; обязательная генерация отдельного TypeScript-класса/файла для каждой Scene не допускается.
- TypeScript compilation/build graph относится к Script assets/modules, а не к companion-файлам Scene.
- Runtime hierarchy и Preview state являются производными представлениями Project Model.

### 5. Внешние ресурсы

- PNG, SVG, audio, Tiled JSON и другие общеупотребимые media/content formats обрабатываются отдельными Codogma importers.
- Каждый importer имеет собственную спецификацию входных данных, диагностики, metadata, reimport и resource lifecycle.
- Внешний media importer не меняет Project Model contract и не создаёт альтернативную сериализацию проекта.

## Последствия

**Положительные:** единый источник истины; строгие границы между Project data, Script source, runtime state и Editor state; stable identities; воспроизводимое сохранение; один loader contract для Preview и Build.

**Компромиссы:** schema, validation, module resolution, loader и runtime adapter требуют отдельной реализации и automated/browser acceptance. До завершения соответствующих slices нельзя заявлять полный Scene-to-Build workflow.

## Критерии соответствия

- Чистый проект создаётся в native Project Model v1.
- Scene создаётся, переименовывается, сохраняется и открывается без companion TypeScript file.
- Script Asset и Component Definition используются в нескольких Nodes/Scenes по stable IDs.
- Изменение file/class/display names не меняет runtime identity.
- Prefab references/instances/overrides работают по typed contracts.
- Preview/Build используют Scene data и явно зарегистрированные modules.
- Invalid documents, IDs, references и unsupported schema versions дают blocking diagnostics без частичной мутации.

## Продуктовые references

- [Unity 6.6 — Key concepts](https://docs.unity.com/en-us/engine/6000.6/manual/get-started/first-time-user/key-concepts)
- [Unity 6.6 — Scenes](https://docs.unity.com/en-us/engine/6000.6/manual/working-with-scenes/scenes-working-with)
- [Unity 6.6 — GameObjects](https://docs.unity.com/en-us/engine/6000.6/manual/working-with-gameobjects)
- [Unity 6.6 — Script components](https://docs.unity.com/en-us/engine/6000.6/manual/working-with-gameobjects/unity-components/creating-components)
- [Unity 6.6 — Prefabs](https://docs.unity.com/en-us/engine/6000.6/manual/working-with-gameobjects/prefabs)
- [Unity 6.6 — Importing assets](https://docs.unity.com/en-us/engine/6000.6/manual/assets-and-media/import-assets)
