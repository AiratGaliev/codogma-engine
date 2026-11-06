# Baseline производительности

**Базовый снимок репозитория:** `dev` на `3351b069a11c7992fb28324ae22b48a411f307c7`, 29.10.2026. CI Fast подтверждает только заданные workflow checks и не является performance result; актуальный статус PR проверяется по live checks. Измерения производительности остаются не снятыми.  
**Статус:** документ и протокол измерений созданы; достоверные численные baseline results ещё не сняты. В репозитории нет оснований утверждать конкретные FPS, CPU %, latency или размер собранной игры.

## Цель и границы

Снять воспроизводимые baseline measurements для существующего editor workflow, Core, Phaser runtime, optional ECS и production build. Измерения нужны перед оптимизациями и перед введением performance budgets. Они не должны задерживать независимую реализацию контрактов, но значения нельзя заменять оценочными цифрами. ECS benchmark обязан сравнивать один и тот же workload в одном browser/device окружении; отдельный Node no-op benchmark не доказывает browser/gameplay performance.

## Закреплённые тестовые сценарии

| ID | Сценарий | Fixture / окружение | Основные метрики | Статус |
|---|---|---|---|---|
| PERF-01 | Холодный старт сервера и открытие IDE | `tests/workspace/test-typescript`; Node.js 22; точная ОС/CPU/browser version записать при запуске | Время старта сервера, HTTP ready, navigation/first usable UI | Не измерено |
| PERF-02 | Открытая IDE без взаимодействия | Одна неизменяемая тестовая сцена; браузер в foreground; фиксированный интервал 60 s | Средний/пиковый CPU процесса/вкладки, память до/после, фоновые задачи | Не измерено |
| PERF-03 | Native Scene authoring | Native Project/Scene v1 fixture plus a fixed transform/Inspector/Undo/Redo scenario | p50/p95 frame duration, input-to-paint latency, save/reopen time | Not measured |
| PERF-04 | Native Asset import/preview | Fixed set of images, spritesheets, fonts and video; record file counts and sizes | Import duration, preview first-frame time, peak memory, errors and cleanup | Not measured |
| PERF-05 | Native runtime Scene | Phaser 4.2.1 fixture with fixed Nodes/Components/FX; record browser/GPU and Build revision | Startup time, frame-time p50/p95, long tasks, output raw/gzip size | Not measured |
| PERF-06 | Core vertical slice | Project → Scene → Node/Transform → component → save/reopen → preview/build fixture | Время сериализации, round-trip, start/stop/restart, build duration | Будет доступно после реализации |
| PERF-07 | Web host lifecycle and recovery | Release fixture в foreground/background и target iframe/WebView; отдельный прогон с WEBGL_lose_context | Восстановление ресурсов/состояния, дубликаты listeners, CPU после hidden tab | Не измерено |
| PERF-08 | Low-end mobile and first load | Зафиксированные Android/iOS device/browser/host, стабильные assets и cold cache | compressed/raw initial download, time-to-first-frame, first input, memory high-water mark, long tasks, asset failures | Не измерено |
| PERF-09 | Object runtime vs Data-Oriented ECS | Один browser fixture и игровой workload с вариантами: object/component callbacks, centralized systems на тех же views, Data-Oriented ECS, ECS + Phaser adapter; cohorts 50/100/220+ и matching AI/transform data | frame p50/p95/p99, main-thread CPU, per-system/query time, physics/render breakdown, allocations/GC, heap high-water, startup/teardown | Запланировано; сравнимый fixture ещё не реализован |
| PERF-10 | Runtime package / Phaser build composition | Один Project Model + generated-game fixture с фиксированными assets/API; full vendor Phaser vs supported upstream Arcade-only UMD vs validated custom/ESM path; ECS feature on/off | raw/gzip/Brotli output, JS chunks/module inclusion, JS parse/compile, time-to-first-frame, API coverage, runtime errors, asset requests | Запланировано; текущий vendor bundle selection не доказан |

## Протокол

