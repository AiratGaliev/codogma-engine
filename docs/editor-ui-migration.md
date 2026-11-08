# Editor Host: архитектура и план развития

**Текущий UI:** единственное приложение редактора — SolidJS + TypeScript/TSX в `src/editor/`.
**Production:** Node.js server собирает и обслуживает Vite bundle по `/editor/`.
**Development:** Vite работает на `127.0.0.1:5173` и проксирует запросы `/editor/*` к loopback backend на `127.0.0.1:3000`.
**Решение:** [ADR-0005](decisions/ADR-0005-solidjs-editor-host.md).
**Нормативные требования:** [Техническая спецификация](technical-specification.md).
**Product UX-reference и инженерные источники:** [Стандарт reference для 2D Editor Host](editor-reference-standard.md) и [Editor Engineering References](editor-engineering-references.md). Unity 6.6 — основной UX-reference; Cocos Creator 4.0 LTS — дополнительный 2D workflow reference; Godot и другие открытые редакторы используются как task-specific implementation references.

## Назначение и архитектура

Editor Host — самостоятельное Web-first 2D authoring приложение. Он использует SolidJS 1.9, TypeScript/TSX, Vite 8 и Tailwind CSS 4. Новый UI, domain models, services и browser integration развиваются внутри одного приложения; отдельные npm packages для обычных панелей не создаются.

Архитектурная граница:

- `src/editor/` владеет Workbench, transient UI state, командами, focus/shortcut model, Hierarchy, Inspector, Scene/Game View, Project/Assets и editor-specific services.
- `packages/cge/` владеет host-neutral Project Model v1 contracts, validation, serialization, Component schemas/registry/world и diagnostics.
- `server/server.mjs` обслуживает собранный Host, native project files, generated runtime output, AI Chat endpoint и HTTP MCP endpoint.
- `server/mcp.mjs` владеет first-party MCP registry, system instructions, project/file operations и session-aware bridge к открытому Editor Host.
- Runtime adapter, Scene Loader, Preview Host и Build используют native Project Model contracts; соответствующая реализация развивается в принадлежащих им Engineering issues.

Зависимости направлены от UI к native contracts. Core, Project Model, Build и runtime не должны зависеть от SolidJS, DOM или состояния конкретного окна редактора. MCP не содержит отдельной модели Scene/Prefab: он вызывает native editor handlers либо выполняет принадлежащие серверу project/file operations.

## Текущий результат

### Workbench и Scene workflow

COD-80 реализовал первый Workbench + Scene vertical slice:

- Scene Canvas, selection и Move/Rotate/Scale interactions;
- Hierarchy и Inspector/Transform synchronization;
- базовые Image/Text/Container authoring operations;
- save/reopen и Undo/Redo с восстановлением selection;
- Scene/Game tabs, toolbar/menu, Project/Animation/Components/Console panels;
- theme tokens, Godot SVG icons и responsive layout.

COD-83 расширил workspace/docking:

- Left/Right/Bottom dock zones и вкладочные группы;
- close/reopen, drag/drop, возврат панелей в home zone;
- pointer/keyboard splitter resize и tab reorder;
- focus/shortcut routing и узкие viewport layouts;
- schema-versioned workspace persistence с детерминированной обработкой повреждённого состояния.

Floating windows, произвольный nested split tree и перемещение Scene/Game viewport не заявляются как реализованные возможности.

### Native data workflow

Editor Host использует Project Model v1 для Project, Scene, Prefab, Node, Component и Asset references. Domain models обеспечивают validation и детерминированную сериализацию. Scene операции включают создание/открытие/сохранение, Node hierarchy edits, Transform/active state и Undo/Redo. Prefab authoring и базовые references/instances используют native Prefab document contracts.

Полная nested Prefab projection, override propagation и conflict resolution остаются COD-8. Schema-driven Component Inspector и полное TypeScript Script/Component authoring развиваются в COD-27/COD-91. Runtime hydration и атомарная активация Scene относятся к COD-103; Phaser adapter и browser Preview Host — к COD-28/COD-30/COD-31.

### Runtime и внешние assets

Game View загружает generated project output через backend runtime-file route. Scene authoring и generated game execution остаются отдельными lifecycle: сохранение Scene само по себе не пересобирает game output.

Phaser 4.2.1 — выбранный HTML5 runtime target. Runtime adapter, Scene Loader, Preview lifecycle и воспроизводимый Build развиваются через отдельные contracts и acceptance; наличие Scene Canvas не считается доказательством завершённой runtime parity.

Внешние контракты Phaser Asset Pack, animation JSON, texture/spritesheet, bitmap-font, Tiled tilemap metadata, Spine skeleton/atlas metadata и Google Fonts остаются отдельными asset workflows. Native Asset Library/Sprite import и reimport принадлежат COD-86; Timeline/tracks/keyframes/curves/events — COD-84; Tilemap — COD-40; Physics/Box2D — COD-42; FX authoring/preview parity — COD-89/CODQA-19; Spine authoring/preview — COD-90/CODQA-20.

## Capability roadmap

