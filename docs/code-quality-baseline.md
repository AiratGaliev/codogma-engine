# Baseline качества кода и проверок

**Базовый снимок `dev`:** `3351b069a11c7992fb28324ae22b48a411f307c7`, 29.10.2026. CI — commit-scoped evidence; актуальный статус PR проверяется по live checks. Эта baseline не подтверждает browser/runtime acceptance и не содержит performance measurements.  
**Охват:** manifests, TypeScript configs, workflows, test scripts и ключевые server/MCP paths. Полный построчный lint/security review всех legacy-файлов не выполнялся.

## Фактические CI/local checks

| Проверка | Текущая реализация | Что она подтверждает | Чего не подтверждает |
|---|---|---|---|
| Root install | `npm ci` в `.github/workflows/ci.yml` | Воспроизводимую установку по root lockfile | Корректность каждой MCP tool schema или всех транзитивных packages |
| Root dependency audit | `npm audit --audit-level=low` | Известные npm advisory по текущему lockfile и базе npm на момент выполнения | License audit, неизвестные уязвимости, race/security semantics |
| Legacy Editor install/audit | `npm ci` и `npm audit --audit-level=low` в `source/editor` | Установку и advisory scan legacy Colibri lockfile | Runtime/visual correctness и качество нового SolidJS Host |
| SolidJS Host install/build | Отдельный package в `src/editor`; CI `npm install --no-audit --no-fund`, `npm run typecheck`, `npm run build` | Установку зависимостей, проверку всего TS/TSX Host scope и Vite production build | Воспроизводимость отдельного Host lockfile до его синхронизации; полное user workflow/runtime acceptance |
| SolidJS Host domain/browser | `npm test` → Vitest `tests/**/*.test.ts`; `npm run test:browser` → Playwright `browser-tests/**/*.spec.ts`; CI job `editor-host` | TypeScript domain/integration regression и Chromium acceptance для реализованных Host slices | Specialized workflows, mobile/target-browser coverage и production cutover |
| Editor build/typecheck | `npm run build` → `tsc -b` | Компиляцию существующих TypeScript project references | Полный строгий режим, покрытие runtime-ветвей, browser acceptance |
| Server smoke | Запуск `server/server.mjs`, HTTP-запрос к editor/product и editor page | Сервер стартует и отдаёт ключевые ресурсы | Полную безопасность file API или корректность игры в browser |
| Security smoke | `npm run test:security` → `tests/security-smoke-test.mjs` | Loopback/Host/Origin guards, перечисленные существующие/dangling symlink и upload сценарии, внешний config symlink, MCP compatibility smoke | Adversarial TOCTOU race across path-based mutation syscalls; all write tools and all MCP argument schemas |
| MCP E2E | `npm run test:e2e` → `tests/mcp-e2e-test.mjs`; workflow ограничен PR в `test`/`main` и manual dispatch | Инициализацию MCP, список tools и отдельные сценарии scene-create/add-object/prefab/texture-size | UI/browser acceptance по умолчанию; полный набор tools; FX/Box2D runtime |
| SolidJS Host browser acceptance | CI Fast #470, HEAD `79ab4d3f589f9489b020163cf7d420cebd6cefc5`: 9 Chromium Playwright tests | Covered first-slice Scene/Workbench cases including layout, dock/tab/focus behavior | Not full functional acceptance, specialized tools, target-browser/mobile matrix or production cutover |
| Independent functional acceptance | Separate CODQA issues on exact candidate SHA and real fixtures/browser/runtime | Only recorded scenarios and evidence in each QA issue | Not implied by Host CI green status |

На PR #10 GitHub Actions CI Fast завершился успешно на head `3c96dde67eb865a0ee70fdbd5134ab995f846443`; оба dependency audit сообщили 0 vulnerabilities, editor build, server smoke и security smoke прошли. PR был слит в `dev` как `754edaa1f7313409e99c3462a802d5fd430a9a01`. В доступном evidence нет отдельного повторного запуска workflow на merge commit; не утверждать, что весь CI был запущен повторно после слияния.

## Toolchain baseline

