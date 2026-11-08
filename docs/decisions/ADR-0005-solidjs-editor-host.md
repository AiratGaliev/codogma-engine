# ADR-0005: SolidJS Editor Host

**Статус:** принято; единственная UI-архитектура Codogma Engine. COD-80 реализовал первый Workbench + Scene vertical slice; COD-83 развил docking и persisted workspace layout. Native Project Model, MCP и server integration развиваются в рамках отдельных Engineering issues.
**Дата решения:** 30.10.2026  
**Последнее уточнение:** 08.11.2026  
**Связанные документы:** [Техническое задание](../technical-specification.md), [Дорожная карта](../roadmap.md), [Editor Host architecture and roadmap](../editor-ui-migration.md), [Стандарт reference для 2D Editor Host](../editor-reference-standard.md), [ADR-0004: optional Data-Oriented ECS](ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md), [ADR-0002: общий TypeScript toolchain](ADR-0002-typescript-toolchain.md), [ADR-0007: нативный Project Model](ADR-0007-native-codogma-project-model.md).

## Контекст и решение

Codogma Engine нужен собственный Web-first 2D Editor с Unity-like рабочей средой: меню и toolbar, docking panels, Scene/Game View, Hierarchy, Inspector, Project/Assets, Animation/Timeline, Console, Transform tools, commands, shortcuts, themes и persisted workspace layout.

Для приложения редактора выбран **SolidJS + TypeScript/TSX + Vite + Tailwind CSS 4**. Единственное приложение редактора располагается в `src/editor/`. Оно обслуживается production Node server по `/editor/`; во время разработки Vite предоставляет frontend на loopback и проксирует backend API.

Архитектура не предполагает нескольких взаимозаменяемых UI, переключателей UI implementation или межфреймворковых compatibility adapters. Все редакторские workflows реализуются через native Codogma contracts.

## Продуктовые reference и 2D-only scope

Основной UX-reference — Unity 6.6 Editor (6000.6); дополнительный reference по 2D authoring workflows — Cocos Creator 4.0 LTS. Godot и другие открытые редакторы используются как task-specific implementation/engineering references, а не как дополнительные продуктовые UX-эталоны. Не добавлять режим 2D/3D или 3D-only panels/gizmos/workflows. Процесс adopt/adapt/reject закреплён в [стандарте reference](../editor-reference-standard.md).

## Почему SolidJS

- JSX/TSX даёт декларативную структуру UI, понятную разработчикам с React-опытом.
- SolidJS использует fine-grained reactivity без Virtual DOM: reactive primitives обновляют DOM-узлы, зависящие от изменившихся значений.
- TypeScript/TSX подходит для строгих contracts между панелями, domain models и services.
- SolidJS управляет DOM Workbench; Scene/Game View и игровой runtime связываются через явные renderer/lifecycle contracts.

Это архитектурное решение, а не утверждение о benchmark-превосходстве во всех сценариях. Производительность измеряется на реальных Hierarchy/Assets lists, Inspector updates, Scene View и Preview workflows.

## React-подобный JSX не означает React runtime model

- Компоненты SolidJS выполняются при создании owner scope; изменение signal не вызывает повторный рендер всей функции компонента.
- Зависимости читаемых сигналов отслеживаются fine-grained реактивностью.
- Использовать `createSignal`, `createStore`, `createMemo`, `createEffect`, `onMount` и `onCleanup` по назначению.
- Не переносить React Hooks механически, не терять tracking при работе с reactive props и не создавать эффекты вместо derived state.
- Для TypeScript/JSX использовать `jsx: "preserve"` и `jsxImportSource: "solid-js"`.
- В Vite используется `vite-plugin-solid`; для Tailwind CSS 4 — `@tailwindcss/vite`. Host — client-side SPA; SolidStart не вводится без отдельного требования к SSR.

## Языковая граница и тестовая инфраструктура

