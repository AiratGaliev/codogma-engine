# План миграции Editor UI: Colibri → SolidJS

**Статус на 05.11.2026:** COD-80 — самостоятельный SolidJS Host, Workbench shell и первый Scene vertical slice реализованы; COD-83 расширяет docking/workspace layout в отдельный versioned Engineering slice. Дополнительно PR #30 перевёл весь собственный Host source на TypeScript/TSX, доменные модели — с `.mjs` + `.d.mts` на `.ts`, unit/integration tests — на Vitest + TypeScript, Playwright specs/config/fixture launcher — на TypeScript. CI Fast #478 на HEAD `5345dc2c10c6cf7665dc527b8ee6b37afd0d9478` подтвердил установку Editor Host через `npm ci --no-audit --no-fund` по закоммиченному `src/editor/package-lock.json`, полный TypeScript strict typecheck, Vite production build, 36 Vitest tests, 9 Chromium Playwright acceptance tests и `fast-checks` (оба job — success). PR #30 смержен в `dev` 01.11.2026 (merge commit `7aa0f2c8cd85df795e35b3678de95794de693a5d`); production `/editor` cutover не выполнен и остаётся отдельной задачей COD-87. Полная migration, specialized workflows, session-aware MCP routing, cutover/rollback и Colibri removal остаются открытыми; общий owner — COD-82.  
**Baseline:** `dev` на 30.10.2026; legacy client находится в `source/editor/`.  
**Решение:** [ADR-0005](decisions/ADR-0005-solidjs-editor-host.md).  
**Нормативные требования:** [Техническое задание](technical-specification.md).  
**Продуктовые UX-reference и инженерные источники:** [Стандарт reference для 2D Editor Host](editor-reference-standard.md) и [Editor Engineering References](editor-engineering-references.md). Unity 6.6 остаётся главным UX-reference, Cocos Creator 4.0 LTS — дополнительным 2D workflow reference; Godot и другие открытые редакторы используются отдельно как task-specific implementation references, а не как дополнительные продуктовые UX-эталоны.

## Текущий результат COD-80 — первый Host и Scene slice

В `src/editor/` появился самостоятельный SolidJS 1.9 Editor Host на Vite 8 и Tailwind CSS 4. Внутри Host применяется общий нормативный стандарт [ADR-0002](decisions/ADR-0002-typescript-toolchain.md): UI — TSX, services/domain/models — TypeScript, unit/integration tests — Vitest на TypeScript, browser acceptance и её конфигурация — Playwright на TypeScript. JavaScript domain implementations и `.d.mts` sidecar declarations исключены. Полный обязательный набор compiler flags указан в ADR-0002/ADR-0005; existing Node backend, legacy Colibri и repository-level scripts не мигрируются автоматически. Он запускается отдельно от legacy клиента, использует только loopback интерфейс и проксирует существующие `/editor/*` endpoints. Node backend и `source/editor/` не переписываются.

Реализованные операции первой вертикали:

- начальный Scene authoring workflow текущего Host: project resource discovery, Phaser Scene Canvas, object selection, Transform gestures, Hierarchy и Inspector integration;
- Phaser-backed Scene Canvas с выбором объектов, Move/Rotate/Scale gestures и синхронизацией состояния с Inspector/Undo-Redo; Hierarchy для display-list/plain-object элементов;
- Inspector с Transform-полями, label, Text content и отображением уже сериализованных компонентов;
- добавление Image/Text/Container узлов, удаление, Undo/Redo с восстановлением selection;
- сохранение и повторное открытие изменений Scene через project/file API;
- Workbench по основным Dark/Light artboards `.pen`: menu/toolbar, Scene/Game tabs, resizable splitters, Hierarchy/Inspector, Project/Animation/Components/Console, design tokens и Godot SVG icons; responsive layout хранится между запусками;
- docking lifecycle первого среза COD-80: Console перемещается в Bottom Dock и обратно; Hierarchy и Inspector перетаскиваются в Bottom Dock, возвращаются в исходные слоты через `Undock`; вкладки Bottom Dock переставляются pointer-drag жестом, порядок и выбранная вкладка сохраняются;
- focus/command model: W/E/R/Q и F2/Delete применяются только в контексте Scene/Hierarchy; shortcuts не перехватывают ввод в Inspector; Command Palette удерживает Tab внутри диалога и возвращает фокус исходному элементу при закрытии;
- COD-83 расширяет Workbench тремя закреплёнными dock-зонами `Left / Right / Bottom`: Hierarchy и Inspector можно перемещать между зонами и группировать во вкладки; у каждой боковой зоны есть активная панель, поддерживаются close/reopen, возврат в home-zone, drag/drop, keyboard tab navigation и pointer/keyboard splitter resize. Hierarchy, Inspector и Console закрываются независимо от dock placement и повторно открываются с сохранением предпочтительной зоны/режима Console. Пункты View имеют стабильные названия и checkmark, синхронизированный с состоянием видимости; Window отдельно отмечает активную Bottom-вкладку. Project/Animation/Components остаются постоянными Bottom tabs. При ширине до 780px боковые панели временно представлены в Bottom без изменения их сохранённых зон; при возврате к wide layout они восстанавливаются. Layout хранится как `schemaVersion: 2`; v0 и v1 раскладки мигрируют без потери существующих полей, а отсутствующее в старых версиях `consoleVisible` по умолчанию становится `true`. Неизвестные panel IDs фильтруются, повреждённое состояние получает детерминированные defaults. Floating windows, произвольное docking tree и перемещение Scene/Game viewport не входят в scope.
- Game View загружает существующий проектный `index.html` в iframe; закрытие Game View уничтожает iframe/runtime, повторный запуск создаёт новый экземпляр.

