# Baseline производительности

**Базовый снимок репозитория:** `dev` на `3351b069a11c7992fb28324ae22b48a411f307c7`, 29.10.2026. CI Fast сам по себе не является performance result: численные значения принимаются только из отдельного измерительного шага с зафиксированным workload, окружением и raw samples. Частичный Core native Scene baseline зафиксирован ниже; остальные сценарии остаются не измерены.  
**Статус:** частичный численный baseline снят для Core native Scene workload (PERF-06, CI run #962); остальные сценарии, включая браузерный runtime, Preview/Build и mobile, остаются не измерены. В репозитории нет оснований утверждать конкретные FPS, CPU %, latency или размер собранной игры.

## Цель и границы

Снять воспроизводимые baseline measurements для существующего editor workflow, Core, Phaser runtime и production build. Измерения нужны перед оптимизациями и введением performance budgets; значения нельзя заменять оценочными цифрами. Сравнительная серия optional ECS учитывается в PERF-09, а её workload, методика и критерии приёмки определяются только [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md). Этот документ хранит процедуру проведения измерений и фактические evidence.

## Закреплённые тестовые сценарии

| ID | Сценарий | Fixture / окружение | Основные метрики | Статус |
|---|---|---|---|---|
| PERF-01 | Холодный старт сервера и открытие IDE | `tests/workspace/test-typescript`; Node.js 22; точная ОС/CPU/browser version записать при запуске | Время старта сервера, HTTP ready, navigation/first usable UI | Не измерено |
| PERF-02 | Открытая IDE без взаимодействия | Одна неизменяемая тестовая сцена; браузер в foreground; фиксированный интервал 60 s | Средний/пиковый CPU процесса/вкладки, память до/после, фоновые задачи | Не измерено |
| PERF-03 | Native Scene authoring | Native Project/Scene v1 fixture plus a fixed transform/Inspector/Undo/Redo scenario | p50/p95 frame duration, input-to-paint latency, save/reopen time | Not measured |
| PERF-04 | Native Asset import/preview | Fixed set of images, spritesheets, fonts and video; record file counts and sizes | Import duration, preview first-frame time, peak memory, errors and cleanup | Not measured |
| PERF-05 | Native runtime Scene | Phaser 4.2.1 fixture with fixed Nodes/Components/FX; record browser/GPU and Build revision | Startup time, frame-time p50/p95, long tasks, output raw/gzip size | Not measured (browser/runtime) |
| PERF-05A | Core ↔ Phaser adapter bridge (synthetic) | `packages/runtime-phaser/benchmarks/runtime-phaser.bench.ts`; Node.js; mock Phaser host; 100/1,000/10,000 Nodes + one Component/view per Node | Core-only vs adapter startup, update/frame median+p95, teardown; 5 samples × 30 frames | Benchmark implemented; CI numbers pending; not browser evidence |
| PERF-06 | Core vertical slice | Project → Scene → Node/Transform → component → save/reopen → preview/build fixture | Время сериализации, round-trip, start/stop/restart, build duration | Частично измерено: native Scene serialization/hydration/update/disposal ниже; Project save/reopen, Preview и Build не измерены |
| PERF-07 | Web host lifecycle and recovery | Release fixture в foreground/background и target iframe/WebView; отдельный прогон с WEBGL_lose_context | Восстановление ресурсов/состояния, дубликаты listeners, CPU после hidden tab | Не измерено |
| PERF-08 | Low-end mobile and first load | Зафиксированные Android/iOS device/browser/host, стабильные assets и cold cache | compressed/raw initial download, time-to-first-frame, first input, memory high-water mark, long tasks, asset failures | Не измерено |
| PERF-09 | Object runtime vs Data-Oriented ECS | Сопоставимый browser fixture и workload variants согласно [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md) | Сравнительные метрики и критерии по ADR-0004; raw samples, traces и статус измерения фиксируются здесь | Запланировано; сравнимый fixture ещё не реализован |
| PERF-10 | Runtime package / Phaser build composition | Один Project Model + generated-game fixture с фиксированными assets/API; full vendor Phaser vs supported upstream Arcade-only UMD vs validated custom/ESM path; ECS feature on/off | raw/gzip/Brotli output, JS chunks/module inclusion, JS parse/compile, time-to-first-frame, API coverage, runtime errors, asset requests | Запланировано; текущий vendor bundle selection не доказан |

## Протокол

1. Зафиксировать SHA исходников, Node/npm versions, ОС/CPU/RAM, браузер и версию GPU/драйвера; для browser runtime записать WebGL/GPU mode и фоновую нагрузку.
2. Зафиксировать fixture и сценарий взаимодействия вместе с результатом; не менять ассеты между повторами.
3. Для cold start выполнить 5 прогонов и записать все значения. Для steady-state использовать 3 повторных запуска после прогрева; записывать raw samples, median и p95, а не одно лучшее значение.
4. Не сравнивать разные машины/браузеры или разные fixtures без пометки. Для CPU использовать одну согласованную методику (browser performance trace либо OS process metrics) и описать способ получения результата. При необходимости разделять вкладку/browser main thread, renderer/GPU process и общий OS process utilization; CPU % из Task Manager без описания sampling scope не является CPU time конкретной игровой подсистемы.
5. Сохранять trace/log или небольшую сводку в PR/CI artifact. Сначала определить baseline, затем обсуждать budgets на основании наблюдаемого workload.
6. Не использовать один headless SwiftShader result как замену измерению целевого браузера с фактическим GPU; отдельно помечать headless/CI environment.
7. Для Web сравнивать одинаковый artifact/build profile, viewport/DPR, browser, host/iframe policy и cache state. Фиксировать cold-cache и warm-cache; не выводить mobile performance из desktop/headless результата.
8. ECS workload parameters (seed, spawn schedule, cohort/state, AI frequency, collision setup and visual output) фиксируются и уравниваются по [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md); не отключать physics/rendering только у одного кандидата.
9. Не вводить универсальный entity-count threshold или фиксированную Core/ECS frame quota; нормативное performance решение и интерпретация budget заданы [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md).

## PERF-05A — synthetic Core ↔ Phaser adapter bridge

The adapter workspace contains `npm run benchmark --workspace=@codogma/runtime-phaser`. It consumes the native Project fixture shape, measures Core-only and adapter-backed sessions at 100, 1,000 and 10,000 Nodes, each with one Core Component (and one adapter Phaser view) per Node, and records startup, per-frame update median/p95 and teardown over five samples of 30 frames. Raw samples are emitted with the summary. The adapter path uses a structural mock Phaser host so the measurement isolates Core graph/view creation and projection overhead.

**Interpretation boundary:** these are Node.js synthetic measurements. They do not include a real Phaser renderer, WebGL/Canvas, browser event loop, GPU, asset decoding, physics, input or mobile device behaviour. They cannot establish browser FPS or an ECS speed-up. The actual Phaser browser/runtime PERF-05 remains unmeasured until a browser acceptance run records the target environment and evidence.

## PERF-06 — частичный baseline Core native Scene (CI)

**Измерено:** 09.11.2026, отдельным шагом Measure native Core Scene baseline в [CI Fast run #962](https://github.com/AiratGaliev/codogma-engine/actions/runs/42572900017), PR [#60](https://github.com/AiratGaliev/codogma-engine/pull/60).

| Поле | Значение |
|---|---|
| PR head SHA | 1651ecd58b9817eddfd3328186d32ec4e4e036bb |
| Executed CI merge SHA (GITHUB_SHA) | 4f57bc983a794a0502d82fb38553ffc996954f6f (synthetic pull-request merge ref, не merge в dev) |
| CI run | 42572900017 / run #962; conclusion: success |
| ОС / kernel / architecture | GitHub Actions Linux runner / 7.0.0-1019-azure / x64 |
| CPU / memory | AMD EPYC 9V74 80-Core Processor / 15,983 MiB |
| Node.js / npm | v22.23.4 / npm/10.9.9 |
| Browser / GPU | Не применимо: Node.js benchmark, не browser/runtime measurement |
| Samples / workload | 5 samples на каждый размер; 30 update frames/sample; fixed deltaSeconds = 1/60; отдельный warm-up на 250 Nodes |
| Измеряемый путь | Scene JSON serialization → ProjectSceneLoader composition/hydration → activation → Component movement callbacks → deactivate/dispose |
| Benchmark implementation | packages/cge/benchmarks/component-world.bench.ts |

Одна Scene содержит N root Nodes и N Components одного типа с независимым speed (1–4). Component callback обновляет локальную позицию на каждом host-owned frame и накапливает checksum. Каждый sample проверяет количество callbacks, checksum, количество onDestroy и полное освобождение World. Scene JSON SHA-256 фиксирует идентичность входного fixture.

| Nodes / Components | Scene JSON bytes | Scene SHA-256 | Serialize (1 sample) | Loader median / p95 | Compose median | Activate median | Update/frame median / p95 | Teardown median | Component callbacks/s |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 100 | 53,397 | bcdd0a17eff868820daa6e3a8da97bc24da78de7c81c4d7244ac717c134dd8f1 | 2.135 ms | 3.235 / 4.153 ms | 0.104 ms | 0.086 ms | 0.010 / 0.039 ms | 0.082 ms | 4,899,165 |
| 1,000 | 535,799 | a761e6eb41a6e887363d20a8b48fa9981f065df5ec65960100f022691865c0cd | 15.154 ms | 21.790 / 33.468 ms | 0.156 ms | 0.543 ms | 0.135 / 0.177 ms | 0.404 ms | 7,050,811 |
| 10,000 | 5,386,801 | 0a466f026532681808aeb77171a0a3aa873cb2ccee29dfe900cab4023c04e5ec | 127.016 ms | 188.553 / 204.779 ms | 0.094 ms | 8.518 ms | 2.512 / 2.700 ms | 4.613 ms | 3,928,217 |

**Raw samples (ms), порядок соответствует пяти последовательным samples в CI log:**

| Nodes | Loader load | Update/frame | Activation | Teardown |
|---:|---|---|---|---|
| 100 | 4.153, 3.235, 2.274, 2.464, 3.329 | 0.039, 0.036, 0.007, 0.010, 0.010 | 0.086, 0.098, 0.056, 0.056, 0.102 | 0.142, 0.071, 0.082, 0.073, 0.171 |
| 1,000 | 28.587, 21.790, 33.468, 21.756, 16.073 | 0.166, 0.177, 0.133, 0.135, 0.099 | 0.849, 0.543, 0.567, 0.452, 0.375 | 0.484, 0.404, 0.809, 0.320, 0.350 |
| 10,000 | 202.823, 186.397, 204.779, 172.735, 188.553 | 2.512, 2.480, 2.498, 2.538, 2.700 | 10.164, 7.916, 8.518, 10.186, 6.916 | 5.982, 4.613, 5.708, 3.824, 4.051 |

**Интерпретация и ограничения:**

- P95 вычислен nearest-rank методом на пяти sample и поэтому равен максимуму пяти значений; это ориентир для первичного baseline, не стабильная latency SLO.
- Serialization — один timed call на fixture, не median/p95. Loader/activation/update/teardown агрегируются по пяти samples.
- Callback workload — намеренно простой CPU-only movement/checksum; он проверяет host tick, Component execution и lifecycle, но не physics, rendering, asset IO, браузерные frame times или реальную игру.
- Runner CPU/RAM и virtualized CI environment не являются целевым пользовательским устройством. Эти числа пригодны для будущих сравнений только при сопоставимом runner/runtime/fixture.
- Измерение покрывает только Core native Scene slice. Project save/reopen, Preview, Phaser adapter, HTML5 Build, browser/GPU и low-end mobile остаются вне этой серии; полная приёмка PERF-06 ещё не завершена.
- Полный JSON rawSamples, npm user-agent, runtime metadata и fixture hashes доступны в [CI run #962 logs](https://github.com/AiratGaliev/codogma-engine/actions/runs/42572900017). Performance thresholds не вводятся.



## Наблюдения из статического аудита

- Текущий `npm run build` компилирует editor TypeScript project references; это не benchmark или headless game build.
- CI Fast выполняет build/server/security smoke, а не performance suite.
- В текущей интеграции Phaser 4.2.1 runtime подключается vendored full bundle `scripts/phaser.min.js`; эффект реального feature selection на размере bundle не доказан. Upstream v4.2.1 имеет отдельный UMD `phaser-arcade-physics(.min)` без Matter.js, но package root не объявляет public export subpath для него; ESM entry point не является доказательством tree shaking. Сравнение и output-level evidence принадлежат PERF-10/COD-35.
- Известные runtime follow-ups FX/Box2D/Asset Library

## ECS comparison — правила интерпретации

Нормативные правила сравнения object/component, centralized systems, Data-Oriented ECS и ECS + Phaser adapter, включая workload parity, метрики, интерпретацию и критерии принятия performance improvement, содержатся только в [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md). Этот документ хранит протокол проведения измерений и фактические результаты PERF-09, не дублируя архитектурные требования.

## Bundle composition comparison — Phaser и optional packages

Для одного и того же generated-game fixture сравнивать full vendored Phaser, upstream supported variants и custom builds только если они имеют эквивалентный API coverage. Сохранять output manifest, module/chunk listing, raw/gzip/Brotli size, parse/compile/startup и browser smoke. Feature выключена только тогда, когда её код физически отсутствует в artifact или доказуемо lazy-loaded вне текущего startup path; отметка в project settings не является доказательством.

- Проверку ECS on/off consumers и физического отсутствия optional package modules в Release выполнять по нормативному контракту [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md); PERF-10 сохраняет output manifest, import graph и измеренный размер artifact.


## Запись результатов

Частичные результаты PERF-06 Core native Scene зафиксированы в одноимённом разделе выше: CI run #962, PR head `1651ecd58b9817eddfd3328186d32ec4e4e036bb`, synthetic CI merge SHA `4f57bc983a794a0502d82fb38553ffc996954f6f`, Linux x64 / AMD EPYC 9V74 / Node.js 22.23.4 / npm 10.9.9. Fixture hashes, raw samples и summary приведены в таблицах; полный runtime output находится в [CI run #962 logs](https://github.com/AiratGaliev/codogma-engine/actions/runs/42572900017).

Для каждого ещё не измеренного сценария PERF-01…PERF-10 сохранять отдельные evidence: точный source/build SHA, окружение, fixture/resource hash, raw samples или trace, median/p95 и ограничения применимости. Не переносить Node/Linux microbenchmark на browser/GPU/mobile и не считать его заменой functional acceptance.

Не ставить performance threshold, пока одна и та же процедура не даст воспроизводимые результаты на сопоставимом окружении.
