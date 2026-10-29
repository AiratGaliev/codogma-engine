# Baseline качества кода и проверок

**Базовый снимок `dev`:** `3351b069a11c7992fb28324ae22b48a411f307c7`, 29.10.2026. SHA `754edaa…` относится к историческому baseline PR #10. CI Fast PR #21 был успешен на head `bb9de8d2211947e196cf955f012bc4ee18537cbe`; это не runtime acceptance и не статус будущего head.  
**Охват:** manifests, TypeScript configs, workflows, test scripts и ключевые server/MCP paths. Полный построчный lint/security review всех legacy-файлов не выполнялся.

## Фактические CI/local checks

| Проверка | Текущая реализация | Что она подтверждает | Чего не подтверждает |
|---|---|---|---|
| Root install | `npm ci` в `.github/workflows/ci.yml` | Воспроизводимую установку по root lockfile | Корректность каждой MCP tool schema или всех транзитивных packages |
| Root dependency audit | `npm audit --audit-level=low` | Известные npm advisory по текущему lockfile и базе npm на момент выполнения | License audit, неизвестные уязвимости, race/security semantics |
| Editor install/audit | `npm ci` и `npm audit --audit-level=low` в `source/editor` | Установку и advisory scan editor lockfile | Runtime/visual correctness |
| Editor build/typecheck | `npm run build` → `tsc -b` | Компиляцию существующих TypeScript project references | Полный строгий режим, покрытие runtime-ветвей, browser acceptance |
| Server smoke | Запуск `server/server.mjs`, HTTP-запрос к editor/product и editor page | Сервер стартует и отдаёт ключевые ресурсы | Полную безопасность file API или корректность игры в browser |
| Security smoke | `npm run test:security` → `tests/security-smoke-test.mjs` | Loopback/Host/Origin guards, перечисленные существующие/dangling symlink и upload сценарии, внешний config symlink, MCP compatibility smoke | Гонку TOCTOU между проверкой пути и файловой операцией; все write tools; все MCP argument schemas |
| MCP E2E | `npm run test:e2e` → `tests/mcp-e2e-test.mjs`; workflow ограничен PR в `test`/`main` и manual dispatch | Инициализацию MCP, список tools и отдельные сценарии scene-create/add-object/prefab/texture-size | UI/browser acceptance по умолчанию; полный набор tools; FX/Box2D runtime |
| Browser acceptance | Ручной процесс в README и roadmap | Только если записан конкретный результат по конкретной функции | Не автоматизирован текущим CI как полное покрытие редактора |

На PR #10 GitHub Actions CI Fast завершился успешно на head `3c96dde67eb865a0ee70fdbd5134ab995f846443`; оба dependency audit сообщили 0 vulnerabilities, editor build, server smoke и security smoke прошли. PR был слит в `dev` как `754edaa1f7313409e99c3462a802d5fd430a9a01`. В доступном evidence нет отдельного повторного запуска workflow на merge commit; не утверждать, что весь CI был запущен повторно после слияния.

## Toolchain baseline

- Root scripts: `start`, `dev`, `mcp`, `mcp:builtin`, `build`, `watch`, `test:e2e`, `test:security`.
- Editor scripts: `start` / `build` / `clean` через TypeScript compiler.
- Editor devDependencies: TypeScript `5.3.3`, `colibri-packer ^1.0.1`.
- `source/editor/tsconfig-base.json` задаёт DOM/ESNext, composite/declarations, отключает автоматические ambient `@types` через `types: []`, но не задаёт `strict: true`, `noUncheckedIndexedAccess` или `exactOptionalPropertyTypes` в общем base config. Индивидуальные project configs надо проверить отдельно перед окончательным legacy baseline.
- `source/editor/tsconfig.json` использует TypeScript project references. Нельзя менять общий config механически, пока не выявлены межпроектные зависимости и generated declarations.
- `source/editor/tslint.json` и `source/editor/lint.sh` сохранились, но TSLint отсутствует в текущем `source/editor/package.json` и не вызывается CI. Скрипт использует `npx tslint`, поэтому это не воспроизводимая рабочая lint-команда текущего manifest. Считать TSLint **остатком legacy tooling**, а не активным quality gate.
- Нет активных scripts/dependencies для ESLint/typescript-eslint, Prettier, Knip, dependency-cruiser или Vitest в root/editor manifests.
- В дереве есть два основных test scripts. Большое количество файлов в `tests/workspace/test-typescript` — fixture проекта и regression fixtures, но само по себе оно не означает, что каждый fixture автоматически тестируется.

## Найденные gaps и минимальные решения

| Приоритет | Gap | Минимальное действие | Gate |
|---|---|---|---|
| P0 | Для нового и целенаправленно изменяемого Codogma-owned кода нет воспроизводимого quality loop | Ограниченный toolchain pilot: strict TS для новых модулей, ESLint/typescript-eslint, Prettier check, адресные unit/regression tests и locked dependencies; применять к editor modernization scope по мере внедрения | Не расширять соответствующий новый/изменяемый scope, пока его clean install/check/tests не проходят; не запускать массовый lint rewrite всего legacy дерева |
| P0 | Файловая проверка и фактическая операция не атомарны | Выбрать race-resistant подход, основанный на реальном открытом target/file handle или эквивалентной OS-гарантии; добавить race regression и описать поддерживаемые платформы | До новых server write APIs / Package Manager file operations |
| P0 перед отдельным запуском mini-services | Два optional мини-сервиса открыты по всем интерфейсам без аутентификации/лимитов | `mini-services/phaser-editor-mcp/index.mjs` вызывает `server.listen(PORT)` без host, отдаёт `Access-Control-Allow-Origin: *` и не лимитирует body; endpoint без auth проксирует инструменты подключённому редактору. `mini-services/ai-chat/index.mjs` также вызывает `.listen(3031)` без host, принимает неограниченное тело и передаёт messages в LLM SDK без auth/rate-limit. Обычный security smoke эти entry points не проверяет | Не запускать эти отдельные сервисы на недоверенной/сетевой среде до loopback-by-default binding, size/time limits, CORS/Origin policy и regression tests. Это не блокирует основной editor server, который явно bind-ится к loopback |
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
