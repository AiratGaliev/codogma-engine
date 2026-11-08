# TypeScript toolchain и package roots — baseline

**Снимок:** ветка `dev`, commit `2eb37fa734e3bcefb2ad6d695bc286af67711ac1` (08.11.2026).  
**Назначение:** фактическая инвентаризация compiler configs, package roots, scripts, lockfiles и entry points перед последующими изменениями toolchain/workspace. Это read-only baseline, а не предложение немедленно унифицировать версии или конфигурации.

## 1. Границы инвентаризации

В активный baseline входят корень репозитория, действующие `packages/*`, единственный Editor Host в `src/editor/`, Node.js server и first-party services. Наличие файла в репозитории само по себе не делает его активным package root.

- `server/` и корневые `tests/` — части root Node.js scope: у них нет отдельных `package.json` и lockfile.
- `mini-services/ai-chat/` — отдельный optional JavaScript service со своими manifest и lockfile.
- `tests/workspace/test-typescript/tsconfig.json` — compiler fixture для workspace tests, не production/build scope.
- `scripts/jsconfig.json` — JavaScript editor configuration, не TypeScript compiler project.
- `source/editor/` физически присутствует в дереве, но не является активным Editor Host или target native toolchain. Его конфигурации и вложенные manifests исключены из активного package/compiler inventory; физическое удаление и provenance audit отслеживаются отдельно в COD-88.
- `.agents/skills/**` и вложенный vendor code — snapshots/third-party материалы, а не first-party runtime packages.

В root нет `tsconfig.json`, поля `workspaces` в `package.json` и единого TypeScript solution/project. Все активные TypeScript configs не содержат поля `references`: зависимости между scopes связываются package manifests, локальными `file:` dependencies и явными npm scripts, а не TypeScript project references.

## 2. Активные package roots и compiler versions

| Root | Source / назначение | TypeScript | Manifest / lockfile | Выходы и публичные entry points |
|---|---|---:|---|---|
| Repository root | Node server, root tests/scripts и общие quality tools; преимущественно `.mjs` | Нет прямой compiler dependency | `package.json` / `package-lock.json` | Server запускается напрямую через Node; root TS build отсутствует |
| `packages/cge/` | Host-neutral Core и Project Model | `5.9.3` | Собственные manifest / lockfile | `tsc` → `dist/`; export `.` → `dist/index.js` + declarations |
| `packages/editor-mcp-server/` | First-party stdio MCP adapter | `6.0.3` | Собственные manifest / lockfile | `tsc` → `dist/`; exports `.`, bin `codogma-editor-mcp-server` → `dist/cli.js` |
| `packages/game-test-bridge-contract/` | Versioned transport-neutral JSON contracts | `6.0.3` | Собственные manifest / lockfile | `tsc` → `dist/`; exports `.` и `./schema/v1` |
| `packages/localization/` | Localization tables, fallback, diagnostics CLI | `5.3.3` | Собственные manifest / lockfile | `tsc` → `dist/`; export `.` → `dist/index.js`; CLI — `bin/validate-localization.mjs` |
| `src/editor/` | Единственный SolidJS Editor Host | `5.9.3` | Собственные manifest / lockfile | Vite → `dist/`; app entry через `index.html` / `src/main.tsx` |
| `mini-services/ai-chat/` | Optional standalone AI Chat backend, JavaScript ESM | Не применяется | Собственные manifest / lockfile | `node index.mjs`; TypeScript build отсутствует |

Итого: **7 действующих npm roots с отдельными lockfiles**, из них **5 TypeScript package/app roots** (`cge`, `editor-mcp-server`, `game-test-bridge-contract`, `localization`, `src/editor`). Root server/tests и optional AI Chat service используют JavaScript. Root package-lock содержит запись TypeScript `6.0.3` с `dev: true`, но root `package.json` не объявляет `typescript` напрямую: эту lockfile-запись нельзя трактовать как root compiler policy.

Основные first-party package dependencies:

- Root → `@codogma/localization` через `file:packages/localization`; root также владеет dependencies server/scripts.
- Editor Host → `@codogma/cge` через `file:../../packages/cge`, `solid-js` и собственные Vite/Vitest/Playwright tools.
- MCP stdio package → `@modelcontextprotocol/server` и `ajv`.
- Game Test Bridge contract → `ajv`; schema/contract package не зависит от Editor Host или Phaser.
- Core — самостоятельный host-neutral package.
- AI Chat — отдельный service с `z-ai-web-dev-sdk`; не является prerequisite для запуска Editor Host.

