# Architecture Risk Register: Codogma Engine

**Обновлено:** 05.11.2026. Это список проверяемых рисков, не рейтинг движков и не обещание реализованной функциональности.

Связанные документы: [ТЗ](technical-specification.md), [roadmap](roadmap.md), [capability matrix](capability-matrix.md), [dependency matrix](dependency-capability-matrix.md), [performance baseline](performance-baseline.md), [reference sources](REFERENCE-SOURCES.md).

## Web-first риски

| Риск | Почему проявляется | Контрмера | Acceptance |
|---|---|---|---|
| Desktop preview ≠ целевой host | iframe/WebView ограничивает fullscreen, focus, CORS, audio activation или messaging | Каждый host — отдельный target; versioned adapter, origin validation, capabilities/fallback | Smoke на реальном embedded host |
| Cross-origin isolation | Threaded WebAssembly/SharedArrayBuffer требует COOP/COEP; заголовки могут конфликтовать с SDK/рекламой | Default build не требует isolation; threaded profile — opt-in после proof/measurement | Exact hosting fixture, negative test без заголовков |
| WebGL context loss | Canvas остаётся чёрным или содержит невалидные GPU handles | Хранить авторское состояние отдельно от GPU handles; восстановление или явный fallback | Потеря/restore через [WEBGL_lose_context](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context/loseContext), повторные stop/start |
| Hidden-tab lifecycle | rAF/timers throttled; большой delta нарушает симуляцию | Единый lifecycle state, idempotent pause/resume, fixed-step backlog policy | Hidden/visible, mobile lock, pause during ad/load |
| Audio autoplay | AudioContext suspended, play() rejected | User gesture для активации; отказ аудио не ломает gameplay | Cold start без gesture и recovery после взаимодействия |
| Bundle/memory | Transfer size не равен decoded/GPU memory; тяжелый runtime тормозит first frame | Раздельные метрики download, decoded/GPU memory и lazy loading | Raw/gzip, time-to-first-frame, first input, mobile high-water mark |
| Второй game loop | ECS/physics/Phaser одновременно двигают время | Один owner loop, update order и fixed-step contract | Frame stalls, 30/60/120 Hz, pause/resume/cleanup |
| Два источника истины | Editor model/runtime/generated source мутируют параллельно | Project Model — авторский источник; runtime из snapshot; transient state отделён | Save/reopen + preview snapshot + runtime mutation |
| Неявный plugin execution | Metadata ошибочно принимают за sandbox | Discovery читает manifest; execution только после разрешения; пакет считается trusted без real sandbox | Unsupported/broken extension fixture, disable/recover |
| Потеря данных при обновлении опубликованной schema | Версионное преобразование может потерять пользовательские поля | Разрешать schema evolution только между опубликованными версиями Codogma; использовать validation, backup и atomic write, диагностировать неподдерживаемые версии | Fixtures выпущенных schemas, round-trip, interrupted write/rollback |
| Feature Registry ≠ tree-shaking | UI выключает capability, но код остаётся в bundle | Registry — input to build, не proof исключения | Manifest, dependency graph и output-level proof |
| Object/component state duplicated in ECS and Phaser | Transform/HP/AI state may be mutated by multiple owners; sync loops can create drift and extra per-frame work | Keep `@codogma/cge`, optional `@codogma/ecs` and `@codogma/ecs-phaser` boundaries explicit; use stable ID mapping and one owner per mutable value | Round-trip + runtime mapping tests, repeated update/resize, pause/resume and destroy/recreate without drift |
| ECS assumed to fix any CPU bottleneck | Data-Oriented storage reduces some iteration/allocation costs but does not eliminate Phaser physics, rendering, overdraw, browser scheduling or SDK work | Compare object callbacks, centralized object systems, ECS and ECS+adapter on identical browser/device workloads; no universal entity threshold or guaranteed percentage | PERF-09 raw traces with p50/p95/p99, CPU/system/query, physics/render, GC and heap |
| Optional ECS leaks into non-ECS games | Core or base Phaser adapter may accidentally import optional ECS or its adapter through convenience exports/side effects | `@codogma/ecs` is not a dependency of `@codogma/cge`; `@codogma/ecs-phaser` is not a dependency of base `@codogma/runtime-phaser`; explicit project dependencies/features only | Packed consumer without ECS and production artifact/module report proving both packages absent |
| Phaser modular build over-promises tree shaking | Feature checkbox or ESM entry point may leave unwanted Phaser code in emitted output or break required runtime APIs | Compare pinned Phaser 4.2.1 full vendor bundle, upstream Arcade-only UMD (Matter excluded) and validated custom/ESM builds on equivalent native runtime fixtures; never invent package export paths | PERF-10 output manifest, raw/gzip sizes, runtime API coverage, startup/browser smoke |
| ESM import mode inferred from package.json | Обычный manifest может включать отсутствующий `phaser`/`@phaserjs/editor-scripts-base` import; TypeScript Script Asset должен разрешаться в корректный emitted JavaScript module | Различать исходный TypeScript Script source и emitted JS module; dependency declarations/resolution валидировать с диагностикой; не устанавливать зависимости молча | Native Script-module fixtures для `.ts` → `.js`, missing/declared dependency и package-based target |
| Недостоверная абстракция backend | Общий physics/audio API скрывает разные semantics | Capability matrix и explicit backend extensions | Contract tests и unsupported capability cases |
| Ненадёжное browser storage | quota/private-mode/partial write ведёт к потере данных | Versioned data, validation, recoverable writes и quota handling | Quota/denied/corrupt/multi-tab tests |
| Неповторяемая сборка | Плавающие зависимости/asset order меняют output | Lockfiles, pinned runtime/tools, deterministic manifest/build profile | Clean install и сравнение manifests/output |
| Provenance/licensing | Package/asset публикуется без notices | Source inventory, license review, SBOM; security scan не заменяет license review | Проверка release artifact |

