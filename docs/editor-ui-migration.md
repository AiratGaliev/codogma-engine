# План миграции Editor UI: Colibri → Svelte 5 + Tailwind CSS 4

**Статус:** proposed target plan; реализация нового Host ещё не начата.
**Baseline:** `dev` на 30.10.2026; legacy client находится в `source/editor/`.
**Решение:** [ADR-0005](decisions/ADR-0005-svelte-editor-host.md).
**Нормативные требования:** [Техническое задание, разделы 1, 4, 12 и 13](technical-specification.md).

## 1. Цель и границы

Создать самостоятельный browser Editor Host на Svelte 5 + TypeScript + Vite и Tailwind CSS 4, постепенно заменить им Colibri UI и после приёмки удалить Colibri.

Это **миграция UI-платформы, а не переписывание всего движка**.

Сохраняются и отдельно проверяются:
- Node.js local server, project/file HTTP API, upload и play-mode routes;
- существующие project/scene/prefab formats, serializers и migrations;
- asset metadata, importer contracts и code-generation semantics;
- Phaser 4.2.1 runtime и scene Canvas renderer;
- server-owned MCP tool registry и JSON Schemas;
- reusable domain logic, validation и service modules, когда их можно отделить от Colibri без копирования и дублирования.

Перерабатываются:
- Colibri Workbench, Parts/Views, windows, tabs, splitters и workspace layout;
- Inspector/Hierarchy/Assets/Scene panels и UI controls;
- editor menus, dialogs, command/shortcut routing, focus и notifications;
- styling/theme infrastructure и UI lifecycle;
- plugin UI registration там, где она связана с Colibri.

Нельзя переносить в новый Host старую архитектуру только ради сохранения имён классов. Нельзя менять project data semantics без отдельной schema migration и acceptance.

## 2. Целевая структура

```text
codogma-engine/
├── src/
│   └── editor/                  # new Svelte 5 Editor Host (planned)
├── source/
│   └── editor/                  # old Colibri client, temporary legacy
├── server/                      # existing backend and project APIs
├── packages/
│   ├── editor-mcp-server/       # current private stdio package
│   ├── localization/            # current localization package
│   └── ...                      # only independently reusable packages
└── tests/
    ├── workspace/               # canonical fixtures
    └── editor-ui/               # new browser acceptance fixtures (planned)
```

Не создавать npm package на каждую панель. Scene Editor, Inspector, Assets, Timeline и другие области могут быть отдельными feature modules внутри одного Editor Host app. Workspaces и независимые публикации пакетов не входят автоматически в эту migration.

Svelte отвечает за DOM/UI и reactive state. Phaser отвечает за игровую Canvas scene и runtime. Для overlay/gizmos использовать чётко определённый Canvas/DOM layer contract, а не дублировать renderer в HTML.

## 3. Два Editor Host в переходный период

### 3.1. Рекомендуемая dev topology

| Компонент | Default URL | Кто запускает |
|---|---|---|
| Legacy UI | `http://127.0.0.1:3000/editor/` | Existing Node server |
| New Svelte UI | `http://127.0.0.1:5173/` | Vite dev server |
| Backend APIs | `http://127.0.0.1:3000/editor/*` (reached through Vite proxy from the new UI) | Existing Node server |

Схема по умолчанию:

```text
Browser tab A ── http://127.0.0.1:3000/editor/ ──┐
                                                ├── Node backend (PORT=3000)
Browser tab B ── http://127.0.0.1:5173/ ─ Vite ─┘      ├── PROJECT_DIR
                                                        ├── project/file APIs
                                                        ├── upload/play mode
                                                        └── MCP HTTP endpoint
```

- Node server сохраняет свой `PORT` (3000 по умолчанию). Vite получает отдельную настройку порта (например `VITE_PORT`) и не переиспользует переменную `PORT`.
- Рекомендуемый адрес — `127.0.0.1`, а не плавающий hostname alias. Vite использует strict-port behaviour: если 5173 занят, startup завершается с ошибкой, а не молча выбирает 5174; exact Origin allow-list должна совпадать с browser origin.
- Новая UI app отправляет запросы на относительные `/editor/*` paths. Vite proxy направляет их к backend `http://127.0.0.1:3000`. Не делать direct browser fetch calls к backend port и не вводить отдельную CORS policy без необходимости.
- Backend получает proxy request от loopback peer. Его существующий Host check остаётся включённым; для browser Origin задаётся ровно `CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173`. Это узкое доверие к одному локальному dev origin, не wildcard. При изменении порта allow-list и Vite config меняются согласованно.
- Конкретная proxy конфигурация `changeOrigin`/Origin forwarding должна быть подтверждена integration tests для `server/request-origin.mjs`; нельзя обходить guard.
- Port 5173 — dev default, а не обязательный permanent port. Для стабильного Origin allow-list Vite включает strict-port behaviour. Если порт меняется, allow-list меняется синхронно.
- Production не требует двух постоянно работающих backend ports: Svelte build будет раздаваться существующим Node server. Для acceptance может быть временный `/editor-next/`; после cutover основной путь `/editor/` переключается на Svelte.