## 3. TypeScript configurations

Таблица показывает конфигурации активных scopes и различия, существенные для выбора будущей общей конфигурации.

| Config | Compiler profile и module model | Include / test strategy | Особенности |
|---|---|---|---|
| `packages/cge/tsconfig.json` | Strict: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`; ES2022, NodeNext, `types: []` | `src/**/*.ts` | Declaration/maps; `rootDir: src`, `outDir: dist`; без `noUnusedLocals/Parameters` |
| `packages/cge/tsconfig.test.json` | Extends package config; `types: [node]` | Source + `tests/**/*.test.ts` | `rootDir: .`, `outDir: .test-dist`; declaration output disabled |
| `packages/editor-mcp-server/tsconfig.json` | Strict + `noUnusedLocals/Parameters`; ES2022, NodeNext; `types: [node]` | `src/**/*.ts`; tests исключены из TS compile | `noEmitOnError`, declarations, source maps, `skipLibCheck`; tests — MJS / `node:test` after build |
| `packages/game-test-bridge-contract/tsconfig.json` | Strict + `noUnusedLocals/Parameters`; ES2022, NodeNext; `types: []`; `resolveJsonModule` | `src/**/*.ts` и `src/**/*.json` | Emits declarations и JS в `dist/`; JSON schemas входят в package source |
| `packages/game-test-bridge-contract/tsconfig.test.json` | Extends package config; `types: [node]` | Source плюс TS/JSON под `tests/` | Compiles tests в `.test-dist/`; далее `node --test` |
| `packages/localization/tsconfig.json` | Strict; ES2020, NodeNext; `lib: [ES2020]`, `types: []` | `src/**/*.ts`; tests и CLI — MJS | Emits declarations/maps в `dist/`; без `noUnusedLocals/Parameters` |
| `src/editor/tsconfig.json` | Strict + `noUnusedLocals/Parameters`; ES2022, ESNext + Bundler; DOM libs; JSX preserve / `solid-js`; `isolatedModules`, `verbatimModuleSyntax`, `resolveJsonModule`; `noEmit` | Editor source, TS/TSX unit/browser tests, Vite и Playwright configs | Includes `vite/client` и Node types; Host build запускает Core build first, затем Host typecheck и Vite |

Strict profiles повторяются, но **не идентичны**: отличаются target/lib/module resolution, ambient types, unused checks, emit strategy, test compilation, JSON handling и `skipLibCheck`. Нельзя механически объединять их или считать одинаковый `strict` доказательством одинаковой границы компиляции.

### Project references и consumer graph

- В активных configs нет `references` и root solution config для `tsc -b`.
- Core и Editor Host связаны через file dependency и npm scripts. `src/editor` выполняет `build:core` перед `typecheck`, `build`, `test` и dev/test lifecycle hooks; CI отдельно устанавливает и собирает Core перед Host.
- Package-level `extends` у test configs — наследование compiler options, а не межпакетные project references.
- Поэтому единый invocation `tsc -b` не является существующим механизмом проверки репозитория. Его появление требует отдельного design/PoC и проверки output/consumer semantics.

## 4. Scripts и package-owned проверки

### Root scripts

Root manifest объявляет следующие группы:

| Группа | Scripts |
|---|---|
| Runtime/server | `dev`, `start`, `mcp` |
| Editor Host | `dev:editor-host`, `watch`, `build`, `build:editor-host`, `test:editor-host`, `test:editor-host:browser` |
| Localization / MCP | `build:localization`, `test:localization`, `test:localization:project`, `test:localization:acceptance`, `build:mcp`, `test:mcp-package` |
| Root/security tests | `test:unit`, `test:security`, `test:mini-services`, `test:e2e`, `test:all` |
| Quality reports | `lint`, `format`, `format:check`, `knip`, `deps:check` |

Root `build` delegates to Editor Host build. Root manifest не объявляет `typecheck` или standalone `tsc` script. `test:all` — local umbrella, включающий E2E; его наличие не меняет правило, что полный E2E запускается на promotion PR, а не на обычных topic PR.

### Package scripts

- **Core:** `build`, `typecheck` (production + test configs), `test:compile`, `test`, `quality:check`, `benchmark`.
- **Editor MCP:** `build`, `typecheck`, `test`, `check`, `start`, plus `prepare`/`prepack` build hooks.
- **Game Test Bridge contract:** `build`, `typecheck` (production + test configs), `test:compile`, `test`, `quality:check`.
- **Localization:** `build`, `typecheck`, `test`, scoped `lint` и `format:check`, report-only `knip:report` и `deps:report`; `quality:check` объединяет package checks.
- **Editor Host:** `build:core`, `dev`, `typecheck`, `build`, `test` (Vitest), `test:browser` (Playwright), watch scripts.
- **AI Chat:** `dev` и `start`; нет TypeScript/lint/test/build scripts в package manifest.

Manifest — authoritative command source. Отсутствие script означает, что package сейчас не предоставляет эту команду.

## 5. Lockfiles и install topology

Семь независимых npm lockfiles в активных roots:

1. `package-lock.json`
2. `src/editor/package-lock.json`
3. `packages/cge/package-lock.json`
4. `packages/editor-mcp-server/package-lock.json`
5. `packages/game-test-bridge-contract/package-lock.json`
6. `packages/localization/package-lock.json`
7. `mini-services/ai-chat/package-lock.json`

npm Workspaces не настроены. Отдельные lockfiles — текущая архитектура, а не устаревшие дубликаты для удаления в рамках инвентаризации. COD-107 владеет отдельным исследованием npm Workspaces; этот baseline не подразумевает миграцию или консолидацию lockfiles.

## 6. Shared tooling configuration и фактический coverage

| Config | Actual scope на `dev` | Важное ограничение |
|---|---|---|
| `eslint.config.mjs` | Root Node/MJS paths, Localization TS/MJS и явный список TS файлов из `source/editor/` | Не включает `src/editor/`, Core, MCP package и Game Test Bridge TS sources. Содержит также path `mini-services/phaser-editor-mcp/index.mjs`, отсутствующий в текущем tree |
| `knip.json` | Root server/mini-services/tests MJS project и explicit root tool entries | Не сканирует TS package/Host scopes; entries `server/mcp-stdio.mjs` и `mini-services/phaser-editor-mcp/index.mjs` отсутствуют в текущем tree |
| `packages/localization/knip.json` | Localization source, CLI и tests | Единственный first-party TS package с собственным Knip report config |
| `.dependency-cruiser.cjs` | Root `server/`, `mini-services/`, `tests/` | Не анализирует Core, MCP, Bridge Contract или Editor Host |
| `packages/localization/.dependency-cruiser.cjs` | Localization `src/`, report-only | Не задаёт package-boundary checks для остальных TS scopes |
| Root Prettier configs | Explicitly re-included root files после global ignore | Не форматирует все активные TypeScript packages/Host |
| `packages/localization/.prettierrc.json` | Localization files через `format:check` | Аналогичного package-owned format script нет в Core, MCP, Bridge Contract или Host |
| `src/editor/vite.config.ts` | Static SolidJS + Tailwind Vite plugins, Vite/Vitest config | Не является dynamic package/extension loader |
| `src/editor/playwright.config.ts` | Chromium browser tests под `browser-tests/` | Browser acceptance не является обычным topic-PR CI gate |

Root ESLint/Knip references на отсутствующие `mini-services/phaser-editor-mcp/index.mjs` и `server/mcp-stdio.mjs` — config residue, а не evidence активных service/package roots. Текущий tree содержит `mini-services/ai-chat/` и перечисленные `server/*.mjs` modules. Явные ESLint entries в `source/editor/` также находятся вне active native toolchain scope. Эти ссылки зафиксированы для отдельной scoped cleanup; COD-18 не удаляет и не переписывает quality configuration.

## 7. Generated artifacts и dynamic entry points

### Generated outputs

- Core, Editor MCP, Game Test Bridge и Localization компилируют TypeScript в package-local `dist/`.
- Core и Game Test Bridge компилируют TS test code в `.test-dist/`.
- Editor Host использует Vite output в `src/editor/dist/`; Host build предварительно собирает Core.
- `.gitignore` исключает `node_modules/` и все `**/dist/` paths.
- Playwright backend fixture запускает `tests/start-backend.ts` через Node `--experimental-strip-types`: это execution path, а не generated package output.

### Public/dynamic registration surfaces

- npm package entry points объявлены явно через `main`, `types`, `exports` и (для MCP package) `bin`. В active package-root manifests/configs не обнаружен filesystem/glob-based npm plugin auto-discovery.
- `server/mcp.mjs` строит tool catalogue из статических `defTool`/`nativeTool` registrations и explicit supported-tool allowlists. `tools/list` сериализует эту map; сервер не обнаруживает установленные npm packages и не импортирует произвольные editor extensions.
- Vite config явно перечисляет SolidJS и Tailwind plugins. Discovery Vite plugins по project packages не настроен.
- ADR-0003 описывает будущий Editor Extension API и package entry-point/activation model. Это target architecture, а не реализованные package discovery или runtime plugin loading.

Текущая реализация имеет explicit package/application entry points и generated build directories, но не general dynamic first-party plugin loader. Dynamic imports/generated registries следует включать в Knip/dependency analysis по мере появления реального implementation и соответствующего entry-point contract.

## 8. CI mapping (Node.js 22)

В текущем `.github/workflows/ci.yml` два relevant jobs:

- **`fast-checks`:** устанавливает root, AI Chat, Localization, Core и Editor MCP dependencies из их lockfiles; запускает root unit/security и mini-service security checks; Localization quality/report + project/runtime diagnostics; Core quality checks и ComponentWorld benchmark; Editor MCP build/tests.
- **`editor-host`:** условно запускается для Host/Core/server paths; отдельно устанавливает root, Core и Host dependencies, собирает Core и Host, проверяет Vite resolution `@codogma/cge`, затем запускает Host domain tests. Этот job не запускает Playwright browser tests на topic PR.
- **Нет отдельного текущего CI шага:** `packages/game-test-bridge-contract/` имеет build/typecheck/test scripts и committed lockfile, но workflow не содержит package-specific install, test, cache или audit scope для него.
- CI workflow не вызывает root `npm run lint`, root `format:check`, root `knip` или root `deps:check`. Localization lint/format и report commands выполняются через её `quality:check`/`quality:report`.
- Full Host/MCP E2E и formal browser/runtime acceptance следуют `docs/engineering-workflow.md`: запускаются на integrated `dev → test` promotion candidate, а не как full-suite gates каждого topic PR.

Это описание committed workflow на snapshot SHA выше; оно не утверждает, что каждый объявленный package script выполняется CI.

## 9. Initial toolchain scope и target boundary

### Уже выполненный scoped pilot

COD-19 закрепил первым ограниченным pilot package `packages/localization/`, а не repo-wide compiler/lint migration:

| Tool | Version на snapshot | Ownership / actual use |
|---|---:|---|
| TypeScript | `5.3.3` | Direct devDependency и package-local lockfile Localization |
| ESLint | `10.13.0` | Root devDependency; scoped ESLint config включает Localization TS/MJS |
| typescript-eslint | `8.72.1` | Root devDependency; Localization использует `tseslint.configs.recommended` без type-aware project service |
| Prettier | `3.9.10` | Root devDependency; Localization имеет свой format config и package `format:check` |
| Knip | `6.43.0` | Root devDependency; Localization scoped `knip:report`, report-only |
| dependency-cruiser | `18.7.0` | Root devDependency; Localization scoped `deps:report`, report-only |
| Tests | Node.js `node:test` | Package-owned tests; no second test runner in this pilot |

Версии shared quality tools закреплены в root manifest/lockfile; compiler Localization закреплён отдельно в package manifest/lockfile. COD-19 подтверждает этот pilot scope, но не распространяет его quality gates автоматически на Core, MCP, Bridge Contract или Editor Host.

### Целевой baseline для действующих roots

С учётом ADR-0002 и результата COD-19 целевая модель для нового/изменяемого first-party TS scope такова:

1. TypeScript compiler и его lockfile принадлежат конкретному package root; root lockfile не подменяет compiler dependency package.
2. Каждый TS scope имеет явный `tsconfig` с базовым strict-набором из ADR-0002 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`). `noUnusedLocals/Parameters` добавляются, если scope позволяет; generated/interop исключения должны быть локальными и обоснованными.
3. Package manifest объявляет воспроизводимые build/typecheck/test commands и явные public exports. Tests используют runner, принадлежащий package contract: Node `node:test` или существующий Host Vitest; Playwright остаётся browser acceptance layer.
4. Shared ESLint/typescript-eslint и Prettier могут оставаться в root tooling lockfile, но каждый scope обязан явно попасть в lint/format patterns и CI. Установка tool в root не означает его фактическое покрытие.
5. Knip и dependency-cruiser остаются report-only до проверки dynamic entry points/generated output и triage findings; они не объявляются repo-wide gates по факту наличия конфигурации.
6. CI устанавливает и проверяет именно затронутые package roots. Не подменять missing package-specific job успешным root/Host job.

