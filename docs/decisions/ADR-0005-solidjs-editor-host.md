# ADR-0005: SolidJS Editor Host и замена Colibri UI

**Статус:** принято как целевое UI-направление; первый SolidJS Host/Scene vertical slice реализуется в COD-80 (PR #30); полная миграция и production cutover не завершены.  
**Дата:** 30.10.2026  
**Связанные документы:** [Техническое задание](../technical-specification.md), [Дорожная карта](../roadmap.md), [План миграции Editor UI](../editor-ui-migration.md), [ADR-0004: архивный Svelte PoC](ADR-0004-svelte-poc.md).

## Контекст и решение

Текущий браузерный редактор находится в `source/editor/` и использует Colibri как UI platform. Ограниченный Svelte PoC из PR #13 был встроен в legacy Workbench и остаётся историческим экспериментом; он не является основой нового UI-решения.

Для нового Editor Host выбран **SolidJS + TypeScript/TSX + Vite + Tailwind CSS 4**. Новый интерфейс пишется непосредственно на SolidJS в самостоятельном приложении `src/editor/`. Отдельный SolidJS PoC, framework bake-off и ожидание дополнительных сравнительных измерений перед началом реализации не требуются.

Цель — профессиональный Web-first 2D Editor с рабочей средой, сопоставимой по основным сценариям с Unity Editor: панели, docking, Scene/Game view, Hierarchy, Inspector, Project/Assets, Animation/Timeline, Console, инструменты трансформации, команды, shortcuts, темы и сохранение layout.

## Почему SolidJS

- JSX/TSX даёт знакомую React-разработчикам декларативную структуру компонентов.
- SolidJS использует fine-grained reactivity и не имеет Virtual DOM: JSX компилируется в DOM-операции, а reactive primitives обновляют только зависимые DOM-узлы, без VDOM reconciliation всего дерева.
- TypeScript/TSX и явные reactive primitives подходят для типизированных feature modules, панелей и editor services.
- SolidJS управляет DOM Workbench; Phaser продолжает отображать игровую сцену через Canvas/runtime.

Это принятое архитектурное решение, а не заявление о конкретном benchmark-превосходстве во всех сценариях. Производительность измеряется адресно на реальных тяжёлых панелях и fixtures по мере реализации, а не через повторный framework benchmark перед стартом.

## React-подобный JSX не означает React runtime model

- Компоненты SolidJS выполняются при создании owner scope; изменение signal не вызывает повторный рендер всей функции компонента.
- Зависимости читаемых сигналов отслеживаются fine-grained реактивностью.
- Использовать `createSignal`, `createStore`, `createMemo`, `createEffect`, `onMount` и `onCleanup` по назначению.
- Не переносить React Hooks механически, не терять tracking при работе с reactive props и не создавать эффекты вместо derived state.
- Для TypeScript/JSX использовать `jsx: "preserve"` и `jsxImportSource: "solid-js"`.
- В Vite используется `vite-plugin-solid`; для Tailwind CSS 4 — `@tailwindcss/vite`. Новый Host — client-side SPA; SolidStart не вводится без отдельного требования к SSR.

## Архитектурные правила

1. **Один новый UI Host:** `src/editor/` содержит приложение и feature modules. Не создавать отдельный npm package для каждой панели.
2. **Unity-like Workbench — первая цель:** app menu/toolbar, dockable panels, Hierarchy, Scene/Game viewport, Inspector, Project/Assets, Console и нижняя зона Timeline/Animation. Сразу закладываются tabs, splitters, panel lifecycle, command/shortcut routing, focus model, theme tokens и сохранение workspace layout. Первый результат — реальный интерфейс с рабочими state/layout contracts, не статический макет.
3. **Project Model отделён от UI state:** сериализация, validation и file operations остаются во владении существующих backend/project contracts. В SolidJS живут transient UI state: открытые панели, вкладки, selection, expanded tree nodes, inspector drafts и layout. Не создавать второй serializer или независимую копию Project Model.
4. **Phaser остаётся Canvas/runtime renderer:** SolidJS владеет DOM-оболочкой и панелями. Scene viewport интегрирует существующий Phaser runtime через явный lifecycle/resize contract; gizmos/overlays используют согласованные coordinate transforms.
5. **Нет долгосрочного Colibri bridge:** новый Host не импортирует Colibri, его registry, Parts, Workbench, globals или controls. Старый и новый UI работают как самостоятельные browser applications.
6. **Сохранить backend и data contracts:** Node.js server, HTTP/file APIs, project/scene/prefab formats, serializers, importer metadata, codegen semantics, MCP schemas и Phaser runtime не переписываются только из-за смены UI.
7. **Библиотеки выбирать по реальной потребности:** docking, CodeMirror/Monaco, router и virtualization utilities не становятся обязательными без workflow, который их требует.

## Два UI в переходный период

| UI | Адрес по умолчанию | Роль |
|---|---|---|
| Legacy Colibri | `http://127.0.0.1:3000/editor/` | Текущий UI, обслуживаемый Node server |
| New SolidJS Host | `http://127.0.0.1:5173/` | Независимый Vite dev server |

- Node backend остаётся на `PORT=3000`; SolidJS dev server использует отдельную переменную, например `VITE_PORT=5173`, с `strictPort: true`.
- Vite проксирует относительные `/editor/*` запросы к backend. Browser code не обращается к backend direct cross-origin.
- Для нового UI задаётся точный `CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173`. Wildcard Origin запрещён; Host/Origin и loopback guards сохраняются. Proxy и Origin forwarding проверяются вместе с `server/request-origin.mjs`.
- Оба UI могут быть открыты одновременно, но пока нет cross-client locking/versioning contract только один клиент записывает в конкретный `PROJECT_DIR`. Для параллельной write-приёмки используются разные fixture copies и backend instances.
- Текущий `server/mcp.mjs` рассылает editor SSE-команды всем подключённым clients. Пока нет session-aware routing, общий `/editor/mcp-bridge/events` принадлежит только одному UI; сначала это legacy Colibri. Новый Host подключается к общему SSE bridge только после адресной маршрутизации или через изолированный backend.
- Это временная dev topology. После cutover существующий Node server отдаёт SolidJS build по `/editor/`; legacy route остаётся на ограниченное rollback window, затем удаляется.

## Порядок реализации

| Этап | Основная работа | Результат |
|---|---|---|
| 1. SolidJS foundation | `src/editor/`, Vite + Solid plugin, TSX config, Tailwind 4, scripts, loopback/strict port и backend proxy | Отдельно запускаемое приложение; legacy Colibri не сломан |
| 2. Unity-like Workbench | Menu/toolbar, docking/layout, tabs/splitters, Hierarchy, Inspector, Project/Assets, Console, Scene/Game viewport, theme tokens, command/shortcut/focus model, workspace persistence | Полноценная интерактивная оболочка редактора |
| 3. Scene workflow | Open project/scene, Phaser Canvas, Hierarchy/selection, Inspector/Transform, save/reopen и Undo/Redo | Сквозной workflow на реальном fixture без изменения data semantics |
| 4. Feature migration | Prefabs/components, assets/importers, Sprite, Animation/Spine, Tilemap, Physics, FX/Particles и code editor integration | Авторские workflows перенесены по вертикальным срезам |
| 5. Services and MCP | Settings, localization, project actions, runtime preview, diagnostics, MCP HTTP/SSE | Новый Host не зависит от legacy UI для обязательных операций |
| 6. Cutover | SolidJS build обслуживается по `/editor/`; legacy route остаётся для rollback | SolidJS становится основным editor UI |
| 7. Colibri removal | Удаление legacy UI, Colibri-only plugins/controls/styles/assets/build config/dependencies и обновление server/scripts/CI/archive/docs | В production/editor bundle нет runtime зависимости от Colibri |

Полная inventory Colibri capabilities ведётся по мере переноса конкретных функций и не блокирует bootstrap SolidJS или создание Workbench. Не выполнять миграцию одним giant PR.

## Критерии качества

- Build/TypeScript для SolidJS app и тесты state/service contracts.
- Browser acceptance для docking, resizing, tabs, focus, shortcuts, context menus, themes и workspace persistence.
- Regression tests для save/reopen, Undo/Redo, IDs, hierarchy, prefab overrides, asset metadata и codegen.
- Проверка Phaser Canvas lifecycle: один runtime/game loop при переключении панелей и изменении размеров viewport.
- Performance profiling больших Hierarchy/Assets lists и частых Inspector updates на реальных сценариях.
- Проверка Origin allow-list, loopback, proxy, single-writer policy и MCP SSE ownership.
- Cutover/rollback acceptance до удаления Colibri.

Отдельный framework PoC и повторный framework benchmark не нужны. Обычные инженерные проверки реализуемых функций сохраняются.

## Источники

- [SolidJS documentation](https://docs.solidjs.com/)
- [SolidJS TypeScript configuration](https://docs.solidjs.com/configuration/typescript)
- [SolidJS Vite plugin](https://github.com/solidjs/vite-plugin-solid)
- [Tailwind CSS 4 + Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Vite server options](https://vite.dev/config/server-options)
- [Unity 6 Editor manual](https://docs.unity.com/en-us/engine/6000.6/manual)
