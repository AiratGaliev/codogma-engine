# ADR-0003: Архитектура пакетов и менеджер пакетов Codogma

**Статус:** целевое направление принято; детали API metadata, миграции и workspace configuration требуют аудита и PoC.  
**Дата:** 26.10.2026  
**Связанные документы:** [ТЗ](../technical-specification.md), [дорожная карта](../roadmap.md), [каталог технических источников](../REFERENCE-SOURCES.md).

## Контекст

Codogma Engine развивается из существующего редактора на базе Phaser Editor/Colibri в самостоятельный Web-first 2D-движок. Нужны независимые пакеты с собственными API и версиями, выборочная установка возможностей в пользовательские игровые проекты и возможность расширять UI редактора без изменения его исходников.

Модель исходников и управления пакетами вдохновляется EVA.js, а UX Package Manager и интеграция пакетов в редактор — Unity Package Manager. npm остаётся источником истины по установке, разрешению зависимостей и lockfile. Эти референсы не означают копирования чужих API или форматов.

**Текущее состояние переходное:** в репозитории существуют root npm project и редактор в `source/editor` со своим manifest/lockfile; `src/editor`, `packages/*` в целевой роли и согласованные npm Workspaces ещё не внедрены. Этот ADR определяет целевую архитектуру, а не утверждает, что миграция уже выполнена.

## Принятые архитектурные принципы

### 1. Editor Host и корень исходников редактора

- Целевой путь приложения редактора — `src/editor/`. Это Editor Host: он отвечает за рабочую среду, регистрацию расширений, UI shell и взаимодействие с типизированными extension contracts.
- Фактический путь текущего редактора остаётся `source/editor/` до отдельного migration PR. Перенос должен сохранить внутреннюю структуру и TypeScript project references, а также обновить server paths, root scripts, CI/cache settings, release archive, `BUILD.md` и README. До завершения миграции рабочие инструкции описывают реальный текущий путь.
- Перенос редактора, переход на npm Workspaces и реализация нового Core не объединяются в один большой PR. Сначала проводится audit/path migration; включение в Workspaces и консолидация lockfiles — отдельное проверяемое изменение.

### 2. Source monorepo и самостоятельные пакеты

- Корень исходников каждого самостоятельного Codogma package располагается в `packages/<name>/` и содержит собственный `package.json`, явные public exports, tests и документацию.
- Целевой Core package `@codogma/cge` находится в `packages/cge/`. Он является Core/public API, а **не агрегирующим пакетом всего продукта**: не тянет Editor UI, desktop shell, MCP, build-only tools или platform SDK по умолчанию.
- В `packages/editor-api/` планируется типизированный пакет публичных контрактов для расширения Editor Host с целевым именем `@codogma/editor-api`. Его точный API и зависимость от Core фиксируются через PoC; циклическая зависимость Editor → Core → Editor запрещена.
- Примеры других возможных пакетов: `runtime-phaser`, `build-html5`, `platform-services`, `platform-yandex-games`, `tilemap-tools`. Список не является обещанием создать все эти пакеты сразу.
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

### 5. Метаданные пакета и API compatibility

- Стандартный `package.json` сохраняет npm-семантику. Engine-specific metadata может находиться в namespaced поле `codogma`; поле не дублирует dependency graph.
- Metadata должна позволять определить package kind, supported scopes/targets, совместимую версию Engine/Editor Extension API и явные entry points. Точная schema/version, разрешённые values и validation rules остаются открытыми до ADR/PoC и должны тестироваться schema fixtures.
- Публичные точки входа объявляются через npm `exports`; приватные deep imports не используются как межпакетный контракт. `peerDependencies` применяются там, где это соответствует роли host/Core.
- Version compatibility должна проверяться до активации extension и до production build; несовместимость даёт структурированное диагностическое сообщение.

### 6. Editor Extension API и регистрация в UI