На snapshot это целевая политика, а не уже повсеместно достигнутое состояние: текущие TS configs, ESLint/Prettier scopes и CI gaps перечислены выше.

### Отдельный cleanup вне COD-18

`source/editor/lint.sh` и `source/editor/tslint.json` существуют только внутри исключённого исторического дерева `source/editor/`. Они не являются действующими toolchain scripts/configs для root, `packages/*` или `src/editor/`; их cleanup должен идти отдельно после pilot и в контексте COD-88, а не расширять native quality scope.

## 10. TypeScript 5.3.3: compatibility и upgrade constraints

Pin `5.3.3` принадлежит только `packages/localization/` и отражает исходный COD-19 pilot baseline. Это **не repository-wide minimum или maximum**: Core и Editor Host используют `5.9.3`, Editor MCP и Game Test Bridge — `6.0.3`.

Для последующего compiler change:

1. Обновлять compiler в package, который им владеет, и менять его committed lockfile; не выводить compiler version из root lockfile's non-direct TypeScript record.
2. Проверять фактические target/module/lib profile и public output compatibility. Localization сейчас emits ES2020/NodeNext JS + declarations; смена compiler не должна молча менять этот output contract.
3. Запускать package-owned clean install, typecheck/build и tests на Node.js 22 CI baseline. Для Localization включать `quality:check`, `quality:report` и root project/runtime localization acceptance commands.
4. Повторно проверять downstream consumers, особенно root `file:` dependency и Host/Core package-resolution/build flow там, где package потребляется. Межпакетного TypeScript project-reference graph сейчас нет.
5. Не выполнять массовое выравнивание compiler versions или strict flags в COD-18. Различия — часть baseline; общая config/compiler migration требует отдельного compatibility plan и evidence.

