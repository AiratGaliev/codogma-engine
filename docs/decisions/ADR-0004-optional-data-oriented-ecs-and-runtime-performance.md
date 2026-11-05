# ADR-0004: Optional Data-Oriented ECS и производительность Web Runtime

**Статус:** принято как целевое архитектурное направление; реализация package ещё не начата.  
**Дата:** 05.11.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [roadmap](../roadmap.md), [ADR-0001](ADR-0001-core-architecture.md), [ADR-0003](ADR-0003-package-architecture-and-management.md), [performance baseline](../performance-baseline.md), [capability matrix](../capability-matrix.md).

## Контекст

Codogma уже имеет базовую host-neutral object/component модель в `@codogma/cge`: Project Model, Component Schema, ComponentRegistry, ComponentWorld, lifecycle и внешний tick contract. Эта модель нужна для удобного авторинга, Inspector, Prefab и обычных игровых объектов. Она не является data-oriented ECS: runtime records сейчас используют объектные структуры и Map/array lookup, а ComponentWorld обновляет компоненты в порядке Node/attachment, затем запускает системы.

Одновременно для браузерных игр с большим количеством однотипных NPC, врагов, снарядов и эффектов может потребоваться более эффективное хранение и массовая обработка данных. ECS рассматривается как самостоятельная runtime-возможность, а не обязательная часть каждой игры или редактора.

Синтетический Node.js benchmark ComponentWorld полезен как baseline конкретного scheduler, но не моделирует браузер, Phaser, физику, рендеринг, реальные AI-системы или профиль allocations/GC. Порог по числу сущностей сам по себе не является доказательством потребности или эффективности.

## Решения

### 1. Core и Data-Oriented ECS — разные packages

- `@codogma/cge` остаётся host-neutral Core: Project Model, Scene/Node/Transform, сериализуемая Component Schema, registry/lifecycle, базовые services и object/component runtime.
- Реализация Data-Oriented ECS размещается в отдельном optional package `@codogma/ecs`, не в `packages/cge`.
- Базовый проект Codogma не устанавливает и не импортирует `@codogma/ecs`. Проекты без ECS не должны получать его код транзитивно или runtime-стоимость.
- `@codogma/ecs` не зависит от Phaser, renderer, DOM, Editor Host, Node-only APIs, MCP или platform SDK. Он может использоваться как самостоятельный runtime module с внешним tick owner.
- Разработчик вправе использовать только object/component Core, только ECS там, где это поддерживается явным Project/Runtime integration contract, либо обе модели в одной игре. Hybrid — совместимость независимых моделей, а не требование иметь обе в каждом проекте.

### 2. Разделение authoring components и ECS storage

- Component Schema в Project Model описывает persisted properties, Inspector metadata, validation/defaults и migration. ECS storage описывает runtime data layout и не является автоматически сериализуемой schema.
- Project Model Node IDs, component type IDs и persisted component instance IDs не следует автоматически отождествлять с быстрыми runtime Entity handles. Связь выполняется явным versioned mapping/adapter.
- Каждое изменяемое runtime значение имеет ровно одного владельца. Не допускается одновременная независимая мутация HP/Transform/AI state в Phaser Game Object, ComponentWorld и ECS.
- Runtime ECS state по умолчанию transient; сохранение/загрузка возможно только через явный adapter/serializer contract, если конкретному проекту это нужно.
- Editor может отображать ECS-backed runtime diagnostics, но не должен притворяться, что любой ECS runtime field автоматически является редактируемым persisted Inspector property.

### 3. Контракт `@codogma/ecs`

Package должен предоставлять:
- World-local entity handles и безопасное создание/уничтожение сущностей;
- регистрацию/хранение компонентов и typed query API;
- детерминированный system scheduler с явными фазами и внешним временем;
- безопасную очередь структурных изменений на границах update;
- lifecycle/disposal и диагностируемую error policy;
- стабильную семантику iteration при создании/удалении сущностей и компонентов;
- возможность менять внутренний storage без изменения пользовательских query/system contracts.

Вариант storage (archetypes/table chunks, sparse sets или комбинация) выбирается сравнительным benchmark. Не фиксировать layout только по сходству с Unity/EVA.js. Внутренняя реализация должна минимизировать hot-path allocation, но не жертвовать корректностью, малой нагрузкой и удобством API ради искусственного benchmark.

ECS не создаёт собственный `requestAnimationFrame`, ticker, Game, Scene Manager или физический мир. Внешний host передаёт delta/fixed-step phases. Worker, SharedArrayBuffer, WASM и multithreading не следуют из наличия ECS и требуют отдельных PoC/ADR, browser/hosting compatibility и security acceptance.

### 4. Отдельный Phaser adapter

Интеграция размещается в отдельном optional package `@codogma/ecs-phaser`. Он не является зависимостью базового `@codogma/runtime-phaser`.

Adapter связывает ECS entities с Phaser display objects и (только при отдельной выбранной capability) физическими телами. Он обязан:
- использовать Phaser-controlled tick и не запускать второй loop;
- явно определить owner каждого Transform/physics value;
- управлять entity ↔ display-object mapping и lifetime;
- очищать все objects/listeners/bodies при scene shutdown, pause/dispose и ошибке;
- иметь versioned compatibility с Phaser и не протекать Phaser types в `@codogma/ecs`.

