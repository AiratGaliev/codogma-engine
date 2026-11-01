# План миграции Editor UI: Colibri → SolidJS

**Статус на 01.11.2026:** COD-80 — первый самостоятельный SolidJS Host, Workbench shell и Scene vertical slice — реализован; CI Fast #453 на проверенном HEAD `6abf5cf272d7fb29648bbbe4732a7e3bc309a180` подтвердил typecheck + production build, 36 domain tests, 9 Chromium acceptance tests и `fast-checks` (оба job — success). PR #30 остаётся открытым и ещё не смержен в `dev`; production /editor cutover не выполнен. Полная migration, specialized workflows, session-aware MCP routing, cutover/rollback и Colibri removal остаются открытыми; общий owner — COD-82.  
**Baseline:** `dev` на 30.10.2026; legacy client находится в `source/editor/`.  
**Решение:** [ADR-0005](decisions/ADR-0005-solidjs-editor-host.md).  
**Нормативные требования:** [Техническое задание](technical-specification.md).  
**Продуктовые UX-reference:** [Стандарт reference для 2D Editor Host](editor-reference-standard.md).

## Текущий результат COD-80 — первый Host и Scene slice

В `src/editor/` появился самостоятельный SolidJS 1.9 Editor Host на Vite 8 и Tailwind CSS 4. Он запускается отдельно от legacy клиента, использует только loopback интерфейс и проксирует существующие `/editor/*` endpoints. Node backend и `source/editor/` не переписываются.

Реализованные операции первой вертикали:

- загрузка текущего `PROJECT_DIR` через `GetProjectFiles`, рекурсивное обнаружение и открытие `.scene`;
- Phaser-backed Scene Canvas с выбором объектов, Move/Rotate/Scale gestures и синхронизацией состояния с Inspector/Undo-Redo; Hierarchy для display-list/plain-object элементов;
- Inspector с Transform-полями, label, Text content и отображением уже сериализованных компонентов;
- добавление Image/Text/Container узлов, удаление, Undo/Redo с восстановлением selection;
- сохранение исходного JSON scene-format через `SetFileString`, повторное открытие после reload;
- Workbench по основным Dark/Light artboards `.pen`: menu/toolbar, Scene/Game tabs, resizable splitters, Hierarchy/Inspector, Project/Animation/Components/Console, design tokens и Godot SVG icons; responsive layout хранится между запусками;
- docking lifecycle: Console перемещается в Bottom Dock и обратно; Hierarchy и Inspector перетаскиваются в Bottom Dock, возвращаются в исходные слоты через `Undock`; вкладки Bottom Dock переставляются pointer-drag жестом, порядок и выбранная вкладка сохраняются;
- focus/command model: W/E/R/Q и F2/Delete применяются только в контексте Scene/Hierarchy; shortcuts не перехватывают ввод в Inspector; Command Palette удерживает Tab внутри диалога и возвращает фокус исходному элементу при закрытии;
- Game View загружает существующий проектный `index.html` в iframe; закрытие Game View уничтожает iframe/runtime, повторный запуск создаёт новый экземпляр.

Новые модели не заменяют Project Model или backend serializers: scene helper сохраняет неизвестные поля и обновляет только явно разрешённые свойства. Legacy client остаётся доступен на порту 3000; Host предназначен для порта 5173. Для Vite proxy backend запускается с точным `CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173`.

**Границы COD-80, которые не следует смешивать с полной миграцией:** Scene viewport создаёт отдельный Phaser.Game/Canvas из локального runtime проекта для authoring preview; поддержаны Image/Text, placeholder для неподдержанных типов, selection и pointer-transform Move/Rotate/Scale. Это не полная реконструкция runtime-поведения Prefab instances и компонентов. Game View загружает существующий generated `index.html` в отдельный iframe; изменения `.scene` автоматически не регенерируют `game.js`. Docking в COD-80 ограничен перемещением Hierarchy/Inspector в Bottom Dock с возвратом в домашние слоты и перестановкой вкладок внутри Bottom Dock; произвольные floating windows, свободные split-зоны и произвольная перекомпоновка всех панелей не заявляются. Animation поддерживает базовую работу с Phaser JSON: открыть/создать файл, добавить/изменить/удалить clip и frame references; полноценные timeline tracks, curves, keyframes, events и state graph остаются отдельным этапом. User Components и Prefab поддерживают существующие базовые модели/операции, но полноценные script lifecycle, code generation и nested Prefab overrides требуют следующих slices; полный feature parity со старым Colibri не является целью migration. Специализированные Sprite/Spine/Tilemap/Physics/FX/importer workflows, session-aware MCP SSE routing, production cutover, rollback window и Colibri removal не входят в COD-80.

