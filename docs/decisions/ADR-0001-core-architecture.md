# ADR-0001: Архитектура Core, Project Model и Runtime Adapter

**Статус:** принято для первого вертикального среза; подробные API signatures и формат сериализации закрепляются тестами/контрактами при реализации.  
**Дата:** 27.10.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [дорожная карта](../roadmap.md), [матрица возможностей](../capability-matrix.md), [ADR-0002: TypeScript toolchain](ADR-0002-typescript-toolchain.md), [ADR-0003: package architecture](ADR-0003-package-architecture-and-management.md).

## Контекст

Текущий клиент в `source/editor/` — большой TypeScript editor, основанный на Colibri/Phaser Editor 2D. Он содержит сценовый UI, serialization/codegen и plugin registry, но не является готовым независимым runtime Core. Нужны собственные контракты движка, которые не зависят от приватных импортов legacy editor и позволяют менять runtime adapter без переписывания модели проекта.

## Решения для первого vertical slice

### 1. Project Model — источник истины

Состояние проекта хранится как versioned, валидируемые данные. Editor UI и runtime не должны быть источником истины друг для друга: обе стороны работают с Project Model и явно синхронизированными runtime instances. Сериализованное описание Scene — каноническое представление содержимого уровня; runtime hierarchy и Preview являются его производными представлениями.

Целевой Core загружает scene data через loader, разрешающий явный registry/module manifest зарегистрированных TypeScript-компонентов и управляемые asset/prefab references. **Отдельный генерируемый TypeScript-класс на каждую сцену не является обязательным источником, авторинг-артефактом или условием запуска/build.** Компонент — независимый переиспользуемый модуль, привязанный к Node через стабильный type ID и сериализуемые свойства; никаких предположений о названии класса/файла сцены быть не должно. Текущий codegen сохраняется как legacy compatibility workflow до приёмки нового loader и отдельного решения о миграции.

Persisted component properties и transient runtime state — разные области данных. Схема компонента явно определяет, какие свойства сохраняются в Project Model; runtime Inspector может показывать transient values, но они не изменяют source data автоматически. Запуск Preview привязывается к snapshot/ревизии модели; изменения проекта после запуска не должны незаметно менять соответствующую runtime-сессию.

- У сцен/узлов/компонентов должны быть стабильные IDs; имя/путь файла не является идентичностью объекта.
- Формат имеет версию схемы и тестируемую migration path. Любые внешние JSON/plugin/project inputs проходят runtime validation до использования.
- Serialization должна быть детерминированной для одинакового семантического состояния, насколько это требуется для diff/review; неопределённый порядок объектов/ключей и скрытые runtime references не должны случайно менять project files.
- Изменение формата сопровождается fixtures для старой версии, миграции, round-trip save/reopen и диагностируемого отказа от некорректных данных.
- На первом этапе не обещать backwards compatibility для ещё не опубликованного Core API; версия формата и стратегия migration всё равно обязательны.
- Загрузка сцены выполняет проверку формата и поддерживаемой версии, затем зарегистрированные миграции в памяти и полную schema/ref validation до активации; отсутствие component registration, неподдерживаемая версия схемы или сломанная ссылка возвращаются как диагностируемая ошибка и не оставляют частично созданную сцену.
- Загрузчик сначала создаёт таблицу стабильных Node IDs/иерархию, затем component instances и разрешает ссылки по ID, после чего активирует lifecycle; ошибки и отмена во время загрузки выполняют rollback/cleanup.
- Component type ID отличается от component instance ID. Повторное использование одного зарегистрированного модуля не должно приводить к разделяемым mutable values между экземплярами.
- Регистрация игровых скриптов выражается через явный registry/module manifest и предсказуемый build graph; запрещено выводить соответствие компонента из имени сцены/пути или исполнять непроверенный динамический код.

### 2. Core не зависит от Phaser, Editor UI или platform SDK

