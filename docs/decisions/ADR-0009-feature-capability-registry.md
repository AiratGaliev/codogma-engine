# ADR-0009: Feature/Capability Registry v1

**Статус:** принято; domain contract v1 реализован в `@codogma/feature-registry`.  
**Дата:** 09.11.2026  
**Связанные решения:** [ADR-0003](ADR-0003-package-architecture-and-management.md), [ADR-0004](ADR-0004-optional-data-oriented-ecs-and-runtime-performance.md), [ADR-0007](ADR-0007-native-codogma-project-model.md), [ADR-0008](ADR-0008-runtime-service-contracts.md).

## Контекст

npm package dependency graph описывает установку и распространение кода, но не выражает полностью логические возможности Engine. Одну capability могут предоставлять несколько packages; один package может давать несколько capabilities. Feature requirements и conflicts имеют собственную семантику и не должны становиться вторым npm resolver.

Build Analysis в `@codogma/cge` уже формирует общий resource/module/package graph и объяснимый build report. Он должен получать разрешённые решения о feature selection, не владеть package discovery, project configuration или выбором providers.

## Решение

### 1. Package boundary

- Реестр реализуется в независимом host-neutral package `@codogma/feature-registry`.
- Пакет не зависит от Core, Phaser, Editor Host, DOM, Node-only APIs, platform SDK или bundler.
- Registry принимает декларативный catalog, versioned project selection и нормализованный installed-package inventory.
- Discovery и validation не импортируют и не исполняют код provider packages.
- Registry не устанавливает packages, не разрешает npm semver/dependency ranges, не изменяет package manifests/lockfiles и не активирует entry points.
- npm / Package Manager остаётся владельцем package installation и package dependency graph. Host lifecycle владеет activation.

### 2. Feature descriptor v1

Каждый descriptor содержит:
- стабильный feature ID;
- scopes: `runtime`, `editor`, `build`, `platform`, `tooling`;
- supported targets (явный список либо `*`);
- selection policy: `required`, `default`, `optional`;
- один или несколько providers;
- declared feature requirements и conflicts;
- provider mode: `single` (default) или явный `all`.

Provider содержит стабильный provider ID, kind (`builtin` или `package`), scopes, targets и публичные entry points для каждого разрешённого scope. Package provider также содержит npm package name и при необходимости точную версию. Provider scopes/targets не могут расширять descriptor scopes/targets. Built-in entry points используют явный `codogma:` namespace; package entry points являются безопасными относительными npm exports paths. Неизвестные поля и небезопасные entry-point paths отклоняются.

Один feature ID не смешивает builtin и package provider kinds. Provider IDs уникальны в пределах всего registry, чтобы provider bindings оставались однозначными. Unknown feature references, self-dependencies, duplicate IDs и dependency cycles являются validation errors.

### 3. Provider resolution

- Package inventory содержит точный stable package instance ID, npm name/version, declared scopes/targets и результат host/API compatibility проверки.
- Provider сопоставляется с точной package instance; совпадения только по package name при нескольких установленных экземплярах недостаточно.
- В режиме `single` один доступный provider descriptor должен быть однозначен. Иначе требуется явный binding `providerId → packageInstanceId`; неявный выбор по порядку установки запрещён. Независимо от режима каждый package provider descriptor разрешается ровно в один exact package instance; если одному descriptor соответствуют несколько установленных instances, требуется явный binding.
- В режиме `all` явно разрешается композиция всех объявленных compatible provider descriptors, но не всех установленных версий одного и того же provider package. Отсутствующий, неоднозначный или несовместимый обязательный contribution блокирует selection.
- Built-in provider не требует фиктивного npm package instance.
- Feature availability является результатом metadata + inventory + scope/target + compatibility checks; факт установки package сам по себе не включает capability. Feature, не поддерживающие запрошенный scope (например, editor-only feature в runtime selection), остаются в report с `scope-unsupported` и исключаются без блокировки другого scope; недоступный provider для feature, действительно выбранной в этом scope, даёт blocking diagnostic.

