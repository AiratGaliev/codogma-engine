# План миграции Editor UI: Colibri → SolidJS

**Статус:** первый SolidJS Host и scene-authoring vertical slice реализованы в рабочей ветке; browser acceptance и CI ещё должны подтвердить результат.  
**Baseline:** `dev` на 30.10.2026; legacy client находится в `source/editor/`.  
**Решение:** [ADR-0005](decisions/ADR-0005-solidjs-editor-host.md).  
**Нормативные требования:** [Техническое задание](technical-specification.md).

## Текущий результат COD-80 — первый Host и Scene slice

В `src/editor/` появился самостоятельный SolidJS 1.9 Editor Host на Vite 8 и Tailwind CSS 4. Он запускается отдельно от legacy клиента, использует только loopback интерфейс и проксирует существующие `/editor/*` endpoints. Node backend и `source/editor/` не переписываются.

Реализованные операции первой вертикали:

- загрузка текущего `PROJECT_DIR` через `GetProjectFiles`, рекурсивное обнаружение и открытие `.scene`;
- Phaser-backed Scene Canvas с выбором объектов, Move/Rotate/Scale gestures и синхронизацией состояния с Inspector/Undo-Redo; Hierarchy для display-list/plain-object элементов;
- Inspector с Transform-полями, label, Text content и отображением уже сериализованных компонентов;
- добавление Image/Text/Container узлов, удаление, Undo/Redo с восстановлением selection;
- сохранение исходного JSON scene-format через `SetFileString`, повторное открытие после reload;
- Workbench с menu/toolbar, Scene/Game tabs, resizable splitters, show/hide Hierarchy/Inspector, Project/Animation/Console tabs в Compact Dock и отдельной Console-панелью на wide layout, command palette, keyboard shortcuts, dark/light themes и responsive persisted layout;
- Game View загружает существующий проектный `index.html` в iframe; закрытие Game View уничтожает iframe/runtime, повторный запуск создаёт новый экземпляр.

Новые модели не заменяют Project Model или backend serializers: scene helper сохраняет неизвестные поля и обновляет только явно разрешённые свойства. Legacy client остаётся доступен на порту 3000; Host предназначен для порта 5173. Для Vite proxy backend запускается с точным `CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173`.

**Границы первого slice, которые не следует считать готовыми возможностями:** Scene viewport создаёт отдельный Phaser.Game/Canvas из локального runtime проекта для authoring preview; поддержаны Image/Text, placeholder для неподдержанных типов, selection и pointer-transform Move/Rotate/Scale. Это не полная реконструкция runtime-поведения Prefab instances и компонентов. Game View загружает существующий generated `index.html` в отдельный iframe; изменения `.scene` автоматически не регенерируют `game.js`. Workbench сохраняет responsive layout: wide-компоновка имеет отдельные Project/Animation и Console области, Compact Workbench — единый Dock с вкладками Project/Animation/Console. Drag-and-drop docking, перестановка и свободное undocking панелей пока не реализованы; Animation остаётся timeline shell без clip/track serialization; component authoring и MCP SSE routing остаются будущими slices.

Browser acceptance конфигурируется через `src/editor/playwright.config.mjs`. Backend получает временную копию canonical TypeScript fixture, поэтому тесты не меняют пользовательский проект. GitHub Actions job `editor-host` запускает typecheck/build, domain tests и Chromium acceptance для Host/backend-sensitive changes.

## 1. Цель

Создать полноценный самостоятельный browser Editor Host на SolidJS + TypeScript/TSX + Vite + Tailwind CSS 4, ориентированный на Unity Editor для 2D-authoring workflows. Новый UI сразу строится как рабочая IDE-оболочка, а не как framework PoC, showcase-панель или прототип внутри Colibri.

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
| 1. SolidJS foundation | Создать `src/editor/`, Vite + Solid plugin, TSX config, Tailwind 4, scripts, loopback/strict port, backend proxy | Новый Host запускается отдельно от Colibri |
| 2. Unity-like Workbench | Menu/toolbar, docking, tabs/splitters, Hierarchy, Inspector, Project/Assets, Console, Scene/Game viewport, theme tokens, shortcuts, command/focus model, workspace persistence | Полноценная интерактивная оболочка, а не демонстрационный экран |
| 3. Scene workflow | Project/scene open, Phaser Canvas, Hierarchy/selection, Inspector/Transform, save/reopen, Undo/Redo | Сквозной workflow на реальном fixture |
| 4. Feature migration | Prefabs, components, assets/importers, Sprite, Animation/Spine, Tilemap, Physics, FX/Particles, code editor integration | Перенос авторских workflows по vertical slices |
| 5. Services and MCP | Settings, localization, project operations, runtime preview, diagnostics, MCP HTTP/SSE routing | Обязательные операции не зависят от legacy UI |
| 6. Cutover | SolidJS build по `/editor/`, legacy route в rollback window | Новый UI становится основным |
| 7. Colibri removal | Удалить legacy UI, Colibri-only plugins/controls/styles/assets/build config/dependencies; обновить server/scripts/CI/archive/docs | Удаление legacy после cutover |

Инвентаризация Colibri coupling и workflows выполняется по мере переноса конкретных функций и не блокирует старт приложения/Workbench. Не объединять всю миграцию в один giant PR.

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

## 8. Не входит в миграцию

- Переписывание Phaser runtime, Node server, formats, serializers, importer metadata, codegen или MCP registry без отдельной причины.
- Постоянный SolidJS↔Colibri adapter или встраивание SolidJS панелей в legacy Workbench как целевой путь.
- Одновременная запись двух редакторов в один project до concurrency contract.
- Удаление Colibri до cutover/rollback window.
- Обязательное внедрение Dockview, CodeMirror, Monaco, SolidStart, npm Workspaces или public Extension API без подтверждённого workflow.

## 9. Ссылки

- [ADR-0005](decisions/ADR-0005-solidjs-editor-host.md)
- [SolidJS documentation](https://docs.solidjs.com/)
- [SolidJS TypeScript configuration](https://docs.solidjs.com/configuration/typescript)
- [SolidJS Vite plugin](https://github.com/solidjs/vite-plugin-solid)
- [Tailwind CSS 4 + Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Vite server options](https://vite.dev/config/server-options)