- Основной Core и Project Model размещаются под целевым `packages/cge/`; пакет не импортирует Phaser, DOM editor UI, Node-only APIs или Yandex/VK SDK в публичные контракты.
- Конкретный runtime подключается через явный adapter boundary. Phaser 4.2.1 — первый практический adapter/capability target, но Phaser-specific objects/types не протекают в public Core contracts.
- Editor Host использует публичные типизированные API; private deep imports из Colibri запрещены для межпакетной интеграции.
- Node/server и browser/runtime роли отделяются на границе модулей, чтобы target HTML5 bundle не включал editor-only или Node-only зависимости.

### 3. Component-object model раньше оптимизированного ECS

Первый acceptance scenario использует понятную объектно-компонентную модель: Project → Scene → Node/Transform → один пользовательский TypeScript Component. Data-oriented ECS storage, entity archetypes и дополнительные runtime frameworks не вводить, пока профилирование и реальный workload не докажут потребность.

Это не запрет ECS как направления. Решение откладывает оптимизированную реализацию до наличия измеримых требований и стабильного lifecycle contract. EVA.js и другие проекты — references, а не дополнительные runtime-зависимости.

### 4. Явный lifecycle и host-neutral preview

- Lifecycle объектов и компонентов должен однозначно определять создание, валидацию/инициализацию, update, disable/destroy и cleanup ресурсов/listeners. Точный порядок callback-ов надо закрепить тестами до расширения API.
- Time/input/scene control проходят через контракт Core/adapter, а не через прямые обращения пользовательских компонентов к глобальному Phaser scene.
- Первый Preview Host — browser-first и может работать независимо от Tauri. Он должен давать воспроизводимые start/stop/restart, диагностику ошибки запуска и связь runtime instance с Project Model.
- Live Inspector строится поверх явного message/selection contract; не подменять live state данными редактора, которые не соответствуют текущему runtime.
- Начальный vertical slice должен иметь проверяемый preview/build fixture, но не обязан реализовывать будущий profiler, hot reload или несколько preview windows.

## Минимальный acceptance slice

Один отдельный package/module fixture должен продемонстрировать:

1. Создание Project и Scene с versioned schema и стабильными IDs.
2. Один Node с Transform и пользовательский TypeScript Component с типизированными/валидируемыми сериализуемыми данными.
3. Сохранение, загрузку и round-trip save/reopen без потери идентичности и значений.
4. Запуск сериализованной сцены из данных и явно зарегистрированного пользовательского TypeScript-компонента без per-scene generated TS class/file; тот же компонентный модуль повторно используется разными узлами.
5. Runtime adapter, который создаёт реальный объект в Phaser 4.2.1 и синхронизирует базовые transform/lifecycle операции.
6. Start/stop/restart preview без дублирующих listeners/объектов; runtime error диагностируется; ошибка загрузки очищает частичные runtime resources.
7. Проверку типа, schema validation, сломанных refs и unit/integration tests в CI.
8. Повторное использование одного component type несколькими экземплярами с независимыми values, ссылки между узлами по ID и корректную ошибку/cleanup при отмене или неудаче загрузки.
9. Проверку, что запуск Preview использует snapshot модели и runtime mutations не перезаписывают project files автоматически.
10. Чёткую границу: editor-only code не попадает в Core/runtime fixture.

Подробный HTML5 production asset/build pipeline и feature tree shaking остаются Этапом 4A и не считаются завершёнными этим slice.

## Рассмотренные альтернативы

