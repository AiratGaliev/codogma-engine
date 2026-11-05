# Архив: исторический аудит форматов Colibri Project / Scene / Prefab

> **АРХИВ, НЕ НОРМАТИВНАЯ СПЕЦИФИКАЦИЯ (05.11.2026).** Этот документ описывает старые файлы и поведение Colibri/Phaser Editor, обнаруженные в репозитории и тестовых workspace. Он не задаёт требования к новому Codogma Project Model и не означает, что новый движок должен открывать, импортировать, сохранять или мигрировать эти форматы.
>
> Принятое продуктовое решение: только нативный versioned Codogma Project Model, без Colibri compatibility. См. [ADR-0007](decisions/ADR-0007-native-codogma-project-model.md). Конвертер, добавленный PR #48, находится вне целевой архитектуры и удаляется по [COD-113](https://linear.app/codogma-engine/issue/COD-113/udalit-colibri-format-compatibility-iz-core-i-novogo-editor-host).
>
> Старые fixtures могут оставаться в историческом inventory для forensic/debugging или аудита лицензий, но не входят в Core, Host, Preview, Build или release acceptance. Не добавлять по ним runtime mappings, migration code, legacySource payload, compatibility schemas или acceptance tests.

## Назначение архива

Сохранить происхождение старых форматов и наблюдаемые особенности Colibri, чтобы понимать, почему старый UI устроен определённым образом и какие зависимости потребуется удалить вместе с ним. Сведения ниже — исторические observations на дату inventory, а не гарантии полноты/совместимости.

## Ограничения применения

- Не использовать этот документ как Project Model specification, migration plan, compatibility matrix или аргумент для сохранения старого serializer.
- Не создавать новый Codogma Scene, Prefab, Component, Script или Asset на основании старого Colibri field mapping.
- Не выводить stable IDs из legacy class names, renderer types, paths или array positions.
- Не требовать поддержки .scene, .components, старого Asset Pack, sceneType, displayList, plainObjects, meta.version, prefabId, unlock, nestedPrefabs и old codegen.
- Новые media importers (PNG, SVG, audio, Tiled JSON и т. п.) имеют собственные Codogma contracts и не являются legacy project conversion.
- Для нового формата использовать [ADR-0007](decisions/ADR-0007-native-codogma-project-model.md), [Technical Specification](technical-specification.md) и [Core acceptance slice](core-component-acceptance-slice.md).

## Состояние реализации

PR #48 merged в dev и добавил временный Colibri Scene/Prefab converter в packages/cge, включая public exports и legacy fixtures/tests. Его merge не означает принятие этого поведения в продукт. Удаление converter и переход нового Host с transitional .scene/.components paths на native Project Model выполняются в COD-113. Временный Colibri UI cutover/removal остаётся отдельным UI lifecycle: COD-87 / COD-88.

## Исторические источники

- [COD-17 — inventory старых Scene/Prefab/Asset/importer formats](https://linear.app/codogma-engine/issue/COD-17/inventarizirovat-formaty-scenprefabassetov-i-kontrakty-importyorov)
- [Исторический Colibri format inventory](legacy-project-asset-importer-inventory.md)
- [ADR-0007 — native Codogma Project Model](decisions/ADR-0007-native-codogma-project-model.md)
