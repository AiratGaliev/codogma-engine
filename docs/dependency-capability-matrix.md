# Матрица зависимостей и capabilities

**Scope note:** эта матрица перечисляет direct package roots и пути поставки bundle; это не текущий SBOM или scan каждого нового head. Наличие `PhaserBox2D.js` в test fixture не доказывает совместимость любой внешней версии runtime/helper.
**Статус:** первоначальная инвентаризация непосредственных зависимостей и путей доставки. Это не полный SBOM и не юридическое заключение по лицензиям всех транзитивных пакетов.

## Активные package roots

| Package root | Прямые зависимости / инструмент | Версия в manifest | Назначение / scope | Следствие для разработки |
|---|---|---|---|---|
| Корень репозитория | `@phaserjs/editor-mcp-server` | `^1.0.6` | Official MCP stdio implementation / tool schemas, подключён к локальному MCP bridge | Проверка в `npm run test:security` подтверждает initialize/tools/list и один вызов; не покрывает все tools/schema combinations |
| Корень репозитория | `zod` override для `@phaserjs/editor-mcp-server` | `4.6.7` | Зафиксированная совместимость с Zod override | Не обновлять без MCP integration/security regression и проверки nested/optional arguments |
| `source/editor` | `typescript` | `5.3.3` | Dev dependency, `tsc -b` и TypeScript project references для существующего UI client | Эта версия не определяет toolchain Core или SolidJS Host |
| `source/editor` | `colibri-packer` | `^1.0.1` | Resource/atlas packing tooling для существующего UI client | UI-only dependency; её удаление относится к физическому удалению UI client после COD-88 |
| `src/editor` | `solid-js` | `1.9.15` | Независимый SolidJS Editor Host | UI/reactivity layer; не зависит от Colibri и не включает его controls/registry |
| `src/editor` | `vite`, `vite-plugin-solid`, `tailwindcss`, `@tailwindcss/vite`, `typescript`, `@playwright/test` | `8.3.5`, `2.11.14`, `4.3.3`, `4.3.3`, `5.9.3`, `1.64.1` | Host dev/build/typecheck и Chromium browser tests | Собственный package/lockfile; CI job editor-host; не смешивать с root dependencies без отдельного workspace decision |
| `mini-services/ai-chat` | `z-ai-web-dev-sdk` | `^0.0.18` | Необязательный отдельный LLM backend | Не является обязательной зависимостью старта IDE; нужен отдельный security/privacy/dependency review перед production exposure |
| Editor/runtime artifacts | Phaser runtime bundle | `4.2.1` (вендорный) | `scripts/phaser.min.js` production и `scripts/phaser.js` development, подключаются через editor plugin | Текущий путь использует full bundle; upstream v4.2.1 содержит отдельный UMD `phaser-arcade-physics(.min)` без Matter.js, но package root не объявляет public `exports` subpath для Arcade-only artifact. ESM entry point не доказывает tree shaking; feature-pruned output не доказан |
| Native Box2D runtime integration | `@phaserjs/phaser-box2d` / selected runtime helper modules | Runtime dependency | Physics API used by the native Phaser adapter | Runtime provider/version must be explicit in the native Project/Build dependency graph. Ambient declarations do not provide runtime implementation; browser acceptance is required. |
| Existing UI client | Existing editor UI source | Existing source tree | `source/editor/` and its UI packages | Preserve applicable upstream notices and license compliance until the UI client is removed through COD-87/COD-88 |
| Root + SolidJS Host | ESLint/typescript-eslint, Prettier, Knip, dependency-cruiser, strict TypeScript and test tooling | Root quality tools in root manifest; Host TypeScript 5.9.3, Node node:test, Playwright 1.64.1 in src/editor | Scoped checks for engine-owned modules and Host | Extend only within reviewed scopes and confirm dynamically loaded entry points before making checks blocking |

## Planned optional runtime packages — не активные зависимости

Следующие package boundaries утверждены архитектурно, но на момент этой ревизии **не существуют в `packages/` и не являются активными npm dependencies**:

| Package | Status | Intended scope | Dependency / exclusion rule | Linear owner |
|---|---|---|---|---|
| `@codogma/ecs` | Planned — Todo | Optional, host-neutral Data-Oriented ECS runtime | Dependency boundary and host-neutral constraints: ADR-0004 | [COD-111](https://linear.app/codogma-engine/issue/COD-111/sozdat-nezavisimyj-optional-codogmaecs-package-s-data-oriented-storage) |
| `@codogma/ecs-phaser` | Planned — Backlog | Optional ECS ↔ Phaser 4 adapter | Optional adapter boundary and base-runtime independence: ADR-0004 | [COD-112](https://linear.app/codogma-engine/issue/COD-112/sozdat-optional-codogmaecs-phaser-adapter) |

Таблица выше — инвентаризация package roots, статусов и владельцев. ECS feature IDs/providers, opt-in/dependency relationships, mapping между object/component Core и runtime ECS, а также правила физического исключения optional code из Release определены только [ADR-0004](decisions/ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md).

## Phaser 4.2.1 bundle analysis constraints

- Codogma's current integration is a vendored full Phaser bundle, not a tree-shaken npm ESM consumer.
- Upstream v4.2.1 offers the separate UMD `phaser-arcade-physics` variant, which excludes Matter.js; the package manifest's root ESM export is a bundled artifact and does not prove internal dead-code elimination.
- No public package `exports` subpath for the Arcade-only file is declared in the checked v4.2.1 manifest. Do not invent an import path. Any direct artifact consumption or custom build needs a reproducible fixture and explicit distribution contract.
- Compare API coverage, generated code compatibility, external helper requirements, raw/gzip size, parse/startup and browser behavior before choosing a new delivery path. Until then the current vendor bundle remains the verified integration path, and its feature-pruning is unverified.

## Lockfiles и установка

- У root проекта, legacy `source/editor` и нового `src/editor` свои `package.json` и `package-lock.json`; отдельные lockfiles также есть у mini-services и packages. Новый Host уже является самостоятельным package root. npm Workspaces и единая консолидация lockfile не включены.
- npm Workspaces в текущем `dev` не объявлены. Единый workspace graph и консолидация lockfiles — отдельный PoC/migration, а не текущая реализация.
- CI в PR #10 запускал `npm ci` и `npm audit --audit-level=low` для root и editor dependency trees и сообщил `0 vulnerabilities` на зафиксированном head `3c96dde67eb865a0ee70fdbd5134ab995f846443`. PR #10 затем был слит в `dev` как `754edaa1f7313409e99c3462a802d5fd430a9a01`. Это временной снимок vulnerability database, а не гарантия отсутствия неизвестных проблем и не аудит лицензий.
- В этой ревизии не выполнялись новые `npm ci`, `npm audit` или license scanner локально; используются опубликованные CI results PR #10 и manifests в текущем `dev`.
- Direct dependencies в таблице перечислены по текущим manifests. Транзитивные версии и integrity hashes находятся в lockfiles; до публикации и крупных dependency upgrades требуется отдельная SBOM/license/provenance проверка с результатом в PR.

## Отложенные решения / обязательные gates

1. Перед toolchain pilot для нового/изменяемого Codogma-owned scope сверить совместимые версии TypeScript, ESLint/typescript-eslint, Prettier, Knip, dependency-cruiser и Vitest на Node.js 22, установить lockfile и проверить clean install. Не требуется ждать начала Core, чтобы применить проверки к отдельной editor-модернизации.
2. Не подменять `npm audit` лицензионным/provenance review: это разные проверки.
3. Проверить root override Zod 4.6.7 на все используемые схемы MCP прежде, чем обновлять официальный пакет или Zod.
4. Перед решением о Phaser modularization сделать один воспроизводимый build fixture: сравнить API coverage, runtime dependencies и raw/gzip размер, проверить generated game без editor UI.
5. Перед npm Workspaces отдельно проверить TypeScript references, root/editor scripts, server path, release ZIP, CI/cache paths и чистую установку; не удалять editor lockfile до зелёного PoC.
6. Не передавать Package Manager файловые операции до закрытия остаточного filesystem TOCTOU: content-file write paths уже проверяют открытый descriptor, но folder creation/rename/copy/move/delete остаются pathname-based. Нужны OS-aware mutation design и adversarial concurrent-race tests либо документированная модель угроз с ограничением экспозиции.