| Альтернатива | Решение |
|---|---|
| Переписать всю Colibri/editor архитектуру до Core | Отклонено: слишком широкий объём и отсутствие доказательства, что это требуется для первого сценария |
| Вынести весь текущий editor в один агрегирующий package | Отклонено: смешивает UI, runtime, build/devtools и платформенные обязанности |
| Использовать Phaser-specific scene/game objects как публичную модель данных | Отклонено: привязывает проектный формат и пользовательский API к текущему adapter |
| Использовать обязательный генерируемый TS-класс как каноническое представление каждой сцены | Отклонено для нового Core: связывает сериализованные данные с codegen и заставляет делать build/preview зависимыми от scene-specific source; генерация сохраняется только как legacy/optional workflow до проверенной миграции |
| Подключить EVA.js как второй runtime/ECS | Отложено: риск двойного lifecycle/game loop без доказанной потребности |
| Сразу заменить Phaser на PixiJS или добавить несколько physics engines | Отложено до PoC и сравнимого functional/performance baseline |
| Начать с оптимизированного data-oriented ECS | Отложено: сначала нужен рабочий component-object slice и измерения |

## Последствия и открытые решения

**Положительные:** первый Core остаётся небольшим и независимо тестируемым; data model не зависит от renderer; legacy Colibri может поддерживаться только для compatibility/security fixes на переходе, а пользовательские workflows развиваются в самостоятельном SolidJS Host; runtime adapter можно менять через явные границы.

**Компромиссы:** потребуется явно определить schema/version/migration, component metadata и lifecycle contracts. Эти элементы нельзя оставлять implicit в generated source или UI state.

Открытыми до реализации остаются конкретный JSON schema, API names/signatures, правила conflict resolution для component metadata, точный update order и transport протокол Preview Host. Эти детали не мешают начать изолированный pilot, но должны быть утверждены и покрыты тестами до подключения большого набора editor features.

## Implementation update — 03.11.2026

PR #39 introduces the first host-neutral contract implementation under `packages/cge/`: Project/Scene/Prefab v1 types and validation, in-memory Project v0 migration, deterministic serializers, structured diagnostics, versioned Component Schema, explicit registry and a component-object world updated only by an external tick. This realizes the first testable portion of this ADR without coupling the Core package to Phaser, the DOM, Colibri or the SolidJS Host.

The legacy SolidJS Host workflow consumes the Core schema through a compatibility adapter for current `.components` documents. That adapter's `legacy.user-component:<class-name>` identifier is deliberately transitional; it is not a stable runtime type ID or module registration. TypeScript source editing and syntax diagnostics are also Host features, not runtime module loading.

**Not yet implemented:** Project Model-aware scene loader, explicit project module manifest resolver, Phaser runtime adapter, Preview Host/live runtime identity, lifecycle integration into Phaser ticks, and data-driven standalone HTML5 build. The implementation must not be described as an end-to-end runtime migration until the acceptance sequence in [Core acceptance slice](../core-component-acceptance-slice.md) is complete. Legacy `.scene`/generated-code workflows remain compatible and are not rewritten by this PR.



## Component-object Core, system boundary and EVA.js reference evaluation (03.11.2026)

**Decision:** Codogma Core remains a host-neutral object/component runtime with an externally owned tick. The initial component/system APIs do not create or own a Game instance, Scene Manager, requestAnimationFrame loop, renderer, resource singleton or global event bus. The Phaser adapter (COD-28) is the tick owner and calls `ComponentWorld.update(deltaSeconds)` once in its selected frame phase. Preview/scene switching owns world lifetime and invokes disposal before replacing the active world.