Physics backend и ECS — ортогональные возможности. ECS не делает Box2D, Matter.js или Arcade обязательными; каждый physics integration имеет отдельные capabilities и acceptance.

### 5. EVA.js: reuse policy

EVA.js v2 остаётся важным архитектурным reference:
- изучать separation Core / GameObject / Component / System и понятный lifecycle;
- использовать как reference для отдельных feature packages (renderer, sprite, animation, input, pool, worker и т. п.);
- учитывать его публичную package composition, а не копировать имена/API без проверки.

Не переносить в Codogma его собственные Game/Ticker/Scene Manager, Pixi renderer или глобальный Resource singleton: Phaser/Host владеют игровым циклом и runtime adapter boundary. Объектно-компонентная реализация EVA.js сама по себе не является доказательством ускорения Data-Oriented ECS. Переиспользование исходников возможно только после проверки конкретной версии, лицензии, dependencies, notices, архитектурной совместимости и тестов; EVA.js не становится runtime dependency Codogma.

References:
- [EVA.js v2 repository](https://github.com/eva-engine/eva.js/tree/v2)
- [EVA.js architecture and packages](https://github.com/eva-engine/eva.js/blob/v2/README.md)
- [EVA.js Game lifecycle](https://github.com/eva-engine/eva.js/blob/v2/packages/eva.js/lib/game/Game.ts)
- [EVA.js GameObject](https://github.com/eva-engine/eva.js/blob/v2/packages/eva.js/lib/core/GameObject.ts)
- [EVA.js Component / System](https://github.com/eva-engine/eva.js/tree/v2/packages/eva.js/lib/core)

### 6. Performance evidence — browser-first

Не задавать универсальный порог в 10 000 entities/components и не обещать фиксированное ускорение CPU. ECS оценивается на representative workload и целевом browser/device.

Сравнение должно включать как минимум:
1. Текущий object/component runtime с per-object callbacks.
2. Централизованные systems поверх тех же объектов/Phaser views.
3. Data-Oriented ECS storage/systems.
4. ECS + Phaser adapter, чтобы отдельно видеть bridge overhead.

Для одного и того же сценария измерять:
- frame duration и long tasks p50/p95/p99;
- main-thread JavaScript CPU и время отдельных systems/queries;
- physics и rendering отдельно от gameplay simulation;
- allocations, GC pauses, heap high-water mark и retained objects;
- startup / scene activation / teardown;
- при необходимости CPU utilization процесса по описанной и одинаковой методике.

Фиксировать browser/version, OS/device/CPU, GPU/renderer, viewport/DPR, build profile, fixture/seed, warm-up, sampling window и фоновые условия. Node synthetic no-op benchmarks остаются полезны для регрессии package-level алгоритмов, но не заменяют browser acceptance. Headless/SwiftShader не является доказательством GPU или mobile performance.

60 FPS означает общий frame budget около 16.67 ms, но не предписывает Core/ECS постоянную квоту 1.67 ms. Подбюджеты назначаются только после повторяемых measurements на целевых устройствах и с запасом на physics/render/browser/SDK work.

ECS принимается как оптимизация только там, где сравнение показывает выигрыш в существенной метрике без потери correctness, deterministic behavior, малого-сценарного latency, memory budget и управляемости integration. Если конкретная игра CPU-bound из-за physics/render/asset overdraw, ECS не используется как замена оптимизации этой подсистемы.

### 7. Package selection и production build

- Установка `@codogma/ecs`, project feature enablement и включение в конкретный target build — разные состояния.
- Feature Registry описывает optional feature `runtime.ecs` и её package provider/dependencies; Phaser integration объявляется отдельно (`runtime.ecs-phaser`).
- Если пакет не установлен/не включён, Editor/Build выдаёт ясную диагностику при ссылке на его feature; установка не происходит автоматически.
- Если ECS выключен, production artifact должен физически не содержать ECS package code и его adapter modules. Одного UI checkbox или feature descriptor недостаточно: нужны import graph/output manifest/size evidence.
- Editor-only, build-only и QA packages не попадают в game runtime. `@codogma/cge` остаётся базовым package, остальные runtime packages включаются только по выбору проекта и target.

## Последствия

**Положительные:** object/component Core остаётся простым и доступным; Data-Oriented ECS может развиваться независимо; игры без массовых сущностей не платят за ECS dependency; Phaser boundary остаётся заменяемой; оптимизационные claims подтверждаются на браузерных workloads.

**Компромиссы:** появятся отдельные package lifecycle/API/versioning, ECS-to-Project mapping, optional adapter и сравнительные performance fixtures. Editor, Feature Registry и Build Pipeline должны различать persisted Component Schema, runtime ECS storage и фактический состав production artifact.

## Реализация и ownership

- [COD-111](https://linear.app/codogma-engine/issue/COD-111/sozdat-nezavisimyj-optional-codogmaecs-package-s-data-oriented-storage) — самостоятельный `@codogma/ecs` package и Data-Oriented storage/scheduler.
- [COD-112](https://linear.app/codogma-engine/issue/COD-112/sozdat-optional-codogmaecs-phaser-adapter) — отдельный optional Phaser adapter.
- COD-21 / COD-48 — общие measurement protocol и performance regression fixtures.
- COD-33 / COD-34 / COD-35 — project/package dependency graph, Feature Registry и физически selective HTML5 build.
- COD-26 / COD-105 — базовый host-neutral Component Core; не включают реализацию ECS package.