Browser acceptance конфигурируется через `src/editor/playwright.config.mjs`. Backend получает временную копию canonical TypeScript fixture, поэтому тесты не меняют пользовательский проект. GitHub Actions job `editor-host` запускает typecheck и production build, 25 domain tests и Chromium acceptance (7 tests на CI Fast #425). `fast-checks` проверяет `npm audit --audit-level=low` и остальные общие проверки репозитория.

## 0. Правила переноса и реестр пользовательских workflows

Главный принцип: **переносим поведение и полезные contracts, а не наследуем архитектуру старого UI**. Целевые UX-reference — Unity 6.6 (основной, 6000.6 Beta на дату проверки) и Cocos Creator 4.0 LTS (дополнительный), только для 2D-игр. Colibri может подсказать, какие операции ожидает пользователь, какие edge cases встречались, какие форматы/поля/команды уже поддерживаются и где лежат regression fixtures; он не является третьим UX-reference. Каждый SolidJS workflow проектируется заново с собственными state owners, typed services, lifecycle, focus/accessibility и tests. Не переносить Colibri Workbench/Parts/controls/registry/globals/private imports или скрытые UI coupling. Для каждой возможности решить retain/redesign/defer/retire с причиной; применять [стандарт reference для 2D Editor Host](editor-reference-standard.md).

| Capability | Что уже подтверждено | SolidJS Host status / owner |
|---|---|---|
| Workbench + basic Scene | COD-80: Phaser Scene Canvas, Hierarchy/Inspector/Transform, save/reopen, Undo/Redo, базовый Game View iframe и docking slice | **Implemented (first slice)**; COD-80, CODQA-18 independent acceptance |
| Docking/workspace | Console dock/undock, Hierarchy/Inspector ↔ Bottom Dock/home slots, tab reorder/persistence | **Partial**; COD-83 |
| Prefab | Базовые модели/операции COD-80; full nested Prefab overrides не закрыты | **Partial**; COD-8; QA CODQA-11 |
| User Components/TypeScript authoring | Базовая Components surface COD-80; Core/schema contracts in COD-26/COD-27 | **Partial surface; full authoring missing**; COD-91, QA CODQA-21 |
| Asset Browser/Pack/Sprite | COD-39 реализует domain metadata/slicing/reimport contract; UI пока legacy | **Not migrated**; COD-86, QA CODQA-10 |
| Camera/coordinates/sorting | Контракт описан в ТЗ; Host authoring/gizmos не закрыты | **Not migrated**; COD-41 |
| 2D UI authoring | Game UI runtime requirements в ТЗ; legacy authoring controls не перенесены | **Not migrated**; COD-43, QA CODQA-12 |
| Animation | COD-80 basic clip/frame operations | **Partial**; COD-84, QA CODQA-4 |
| Tilemap | Existing data/Tiled/runtime contracts требуют targeted gap analysis | **Not migrated**; COD-40, QA CODQA-14 |
| Physics/Box2D | Existing physics/codegen/runtime contracts and CODQA-1 | **Not migrated as Host UI**; COD-42, CODQA-1 runtime acceptance |
| FX authoring | Legacy FX/codegen and CODQA-3 evidence; no new Host workflow | **Not migrated**; COD-89, QA CODQA-19 |
| Spine authoring/preview | Legacy Spine serialization/MCP tool; no new Host UI or session routing | **Not migrated**; COD-90, COD-85, QA CODQA-20 + CODQA-8 |
| Audio groups/Particle Preview | Existing runtime contracts; new Host UI absent | **Not migrated**; COD-61, QA CODQA-13 |
| Preview/diagnostics | COD-80 Game View loads existing generated index.html in iframe; no complete Preview Host/live identity/common EditorLogger | **Partial/missing**; COD-30/31/32/47/58 |
| MCP live bridge | HTTP registry + stdio package exist; current SSE bridge broadcasts to connected clients | **Blocked for new Host until session-aware routing**; COD-85, QA CODQA-8 |
| Production route / Colibri | Server still defaults to legacy /editor/ during transition | **Not cut over**; COD-87 then COD-88 |

Статусы migrated / in progress / not started / deferred / retired выставляются только по фактическому Host workflow и нужному evidence. Наличие старой панели, backend endpoint, завершённой legacy issue или успешной сборки не означает, что функция перенесена. COD-16 — migration inventory; COD-82 — coordination owner.

## 1. Цель

Довести самостоятельный browser Editor Host на SolidJS + TypeScript/TSX + Vite + Tailwind CSS 4 до полноценной production-ready 2D authoring среды, ориентированной на основные Unity Editor workflows. COD-80 уже создал первую работающую IDE-оболочку и Scene vertical slice; следующие capabilities реализуются отдельными slices, а не новым bootstrap или framework PoC.

Сохраняются Node.js server, project/file HTTP API, project/scene/prefab formats, serializers, importer metadata, code-generation semantics, Phaser runtime/Canvas, MCP tool registry и независимая domain logic. Перерабатываются Colibri Workbench, панели, controls, menus, dialogs, commands, shortcuts, focus, notifications, темы и plugin UI registration. Project data semantics не меняются без отдельной schema migration.

## 2. Целевая структура

```text
codogma-engine/
├── src/editor/       # new SolidJS Editor Host
├── source/editor/    # legacy Colibri client during transition
├── server/           # current Node backend and project APIs
├── packages/         # independently reusable packages
└── tests/
    ├── workspace/    # canonical project fixtures
    └── editor-ui/    # browser acceptance fixtures for new Host
```

`src/editor/` — новое приложение, не механический перенос `source/editor/`. Не создавать npm package на каждую панель: Scene, Inspector, Assets, Prefabs, Animation, Tilemap, Physics и другие области реализуются как feature modules одного Host.

**SolidJS + TypeScript/TSX:** использовать `vite-plugin-solid`; TS config содержит `jsx: "preserve"` и `jsxImportSource: "solid-js"`. Tailwind CSS 4 подключается через `@tailwindcss/vite` поверх Codogma semantic tokens/CSS variables. Применять fine-grained reactivity (`createSignal`, `createStore`, `createMemo`, `createEffect`, `onMount`, `onCleanup`) по назначению. JSX похож на React, но у SolidJS нет Virtual DOM и повторных React-style render циклов; React Hooks mental model не переносится. SolidJS владеет DOM/UI, Phaser — игровым Canvas/runtime.

## 3. Unity-like Workbench — первая реализационная цель

Начальный результат должен уже напоминать рабочий 2D editor:

| Область | Назначение |
|---|---|
| App menu / main toolbar | Project/file actions, edit commands, tools, play/pause/stop |
| Scene / Game viewport | Phaser Canvas, viewport controls, selection и transform tools |
| Hierarchy | Scene tree, search, selection, visibility/lock, context actions |
| Inspector | Properties, components, typed editors, validation/error states |
| Project / Assets | File/asset browser, search/filter, import state, context menu |
| Console | Logs, warnings, errors, filters и переход к источнику |
| Timeline / Animation | Dockable bottom workspace |
| Workspace shell | Docking, tabs, splitters, drag/drop, panel lifecycle, focus, shortcuts, command palette, themes и persisted layout |

Панели должны иметь реальные state owners и контракты взаимодействия. Статический макет не считается готовой реализацией. Конкретную docking library не выбирать до появления реального требования.

## 4. Переходный режим двух UI, одного backend

| Компонент | Адрес | Роль |
|---|---|---|
| Legacy Colibri UI | `http://127.0.0.1:3000/editor/` | Существующий клиент на Node server |
| Новый SolidJS UI | `http://127.0.0.1:5173/` | Отдельный Vite dev server |
| Backend API | `http://127.0.0.1:3000/editor/*` | Общие project/file/MCP HTTP endpoints через Vite proxy |

- Node сохраняет `PORT=3000`; Vite использует отдельный `VITE_PORT=5173`, bind на `127.0.0.1` и `strictPort: true`.
- SolidJS app отправляет относительные `/editor/*` запросы; Vite проксирует их в backend. Используется точный `CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173`, wildcard Origin/Host запрещён, существующие guards не обходятся.
- Реальную proxy-конфигурацию и forwarding Origin необходимо согласовать с `server/request-origin.mjs`.
- Оба UI можно держать открытыми одновременно, но из-за отсутствия cross-client lock/versioning contract только один редактор записывает в конкретный `PROJECT_DIR`. Для параллельной write-приёмки используются разные fixtures и backend instances.
- Текущий `server/mcp.mjs` рассылает SSE-команды всем `bridgeClients`. До session-aware routing общий `/editor/mcp-bridge/events` может принадлежать только одному UI; на переходе им остаётся legacy Colibri.
- Это только dev topology. После cutover один Node backend обслуживает SolidJS build по `/editor/`; legacy route временно сохраняется для rollback.

## 5. Порядок реализации

| Этап | Работа | Результат |
|---|---|---|
| 1. SolidJS foundation | `src/editor/` создан в COD-80: Vite + Solid plugin, TSX config, Tailwind 4, scripts, loopback/strict port и backend proxy | **Выполнено в COD-80 / PR #30; CI Fast #425 подтверждён** |
| 2. Unity-like Workbench | COD-80: Menu/toolbar, базовые панели, tabs/splitters, Hierarchy/Inspector, Project/Assets, Console, Scene/Game viewport, tokens/themes, shortcuts, command/focus model и persisted layout; универсальный docking продолжает COD-83 | **Первый рабочий slice реализован; общий docking/layout ещё частичный** |
| 3. Scene workflow | COD-80: project/scene open, Phaser Canvas, Hierarchy/selection, Inspector/Transform, save/reopen и Undo/Redo | **Первый vertical slice реализован; независимая acceptance CODQA-18 ожидает candidate** |
| 4. Feature migration | Prefabs, components, assets/importers, Sprite, Animation/Spine, Tilemap, Physics, FX/Particles, code editor integration | Перенос авторских workflows по vertical slices |
| 5. Services and MCP | Settings, localization, project operations, runtime preview, diagnostics, MCP HTTP/SSE routing | Обязательные операции не зависят от legacy UI |
| 6. Cutover | SolidJS build по `/editor/`, legacy route в rollback window | Новый UI становится основным |
| 7. Colibri removal | Удалить legacy UI, Colibri-only plugins/controls/styles/assets/build config/dependencies; обновить server/scripts/CI/archive/docs | Удаление legacy после cutover |

Инвентаризация Colibri coupling и workflows выполняется по мере переноса конкретных функций и не блокирует развитие уже работающего Host. Она должна выявлять полезные workflows и contract dependencies, а не создавать задачу переписать или механически перенести старую архитектуру. Не объединять всю миграцию в один giant PR.

## 6. Ownership и интеграция

- Project data и durable state принадлежат Project Model/backend API; SolidJS store не становится второй системой сохранения.
- Workbench state (active panel, open tabs, selection, expanded tree nodes, inspector draft, layout) отделён от serialized project data; у каждого state domain один owner.
- Сервисные операции идут через типизированные services/contracts, а не через разрозненные HTTP calls из компонентов.
- Commands/shortcuts используют единый routing layer с явным focus/context owner.
- Scene/Hierarchy/Inspector используют общую модель команд и Undo/Redo.
- Canvas/DOM overlays, coordinate transforms, resize observers и pointer capture имеют единый lifecycle contract; открытие панелей не создаёт второй Phaser game loop.

## 7. Критерии качества

Framework choice не требует отдельного PoC или framework comparison. При этом реализуемые workflows проходят обычные инженерные проверки:
- SolidJS build/TypeScript и тесты state/service contracts;
- browser acceptance docking, resize, tabs, focus, shortcuts, context menus и тем;
- regression fixtures для save/reopen, Undo/Redo, IDs, hierarchy, prefab overrides, asset metadata и codegen;
- performance profiling больших Hierarchy/Assets и частых Inspector updates на реальных сценариях;
- проверка Phaser Canvas lifecycle, single-writer policy, Origin/proxy и MCP SSE routing;
- cutover/rollback acceptance до удаления legacy UI.

Не нужно повторно доказывать выбор SolidJS искусственным benchmark или PoC-компонентом; проверки продукта и затрагиваемого кода сохраняются.

## 8. Политика legacy compatibility

- Не начинать новые пользовательские features, panels, controls и крупный UX-рефакторинг в source/editor.
- Допускаются критические bug/security fixes, release blockers и ограниченные compatibility fixes, без которых нельзя безопасно продолжить migration. В каждом случае указывать, почему исправление нельзя сделать в SolidJS Host или общем domain/backend слое.
- Legacy UI используется как reference сценариев/ожидаемого поведения и как временный rollback/compatibility client; не копировать его код как архитектуру нового Host.
- Один PROJECT_DIR имеет только одного writer. Пока MCP SSE не session-aware, новый Host не подключается к общему legacy bridge.
- Colibri удаляется только после COD-87 cutover, завершённого rollback window, inventory sign-off и consumer/license audit в COD-88.

## 9. Не входит в миграцию

- Переписывание Phaser runtime, Node server, formats, serializers, importer metadata, codegen или MCP registry без отдельной причины.
- Постоянный SolidJS↔Colibri adapter или встраивание SolidJS панелей в legacy Workbench как целевой путь.
- Одновременная запись двух редакторов в один project до concurrency contract.
- Удаление Colibri до cutover/rollback window.
- Обязательное внедрение Dockview, CodeMirror, Monaco, SolidStart, npm Workspaces или public Extension API без подтверждённого workflow.

## 10. Ссылки

- [ADR-0005](decisions/ADR-0005-solidjs-editor-host.md)
- [SolidJS documentation](https://docs.solidjs.com/)
- [SolidJS TypeScript configuration](https://docs.solidjs.com/configuration/typescript)
- [SolidJS Vite plugin](https://github.com/solidjs/vite-plugin-solid)
- [Tailwind CSS 4 + Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Vite server options](https://vite.dev/config/server-options)