Snapshot показывает, что более новые compiler versions уже используются в независимых package scopes, но сам по себе не доказывает безрисковость обновления Localization с 5.3.3 или пригодность 6.0.3 как единого target.

## 11. Findings и follow-up boundaries

| Finding | Evidence | Consequence / owner boundary |
|---|---|---|
| Несколько npm roots и lockfiles; workspaces отсутствуют | 7 manifests/lockfiles; нет root `workspaces` | Сохранять текущую topology, пока COD-107 PoC не подтвердит clean install, build и release behavior |
| Нет TypeScript project-reference graph | Нет `references` в active TS configs | Не считать, что root `tsc -b` проверяет все packages |
| Compiler versions отличаются по packages | Localization 5.3.3; Core/Host 5.9.3; MCP/Bridge 6.0.3 | Сохранять package-scoped compiler choice до отдельного compatibility study |
| TS quality coverage неоднороден | Scoped ESLint/Prettier/Knip/dependency-cruiser configs | Расширять gates после package baseline и согласования CI ownership |
| Game Test Bridge scripts не подключены к CI | Package manifest/lockfile vs `.github/workflows/ci.yml` | Добавить package CI/audit coverage отдельным scoped change |
| Root ESLint/Knip содержат отсутствующие service paths | Current tree vs config file lists | Исправлять после подтверждения отсутствующих generated entry-point contracts |

## Sources inspected

- `README.md`, `BUILD.md`, `AGENTS.md`, `docs/agent-skills.md`.
- Root и active package `package.json` / `package-lock.json`.
- Active `tsconfig.json` и `tsconfig.test.json`, `scripts/jsconfig.json`, workspace TS fixture.
- `eslint.config.mjs`, `knip.json`, `.dependency-cruiser.cjs`, Prettier configs, Vite/Playwright config, `.gitignore`.
- `.github/workflows/ci.yml`, `docs/code-quality-baseline.md`, `docs/dependency-capability-matrix.md`, ADR-0002, ADR-0003 и `docs/engineering-workflow.md`.

**Verification boundary:** это source/configuration inventory по exact GitHub `dev` tree и file contents на snapshot SHA. Локальные npm install, compiler invocation, tests, benchmark и build при снятии read-only baseline не выполнялись.
