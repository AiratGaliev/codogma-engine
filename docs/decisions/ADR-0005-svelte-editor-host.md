# ADR-0005: Независимый Svelte Editor Host и staged replacement Colibri

**Статус:** Accepted as target UI direction; implementation not started.
**Дата:** 30.10.2026
**Связанные документы:** [Техническое задание](../technical-specification.md), [Дорожная карта](../roadmap.md), [План миграции Editor UI](../editor-ui-migration.md), [ADR-0004: Svelte PoC](ADR-0004-svelte-poc.md).

## Контекст

Текущий браузерный клиент Codogma находится в `source/editor/` и использует Colibri как UI platform: Workbench/Parts, editor/view registry, controls, themes, commands, dialogs и plugin lifecycle. Ограниченный Svelte PoC из PR #13 добавил одну панель Scene Stats внутрь старого Workbench. Это доказало техническую возможность embed-интеграции, но не доказало, что долгосрочное сосуществование двух UI-фреймворков упрощает продукт.

Целевое направление: вместо увеличения числа Svelte-панелей внутри Colibri создать самостоятельный Editor Host на Svelte 5 + TypeScript + Vite и Tailwind CSS 4, постепенно перенести в него editor workflows и после приёмки удалить Colibri UI. Phaser остаётся игровым runtime/Canvas renderer; Node.js server, project APIs, MCP registry, scene formats и code generation не переписываются только из-за смены UI.

## Рассмотренные варианты

| Вариант | Решение |
|---|---|
| Продолжать развивать Colibri как единственный UI | Сохраняется только как legacy fallback на период миграции; не является целевой архитектурой |
| Встраивать новые Svelte views через Colibri bridge | Не использовать как долгосрочный путь: создаёт два UI lifecycle/state/theme/layout слоя и постоянный adapter burden |
| Полностью переписать весь редактор одним большим PR | Отклонено: слишком большой blast radius, отсутствие постепенного rollback и трудно доказуемая функциональная parity |
| Новый независимый Svelte Host, staged workflow migration, затем Colibri removal | Целевое направление |

## Предлагаемое решение

1. **Один UI-фреймворк:** Svelte 5 + TypeScript. Использовать актуальную runes/reactivity model и единые типизированные contracts. Не строить новую оболочку как React/Vue/Colibri hybrid.
2. **Единая система стилей:** Tailwind CSS 4 как основной utility/style pipeline через официальный Vite integration (`@tailwindcss/vite`), поверх собственных Codogma design tokens и CSS variables для тем. Не переносить legacy CSS один к одному; повторно использовать только визуально и функционально подтверждённые assets и tokens.
3. **Один Editor Host app:** целевой исходный путь — `src/editor/`. Feature modules (Scene Editor, Inspector, Assets, Tilemap и т.п.) остаются модулями одного приложения, а не обязаны становиться отдельными npm packages. npm Workspaces и package API — отдельный вопрос; не вводить пакет на каждую панель.
4. **Независимые domain/API contracts:** UI работает с project/file/server APIs и сохраняемыми данными. Scene/project serialization, asset metadata, code generation, MCP tool schemas, Phaser runtime и Node server остаются отдельными системами. Сохранять действующие форматы и семантику до отдельной проверенной миграции.
5. **Без долгосрочного Colibri↔Svelte adapter:** старый и новый Editor Hosts запускаются как самостоятельные browser applications. Новая UI-логика не импортирует Colibri и не должна подражать `Part`, `Workbench`, старому extension registry или old controls. Временная интеграция допустима только для диагностики/совместимости и должна иметь срок удаления.
6. **Phaser Canvas сохраняется:** Svelte владеет оболочкой и панелями; Phaser продолжает отображать игровую сцену. Не заменять Canvas renderer на DOM и не менять Phaser runtime этим ADR.

## Временная схема двух редакторов

В development режиме временно поддерживаются два UI origin:

| UI host | Адрес по умолчанию | Роль |
|---|---|---|
| Legacy Colibri UI | `http://127.0.0.1:3000/editor/` | Существующий client, который Node.js backend сейчас раздаёт по умолчанию |
| New Svelte UI | `http://127.0.0.1:5173/` | Независимый Vite dev server |

- Node server сохраняет существующий `PORT` (3000 по умолчанию) и продолжает владеть файловыми/API/MCP операциями.
- Vite получает отдельный параметр порта (например, `VITE_PORT`), bind только на `127.0.0.1` и strict-port behaviour. Не переиспользовать `PORT` Node server.
- Vite proxies relative `/editor/*` requests к backend. Browser code вызывает относительные пути; не создавать прямые cross-origin requests с нового UI на backend port.
- Backend получает только точный `CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173`; Host/peer checks остаются включёнными. Wildcard Origin/Host не используется. Proxy config (включая `changeOrigin` и передачу Origin) должна быть проверена tests для `server/request-origin.mjs`.
- Если 5173 занят, startup должен завершиться ошибкой, а не переходить на другой порт: allow-list должна точно совпадать с browser origin.
- Два порта нужны для development/acceptance, но не для постоянного production topology. Production Svelte bundle раздаётся через существующий Node server; на cutover новый bundle получает `/editor/`, а legacy route ограниченное время остаётся для rollback.

## Ограничения dual-run

### Один проект — один writer

Обе UI-сессии могут быть открыты для сравнения, но одновременно изменять один `PROJECT_DIR` нельзя. У них независимые selection, undo/redo stacks, dirty state и caches. Текущий backend не обеспечивает cross-client file lock, optimistic concurrency, revision checks или conflict resolution.

