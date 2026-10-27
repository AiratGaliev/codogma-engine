# Матрица возможностей Codogma Engine

**Снимок:** ветка `dev`, commit `754edaa1f7313409e99c3462a802d5fd430a9a01` (27.10.2026).  
**Метод:** статический аудит структуры/исходников и сопоставление с README, ТЗ, roadmap, CI и описанием PR #10. Это не построчная проверка всех legacy-файлов и не runtime/browser acceptance.

## Как читать статус

- **Есть в исходниках** — в репозитории обнаружены соответствующие модули/сценарии. Это не утверждение о полном end-to-end качестве.
- **Частично** — имеется часть workflow или реализация, но отсутствует согласованный контракт/интеграция либо покрытие основных сценариев.
- **Не подтверждено** — статическая реализация видна, но нет достаточных runtime/браузерных тестов.
- **Не реализовано** — целевая функция не обнаружена как законченная подсистема в текущем baseline.
- **Отложено** — сознательно не входит в первый сквозной сценарий.

## Текущие возможности и пробелы

| Подсистема | Состояние по исходникам | Evidence / область проверки | Автоматическое покрытие и ограничения | Приоритет |
|---|---|---|---|---|
| Browser IDE / Editor Host | Есть в исходниках | `source/editor/`, Colibri workbench, plugin registry, editor product metadata | CI компилирует TypeScript-проекты редактора и делает HTTP smoke. Это legacy editor, не новый Codogma Core | Сохранять регрессии; не переписывать целиком |
| Scene Editor / scene persistence | Есть в исходниках; целевой Core workflow отсутствует | `source/editor/plugins/phasereditor2d.scene/`, fixtures в `tests/workspace/test-typescript/scenes/` | Есть тестовые fixtures, но CI не подтверждает всю семантику save/reopen, Undo/Redo, вложенных объектов и миграций | P0 — пройти вертикальный acceptance slice |
| Inspector / user components | Есть в исходниках; единый новый runtime-контракт частичный | Scene Editor, component editor и `tests/workspace/test-typescript/components/` | Наличие UI/генерации не доказывает синхронизацию Inspector с live runtime объектом | P0 — Core/component vertical slice |
| Prefabs / Undo-Redo | Есть в исходниках | Scene Editor и fixture-сцены Prefab | Нужны регрессионные проверки вложенности, update/override, undo/redo и сохранения | P0 — данные и workflow |
| Asset Pack / import / preview | Есть в исходниках; форматная совместимость частичная | `source/editor/plugins/phasereditor2d.pack/`, Files plugin, asset-pack fixture | Для PR #10 не подтверждены ручным запуском все форматы, браузеры/GPU, каталоги больших размеров и ошибки частичного импорта | P0 для функций, затрагиваемых конкретным PR; иначе отдельные vertical slices |
| Sprite / image / video / audio preview | Есть в исходниках; runtime и browser acceptance частично не подтверждены | Asset Pack preview sections, scene video/spritesheet previews, thumbnail cache | Нужны проверки загрузки/ошибок, URL-форматов, очистки ресурсов и lifecycle blob URLs | P0 regression tests для исправленных случаев |
| Animation / Spine | Есть в исходниках | `phasereditor2d.animations`, `phasereditor2d.spine` | Текущая матрица не подтверждает runtime и экспорт для каждого вида анимации; следует тестировать отдельными fixtures | P1 — по capability gap |
| Tilemap | Есть в исходниках | `source/editor/plugins/phasereditor2d.scene/`, scene tools и MCP handlers | Полное покрытие кистей, layout/chunks, импорт/экспорт и round-trip данных не подтверждено данным аудитом | P0/P1 — после inventory конкретных пробелов |
| Arcade Physics authoring | Есть в исходниках | Phaser editor/scene tooling | Декларации и UI не заменяют запуск сгенерированной игры | P1 — target-specific runtime acceptance |
| Box2D authoring/codegen | Реализация есть; runtime acceptance не подтверждено | `Box2DBodyComponent.ts`, Box2D Inspector и codegen; для проекта требуется отдельный `PhaserBox2D.js` | Не подтверждены 30/60/120 FPS, axis/angle conversion, несколько миров, разные World Scale, stop/restart и cleanup. Debug Draw в сгенерированном runtime не реализован | P0 для соответствующей функции до объявления её принятой |
| FX Circle/Bloom/Gradient/Shine | Реализация/codegen есть; runtime acceptance не подтверждено | `source/editor/plugins/phasereditor2d.scene/src/ui/sceneobjects/fx/` | Нужны сравнение editor preview/generated game, Container/sibling order, parent transforms, alpha, cleanup/listeners и restart | P0 для затронутых FX |
| Scene code generation / JSON printer | Есть в исходниках; полное покрытие частичное | `SceneCodeDOMBuilder.ts`, `CodeUtils.ts`, `StringifyJSON.ts` | Нужны адресные tests для литералов, spread keys, вложенных объектов и ключевых codegen branches | P0 |
| Phaser integration | Phaser 4.2.1 подключён вендорным bundle | `source/editor/plugins/phasereditor2d.phaser/plugin.json`, `scripts/phaser.js`, `scripts/phaser.min.js` | Phaser не является root/editor npm dependency; declarations не поставляют runtime. Выборочная сборка Phaser по feature/target не подтверждена | P0 — зафиксировать runtime/build fixture на Этапе 4A |
| Local server / project file API | Есть в исходниках | `server/server.mjs` | Security smoke покрывает loopback, Host/Origin, некоторые symlink/upload случаи; TOCTOU race между path check и операцией не закрыт | P0 для любых новых write/package APIs; независимый Core не блокирует |
| MCP | Есть в исходниках; основной server bridge привязан к loopback | `server/mcp.mjs`, `server/mcp-stdio.mjs`, `server/mcp-launcher.mjs`; отдельно `mini-services/phaser-editor-mcp/index.mjs` | Основной встроенный bridge слушает `127.0.0.1`, но отдельный mini-service вызывает `server.listen(PORT)` без host, разрешает `Access-Control-Allow-Origin: *`, не ограничивает body и не проверяет Origin/auth. Если запустить на машине с доступным сетевым интерфейсом, удалённый клиент может отправлять MCP-команды подключённому редактору. Нынешний security smoke этот mini-service не запускает | **P0 до standalone использования/сетевой экспозиции**: bind loopback по умолчанию, request-size/time limits, Origin/Host policy и negative tests; полный schema-coverage — P1 |
| Optional AI Chat | Есть отдельный сервис; network exposure не защищён | `mini-services/ai-chat/index.mjs` запускает `createServer(...).listen(3031)` без bind-host; endpoint `/chat` без auth/rate-limit и без request-size limit передаёт сообщения в LLM SDK | Сервис необязательный и не нужен для старта редактора, но при запуске на хосте с внешним сетевым доступом может принимать чужие requests и потреблять подключённый LLM provider. Security smoke его не запускает | **P0 до standalone использования/сетевой экспозиции**: loopback bind, лимит тела/числа сообщений, timeout/rate-limit, минимальная политика Origin/auth; dependency/privacy review перед production |
| Новый Project Model / Codogma Core | Не реализовано как завершённая подсистема | Нет принятой реализационной основы в `packages/cge/` в baseline | Требуются стабильные IDs, versioned schema, migration/serialization tests и первый runtime adapter | P0 — следующий продуктовый vertical slice после strict TS pilot |
| Runtime adapter / публичный API без Phaser-зависимости | Не реализовано как стабильный public contract | ТЗ и ADR описывают целевую модель | Нужны контрактный fixture и compile/runtime acceptance; публичные типы не должны выдавать Phaser-specific objects за Core API | P0 |
| Game Preview Host / live Inspector | Частично: есть play/editor flows, но не целевая подсистема | `server/server.mjs` и editor workflows; целевые требования в ТЗ, раздел 8 | Нужны отдельный lifecycle-контракт запуска/остановки/restart, runtime messaging и live selection | P0 |
| Headless HTML5 build / feature selection | Не реализовано как подтверждённый pipeline | Текущая `npm run build` компилирует клиент редактора | Нет доказательства воспроизводимого game build без открытого editor UI, проверки asset references или исключения editor-only кода | P0 — после начального Core slice |
| Platform Services (Yandex Games / VK) | Не реализовано как единый пакетный контракт | Требования в ТЗ, раздел 11 | SDK, mocks, lifecycle, ads/payments/auth/leaderboards должны добавляться по отдельным платформенным сценариям | P1 после Core и base build |
| npm Workspaces / Feature Registry / Package Manager / Extension API | Не реализовано | Целевая архитектура в ADR-0003; текущие root/editor и mini-service package roots независимы | Нужны отдельные PoC, safety policy, package/feature compatibility tests и race-resistant file handling | P1/P2 после stable core contracts |
| Tauri / desktop shell | Не реализовано | Только планируемое направление | Не блокирует browser-first workflow; PoC только для снятия конкретного риска | P2 |
| Strict TS + lint/format/dead-code/architecture gates для нового Core | Частично: TypeScript есть у legacy editor, новый Core toolchain отсутствует | `source/editor/tsconfig-base.json`, `source/editor/package.json`, `package.json`, CI workflows | Нет активных ESLint/Prettier/Knip/dependency-cruiser/Vitest scripts. Legacy TSLint config/script остались после удаления зависимости | P0 — выполнить ограниченный toolchain pilot |

