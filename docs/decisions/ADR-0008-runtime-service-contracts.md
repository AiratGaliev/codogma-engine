# ADR-0008: Минимальные host-neutral Runtime Service Contracts

**Статус:** принято  
**Дата:** 09.11.2026  
**Владельцы реализации:** [COD-103 — Scene Loader](https://linear.app/codogma-engine/issue/COD-103/realizovat-data-driven-scene-loader-dlya-project-model-v1), [COD-106 — Engine Services](https://linear.app/codogma-engine/issue/COD-106/realizovat-bazovie-host-neutral-engine-services-v1-v-codogmacge).  
**Связанные решения:** [ADR-0001 — Core architecture](ADR-0001-core-architecture.md), [ADR-0007 — Native Project Model](ADR-0007-native-codogma-project-model.md).

## Контекст

Core уже предоставляет native Project Model v1 и object/component `ComponentWorld`, но для первого реального runtime slice требуются единые минимальные границы Input, Time/Scheduler/Tween и Scene Manager. Контракты должны быть пригодны для независимых fake providers и не должны вводить второй game loop, зависимость от Phaser/DOM или обязательные сервисы для каждого компонента.

Эта запись утверждает только API contracts. Исполняемые сервисы, их update phases, resource ownership и integration behavior реализуются отдельно в COD-106. Scene hydration остаётся ответственностью COD-103.

## Решения

### 1. Расположение и границы API

- Публичные контракты размещаются в `packages/cge/src/services/` и экспортируются через корневой entry point `@codogma/cge`.
- Core описывает интерфейсы, типы событий, time frames и ownership boundaries; он не предоставляет в этой задаче runtime implementations или platform adapters.
- Контракты не импортируют Phaser, DOM event objects, SolidJS, Editor UI, Node-only APIs или platform SDK.
- Input, Time, Scheduler, Tween и Scene Manager — самостоятельные optional capabilities. Они не добавляются как обязательные методы/поля `ComponentBehavior` или `ComponentFactoryContext`. Host явно композирует только используемые сервисы; пользовательский компонент не обязан знать об остальных.

### 2. Input

- Платформенный provider публикует нормализованные `InputEvent` через `InputEventSource`; исходные browser/DOM events остаются внутри adapter.
- Начальный физический scope — keyboard и pointer с `mouse`, `touch` и `pen` pointer types. Touch использует общую pointer lifecycle модель. Gamepad остаётся optional capability.
- Keyboard и pointer phases — down/up/cancel; pointer дополнительно имеет move. События содержат monotonic timestamp, modifiers и координаты/идентификаторы, не зависящие от Phaser.
- `InputRouteResolver` определяет единственный маршрут `ui` или `world`; если pointer event одновременно eligible для UI и world, UI имеет приоритет. Событие, отнесённое к UI, не дублируется и не bubbling в world listeners. Focus lifecycle notifications доставляются обоим маршрутам.
- После focus lost/background/unavailable сервис синтезирует cancel для каждой удерживаемой клавиши и pointer, сохраняя исходный route; затем публикуется focus-lost notification. Полученные позже up events не должны повторно завершать отменённое состояние.
- `InputCoordinateMapper` поддерживает screen/canvas/viewport/world/local/ui spaces. Преобразования, зависящие от viewport/camera/target, требуют соответствующий runtime ID; если контекст недоступен, результат — `undefined`.
- Logical Actions, project bindings и editor keymap не входят в этот контракт: они принадлежат COD-25/COD-97/COD-98/COD-99, а dispatch/device lifecycle остаётся единственным в COD-29.

### 3. Time and Scheduler

- Только внешний host вызывает `TimeService.advance(unscaledDeltaSeconds)`, один раз на frame. Core не создаёт ticker, wall-clock timer или `requestAnimationFrame`.
- Все публичные временные величины измеряются в секундах. Возвращаемый immutable `RuntimeTimeFrame` содержит frame index, scaled/unscaled delta и elapsed time, timeScale и pause state.
- Pause или timeScale=0 замораживает scaled time; unscaled time продолжает идти. TimeScale — конечное неотрицательное число. Отрицательный/non-finite delta отклоняется. Core не скрывает frame stalls автоматическим clamping.
- Scheduler принимает только тот же `RuntimeTimeFrame`, что и остальные time-driven services. Scheduled task — cancellable handle с pause/resume и выбором scaled/unscaled domain. Начальный контракт — одноразовая отложенная задача; интервалы/repeating jobs добавляются только при необходимости.
- `AbortSignal` — общая граница отмены владельца для подписок, scheduled tasks, tweens и незавершённых scene requests. Abort/explicit cancel/dispose должны быть идемпотентны; отменённые callbacks не вызываются.

### 4. Tween

- Начальный API анимирует только существующие writable numeric properties обычного объекта; destination values абсолютные и конечные. Duration и delay конечные и неотрицательные; repeat — целое неотрицательное число дополнительных проходов либо -1 для бесконечного repeat.
- Контракт включает duration, delay, easing function, repeat (количество дополнительных проходов), yoyo, scaled/unscaled time domain (по умолчанию scaled), pause/resume/cancel и completion/update callbacks.
- Tween service потребляет тот же `RuntimeTimeFrame`; он не создаёт собственный ticker и не читает системные часы.
- Sequence/parallel groups, relative strings, arbitrary property adapters и non-numeric interpolators не входят в минимальный v1 contract. Их добавление требует подтверждённого use case и отдельного уточнения API.

### 5. Scene Manager and Loader boundary

- `SceneManagerFactory.create(loader)` — явная composition boundary: factory получает `SceneLoader` и создаёт `SceneManager`. Loader — единственный владелец разбора/валидации Project Model, hydration runtime graph, разрешения references и rollback частичных allocations (COD-103).
- `SceneLoader.load()` возвращает подготовленную **неактивную** `RuntimeSceneSession`; загрузка сама по себе не активирует сцену.
- Scene Manager владеет orchestration одной активной сессии: switch, activate/deactivate, pause/resume, stop и disposal. Он не содержит serializer, component registry, file/project browser или Phaser API.
- Пока новая сцена загружается, текущая остаётся активной. Commit деактивирует старую сессию перед активацией новой; после успешной активации старая сессия освобождается. Одновременно допускается не более одного активного owner.
- Последний switch request побеждает: новая request отменяет предыдущую незавершённую загрузку. Cancel до commit не активирует кандидата; если loader возвращает candidate после cancellation, manager освобождает его. После начала activation commit request cancellation больше не откатывает commit.
- Load failure сохраняет старую активную сессию. Activation failure освобождает candidate и пытается восстановить старую сессию; при неуспешном rollback обе сессии освобождаются, а ошибка возвращается вызывающему коду.
- `stop()` идемпотентно отменяет pending switch и освобождает active session, но manager можно использовать снова. `dispose()` — terminal shutdown. UI transition animations не являются частью базового Scene Manager contract.

## Последствия

- COD-106 может реализовать Time/Scheduler/Tween/Input/Scene Manager без повторного согласования типов и без platform-specific dependencies.
- COD-103 реализует Loader/session contract и отдельные loader tests; Scene Manager tests используют fake loader и не дублируют hydration tests.
- Host/runtime adapter владеет tick и input source; интеграция должна использовать один frame snapshot и зафиксированный порядок фаз.
- Cancellation ownership стандартизирован на `AbortSignal`, а не на собственных глобальных registries или implicit component dependencies.
- Sequence/parallel tween groups, gamepad и visual transition effects остаются расширениями, а не скрытой частью минимального API.

## Verification boundary

TypeScript consumer fixture подтверждает публичную форму contracts и возможность реализовывать fake providers без Phaser/DOM/Node-only imports. Такая проверка не считается реализацией или behavioral acceptance сервисов. Их deterministic behavior, cleanup, cancellation races и integration fixture принимаются COD-106; loader hydration/rollback — COD-103.
