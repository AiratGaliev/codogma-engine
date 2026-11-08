# Baseline качества кода и проверок

**Обновлено:** 08.11.2026.  
**Охват:** активные native package roots, TypeScript configs, CI workflows, unit/contract/security tests и ключевые server/MCP paths. Это engineering baseline; он не подтверждает полную browser/runtime acceptance или performance measurements.

## Активные package roots и проверки

| Проверка | Текущая реализация | Что подтверждает | Чего не подтверждает |
|---|---|---|---|
| Root install | `npm ci` по root lockfile | Воспроизводимую установку root/server dependencies | Корректность всех package-specific и транзитивных контрактов |
| Root dependency audit | `npm audit --audit-level=low` в CI Fast | Известные npm advisories для root lockfile на момент выполнения | License/provenance review, неизвестные уязвимости, race/security semantics |
| Editor Host install/build | Отдельный package в `src/editor/`; committed `src/editor/package-lock.json`; CI использует lockfile install, typecheck и Vite production build | Воспроизводимую установку Host dependencies, проверку TS/TSX source и production bundle | Полный user workflow/runtime acceptance, target-browser/mobile matrix |
| Editor Host domain tests | Vitest `tests/**/*.test.ts`; package `test` script | Domain/model/service unit и integration regression | Полный Playwright/browser workflow |
| Editor Host browser tests | Playwright `browser-tests/**/*.spec.ts`; package `test:browser` script | Реальное Chromium поведение реализованных сценариев | Все браузеры, ОС, mobile devices и специализированные capabilities |
| Codogma Core | `packages/cge/` build/typecheck/test steps в CI Fast | Project Model v1 contracts, validation, serialization, ComponentWorld lifecycle и regressions | Runtime adapter, Scene Loader, Preview и Build parity |
| Server smoke | Запуск `server/server.mjs`, обращение к native Editor Host/MCP status endpoints | Server startup, native routing и loopback request flow | Полную безопасность всех mutation paths и пользовательскую game/runtime корректность |
| Security smoke | `tests/security-smoke-test.mjs` и mini-service security suite | Loopback/Host/Origin guards, symlink containment, request limits, project-file boundaries, MCP/AI Chat security cases | Adversarial TOCTOU race across path-based mutation syscalls; все permutations MCP argument schemas |
| MCP contracts | Engine registry/schema tests, Host bridge-routing tests и first-party stdio adapter tests | Native tool schemas, argument validation, session-correlated routing, stdio forwarding и external-asset inspection contracts | Полный живой browser workflow по каждому tool или multi-Host concurrency acceptance |
| Full MCP/Playwright E2E | Promotion workflow на `dev → test`, далее release-promotion PR | Интеграционное поведение на одном собранном candidate SHA | Не запускается как gate каждого topic PR в `dev` |
| Independent functional acceptance | Отдельные CODQA issues на точном integrated `test` SHA | Только сценарии/evidence, записанные в QA issue | Не следует из зелёного CI Fast или успешной сборки |

CI Fast и Editor Host job являются быстрыми инженерными checks. Полный E2E suite запускается на promotion candidate согласно [engineering workflow](engineering-workflow.md); ручная/browser/runtime acceptance выполняется независимо командой CODQA.

## Toolchain baseline

- Root scripts: `start`, `dev:editor-host`, `build`, `build:editor-host`, `watch`, `test:e2e`, `test:security`; root `build` и `watch` направлены на единственный native Editor Host.
- Editor Host scripts в `src/editor/package.json`: `dev`, `typecheck`, `build`, `test`, `test:browser`; root shortcuts: `dev:editor-host`, `build:editor-host`, `test:editor-host`, `test:editor-host:browser`.
- Editor Host dependencies: SolidJS `1.9.16`; devDependencies include TypeScript `5.9.3`, Vite `8.3.5`, `vite-plugin-solid 2.11.14`, Tailwind CSS `4.3.3`, `@tailwindcss/vite 4.3.3`, Vitest `5.0.5`, Node types and Playwright `1.64.1`.
- Host-owned implementation, tests and supported tool configs are TypeScript/TSX. `src/editor/tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `noUnusedLocals` and `noUnusedParameters`.
- Root manifests include ESLint/typescript-eslint, Prettier, Knip and dependency-cruiser. Knip/dependency-cruiser remain report-oriented where documented; a report does not imply a repo-wide blocking policy.
- `packages/cge/`, `packages/editor-mcp-server/`, `packages/localization/` and `mini-services/ai-chat/` retain independent package boundaries where declared. npm Workspaces are not enabled.

## Быстрый локальный engineering loop

Из корня репозитория:

```bash
npm ci
npm --prefix src/editor ci
npm run build
npm --prefix src/editor run typecheck
npm --prefix src/editor run test
npm run test:security
```

For Core and MCP packages, use the scripts declared in each package manifest. Do not infer a test/build command from a package name; confirm the script exists first.

## Найденные gaps и минимальные решения

| Приоритет | Gap | Минимальное действие | Gate |
|---|---|---|---|
| P0 | Filesystem TOCTOU закрыт лишь для отдельных content writes | `openSafeProjectFileForWrite` validates descriptor before truncation/write; path-based folder creation, rename/copy/move/delete still need OS-aware mutation strategy and adversarial concurrent-race tests | До передачи новых mutation APIs / Package Manager filesystem operations |
| P0 перед non-loopback exposure AI Chat | Optional AI Chat backend реализует local-first defensive defaults, но не является аутентифицированным публичным API | Сохранять loopback bind, Host/Origin validation, body/message caps, timeout/rate limit; для non-loopback нужен отдельный auth/authorization design и service-specific regression tests | Не публиковать standalone AI Chat entry point без отдельной security review |
| P0 | Некоторые runtime capabilities требуют browser acceptance | FX/Box2D/asset/codegen native fixtures, Preview/runtime lifecycle tests и журнал ручной проверки | До заявления о готовности соответствующих user workflows |
| P1 | Live MCP coverage не доказывает все UI-dependent workflows | Contract/schema tests на каждый tool group; promotion E2E для live Scene/Node/Prefab/Component/FX/screenshots; multi-Host session acceptance в COD-85 | Перед расширением или изменением native MCP contracts |
| P1 | Нет полного mobile/target-browser matrix для Editor Host | Добавлять browser coverage по поддерживаемой browser/OS/device matrix, не заявляя Chromium coverage как универсальную совместимость | Перед release readiness соответствующих UI capabilities |
| P2 | Root/Host formatting и lint gates ещё не покрывают все активные native packages одинаково | Расширять ESLint + Prettier ratchet и CI package scope постепенно, без массовых непросмотренных rewrites | После clean install, scoped test и report review |
| P2 | Metadata descriptions и notices пакетов должны соответствовать актуальному ownership | Сверять package descriptions, exports, repository URLs и attribution с current native package boundaries | До публикации пакетов |

## Правила обновления baseline

1. Любой новый first-party production/test/tooling scope следует TypeScript source policy из ADR-0002 и получает соответствующий strict tsconfig.
2. Knip/dependency-cruiser первоначально работают в report mode. Настроить generated output, dynamic registry entry points и scripts до включения blocking check.
3. Локальные и CI результаты фиксировать вместе с точным commit SHA и командами. Если проверка не запускалась или была skipped, указывать это явно.
4. Успешные build/typecheck/server smoke не заменяют unit tests, browser acceptance, security regression или production runtime evidence.
5. Полный E2E запускать по правилам promotion `dev → test`; не переносить полный E2E suite на каждый topic PR.