- Editor Host предоставляет типизированные, версионированные extension points. Package может объявить editor entry point и регистрировать через публичный API команды, пункты меню/hotkeys, panels/views, application/project settings, custom Inspector editors, schema validators, asset importers/reimport handlers, Scene Editor gizmos/brushes, profiler/debug views и build hooks.
- Editor Host обнаруживает только packages, заявленные в зависимостях активного проекта (либо явно установленные для самой установки редактора, если такой scope появится), с корректными metadata/entry points и совместимой API version. Наличие произвольного пакета в `node_modules` не является разрешением выполнить его код.
- Установка, наличие, включённость и активация extension — разные состояния. Нужна project-level диагностика и целевая возможность отключить extension без удаления npm dependency и без повреждения проектных данных; точная схема пользовательских настроек и lifecycle подтверждается PoC.
- Extension registration не должен требовать правок исходников Editor Host или приватных импортов Colibri. При недоступной/ошибочной регистрации редактор должен предоставить понятную ошибку и не падать без обработки.
- Метаданные сами по себе не создают sandbox. Сторонний extension, выполняющийся в процессе редактора, имеет права соответствующего процесса, пока не реализована отдельная изоляция.

### 7. Package Manager Service

- Editor UI и CLI используют один типизированный Package Manager Service; UI не запускает npm с произвольной логикой и не редактирует manifests независимо от CLI.
- Сервис координирует install/update/remove/list, запускает npm CLI с контролируемыми аргументами, ограничивает project root, поддерживает отмену/управление процессом, выдаёт structured results и понятную диагностику.
- После неудачной операции сервис должен обнаруживать несогласованность manifest/lockfile и предоставлять тестируемое восстановление. Атомарность нельзя обещать без проверенного механизма.
- Поддерживаемые источники — npm registry/scoped registry, local/file, Git и tarball поэтапно; для Git/tarball нужны pinning, безопасная работа с credentials и понятная диагностика. Токены не сохраняются в tracked project files.
- Lifecycle scripts, лицензии, vulnerabilities и provenance оцениваются по явной политике. Не считать пакет безопасным только потому, что npm install завершился успешно.

## Последовательность реализации

1. Провести инвентаризацию root/editor manifests, lockfiles, scripts, CI и release packaging; подтвердить dependency/capability baseline.
2. Отдельным PR перенести редактор `source/editor` → `src/editor`, обновить связанные пути, сохранить внутренние TS references и проверить build/server/release. Не добавлять при этом новую Core implementation.
3. Отдельным PoC подключить npm Workspaces для `packages/*` и `src/editor`, проверить clean install, TypeScript build, server smoke, MCP integration/release archive и согласованность единого root lockfile.
4. Создать минимальный `packages/cge` и только те независимые package roots, которые нужны первому vertical slice; новые контракты покрыть strict typecheck, tests и dependency-boundary checks.
5. Утвердить metadata schema, package kinds/scopes, Editor Extension API и lifecycle на fixture package, который регистрирует команду и панель.
6. Реализовать общий Package Manager Service над npm CLI и интегрировать его в Editor Host/CLI после готовности package/API contracts.
7. Позже добавлять curated feature sets, каталог, дополнительные источники, подписи/provenance UX и иные расширенные функции при подтверждённой потребности.

## Открытые вопросы

- Окончательная конфигурация npm Workspaces, порядок включения `src/editor`, root scripts и удаление второго lockfile после успешного PoC.
- Доступность имени `@codogma/cge` и права на npm scope `@codogma` перед публичной публикацией.
- Финальная структура `codogma` metadata/schema и перечень package kinds/scopes.
- Граница и точные exports `@codogma/editor-api`, версия Editor Extension API и совместимость с существующим Colibri/plugin registry.
- Как проектно хранить enabled/disabled state editor extensions и как обрабатывать миграцию/ошибки их активации.
- Какой набор источников будет включён по умолчанию и какая политика применяется к npm lifecycle scripts, лицензиям, vulnerability/provenance checks и сторонним extensions.
- Нужны ли собственный registry, package catalogue, curated feature sets или отдельная process isolation для extensions в desktop-сценарии.

## Последствия

**Положительные:** разработчики Codogma используют единый source monorepo; пакеты могут развиваться с независимыми контрактами и версиями; пользователь устанавливает только необходимые возможности; Editor Host расширяется пакетами без правок его исходников; npm отвечает за стандартное разрешение зависимостей и lockfile.

**Компромиссы:** появятся дополнительные требования к package metadata, API/version compatibility, Editor Extension lifecycle, dependency boundaries, release automation и security review. Эти механизмы должны строиться поэтапно и не должны подменять npm.