## Приоритеты из матрицы

1. **P0 — подготовить безопасную базу для нового Core:** ADR-0001/0002, строгий TS toolchain pilot, проектная схема и тестовый вертикальный срез.
2. **P0 — закрывать security residual прежде, чем расширять серверные файловые операции:** исправить TOCTOU и покрыть race regression; Package Manager не должен строиться поверх path-check-only гарантий.
3. **P0 — не считать FX/Box2D/Asset Pack/генерацию кода принятыми только по сборке:** закрыть наиболее рискованные runtime acceptance и regression tests отдельными PR.
4. **P0 — доказать независимую HTML5-сборку:** Core/build fixture, asset validation и отчёт о runtime составе.
5. **P1 — расширять 2D authoring по матрице реальных пробелов и связности save/reopen → preview → build.**
6. **P1 — Platform Services и workspace/package APIs после Core/build contracts.**
7. **P2 — Tauri, PixiJS, альтернативные physics backends и расширенная экосистема после PoC и измерений.**

## Ограничения аудита и следующая актуализация

- Полный построчный review всех 1 298 TypeScript-файлов не выполнялся: в репозитории около 1 480 tracked files, из них приблизительно 1 350 в `source/editor/`; основной объём — унаследованный editor client.
- Детально проверялись документы/CI/manifests, текущие серверные файловые и MCP-потоки, security smoke, PR #10 и ключевые участки code generation/FX/Box2D/asset preview по заявленным изменениям.
- Для каждой строки со статусом «не подтверждено» обновлять состояние только после привязанного regression test, runtime fixture либо документированной browser acceptance. Не переводить её в «реализовано» по наличию UI, деклараций TypeScript или успешной компиляции.
- Матрица — живой документ: изменения возможностей должны обновлять evidence, acceptance checks и соответствующие пункты `docs/roadmap.md`.
