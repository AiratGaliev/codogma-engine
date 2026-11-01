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