### 4. Project selection

`ProjectFeatureConfigurationV1` использует schema version 1 и содержит:
- project-level `enabledFeatureIds` и `disabledFeatureIds`;
- target-specific overrides с теми же enabled/disabled ID lists.

Приоритет: target override → project explicit selection → descriptor policy. Required feature нельзя отключить. Одна feature не может одновременно находиться в enabled и disabled list одного уровня. Неизвестные IDs, повторяющиеся IDs/targets и неподдерживаемые schema versions дают структурированную диагностику.

Конфигурация Registry является отдельным project-domain документом. Она не записывается в npm `package.json`/`package-lock.json`, `ProjectDocumentV1.runtime.settings`, Editor Preferences или workspace layout. Точка persistence/Build Profile integration определяется задачами COD-35/COD-95.

### 5. Resolution and build contract

Resolver формирует детерминированный report:
- requested, included и excluded feature IDs;
- installed/provided/available/enabled/target-included states;
- provider resolution и exact package instance IDs;
- selection source и dependency provenance (`requiredBy`);
- machine-readable diagnostics и exclusion reasons.

Declared feature dependency closure вычисляется детерминированно; обязательные disabled/missing/unavailable dependencies, cycles, conflicts, unsupported scopes/targets, incompatible providers и ambiguous provider instances блокируют результат. Feature dependencies не создают npm dependencies и не запускают установку.

Registry также выдаёт типизированные `ProjectBuildFeatureSnapshot` values:
- builtin features являются logical roots и не создают вымышленные package nodes;
- package features ссылаются на exact selected package instance ID(s);
- selected/available/targetCompatible отражают проверенное логическое решение.

`@codogma/cge` объединяет эти snapshots со своим graph. Данные Registry не заменяют существующие resource, import, runtime-file и package-dependency edges.

**Logical exclusion не равна byte-level exclusion.** Feature Registry/Core report объясняет выбор функции и package contribution, но не доказывает удаление байтов из HTML5 output. Физическое исключение optional packages/modules, анализ dynamic imports/side effects и output manifest должны подтверждаться настоящим bundler artifact по COD-35.

### 6. Optional runtime feature catalog

Первый каталог содержит отдельные optional IDs:
- `runtime.phaser` → `@codogma/runtime-phaser`;
- `runtime.ecs` → `@codogma/ecs`;
- `runtime.ecs-phaser` → `@codogma/ecs-phaser`, requires `runtime.ecs` и `runtime.phaser`.

Это декларации каталога, а не доказательство существования или установки этих package roots. Установка `@codogma/ecs` не включает bridge автоматически. Базовый Core/Phaser package не зависит от ECS. Все ECS-specific API, lifecycle, data ownership, performance и acceptance требования остаются исключительно в ADR-0004.

### 7. Ownership boundaries

- COD-34 / ADR-0009: Registry domain contracts, validation, provider resolution, project selection, dependency closure и Core Build Analysis bridge.
- COD-51 / ADR-0003: npm package taxonomy, versioned `codogma` metadata schema и ingestion/parser; package code не исполняется для discovery.
- COD-35: reproducible HTML5 builder, physical artifact composition, output manifest и byte-level exclusion evidence.
- COD-95: SolidJS Editor Host Build Profiles workflow и UI persistence integration.
- ADR-0004: единственный нормативный источник optional ECS package/API/Phaser bridge/performance requirements.

## Последствия

- Package installation и engine feature selection остаются ортогональными процессами.
- Editor, CLI и build могут использовать один и тот же resolver/report вместо собственных каталогов.
- Новый package может быть протестирован независимо от Core; Core потребляет только typed snapshots.
- Отсутствие bundler evidence не позволяет обещать уменьшение output size только по feature metadata.

## Verification fixtures

Contract fixtures должны покрывать required/default/optional selection, builtin provider, package provider, exact instance binding, ambiguous instances, explicit multi-provider mode, missing/incompatible providers, target/scope mismatch, disabled dependency, cycle, conflict, deterministic serialization и optional ECS dependency closure.
