# Дорожная карта: Codogma Engine

Дорожная карта строится вокруг требований [технического задания](technical-specification.md). **Целевое направление Editor UI — поэтапная замена Colibri-based client самостоятельным SolidJS + TypeScript/TSX Editor Host с Tailwind CSS 4 в `src/editor/`**. Legacy client остаётся в `source/editor/` и доступен параллельно до принятой функциональной приёмки и cutover. Это отдельная migration initiative: сохраняем project/runtime/server contracts, переносим UI вертикальными срезами, затем удаляем Colibri. Это не одномоментная перепись всего движка.

Unity 6.6 (6000.6, Beta на дату проверки) — основной UX-reference, Cocos Creator 4.0 LTS — дополнительный reference для 2D authoring workflows. Codogma Editor остаётся строго 2D-only: никаких 2D/3D переключателей и 3D-only workflows. Это ориентиры качества и организации интерфейса, не требование воспроизвести весь функционал движков. Colibri не является UX/architecture reference: использовать его только для проверки реальных пользовательских операций, data/runtime contracts, edge cases и fixtures; неподходящие старые workflows перерабатывать или удалять. Применять [стандарт reference для 2D Editor Host](editor-reference-standard.md). Каждая задача должна давать работающий результат в коде; документация и матрицы — инструменты принятия решений и фиксации evidence, а не самостоятельная цель исполнительского этапа.

Каждый этап разбивается на независимые PR с критериями приёмки по реализуемому workflow. Выбор SolidJS зафиксирован в [ADR-0005](decisions/ADR-0005-solidjs-editor-host.md); отдельный framework PoC, сравнительная матрица и повторное голосование по UI-стеку не требуются. [ADR-0004](decisions/ADR-0004-svelte-poc.md) остаётся архивной записью прежнего эксперимента внутри legacy-клиента и не является частью нового плана. Сохранять рабочие domain/data/runtime contracts; старые UI-механизмы не переносить автоматически, если новая реализация может быть проще. Не создавать постоянный Colibri↔SolidJS bridge.

## Приоритеты и рекомендуемый порядок реализации

Очередность ниже отражает фактическое состояние на 01.11.2026. Первый SolidJS Host/Scene slice COD-80 уже реализован; дальнейшие работы строятся вокруг миграции пользовательских workflows и сохранения проверенных engine contracts. **Новые пользовательские UI/authoring features разрабатываются только в src/editor/; в legacy Colibri разрешены только критические compatibility/security fixes.**

| Очередь | Рабочий пакет | Приоритет | Измеримый результат / правило |
|---|---|---|---|
| 1 | Интеграция и независимая приёмка COD-80 | **P0 migration gate** | Интегрировать PR #30 в dev после review/required checks; CODQA-18 принимает первый Workbench + Scene slice на точном candidate SHA. CI Fast не равен полной функциональной приёмке. |
| 2 | Capability/migration inventory | **P0 planning / continuous** | COD-16 + COD-82 ведут реестр legacy reference, reusable data/domain/runtime contract, SolidJS status, owner issue, fixture и acceptance evidence. Наличие legacy-панели или старого Done issue не означает, что функция перенесена. |
| 3 | Оставшиеся authoring workflows | **P1 по подтверждённым gaps** | Docking (COD-83), Asset/Sprite (COD-86), Prefab (COD-8), Components/TypeScript (COD-91), 2D UI authoring (COD-43), Camera/coordinates/sorting (COD-41), Tilemap (COD-40), Physics (COD-42), Animation (COD-84), FX (COD-89), Spine (COD-90), Audio/Particles (COD-61), Atlas analysis (COD-55), import extensions (COD-59). UI создаётся заново в SolidJS; проверенные контракты переиспользуются. |
| 4 | Engine/data/runtime/security contracts | **P0/P1 по конкретному gap** | Serializer, project formats, asset metadata/importer, codegen, Phaser/runtime, Core и filesystem security развиваются в своих слоях независимо от UI. Не переписывать исправные контракты только из-за SolidJS. |
| 5 | Preview, diagnostics и live integrations | **P1** | Общий Preview Host, runtime identity, live Inspector/Console, EngineLogger и session-aware MCP SSE имеют явные session/lifecycle/ownership contracts. COD-80 Game View iframe не является полноценным Preview Host. |
| 6 | Functional browser/runtime acceptance | **Обязательное условие заявления о готовности workflow** | CODQA-18 принимает первый Host slice; CODQA-10/11/12/13/14/16 и CODQA-4 проверяют соответствующие workflows на SolidJS после реализации. Старые Done QA issues остаются историческим evidence. |
| 7 | Production cutover и Colibri removal | **Последний migration gate** | COD-87 переключает /editor/ на SolidJS с rollback window; COD-88 удаляет Colibri отдельным PR после inventory sign-off, consumer audit и license review. |
| 8 | Core, Build, Platform Services, Game QA, Package Manager, Tauri | **Отдельные потоки** | Развивать по собственным зависимостям и acceptance; не делать их искусственными prerequisites для независимых Host workflows и не смешивать с legacy UI cleanup. |

## Текущее состояние и границы блокеров (01.11.2026)

Базовая точка `dev` после интеграции PR #21–#24 — `8cd494e0634d4b679fab62ca8379c39487395dd9` (30.10.2026). PR #21 с Box2D codegen/runtime contracts, PR #22 с first-party MCP stdio package, PR #23 с Linear ownership docs и PR #24 с filesystem security reconciliation смержены. Инженерная интеграция и CI Fast подтверждены; фактическая browser/runtime Box2D acceptance остаётся в [CODQA-1](https://linear.app/codogma-engine/issue/CODQA-1/provesti-browserruntime-acceptance-generated-box2d-scenes-i-prefab), live stdio/Editor/SSE acceptance — в [CODQA-8](https://linear.app/codogma-engine/issue/CODQA-8/provesti-live-acceptance-first-party-codogma-mcp-stdio-adapter-i). По filesystem security Linux descriptor-anchored implementation и regression tests уже интегрированы; cross-platform и moved-open-directory residual остаётся отдельной приёмкой [CODQA-7](https://linear.app/codogma-engine/issue/CODQA-7/provesti-cross-platform-acceptance-fajlovoj-bezopasnosti). Статусы CI необходимо проверять по live checks точного SHA; CI Fast подтверждает только выполненные workflow jobs, а не browser/runtime или multi-platform acceptance.

**Editor UI migration status:** PR #13/Svelte PoC — исторический эксперимент внутри Colibri и не определяет новый framework. SolidJS + TypeScript/TSX + Vite + Tailwind CSS 4 приняты в ADR-0005. COD-80 / PR #30 реализует самостоятельный Host: Workbench, Phaser-backed Scene Canvas, Hierarchy/Inspector/Transform, базовые Project/Animation/Components/Console surfaces, layout persistence, focus/commands, save/reopen и Undo/Redo. CI Fast #453 на HEAD `6abf5cf272d7fb29648bbbe4732a7e3bc309a180` подтвердил Host typecheck/build, 36 domain tests, 9 Chromium acceptance tests и fast-checks (оба job success). PR #30 ещё открыт и не смержен; legacy Colibri остаётся server default /editor/ до COD-87. Полная migration, specialized workflows, session-aware MCP SSE, Preview integration, cutover и Colibri removal остаются открытыми и координируются COD-82.

### Можно начинать сейчас

- **Завершить интеграцию первого SolidJS Host slice.** Проверить актуальный PR #30, его review/CI и merge в dev; CODQA-18 выполняет независимую acceptance по отдельному candidate SHA. Не создавать повторный Host bootstrap или framework evaluation.
- **Заполнять migration inventory.** COD-16 и COD-82 фиксируют каждую capability отдельно: legacy reference, reusable domain/data/runtime contract, SolidJS status, owner issue, tests и acceptance evidence.
- **Выбирать следующий SolidJS vertical slice по пользовательской ценности и зависимостям.** Начинать с подтверждённых gaps: Asset/Sprite, Prefab/Components, Scene camera/sorting и игровые UI tools; далее specialized workflows по capability matrix.
- **Исправлять общие engine/data/runtime/security defects независимо от UI.** Не переносить исправления в Colibri только ради последующего переписывания; не менять рабочие serializers, project formats, Asset Metadata, codegen и Phaser runtime без доказанного основания.
- **Поддерживать legacy только для совместимости.** В source/editor допускаются критические bug/security fixes, release blockers и временные fixes, которые реально блокируют migration. Каждый legacy-only fix требует обоснования.
- **Закрывать runtime/security residuals отдельными задачами.** Box2D/FX/codegen acceptance, cross-platform filesystem security и local-only boundaries не смешивать с UI migration и не считать зелёный build фактической runtime приёмкой.
- **Сохранять отдельные Core/Preview/Build/QA потоки.** Они могут выполняться параллельно при собственных acceptance, не создавая второй источник истины или второй game loop.

### P0/P1 — ближайшая очередь Editor UI migration

1. Интегрировать COD-80 / PR #30 в dev после review и успешных required checks. Зафиксировать точный merge/candidate SHA; не считать предыдущий зелёный CI достаточным, если head изменился.
2. Выполнить независимую browser acceptance CODQA-18 на disposable fixture project: artboards, Scene workflow, Transform, Undo/Redo, Hierarchy/Inspector synchronization, focus/shortcuts, реализованный docking slice, Game View iframe lifecycle и negative/error states.
3. Завершить capability inventory COD-16 совместно с COD-82. Для каждой функции определить migrated / in progress / not started / deferred / retired, owner issue, reusable contract, tests, browser/runtime acceptance и evidence SHA.
4. Реализовывать следующие vertical slices в SolidJS Host: COD-86 Asset Browser/Asset Pack/Sprite; COD-8 Prefab; COD-41 Camera/coordinates/sorting; COD-43 2D UI authoring; COD-83 Docking/layout; далее Tilemap/Physics/Animation/Audio/FX/Spine по dependencies и capability matrix. Не копировать Colibri UI components или plugin architecture.
5. Устранить интеграционные blockers: Preview Host/session lifecycle; COD-85 session-aware MCP SSE routing до подключения нового Host к live bridge; единый project write ownership; общий EngineLogger/diagnostics без зависимости от UI framework.
6. Пройти функциональную browser/runtime acceptance соответствующих CODQA issues на новом Host. Старые Done QA issues и CI tests остаются evidence только для своих исторических/автоматизированных сценариев, не принимают новый UI.
7. Выполнить COD-87 production cutover /editor/ на SolidJS с rollback window. Только после закрытия rollback window, inventory sign-off, consumer audit и license review — отдельная COD-88 для удаления Colibri.

### Что можно выполнять параллельно Editor UI migration

- Завершение полной инвентаризации всех TypeScript-файлов, транзитивных лицензий и всех legacy project configs. Эти сведения пополняются по мере работы и до публикации/массовой архитектурной миграции; они не должны задерживать изолированную исправимую задачу.
- Реализация нового Project Model/Core, runtime adapter или оптимизированного ECS. Это следующий архитектурный поток, а не предусловие для каждой правки текущего Scene Editor, Inspector или Asset Pack.
- Создание нового SolidJS Editor Host в `src/editor/` и последующее удаление legacy Colibri client из `source/editor/` — отдельная staged UI migration по `docs/editor-ui-migration.md`; это не механическое перемещение старого дерева. npm Workspaces остаются отдельной инфраструктурной миграцией.
- Реализация нового Project Model/Core, runtime adapter, Preview Host и HTML5 build pipeline. Они могут идти отдельными потоками, если сохраняются совместимые contracts; готовность Core не является предварительным условием для первого нового Editor Host slice.
- Фактические performance budgets. Сначала нужны воспроизводимые измерения; при этом исправлять подтверждённые блокировки, утечки или грубые регрессии можно сразу с тестом/замером дефекта.
- Tauri, замена Phaser на PixiJS, второй ECS/runtime, дополнительные physics backends и public package registry. Они не входят в основной scope этого этапа.

### Что не следует делать параллельно «на всякий случай»

- Не встраивать SolidJS views внутрь Colibri как долгосрочную архитектуру. Не переносить всё в одном giant PR; old/new UI должны быть независимыми applications с отдельными origins, общими backend/data contracts и проверяемыми cutover gates.
- Не останавливать исправление существующего редактора, пока проектируют идеальный Core. Для каждой задачи выбирать минимальный контракт, необходимый именно ей.
- Не сводить модернизацию к замене цветов/иконок: визуальная работа должна включать и функциональные состояния, клавиатурный workflow, layout панелей и связанные пользовательские сценарии.
- Не оставлять icon migration только в виде карты: после инвентаризации выполнить внедрение в согласованном UI scope, с отдельными light/dark variants и attribution.
- Не вводить сразу строгий lint/format gate на все legacy-пакеты, не менять все lockfiles/путь editor и не переводить всё на Workspaces одной операцией.
- Не заменять Phaser, не добавлять EVA.js как второй runtime и не вводить ECS-оптимизацию без доказанного gap, PoC и измерений.
- Не отмечать runtime-функции завершёнными по одному лишь TypeScript build, наличию кнопки или генерации исходника.
- Не добавлять зависимости «на будущее». У каждой зависимости должны быть используемая функция, лицензия, scope, критерии приёмки и доказательство, почему текущей реализации недостаточно.