Первый Scene helper обеспечивает базовые authoring interactions, но не является завершённым Project Model-aware editor/loader. Native Scene persistence и runtime hydration используют общие Project Model v1 contracts и Scene Loader. UI client остаётся доступен на порту 3000; Host предназначен для порта 5173. Для Vite proxy backend запускается с точным CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173.

**Границы COD-80:** первый Scene viewport — Phaser-backed authoring slice для Image/Text/Container, selection и pointer-transform Move/Rotate/Scale. Полный runtime lifecycle Prefab instances и Components остаётся отдельной capability. Game View загружает существующий game index.html в отдельный iframe; Scene Preview и independent Build проходят через свои implementation/acceptance stages. Docking ограничен Bottom Dock/home slots/tab reorder; произвольные floating windows, nested split tree и перемещение Scene/Game viewport не заявляются. Animation поддерживает базовые clip/frame операции; полноценные timeline tracks, curves, keyframes, events и state graph остаются отдельным этапом.

Browser acceptance конфигурируется через `src/editor/playwright.config.ts`. Backend получает временную копию canonical TypeScript fixture, поэтому тесты не меняют пользовательский проект. CI устанавливает отдельный Host package командой `npm ci --no-audit --no-fund` по закоммиченному `src/editor/package-lock.json`; `setup-node` cache также зависит от lockfile, а workflow artifact для сгенерированного lockfile удалён. Успешное выполнение подтверждено [CI Fast #478](https://github.com/AiratGaliev/codogma-engine/actions/runs/41338597813).

## 0. Правила переноса и реестр пользовательских workflows

Главный принцип: реализовать необходимые пользовательские 2D authoring workflows в самостоятельном SolidJS Host с собственными state owners, typed services, lifecycle, focus/accessibility и tests. Целевые product UX-reference — Unity 6.6 и Cocos Creator 4.0 LTS; Godot source используется как task-specific implementation reference.

| Capability | Что уже подтверждено | SolidJS Host status / owner |
|---|---|---|
| Workbench + basic Scene | COD-80: Phaser Scene Canvas, Hierarchy/Inspector/Transform, save/reopen, Undo/Redo, базовый Game View iframe и docking slice | **Implemented (first slice)**; COD-80, CODQA-18 independent acceptance |
| Docking/workspace | Left/Right/Bottom dock zones, Hierarchy/Inspector groups, close/reopen, tab reorder, splitters, keyboard/focus, narrow layout, current schema v3 persistence and validation | **Implemented (Engineering; independent QA pending)**; COD-83 |
| Prefab | Базовые модели/операции COD-80; full nested Prefab overrides не закрыты | **Partial**; COD-8; QA CODQA-11 |
| User Components/TypeScript authoring | Базовая Components surface COD-80; Core/schema contracts in COD-26/COD-27 | **Partial surface; full authoring missing**; COD-91, QA CODQA-21 |
| Asset Library/Sprite | Native Asset/Frame metadata, importer, slicing и reimport contracts | **In progress**; COD-86, QA CODQA-10 |
| Package Manager | Existing ADR-0003 defines package architecture and Node-side service; no Package Manager workflow in new Host yet | **Not designed/implemented**; COD-92 UX/UI design → COD-94 Host implementation; COD-51/52/53/60/93 provide contracts and services |
| Camera/coordinates/sorting | Контракт описан в ТЗ; Host authoring/gizmos не закрыты | **Not migrated**; COD-41 |
| 2D UI authoring | Game UI runtime requirements в ТЗ; authoring workflow ещё не реализован | **Not implemented**; COD-43, QA CODQA-12 |
| Animation | COD-80 basic clip/frame operations | **Partial**; COD-84, QA CODQA-4 |
| Tilemap | Existing data/Tiled/runtime contracts требуют targeted gap analysis | **Not migrated**; COD-40, QA CODQA-14 |
| Physics/Box2D | Native Physics/Component contracts and Phaser runtime integration | **Not implemented as complete Host workflow**; COD-42, CODQA-1 |
| FX authoring | COD-89 implements Circle/Bloom/Gradient/Shine authoring and Phaser-backed preview in SolidJS Host. Native Scene persistence and Preview runtime parity require integrated implementation and browser acceptance | **Implemented as Host UI; integrated runtime acceptance pending**; CODQA-19 |
| Spine authoring/preview | Native Host authoring/preview workflow and session-owned MCP integration are not implemented | **Not implemented**; COD-90, COD-85, QA CODQA-20 + CODQA-8 |
| Audio groups/Particle Preview | Existing runtime contracts; new Host UI absent | **Not migrated**; COD-61, QA CODQA-13 |
| Preview/diagnostics | COD-80 Game View loads existing generated index.html in iframe; no complete Preview Host/live identity/common EditorLogger | **Partial/missing**; COD-30/31/32/47/58 |
| Build Profiles / Build Settings | COD-35 defines reproducible Development/Release profiles and target/browser matrix; no dedicated profile authoring workflow is tracked for the new Host | **Not designed/implemented**; COD-95, depends on COD-34 feature selection and COD-35 build contracts; COD-16 tracks capability/evidence matrix |
| Project Settings / Editor Preferences | COD-80 mentions generic settings in the future scope; no separate Host workflow or persistence ownership is defined in the migration inventory | **Not designed/implemented**; COD-96 design → COD-97 implementation; Project Model/schema: COD-25; domain pages: COD-29/42/61/86; workspace layout ownership remains COD-83 |
| Input Actions Editor | Technical specification §6.5 requires logical actions, configurable physical bindings, remapping and conflict checks; COD-29 currently covers only the minimal runtime Input contract | **Not designed/implemented**; COD-98 UX/UI design → COD-99 authoring implementation; contracts: COD-25/COD-29; editor keymap remains COD-97 |
| MCP live bridge | HTTP registry + stdio package exist; current SSE bridge broadcasts to connected clients | **Blocked for new Host until session-aware routing**; COD-85, QA CODQA-8 |
| Production route / Colibri | Server still defaults to legacy /editor/ during transition | **Not cut over**; COD-87 then COD-88 |

Статусы implemented / in progress / not started / deferred выставляются

## COD-83. Версионированный workspace layout

**Единый owner:** SolidJS `layout` signal внутри `App.tsx`. Чистая доменная модель и все переходы состояния находятся в `src/editor/src/domain/workspace-layout.ts`; UI не хранит вторую копию docking state. Состояние сохраняется отдельно от Project Model под ключом `localStorage["codogma.editor.layout"]`.

Schema v3:

| Поле | Тип | Назначение |
|---|---|---|
| `schemaVersion` | literal `3` | Версия persisted contract |
| `leftWidth`, `rightWidth`, `bottomHeight`, `consoleHeight` | number | Предпочтительные размеры dock-зон/Console |
| `leftWidthCustomized`, `rightWidthCustomized`, `bottomHeightCustomized`, `consoleHeightCustomized` | boolean | Явно изменял ли пользователь соответствующий размер; защищает даже точное совпадение с default от автоматической compact/wide адаптации |
| `hierarchyVisible`, `inspectorVisible`, `consoleVisible`, `projectVisible`, `animationVisible`, `componentsVisible` | boolean | Видимость каждой панели независимо от её dock-зоны и активной вкладки |
| `hierarchyZone`, `inspectorZone` | `left, right, bottom` | Постоянное положение каждой панели |
| `leftActivePanel`, `rightActivePanel` | `Hierarchy, Inspector, null` | Активная вкладка боковой группы |
| `bottomTab` | tab ID | Активная вкладка Bottom |
| `bottomTabOrder` | array of tab IDs | Общий стабильный порядок; каждая зона показывает его отфильтрованную последовательность |
| `consoleDocked` | boolean | Размещена ли Console вкладкой Bottom; в schema v3 это default |

Persisted bounds: Left `170–360 px`, Right `210–420 px`, Bottom `150–420 px`, preferred Console height `56–180 px`. The visible Bottom Dock height is additionally clamped to the current viewport height while preserving its saved preference; the central workspace keeps a responsive minimum height. The visible detached Console height is `min(consoleHeight, max(56, min(180, displayedBottomHeight − 89)))`; the persisted Console preference is not reduced when Bottom Dock is temporarily shortened. The 89 px reserve covers 28 px tabs, 56 px panel content, a 4 px splitter and a 1 px dock border. Wide defaults: `228 / 280 / 286 / 96 px`; compact defaults: `194 / 250 / 207 / 60 px`. Each preferred size has a persisted `*Customized` flag set by pointer/keyboard resizing. This prevents a deliberate user choice that happens to equal a wide default (for example, exactly `228 px`) from being mistaken for an untouched default. An untouched Console default of `96 px` adapts to `60 px` on compact restore; explicitly customized preferences are preserved. Compact/narrow presentation is passed to `restoreWorkspaceLayoutContent` and `serializeWorkspaceLayout` from the current viewport, without replacing permanent `hierarchyZone`/`inspectorZone`. From 781–920 px, displayed Left/Right widths are capped at 194/250 px. Between 921 and 1108 px these limits grow linearly to the full 360/420 px range so the central viewport remains at least 320 px; saved user dimensions are not overwritten by responsive clamping. At unusually short window heights, the Bottom Dock minimum is reduced only as far as necessary to preserve a 72 px Scene viewport and the fixed header/splitter/status rows; the splitter's accessible minimum matches the displayed geometry. At widths up to 920 px and 780 px the Bottom Dock uses the same saved height value, limited only by the current available viewport space. At widths up to 780 px, side panels are temporarily represented as Bottom tabs; drag/reorder within this transient group does not change the permanent panel zones, which are restored when the viewport widens. Empty side zones become available as drop targets while a side panel is being dragged, so a panel can always be moved back from a Bottom-only layout. The Undock command in a narrow viewport changes the permanent home zone but keeps the panel physically in Bottom until the viewport widens; it must not disappear into a hidden side dock. When leaving compact mode, an active Console tab returns to Project only if Console was temporarily shown by compact presentation; a Console explicitly docked in Bottom remains selected.

**Pointer ownership и touch lifecycle:** splitter resize и tab drag принадлежат конкретному `pointerId`. События другого pointer игнорируются; второй одновременный жест не перезаписывает активное состояние. Состояние очищается владельцем на `pointerup`/`pointercancel` и при `lostpointercapture`. Для Left/Right/Bottom/Console splitters задан `touch-action: none`, чтобы браузерный pan не перехватывал touch resize. Потеря capture не оставляет активную drop-zone или resize state.

**Validation and recovery:** workspace layout is persisted only in the current schema v3. The complete document is validated before restore; malformed data or an unsupported schema version produces a diagnostic and restores deterministic defaults. No project files or Project Model data are changed.

**Lifecycle:** dock/undock меняет parent DOM node уже существующей панели; компонент не создаётся повторно. Scene/Game viewport остаётся в центре, его Phaser Canvas не переносится. При unmount Host снимает `keydown`/`resize` listeners и освобождает MCP bridge/preview lifecycle. Текущий Host не содержит in-app project-switch workflow, поэтому очистка именно при переключении между двумя project sessions пока не проверяется и остаётся отдельным lifecycle gap; это не следует трактовать как принятую project-switch acceptance.

**Границы:** три закреплённые зоны Left/Right/Bottom, фиксированные типы панелей и tab groups. Floating windows, произвольное split tree, перенос Scene/Game viewport и новая docking dependency не входят в COD-83.

**Уточнение UX-контракта COD-83:** перемещение панелей работает через единый Pointer Events interaction model для заголовков и вкладок. Во время переноса показывается полупрозрачное превью целевой группы и карточка перетаскиваемой панели; при наведении на вкладку отображается индикатор точной вставки до/после неё. Позиция определяется координатой указателя. Escape, pointercancel и потеря capture отменяют действие без изменения layout. Splitter-ы получают увеличенную невидимую hit area; двойной щелчок возвращает адаптивный размер только выбранной зоны. Перемещение меняет dock location уже смонтированной панели и не пересоздаёт Inspector/Hierarchy или Phaser Canvas.

**Reference decision:** адаптированы визуальное превью и индикатор вставки Cocos Creator 4.0 LTS, а также перенос View между группами, сохранение расположения и reset location из VS Code. Поведение ограничено Left/Right/Bottom и существующими типами панелей. Floating windows, произвольное nested split tree, drag Scene/Game viewport и новая docking dependency не входят в COD-83. Внутренние реализации Workbench/Colibri не переносятся.

## 1. Цель

Довести самостоятельный browser Editor Host на SolidJS + TypeScript/TSX + Vite + Tailwind CSS 4 до полноценной production-ready 2D authoring среды, ориентированной на основные Unity Editor workflows. COD-80 уже создал первую работающую IDE-оболочку и Scene vertical slice; следующие capabilities реализуются отдельными slices, а не новым bootstrap или framework PoC.

Сохраняются Node.js server, project/file HTTP API, MCP tool registry и подтверждённые независимые runtime algorithms после технической проверки. Новый Host строится на SolidJS и собственных typed services/state owners. Workbench, panels, menus, dialogs, commands, shortcuts, focus, notifications и plugin UI registration реализуются самостоятельными SolidJS components.

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
- Текущий `server/mcp.mjs` рассылает SSE-команды всем `bridgeClients`. До session-aware routing общий `/editor/mcp-bridge/events` может принадлежать только одной Editor session; параллельные Host sessions используют изолированные backend/transport instances.
- Это только dev topology. После cutover один Node backend обслуживает SolidJS build по `/editor/`; legacy route временно сохраняется для rollback.

## 5. Порядок реализации

| Этап | Работа | Результат |
|---|---|---|
| 1. SolidJS foundation | `src/editor/` создан в COD-80: Vite + Solid plugin, TSX config, Tailwind 4, scripts, loopback/strict port и backend proxy | **Выполнено в COD-80 / PR #30; CI Fast #453 подтверждён** |
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
- native regression fixtures для Project/Scene/Node/Prefab/Component/Asset contracts
- performance profiling больших Hierarchy/Assets и частых Inspector updates на реальных сценариях;
- проверка Phaser Canvas lifecycle, single-writer policy, Origin/proxy и MCP SSE routing;
- cutover/rollback acceptance до удаления legacy UI.

Не нужно повторно доказывать выбор SolidJS искусственным benchmark или PoC-компонентом; проверки продукта и затрагиваемого кода сохраняются.

## 8. Политика временного Colibri UI

- Не начинать новые пользовательские features, panels, controls и крупный UX-рефакторинг в `source/editor/`.
- До production cutover допускаются только критические security fixes и release blockers, без которых нельзя безопасно эксплуатировать временный UI или завершить cutover.
- Текущий UI client используется только как временный rollback client. Все новые панели, commands, interactions и workflows разрабатываются в SolidJS Host.
- Один `PROJECT_DIR` имеет только одного writer. Пока MCP SSE не поддерживает session-aware routing, параллельные Host sessions используют изолированные backend/transport instances.
- Удаление временного UI client и его UI-only assets/dependencies выполняется в COD-88 после закрытия rollback window. Временные server routes, asset-serving endpoints и transport adapters, существующие только ради этого UI, входят в единственную cleanup issue COD-113.

## 9. Не входит в миграцию

- Переписывание Phaser runtime, Node server, MCP registry или независимых media importers без отдельной технической причины.
- Встраивание SolidJS panels в отдельный Workbench или постоянный cross-application UI bridge.
- Одновременная запись двух редакторов в один project до concurrency contract.
- Удаление временного UI client до cutover/rollback window;
- Обязательное внедрение Dockview, CodeMirror, Monaco, SolidStart, npm Workspaces или public Extension API без подтверждённого workflow.

## 10. Ссылки

- [ADR-0005](decisions/ADR-0005-solidjs-editor-host.md)
- [SolidJS documentation](https://docs.solidjs.com/)
- [SolidJS TypeScript configuration](https://docs.solidjs.com/configuration/typescript)
- [SolidJS Vite plugin](https://github.com/solidjs/vite-plugin-solid)
- [Tailwind CSS 4 + Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Vite server options](https://vite.dev/config/server-options)


### Жизненный цикл Bottom Dock (schema v3)

Project, Animation и Components имеют собственные persisted visibility flags. Закрытие вкладки не удаляет данные или состояние документа; восстановление выполняется через View menu или Window command. При закрытии активной вкладки выбирается следующая видимая. При закрытии последней Bottom Dock и его splitter сворачиваются до нулевой высоты, освобождая Scene viewport. Console по умолчанию находится вкладкой внутри Bottom group; отдельный нижний Console row сохраняется только как явно выбранное действие Undock. В текущей schema v3 `consoleDocked` по умолчанию равно `true`: Console остаётся вкладкой Bottom и не создаёт дополнительный нижний ряд.

Main menu и Add Object menu закрываются при pointer interaction за пределами соответствующего menu root; Escape остаётся дополнительным способом закрытия. Взаимодействие внутри открытого меню не приводит к преждевременному dismiss.