1. Зафиксировать SHA исходников, Node/npm versions, ОС/CPU/RAM, браузер и версию GPU/драйвера; для browser runtime записать WebGL/GPU mode и фоновую нагрузку.
2. Зафиксировать fixture и сценарий взаимодействия вместе с результатом; не менять ассеты между повторами.
3. Для cold start выполнить 5 прогонов и записать все значения. Для steady-state использовать 3 повторных запуска после прогрева; записывать raw samples, median и p95, а не одно лучшее значение.
4. Не сравнивать разные машины/браузеры или разные fixtures без пометки. Для CPU использовать одну согласованную методику (browser performance trace либо OS process metrics) и описать способ получения результата. При необходимости разделять вкладку/browser main thread, renderer/GPU process и общий OS process utilization; CPU % из Task Manager без описания sampling scope не является CPU time конкретной игровой подсистемы.
5. Сохранять trace/log или небольшую сводку в PR/CI artifact. Сначала определить baseline, затем обсуждать budgets на основании наблюдаемого workload.
6. Не использовать один headless SwiftShader result как замену измерению целевого браузера с фактическим GPU; отдельно помечать headless/CI environment.
7. Для Web сравнивать одинаковый artifact/build profile, viewport/DPR, browser, host/iframe policy и cache state. Фиксировать cold-cache и warm-cache; не выводить mobile performance из desktop/headless результата.
8. Для ECS фиксировать идентичный seed, spawn schedule, entity/component counts, активные состояния, AI decision frequency, collision setup и визуальный output. Сравнивать не только p95 system time, но и end-to-end frame time, GC/allocation rate, heap, memory retention и адаптерный overhead. Не отключать physics/rendering только у одного кандидата.
9. 60 FPS соответствует общему frame interval около 16.67 ms, но это не устанавливает автоматическую квоту для Core/ECS. Подбюджеты определять после повторяемого baseline с запасом на browser, physics, rendering, platform SDK и host work.

## Наблюдения из статического аудита

- Текущий `npm run build` компилирует editor TypeScript project references; это не benchmark или headless game build.
- CI Fast выполняет build/server/security smoke, а не performance suite.
- В текущей интеграции Phaser 4.2.1 runtime подключается vendored full bundle `scripts/phaser.min.js`; эффект реального feature selection на размере bundle не доказан. Upstream v4.2.1 имеет отдельный UMD `phaser-arcade-physics(.min)` без Matter.js, но package root не объявляет public export subpath для него; ESM entry point не является доказательством tree shaking. Сравнение и output-level evidence принадлежат PERF-10/COD-35.
- Известные runtime follow-ups FX/Box2D/Asset Library

## ECS comparison — правила интерпретации

Data-Oriented ECS не принимается по количеству сущностей или synthetic benchmark throughput. Сравниваются четыре конфигурации одного и того же игрового workload:

1. Object/component runtime с индивидуальными callbacks.
2. Централизованные systems поверх тех же object/Phaser views (контрольный вариант, который отделяет пользу централизации от storage layout).
3. Data-Oriented ECS без Phaser bridge overhead (измерение чистых ECS systems).
4. Data-Oriented ECS с `@codogma/ecs-phaser` adapter и тем же renderer/physics path.

Отчёт должен отдельно показывать:
- simulation/system/query time и main-thread CPU;
- Physics и Render time, а также collision/overlap counts;
- p50/p95/p99 frame duration и long tasks;
- allocation rate, GC pause/count и heap high-water/retained objects;
- initial scene activation, entity creation/destruction и deterministic teardown;
- correctness parity и отсутствие изменения игрового поведения.

Browser benchmark фиксирует реальные browser version, OS/device/CPU, GPU/driver, viewport/DPR, build profile, fixture hash, seed, warm-up, sampling window и background workload. Node synthetic benchmarks полезны для локальных алгоритмических регрессий, но не заменяют target-browser measurement. Не использовать результат headless SwiftShader как подтверждение реальной GPU/mobile производительности.

**Не устанавливать заранее** порог 10 000 entities/components или 1.67 ms для Core. Общий frame interval 60 FPS составляет около 16.67 ms, но доля, доступная игре, зависит от браузера, rendering, physics, SDK и устройства. Budgets утверждаются только после повторяемых результатов и должны иметь запас.

## Bundle composition comparison — Phaser и optional packages

Для одного и того же generated-game fixture сравнивать full vendored Phaser, upstream supported variants и custom builds только если они имеют эквивалентный API coverage. Сохранять output manifest, module/chunk listing, raw/gzip/Brotli size, parse/compile/startup и browser smoke. Feature выключена только тогда, когда её код физически отсутствует в artifact или доказуемо lazy-loaded вне текущего startup path; отметка в project settings не является доказательством.

Optional `@codogma/ecs` и `@codogma/ecs-phaser` должны иметь отдельные on/off consumers. В конфигурации без ECS соответствующие packages и их code modules не должны присутствовать в release artifact. Проверять это по реальному import graph и emitted output, а не только по `package.json` или Feature Registry descriptor.


## Запись результатов

При первом измерении заменить статусы `Не измерено` только вместе с evidence:

| Поле | Значение |
|---|---|
| Commit SHA | Не записан |
| ОС / CPU / RAM | Не записано |
| Node.js / npm | Не записано |
| Браузер / GPU | Не записано |
| Fixture hash / набор ресурсов | Не записано |
| Raw samples / trace | Не приложены |
| Summary (median / p95) | Не измерено |

Не ставить performance threshold, пока одна и та же процедура не даст воспроизводимые результаты.