## Принципы ведения roadmap

1. Один PR — одна логически завершённая задача. Работу крупной фазы не переносить целиком одним большим PR.
2. Не закрывать чекбокс по наличию кода или успешной компиляции: нужен результат соответствующего acceptance test.
3. Перед переписыванием существующей функции определить, что уже работает в текущем Colibri/Phaser Editor client, где расположены ограничения и что действительно надо заменить.
4. Новый модуль проходит критерии и сравнивается с legacy-сценарием до удаления старой реализации.
5. Не создавать вторую сущность, сцену или игровой цикл там, где можно добавить adapter к существующей реализации.
6. Исходники самостоятельных, независимо подключаемых возможностей оформлять как пакеты в `packages/` внутри монорепозитория; не создавать пакет на каждый класс. Публичную публикацию выполнять только после стабилизации API, SemVer/compatibility policy, тестов и документации. Локальную совместную разработку связывать через npm Workspaces.
7. Для новых архитектурных рисков формулировать проверяемую гипотезу и критерии решения. Выбор SolidJS для UI уже закреплён в ADR-0005 и не требует повторного PoC; это не означает автоматического выбора Tauri, PixiJS или ECS.
8. Значимые пользовательские изменения фиксировать в `CHANGELOG.MD`; обновлять ТЗ и roadmap, когда меняется цель, формат проекта или критерии этапа.
9. Сохранять применимые upstream-уведомления и лицензии. Удаление legacy-кода не означает автоматического права убрать авторские уведомления.

## Как использовать ТЗ, roadmap и технические источники

