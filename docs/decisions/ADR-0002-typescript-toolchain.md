# ADR-0002: TypeScript toolchain и постепенное усиление quality gates

**Статус:** принято для нового Codogma-owned кода; rollout на legacy editor не выполнен.  
**Дата:** 27.10.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [roadmap](../roadmap.md), [baseline качества](../code-quality-baseline.md), [матрица зависимостей](../dependency-capability-matrix.md).

## Контекст

Текущий editor использует TypeScript 5.3.3 и TypeScript project references. Общий `tsconfig-base.json` не включает строгий профиль TypeScript; часть generated/legacy plugin source имеет собственные ограничения. После PR #10 TSLint удалён из editor package dependencies, но файлы `tslint.json` и `lint.sh` ещё существуют. Сегодня CI не запускает ESLint, Prettier, Knip, dependency-cruiser или unit tests для нового Core.

Массовое включение strict/lint/format для более чем тысячи legacy TypeScript-файлов создаст шум и необоснованный рефакторинг. Новый Core должен начать с отдельного строгого scope и измеримого ratchet.

## Решения

### 1. Язык и компилятор

- Новый Codogma Core, Project Model, Runtime Adapter, build tools и platform-neutral contracts пишутся на TypeScript.
- Для нового scope обязателен отдельный `tsconfig` с `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true` и `forceConsistentCasingInFileNames: true`.
- Compile-time types не являются validation внешних данных. JSON, project files, plugin metadata и SDK responses проверяются runtime-схемой и преобразуются в типизированное состояние.
- Не применять `any`, `@ts-ignore` или non-null assertions, чтобы обойти модель данных. Исключения требуют пояснения и testable reason.
- Версия TypeScript и toolchain packages должна быть закреплена lockfile после проверки совместимости с Node.js 22. Текущий TypeScript 5.3.3 в legacy editor не автоматически является выбранной версией нового Core.

### 2. Инструменты и назначение

| Инструмент | Решение | Первоначальный scope |
|---|---|---|
| ESLint + typescript-eslint | Основной lint toolchain; Flat Config для нового scope | Только новый Core pilot и его tests |
| Prettier + eslint-config-prettier | Единое форматирование; отключать конфликтующие stylistic rules ESLint | Только новые файлы; не форматировать весь legacy tree |
| Vitest | Unit/integration runner для TypeScript Core modules | Минимальные tests schema, serialization/lifecycle и adapter contracts |
| Knip | Анализ неиспользуемых файлов/exports/dependencies/scripts | Сначала report mode, с явными entry points для dynamic plugin registry, generated output и scripts |
| dependency-cruiser | Проверка границ слоёв и циклов | Сначала report mode; правила Core → adapters/Editor должны исключать недопустимые направления |
| Node.js built-in test/assert | Остаётся достаточным для простых JS server/security smoke scripts | Не мигрировать существующие smoke tests без необходимости |

Точные версии npm packages выбираются в реализации пилота на основе актуальной совместимости, закрепляются lockfile и подтверждаются clean install. Эта ADR не утверждает, что инструменты уже добавлены в зависимости или CI.

### 3. Структура и изоляция

- Новый строгий scope находится в `packages/cge/` и необходимых локальных Core contracts; он не зависит от приватных модулей `source/editor/plugins/colibri`.
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
- В PR описаны версии инструментов и точные команды; успешный editor build не выдаётся за прохождение lint/tests.

## Последствия и отложенные действия

**Положительные:** новый Core получает строгую типизацию и автоматические проверки без массового рефакторинга существующего редактора.

**Компромиссы:** временно существуют разные quality scopes и возможно отдельный lockfile. Это предпочтительнее, чем вводить непроверенные правила на весь legacy code.

Следующие задачи: создать пилотный package/toolchain; проверить его в CI; решить, нужно ли удалить остаточные `source/editor/lint.sh` и `source/editor/tslint.json`; затем расширять analysis scope постепенно. TSLint не считать доступным или активным, пока его dependency не вернулась в manifest.
