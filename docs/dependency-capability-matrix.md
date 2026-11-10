# Матрица зависимостей и capabilities

**Scope:** активные first-party package roots, непосредственные dependencies и пути разработки/поставки. Это не полный SBOM и не юридическое заключение по всем транзитивным пакетам.
**Статус:** inventory по manifests и lockfiles текущей native architecture. Конкретные версии сверяются с package manifests и lockfiles при каждом изменении. Подробная карта TypeScript configs/scripts и compiler versions приведена в [TypeScript toolchain baseline](typescript-toolchain-baseline.md).

## Активные package roots

| Package root | Прямые зависимости / инструмент | Версия в manifest | Назначение / scope | Следствие для разработки |
|---|---|---|---|---|
| Корень репозитория | dotenv, @codogma/localization; ESLint, Prettier, Knip, dependency-cruiser и TypeScript tooling | См. package.json и package-lock.json | Native Node server, root scripts, repository quality gates | Root build/watch направлены на единственный native Editor Host; не устанавливает UI runtime другого приложения |
| src/editor | solid-js | 1.9.16 | Единственный SolidJS Editor Host | UI/reactivity layer; root workspace package, dependencies resolved from root lockfile |
| src/editor | vite, vite-plugin-solid, tailwindcss, @tailwindcss/vite, typescript, @playwright/test, vitest | См. src/editor/package.json | Host development/build/typecheck, domain tests and browser acceptance | Root workspace package; Editor Host checks remain a separate CI job |
| packages/cge | TypeScript toolchain | См. packages/cge/package.json | Host-neutral Project Model v1, validation/serialization, Component Schema/Registry/World | Core remains independent of UI framework, browser DOM and Phaser-specific runtime objects |
| packages/editor-mcp-server | @modelcontextprotocol/server, ajv | 2.4.0, 8.20.0 | First-party stdio adapter and Ajv validation against engine-owned native JSON Schemas | Root workspace package and root lockfile; tool registry, system instructions and execution remain in server/mcp.mjs |
| packages/game-test-bridge-contract | ajv | 8.20.0 | Versioned transport-neutral JSON contract and schema package for Game Test Bridge | Root workspace package and root lockfile; CI runs dedicated build/typecheck/test and consumer checks |
| packages/localization | Localization package dependencies | См. package manifest | Versioned localization tables, fallback, validation and CLI | Root workspace package and root lockfile; does not introduce a second Editor UI |
| mini-services/ai-chat | z-ai-web-dev-sdk | ^0.0.18 | Optional standalone LLM backend | Separate loopback service; not required to boot the Editor Host; independent security/privacy/dependency review before external exposure |
| Native Phaser runtime | Phaser 4.2.1 | Runtime target | HTML5 game runtime and Scene/Preview integration | Runtime adapter, artifact provenance, selected build variant and external runtime dependencies must be explicit and verified on native project fixtures; a TypeScript declaration alone does not provide runtime code |
| Native Physics integration | @phaserjs/phaser-box2d / selected runtime helper modules | Target/provider versions owned by Physics integration | Native Physics Component and Phaser adapter | Provider/version must be explicit in the native Project/Build dependency graph; browser acceptance is required |
| Root + native packages | ESLint/typescript-eslint, Prettier, Knip, dependency-cruiser, strict TypeScript and test tooling | См. root and package manifests | Quality gates for first-party code and package boundaries | Expand checks only within reviewed scopes and verify dynamic entry points before turning report-only checks into blocking gates |

## Planned optional runtime packages — не активные зависимости

Следующие package boundaries утверждены архитектурно, но на момент этой ревизии **не существуют в packages/ и не являются активными npm dependencies**:

| Package | Status | Intended scope | Dependency / exclusion rule | Linear owner |
|---|---|---|---|---|
| @codogma/ecs | Planned — Todo | Optional, host-neutral Data-Oriented ECS runtime | Dependency boundary and host-neutral constraints: ADR-0004 | [COD-111](https://linear.app/codogma-engine/issue/COD-111/sozdat-nezavisimyj-optional-codogmaecs-package-s-data-oriented-storage) |
| @codogma/ecs-phaser | Planned — Backlog | Optional ECS ↔ Phaser 4 adapter | Optional adapter boundary and base-runtime independence: ADR-0004 | [COD-112](https://linear.app/codogma-engine/issue/COD-112/sozdat-optional-codogmaecs-phaser-adapter) |

Таблица выше — inventory package roots, статусов и владельцев. ECS feature IDs/providers, opt-in/dependency relationships, mapping между object/component Core и runtime ECS, а также правила физического исключения optional code из Release определены только [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md).

## Phaser 4.2.1 bundle analysis constraints

- Phaser 4.2.1 является выбранным HTML5 runtime target.
- Upstream v4.2.1 предлагает отдельный UMD phaser-arcade-physics variant, который исключает Matter.js; root ESM export не доказывает internal dead-code elimination.
- Не предполагать, что наличие модульных исходников означает selective bundling или физическое исключение неиспользуемых подсистем.
- Любой выбранный artifact/build path должен иметь reproducible native game fixture, API coverage evidence, explicit external dependencies и результаты raw/gzip size, parse/startup и browser runtime checks.
- До принятия такого evidence не заявлять feature pruning или production bundle-size reduction как реализованные возможности.

## Lockfiles и установка

- Активные first-party workspaces используют manifests в root + `packages/*` + `src/editor/` и единый root `package-lock.json`; `mini-services/ai-chat/` остаётся отдельным install root со своим lockfile.
- npm Workspaces объявлены для `packages/*` и `src/editor/`; root `package-lock.json` фиксирует общий workspace graph.
- CI Fast устанавливает root workspace graph и запускает scoped checks для native Host/Core/runtime/server/MCP/localization/service packages. Workspace dependency audit включается при изменении root/package manifests, lockfile или `.npmrc`.
- npm audit не заменяет лицензионный/provenance review.
- Direct dependencies перечислены по текущим manifests. Транзитивные версии и integrity hashes находятся в lockfiles; перед публикацией и крупными dependency upgrades требуется отдельная SBOM/license/provenance проверка с результатом в PR.

## Отложенные решения / обязательные gates

1. Перед крупным toolchain upgrade сверить совместимые версии TypeScript, ESLint/typescript-eslint, Prettier, Knip, dependency-cruiser и Vitest на Node.js 22, установить lockfile и проверить clean install.
2. Не подменять npm audit лицензионным/provenance review: это разные проверки.
3. Проверить root override Zod на все используемые MCP schemas прежде, чем обновлять официальный MCP пакет или Zod.
4. Перед решением о Phaser modularization сделать воспроизводимый build fixture: сравнить API coverage, runtime dependencies и raw/gzip размер, проверить generated game без Editor Host.
5. Перед изменением workspace topology повторно проверить TypeScript references, root/Host scripts, server paths, release ZIP, CI/cache paths и clean install; `mini-services/ai-chat/` остаётся отдельным install root, а workspace package locks не должны дублироваться.
6. Не передавать Package Manager файловые операции до закрытия остаточного filesystem TOCTOU: нужны OS-aware mutation design и adversarial concurrent-race tests либо документированная модель угроз с ограничением экспозиции.