- Весь собственный source Host в `src/editor/src/` — TypeScript (`.ts`) и SolidJS TSX (`.tsx`). UI-компоненты с JSX используют TSX; services/domain/models/state/commands/helpers — TS.
- JavaScript/MJS business logic и sidecar declarations не добавляются в Host source.
- Unit/integration tests в `src/editor/tests/` — TypeScript/Vitest; browser acceptance в `src/editor/browser-tests/` — TypeScript/Playwright.
- `playwright.config.ts`, `vite.config.ts` и fixture launchers включаются в Host typecheck.
- `src/editor/tsconfig.json` использует `strict: true`, `allowJs: false`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames` и no-unused checks.
- Production build не включает тестовые файлы.

## Архитектурные правила

1. **Один Editor Host:** `src/editor/` содержит приложение и его feature modules. Не создавать отдельный npm package для каждой панели.
2. **Workbench как единая система:** панели используют общий docking/layout state, command/shortcut routing, focus model, theme tokens и persisted workspace contract.
3. **Project Model отделён от UI state:** сериализация, validation и file operations принадлежат native Project Model/backend contracts. В SolidJS остаются transient UI state — открытые панели, вкладки, selection, expanded tree nodes, Inspector drafts и layout.
4. **Единый source of truth:** Scene, Prefab, Component и Asset operations проходят через native Project Model v1 contracts. Не поддерживать параллельные data representations и синхронизацию между ними.
5. **Runtime через contracts:** Phaser 4.2.1 подключается через отдельные runtime adapter/Scene Loader/Preview contracts. UI не создаёт неуправляемые Phaser instances в отдельных панелях.
6. **Headless services:** CLI/CI должны иметь возможность валидировать Project Model, проверять dependency graph и собирать игру без открытого UI.
7. **Typed integration:** Node server, HTTP/file APIs, MCP schemas, Asset metadata/importers и runtime связываются с Host через явные typed boundaries.
8. **Зависимости по необходимости:** docking, CodeMirror/Monaco, router и virtualization utilities не становятся обязательными без реализуемого workflow, который их требует.

## Server и MCP integration

- Production Node server обслуживает Vite build из `src/editor/dist` по `/editor/`.
- Development Vite работает на `127.0.0.1:5173`, проксирует native `/editor/*` API к loopback Node backend и использует точный `CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173`. Wildcard Origin запрещён.
- Engine-owned MCP registry содержит native Project/Scene/Node/Prefab/Component/FX и external asset inspection tools. Stdio adapter только передаёт schemas/calls, не создаёт второй registry.
- Единственное приложение Editor Host получает server-issued session ID для текущего SSE connection. Каждая MCP command/result привязана к этой connection; stale/duplicate responses отклоняются.
- Disconnect завершает pending operations, reconnect выдаёт новую identity. Несколько одновременно открытых Host clients, focus arbitration, broadcast и shared multi-Host write ownership не поддерживаются; COD-85 проверяет надёжность single-Host bridge.

## Фактические границы и дальнейшая работа

Workbench и Scene vertical slice реализованы в COD-80; docking/workspace layout развиты COD-83. Native Project Model v1 и базовые Scene/Prefab/Component/FX workflows развиваются отдельно. Nested Prefab projection/overrides принадлежат COD-8; Component Inspector schema и Script authoring — COD-27/COD-91; Asset Library/Sprite — COD-86; runtime Scene Loader/adapter/Preview — COD-103/COD-28/COD-30/COD-31.

Наличие UI controls или успешной сборки не считается завершённой capability. Реализация проходит scoped unit/contract tests в topic PR; полный E2E и независимая browser/runtime acceptance выполняются на интегрированном promotion candidate по правилам repository workflow.

## Последствия решения

- Новый editor feature code развивается только в SolidJS Host и native domain/runtime services.
- Сервер и MCP обслуживают один набор native contracts; UI mode selectors и альтернативные UI routes не являются частью architecture.
- Источником истины для Scene/Prefab/Component authoring остаётся Project Model, а не UI-specific serialization.
- Инженерные проверки, runtime acceptance и capability status привязываются к конкретным сценариям и commit SHA.