Это временный режим разработки и acceptance. Для обычной работы одного редактора не требуется запускать два backend процесса.

### 3.2. Project write ownership

Два UI на разных портах не становятся двумя безопасными independent editors автоматически.

Обе вкладки по умолчанию используют один `PROJECT_DIR`, но у них разные in-memory selection, undo/redo history, dirty state и caches. Текущий backend не обеспечивает межклиентский project lock, optimistic concurrency, revision checks или conflict merge.

До отдельного concurrency contract:
1. Разрешено держать legacy и new UI открытыми для визуального сравнения.
2. Один `PROJECT_DIR` редактирует только одна UI session в конкретный момент.
3. Для параллельной проверки write workflows создаются разные fixture copies и запускаются отдельные backend instances с разными `PORT` (а legacy MCP bridge ports должны быть уникальными).
4. Одновременный save одного файла/сцены из двух editors запрещён; разные browser origins сами по себе не устраняют lost updates.

### 3.3. MCP SSE ownership

Текущая реализация `server/mcp.mjs` хранит editor SSE connections в `bridgeClients: Set`. `bridgeCommand()` broadcasts command event всем clients, а pending command завершается первым received result. Два UI на одном bridge могут получить одну команду и выполнить её дважды; результат может зависеть от порядка ответов.

Поэтому во время dual-run:
- legacy Colibri client остаётся единственным подключённым SSE editor client;
- новый Svelte Host не открывает `/editor/mcp-bridge/events` на том же backend;
- новый Host может использовать MCP HTTP tools, не требующие активного browser editor, если их контракт это позволяет;
- UI-dependent MCP tools включаются для нового Host только после session-aware routing с явным target editor/session ID и multiple-client isolation tests либо при использовании изолированного backend instance.

SSE routing — отдельный acceptance gate, а не необязательная оптимизация.

## 4. Порядок миграции

| Этап | Реализация | Обязательное доказательство перед переходом |
|---|---|---|
| 0. Inventory | Capability matrix для всех existing UI workflows; каталог Colibri imports/callbacks, domain logic и backend contracts | У каждого workflow есть owner, fixtures, статус и explicit migrated/deferred/retired decision |
| 1. New Host shell | Svelte 5, TypeScript, Vite, Tailwind CSS 4, startup scripts, strict loopback port, backend proxy | Clean install/build; новый Host работает отдельно, legacy UI не сломан; exact Origin tests pass |
| 2. Workbench primitives | Window/layout, split panes, tabs, panel lifecycle, menus, dialogs, commands, keyboard/focus, notifications, themes/tokens, workspace persistence | Browser checks keyboard-first navigation, resizing, focus restore, layout restore and theme switching |
| 3. Scene vertical slice | Project open, Phaser Canvas, Hierarchy, selection, Transform, Inspector, scene save/reopen, Undo/Redo | Один реальный fixture проходит open → edit → save → reload → compare; regression tests сохраняют data semantics |
| 4. Authoring features | Assets/Pack/importers, Prefabs/components, code editor integration, Animation/Spine, Tilemap, Physics, FX/Particles | Каждый workflow имеет fixture/tests/browser acceptance и known limitations |
| 5. Editor services | Settings, project actions, file operations, localization, runtime preview, error/reporting, MCP commands and bridge routing | Ни одна необходимая capability не зависит от legacy UI; MCP targets конкретную editor session |
| 6. Cutover | Node server начинает отдавать Svelte build как основной `/editor/`; временный legacy route доступен только для rollback | Clean user profile, existing project fixtures, browser/runtime checks, production static assets and rollback procedure pass |
| 7. Legacy removal | Удаление Colibri UI, plugin loader, legacy controls/styles/assets/build pipeline and obsolete dependencies | Новый bundle не содержит Colibri; source search/dependency checks не показывают runtime imports; tests/docs/scripts/release archive актуализированы |

