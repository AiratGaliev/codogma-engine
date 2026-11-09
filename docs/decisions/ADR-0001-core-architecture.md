# ADR-0001: Архитектура Core, Project Model и Runtime Adapter

**Статус:** принято  
**Дата:** 27.10.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [дорожная карта](../roadmap.md), [матрица возможностей](../capability-matrix.md), [ADR-0002: TypeScript toolchain](ADR-0002-typescript-toolchain.md), [ADR-0003: package architecture](ADR-0003-package-architecture-and-management.md), [ADR-0004: optional Data-Oriented ECS](ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md), [ADR-0007: Native Codogma Project Model](ADR-0007-native-codogma-project-model.md).

## Контекст

Codogma Core должен предоставлять независимые от UI и renderer контракты для Project Model, Components, lifecycle и runtime graph. Editor, Preview и production Build используют одну сериализованную модель и явные runtime adapters.

## Решения

### 1. Project Model — источник истины

- Состояние проекта хранится как versioned, валидируемые данные.
- Сериализованная Scene — каноническое представление содержимого уровня; runtime hierarchy и Preview являются производными представлениями.
- Scene — самостоятельный документ. Для каждой Scene не создаётся обязательный TypeScript-класс или companion-файл.
- Script — отдельный Project Asset; Component Definition имеет stable `typeId`; каждое назначение Component имеет отдельный `instanceId`.
- Schema migrations допускаются только между реально опубликованными версиями Codogma.
- Все внешние Project/Scene/Plugin inputs проходят runtime validation до использования.
- Serialization детерминирована; неизвестная будущая schema version отклоняется blocking diagnostic без downgrade и мутации input.
- Персистентные Component properties и transient runtime state — разные области данных. Preview привязан к snapshot/ревизии модели.

### 2. Core не зависит от Phaser, Editor UI или platform SDK

- Основной Core размещается в `packages/cge/`.
- Публичные контракты Core не импортируют Phaser, DOM, SolidJS, Node-only APIs или platform SDK.
- Конкретный runtime подключается через явный adapter boundary. Phaser 4.2.1 — первый практический target.
- Editor Host использует публичные типизированные API.
- Node/server и browser/runtime роли разделяются так, чтобы game bundle не включал editor-only или Node-only зависимости.

### 3. Object/component Core и optional Data-Oriented ECS — отдельные уровни

`@codogma/cge` предоставляет host-neutral object/component модель для обычных Node и Component instances; `ComponentRegistry` и `ComponentWorld` остаются частью Core. Data-Oriented ECS не является обязательной частью Core или базового Phaser runtime и развивается как отдельная optional capability. Его package boundaries, identity/data mapping, ownership, lifecycle, tick, Phaser adapter, feature/build selection и performance acceptance определяются только [ADR-0004](ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md); этот ADR фиксирует только место Core в общей архитектуре.

### 4. Явный lifecycle и host-neutral Preview

- Lifecycle определяет создание, validation/initialization, update, disable/destroy и cleanup ресурсов/listeners.
- Time/input/scene control проходят через Core/adapter contracts.
- Core не создаёт собственный game loop или renderer.
- Phaser adapter владеет выбранной фазой tick и вызывает `ComponentWorld.update(deltaSeconds)`.
- Preview Host управляет start/stop/restart и runtime identity; Live Inspector использует явный message/selection contract.
- Ошибка загрузки, отмена или shutdown освобождают все частичные runtime resources.

## Минимальный acceptance slice

Один package/module fixture демонстрирует:

1. Создание Project и Scene с versioned schema и stable IDs.
2. Node с Transform и TypeScript Component с typed/validated properties.
3. Save/load/round-trip без потери identity и values.
4. Запуск serialized Scene из данных и explicit registered Component module без per-scene generated TypeScript file/class.
5. Runtime adapter, создающий реальный Phaser object и синхронизирующий Transform/lifecycle.
6. Preview start/stop/restart без duplicate listeners/objects.
7. Typecheck, schema validation, reference checks и unit/integration tests в CI.
8. Независимые Component instances с разными values и Node references по stable IDs.
9. Preview использует snapshot модели; runtime mutations не перезаписывают Project files автоматически.
10. Editor-only code не попадает в Core/runtime fixture.

Полный HTML5 production asset/build pipeline остаётся отдельным этапом.

## Рассмотренные альтернативы

| Альтернатива | Решение |
|---|---|
| Смешать UI, runtime, build/devtools и платформенные обязанности в одном package | Отклонено: обязанности разделены явными границами |
| Использовать Phaser-specific Scene/GameObject как публичную модель данных | Отклонено: Project Model не зависит от текущего adapter |
| Создавать обязательный TS-класс для каждой Scene | Отклонено: Scene остаётся versioned data document |
| Подключить второй независимый runtime loop | Отложено до PoC и измеримой потребности; это не отменяет отдельное optional ECS-направление, требования к которому определены в [ADR-0004](ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md) |
| Заменить Phaser или добавить несколько physics engines | Отложено до PoC и сравнимого functional/performance baseline |

## Последствия и открытые решения

Core остаётся небольшим и независимо тестируемым; data model не зависит от renderer; пользовательские workflows развиваются в самостоятельном SolidJS Host; runtime adapter можно менять через явные границы.

JSON schema, component metadata conflict resolution и Preview transport protocol уточняются при реализации. Минимальные public contracts Input, Time/Scheduler/Tween и Scene Manager утверждены в [ADR-0008](ADR-0008-runtime-service-contracts.md); их исполняемые реализации и интеграционный update order остаются отдельными implementation slices.

## Implementation baseline

В `packages/cge/` реализованы Project/Scene/Prefab v1 contracts, validation, deterministic serialization, structured diagnostics, versioned Component Schema, explicit registry и component-object world с externally owned tick.

Data-driven Scene Loader, module manifest resolver, Phaser runtime adapter, Preview Host/live runtime identity, lifecycle integration в Phaser tick и standalone HTML5 Build принимаются отдельными vertical slices. Наличие Core package и unit tests не доказывает готовность end-to-end runtime workflow.
