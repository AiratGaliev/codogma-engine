# ADR-0002: TypeScript toolchain и постепенное усиление quality gates

**Статус:** принято для нового и постепенно модернизируемого Codogma-owned кода; rollout на всё legacy editor-дерево не выполнен.  
**Дата:** 27.10.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [roadmap](../roadmap.md), [baseline качества](../code-quality-baseline.md), [матрица зависимостей](../dependency-capability-matrix.md).

## Контекст

Текущий editor использует TypeScript 5.3.3 и TypeScript project references. Общий `tsconfig-base.json` не включает строгий профиль TypeScript; часть generated/legacy plugin source имеет собственные ограничения. После PR #10 TSLint удалён из editor package dependencies, но файлы `tslint.json` и `lint.sh` ещё существуют. Сегодня CI не запускает ESLint, Prettier, Knip, dependency-cruiser или отдельный unit-test toolchain для нового Core и целенаправленно изменяемого Codogma-owned scope редактора.

Массовое включение strict/lint/format для более чем тысячи legacy TypeScript-файлов создаст шум и необоснованный рефакторинг. Новый Core должен начать с отдельного строгого scope и измеримого ratchet.

## Решения

### 1. Язык и компилятор

- Новый Codogma Core, Project Model, Runtime Adapter, build tools, platform-neutral contracts и новые самостоятельные editor modules пишутся на TypeScript.
- Для нового scope обязателен отдельный `tsconfig` с `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true` и `forceConsistentCasingInFileNames: true`.
- Compile-time types не являются validation внешних данных. JSON, project files, plugin metadata и SDK responses проверяются runtime-схемой и преобразуются в типизированное состояние.
- Не применять `any`, `@ts-ignore` или non-null assertions, чтобы обойти модель данных. Исключения требуют пояснения и testable reason.
- Версия TypeScript и toolchain packages должна быть закреплена lockfile после проверки совместимости с Node.js 22. Текущий TypeScript 5.3.3 в legacy editor не автоматически является выбранной версией нового Core.

### 2. Инструменты и назначение

| Инструмент | Решение | Первоначальный scope |
|---|---|---|
| ESLint + typescript-eslint | Основной lint toolchain; Flat Config для нового scope | Сначала ограниченный pilot и новые/изменяемые Codogma-owned модули; не включать сразу весь legacy tree |
| Prettier + eslint-config-prettier | Единое форматирование; отключать конфликтующие stylistic rules ESLint | Новые файлы и явно выбранные изменяемые области; не форматировать весь legacy tree |
| Vitest | Unit/integration runner для TypeScript modules | Сначала tests схемы/serialization/lifecycle/adapter contracts и подходящих editor regressions; не мигрировать все текущие tests без необходимости |
| Knip | Анализ неиспользуемых файлов/exports/dependencies/scripts | Сначала report mode, с явными entry points для dynamic plugin registry, generated output и scripts |
| dependency-cruiser | Проверка границ слоёв и циклов | Сначала report mode; границы Core → adapters/Editor и правила для новых editor modules вводить постепенно |
| Node.js built-in test/assert | Остаётся достаточным для простых JS server/security smoke scripts | Не мигрировать существующие smoke tests без необходимости |

Legacy editor не переводится на строгие правила массово. Ограниченный pilot реализуется в уже строгом `packages/localization/`: пакет использует root-locked ESLint/Prettier/Knip/dependency-cruiser, отдельный ESLint scope и package-local Prettier config. `format:check` охватывает package-owned source/test/CLI scope и manifest/tooling config; файлы нормализованы в pilot branch, а CI выполняет read-only Prettier check. Пакетный lockfile остаётся минимальным и закрепляет TypeScript 5.3.3; версии quality tools не дублируются в нём. Node built-in `node:test` сохраняется вместо добавления ещё одного test runner. Knip работает с `--no-exit-code`, dependency-cruiser — с warning severity, пока findings и dynamic entry points проходят triage. Strict checks остаются ограничены этим package scope, без массового gate на legacy Colibri.

### 3. Структура и изоляция

- Строгий Core scope находится в `packages/cge/` и необходимых локальных Core contracts; он не зависит от приватных модулей `source/editor/plugins/colibri`. Новый SolidJS Host уже имеет отдельный package root в `src/editor/`, TypeScript 5.9.3, собственные typecheck/build/domain/browser tests и CI `editor-host` job. Новые/изменяемые Host-owned участки получают применимые checks в этом scope; не требуется переносить legacy tree или включать весь Colibri в strict/lint gate.
- В начальном pilot допустим отдельный package manifest/lockfile до утверждения npm Workspaces. Это временная граница разработки; дальнейшая консолидация lockfiles допустима только после Workspace PoC.
- Не менять общий legacy `tsconfig-base.json` и не активировать новые blocking lint rules на весь editor в первом PR.
- До CI gate на legacy packages сначала снять отчёт, проверить динамически загружаемые plugins, generated files, script entry points и false positives.
- Поддерживать качество по принципу ratchet: новые файлы проходят все принятые checks; изменяемый scope не добавляет новых diagnostics; старый baseline уменьшается отдельными PR.

### 4. Definition of Done для toolchain pilot

- Clean install воспроизводится в изолированном scope по lockfile на Node.js 22.
- `typecheck`, `lint`, `format:check` и unit tests проходят.
- Runtime validation тестируется на валидных и невалидных project/JSON inputs.
- Knip и dependency-cruiser формируют отчёт без удаления/блокировки существующих dynamic plugin entry points.
- CI запускает fast checks нового scope; root legacy editor build/security checks остаются без ухудшения.
- В PR описаны версии инструментов и точные команды; успешный editor build не выдаётся за прохождение lint/tests. Каждая editor/runtime правка проходит адресные регрессионные и, где требуется, browser acceptance checks.

## Последствия и отложенные действия

**Положительные:** новый Core получает строгую типизацию и автоматические проверки без массового рефакторинга существующего редактора.

**Компромиссы:** временно существуют разные quality scopes и возможно отдельный lockfile. Это предпочтительнее, чем вводить непроверенные правила на весь legacy code.

Следующие задачи после pilot: проверить CI и report findings; применить accepted checks к новым Codogma-owned modules без включения всего legacy tree; решить, нужно ли удалить остаточные `source/editor/lint.sh` и `source/editor/tslint.json`; затем расширять analysis scope постепенно. TSLint не считать доступным или активным, пока его dependency не вернулась в manifest.