Не выполнять Этапы 2–7 одним PR. Каждый этап дробится на независимые feature PR; новый Host должен оставаться запускаемым в ходе всей миграции.

## 5. UI и frontend technology rules

- **Svelte 5** — единственный целевой UI component/reactivity framework. Использовать актуальную runes/reactivity model и единые TypeScript contracts. Не строить новую оболочку как React/Vue/Colibri hybrid.
- **Tailwind CSS 4** — единый основной styling pipeline через официальный Vite plugin `@tailwindcss/vite`, поверх собственных Codogma design tokens и CSS variables для тем. Tailwind utilities не отменяют дизайн-систему и accessibility rules.
- Новые views не должны импортировать Colibri или зависеть от `colibri.*` globals. Не создавать bridge для передачи Svelte state в Colibri.
- Данные проекта принадлежат Project Model/backend contracts, а не компоненту Svelte. UI state (active panel, current selection, open tabs, transient inspector draft) имеет одного чётко определённого owner и lifecycle.
- Не использовать `$effect` как общий механизм синхронизации всех stores; применять Svelte runes/reactivity по прямому назначению и явные service/command calls.
- Не внедрять Dockview автоматически. Сначала проверить, какие docking/workspace primitives реально нужны; использовать библиотеку только если она сокращает сложность без потери требований.
- Не менять CodeMirror/Monaco в рамках самой UI framework migration без отдельного доказательства: embedded code editor — отдельная feature, не конкурент Svelte.
- Tailwind class names должны обнаруживаться static scanner; динамическую конкатенацию partial class tokens не использовать. Для variants — полные заранее заданные class strings.

## 6. Обязательные acceptance gates

### Functional/data parity
- Все согласованные поддерживаемые workflows учтены в capability inventory; у каждого есть migrated/deferred/retired status.
- Старые representative projects/scenes открываются без автоматического разрушительного преобразования.
- Save/reopen и round-trip сохраняют IDs, hierarchy, prefab overrides, asset metadata, user components and codegen semantics.
- Scene/Hierarchy/Inspector/Assets и критичные authoring flows работают в браузере; Undo/Redo and keyboard workflow проходят реальные сценарии.
- Project/API/MCP/backend остаются single source of truth; нет двух независимых serializers или двух копий project state.

### Visual, interaction and performance
- Проверены `dark`, `light` и существующая `lightBlue` theme coverage (либо официально переименованные варианты).
- Проверены keyboard focus, shortcuts, pointer interactions, touch/scroll, context menus, empty/loading/error/disabled states and resizing.
- Scene open, asset browsing, large hierarchy, selection and Inspector updates измерены на одинаковых fixtures/browser/viewport относительно legacy baseline; performance regressions объяснены и приняты явно.
- Canvas/Phaser lifecycle не дублируется и не создаёт второй game loop при открытии/закрытии панелей и проекта.

### Integration/security/cutover
- Exact Origin allow-list, loopback binding, Vite proxy paths and strict port configuration test pass; wildcard Origin/Host is absent.
- Concurrent write policy enforced operationally; до появления lock/versioning contract acceptance не тестирует simultaneous edits одного project.
- MCP editor SSE targets one active editor session and multiple-client tests prove no duplicate dispatch.
- Clean install and CI build/typecheck/unit/browser tests pass. Новый production bundle не содержит Colibri/legacy UI dependencies.
- Cutover and rollback paths documented and exercised before legacy route removal.

## 7. Non-goals

- Переписать Phaser, Node server, MCP tools registry, serialization и все domain algorithms только ради нового UI.
- Запустить два independent editable copies одного project без concurrency control.
- Создать adapter layer для постоянного взаимодействия Svelte и Colibri.
- Выполнить migration в одном giant PR или удалить старый редактор до browser acceptance.
- Автоматически внедрить Dockview, Monaco, новый router, npm Workspaces или public extension packages без отдельной необходимости.

## 8. Источники

- [Svelte 5 migration guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [Tailwind CSS 4 + Vite installation](https://tailwindcss.com/docs/installation/using-vite)
- [Vite server options: port, strictPort, proxy](https://vite.dev/config/server-options)
- [ADR-0005](decisions/ADR-0005-svelte-editor-host.md)