- [Техническое задание](technical-specification.md) — нормативный контракт продукта, архитектуры и acceptance criteria.
- [Architecture risk register](architecture-risk-register.md) — Web-first risks, trade-offs reference engines и обязательные release checks.
- [Каталог источников](REFERENCE-SOURCES.md) — официальные руководства/исходники, версии, кандидаты библиотек и замечания по лицензиям. Ссылка в каталоге является reference, а не утверждением о выборе зависимости.
- [README](../README.md) — подтверждённые команды локальной разработки, правила веток/PR и действующие CI checks.
- Для API/runtime decisions в первую очередь сверять [Phaser docs](https://docs.phaser.io/phaser/getting-started/what-is-phaser), [EVA.js repository](https://github.com/eva-engine/eva.js), [Cocos Creator 4.0 manual](https://docs.cocos.com/creator/4.0/manual/en/) и [Unity 6.6 2D manual](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d). Cocos Creator manual и исходный репозиторий Cocos 4 — разные источники; Unity/Cocos описывают поведение своих продуктов, но не заменяют проектные решения Codogma.
- Для нового кода обязательны TypeScript strict profile и автоматические quality checks из раздела 12.1 ТЗ. Toolchain candidates: [ESLint/typescript-eslint](https://typescript-eslint.io/getting-started/), [Prettier](https://prettier.io/docs/install.html), [Knip](https://knip.dev/), [dependency-cruiser](https://github.com/sverweij/dependency-cruiser). Не указывать команды как доступные, пока они не реализованы.

### Definition of Ready для каждой задачи

Перед началом реализации карточка задачи/PR должна содержать:
1. Ссылку на раздел ТЗ и соответствующий пункт roadmap.
2. Точный пользовательский сценарий или технический дефект и ожидаемое поведение.
3. Перечень затрагиваемых подсистем/файлов после исследования исходников; не выдумывать пути до аудита.
4. Acceptance criteria и минимальный воспроизводимый fixture/test.
5. Обязательные обратносуместимые изменения, миграции/ограничения и то, что явно не входит в scope.
6. Кандидатные библиотеки/источники с версией и лицензией, если нужны; новые зависимости — только после доказательства пробела и решения по PoC/ADR.

### С чего начинается реализация

**Первый самостоятельный SolidJS Editor Host и базовый Scene vertical slice уже реализованы в COD-80 / PR #30.** Следующий этап — не повторное создание shell/Workbench, а интеграция и независимая приёмка уже созданного среза, затем выбор следующих workflow gaps по migration inventory. Не встраивать SolidJS в Colibri и не перемещать legacy source tree.

Ожидаемый рабочий порядок:
1. Проверить точный head PR #30, актуальные review/required checks и интеграцию в dev; candidate SHA фиксировать отдельно от code commit CI evidence.
2. Выполнить independent browser acceptance CODQA-18 на disposable project copy: visual artboards, Scene open/edit/save/reopen, Hierarchy/Inspector, Transform, Undo/Redo, focus/commands, базовый docking, Game View iframe cleanup и negative states.
3. Завершить migration inventory COD-16 вместе с COD-82: для каждой capability разделить legacy reference, reusable data/domain/runtime contract, SolidJS implementation status, test fixtures, browser/runtime acceptance и owner issue.
4. Реализовывать следующие вертикальные slices в SolidJS Host: Asset/Sprite (COD-86), Prefab (COD-8), camera/coordinates/sorting (COD-41), 2D UI authoring (COD-43), docking (COD-83), user components/scripts (COD-91), Animation (COD-84), FX (COD-89), Spine (COD-90), Tilemap/Physics/Audio/Particles и другие gaps по dependencies.
5. Общие engine/data/runtime/security defects исправлять в соответствующих слоях; не переносить UI ради использования legacy panels. Новые зависимости (Monaco/CodeMirror/docking library) добавлять только после конкретного gap и ограниченного evidence.
6. До общего Preview Host/MCP session ownership не подключать новый Host к legacy broadcast SSE bridge и не допускать concurrent write в один PROJECT_DIR. Session-aware MCP routing ведётся в COD-85.
7. После принятия migration inventory выполнить COD-87 cutover с rollback window, затем отдельную COD-88 cleanup после consumer/provenance/license audit.

Legacy Colibri используется как источник требований, поведения и fixtures, а не как implementation blueprint. `src/editor/` уже существует как самостоятельное приложение; `source/editor/` не переносится. npm Workspaces и единая lockfile-консолидация остаются отдельным инфраструктурным решением, не предусловием для текущего Host workflow.

### Подготовленные reference-документы — использовать, не пересоздавать

Эти документы уже созданы как результат предыдущего этапа аудита. Они сохраняют свою актуальность как справочная база и уточняются вместе с кодом, когда меняется фактическое состояние. Агенту не поручается повторно генерировать их вместо реализации.

- `docs/capability-matrix.md` — фактические возможности редактора/runtime/build, evidence, тесты и непроверенные gaps.
- `docs/dependency-capability-matrix.md` — зависимости, версии, лицензии, scope и последствия для реализации.
- `docs/decisions/ADR-0001-core-architecture.md` — границы будущих Project Model/Core/Phaser adapter/Preview Host; относится к будущей интеграции Core.
- `docs/performance-baseline.md` — протокол и fixture для измерений; реальные результаты добавляются только после воспроизводимых прогонов.
- `docs/decisions/ADR-0002-typescript-toolchain.md` — политика TypeScript, lint/format/test и постепенного усиления quality gates.
- `docs/decisions/ADR-0003-package-architecture-and-management.md` — целевые package/workspace/extension boundaries и Package Manager; не блокирует изменения текущего editor UI.
- `docs/code-quality-baseline.md` — исходное состояние compiler/build/security checks и ограничения того, что подтверждается CI.

## Этап 0 — базовая версия и текущая инфраструктура

**Статус: реализованная исходная база.** Используется для сравнения и регрессионной проверки, а не как свидетельство готовности будущих subsystem-ов.

- [x] Брендинг Codogma Engine и metadata продукта.
- [x] Локальный Node.js сервер обслуживает editor UI и проектные HTTP API.
- [x] Интеграция Phaser 4.2.1, типы и адаптации компилятора/редактора.
- [x] Существующие инструменты Scene Editor, Inspector, Prefabs/Components, Assets/Pack, Animations, Tilemap и связанные с ними editor plugins.
- [x] Контракт файлового доступа `IFileStorage`, registry расширений и базовая инфраструктура Undo/Redo в существующем клиенте.
- [x] Engine-owned MCP tool registry и local HTTP endpoint; legacy WebSocket bridge для старых editor-side workflows.
- [x] Private TypeScript stdio adapter `@codogma/editor-mcp-server` в `packages/editor-mcp-server/`, с собственным manifest/lockfile и проверками; публичная npm publication и npm Workspaces остаются отдельными задачами.
- [x] CI Fast: проверка маршрута PR, install dependencies, build редактора и server smoke test.
- [x] MCP integration workflow на PR в `test`/`main`.
- [x] Release workflow формирует ZIP GitHub Actions artifact на `main`.

**Ограничения, которые остаются открытыми:**

- [ ] Автоматизированная карта capabilities: что в каждом редакторе работает, что требует доработки и что ещё не покрывается тестами.
- [ ] Подтверждённая интеграция редактора с живыми объектами runtime, live Inspector и полный browser acceptance pipeline.
- [ ] Собственное независимое от Phaser публичное Engine API / component system.
- [ ] Полный HTML5 asset/build pipeline и platform SDK adapters.
- [ ] Отдельный desktop installer; текущий ZIP artifact не является таким installer.

## Этап 1 — аудит исходников, модель данных и архитектурные решения

**Цель:** поддерживать проверяемую карту legacy workflows, reusable contracts и миграционных gaps для уже существующего SolidJS Host. Базовые capability/dependency matrices, ADR и baseline-протоколы созданы; актуализировать их по фактическим PR и перед переносом соответствующей функции, не повторяя инвентаризацию без нового evidence.

### Внутренняя очередь выполнения

1. **Развивать уже созданный независимый Host:** не повторять bootstrap/COD-80. Для следующей выбранной подсистемы изучить legacy user workflow и runtime/data contracts, затем спроектировать новую SolidJS реализацию и принять её на fixtures/browser/runtime.
2. **Ввести необходимые quality checks в изменяемом scope:** clean install, TypeScript build, targeted tests, ESLint/Prettier для нового/изменяемого Codogma-owned кода; Knip/dependency-cruiser сначала работают в report mode. Не ломать массово legacy Colibri.
3. **Пополнять матрицы по evidence:** фиксировать, что реализовано, что исправлено, какие тесты прошли и что осталось непроверенным. Документация обновляется вместе с соответствующим кодом и не заменяет его.
4. **Оформлять архитектурные решения по необходимости:** ADR-0005 и `docs/editor-ui-migration.md` определяют целевой Host и transition constraints. Core contracts, package/Workspace migration и public Extension API развиваются отдельно и не блокируют следующий независимый Host workflow.
5. **Отдельный gate для нового Core:** принимать Core contracts по ADR-0001/0002 и contract tests. SolidJS Host уже существует и мигрирует workflows отдельно; не объединять Host feature work с массовым Core refactor или npm Workspaces/lockfile consolidation.

### Задачи

- [x] Зафиксировать baseline доставки Phaser 4.2.1 по `plugin.json`, root/editor manifests, declarations и Box2D ambient types; сверить с upstream tag `v4.2.1` и отличить модульную структуру исходников от текущего bundle-based подключения Codogma. Вывод и ссылки зафиксированы в ТЗ и каталоге источников; фактическое исключение Phaser-кода из production bundle остаётся отдельной проверкой этапа 4A.
- [x] Создать первоначальную статическую `docs/capability-matrix.md` с evidence и раздельными статусами реализации/автоматических проверок/runtime acceptance; остающиеся runtime gaps перечислены отдельными follow-ups. Обновлять строки по мере проверки функций.
- [ ] Включить отдельные workflow-строки для Sprite Editor (slicing/trim/pivot/collision shapes/sorting/9-slicing), Tilemap brushes/layouts/chunks, camera/coordinate conversion, input (mouse/keyboard/touch), audio lifecycle, UI layouts/text, particles/lighting, localization, save storage и Dev/Release build profiles.
- [ ] Инвентаризировать TypeScript configs/project references, TS compiler options, scripts and lockfiles во всех packages, оценить совместимость обновления от TypeScript 5.3.3, текущий scope TSLint и generated/dynamic plugin entry points; не предполагать, что repo-wide checks уже существуют.
- [ ] Зафиксировать toolchain baseline и staged migration plan для strict TypeScript, ESLint/typescript-eslint, Prettier, Knip и dependency-cruiser; отметить точный initial scope для новых Codogma modules и текущие legacy findings.
- [ ] Для каждой возможности указать: существующая реализация, публичный/внутренний контракт, покрывающие тесты, ограничения и gap относительно целевого UX.
- [ ] Зафиксировать текущие форматы сцен/префабов/ассетов и правила серилизации, идентификации ресурсов и обновления ссылок.
- [ ] Инвентаризировать импортные метаданные, повторный импорт, sprite sheet slicing, atlas build, PSD/Aseprite/Tiled interoperability и явно записать ограничения/потери данных каждого формата.
- [ ] Проследить вызовы существующего `IFileStorage`, HTTP API, Colibri plugin registry и Undo/Redo: отделить reusable domain/data operations от UI lifecycle/callback dependencies, которые придётся переписать в SolidJS Host.
- [x] Создать первоначальную `docs/dependency-capability-matrix.md` для текущих direct package roots, Phaser bundle и Box2D runtime path.
- [ ] Завершить транзитивную dependency/SBOM, license и provenance инвентаризацию; проверить ограничения и стоимость обновления значимых зависимостей до публикации пакетов.
- [ ] Для нового Core toolchain зафиксировать pinned devDependencies, scripts и lockfile; legacy TSLint dependency уже отсутствует, но `lint.sh`/`tslint.json` остаются неактивными артефактами. Удалить или заменить их отдельным cleanup после пилота.
- [ ] Определить вертикальный срез для будущих изменений: сериализованная сцена → зарегистрированный независимый TypeScript-компонент → Inspector metadata → save/reopen → запуск без генерируемого per-scene TS-класса → live selection/diagnostics → HTML5 build.
- [ ] Подготовить ограниченный TypeScript toolchain pilot для нового Codogma-owned module: strict typecheck, lint, format check, Knip/dependency report и unit test, не затрагивая массово наследуемый Colibri code.
- [x] Зафиксировать решения первого vertical slice в `docs/decisions/ADR-0001-core-architecture.md`: Project Model, Component-object Core, runtime adapter и browser-first Preview Host. Детальные API signatures остаются test-driven реализационными задачами.
- [x] Оформить `docs/decisions/ADR-0002-typescript-toolchain.md`: strict profile и scope нового Core, ESLint/Prettier/Node unit tests, Knip/dependency-cruiser report mode и staged CI ratchet.
  - Прогресс COD-19: подготовлен изолированный pilot в `packages/localization/` — отдельный ESLint scope для strict TS/Node tests, package-local Prettier profile, typecheck/lint/format/unit scripts, report-only Knip/dependency-cruiser и запуск quality checks в CI Fast. Дождаться CI, прежде чем отмечать pilot завершённым.
- [ ] Поддерживать `docs/decisions/ADR-0003-package-architecture-and-management.md` как нормативное решение: целевые исходники Editor Host в `src/editor`, самостоятельные package roots в `packages/*`, `@codogma/cge` в `packages/cge`, npm Workspaces для локальной разработки, selective installation в пользовательские проекты и Extension API; точная metadata schema и детали migration/workspace tooling проходят PoC.
- [x] Создан самостоятельный SolidJS/Vite app в `src/editor/` (COD-80 / PR #30): отдельный dev command/port, loopback bind, exact-Origin Vite proxy, build/typecheck, domain tests и Chromium acceptance включены в CI Fast. Следующая работа — не повторный bootstrap, а миграция отдельных capabilities, acceptance, cutover и последующий cleanup. `source/editor/` остаётся legacy до COD-87/COD-88.
- [x] Создать `docs/performance-baseline.md` с fixtures и протоколом воспроизводимых измерений без выдуманных порогов.
- [ ] Выполнить и сохранить фактические performance measurements на согласованном окружении; не вводить budgets до получения повторяемых raw samples.

### Критерии приёмки

- [x] Есть первоначальная таблица статусов `docs/capability-matrix.md` с путями evidence, автотестами и оставшимися runtime-acceptance gaps.
- [x] Созданы initial versions `docs/dependency-capability-matrix.md`, `docs/decisions/ADR-0001-core-architecture.md`, `docs/decisions/ADR-0002-typescript-toolchain.md`, `docs/performance-baseline.md` и `docs/code-quality-baseline.md`; `ADR-0003` уже существует. Неизвестные сведения помечены как непроверенные.
- [ ] Закрывать содержательные остатки baseline-документов по потребности соответствующего PR и перед публикацией/массовыми архитектурными изменениями; они не блокируют отдельные безопасные UI/bug fixes существующего редактора.
- [ ] Новый TypeScript pilot проходит strict typecheck, lint, format check и соответствующие unit tests; Knip/dependency-cruiser report scope и false-positive handling документированы.
  - Реализация на ветке `feat/cod-19-localization-toolchain-pilot-20261029`: `packages/localization` использует существующий strict `tsconfig.json`; добавлены `quality:check` (`typecheck`, scoped ESLint, Prettier, Node unit tests) и `quality:report` (Knip с `--no-exit-code`, dependency-cruiser с warning severity). В root CI Fast добавлен запуск этих команд. Root lockfile остаётся источником версий tools; package lock не дублирует toolchain. Prettier ratchet расширен на весь package-owned source/test/CLI scope и manifest/tooling config. Файлы нормализованы; CI проверяет полный scope в read-only режиме. COD-19 остаётся открытой до triage Knip/dependency-cruiser report findings и review pilot результата.
- [ ] Выделены минимальные контракты Project Model, Runtime Adapter и Preview Host.
- [ ] Подтверждено, какие возможности надо расширять внутри текущего редактора, а какие — изолировать или заменять.
- [x] Механическая миграция source/editor → src/editor отменена: src/editor уже является самостоятельным SolidJS Host со своим package root/lockfile, а source/editor остаётся legacy Colibri до cutover. См. COD-22 (Canceled), COD-82 и ADR-0005. Изменение server path/release archive выполняется как часть cutover COD-87 и Colibri cleanup COD-88.
- [ ] Не принимать новые технологические кандидаты без ADR/обоснования; принятое решение SolidJS для Editor UI повторно не пересматривается в рамках этой migration.
- [ ] Риски совместимости и лицензирования описаны с владельцами/планом проверки.

---

## Этап 2 — Project Model и собственный TypeScript Component/ECS Core

**Цель:** создать основу собственного движка над существующим runtime — не подключать второй game runtime поверх Phaser, а связать editor model и игру через общий API.

**Зависимости:** этап 1.

### Внутренняя очередь выполнения

1. **Сначала — формат данных:** схема Project/Scene/Node/Transform/Component/Prefab/Asset Reference, стабильные IDs, сериализация, versioning/migrations и compatibility fixtures. Сериализованная сцена — каноническое исходное представление; runtime-объекты, Preview и generated source являются производными представлениями.
2. **Затем — registry и loader:** явная регистрация TypeScript component modules со стабильными type IDs и metadata; data-driven scene loader выполняет миграцию/валидацию, разрешает ссылки и детерминированно создаёт runtime-иерархию. Сцене не требуется отдельный сгенерированный TS-класс.
3. **Затем — минимальный API:** Node/Entity, Transform, Component, lifecycle, events и metadata/schema; Inspector, сериализация, валидация и runtime adapter используют единый контракт.
4. **Затем — один рабочий adapter:** один объект/компонент проходит весь цикл до Phaser display object и обратно к runtime diagnostics. Проверить lifecycle, структурные изменения и disposal; не создавать независимый ticker или вторую точку истины.
5. **Затем — сервисы по реальному срезу:** Input, Time/Tween/scheduler и Scene Manager сначала проектируются на уровне контрактов, а реализуются по минимальной очереди, необходимой для первого реального проекта. Обязательно проверять focus loss, cancellation, pause/resume и cleanup там, где соответствующая capability входит в срез.
6. **Отдельное решение, а не предположение:** data-oriented ECS и дополнительные physics backends не входят в минимальный Core автоматически. Сравнить component-object API и нужные physics capabilities на fixture; усложнять модель только если это оправдано тестами/измерениями.

### Задачи

- [ ] Подготовить минимальный npm Workspace/package skeleton с исходниками Core в `packages/cge` и только теми самостоятельными пакетами, которые нужны первому vertical slice. После отдельной миграции добавить `src/editor` в root Workspaces при подтверждённой совместимости; package/lockfile consolidation провести отдельным проверяемым изменением. Не создавать `src/cge` как параллельный корень исходников.
- [ ] Определить схему проекта и сериализованные контракты для Project, Scene, Node/Entity, Transform, Component, Prefab, Asset Reference и runtime configuration.
- [ ] Зафиксировать инвариант: в целевом Core сцена хранится как versioned data, а не как обязательный генерируемый TypeScript-класс; стабильные IDs и явные ссылки не зависят от имён файлов/классов.
- [ ] Реализовать explicit component registry и module manifest с предсказуемым build-time graph; не использовать runtime scanning, угадывание путей или `eval` для подключения игровых скриптов.
- [ ] Реализовать data-driven scene loader: preflight schema/ref validation, зарегистрированные миграции, детерминированное создание hierarchy/Transform/components, lifecycle activation и rollback/cleanup при ошибке загрузки.
- [ ] Подтвердить, что один независимо написанный TypeScript component module можно повторно использовать несколькими узлами и сценами без копирования логики в scene-specific code; type ID и instance ID различаются, значения каждого экземпляра независимы.
- [ ] Разделить persisted properties, editor-only metadata и transient runtime state в общей component schema; Inspector, serializer, validator и runtime adapter читают один schema contract.
- [ ] Зафиксировать разрешение ссылок на узлы/компоненты по стабильным ID и поведение отсутствующей цели/неподдерживаемой циклической ссылки.
- [ ] Сохранить текущий scene codegen как legacy/compatibility path до приёмки data-driven loader; отдельно описать совместимость и миграцию существующих проектов, не удалять генератор данным архитектурным шагом.
- [ ] Ввести стабильные идентификаторы сущностей, компонентов и ассетов; определить поведение переименования/перемещения и восстановления ссылок.
- [ ] Определить версионирование формата и механизм миграции; подготовить compatibility fixtures для текущих проектов.
- [ ] Спроектировать минимальный публичный TypeScript API: Node/Entity, Component, Transform, lifecycle, события и service access.
- [ ] Утвердить границы API для Input (mouse/keyboard/touch и coordinate spaces), Time/Tween/scheduler и Scene Manager (async load, transition, cancellation, disposal); отдельные необязательные capabilities не должны проникать во все компоненты.
- [ ] Прототипировать ECS/component core: registry компонентов, system scheduler, детерминированный lifecycle, структурные изменения и disposal.
- [ ] Интегрировать runtime core в управляемые фазы Phaser tick; не заводить независимый `requestAnimationFrame`.
- [ ] Добавить Component Schema/Metadata для полей Inspector, валидации, default values и ссылок на ресурсы.
- [ ] Создать Phaser adapter для выбранного среза: сущность ↔ sprite/view, Transform ↔ display transform, physics body и lifecycle.
- [ ] Обеспечить одну точку истины для каждого значения. При переносе HP/Transform/AI-state старое поле не должно продолжать независимо изменяться.
- [ ] Изучить EVA.js (GameObject/Component/System, lifecycle, metadata, component observer) как reference. Не подключать его целиком до проверки дублирования Scene/Game/Ticker и renderer dependencies.
- [ ] Сравнить удобство component-object API и необходимость data-oriented ECS на реальном сценарии; не усложнять всё ядро ради неподтверждённого выигрыша FPS.

### Критерии приёмки

- [ ] Работает минимальная сцена с Node, Transform и пользовательским TypeScript-компонентом на текущем Phaser runtime.
- [ ] Fixture загружает сцену из сериализованной модели и явно зарегистрированного TypeScript-компонента без отдельного генерируемого TS-класса/файла сцены.
- [ ] Один компонентный модуль успешно используется несколькими узлами (в том числе в разных сценах); его значения остаются независимыми на уровне экземпляров.
- [ ] Отсутствующий/несовместимый тип компонента, broken asset/node ref или unsupported schema приводит к адресной диагностике и не оставляет частично активную сцену или ресурсы.
- [ ] Порядок загрузки и lifecycle детерминирован: IDs/иерархия построены до разрешения ссылок и активации компонентов; отмена асинхронной загрузки выполняет cleanup.
- [ ] Persisted fields проходят round-trip; editor-only/transient fields не попадают молча в сериализованные данные.
- [ ] Существующий legacy codegen имеет регрессионные проверки и не удаляется до согласованной runtime-паритетности и проверенного migration/compatibility path.
- [ ] Lifecycle тестируется при создании, активации, отключении, повторной активации и уничтожении объекта.
- [ ] Добавление/удаление компонентов во время system update безопасно и детерминировано.
- [ ] Повторное открытие проектного файла сохраняет данные; неизвестные/новые поля не теряются молча.
- [ ] Inspector использует те же metadata/schema, что и сериализация и runtime adapter.
- [ ] Core можно тестировать без запуска редактора UI; его публичные API не импортируют Colibri/Tauri API напрямую.
- [ ] Есть результат performance comparison для representative fixture; ECS не объявляется ускорением без данных.
- [ ] Контракты Input/Time/Scene Manager, если входят в пилот, покрывают focus loss, UI-vs-world routing, pause/resume и безопасное освобождение timers/listeners.

**Gate:** прежде чем массово переписывать текущие игровые сущности, Core проходит отдельный пилот на одной законченной механике. Интеграция с Last Hero может использоваться как дополнительная реальная проверка через отдельную ветку/репозиторий, но Codogma не должен получать жёсткую зависимость на код игры.

---

## Этап 3 — Game Preview Host, live Inspector и runtime debugging

**Цель:** сделать рабочую игру доступной из редактора как реальную runtime-сессию. В целевом Core Preview запускает сцену из сериализованных данных и зарегистрированных компонентов, а не требует предварительной генерации отдельного TS-класса для каждого уровня. Текущий codegen остаётся совместимым legacy-путём до отдельной приёмки перехода.

**Зависимости:** базовые Project Model и Runtime Adapter contracts из этапа 2; первые прототипы можно делать параллельно без ожидания полной ECS.

### Внутренняя очередь выполнения

1. **Первая цель — Browser Preview:** запустить fixture в обычном браузере через data-driven loader (serialized scene + registered component module), обрабатывать повторные Play/Stop/Restart, ошибки запуска и завершать принадлежащие preview процессы без утечек. Fixture не должен зависеть от per-scene generated TS class; Tauri не требуется.
2. **Сразу после него — runtime identity и диагностика:** связать runtime entity/component ID с Project Model, получать реальные runtime values, различать runtime mutations и serialized source data, привязывать errors/logs к запуску.
3. **Следующий UI-слой — Embedded Game View:** подключать после доказанного browser lifecycle. Сравнить отзывчивость редактора под нагрузкой; не обещать изоляцию, если не измерены отдельные context/window/process.
4. **Только затем — расширенная диагностика:** overlays, time scale и single-step после подтверждения scheduler semantics. Отдельное окно — дополнительный способ проверки fullscreen/input/scaling, а не блокер первой browser-сессии.

### Задачи

- [ ] Выделить Game Preview Host с отдельным контрактом от Tauri/Electron и текущего HTTP сервера.
- [ ] Запускать новый Core Preview из Project Model через тот же loader/adapter contract, который используют runtime/build; legacy generated-code preview поддерживается отдельно, пока не выполнен переход.
- [ ] Реализовать управление preview: Play, Pause, Resume, Restart/Stop, resize viewport и передачу log/error events.
- [ ] Поддержать Embedded Game View для быстрой итерации.
- [ ] Поддержать запуск игры в отдельном окне, чтобы проверять fullscreen, input, scaling и поведение без панелей редактора.
- [ ] Сохранить внешний запуск в обычном браузере для проверки целевого HTML5 runtime.
- [ ] Реализовать связь runtime entity/component ID с Project Model, когда это возможно без неоднозначности.
- [ ] При выборе объекта во время игры позволить переход к соответствующему объекту редактора и отображать фактические runtime values в Inspector.
- [ ] Разделить transient runtime mutation и изменение исходных сериализованных данных; UI обязан явно обозначать выбранный режим.
- [ ] Передавать сообщения об ошибках запуска, compile/runtime exceptions и недоступных ресурсах.
- [ ] Добавить debug overlays для Transform/physics bodies/collisions в рамках поддерживаемого runtime.
- [ ] Определить семантику time scale и single-step; реализовать после подтверждения, что scheduler может гарантировать корректное pause/step.
- [ ] Измерить отзывчивость редактора под нагрузкой preview. Если embedded preview блокирует UI, проверить отдельный context/window/process вместо обещания изоляции по умолчанию.

### Критерии приёмки

- [ ] Сквозной сценарий: открыть fixture → изменить сцену/компонент → запустить → увидеть игру → выбрать live entity → проверить его компоненты → остановить и повторить запуск.
- [ ] Target fixture запускается из сериализованной сцены и зарегистрированного TypeScript-компонента без generated TS class для уровня; Start/Stop/Restart очищают runtime-объекты и ресурсы.
- [ ] Preview связан с фиксированной ревизией/snapshot Project Model; runtime mutations не перезаписывают source data автоматически, а явное применение значения к проекту является отдельной проверяемой операцией.
- [ ] Запуск Preview с несохранёнными изменениями имеет определённое и отображаемое поведение: либо запускается snapshot рабочей модели, либо сначала требуется сохранить проект — без неоднозначного смешения состояний.
- [ ] Команды жизненного цикла preview обрабатывают повторные вызовы и ошибки; зависшие server/preview процессы не остаются после Stop/закрытия.
- [ ] Error/log messages связаны с текущим запуском и доступны для диагностики.
- [ ] Live Inspector показывает runtime state, а не только сериализованные значения из editor model.
- [ ] Сборка/запуск браузерного preview не требует Tauri.
- [ ] В документации указаны ограничения процесса изоляции и метрик; производительность подтверждена замером на fixture.

---

## Этап 4 — HTML5 Build Pipeline и Platform Services

**Цель:** проверять не только сцену в редакторе, но и выпускаемую игру; встроить платформенные интеграции через устойчивый API.

**Зависимости:** Project Model и Preview Host из этапов 2–3; platform integration не должна блокировать независимую HTML5-сборку.

### Очередность внутри этапа

1. **Сначала build и validation:** headless-вызов, стабильный output, диагностика схемы/ссылок/ассетов, отделение editor-only зависимостей от game bundle.
2. **Затем resource pipeline:** dependency graph, отчёт о bundle size и только те atlas/compression/import steps, для которых подтверждён gap и выбран воспроизводимый инструмент.
3. **Затем Platform Services:** общий контракт и mock/local adapter; после этого — Yandex Games как первая целевая интеграция.
4. **Отдельными последующими задачами:** VK Mini Apps и VK Play, каждое с собственной capability matrix и acceptance в соответствующем окружении. Не реализовывать все платформенные функции в одном PR.

### Задачи

- [ ] Инвентаризировать используемые builder/bundler-инструменты и расширять существующий pipeline, прежде чем вводить новый.
- [ ] Добавить проверку project schema, отсутствующих ссылок, недоступных ассетов, конфликтов ID и неиспользуемых ресурсов там, где их можно определить безопасно.
- [ ] Построить dependency graph ресурсов для проекта и отчёт о размере/составе production bundle.
- [ ] Проверить, можно ли заменить текущий вендорный Phaser bundle на совместимый upstream variant или воспроизводимую кастомную сборку; на fixture сравнить runtime/API coverage, raw/gzip size и фактическое inclusion/exclusion. Если модуль нельзя исключить проверяемо, зафиксировать ограничение и не заявлять селективную сборку только на основании feature metadata.
- [ ] Ввести минимальный Feature/Capability Registry contract для встроенных функций и test fixture (stable feature IDs, provider, scopes/targets, declared requirements/conflicts); первая сборочная версия не должна зависеть от готовности UI Package Manager.
- [ ] Хранить выбор необязательных features в версионируемой project/target configuration отдельно от установленного npm dependency tree; defaults и required features должны быть явными. На этапе 4A допускается встроенный registry и mock/fixture provider; интеграцию реальных package-provided descriptors через `codogma` metadata выполнить на этапе 8 после утверждения package metadata schema.
- [ ] На основе выбранных features и target вычислять declared feature-dependency closure, проверять недостающих provider packages, конфликты и unsupported scopes/targets; выдавать machine-readable diagnostics, не устанавливая npm dependencies автоматически.
- [ ] Включить состав selected features и причины inclusion/exclusion в build report; проверить на fixture, что выключенные/неподдерживаемые и editor-only contributions не попадают в production bundle там, где это доказуемо import graph/bundler.
- [ ] Добавить target-aware texture compression/quality profiles, atlas variants и fallback для несовместимых browser formats; отчёт должен объяснять размер выбранных вариантов и включение ресурсов.
- [ ] Ввести версионируемые Development/Release build profiles и документировать browser/target matrix, startup size, source maps/debug tools и исключение editor-only dependencies из production; проверить возможность использования [Vite](https://vite.dev/guide/) только после сравнения с текущей сборкой.
- [ ] Вывести `importFileExtension` в UI настроек генерации сцен и User Components. При включённом флаге локальные ESM imports используют `.js` для emitted modules, даже если исходник имеет расширение `.scene` или `.ts`; покрыть sibling/nested prefab и component regression fixtures.
- [ ] Для package-based codegen проверить фактическое наличие `phaser` и `@phaserjs/editor-scripts-base` в dependency graph. Один `package.json` не доказывает, что оба модуля объявлены и будут разрешены; отсутствующие зависимости должны давать понятную диагностику до release build.
- [ ] Зафиксировать поддерживаемые браузеры, WebView и целевые embedded hosts с минимальными версиями; для каждого target указать статус supported/experimental/unsupported, причины и fallback.
- [ ] Добавить воспроизводимый Web lifecycle fixture: hidden/visible, focus loss, pause/resume с несколькими независимыми причинами, frame stalls и bounded fixed-step catch-up; отдельно тестировать blocked audio до user gesture.
- [ ] Добавить recovery acceptance для WebGL context loss/restore и interrupted asset loading; проверить stop/restart, повторную подписку listeners и освобождение GPU/decoded resource lifecycle.
- [ ] Добавить mobile/host acceptance для resize/orientation/DPR, memory pressure, storage quota/denied state и взаимодействия parent iframe с origin-validated message contract. Не требовать COOP/COEP в default target.
- [ ] Реализовать сборку целевого runtime непосредственно из валидированной Project Model, сериализованных сцен, зарегистрированного графа TypeScript-компонентов, asset graph и настроек adapter; отдельный generated TS-класс на каждую сцену не является обязательным входом.
- [ ] Реализовать воспроизводимую HTML5-сборку с понятными сообщениями об ошибках и определённым выходным каталогом.
- [ ] Добавить подходящие обработчики ассетов: атласы, оптимизацию изображений, проверку аудио/шрифтов и другие операции только при подтверждённой потребности.
- [ ] Подготовить platform-neutral API Platform Services и Mock/Local implementation.
- [ ] Проверить локальное сохранение пользовательского состояния/прогресса с версионированием, миграциями, повреждёнными данными и graceful handling недоступного browser storage.
- [ ] Добавить Yandex Games adapter к официальному SDK и тестовую реализацию для локальной разработки.
- [ ] Отделить VK Mini Apps/VK Bridge и VK Play как разные targets/integrations с отдельными возможностями.
- [ ] Определить capabilities адаптеров: реклама, rewarded ads, покупки, сохранения, лидерборды, player info и pause/resume.
- [ ] Обрабатывать отказ/отсутствие SDK, смену фокуса, закрытие рекламы, ошибки и восстановление игрового цикла.
- [ ] Проверить первую реальную платформенную интеграцию в допустимом test/sandbox окружении и задокументировать требования к публикации.

### Критерии приёмки

- [ ] Получается независимая HTML5-сборка, работающая без editor server и без Tauri.
- [ ] HTML5 fixture собирается из сериализованной сцены, зарегистрированного TypeScript-модуля компонента, asset graph и выбранного adapter; отсутствие per-scene generated TS source не блокирует build.
- [ ] Build report отражает использованную ревизию/schema version, подключённые component type IDs/modules и asset graph; отсутствующие/несовместимые refs завершают сборку структурированными ошибками до выпуска output.
- [ ] Preview и экспортированная игра создают согласованную hierarchy/component state; build report показывает включённые scene data, scripts и runtime dependencies.
- [ ] Сборка проходит asset/project validation и сообщает ошибки до публикации.
- [ ] Platform API работает через mocks локально и через отдельный adapter в целевом окружении.
- [ ] Rewarded reward выдаётся только после подтверждённого успешного завершения рекламного сценария.
- [ ] Недоступность платформенного SDK не приводит к падению базовой игры.
- [ ] В тестах и документации разделены Yandex Games, VK Mini Apps и VK Play.
- [ ] Runtime/build-only зависимости не попадают в лишние production bundles.
- [ ] Feature Registry различает package installed, feature provided/available, feature enabled in project, target-included и runtime/editor-activated states; один статус не переключает другой автоматически. На этапе 4A package-installed/provider state разрешено проверять через тестовый fixture descriptor, не считая финальный package metadata contract уже утверждённым.
- [ ] Web acceptance подтверждена на зафиксированном browser/device/host matrix и включает hidden-tab lifecycle, audio autoplay denial/recovery, WebGL context loss, asset cancellation, resize/DPR, browser storage failure и origin validation для parent messaging.
- [ ] Build artifact report сохраняет raw/compressed initial payload, runtime/asset inclusion manifest и измеренные time-to-first-frame; mobile memory/CPU показатели не выводятся из desktop/headless/SwiftShader результатов.
- [ ] Cross-origin isolation/threaded WASM — отдельный opt-in profile с проверкой headers и совместимости сторонних SDK/ads; unsupported hosting configurations диагностируются до выпуска.
- [ ] Fixture проверяет feature dependency closure, отсутствующий provider, несовместимую комбинацию/target и структурированную диагностику.
- [ ] Повторная сборка с той же конфигурацией даёт стабильный список выбранных функций и эквивалентный состав bundle; tree-shaking claims подтверждаются измеримым bundle report, а не одним лишь описанием metadata.
- [ ] В feature-build acceptance явно разделены логическое отключение функции и физическое исключение её runtime-кода; для Phaser-пути исключение считается доказанным только после проверки конечного bundle на fixture.

---

## Этап 5 — staged replacement Colibri UI и 2D authoring workflows

Нормативный product/UX baseline для всех UI/authoring slices — [стандарт reference для 2D Editor Host](editor-reference-standard.md). На каждую задачу проверять конкретные Unity 6.6 и Cocos Creator 4.0 2D workflows и фиксировать adopt/adapt/reject; Colibri не использовать как визуальную или архитектурную спецификацию.

**Цель:** завершить поэтапную замену пользовательского UI на самостоятельный SolidJS Editor Host. COD-80 уже реализовал первый Workbench/Scene slice; далее новые workflows создаются в src/editor отдельными вертикальными срезами. Legacy Colibri в source/editor используется только как read-only reference/compatibility client и для критических временных fixes. Полезные user workflows, data formats, import/reimport contracts, runtime semantics и ограничения можно изучать и переиспользовать; UI mechanisms, private APIs, plugin registry и внутреннюю Colibri архитектуру переносить нельзя. Фаза завершается browser/runtime acceptance, cutover и последующим отдельным cleanup.

**Зависимости:** текущие project/file/serialization/codegen/Undo-Redo/runtime contracts, собственные Host services и согласованные lifecycle/session boundaries. src/editor уже существует как отдельное SolidJS приложение с собственным package/lockfile. source/editor не переносится и не становится зависимостью нового Host; оба клиента сосуществуют до cutover. Новые Core/Preview/HTML5 contracts развиваются как отдельные engine streams.

### Задачи

- [ ] Инвентаризировать существующие Colibri/workbench capabilities (панели, вкладки, dock/resize/layout, shortcuts, commands) как reference и acceptance baseline. Не переносить их реализацию автоматически; новые primitives реализовать в SolidJS Host и использовать Colibri только для поддержки legacy клиента до cutover.
- [ ] Сформировать и реализовать согласованную визуальную систему редактора: типографика, spacing/density, размеры контролов, toolbar/menu patterns, focus/hover/disabled/selected/error/loading/empty states, keyboard navigation и базовые accessibility expectations.
- [ ] Привести главную рабочую среду к профессиональному 2D-editor workflow: Scene/Game view, Hierarchy, Inspector, Assets/Pack и Console/diagnostics должны иметь понятную роль, согласованную визуальную иерархию и эффективный default layout. Не создавать фиктивные панели без работающего содержания.
- [ ] Проверить поведение панелей при изменении размера окна/панелей, сохранение/восстановление рабочих раскладок и доступность ключевых команд через keyboard shortcuts; переиспользовать существующие механизмы, а новые добавлять только при доказанном gap.
- [ ] Для каждой выбранной подсистемы фиксировать необходимые gaps, tests и acceptance вместе с реализацией, а не выполнять полную инвентаризацию всех файлов до первого исправления.
- [ ] Усилить основной Scene Editor workflow: hierarchy, Transform, selection, multi-edit, Undo/Redo, безопасное сохранение.
- [x] Реализовать engineering scope Sprite Editor и asset authoring (COD-39): single/multiple import, slicing, versioned frame metadata, Inspector для trim/crop/pivot/collision geometry, сериализацию, безопасный reimport и regression tests. Реализация и ограничения описаны в [Sprite asset metadata contract](sprite-asset-metadata.md). Существующая группировка Phaser Layer и её display-list order переиспользуются; именованные Sorting Layers, sortingOrder и Y-based sorting вынесены в COD-41. Существующие 9-slice и tiled draw остаются Scene Editor tools.
- [ ] Провести независимую browser/editor/generated-runtime приёмку Sprite Editor и asset authoring (CODQA-10); не считать завершение инженерной реализации evidence фактического поведения в браузере.
- [ ] Проверить atlas preview/analyzer: rendered vs culled sprite counts, atlas page count and utilization, duplicate/unused atlas assignments and target variants where instrumentation allows.
- [ ] Зафиксировать правила camera/world/local/screen/UI coordinate conversion, Y-based sorting для top-down сцен, camera bounds/follow и render order между world и UI.
- [ ] Согласовать и реализовать User Components/TypeScript script authoring в SolidJS Host (COD-91) поверх общих Core/data contracts COD-26/COD-27; не копировать Colibri registry или script lifecycle.
- [ ] Проверить Prefabs/nested Prefabs/overrides, обновление экземпляров и сохранение связей.
- [ ] Улучшить Tilemap workflow: layers/palettes, reusable brush presets/custom brushes, rule tiles/auto-tiling, collisions/object layers, animated tiles и совместимый [Tiled](https://docs.mapeditor.org/en/latest/manual/introduction/) import/export с предупреждением о неподдерживаемых свойствах.
- [ ] Проверить square-grid workflow, затем оценить hex/isometric layouts; измерить tilemap chunk updates/culling и не перестраивать целую карту при изменении одной клетки.
- [ ] Развивать Animation workflow в SolidJS Host (COD-84): timeline/tracks/keyframes/curves/events только в объёме, подтверждённом сериализацией и Phaser runtime; state graph/blend trees остаются deferred без отдельного evidence.
- [ ] Перенести Physics authoring workflow в SolidJS Host (COD-42) на основе существующих runtime/body contracts и текущего acceptance CODQA-1; не копировать Colibri panels/controls и не добавлять backend без ADR/PoC.
- [ ] Проверить input focus/routing (UI versus world), touch cancellation, camera coordinate transforms, audio unlock/focus behavior и lifecycle cleanup.
- [ ] Проверить UI Editor на 9-slice, text/rich text/font fallback, keyboard focus, safe areas, resizing and aspect ratios.
- [ ] Добавить smoke/acceptance fixtures для audio groups, localization keys/fallbacks и save data migration, если соответствующие P1 capabilities реализуются в этой фазе.
- [ ] Проверить точечные importer extensions (PSD/Aseprite) через общий asset metadata/reimport contract, а не через отдельные несогласованные форматы.
- [ ] Рассмотреть UI layout tools: anchors, responsive layout, scale modes, interactive states и mobile safe areas.
- [ ] Перенести FX authoring/preview в SolidJS Host (COD-89; acceptance CODQA-19), сохраняя существующие Phaser/codegen semantics и regression evidence; legacy FX acceptance CODQA-3 не считать приёмкой нового Host.
- [ ] Перенести Spine authoring/preview в SolidJS Host (COD-90; acceptance CODQA-20) через общие asset services и session-aware bridge COD-85; live MCP operations также входят в CODQA-8.
- [ ] Переносить Audio Groups/Particle Preview в SolidJS Host (COD-61; acceptance CODQA-13), а остальные graphics/audio/assets workflow планировать по capability matrix и production pain points.
- [x] Выбранный набор общих UI/2D Godot SVG assets импортирован в `src/editor/icons/` и используется новым SolidJS Host. Сохранить provenance/upstream commit, mapping и MIT notices; последующие additions — только для подтверждённых workflows. Не переносить Colibri icon loader или 3D-only assets.
- [x] Для импортированного набора подготовлены assets и theme-aware use в новом Host; exact contrast, focus/hover/disabled/selected/error states и визуальная проверка всех design artboards подтверждаются browser/design acceptance CODQA-18, а не фактом наличия SVG.
- [x] Создана родительская Engineering issue COD-82 для staged Colibri → SolidJS migration; COD-80 / PR #30 остаётся первым реализованным Host/Scene slice. COD-82 координирует следующие authoring workflows, MCP routing, acceptance, cutover COD-87 и Colibri cleanup COD-88.
- [x] Создан самостоятельный SolidJS Host в `src/editor/`. На период migration он запускается через Vite на отдельном loopback port (по умолчанию 5173), а legacy editor остаётся на текущем backend (по умолчанию 3000). Vite проксирует `/editor/*` backend routes; используется точный `CODOGMA_ALLOWED_ORIGINS`, не wildcard. Два UI не встраиваются друг в друга и не обмениваются UI state через постоянный bridge.
- [x] **COD-80 / PR #30 — первый Host/Workbench + Scene vertical slice:** Unity-подобная Dark/Light оболочка по `.pen`, Phaser Scene workflow, Hierarchy/Inspector/Project/Animation/Components/Console, persisted layout, Console docking, перенос Hierarchy/Inspector в Bottom Dock и возврат, tab reorder, focus-aware shortcuts и Command Palette focus management. CI Fast #425: typecheck/build, 25 domain tests, 7 Chromium acceptance tests и общие `fast-checks` прошли. Это завершает только первый срез; оставшиеся миграция инструментов, MCP SSE routing и production cutover не закрыты.
- [ ] На время dual-run запретить concurrent writes в один `PROJECT_DIR`. Для параллельной write acceptance использовать отдельные project copies/backend instances. Legacy MCP SSE bridge пока может принадлежать только одному editor client: current server broadcasts events всем `bridgeClients`; session-aware routing требуется до подключения нового Host к общему SSE bridge.
- [ ] Переносить инструменты вертикальными workflow slices: first Host/Scene slice COD-80 уже реализован; далее docking/workspace (COD-83), assets/Sprite (COD-86), Prefab/Components (COD-8/COD-91), camera/UI authoring (COD-41/COD-43), Animation (COD-84), Tilemap/Physics (COD-40/COD-42), FX/Spine (COD-89/COD-90), Audio/Particles (COD-61), project/MCP/settings. Для каждого slice — regression fixtures и browser/runtime acceptance.
- [ ] После inventory sign-off по обязательным workflows (migrated / deferred с owner и причиной / retired с причиной), независимой browser/runtime acceptance, проверки MCP/Preview и project write ownership выполнить production cutover `/editor/` на новый bundle (COD-87) с ограниченным rollback window; затем отдельным cleanup PR удалить Colibri и только legacy-only assets/plugins/build/dependencies (COD-88). Полный feature parity со старым редактором не является критерием cutover.

### Очередность внутри этапа

**A — P0: Unity-подобный SolidJS Workbench и первый рабочий Scene workflow.**
- Сохранение/повторное открытие сцены, hierarchy/Transform, безопасные Undo/Redo и согласованность Prefab/Component metadata с Project Model.
- Input и преобразование координат (mouse/keyboard/touch, UI versus world, camera/viewport), focus loss и cleanup listeners.
- Базовый Sprite workflow: импорт/slicing, trim/pivot, sorting и collision shapes; результат должен сохраняться и соответствовать runtime.
- Минимальные UI anchors/layout/scaling/safe areas и проверка нескольких viewport/aspect ratios.
- Минимальные Physics Editor/runtime contracts, debug overlay и поддерживаемый backend — без обязательства добавлять дополнительные backends.
- Базовый Animation Controller/state workflow и resource lifecycle, когда соответствующая возможность нужна выбранному vertical slice.
- Все эти функции считать завершёнными только после tests/fixtures и согласованного preview/build acceptance. Не реализовывать весь P0 одновременно: брать следующую подсистему по количеству блокирующих gaps и зависимости.

**B — P1: расширение authoring workflow после P0 и общей модели ресурсов.**
- Расширенный Tilemap: reusable brushes, rule tiles/auto-tiling, object/collision layers, Tiled import/export с сообщениями о потерях, затем измерения chunking/culling и большие карты.
- Audio groups/buses, preview и browser focus/autoplay lifecycle; базовые particles с безопасным повторным запуском preview.
- Versioned local storage/save migrations и localization tables/fallbacks, если востребованы первыми реальными проектами.
  - [x] **COD-62 — localization tables/fallback:** версионированный контракт таблиц (v1), runtime-сервис с детерминированным fallback и структурированной диагностикой, валидация (дубликаты ID, версии, расхождения ключей и placeholders), фикстура `tests/workspace/test-typescript/locale/` и проверки `npm run test:localization` / `npm run test:localization:acceptance` в CI Fast. Контракт и ограничения — [docs/localization.md](localization.md); RTL/complex shaping не заявляются.
- PSD/Aseprite importers, atlas variants/advanced analysis и skeletal animation — отдельными PR, по одному импортеру/формату с license review.
- Дополнительные UI layouts и production authoring tools — по capability matrix, а не для формального feature parity.

**C — P2: отложенные или экспериментальные возможности.**
- Hex/isometric tilemaps, spline terrain, advanced lighting/shadows/normal maps/post-processing, trails/motion streaks и сложные animation blend graphs.
- Дополнительные physics backends и backend-specific features — только при измеренной необходимости.
- RTL/complex text shaping и расширенная accessibility — только после проверки ограничений текущего text/runtime backend.
- Ручные renderer optimizations — только если profiler подтверждает конкретный bottleneck.

**P0 — иконки и темы нового SolidJS Host.** Реализовать единые semantic tokens и theme switching, интегрировать отобранные Godot Editor Icons для общих UI-команд и поддерживаемых 2D-возможностей, исключить 3D-only assets, сохранить source mapping/MIT notices. Обязательны browser acceptance dark/light/lightBlue (или согласованных theme variants), focus/hover/disabled/selected/error states и проверка контраста.

**Полная замена Colibri UI — активная staged initiative COD-82, но не одномоментная задача.** SolidJS + TypeScript/TSX + Vite + Tailwind CSS 4 уже реализованы как самостоятельный Host; PR #30 пока не интегрирован. Не внедрять SolidJS-вью внутри Colibri как постоянный bridge. Docking/layout library, CodeMirror и Monaco оцениваются отдельно только при наличии конкретного workflow; они не являются обязательными компонентами миграции.

См. полный migration scope, портовую схему, ограничения API/MCP и критерии cutover: [docs/editor-ui-migration.md](editor-ui-migration.md).

### Критерии приёмки

- [ ] Для каждого перенесённого/изменённого инструмента есть checklist основных действий и regression tests.
- [ ] Undo/Redo, save/reopen, Prefab update и существующий legacy code generation сохраняют ожидаемую семантику; изменения не ломают текущие проекты в ожидании нового Core loader.
- [ ] Browser workflow остаётся проверяемым в ходе UI миграции.
- [ ] Набор иконок ограничен общими UI-командами и поддерживаемыми 2D-инструментами; 3D-only иконки не включены и не используются.
- [ ] Светлая и тёмная темы корректно выбирают свои варианты иконок; проверены читаемость, контраст и применимые состояния интерфейса.
- [ ] Происхождение заимствованных значков документировано по конкретному upstream commit и исходным файлам, необходимые license/copyright notices сохранены.
- [ ] Не заявлены поддерживаемыми эффекты/physics/animation capabilities, которые не работают в runtime или export.
- [ ] Удаление legacy view/module возможно только после подтверждённой замены и проверки всех известных consumers.

### Follow-up backlog по PR #10 — закрывать отдельными проверяемыми изменениями

Эти пункты намеренно остаются открытыми: CI Fast подтверждает сборку, запуск локального сервера и конкретные security smoke-сценарии, но не заменяет браузерную приёмку. Не снимать пункты только на основании зелёного typecheck/build.

- [ ] **FX и codegen:** запустить на Phaser 4.2.1 одну fixture-сцену с Circle/Bloom/Gradient/Shine; сравнить редакторский preview и сгенерированную игру, проверить параметры, pre/post FX, вложенные Container, parent transform/alpha, изменение размеров, sibling order, удаление объектов и shutdown/restart. Зафиксировать неподдерживаемое наследование alpha у Gradient как ограничение, пока не появится проверенное решение. Добавить регрессионные проверки синхронизации/пересоздания Circle mask и очистки созданных объектов/listeners.
  - Прогресс (commit 258cbe0): fixture-сцены `fx-acceptance.scene`/`box2d-acceptance.scene` добавлены и проверены вживую в редакторе (Circle preFX + Bloom postFX + вложенный Shine + Gradient; outline/Inspector корректны, ноль ошибок консоли); при приёмке вскрыты и исправлены три реальных дефекта: числовые цвета молча превращались в чёрный tint и персистились в JSON, FX-обёртки падали на строковых методах над числовыми цветами (каждый кадр), render-хелперы FX ломали модель объектов редактора; 11 regression-тестов (tests/editor-color-values.test.mjs). Остаток: сравнение с реально запущенной сгенерированной игрой, sibling order/удаление/shutdown-restart, регрессии пересоздания Circle mask и очистки listeners, фиксация ограничения alpha у Gradient.
- [ ] **Box2D component runtime:** скомпилировать и реально запустить сгенерированную сцену с компонентами на существующих Phaser GameObjects; проверить legacy prefab и template-owned world ID, gravity/axis/angle conversion, box/circle fixture, static/kinematic/dynamic bodies, body↔sprite sync, fixed-step и stalls/pause на 30/60/120 FPS. Проверить stop/shutdown/restart без оставшихся listeners/worlds, отдельный `PhaserBox2D.js` и, если включён Debug Draw, совместимый `PhaserDebugDraw.js`. Проверка двух миров/different World Scale обязательна до заявления о такой поддержке: если global `SetWorldScale`/`WorldStep` не дают безопасную изоляцию, ограничить контракт и документировать её явно. Отдельно typecheck-нуть JS и TypeScript outputs как пользовательские проекты; TypeScript fixture должен содержать реальные helpers и matching declarations, а не только editor ambient types.
- [ ] **Standalone Box2D body/shape nodes (отдельная задача, не scope PR #21):** не регистрировать node types, пока не готовы schema и Inspector, body-ID propagation (не world ID), runtime named imports, geometry validation, prefab/root/child semantics, data round-trip и browser acceptance. Проверять generated code против закреплённой версии внешней библиотеки и fixtures с invalid/missing inputs.
- [ ] **Asset Pack и браузерные API:** проверить загрузку шрифтов и поведение при ошибке/повторе, форматы и доступность compressed textures в целевых браузерах/GPU, вложенные каталоги и несколько batches `DirectoryReader.readEntries()`, продолжение импорта после ошибки одного файла, а также missing/invalid URL и освобождение аудио/видео-ресурсов. Зафиксировать проверенные форматы и браузеры; классификация расширения не равна поддержке preview/runtime.
- [x] **Regression tests для данных и предпросмотра:** покрыты литералы `undefined` и spread-ключи в JSON/code printer; конфигурация/удаление кадров Particle Emitter и fallback `__DEFAULT`; spritesheet frame lookup с margin/spacing и до/после загрузки изображения; поддерживаемые формы Phaser audio/video URL (строка, массив и `{ type, url }`); ошибки чтения/сохранения thumbnail cache и освобождение `blob:` URL. Ветка `fix/particle-emitter-codegen-regressions-20261029` содержит тесты Particle Emitter, JSON/code printer, spritesheet/audio/video URL и cache clearing. `AudioPreviewSection` проверяет string, string-array и descriptor URL resolution, включая malformed entries; реальный `Controls.createImageFromBlob()` проверяется на `URL.revokeObjectURL` при `load` и `error`, а `ThumbnailCache` — на recovery после сбоев чтения/сохранения IndexedDB. CI Fast на HEAD `08ccef6` прошёл: root suite 89/89, localization suite 81/81, editor build/typecheck, security smoke и localization runtime acceptance — PASS. Результат закрывает тестовый scope COD-13; фактическое browser/runtime Box2D и FX acceptance остаётся отдельными задачами.
  - Прогресс (commits 952361e, 258cbe0): покрыты audio/video URL-формы, spritesheet margin/spacing до/после загрузки (включая найденный и исправленный паритет-дефект парсера кадров), undefined-литералы в JS/TS-принтерах и JSON, thumbnail cache; добавлены regression-тесты цветовых значений (числовые цвета, tint round-trip, FX-хелперы). Новый тестовый срез `fix/particle-emitter-codegen-regressions-20261029` добавляет проверки реального compiler-config builder для fallback `__DEFAULT`, установки списка кадров и удаления `frame` после очистки выбора. Остаток: освобождение `blob:` URL (в исходниках не обнаружен подтверждённый `URL.revokeObjectURL`-путь; нужен отдельный аудит lifecycle, а не фиктивный тест).
- [ ] **Server/API security regression coverage:** сохранять проверки loopback bind, `Host`/`Origin`, JSON/multipart limits, project-file listing/read/write/upload, root `phasereditor2d.json`, symlink/dangling symlink и built-in/stdio MCP. Проверять, что отказ не читает и не изменяет данные за пределами project root. Для HTTP request bodies сохранять ранний reject `Content-Length` выше 32 MiB JSON / 128 MiB multipart и потоковую проверку фактического размера для chunked/misdeclared-length; malformed JSON должен возвращать HTTP 400, overflow — HTTP 413.
  - **Текущая реализация (уже в `dev`):** file reads и content writes работают с открытыми и проверенными descriptors; HTTP project/editor/static/archive responses стримятся из проверенных handles; MCP file/text/asset metadata reads и `project-write-file` используют descriptor-backed helpers. На Linux directory creation (`ensureProjectDirectorySafely`/Sync), delete, rename, one-level enumeration, exclusive MCP Scene/Prefab create и CopyFile используют открытые directory descriptors и `/proc/self/fd`-anchored операции. Symlink entries отвергаются для copy и пропускаются при listing. AI-chat attachments читают bounded prefix до 24 KiB из verified handle.
  - **Автоматизированные доказательства:** `tests/path-security.test.mjs` содержит adversarial parent-symlink-swap tests для reads/writes, delete, rename, mkdir, enumeration и CopyFile source/destination, включая проверки сохранности внешних данных. Linux-only tests явно помечены `skip` на других платформах. `tests/security-smoke-test.mjs` покрывает loopback/Host/Origin, path/symlink escapes, upload/config и MCP compatibility. CI Fast включает unit/security suites, но его Linux runner не доказывает поведение non-Linux fallback.
- [ ] **Остаточный filesystem TOCTOU / cross-platform acceptance (CODQA-7):** не описывать текущую реализацию как просто real-path/pathname validation: на Linux перечисленные выше операции уже привязаны к открытым directory descriptors, а `realpath` containment остаётся предварительной/дополнительной проверкой. Однако portable race-free гарантия не доказана. Non-Linux mutation fallback повторно проверяет containment/identity, а затем использует pathname syscalls; между проверкой и операцией остаётся race window. Отдельный residual сохраняется, когда уже открытый и проверенный каталог перемещают за пределы project root до завершения descriptor-anchored операции: directory handle продолжает ссылаться на тот же inode, но это само по себе не доказывает, что inode всё ещё расположен под project root.
  - Приёмка должна зафиксировать матрицу реально поддерживаемых ОС/файловых систем и commit SHA; на каждой заявленной non-Linux платформе проверить symlink/reparse-point races для read/write/create/delete/rename/copy/list, а также сценарий перемещения открытого каталога наружу, если применим. До получения evidence не заявлять cross-platform race-free гарантию, не расширять threat model без отдельного решения и сохранять main server/API loopback-only. См. [CODQA-7](https://linear.app/codogma-engine/issue/CODQA-7/provesti-cross-platform-acceptance-fajlovoj-bezopasnosti).
- [ ] **Release evidence:** прикреплять к PR результаты ручной browser acceptance и адресных тестов; отдельно записывать, что `npm run test:e2e`/UI E2E или release workflow не запускались, когда это так. Для PR #10 CI Fast прошёл на PR head `3c96dde67eb865a0ee70fdbd5134ab995f846443` перед слиянием в `dev` (`754edaa1f7313409e99c3462a802d5fd430a9a01`); отдельный запуск на merge commit не подтверждён в этом аудите. Это не закрывает runtime/security follow-ups и не заменяет acceptance evidence соответствующих функций.

### Критерий закрытия follow-up backlog

Каждый пункт закрывается только после воспроизводимого теста/fixture либо описанной ручной проверки, прикладывания результата к соответствующему PR и обновления этого списка. Для непроверенного поведения указывать ограничение явно; не выдавать наличие кнопки, type declarations или codegen за доказательство работающего runtime.

---

## Этап 6 — production debugger, profiler и quality gates

**Цель:** обеспечить инженерную диагностику и контроль качества, необходимые для разработки и выпуска коммерческих 2D Web-игр.

**Зависимости:** runtime/model contracts этапов 2–3, build pipeline этапа 4 и изменяемые editor workflows этапа 5. Typecheck/lint/unit checks внедряются с первых новых модулей; этот этап добавляет системную диагностику, воспроизводимый profiling и release gates.

### Приоритеты

Проверки сдвигаются влево и вводятся одновременно с каждой подсистемой: не откладывать unit/typecheck/lint до завершения всей архитектуры. Самостоятельный этап QA нужен для объединения telemetry, regression baselines, широкого browser acceptance и release checklist, а не для первого появления тестов.

### Задачи

- [ ] **Editor Logging & Diagnostics:** спроектировать и реализовать общий EditorLogger, структурированные записи, сбор browser errors/rejections, dockable Console panel, фильтры/search/repeat collapse и persistent logs. Требования и reference patterns — [Editor Logging & Diagnostics](editor-logging-and-diagnostics.md) и ТЗ §13.5.
- [ ] **Browser → Node diagnostics:** безопасно передавать browser/editor errors в terminal/file sink через same-origin/loopback transport; проверить Origin/Host, body/rate limits, redaction, rotation/retention и fallback при недоступности транспорта.
- [ ] **Runtime log/error console:** группировать runtime сообщения по Preview/game session и объекту; обеспечить раздельный просмотр Editor/Runtime/Build/Server/MCP каналов и связь runtime entries с live hierarchy/Inspector.
- [ ] Реализовать live runtime hierarchy/component inspector и переходы между runtime selection и editor selection.
- [ ] Добавить физические overlays, состояния объектов и поддерживаемую диагностику animation/resources.
- [ ] Измерять frame time и количество runtime объектов; добавить доступные renderer/texture/resource metrics с точным описанием их источника.
- [ ] В рамках доступной instrumentation добавить 2D-метрики: rendered vs culled sprites, atlas count/pages/utilization, batches/draw calls, tilemap chunks and render/update/collision time, physics step/contact counts, asset loading and bundle size.
- [ ] Для Web release измерять initial download size, time-to-first-frame и отложенную/прогрессивную загрузку; не использовать непроверенные абсолютные thresholds.
- [ ] Добавить memory/CPU measurements только там, где платформа даёт корректную метрику; не подменять измерение оценкой без маркировки.
- [ ] Ввести воспроизводимые performance fixtures и regression baselines.
- [ ] Добавить unit/integration tests для Core, schema, serialization, runtime adapters и project validation.
- [ ] Добавлять browser E2E для ключевых workflows редактора и production build без запуска полного тяжелого UI E2E на каждый рутинный PR, если это не нужно текущему слою.
- [ ] Для release candidate обязать соответствующие integration/build checks и browser/manual acceptance для затронутых UI/runtime сценариев.
- [ ] Сделать отчет о целевом браузере/платформе, результатах проверок и известных ограничениях частью release checklist.

### Критерии приёмки

- [ ] Performance regression измеряется на закреплённой fixture и воспроизводимом окружении.
- [ ] Автоматические проверки покрывают критичные контракты, миграции и жизненный цикл.
- [ ] Browser acceptance подтверждает полный цикл от редактирования сцены до тестирования собранной игры.
- [ ] CI статусы и локальные команды описаны без утверждения, что автоматизация проверяет непокрытые сценарии.
- [ ] Ошибки и известные ограничения релизного кандидата видимы и задокументированы.
- [ ] Editor Logging & Diagnostics собирает необработанные browser errors/rejections, сохраняет stack/context, поддерживает поиск/фильтры/repeat collapse и экспорт.
- [ ] Ошибка основной операции и ошибка rollback/recovery не теряются; primary cause остаётся исходной ошибкой, secondary failure виден в журнале.
- [ ] Browser-originated errors доступны в локальном terminal/file sink без небезопасного публичного endpoint; file retention и redaction проверены.


## Сквозное архитектурное направление — AI-assisted Game QA и Browser QA MCP

**Цель:** сделать тестирование работающей игры таким же штатным workflow, как создание сцены и сборка проекта. AI-агент должен использовать документированные Engine/QA APIs и MCP tools, а не создавать временные вспомогательные скрипты для запуска браузера, отправки input, чтения runtime state, сбора логов и подготовки отчёта.

**Статус:** архитектурное направление зафиксировано; реализация не начата. Требования — ТЗ §13.4 и ADR-0006. Это не утверждение, что текущий Editor MCP уже умеет выполнять gameplay QA.

**Зависимости и порядок:** базовые Build/Preview contracts этапов 3–4 и runtime diagnostics этапа 6. Contract design, browser-provider spike и schema fixtures можно начинать параллельно. Полный gameplay acceptance не объявляется готовым до появления управляемого Preview lifecycle и Game Test Bridge. Направление не зависит от Tauri и не требует завершения SolidJS migration.

### Архитектурные deliverables

1. **Engine Test Bridge.** Engine-owned versioned contract в Development/Test runtime: session handshake, stable Entity/Scene IDs, bounded state snapshots, typed event stream, registered diagnostics, declared capabilities, optional deterministic seed/clock where supported. Phaser-specific objects не выходят за Runtime Adapter boundary. Bridge отсутствует в Release output.
2. **Browser Controller.** Управление изолированными browser contexts и явный attach mode к уже запущенному Chromium-based браузеру. Playwright — основной кандидат для изолированных сессий; CDP — дополнительный transport для attach/диагностики. Выбор фиксируется после проверки browser matrix, lifecycle, security и качества evidence. Kimi WebBridge изучается как reference, но не является обязательной зависимостью или протоколом.
3. **Game QA MCP.** Отдельный companion package (предварительное имя @codogma/game-qa-mcp), не перегружающий Editor MCP. Он вызывает Build/Preview API, связывает browser и game test sessions, запускает сценарии и выдаёт структурированные результаты.
4. **Declarative Scenario Runner.** Versioned JSON/schema-first описание preconditions, browser inputs, waits, event/state assertions, checkpoints и teardown. Никаких обязательных одноразовых .mjs/PowerShell/Playwright/CDP driver scripts, создаваемых агентом.
5. **Evidence/Report.** Привязанные к запуску screenshots, optional video/trace, console/network/runtime diagnostics, expected/actual assertions, browser/runtime/build metadata и отчёт PASS/FAIL/SKIP/UNVERIFIED.
6. **Security/lifecycle.** Stdio-first transport для Game QA MCP без собственного TCP listener; loopback-only для отдельных сетевых Browser Controller/orchestration endpoints, если они потребуются. Per-session capability token, origin/project/build binding, isolated browser profiles по умолчанию, explicit attach, bounded payload/event buffers, cancellation и гарантированная очистка. Game Test Bridge не открывает собственный listener/порт и доступен только через session-scoped channel Preview Host.

### Очередность реализации

#### QA-0 — аудит и технический spike

- [ ] Инвентаризировать текущие Editor MCP, server APIs, Project Build API, Preview Host, runtime adapter, diagnostics и существующие browser automation dependencies. Не дублировать существующие команды.
- [ ] Изучить Kimi WebBridge references: официальный product workflow, Nimm0ny MCP adapter, efrg123 v2 architecture/API plan; отдельно проверить лицензию и реальный статус кода до reuse. Считать их reference, а не зависимость.
- [ ] Сравнить Playwright isolated browser sessions и CDP attach к существующему Chromium/Yandex Browser: input fidelity, session lifecycle, console/network capture, screenshot/video/trace, stability, security и CI suitability.
- [ ] Зафиксировать минимальную поддерживаемую browser matrix для первой версии и список explicit unsupported capabilities.
- [ ] Подготовить protocol/schema fixtures и threat model до добавления browser-control endpoints.

#### QA-1 — Engine Test Bridge

- [ ] Утвердить versioned handshake и capability discovery для engine/runtime version, build/preview/session IDs и project revision.
- [ ] Реализовать stable-ID snapshots для сцен и игровых сущностей; expose only allowlisted, serializable diagnostics.
- [ ] Добавить bounded typed event stream с sequence/cursor, correlation IDs, subscription lifecycle, overflow diagnostics и фильтрацией.
- [ ] Определить безопасную регистрацию semantic gameplay test events и test-only actions без доступа к произвольным внутренним объектам.
- [ ] Добавить optional deterministic mode (seed/controlled clock/fixed step) только для тех частей runtime, где semantics гарантируются; отделить его от real-time browser tests.
- [ ] Проверить, что bridge не меняет gameplay, не создаёт второй game loop, не поднимает собственный network listener/порт, использует только авторизованный session-scoped channel Preview Host и полностью исключается из Release build.
- [ ] Добавить tests на malformed/unknown schema versions, stale IDs, missing provider, event overflow, disconnect, cleanup и unsupported capability.

#### QA-2 — Browser Controller и session manager

- [ ] Реализовать изолированные browser contexts/profiles по умолчанию и отдельный explicit attach mode.
- [ ] Ввести session ownership, explicit target tab selection, allowlisted preview origins, version/capability discovery и per-session cancellation.
- [ ] Поддержать browser-level keyboard, mouse, wheel, pointer и touch input; gameplay input не должен заменяться DOM dispatchEvent или прямым вызовом runtime methods.
- [ ] Реализовать обязательный цикл observe → resolve target → actionability → execute → verify → recover со стабильными session/document-scoped refs, диагностикой stale targets и pre/post state diff.
- [ ] Реализовать ожидания по observable conditions и actionability; не строить основной workflow на фиксированных sleeps и угадывании пиксельных координат.
- [ ] Получать screenshot/video/trace и console/network/page diagnostics с ограничением размера и redaction.
- [ ] Проверить timeout, navigation race, browser crash, stale tab, duplicate target, parallel requests, attach disconnect и cleanup.
- [ ] Не использовать личный browser profile/cookies пользователя по умолчанию; attach явно обозначается в tool arguments и отчёте.

#### QA-3 — Game QA MCP

- [ ] Создать отдельный package с собственными manifest, strict typecheck, tests и документацией; использовать stdio-first MCP transport без TCP listener. Loopback-only и session authorization обязательны для любых отдельных сетевых Browser Controller/orchestration endpoints, если они будут обоснованы spike. Не создавать отдельный сетевой endpoint для Game Test Bridge.
- [ ] Интегрировать MCP tools с публичными Preview/Build APIs, Browser Controller и Game Test Bridge; не делать отдельную реализацию build/preview/runtime.
- [ ] Предоставлять task-level tools для session lifecycle, open/attach preview, viewport/input, runtime snapshots/events, diagnostics, scenario execution/cancel и report/artifact retrieval.
- [ ] Использовать structured errors, explicit idempotency/retry semantics и verified/unverified operation status.
- [ ] Ограничить payload/response/event sizes, устанавливать timeouts и не передавать большие binary traces в одном MCP ответе; артефакты выдавать по ID/URI и краткому summary.
- [ ] Не открывать arbitrary page evaluation, shell execution или произвольный вызов внутренних engine methods в стандартном QA tool surface.

#### QA-4 — Declarative Scenario Runner

- [ ] Утвердить versioned schema сценария: metadata, setup, preconditions, actions, waits, assertions, evidence checkpoints и teardown.
- [ ] Поддержать browser input actions и ожидание runtime events/state conditions с явными timeouts.
- [ ] Поддержать assertions на scene/entity/component observable state, event count/sequence, resource state и project-defined gameplay events.
- [ ] Зафиксировать правила retry: не повторять автоматически non-idempotent action после outcome_unknown.
- [ ] Добавить fixture-сценарии для движения, прыжка, collision/landing, item pickup, score/progression, win/lose state, scene transition, restart и input/focus recovery.
- [ ] Хранить сценарии как project-owned declarative test artifacts в согласованной test area; не генерировать временные driver scripts и не смешивать тестовые данные с gameplay source.

#### QA-5 — Reports, artifacts и CI

- [ ] Формировать report с project/commit/schema/build/preview/scenario/browser/OS/viewport/DPR metadata и точными expected/actual результатами.
- [ ] Привязывать screenshots, video/trace, console/network/runtime logs и event snapshots к конкретному run/step.
- [ ] Разделять PASS, FAIL, SKIP и UNVERIFIED; отсутствие диагностики или потеря событий не означает PASS.
- [ ] Обеспечить retention/cleanup, size limits, secret redaction и повторное получение артефактов по ID.
- [ ] Встроить быстрые contract/unit/security checks в обычный CI; адресные browser smoke запускать по затронутому слою, полный gameplay/cross-browser acceptance — on-demand или на release/test promotion. Не добавлять тяжёлую браузерную матрицу в каждый обычный dev/pre-PR прогон.
- [ ] Зафиксировать реальные browser/device/host evidence; headless SwiftShader не считать доказательством GPU/performance на физическом устройстве.

### Сквозной acceptance fixture

Минимальная приёмка должна использовать чистый пример 2D-игры и пройти путь:

1. Сборка проекта штатным Build API без открытого Editor UI.
2. Запуск игры через Preview Host и создание отдельной QA browser session.
3. Ожидание game-ready condition и получение initial runtime snapshot.
4. Реальное browser-level управление персонажем с keyboard или pointer/touch.
5. Проверка перемещения, прыжка/приземления, collision/event, сбора предмета и обновления игрового состояния.
6. Проверка victory/defeat state, перехода сцены и Restart, включая сброс состояния.
7. Сбор screenshots, runtime events, console/network errors и assertions в одном session-correlated report.
8. Завершение preview/browser session с подтверждением отсутствия принадлежащих QA процессов, вкладок и подписок.
9. Повторный запуск того же scenario без генерации агентом вспомогательных инфраструктурных скриптов и без ручного изменения игрового исходника для подключения тестировщика.
10. Подтверждение, что Game Test Bridge не создаёт отдельного listener/порта, а его channel и subscriptions закрываются Preview Host вместе с QA session.

---

## Этап 7 — Tauri desktop shell PoC и упаковка

**Приоритет: optional / не блокирует Web-first MVP.** Цель — проверить, насколько хорошо текущий/эволюционирующий редактор работает как desktop-приложение редактора. Tauri — кандидат; это не часть game runtime и не условие выпуска HTML5-игры.

**Зависимости:** контракты Project Services и Preview Host из этапов 2–3 определены; для осмысленного решения предпочтительны стабильный browser workflow и baseline этапов 4–6. Короткий throwaway PoC можно запустить раньше для проверки отдельного риска, но он не должен отвлекать от Core/build и не создаёт обязательства переходить на Tauri.

### Задачи

- [ ] Создать минимальную Tauri 2 оболочку и зафиксировать версии инструментария сборки.
- [ ] Проверить запуск packaged editor и требуемого server/sidecar процесса на чистом Windows окружении без отдельно установленного Node.js.
- [ ] Проверить выбор папки, доступ к файлам, открытие проекта, сохранение, build, preview и корректное завершение фоновых процессов.
- [ ] Проверить embedded Game View и отдельное игровое окно в WebView2; сравнить загрузку WebGL и отзывчивость Inspector с браузерным вариантом.
- [ ] Зафиксировать модель прав доступа к файлам и межпроцессным сообщениям.
- [ ] Измерить cold start, idle CPU/RAM, UI latency и загрузку ресурсов; сравнить Tauri с альтернативой, если есть конкретная причина.
- [ ] Решить, какие системные операции действительно выгодно перенести в Rust. Не переносить всю бизнес-логику или игровой кадр на Rust ради формального разделения.
- [ ] Оставить web/HTML5 export независимым от desktop оболочки.
- [ ] При подтверждении PoC определить выпускной путь и матрицу ОС; не считать macOS/Linux поддержанными без сборки и acceptance.

### Критерии приёмки

- [ ] Desktop запуск не зависит от установленного пользователем Node.js.
- [ ] Основной сценарий открытия/изменения/сохранения/запуска игры пройден на fixture.
- [ ] Preview Host использует тот же контракт, что и browser mode; архитектура runtime не импортирует Tauri API напрямую.
- [ ] File access ограничен выбранным проектом и проверен негативными тестами.
- [ ] Закрытие редактора завершает принадлежащие ей процессы.
- [ ] Есть протокол измерений и принято явное решение продолжать/изменить/отложить Tauri, а не автоматический переход в массовую миграцию.

**Gate:** не начинать переписывание всего UI или файловой системы, пока PoC не покажет, что текущая архитектура действительно блокирует нужный продуктовый workflow. Отрицательный/неубедительный PoC означает отложить Tauri; результаты HTML5 build и browser preview должны оставаться независимыми от решения о desktop оболочке.

---

## Этап 8 — npm-based Package Manager, расширения и экосистема пакетов

**Цель:** предоставить пользователю управляемый набор выбираемых пакетов и единый workflow, при котором пакет может добавлять возможности движка и редактора без правок Editor Host.

**Зависимости:** стабильные контракты Project Model/Core (этап 2), Preview/build (этапы 3–4), editor/runtime integration (этап 5) и diagnostics/quality gates (этап 6). Архитектурные границы и Extension API проектируются заранее; полноценный Package Manager реализуется после подтверждения package/API contracts.

### Задачи

- [ ] Сформировать taxonomy пакетов по ответственности и scope: Core/shared, editor-extension, runtime, build/CLI, platform adapter и tooling. Имя пакета не обязано начинаться с `plugin-`.
- [ ] Поддерживать исходники самостоятельных пакетов в `packages/<name>/` с собственными manifests, публичными exports, тестами и документацией; не создавать отдельный пакет на каждый класс. Пакет можно разрабатывать в монорепозитории до публичной публикации.
- [ ] Настроить npm Workspaces для локальной разработки пакетов и проверить, что workspace linkage не приводит к установке всех пакетов как dependencies каждого потребительского проекта. После миграции редактора включить `src/editor` в согласованную workspace-схему.
- [ ] Обеспечить Core package `@codogma/cge` в `packages/cge/` без зависимости от Editor UI, Colibri, desktop shell, MCP или платформенных SDK.
- [ ] Определить и протестировать engine-specific metadata в namespaced поле `codogma` стандартного `package.json`: kind, scopes/targets, совместимость с Engine/Editor API, explicit entry points и предоставляемые Feature/Capability descriptors (inline или явной ссылкой на декларативное описание). Metadata не дублирует npm dependency tree и не заменяет npm resolver.
- [ ] Утвердить versioned Feature/Capability Registry contract для встроенных и package-provided capabilities: stable IDs, provider, scopes/targets, requirements/conflicts, required/optional/default policy и build/editor entry points. Неоднозначный выбор нескольких providers должен давать diagnostic, если явная multi-provider policy не утверждена. Точная schema и место хранения подтверждаются ADR/PoC.
- [ ] Не дробить Phaser-подсистемы на формальные wrapper-пакеты ради видимости модульности: сначала доказать, что выбранный runtime packaging/build path действительно позволяет независимо выбирать эти подсистемы и исключать ненужный код.
- [ ] Связать descriptors Registry с project feature configuration и target build profiles; зафиксировать отдельно installed/provided/available/enabled/target-included/activated states и обеспечить совместную валидацию для Editor Host, CLI и build.
- [ ] Разделить package dependencies и feature dependencies: npm отвечает за installation/resolution; Registry проверяет требуемые engine capabilities, предлагает диагностируемое действие для недостающего provider, но не запускает собственную установку и не дублирует npm resolver.
- [ ] Утвердить версионируемые TypeScript contracts для Editor Extension API и extension lifecycle; точную схему и API подтвердить через ADR/PoC до обещания публичной совместимости.
- [ ] Создать Node-side Package Manager Service с целевыми исходниками в `packages/package-manager/`: он использует npm CLI, а Editor Host UI обращается к нему через типизированный HTTP/IPC contract; headless CLI использует ту же реализацию сервиса. Структурированные результаты/ошибки и lifecycle операций общие, UI не запускает npm напрямую.
- [ ] Реализовать и протестировать install/update/remove/list для npm dependencies, управление процессами и отмену, безопасную передачу аргументов, ограничение project root, журналирование и восстановление после неудачной операции.
- [ ] Проверить clean install через `npm ci` в отдельном fixture project с committed lockfile; fixture должен объявлять только необходимые пакеты и получать только их транзитивные зависимости.
- [ ] Разделить область установки и исполнения: base Editor Host dependencies, project-level packages и активные editor extensions не должны случайно смешиваться. В целевом сценарии Extension API получает список пакетов активного проекта и активирует только совместимые расширения с явным entry point и разрешённым scope.
- [ ] Обеспечить package-level registrations для команд, меню/shortcuts, panels/views, settings, Inspector property editors, schema validators, asset import/reimport handlers, Scene Editor gizmos/brushes, profiler overlays, build hooks и target profiles.
- [ ] Установку/обновление/удаление сопровождать проверкой metadata/API compatibility и понятной диагностикой. Добавить project-level activation/disable для editor extensions так, чтобы отключение не требовало изменения npm dependency tree и не повреждало проектные данные.
- [ ] Проверить, что editor-only/build-only зависимости не попадают в production game bundle; build pipeline должен анализировать declared scopes/targets и фактический dependency graph.
- [ ] Проверить, что выбранные в проекте features собираются только для совместимых targets, их обязательные feature dependencies включаются прозрачно, а выключенные features не подключаются скрыто.
- [ ] Подготовить machine-readable report с feature IDs, участвующими packages/entry points, причинами включения и диагностикой; корректно обрабатывать dynamic imports и modules с side effects вместо обещаний автоматического удаления.
- [ ] Поддержать источники по очереди: npm registry/scoped registry и local/file packages сначала; Git/tarball — с pinning ревизии, безопасной обработкой credentials и диагностикой.
- [ ] Применить явную политику lifecycle scripts, лицензий, уязвимостей и provenance. Не считать сторонние editor extensions изолированными только по manifest metadata.
- [ ] Рассмотреть curated feature sets как группы пакетов, устанавливаемые явным действием пользователя, а не как отдельный resolver или автоматический набор обязательных dependencies.
- [ ] Не создавать собственный registry или самостоятельную систему подписи на раннем этапе; принять отдельное решение только при подтверждённой потребности.
- [ ] Подготовить documentation/reference package/example project для создания, установки, включения, отключения и тестирования editor extension; каждый supported hook должен иметь версионируемый контракт и minimal acceptance fixture.
- [ ] Публиковать пакеты в npm только после определения SemVer, backward compatibility, лицензирования, публичных exports и воспроизводимого release процесса.
- [ ] Пересматривать Knip entry points и architectural rules при добавлении dynamic extension discovery; не удалять динамически загружаемые расширения на основании одного лишь отсутствия статических imports.

### Критерии приёмки

- [ ] Пакеты имеют явные назначения/scopes, публичные exports и проверяемые compatibility contracts.
- [ ] Пользовательский fixture устанавливает только выбранные прямые пакеты и их транзитивные dependencies через npm; в manifest/lockfile нет автоматически добавленного полного набора Codogma packages.
- [ ] Editor Extension с корректными metadata/entry point регистрирует как минимум одну команду и одну панель через публичный API без изменения исходников Editor Host.
- [ ] Несовместимый или ошибочный extension даёт диагностируемый результат и не приводит к необработанному падению редактора.
- [ ] Отключение extension не повреждает project data и не требует удаления пакета из npm dependency tree.
- [ ] Package Manager Service использует npm как единственный resolver/installer; собственного npm lockfile/resolver в Codogma нет.
- [ ] Feature descriptors проходят schema/compatibility validation, feature scopes/targets не расширяют ограничения package provider, а discovery читает декларативные metadata и не исполняет пакетный код только ради обнаружения функций.
- [ ] Clean-install fixture проходит `npm ci` и build; Editor UI и CLI используют общий service contract.
- [ ] Editor-only/build-only dependencies не попадают в production game bundle без явного разрешённого включения.
- [ ] Credentials не записываются в tracked project files; политика lifecycle scripts и доверия описана.
- [ ] Публичные API тестируются отдельно; для каждого поддерживаемого extension hook есть минимальный пример и acceptance test.

## Дальние направления — после стабилизации Core и HTML5 pipeline

Это возможности для дальнейшего планирования, а не обещания ближайшего релиза:

- Дополнительные runtime adapters (например, PixiJS) после доказанного PoC и оценки стоимости двойной поддержки.
- Расширенные production инструменты для профилирования, runtime recording и debugging.
- Более глубокий asset pipeline, оптимизация загрузки и bundle budgets.
- Дополнительные платформенные SDK и форматы экспорта.
- Spline-based 2D terrain/shapes, advanced 2D lighting/shadows/normal maps and shader/post-process extensions after renderer capability and performance validation.
- Optional 2D bone rigging/skinning and sprite-part attachments beyond imported skeletal animation playback, if authoring demand and runtime integration justify it.
- Advanced localization/text shaping (including RTL), accessibility-focused game UI and hot reload with state preservation only after core lifecycle contracts stabilize.
- Распространение шаблонов/расширений и более широкий plugin ecosystem.
- Интеграция с VS Code или другими IDE как альтернативный интерфейс к тем же проектным контрактам.

---

## Правило завершения этапа

Этап можно объявить завершённым только после выполнения всех его критериев приёмки, обновления соответствующих tests/docs и интеграции в основную ветку разработки. Если критерии не выполняются, этап остаётся открытым; нельзя заменять фактическую приёмку переименованием статуса или набором выполненных подзадач.

Для крупной архитектурной фазы допускается разработка отдельных готовых частей параллельно, но в `dev → test` переводится только согласованный и внутренне целостный acceptance candidate.


MCP object serialization acceptance covers editor-specific fields for Sprite/TileSprite/slices/Text/BitmapText/shapes/Video/ParticleEmitter/Spine; ParticleEmitter operation config must be translated to the current editor component model.


MCP object contract checks additionally cover Shape stroke fields, HitArea properties and normalization of legacy Arcade.active/body.* aliases to the current editor component serialization. Arcade enable/disable is constrained to editor types that actually install ArcadeComponent.


MCP physics contract coverage includes upstream Arcade aliases, arcade object shorthand, editor-specific ArcadeComponent active/property keys, enable/disable and unsupported-type errors. HitArea and shape stroke fields are included in the object JSON round-trip test.


MCP prompt acceptance now covers the user-facing workflows for scenes and object hierarchy, plain objects/Tiled maps, prefabs, nested prefabs, object lists, filters, Arcade component support, assets/Google Fonts, project-file APIs and UI/SSE-dependent commands. The package contract test checks for these sections through the engine-owned get-system-instructions tool.