До отдельного concurrency contract:
- один `PROJECT_DIR` в каждый момент времени редактирует только одна UI session;
- для параллельной write acceptance используются разные fixture/project copies и отдельные backend instances;
- разные browser origins сами по себе не предотвращают lost updates.

### MCP SSE — один владелец до session-aware routing

В текущем `server/mcp.mjs` editor SSE clients хранятся в одном `bridgeClients: Set`. `bridgeCommand()` broadcasts command всем clients, а pending command завершается первым полученным result. Если оба UI подключатся к одному bridge, оба могут выполнить команду, а результат станет зависеть от того, кто ответит первым.

На dual-run этапе legacy client остаётся единственным SSE owner. Новый Host не подключается к `/editor/mcp-bridge/events` на том же backend до реализации session-aware routing с явным target editor/session ID и тестов multiple-client isolation. Для независимой acceptance допустимы отдельные backend/bridge instances. MCP HTTP tools, не требующие открытого editor session, остаются отдельным path.

## Последовательность реализации

1. **Inventory and contracts:** описать существующие workflows, Colibri imports/callbacks, domain logic и backend contracts; закрепить fixtures и migrated/deferred/retired decisions.
2. **New Host bootstrap:** создать `src/editor/` на Svelte 5, TypeScript, Vite и Tailwind CSS 4; настроить dual-run scripts, loopback bind, strict port и exact-origin backend proxy.
3. **Workbench shell:** реализовать layout/split panes, tabs, panel lifecycle, menus, dialogs, commands/shortcuts, focus/keyboard navigation, notifications, theme tokens и workspace persistence. Не добавлять Dockview без подтверждённой необходимости.
4. **First functional vertical slice:** открыть реальный project и scene; показать Phaser Canvas, Hierarchy, selection, Transform и Inspector; поддержать create/edit/save/reopen/Undo/Redo без потери project data. Это первый крупный migration gate.
5. **Feature migration:** переносить Assets/Asset Pack/importers, Prefabs/components, code editor integration, Animation/Spine, Tilemap, Physics, FX/Particles и остальные workflows по одному связанному срезу. Каждый slice получает fixtures, regression tests и browser acceptance.
6. **Integration parity:** восстановить settings, themes, keyboard shortcuts, drag/drop, file operations, localization, error handling, preview/play workflows, MCP tools and live editor workflows. Подключать MCP SSE только после session-aware routing либо изолированного backend.
7. **Cutover:** сверить согласованный feature inventory; новый bundle становится `/editor/`; legacy UI временно остаётся на rollback route. Проверить clean profile, существующие project fixtures, browser support и production packaging.
8. **Legacy removal:** после rollback window удалить Colibri UI, plugin loader, controls, legacy styles/assets/build pipeline и obsolete dependencies отдельным cleanup PR. Не удалять project formats или Phaser codegen только из-за удаления Colibri.

## Критерии принятия миграции

- Новый Host запускается независимо от Colibri и не импортирует Colibri namespaces/modules.
- Old and new UI можно открыть одновременно на отдельных loopback origins; Vite proxy работает через exact Origin allow-list, без wildcard и ослабления request guard.
- Один fixture открывается, изменяется, сохраняется и повторно открывается в новой UI без потери данных; legacy regression suite сохраняет прежнюю семантику.
- Scene/Hierarchy/Inspector/Assets, Prefab/Component, Undo/Redo, keyboard, themes, dialogs, import/preview, code generation и остальные согласованные workflows имеют явный migrated/deferred/retired статус.
- Phaser canvas/runtime работает в новой оболочке без изменения игрового цикла и без дублирования renderer/runtime.
- Стили используют общие Tailwind tokens; проверены dark/light/lightBlue и основные focus/hover/disabled/error states.
- Performance/memory измеряются на одинаковых projects/browser/viewport относительно legacy baseline.
- MCP commands маршрутизируются ровно в intended editor session; multiple SSE clients не получают один command broadcast.
- Новый production bundle не содержит Colibri/legacy UI dependencies; это подтверждено dependency/bundle report.
- Browser acceptance и CI нового Host проходят до переключения default route; rollback route проверен.
- После cleanup не остаются ненужные Colibri source, build assets, packages, CSS, references или test harnesses.

## Риски и открытые вопросы

- Colibri coupling может оказаться выше, чем видно по базовым панелям; сначала нужен inventory реальных import/callback/data flows.
- Scene Editor logic может совмещать domain behaviour и UI lifecycle; переносить только после tests, не отделять автоматически по имени каталога.
- Dual-run требует точной proxy/origin configuration и стабильной настройки Vite port.
- Shared project directory не гарантирует multi-client write consistency; один writer остаётся обязательным до отдельного concurrency contract.
- Текущий MCP SSE bridge не изолирует editor sessions; новый client нельзя подключать к нему одновременно без session routing.
- Tailwind не заменяет design system: Codogma tokens, states, density, accessibility и responsive rules должны быть определены отдельно.
- Точный layout library, code-editor component, router и npm workspace/package layout не утверждаются этим ADR без отдельного evidence.

## Технические references

- [Svelte 5 migration guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [Tailwind CSS 4 + Vite installation](https://tailwindcss.com/docs/installation/using-vite)
- [Vite server options: port, strictPort, proxy](https://vite.dev/config/server-options)
- [План миграции](../editor-ui-migration.md)