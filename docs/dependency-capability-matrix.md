# Матрица зависимостей и capabilities

**Базовый снимок `dev`:** `3351b069a11c7992fb28324ae22b48a411f307c7`, 29.10.2026. PR #21 добавляет editor/codegen paths, но не доказывает, что версия внешнего Box2D runtime, его packaging и browser behaviour закреплены в end-to-end fixture. Старые dependency audit результаты не являются текущим SBOM или scan каждого нового head.  
**Статус:** первоначальная инвентаризация непосредственных зависимостей и путей доставки. Это не полный SBOM и не юридическое заключение по лицензиям всех транзитивных пакетов.

## Активные package roots

| Package root | Прямые зависимости / инструмент | Версия в manifest | Назначение / scope | Следствие для разработки |
|---|---|---|---|---|
| Корень репозитория | `@phaserjs/editor-mcp-server` | `^1.0.6` | Official MCP stdio implementation / tool schemas, подключён к локальному MCP bridge | Проверка в `npm run test:security` подтверждает initialize/tools/list и один вызов; не покрывает все tools/schema combinations |
| Корень репозитория | `zod` override для `@phaserjs/editor-mcp-server` | `4.6.7` | Зафиксированная совместимость с Zod override | Не обновлять без MCP integration/security regression и проверки nested/optional arguments |
| `source/editor` | `typescript` | `5.3.3` | Dev dependency, `tsc -b` и TypeScript project references | Это версия текущего legacy editor toolchain, не утверждение о версии для нового Core |
| `source/editor` | `colibri-packer` | `^1.0.1` | Resource/atlas packing tooling | Проверить используемые entry points и packaging при миграции editor/workspaces |
| `mini-services/ai-chat` | `z-ai-web-dev-sdk` | `^0.0.18` | Необязательный отдельный LLM backend | Не является обязательной зависимостью старта IDE; нужен отдельный security/privacy/dependency review перед production exposure |
| `mini-services/phaser-editor-mcp` | `@phaserjs/editor-mcp-server` | `^1.0.6` | Самостоятельный bridge package | Имеет отдельный manifest/lockfile; не смешивать с root server/MCP path без решения |
| `mini-services/phaser-editor-mcp` | `ws` | `^8.22.0` | WebSocket transport standalone bridge | Проверить отдельно, требуется ли поддерживать этот альтернативный bridge в текущем product workflow |
| Editor/runtime artifacts | Phaser runtime bundle | `4.2.1` (вендорный) | `scripts/phaser.min.js` production и `scripts/phaser.js` development, подключаются через editor plugin | Phaser не входит в root/editor npm dependency graph; TypeScript declarations не поставляют runtime; feature-pruned bundle не доказан |
| Текущие сгенерированные игровые проекты (legacy editor/codegen path) | `PhaserBox2D.js` | Внешний runtime-файл | Box2D API/runtime, необходимый отдельным сценариям текущего codegen | Это зависимость текущего legacy-пути, а не требование к будущему data-driven Core по умолчанию. Не считать ambient `phaser-box2d.ts` поставкой runtime; нужна проверка зависимости и acceptance экспортированной игры.
| Legacy editor client | Colibri / Phaser Editor 2D-derived source | Вендорный/сохранённый source tree | `source/editor/plugins/colibri` и `phasereditor2d.*` plugins | Сохранять исходные notices и license compliance; не считать такую vendor dependency управляемой как обычный npm package |
| New/modified Codogma-owned code (editor modernization first; Core later) | Strict TS where appropriate, ESLint/typescript-eslint, Prettier, Knip, dependency-cruiser, test runner | Не внедрено в baseline | Toolchain для нового и целенаправленно изменяемого кода редактора/будущих пакетов | Внедрять постепенно в отдельном pilot и применимом изменяемом scope; не включать repo-wide lint gate на всё legacy-дерево |

## Lockfiles и установка

- У root проекта и `source/editor` свои `package.json` и `package-lock.json`; отдельные lockfiles также есть у mini-services.
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
6. Не передавать пакетному менеджеру файловые операции, пока TOCTOU риск в server file API не закрыт race-resistant механизмом либо не утверждена проверяемая модель угроз.