## Уроки из Unity 6, Cocos Creator, Godot и Defold

Это comparison архитектурных направлений и документированных ограничений, а не универсальный вердикт по качеству движка.

| Reference | Что изучать | Ограничения/критика, которую проверять | Как избежать повторения |
|---|---|---|---|
| **Unity 6** | Цельный Editor → assets → build profiles → Package Manager → profiling workflow | Web имеет отдельные browser/system requirements; Unity packages/URP не копируются как universal architecture | Разделить editor/runtime/build; отключение capability подтверждать output report, не checkbox |
| **Cocos Creator 4.0 manual / separate COCOS 4 source** | Creator scene/asset workflows, sorting/batching; COCOS 4 source — отдельный исследовательский reference | Creator 4.0 manual обозначает себя как LTS, но также говорит о 3.x как latest; `cocos/cocos4` не является тем же SDK line, а manifest не доказывает tree-shaking | Pin exact manual/source version, verify release availability/API and fixture build; retain Creator 3.8 LTS as separate reference |
| **Godot 4.x Web** | Scene/Node model, integrated authoring, export templates | Godot 4.5 docs указывают WebAssembly/WebGL 2, отсутствие Web export для C# в Godot 4; threaded build требует cross-origin isolation. Есть Web Audio trade-offs | JS/TS-native API и default build без обязательной COOP/COEP; ограничения показывать в target capability table |
| **Defold** | Web runtime, explicit heap size и HTML5 size/memory workflow | Engine/game size и heap — разные показатели; маленький heap даёт allocation failures, большой вреден low-end devices | Раздельно считать transfer size, decoded/GPU memory и heap/high-water mark |

