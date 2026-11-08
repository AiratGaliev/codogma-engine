# ADR-0002: TypeScript toolchain и quality gates

**Статус:** принято для всего нового Codogma-owned production, test и tooling кода.  
**Дата:** 27.10.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [Roadmap](../roadmap.md), [Baseline качества](../code-quality-baseline.md), [Матрица зависимостей](../dependency-capability-matrix.md).

## Контекст

Codogma включает Node.js services, Core packages, SolidJS Editor Host, Phaser runtime adapters, MCP tooling, build tooling и automated tests. Эти части должны иметь строгую типизацию, воспроизводимые toolchains и одинаково проверяемые контракты.

Единственный Editor Host находится в `src/editor/` и использует TypeScript 5.9.3 с собственным manifest/lockfile. Core packages имеют собственные manifests и lockfiles; их compiler settings и public contracts остаются независимыми от UI toolchain.

## Решения

### 1. Язык и компилятор

- **TypeScript — обязательный язык исходного кода нового Codogma-owned functionality.** Правило распространяется на Core, Project Model, runtime/adapters, Editor Host/features, backend/service logic, MCP packages, CLI/build/devtools и новый тестовый код.
- UI-компоненты с JSX пишутся в `.tsx`; contracts, services, models, tests и helpers — в `.ts`.
- Конфигурационные файлы пишутся на TypeScript, если инструмент нативно поддерживает такой формат. Декларативные manifest/config formats (`package.json`, `tsconfig.json`, JSON/YAML/TOML, GitHub Actions YAML, HTML, CSS, `.pen`) остаются в собственном формате.
- Каждый новый TS/TSX scope получает отдельный `tsconfig` с полным профилем: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`. Дополнительно включать `noUnusedLocals` и `noUnusedParameters`, если scope позволяет.
- `allowJs` не включать для новых TS-first scopes.
- Не создавать sidecar declarations для собственных модулей, реализация которых доступна в том же TS scope. `.d.ts` допускаются для generated declarations и необходимых ambient/external declarations.
- Существующие JavaScript bootstrap/interop entry points не переписываются массово этим ADR. Новая feature logic реализуется в TypeScript modules; JS entry points остаются минимальными orchestration adapters.
- Compile-time types не являются runtime validation внешних данных. JSON, Project documents, package metadata и SDK responses проходят schema/runtime validation до использования.
- Не применять `any`, `@ts-ignore` или non-null assertions для обхода модели данных. Исключения требуют пояснения и testable reason.
- Версии TypeScript и quality tools закрепляются lockfiles после проверки совместимости с целевой версией Node.js.

### 2. Strict TypeScript profile

Обязательный профиль для нового Codogma-owned TS scope:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

Пакет может документированно исключить отдельное правило, если оно несовместимо с назначением generated/interop boundary. Feature implementation не должна наследовать такое исключение.

### 3. Quality tooling

| Tool | Назначение | Gate |
|---|---|---|
| ESLint + typescript-eslint | Type-aware linting и архитектурные правила нового TS scope | Blocking для новых/изменяемых scopes после включения config |
| Prettier | Детерминированное форматирование | `format:check` для принадлежащих scope source/tests/configs |
| Vitest / Node `node:test` | Unit и integration tests | По package-owned test contract |
| Playwright | Browser acceptance | Для реализованных Host/browser workflows |
| Knip | Dead-code/dependency report | Report mode до triage dynamic entry points |
| dependency-cruiser | Module boundaries/cycles | Report mode до triage и утверждения blocking rules |

Не создавать второй test runner без причины. Каждый package закрепляет используемый runner и команды в собственном manifest.

### 4. Package boundaries и existing UI client

- `packages/cge/` имеет собственный strict TS scope и не импортирует Phaser, DOM, SolidJS, Node-only APIs или platform SDKs в public contracts.
- `src/editor/` — самостоятельный SolidJS Host package со своим TypeScript config, lockfile, typecheck/build/tests и browser acceptance.
- `server/` — отдельный Node.js service boundary; новые сервисы и contracts следуют TypeScript-first правилам, где это применимо.
- Editor Host в `src/editor/` — единственное приложение редактора и единственная UI package root. Root/server/Core/first-party packages сохраняют собственные package boundaries и lockfiles; TypeScript contracts не должны протекать через UI-specific implementation details.
- Root smoke/security scripts и минимальные JS bootstrap entry points остаются в своих инструментальных границах до отдельного изменения; новая domain/feature logic не размещается в них.

### 5. Rollout и ratchet

- Clean install воспроизводится в изолированном scope по committed lockfile на Node.js 22.
- `typecheck`, `lint`, `format:check`, unit tests и package checks выполняются в CI для соответствующего scope.
- Новый/изменяемый scope не добавляет diagnostics; старые baseline findings устраняются отдельными узкими изменениями.
- Knip и dependency-cruiser первоначально работают в report mode. До blocking gate проверить dynamic imports, generated outputs и tool entry points.
- Не менять общий config другого package без анализа TypeScript project references и consumer impact.

## Definition of Done

- Clean install воспроизводим по lockfile.
- Strict typecheck, lint, formatting и package-owned tests проходят.
- Runtime validation покрывает valid/invalid inputs.
- Package boundary checks не выявляют запрещённых зависимостей.
- CI запускает fast checks изменяемого scope.
- PR содержит точные версии tools, команды и commit-scoped evidence.

## Последствия

Новый Core и SolidJS Host имеют строгие независимые quality gates; package boundaries остаются явными. Существующий UI client может сохранять отдельный tooling setup до завершения UI cutover, не влияя на contracts и code quality нового продукта.