**EVA.js reference review:** the public [eva-engine/eva.js](https://github.com/eva-engine/eva.js) documentation describes a `Game` entry point that manages systems, scenes, its own ticker and start/pause/resume/destroy lifecycle, plus a `GameObject` hierarchy and Component/System hooks (`init`, `awake`, `start`, `update`, `lateUpdate`, pause/resume/destroy). Its package model splits the core from renderer and feature plugins. Useful references adopted/adapted for Codogma are explicit component instances, system scheduling, a well-defined lifecycle and feature boundaries. The second Game/ticker, global resource manager and implicit scene singleton are deliberately not adopted: Codogma already has a concrete host/runtime owner (Phaser) and a persisted Project Model that must remain the source of truth. Introducing another loop would duplicate scheduling and create ambiguous update order, pause and disposal semantics. EVA.js is evaluated as an architecture reference only; it is not a dependency or a compatibility target.

**Why not data-oriented ECS now:** three successful CI Fast runs on Node 22.23.4 Linux x64, using the synthetic no-op component workload and 25 measured ticks after warm-up, produced these average update-tick ranges: 0.035–0.063 ms at 100 nodes/components, 0.233–0.472 ms at 1,000, and 1.436–2.767 ms at 10,000 (approximately 3.61–6.97 million component updates/second at 10,000). The 10,000-component samples straddle the illustrative 10% of a 60 Hz frame budget (1.67 ms), demonstrating material CI timing variability. These are single-run averages from one CI runner, not p95 latency, a target-browser/mobile measurement or a representative production workload. Use reproducible browser/device profiling before deciding whether the frame budget is exceeded or a data-oriented ECS prototype is warranted. Start an ECS prototype only if target-browser/device measurements with representative production systems and 10,000+ active components consistently show p95 Core simulation above 1.67 ms or measurable allocation/GC frame misses after ordinary profiling/optimization. Any prototype must compare the same workload, lifecycle semantics, memory, update p50/p95 and integration complexity; do not replace the public object API based on synthetic component count alone.

**Stable ID contract:** Project Model and runtime identities share one validator. IDs are opaque and case-sensitive; they begin with an ASCII letter or digit and may then contain ASCII letters/digits, `.`, `_`, `:`, `# ADR-0001: Архитектура Core, Project Model и Runtime Adapter

**Статус:** принято для первого вертикального среза; подробные API signatures и формат сериализации закрепляются тестами/контрактами при реализации.  
**Дата:** 27.10.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [дорожная карта](../roadmap.md), [матрица возможностей](../capability-matrix.md), [ADR-0002: TypeScript toolchain](ADR-0002-typescript-toolchain.md), [ADR-0003: package architecture](ADR-0003-package-architecture-and-management.md).

## Контекст

Текущий клиент в `source/editor/` — большой TypeScript editor, основанный на Colibri/Phaser Editor 2D. Он содержит сценовый UI, serialization/codegen и plugin registry, но не является готовым независимым runtime Core. Нужны собственные контракты движка, которые не зависят от приватных импортов legacy editor и позволяют менять runtime adapter без переписывания модели проекта.

## Решения для первого vertical slice

### 1. Project Model — источник истины

Состояние проекта хранится как versioned, валидируемые данные. Editor UI и runtime не должны быть источником истины друг для друга: обе стороны работают с Project Model и явно синхронизированными runtime instances. Сериализованное описание Scene — каноническое представление содержимого уровня; runtime hierarchy и Preview являются его производными представлениями.

Целевой Core загружает scene data через loader, разрешающий явный registry/module manifest зарегистрированных TypeScript-компонентов и управляемые asset/prefab references. **Отдельный генерируемый TypeScript-класс на каждую сцену не является обязательным источником, авторинг-артефактом или условием запуска/build.** Компонент — независимый переиспользуемый модуль, привязанный к Node через стабильный type ID и сериализуемые свойства; никаких предположений о названии класса/файла сцены быть не должно. Текущий codegen сохраняется как legacy compatibility workflow до приёмки нового loader и отдельного решения о миграции.

Persisted component properties и transient runtime state — разные области данных. Схема компонента явно определяет, какие свойства сохраняются в Project Model; runtime Inspector может показывать transient values, но они не изменяют source data автоматически. Запуск Preview привязывается к snapshot/ревизии модели; изменения проекта после запуска не должны незаметно менять соответствующую runtime-сессию.

- У сцен/узлов/компонентов должны быть стабильные IDs; имя/путь файла не является идентичностью объекта.
- Формат имеет версию схемы и тестируемую migration path. Любые внешние JSON/plugin/project inputs проходят runtime validation до использования.
- Serialization должна быть детерминированной для одинакового семантического состояния, насколько это требуется для diff/review; неопределённый порядок объектов/ключей и скрытые runtime references не должны случайно менять project files.
- Изменение формата сопровождается fixtures для старой версии, миграции, round-trip save/reopen и диагностируемого отказа от некорректных данных.
- На первом этапе не обещать backwards compatibility для ещё не опубликованного Core API; версия формата и стратегия migration всё равно обязательны.
- Загрузка сцены выполняет проверку формата и поддерживаемой версии, затем зарегистрированные миграции в памяти и полную schema/ref validation до активации; отсутствие component registration, неподдерживаемая версия схемы или сломанная ссылка возвращаются как диагностируемая ошибка и не оставляют частично созданную сцену.
- Загрузчик сначала создаёт таблицу стабильных Node IDs/иерархию, затем component instances и разрешает ссылки по ID, после чего активирует lifecycle; ошибки и отмена во время загрузки выполняют rollback/cleanup.
- Component type ID отличается от component instance ID. Повторное использование одного зарегистрированного модуля не должно приводить к разделяемым mutable values между экземплярами.
- Регистрация игровых скриптов выражается через явный registry/module manifest и предсказуемый build graph; запрещено выводить соответствие компонента из имени сцены/пути или исполнять непроверенный динамический код.

### 2. Core не зависит от Phaser, Editor UI или platform SDK

- Основной Core и Project Model размещаются под целевым `packages/cge/`; пакет не импортирует Phaser, DOM editor UI, Node-only APIs или Yandex/VK SDK в публичные контракты.
- Конкретный runtime подключается через явный adapter boundary. Phaser 4.2.1 — первый практический adapter/capability target, но Phaser-specific objects/types не протекают в public Core contracts.
- Editor Host использует публичные типизированные API; private deep imports из Colibri запрещены для межпакетной интеграции.
- Node/server и browser/runtime роли отделяются на границе модулей, чтобы target HTML5 bundle не включал editor-only или Node-only зависимости.

### 3. Component-object model раньше оптимизированного ECS

Первый acceptance scenario использует понятную объектно-компонентную модель: Project → Scene → Node/Transform → один пользовательский TypeScript Component. Data-oriented ECS storage, entity archetypes и дополнительные runtime frameworks не вводить, пока профилирование и реальный workload не докажут потребность.

Это не запрет ECS как направления. Решение откладывает оптимизированную реализацию до наличия измеримых требований и стабильного lifecycle contract. EVA.js и другие проекты — references, а не дополнительные runtime-зависимости.

### 4. Явный lifecycle и host-neutral preview

- Lifecycle объектов и компонентов должен однозначно определять создание, валидацию/инициализацию, update, disable/destroy и cleanup ресурсов/listeners. Точный порядок callback-ов надо закрепить тестами до расширения API.
- Time/input/scene control проходят через контракт Core/adapter, а не через прямые обращения пользовательских компонентов к глобальному Phaser scene.
- Первый Preview Host — browser-first и может работать независимо от Tauri. Он должен давать воспроизводимые start/stop/restart, диагностику ошибки запуска и связь runtime instance с Project Model.
- Live Inspector строится поверх явного message/selection contract; не подменять live state данными редактора, которые не соответствуют текущему runtime.
- Начальный vertical slice должен иметь проверяемый preview/build fixture, но не обязан реализовывать будущий profiler, hot reload или несколько preview windows.

## Минимальный acceptance slice

Один отдельный package/module fixture должен продемонстрировать:

1. Создание Project и Scene с versioned schema и стабильными IDs.
2. Один Node с Transform и пользовательский TypeScript Component с типизированными/валидируемыми сериализуемыми данными.
3. Сохранение, загрузку и round-trip save/reopen без потери идентичности и значений.
4. Запуск сериализованной сцены из данных и явно зарегистрированного пользовательского TypeScript-компонента без per-scene generated TS class/file; тот же компонентный модуль повторно используется разными узлами.
5. Runtime adapter, который создаёт реальный объект в Phaser 4.2.1 и синхронизирует базовые transform/lifecycle операции.
6. Start/stop/restart preview без дублирующих listeners/объектов; runtime error диагностируется; ошибка загрузки очищает частичные runtime resources.
7. Проверку типа, schema validation, сломанных refs и unit/integration tests в CI.
8. Повторное использование одного component type несколькими экземплярами с независимыми values, ссылки между узлами по ID и корректную ошибку/cleanup при отмене или неудаче загрузки.
9. Проверку, что запуск Preview использует snapshot модели и runtime mutations не перезаписывают project files автоматически.
10. Чёткую границу: editor-only code не попадает в Core/runtime fixture.

Подробный HTML5 production asset/build pipeline и feature tree shaking остаются Этапом 4A и не считаются завершёнными этим slice.

## Рассмотренные альтернативы

| Альтернатива | Решение |
|---|---|
| Переписать всю Colibri/editor архитектуру до Core | Отклонено: слишком широкий объём и отсутствие доказательства, что это требуется для первого сценария |
| Вынести весь текущий editor в один агрегирующий package | Отклонено: смешивает UI, runtime, build/devtools и платформенные обязанности |
| Использовать Phaser-specific scene/game objects как публичную модель данных | Отклонено: привязывает проектный формат и пользовательский API к текущему adapter |
| Использовать обязательный генерируемый TS-класс как каноническое представление каждой сцены | Отклонено для нового Core: связывает сериализованные данные с codegen и заставляет делать build/preview зависимыми от scene-specific source; генерация сохраняется только как legacy/optional workflow до проверенной миграции |
| Подключить EVA.js как второй runtime/ECS | Отложено: риск двойного lifecycle/game loop без доказанной потребности |
| Сразу заменить Phaser на PixiJS или добавить несколько physics engines | Отложено до PoC и сравнимого functional/performance baseline |
| Начать с оптимизированного data-oriented ECS | Отложено: сначала нужен рабочий component-object slice и измерения |

## Последствия и открытые решения

**Положительные:** первый Core остаётся небольшим и независимо тестируемым; data model не зависит от renderer; legacy Colibri может поддерживаться только для compatibility/security fixes на переходе, а пользовательские workflows развиваются в самостоятельном SolidJS Host; runtime adapter можно менять через явные границы.

**Компромиссы:** потребуется явно определить schema/version/migration, component metadata и lifecycle contracts. Эти элементы нельзя оставлять implicit в generated source или UI state.

Открытыми до реализации остаются конкретный JSON schema, API names/signatures, правила conflict resolution для component metadata, точный update order и transport протокол Preview Host. Эти детали не мешают начать изолированный pilot, но должны быть утверждены и покрыты тестами до подключения большого набора editor features.

## Implementation update — 03.11.2026

PR #39 introduces the first host-neutral contract implementation under `packages/cge/`: Project/Scene/Prefab v1 types and validation, in-memory Project v0 migration, deterministic serializers, structured diagnostics, versioned Component Schema, explicit registry and a component-object world updated only by an external tick. This realizes the first testable portion of this ADR without coupling the Core package to Phaser, the DOM, Colibri or the SolidJS Host.

The legacy SolidJS Host workflow consumes the Core schema through a compatibility adapter for current `.components` documents. That adapter's `legacy.user-component:<class-name>` identifier is deliberately transitional; it is not a stable runtime type ID or module registration. TypeScript source editing and syntax diagnostics are also Host features, not runtime module loading.

**Not yet implemented:** Project Model-aware scene loader, explicit project module manifest resolver, Phaser runtime adapter, Preview Host/live runtime identity, lifecycle integration into Phaser ticks, and data-driven standalone HTML5 build. The implementation must not be described as an end-to-end runtime migration until the acceptance sequence in [Core acceptance slice](../core-component-acceptance-slice.md) is complete. Legacy `.scene`/generated-code workflows remain compatible and are not rewritten by this PR.



## Component-object Core, system boundary and EVA.js reference evaluation (03.11.2026)

**Decision:** Codogma Core remains a host-neutral object/component runtime with an externally owned tick. The initial component/system APIs do not create or own a Game instance, Scene Manager, requestAnimationFrame loop, renderer, resource singleton or global event bus. The Phaser adapter (COD-28) is the tick owner and calls `ComponentWorld.update(deltaSeconds)` once in its selected frame phase. Preview/scene switching owns world lifetime and invokes disposal before replacing the active world.

**EVA.js reference review:** the public [eva-engine/eva.js](https://github.com/eva-engine/eva.js) documentation describes a `Game` entry point that manages systems, scenes, its own ticker and start/pause/resume/destroy lifecycle, plus a `GameObject` hierarchy and Component/System hooks (`init`, `awake`, `start`, `update`, `lateUpdate`, pause/resume/destroy). Its package model splits the core from renderer and feature plugins. Useful references adopted/adapted for Codogma are explicit component instances, system scheduling, a well-defined lifecycle and feature boundaries. The second Game/ticker, global resource manager and implicit scene singleton are deliberately not adopted: Codogma already has a concrete host/runtime owner (Phaser) and a persisted Project Model that must remain the source of truth. Introducing another loop would duplicate scheduling and create ambiguous update order, pause and disposal semantics. EVA.js is evaluated as an architecture reference only; it is not a dependency or a compatibility target.

**Why not data-oriented ECS now:** three successful CI Fast runs on Node 22.23.4 Linux x64, using the synthetic no-op component workload and 25 measured ticks after warm-up, produced these average update-tick ranges: 0.035–0.063 ms at 100 nodes/components, 0.233–0.472 ms at 1,000, and 1.436–2.767 ms at 10,000 (approximately 3.61–6.97 million component updates/second at 10,000). The 10,000-component samples straddle the illustrative 10% of a 60 Hz frame budget (1.67 ms), demonstrating material CI timing variability. These are single-run averages from one CI runner, not p95 latency, a target-browser/mobile measurement or a representative production workload. Use reproducible browser/device profiling before deciding whether the frame budget is exceeded or a data-oriented ECS prototype is warranted. Start an ECS prototype only if target-browser/device measurements with representative production systems and 10,000+ active components consistently show p95 Core simulation above 1.67 ms or measurable allocation/GC frame misses after ordinary profiling/optimization. Any prototype must compare the same workload, lifecycle semantics, memory, update p50/p95 and integration complexity; do not replace the public object API based on synthetic component count alone.

 or `-`. Whitespace and path separators are invalid. The same rule applies to project, scene, prefab, node, component type/instance, asset and runtime adapter IDs; names, labels and versions remain ordinary strings.

**Synchronous lifecycle contract:** Core lifecycle callbacks, system update/dispose and component factories are synchronous. Async loading belongs to an explicit host/service phase before attach/activation; returning a Promise from factory/lifecycle/system callbacks is rejected and diagnosed. Cleanup is synchronous and deterministic so the host can complete teardown before a Scene/Preview transition. Components acquire resources in `onCreate` and release subscriptions/handles in `onDestroy`; Core guarantees callback invocation and continues teardown when a callback throws, but does not own external resource implementations. A failed `onEnable`, `onDisable`, `onStart` or `onUpdate` callback removes the affected instance and invokes `onDestroy` (with `onDisable` called first when it was active), without retrying the failed callback. Structural removal is deferred to the operation boundary when failure occurs during update. Sibling components continue processing and errors are aggregated. A component whose activation has not completed successfully is never advanced to `onStart` or `onUpdate`.