Community reports Godot Web упоминают startup size, Safari/mobile, cross-origin headers и export plugins, но эти reports — test hypotheses, не доказательство дефекта актуальной версии. Использовать [официальный Godot 4.5 Web manual](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html), [community thread](https://www.reddit.com/r/godot/comments/1qx4qr8/limitations_of_web_build/), [Defold HTML5 manual](https://defold.com/manuals/html5/) и [Defold size guide](https://defold.com/manuals/optimization-size/) с фиксацией version/device/host.

## Уроки из других полноценных Editor systems

Это инженерные observations из закреплённых upstream snapshots, не утверждение, что весь продукт или каждая его версия устроены одинаково. Подробные ссылки и task mapping — в [Editor Engineering References](editor-engineering-references.md).

| Источник | Подтверждённое решение / интересная модель | Что проверить в Codogma и чего не копировать автоматически |
|---|---|---|
| **Defold Editor** | Graph-based project/resource model; small transaction steps; all-or-nothing transactions; global Undo stack; cached outputs с upstream invalidation; resource-type registry и file-system resource-sync. | Развести canonical Project Model и transient UI/workspace state; определить atomic command boundaries, Undo grouping, cache invalidation, resource readiness и round-trip. Не объединять автоматически project data и view nodes в один graph. |
| **Fyrox** | Собственный UI toolkit отдельно от renderer, widget messages, layout system, drawing command queue и DockingManager. | Изучить docking/layout ownership отдельно от Phaser viewport. Не считать весь engine loosely coupled: upstream architecture document сам указывает на monolithic coupling и work-in-progress. |
| **o2** | 2D-oriented all-in-one Editor, nested prototypes/overrides, asset UID, reflection-driven animation произвольных полей и общий UI framework для Editor и game UI. | Проверить nested Prefab serialization, stable asset identity, Inspector/animation schema consistency. Не связывать editor-only features и dependencies с production game bundle без осознанного contract. |
| **GDevelop** | Отдельные Core, TypeScript GDJS runtime, React/Electron IDE и extensible behaviors/extensions. | Использовать как reference browser IDE/runtime boundaries и extensions. Event/no-code authoring не заменяет TypeScript components/scripts Codogma. |
| **ezEngine** | Большие подсистемы поставляются как replaceable engine/editor plugins; Editor и asset tooling явно присутствуют в source tree. | Проверить plugin capability graph, importer dependencies и headless asset processing. Учитывать Windows-only полнофункциональный editor baseline и experimental Linux editor в проверенном README. |
| **CocosBuilder** | Editable .ccb document отделён от default .ccbi publication; есть Node property metadata и custom exporters. | Разделить authoring document, editor-only metadata и runtime projection. Не копировать старый plist schema или Cocos2d-specific runtime connections как контракт Codogma. |

## WebGPU и WebAssembly: стандарты под наблюдением

На 29.10.2026 W3C указывает статус Candidate Recommendation Draft для WebGPU и WGSL; MDN помечает WebGPU как limited availability/non-Baseline и secure-context-only. WebAssembly Core 3.0 также опубликован как Candidate Recommendation Draft 28.10.2026. Это аргумент в пользу заменяемой renderer/runtime boundary, а не обязательной миграции.

- Default target остаётся на проверенном WebGL 2 path; WebGPU — opt-in backend после feature detection, adapter/device creation, device-loss recovery, formats/limits checks и browser/device acceptance.
- Core, Project Model и scene serialization не хранят GPU handles и не зависят от backend-specific resource identity.
- WASI/component-model и browser WebAssembly/JS APIs — разные execution environments. Не требовать WASI в browser runtime без доказанного use case.
- Обновлять standards watch по официальным публикациям; статус proposal/CR Draft не означает одинаковую реализацию или поддержку во всех браузерах.

## Наблюдаемые upstream failure modes: что проверять, а не копировать вслепую

Это ограниченные по версии и окружению примеры из публичных issue. Они не доказывают, что весь движок плох или что дефект остаётся в каждой версии. Их ценность — в конкретных тестах и предотвращающих контрактах.

| Источник / точная область | Подтверждённый сценарий в issue | Вывод для Codogma |
|---|---|---|
| [Cocos Creator 3.8.8 asset-db startup race, #19250](https://github.com/cocos/cocos-engine/issues/19250) — macOS 26.6.2 CI VMs / CLI build | В issue описан race: asset-db worker стартует до регистрации engine-extends importers; некоторые запуски переписывают `.meta` с wildcard importer, нарушая asset metadata и сборку. Это отчёт для определённых агентов/редакции, не универсальная частота дефекта. | Не публиковать Project Model/asset registry до завершения регистрации всех processors/importers; загрузка сцены ждёт readiness barrier. Регистрация должна быть детерминированной; тестировать cold/warm запуск CLI на чистом fixture, повторные импорты и отказ до записи metadata. |
| [Cocos Creator 3.8.8 Auto Atlas output, #19184](https://github.com/cocos/cocos-engine/issues/19184) — Web build | Issue сообщает, что при прямой ссылке на SpriteFrame исходный PNG мог попасть в bundle вместе с atlas, несмотря на настройки удаления. Автор применил post-build workaround; другой комментатор не воспроизвёл дефект в 3.8.7. На дату проверки issue оставался открытым/needs triage. | Сборочные настройки и asset metadata не доказывают оптимизацию: проверять output manifest и реальные байты bundle на сценах с прямыми/косвенными references, atlas, fallbacks и overrides. Отчёт должен выявлять дублирующиеся и неиспользуемые assets. |
| [Defold HTML5 profiler overhead, #12409](https://github.com/defold/defold/issues/12409) — 1.12.4 debug build | Issue закрыт через PR #12448 и milestone 1.13.0. Для версии 1.12.4 автор сообщил о падении FPS в debug builds и стоимости memory-reporting profiler около 4 ms на MacBook Pro M4. Это исторический version-specific case, не утверждение о текущем Defold. | Performance instrumentation сама имеет стоимость. Измерять release, debug и profiler-enabled builds раздельно; задавать overhead budget для profiler и возможность отключать дорогие counters. |
| [Godot WebKit audio crash, #116750](https://github.com/godotengine/godot/issues/116750) — Godot 4.5.1, iPhone 12 / iOS 26.3 | В issue воспроизведён Safari reload/crash после повторного запуска Web Audio sample playback; на момент проверки issue находился в Platforms/Audio triage. Это конкретная комбинация engine/OS/device, не универсальный дефект Godot audio. | Нужен длительный audio soak test на реальном iOS Safari: частые play/stop, короткие звуки, memory/AudioContext lifecycle и сравнение Sample/Stream paths. Короткий smoke может не поймать накопительный дефект. |
| [Unity Web technical limitations](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/intro/technical-overview) и [Godot Web export limits](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html) | Официальные руководства описывают ограничения browser networking, threading, keyboard layout, storage, WebGL renderer, audio autoplay/effects и cross-origin isolation. Доступность зависит от engine version и export profile. | Описывать support через capability matrix на browser/host target; не переносить native assumptions в Web API. Для unsupported capabilities требовать fallback/diagnostic, а не скрывать их за универсальным API. |

Эти примеры переводятся в постоянный цикл: upstream issue → exact affected version/host → minimal reproduction fixture → regression test → release gate. Community issue — не нормативный контракт; status и fixed release повторно проверяются перед принятием решения.

## Инварианты Codogma

1. Project Model — canonical authoring data; per-scene generated TS class не требуется для data-driven Preview/Build.
2. Один owner game loop, документированный update order и fixed-step policy.
3. Unsupported feature/version/target даёт диагностику; общий API не скрывает значимые backend differences.
4. Editor/server/MCP/CLI/build/game имеют явные dependency scopes; editor/Node APIs не попадают в game bundle.
5. Package metadata — не sandbox. Extensions считаются trusted code, пока не появилась реальная isolation boundary.
6. Schema, component registry, platform adapter, host messaging и build report versioned/testable.
7. Invalid scene/asset/component data даёт structured diagnostic, а не silent coercion/partial activation.
8. Измерять startup, bundle size, memory, frame time, idle CPU отдельно; SwiftShader ≠ real device GPU.
9. Migrations and writes recoverable/atomic; feature selection доказывается output change.
10. Browser/host/device имеют supported/experimental/unsupported status; не объявлять target поддержанным без соответствующего acceptance.

## Открытые решения

| Решение | Требуемые evidence |
|---|---|
| Asset manager/memory ownership | Load/deduplicate/unload/reload/cancellation fixture + observations |
| Save atomicity/recovery | Interrupted-write fixture and backup/restore |
| Component registry/build graph | Missing/duplicate/unsupported type IDs, manifest and build diagnostics |
| Fixed timestep/pause reasons | Frame stalls, hidden/visible, ads, 30/60/120 Hz |
| Browser/host matrix and release budget | Target host + representative mobile and size/start measurements |
| Extension trust/sandbox | Threat model and isolation PoC before claiming sandbox |
| Package update/rollback | Isolated fixture, lifecycle scripts review, lockfile diff |
| Reproducible Script-module build | Registered Script modules resolve through an explicit Project manifest; emitted JS is deterministic and contains no Editor-only dependencies |

Риск закрывается только после fixture, success/failure tests и target runtime/host acceptance там, где нужна реальная платформа. Нет устройства/host — статус **unverified**, а не supported.
