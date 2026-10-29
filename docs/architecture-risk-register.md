# Architecture Risk Register: Codogma Engine

**Обновлено:** 29.10.2026. Это список проверяемых рисков, не рейтинг движков и не обещание реализованной функциональности.

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
| Молчаливые миграции | Старый project теряет неизвестные поля | Versioned migrations, backup/atomic write, диагностировать неизвестную версию | Golden fixtures, round-trip, interrupted write/rollback |
| Feature Registry ≠ tree-shaking | UI выключает capability, но код остаётся в bundle | Registry — input to build, не proof исключения | Manifest, dependency graph и output-level proof |
| Недостоверная абстракция backend | Общий physics/audio API скрывает разные semantics | Capability matrix и explicit backend extensions | Contract tests и unsupported capability cases |
| Ненадёжное browser storage | quota/private-mode/partial write ведёт к потере данных | Versioned data, validation, recoverable writes и quota handling | Quota/denied/corrupt/multi-tab tests |
| Неповторяемая сборка | Плавающие зависимости/asset order меняют output | Lockfiles, pinned runtime/tools, deterministic manifest/build profile | Clean install и сравнение manifests/output |
| Provenance/licensing | Package/asset публикуется без notices | Source inventory, license review, SBOM; security scan не заменяет license review | Проверка release artifact |

## Уроки из Unity 6, Cocos Creator, Godot и Defold

Это comparison архитектурных направлений и документированных ограничений, а не универсальный вердикт по качеству движка.

| Reference | Что изучать | Ограничения/критика, которую проверять | Как избежать повторения |
|---|---|---|---|
| **Unity 6** | Цельный Editor → assets → build profiles → Package Manager → profiling workflow | Web имеет отдельные browser/system requirements; Unity packages/URP не копируются как universal architecture | Разделить editor/runtime/build; отключение capability подтверждать output report, не checkbox |
| **Cocos Creator 4.0 / Cocos 4** | TypeScript-first 2D workflow, sorting/batching, target build selection | Manual Cocos Creator 4.0 и исходная ветка Cocos 4 — разные references; manifest не доказывает bundle tree-shaking | Закреплять версии manual/source и проверять чистую fixture-сборку |
| **Godot 4.x Web** | Scene/Node model, integrated authoring, export templates | Godot 4.5 docs указывают WebAssembly/WebGL 2, отсутствие Web export для C# в Godot 4; threaded build требует cross-origin isolation. Есть Web Audio trade-offs | JS/TS-native API и default build без обязательной COOP/COEP; ограничения показывать в target capability table |
| **Defold** | Web runtime, explicit heap size и HTML5 size/memory workflow | Engine/game size и heap — разные показатели; маленький heap даёт allocation failures, большой вреден low-end devices | Раздельно считать transfer size, decoded/GPU memory и heap/high-water mark |

Community reports Godot Web упоминают startup size, Safari/mobile, cross-origin headers и export plugins, но эти reports — test hypotheses, не доказательство дефекта актуальной версии. Использовать [официальный Godot 4.5 Web manual](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html), [community thread](https://www.reddit.com/r/godot/comments/1qx4qr8/limitations_of_web_build/), [Defold HTML5 manual](https://defold.com/manuals/html5/) и [Defold size guide](https://defold.com/manuals/optimization-size/) с фиксацией version/device/host.

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
| Generated-code compatibility | Legacy fixture remains usable + migration diagnostics |

Риск закрывается только после fixture, success/failure tests и target runtime/host acceptance там, где нужна реальная платформа. Нет устройства/host — статус **unverified**, а не supported.
