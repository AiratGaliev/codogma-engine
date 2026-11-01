# ADR-0003: Архитектура пакетов и менеджер пакетов Codogma

**Статус:** целевое направление принято; детали API metadata, миграции и workspace configuration требуют аудита и PoC.  
**Дата:** 29.10.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [дорожная карта](../roadmap.md), [каталог технических источников](../REFERENCE-SOURCES.md).

## Контекст

Codogma Engine развивается из существующего редактора на базе Phaser Editor/Colibri в самостоятельный Web-first 2D-движок. Нужны независимые пакеты с собственными API и версиями, выборочная установка возможностей в пользовательские игровые проекты и возможность расширять UI редактора без изменения его исходников.

Модель исходников и управления пакетами вдохновляется EVA.js, а UX Package Manager и интеграция пакетов в редактор — Unity Package Manager. Реестр функций и выборочная сборка также изучены по исходникам COCOS 4.0: это reference для описания возможностей, их зависимостей и build-time selection, а не указание превращать каждый модуль в npm-пакет. npm остаётся источником истины по установке, разрешению package dependencies и lockfile. Эти референсы не означают копирования чужих API или форматов.

Аудит текущей ветки `dev` дополнительно установил, что Codogma подключает Phaser 4.2.1 через вендорный runtime bundle из `source/editor/plugins/phasereditor2d.phaser/plugin.json` (`scripts/phaser.min.js` для production и `scripts/phaser.js` для development), а не через прямую npm dependency. При этом исходники upstream Phaser модульно организованы и у тега `v4.2.1` есть отдельные варианты сборки. Поэтому текущее ограничение относится к **пути поставки и интеграции Codogma**, а не к абсолютной невозможности модульной сборки самого Phaser. См. [аудит в ТЗ](../technical-specification.md#уточнение-фактическая-интеграция-phaser-421) и [каталог исходников](../REFERENCE-SOURCES.md).

**Текущее состояние на 01.11.2026:** в репозитории существуют root npm project, legacy Colibri app в source/editor/ и самостоятельный SolidJS Editor Host в src/editor/, каждый со своим manifest/lockfile. Новый Host уже создан COD-80; PR #30 ещё не смержен. packages/* развиваются отдельными package roots. npm Workspaces и единый workspace lockfile пока не внедрены. Этот ADR определяет дальнейшую package architecture, а не утверждает, что workspace consolidation уже выполнена.

## Принятые архитектурные принципы

### 1. Editor Host и корень исходников редактора

- Целевой путь приложения редактора — `src/editor/`. Это Editor Host: он отвечает за рабочую среду, регистрацию расширений, UI shell и взаимодействие с типизированными extension contracts.
- `src/editor/` уже содержит самостоятельное SolidJS приложение с собственным manifest/lockfile, Vite Host, UI source, design system и tests. `source/editor/` остаётся legacy Colibri client на переходный период. **Не переносить его исходники или TypeScript project references в `src/editor/`** и не копировать Colibri UI abstractions. Оба приложения сосуществуют до COD-87 cutover; обновление production server path, release/archive/CI и README выполняется как часть cutover, Colibri removal — отдельно в COD-88.
- Перенос редактора, переход на npm Workspaces и реализация нового Core не объединяются в один большой PR. Сначала проводится audit/path migration; включение в Workspaces и консолидация lockfiles — отдельное проверяемое изменение.

### 2. Source monorepo и самостоятельные пакеты

- Корень исходников каждого самостоятельного Codogma package располагается в `packages/<name>/` и содержит собственный `package.json`, явные public exports, tests и документацию.
- Целевой Core package `@codogma/cge` находится в `packages/cge/`. Он является Core/public API, а **не агрегирующим пакетом всего продукта**: не тянет Editor UI, desktop shell, MCP, build-only tools или platform SDK по умолчанию.
- В `packages/editor-api/` планируется типизированный пакет публичных контрактов для расширения Editor Host с целевым именем `@codogma/editor-api`. Его точный API и зависимость от Core фиксируются через PoC; циклическая зависимость Editor → Core → Editor запрещена.
- Примеры других возможных пакетов: `runtime-phaser`, `build-html5`, `platform-services`, `platform-yandex-games`, `package-manager`, `tilemap-tools`. Список не является обещанием создать все эти пакеты сразу.
- Названия пакетов отражают ответственность. Обязательного префикса `plugin-` нет; package kind/targets определяются проверяемыми metadata и публичным контрактом.
- Не создавать пакет на каждый класс. Подсистемы с тесной связью могут оставаться внутренними модулями одного package. Самостоятельная подключаемая возможность получает package boundary, когда это оправдано API, зависимостями, тестированием и жизненным циклом.
- Наличие package source в монорепозитории не означает немедленной публичной публикации. Публикация в npm требует стабилизированных exports/API, SemVer/backward-compatibility policy, tests, docs, licence review и воспроизводимого release process.

### 3. npm Workspaces и локальная разработка

- Целевая модель разработки — один npm monorepo с root workspace, который связывает `packages/*` и после проверки совместимости — `src/editor`. Корневой `package.json` задаёт workspaces; root lockfile становится источником воспроизводимой установки workspace graph.
- npm Workspaces отвечает за linking локальных пакетов и стандартную npm dependency semantics. Workspace linking нужен для разработки; он **не означает**, что все пакеты станут dependencies каждого игрового проекта.
- Перед внедрением проверяются текущие manifests, scripts, TypeScript project references, root/editor lockfiles, CI, release packaging и npm CLI version. Включение редактора в Workspace и удаление его отдельного lockfile производится только после clean install/build/server/release PoC.
- До завершения миграции допускается переходное состояние с существующими root/editor npm roots и lockfiles. Документация обязана различать текущие команды/пути и целевую структуру.
- Не использовать `node_modules` как место исходной разработки и не редактировать установленную копию пакета вручную. Источник истины для package source — контролируемый репозиторий; `node_modules` формируется npm.

### 4. Выборочная установка пакетов в пользовательский проект

- Конечный разработчик устанавливает в игровой проект только явно выбранные пакеты и транзитивные зависимости, которые разрешает npm. Пользовательский проект содержит собственные `package.json` и `package-lock.json`; весь репозиторий Codogma или полный список workspace packages в пользовательский проект не копируется.
- Пакеты выбираются по нужной функциональности: Core/runtime, asset tools, editor extensions, build targets, platform adapters или tooling. Необязательные возможности не становятся обязательными зависимостями базового Core.
- Package Manager UI работает в контексте активного проекта и ясно показывает, какой manifest/lockfile меняется. Общие dependencies редакторского приложения не смешиваются с зависимостями пользовательской игры.
- Editor-only и build-only пакет не должен включаться в production game bundle только потому, что он установлен в `node_modules`; сборка проверяет package scope/target и фактический dependency graph.
- npm остаётся единственным resolver/installer и владельцем стандартного npm lockfile. Codogma добавляет engine-specific compatibility checks, metadata validation, diagnostics, package discovery, UX и сборочные правила, не создавая второй resolver или lockfile.

### 5. Реестр функций (Feature/Capability Registry) и выборочная сборка

- Помимо package dependency graph, Codogma должен иметь единый versioned registry логических функций движка. Пакет — единица установки; feature/capability — логическая функция, предоставляемая одним или несколькими package modules. Не создавать отдельный npm package для каждой функции, если это не оправдано собственной границей ответственности.
- Registry объединяет descriptors встроенных функций и явно опубликованных package-provided features. Descriptor должен содержать stable ID, provider/package, scopes/targets, entry points, declared feature requirements, conflicts when applicable, required/optional/default policy и сведения о совместимости. Feature scopes/targets не могут расширять scopes/targets provider package. Discovery и validation должны читать декларативные metadata, не импортировать и не исполнять package code только ради обнаружения функции; entry points загружаются только в соответствующем разрешённом lifecycle. Точная metadata schema, versioning и источник descriptor утверждаются после PoC; не объявлять этот контракт уже реализованным.
- Устанавливаемость через npm, объявление/доступность функции, включение в project configuration, включение в конкретный build target и активация в editor/runtime являются разными состояниями. Проектный выбор features и target-specific overrides должен быть версионируемым и воспроизводимым в CI.
- Registry проверяет feature-level requirements, conflicts, scopes/targets и compatibility; это не npm dependency resolver. Если feature provider не установлен, выдаётся структурированная диагностика и, где уместно, предложение открыть Package Manager. Автоматическая установка и разрешение транзитивных package dependencies остаются ответственностью npm/Package Manager Service.
- Build pipeline использует явный набор project-enabled features для выбранного target, вычисляет declared feature-dependency closure, валидирует полноту и формирует report о выбранных features, entry points/modules и причинах inclusion/exclusion. Editor-only contributions исключаются из production game bundle. Включение/исключение реального кода проверяется fixture/build report; registry metadata сама по себе не гарантирует удаление dynamic imports или side-effect modules.
- Для текущего Phaser 4.2.1 bundle-based пути установка wrapper-пакетов и выбор feature descriptors не доказывают физическое исключение подсистем из output. Возможность использовать upstream/custom build, отдельные runtime modules или иной поддерживаемый import path проверяется на fixture; до этого Feature Registry описывает разрешённый набор возможностей, но не обещает автоматически уменьшать Phaser bundle.
- Editor Host, Inspector, CLI и build должны использовать общие descriptors и diagnostics. Curated feature sets могут добавляться позднее как удобные группы feature IDs, но не заменяют обязательный registry и не являются собственным dependency resolver.

### 6. Метаданные пакета и API compatibility

- Стандартный `package.json` сохраняет npm-семантику. Engine-specific metadata может находиться в namespaced поле `codogma`; поле не дублирует dependency graph.
- Metadata должна позволять определить package kind, supported scopes/targets, совместимую версию Engine/Editor Extension API, явные entry points и предоставляемые Feature/Capability descriptors (в metadata `codogma` либо через явную ссылку на валидируемое декларативное описание). Точная schema/version, разрешённые values и validation rules остаются открытыми до ADR/PoC и должны тестироваться schema fixtures; discovery не должен требовать исполнения package code.
- Публичные точки входа объявляются через npm `exports`; приватные deep imports не используются как межпакетный контракт. `peerDependencies` применяются там, где это соответствует роли host/Core.
- Version compatibility должна проверяться до активации extension и до production build; несовместимость даёт структурированное диагностическое сообщение.

### 7. Editor Extension API и регистрация в UI

- Editor Host предоставляет типизированные, версионированные extension points. Package может объявить editor entry point и регистрировать через публичный API команды, пункты меню/hotkeys, panels/views, application/project settings, custom Inspector editors, schema validators, asset importers/reimport handlers, Scene Editor gizmos/brushes, profiler/debug views и build hooks.
- В начальной модели Editor Host обнаруживает только packages, явно заявленные в зависимостях активного проекта, включённые для этого проекта и снабжённые корректными metadata/entry points с совместимой API version. Глобальная установка editor extensions вне проекта не входит в MVP. Наличие произвольного пакета в `node_modules` не является разрешением выполнить его код.
- Установка, наличие, включённость и активация extension — разные состояния. Нужна project-level диагностика и целевая возможность отключить extension без удаления npm dependency и без повреждения проектных данных; точная схема пользовательских настроек и lifecycle подтверждается PoC.
- Extension registration не должен требовать правок исходников Editor Host или приватных импортов Colibri. При недоступной/ошибочной регистрации редактор должен предоставить понятную ошибку и не падать без обработки.
- Метаданные сами по себе не создают sandbox. Сторонний extension, выполняющийся в процессе редактора, имеет права соответствующего процесса, пока не реализована отдельная изоляция.

### 8. Package Manager Service

- Package Manager Service — Node-side подсистема с целевыми исходниками в `packages/package-manager/`, используемая локальным server/backend и headless CLI. Браузерный Editor Host UI обращается к ней через типизированный HTTP/IPC contract; UI не запускает npm, не управляет filesystem напрямую и не редактирует manifests параллельной логикой.
- Сервис координирует install/update/remove/list, запускает npm CLI с контролируемыми аргументами, ограничивает project root, поддерживает отмену/управление процессом, выдаёт structured results и понятную диагностику.
- После неудачной операции сервис должен обнаруживать несогласованность manifest/lockfile и предоставлять тестируемое восстановление. Атомарность нельзя обещать без проверенного механизма.
- Поддерживаемые источники — npm registry/scoped registry, local/file, Git и tarball поэтапно; для Git/tarball нужны pinning, безопасная работа с credentials и понятная диагностика. Токены не сохраняются в tracked project files.
- Lifecycle scripts, лицензии, vulnerabilities и provenance оцениваются по явной политике. Не считать пакет безопасным только потому, что npm install завершился успешно.
- File containment — отдельная граница доверия: недостаточно проверить строковый префикс или real path, а затем без дополнительной защиты открыть/перезаписать путь. `SetFileString`/upload paths, использующие `openSafeProjectFileForWrite`, открывают handle без truncate и проверяют descriptor до записи; это целевое усиление content-write path. Однако `CreateFolder`, `RenameFile`, `CopyFile`, `MoveFiles` и `DeleteFiles` остаются pathname-based и сохраняют TOCTOU race window при локальной подмене parent symlink. Package Manager не должен считать весь file API race-safe: до передачи ему mutation APIs нужны OS-aware handle-relative strategy, adversarial concurrent-race tests и зафиксированный список поддерживаемых ОС либо явная threat model.
### 9. Trust boundary расширений и зависимостей

- `codogma` metadata, feature descriptors и allow-list capabilities не образуют sandbox и не доказывают безопасность JavaScript/TypeScript пакета.
- Discovery читает декларативные metadata; исполнение extension entry point происходит после явного разрешения пользователя и проверки совместимости. Установка/обновление npm package учитывает lifecycle scripts и отображает источник/версию; разрешение package manager не означает автоматического разрешения editor extension.
- До появления отдельной sandbox boundary расширения считаются доверенным кодом с правами текущего editor/runtime контекста. Для недоверенных расширений нужна реальная архитектура изоляции и threat model, а не обещание безопасности на основании manifest scope.
- Package installation/build не должен обходить выбранный project root, подмешивать credentials в tracked files или позволять extension выполнять произвольные файловые операции через неограниченный Editor Host API.

## Последовательность реализации

1. Провести инвентаризацию root/editor manifests, lockfiles, scripts, CI и release packaging; подтвердить dependency/capability baseline.
2. Новый SolidJS Host уже создан в `src/editor/` (COD-80 / PR #30). Следующая migration работа — вертикально переносить workflows на новые Host contracts, не перемещая legacy source tree. Обновление server default route, release/archive/CI paths проводится только на cutover COD-87; удаление Colibri — отдельная cleanup COD-88.
3. Отдельным PoC подключить npm Workspaces для `packages/*` и `src/editor`, проверить clean install, TypeScript build, server smoke, MCP integration/release archive и согласованность единого root lockfile.
4. Создать минимальный `packages/cge` и только необходимые для первого vertical slice package roots; проверить strict typecheck, tests и dependency boundaries. В согласованном с Roadmap build-пилоте проверить базовый registry на built-in features и test provider без зависимости от готового Package Manager UI.
5. Утвердить package metadata и package-provided Feature/Capability descriptors на fixture package: проверить feature dependencies/conflicts, project/target selection и передачу выбранных capabilities в build report.
6. Утвердить Editor Extension API/lifecycle на fixture package, который регистрирует команду и панель; точно зафиксировать versioned contracts.
7. Реализовать общий Package Manager Service над npm CLI и интегрировать его в Editor Host/CLI после готовности package/API contracts.
8. Позже добавлять curated feature sets, каталог, дополнительные источники, подписи/provenance UX и иные расширенные функции при подтверждённой потребности.

## Открытые вопросы

- Окончательная конфигурация npm Workspaces, порядок включения `src/editor`, root scripts и удаление второго lockfile после успешного PoC.
- Доступность имени `@codogma/cge` и права на npm scope `@codogma` перед публичной публикацией.
- Финальная структура `codogma` metadata/schema, Feature/Capability Registry descriptor, project feature configuration и перечень package kinds/scopes.
- Семантика required/default/optional features, conflicts, target-specific overrides и диагностика отсутствующего provider.
- Какие bundler/module graph guarantees доступны в реальном pipeline и при каких side effects/dynamic imports можно доказать, что выключенный feature code не попадает в output.
- Какой путь поставки Phaser 4.2.1 следует поддерживать для target-specific build: существующий bundle, официальный альтернативный bundle или кастомная сборка; критерии — API coverage, совместимость generated code, внешние runtime-модули, реальный raw/gzip output и сложность поддержки.
- Граница и точные exports `@codogma/editor-api`, версия Editor Extension API и совместимость с существующим Colibri/plugin registry.
- Как проектно хранить enabled/disabled state editor extensions и как обрабатывать миграцию/ошибки их активации.
- Какой набор источников будет включён по умолчанию и какая политика применяется к npm lifecycle scripts, лицензиям, vulnerability/provenance checks и сторонним extensions.
- Нужны ли собственный публичный package registry/catalogue, curated feature sets или отдельная process isolation для extensions в desktop-сценарии.

## Последствия

**Положительные:** разработчики Codogma используют единый source monorepo; пакеты могут развиваться с независимыми контрактами и версиями; пользователь устанавливает только необходимые пакеты и выбирает нужные функции; Feature Registry даёт общую модель возможностей для Editor Host/project validation/CLI/build; production build может проверяемо включать только выбранные и допустимые target features; Editor Host расширяется пакетами без правок его исходников; npm отвечает за стандартное разрешение package dependencies и lockfile.

**Компромиссы:** появятся дополнительные требования к package metadata, API/version compatibility, Editor Extension lifecycle, dependency boundaries, release automation и security review. Эти механизмы должны строиться поэтапно и не должны подменять npm.