| Capability | Текущее состояние | Owner / acceptance |
|---|---|---|
| Workbench + basic Scene | Первый вертикальный срез реализован | COD-80, CODQA-18 |
| Docking/workspace | Left/Right/Bottom, tabs, splitters, keyboard/focus и persisted layout реализованы | COD-83 |
| Native Project/Scene/Prefab documents | Native persistence, validation, save/reopen и базовые Prefab references/instances | COD-113; расширенная Prefab семантика — COD-8 |
| Components | Native schema/registry/contracts существуют; полноценный schema-driven Inspector и authoring lifecycle ещё развиваются | COD-27, COD-91, CODQA-21 |
| Asset Library/Sprite | Native Asset/Sprite metadata, import, slicing и reimport | COD-86, CODQA-10 |
| Package Manager | Архитектурные contracts определяются отдельно; UI workflow ещё не реализован | COD-92, COD-94 и связанные package tasks |
| Camera/coordinates/sorting | Требования описаны в технической спецификации; authoring/gizmos требуют реализации | COD-41 |
| 2D UI authoring | Native runtime/UI authoring workflow ещё не реализован | COD-43, CODQA-12 |
| Animation | Базовые clip/frame operations существуют; полный Timeline workflow не завершён | COD-84, CODQA-4 |
| Tilemap | Native authoring workflow ещё не реализован | COD-40, CODQA-14 |
| Physics/Box2D | Native physics contracts и runtime integration развиваются; полный Host workflow не завершён | COD-42, CODQA-1 |
| FX authoring | Circle/Bloom/Gradient/Shine Inspector и preview реализованы; persisted/runtime parity проходит отдельную проверку | COD-89, CODQA-19 |
| Spine | Полный native authoring/preview workflow ещё не реализован | COD-90, CODQA-20 |
| Audio/Particles | Authoring/preview controls ещё не реализованы | COD-61, CODQA-13 |
| Preview/diagnostics | Game View показывает generated output; полный Preview Host, live identity и общий EditorLogger ещё развиваются | COD-30/31/32/47/58 |
| Build Profiles / Build Settings | Reproducible Development/Release profile contracts описаны; dedicated Host workflow ещё не реализован | COD-35, COD-95 |
| Project Settings / Editor Preferences | Полный domain ownership и отдельные Host pages ещё проектируются | COD-96/97 |
| Input Actions Editor | Authoring UI и remapping/conflict workflow ещё не реализованы | COD-98/99 |
| MCP live bridge | Native registry, schemas, stdio adapter и session-aware Host routing реализованы; multi-Host acceptance ещё не завершена | COD-85, CODQA-8 |

Статус capability должен подтверждаться implementation и tests. UI controls, существование MCP schema или успешно собравшийся bundle сами по себе не доказывают завершённый runtime workflow.

## Development и production topology

### Development

Установить зависимости:

```bash
npm ci
npm --prefix src/editor ci
```

Запустить backend и Vite Host вместе:

Bash:

```bash
CODOGMA_ALLOWED_ORIGINS=http://127.0.0.1:5173 npm run dev:editor-host
```

PowerShell:

```powershell
$env:CODOGMA_ALLOWED_ORIGINS = "http://127.0.0.1:5173"
npm run dev:editor-host
```

Открыть `http://127.0.0.1:5173/`. Vite использует strict port и проксирует `/editor/*` к loopback Node backend. Для proxy-origin задаётся точный allow-list; wildcard Origin запрещён.

### Production-like local run

```bash
npm ci
npm --prefix src/editor ci
npm run build
npm start
```

Node server обслуживает production bundle из `src/editor/dist` по `http://127.0.0.1:3000/editor/`. Root `npm run build` и `npm run watch` направлены на native Editor Host.

### Project selection

По умолчанию backend использует native Project Model v1 fixture:

`packages/cge/tests/fixtures/acceptance-project`

Для собственного проекта передать абсолютный путь через `PROJECT_DIR`. Не направлять локальный сервер на каталоги с файлами, которые не должны быть доступны Editor Host или его tools.

## MCP и session ownership

`@codogma/editor-mcp-server` — stdio adapter над engine-owned tool registry. Engine остаётся единственным источником schemas, system instructions, dispatch и project-file security.

Live Scene/Node/Prefab/Component/FX и screenshot operations выполняются через SSE bridge конкретной Editor Host session. Сервер создаёт session ID; MCP command отправляется активной сессии, а result принимается только от исходной сессии. Команды не broadcast-ятся. Multi-Host reconnect, cancellation/timeout и shared project write ownership остаются COD-85; пока этот контракт не принят, параллельные write tests используют отдельные project/backend instances.

File-only MCP tools выполняются на backend и не требуют открытого UI. External asset inspection не подменяет native Project/Scene authoring contracts.

## Validation и acceptance

- CI Fast проверяет native Core build/typecheck/tests, Editor Host build/typecheck/domain tests, server smoke, MCP schema/bridge contracts и security tests.
- Feature PR добавляет или обновляет scoped tests для изменённого сценария; полный MCP/Playwright E2E не запускается на каждом topic PR.
- Полный E2E gate выполняется на promotion PR `dev → test`, затем на release-promotion PR.
- Независимая browser/runtime/manual acceptance фиксируется CODQA на интегрированном `test` SHA. CI Fast не заменяет visual/runtime acceptance.

Обязательные UX проверки включают docking/resizing, tabs/focus/shortcuts, context menus, themes, workspace restore, Scene selection/Transform/Hierarchy, Inspector synchronization, save/reopen и Undo/Redo. Runtime checks отдельно проверяют Canvas lifecycle, resize/disposal, Preview session и generated game output.

## Sources

- [SolidJS documentation](https://docs.solidjs.com/)
- [SolidJS TypeScript configuration](https://docs.solidjs.com/configuration/typescript)
- [SolidJS Vite plugin](https://github.com/solidjs/vite-plugin-solid)
- [Tailwind CSS 4 + Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Vite server options](https://vite.dev/config/server-options)
- [Unity 6 Editor manual](https://docs.unity.com/en-us/engine/6000.6/manual)
- [Cocos Creator 4.0 documentation](https://docs.cocos.com/creator/4.0/manual/en/)