- Root scripts: `start`, `dev`, `mcp`, `mcp:builtin`, `build`, `watch`, `test:e2e`, `test:security`.
- Legacy Editor scripts: `start` / `build` / `clean` через TypeScript project references.
- SolidJS Host scripts in `src/editor/package.json`: `dev`, `typecheck`, `build`, `test`, `test:browser`; root shortcuts: `dev:editor-host`, `build:editor-host`, `test:editor-host`, `test:editor-host:browser`.
- Legacy `source/editor` devDependencies: TypeScript `5.3.3`, `colibri-packer ^1.0.1`.
- New `src/editor` dependencies: SolidJS `1.9.15`; devDependencies include TypeScript `5.9.3`, Vite `8.3.5`, `vite-plugin-solid 2.11.14`, Tailwind CSS `4.3.3`, `@tailwindcss/vite 4.3.3`, Vitest `5.0.5`, `@types/node` and Playwright `1.64.1`.
- Host-owned implementation and tests are `.ts`/`.tsx`; its TypeScript config excludes JavaScript (`allowJs` is not enabled). Domain model `.mjs` + `.d.mts` pairs were removed. Vitest 5.0.5 runs the 36 TypeScript unit/integration tests; Playwright runs 9 TypeScript browser tests. CI currently installs the independent Host package with `npm install --no-audit --no-fund`; do not describe this as `npm ci` until `src/editor/package-lock.json` is regenerated and committed. Node backend and legacy Colibri files keep their existing extensions outside this scope.
- `source/editor/tsconfig-base.json` задаёт DOM/ESNext, composite/declarations, отключает автоматические ambient `@types` через `types: []`, но не задаёт `strict: true`, `noUncheckedIndexedAccess` или `exactOptionalPropertyTypes` в общем base config. Индивидуальные project configs надо проверить отдельно перед окончательным legacy baseline.
- `source/editor/tsconfig.json` использует TypeScript project references. Нельзя менять общий config механически, пока не выявлены межпроектные зависимости и generated declarations.
- `source/editor/tslint.json` и `source/editor/lint.sh` сохранились, но TSLint отсутствует в текущем `source/editor/package.json` и не вызывается CI. Скрипт использует `npx tslint`, поэтому это не воспроизводимая рабочая lint-команда текущего manifest. Считать TSLint **остатком legacy tooling**, а не активным quality gate.
- Root manifests include ESLint/typescript-eslint, Prettier, Knip and dependency-cruiser. New Host uses scoped TypeScript/domain tests and Playwright browser acceptance. Knip/dependency-cruiser remain report-oriented where documented; no repository-wide legacy Colibri lint rewrite is implied.
- В дереве есть два основных test scripts. Большое количество файлов в `tests/workspace/test-typescript` — fixture проекта и regression fixtures, но само по себе оно не означает, что каждый fixture автоматически тестируется.

## Найденные gaps и минимальные решения

| Приоритет | Gap | Минимальное действие | Gate |
|---|---|---|---|
| P0 | Для нового и целенаправленно изменяемого Codogma-owned кода нет воспроизводимого quality loop | Ограниченный toolchain pilot: strict TS для новых модулей, ESLint/typescript-eslint, Prettier check, адресные unit/regression tests и locked dependencies; применять к editor modernization scope по мере внедрения | Не расширять соответствующий новый/изменяемый scope, пока его clean install/check/tests не проходят; не запускать массовый lint rewrite всего legacy дерева |
| P0 | Filesystem TOCTOU закрыт лишь для отдельных content writes | `openSafeProjectFileForWrite` validates descriptor before truncation/write; path-based folder creation, rename/copy/move/delete still need OS-aware mutation strategy and adversarial concurrent-race tests | До новых server write APIs / Package Manager file operations |
| P0 перед non-loopback exposure mini-services | Standalone MCP/AI Chat реализуют local-first defensive defaults, но не являются аутентифицированными публичными API; entry points не покрыты main-server security smoke | `phaser-editor-mcp`: loopback bind по умолчанию, Host/Origin allow-list, HTTP/WS limits and caps; `ai-chat`: loopback bind, Host/Origin, body/message caps, timeout/rate limit. Env vars `MCP_BRIDGE_HOST`/`AI_CHAT_HOST` позволяют менять bind; Origin/Host не заменяют authentication | Не публиковать и не bind-ить сервисы на non-loopback до отдельной auth/authorization design и service-specific regression tests. Main server CI не доказывает безопасность standalone entry points |
| P0 | Несколько изменённых codegen/runtime функций не имеют browser acceptance | FX/Box2D/asset/codegen regression fixtures и журнал ручной проверки | До закрытия соответствующих пунктов backlog и заявления о готовности этих функций |
| P1 | MCP smoke покрывает только узкий набор | Тесты optional/nested arguments и типовых response/error paths для risk-based набора tools | Перед обновлением MCP/Zod contract |
| P1 | Нет активного dead-code/dependency-boundary анализа | Knip + dependency-cruiser в report mode, корректно задав legacy/generated/dynamic plugin entry points | Сначала report, не blocking для legacy |
| P1 | Нет унифицированного format/lint gate | ESLint + Prettier только в новом Codogma-owned scope; CI ratchet запрещает новые warnings в изменяемом scope | После успешного pilot |
| P2 | Остатки TSLint вводят в заблуждение и могут вызвать сетевой npx fallback | Удалить `lint.sh`/`tslint.json` после фиксации перехода или явно оставить только для временного pinned toolchain; предпочтительный путь — не восстанавливать TSLint, а перейти на выбранный ESLint pilot | Отдельное маленькое cleanup change |
| P2 | Metadata root/editor всё ещё содержит исторические Phaser Editor wording/repository origin | Синхронизировать описания package metadata с Codogma; сохранить attribution/license notices | Не блокирует разработку, но исправить до публикации пакетов |

## Правила обновления baseline

1. Новый Core и новые packages имеют собственные строгие config/quality gates. Для модернизации существующего editor quality checks добавляются поэтапно в новом/изменяемом Codogma-owned scope; не делать массовый lint/format rewrite legacy editor.
2. Knip/dependency-cruiser первоначально работают в report mode. Настроить generated output, dynamic plugin registry и scripts entry points до включения blocking check.
3. Локальные и CI результаты фиксировать вместе с точным commit SHA и командами. Если проверка не запускалась или была skipped, указывать это явно.
4. Успешные сборка/typecheck/server smoke не заменяют unit tests, browser acceptance, security regression или production build evidence.
