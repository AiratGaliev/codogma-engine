# Package Management и package ecosystem

**Статус:** архитектурная карта и UX reference для этапа 8. Это не утверждение о реализованности Package Manager и не фиксация окончательной schema metadata.

**Продуктовый UX baseline:** Unity 6.6 Package Manager.  
**Engineering/reference по организации каталога:** OpenUPM.  
**Целевая реализация:** Node.js + npm service, типизированный API, SolidJS + TypeScript Editor Host.  
**Границы:** только 2D Engine/Editor; не переносить Unity UPM, Unity package formats или OpenUPM как runtime dependency.

## 1. Главный архитектурный вывод

Управление пакетами не принадлежит одной только UI-панели. Это сквозная подсистема, состоящая из нескольких слоёв с разными владельцами:

- **Engine/package architecture** определяет типы пакетов, публичные exports, package scopes/targets, версионируемую Codogma metadata и совместимость.
- **Project dependency management** изменяет список зависимостей конкретной игры и её lockfile. В Codogma это зона Node-side Package Manager Service и npm.
- **Registry/discovery** ищет опубликованные пакеты и читает их metadata. Это read-only слой над npm-compatible registry, не resolver.
- **Optional curated catalogue** дополняет поиск и карточки редакционными данными, которых обычно недостаточно в npm packument.
- **Feature/Capability Registry** описывает, какие функции предоставляет установленный пакет и совместимы ли они с проектом/target. Он не устанавливает npm dependencies.
- **Editor Extension lifecycle** активирует и регистрирует UI contributions пакета: панели, команды, Inspector editors, importers и т.п. Это отдельная trust boundary.
- **Package Manager UI** — пользовательский интерфейс нового Editor Host, а не самостоятельная система разрешения зависимостей.
- **Build pipeline** учитывает package scopes/targets и выбранные features, исключает Editor-only вклад из игрового bundle там, где это подтверждено реальным dependency graph и build fixture.

Эти границы согласуются с ADR-0003. Package Manager нельзя реализовать как набор кнопок, самостоятельно редактирующих package.json или запускающих npm из браузера.

## 2. Сущности и источник истины

| Сущность | Где находится | За что отвечает | Не должна делать |
|---|---|---|---|
| **Package manifest** | Внутри самого пакета: npm package.json | Имя, версия, стандартные npm поля, dependencies, peerDependencies, exports, license, repository и namespaced поле codogma | Не заменяет registry packument, проектный manifest или каталог |
| **Codogma package metadata** | Namespaced поле codogma в package.json либо явный декларативный файл, ссылка на который валидируется | Package kind, scopes/targets, Engine/API compatibility, entry points, provided features/capabilities | Не описывает npm dependency graph повторно и не является sandbox |
| **Registry packument/version metadata** | npm-compatible registry | Опубликованные версии, dist-tags, tarball/integrity, данные конкретной версии и поиск | Не становится источником engine feature compatibility по умолчанию |
| **Project manifest** | package.json активного проекта | Прямые зависимости пользовательской игры и допустимая конфигурация registry | Не содержит зависимости Editor Host и весь workspace Codogma |
| **Project lockfile** | package-lock.json активного проекта | Точное воспроизводимое npm resolution дерево | Не дублируется собственным Codogma lockfile |
| **Curated catalogue record** | Отдельный optional catalogue dataset/repository/service, если появится потребность | Карточка для поиска: display name, summary, topics, media, документация, maintainer/publisher, источники и результаты ручной проверки | Не устанавливает пакет, не заменяет package.json/packument и не меняет dependency resolution |
| **Feature/Capability descriptor** | Package metadata/registry и общий Feature Registry | Stable feature ID, provider, requirements/conflicts, scopes/targets, optional/required/default policy | Не является npm dependency и не запускает npm |
| **Extension registration** | Editor Extension API и runtime registry Host | Зарегистрированные команды, панели, меню, Inspector editors и lifecycle | Не выполняется только потому, что пакет установлен |

### Важное разделение metadata

**Не нужно придумывать один огромный manifest, в который складываются все сведения.** Для разных данных существуют разные владельцы и жизненные циклы.

1. Package manifest принадлежит автору конкретной версии пакета. Поле codogma является декларативным контрактом между пакетом и движком. Точная schema/version остаётся предметом COD-51 и должна быть подтверждена fixtures.
2. Registry metadata сообщает, что и в какой версии опубликовано в конкретном registry. Это данные обнаружения и публикации.
3. Project manifest и lockfile принадлежат конкретной игре. Их изменяет npm через общий Package Manager Service.
4. Curated catalogue record — отдельная индексируемая запись для улучшенного discovery/UX. Она может добавить description, topics, иконку, screenshot, maintainer, ссылки на changelog/docs и статус проверенной совместимости. Наличие такой записи не обязательно для каждого npm-пакета.
5. Compatibility report Codogma должен явно показывать, что пришло из package manifest, а что подтверждено отдельной проверкой каталога. Заявление автора пакета не следует выдавать за независимую проверку.

Идентификатор результата поиска должен учитывать **registry identity + package name**: одинаковое имя в разных registries не следует молча объединять. Каталоговый alias не равен npm alias и сам по себе не меняет имя устанавливаемого пакета.

## 3. Что именно полезно в OpenUPM

OpenUPM — это Unity UPM registry/ecosystem, а не каталог готовых Codogma-пакетов. В исследовании полезны не Unity-специфичные API, а разделение ролей и данные вокруг package lifecycle.

### 3.1. Разделение исходного пакета и каталога

В репозитории openupm/openupm находятся curated package records в data/packages/*.yml и общие данные каталога. Сам package.json находится в исходном репозитории самого пакета. YAML запись дополняет package manifest: например, содержит displayName, описание, repo URL, SPDX license, topics, изображение, путь README, правила обработки Git tags/releases и информацию о сопровождающем каталога.

Это полезный образец для Codogma: **manifest публикуется вместе с пакетом, catalogue record поддерживается отдельно**. Тогда автор пакета отвечает за технический контракт, а каталог может отдельно отвечать за discovery, навигацию, curated presentation и проверяемые отметки совместимости.

### 3.2. Разделение каталога и платформы

OpenUPM repository содержит package data и CI gate проверки изменений, а application/API/jobs/shared validator находятся в отдельном openupm-next TypeScript monorepo. Это отделяет данные каталога от кода сервиса и его валидации.

Для Codogma это аргумент не смешивать package catalogue с Editor Host или Node-side installer. На первом этапе отдельный hosted catalogue не обязателен: можно начать с поиска по доступным npm registries и оставить типизированный контракт optional catalogue record. Собственный каталог/registry следует вводить только при доказанной продуктовой потребности.

### 3.3. Публикация и версии

OpenUPM отслеживает package source tags/releases и сопоставляет опубликованные версии с metadata каталога. Ценные практики: проверка идентификатора и структуры пакета, SemVer, SPDX license, наличие открытого исходного кода, валидация metadata и повторяемый pipeline.

В Codogma это можно адаптировать позднее к release workflow собственных пакетов: manifest version, Git tag, immutable release artifact, changelog, provenance и проверяемая совместимость. Не следует внедрять Git-tag publisher или каталогную модерацию в MVP Package Manager.

### 3.4. Что делает OpenUPM CLI

OpenUPM CLI изменяет Unity project manifest: прописывает scoped registry и package dependency. Затем изменения обрабатывает Unity Package Manager. Сам CLI в README прямо отделяет изменение manifest от непосредственной установки/удаления tarball.

Для Codogma переносится не формат Unity manifest, а разделение ответственности: UI/CLI инициируют действие, общий service меняет проект через npm, npm выполняет resolution и обновляет package-lock. Discovery, package metadata validation и Feature Registry не должны изображать себя resolver.

### 3.5. Adopt / Adapt / Reject

| Решение | Практика | Применение в Codogma |
|---|---|---|
| **Adopt** | Manifest пакета отдельно от curated package record | Versioned codogma metadata в package manifest; optional catalogue record отдельно |
| **Adopt** | Каталогные записи валидируются автоматически | Schema validation, source/provenance checks и fixtures для каталога, если он будет добавлен |
| **Adopt** | Topics/categories и отдельные ссылки для discovery | Фильтры и карточка Package Manager |
| **Adapt** | Сопоставление Git tags/releases с package versions | Применять в собственном release pipeline; не делать частью resolver |
| **Adapt** | Scoped registries | Использовать npm-compatible registry/scopes в соответствии с COD-60, credential policy и конфликтами scope |
| **Adapt** | Package detail page / install instructions | Перенести в Package Manager details pane с явными действиями проекта |
| **Reject** | Unity UPM package layout, Unity manifest и Unity API | Не совместимы с npm/Phaser/SolidJS архитектурой Codogma |
| **Reject** | Использовать OpenUPM как готовую зависимость или источник пакетов движка | OpenUPM распространяет Unity UPM packages |
| **Reject** | Отдельный собственный resolver/lockfile | npm остаётся единственным dependency resolver и владельцем package-lock.json |
| **Defer** | Собственный hosted registry, каталогная модерация, подписи, рейтинги | Только после подтверждённой потребности, threat model и отдельного ADR |

## 4. Размещение подсистем в Codogma

Поток данных и ответственности:

1. SolidJS Editor Host Package Manager UI вызывает типизированный HTTP/IPC API.
2. Node-side Package Manager Service является общей точкой входа для Editor Host и headless CLI.
3. Service запускает npm CLI для install/update/remove/list, ограничивает операцию активным project root и отвечает за отмену, structured result, диагностику и повторное чтение состояния.
4. Read-only package discovery использует npm-compatible registry APIs/packument; при необходимости обогащает результат optional curated catalogue.
5. Metadata parser читает package.json и декларативное поле codogma. Он не импортирует package entry points и не запускает scripts.
6. Compatibility validation проверяет Engine/API versions, package scope/target и feature descriptors.
7. Feature Registry предоставляет diagnostics для Editor/build; он не разрешает npm dependencies.
8. Extension lifecycle отдельно решает, активировать ли установленное editor extension после explicit trust action.
9. Build pipeline анализирует реальные imports/entry points и создаёт build report по package/feature inclusion и exclusion.

| Область Codogma | Целевое место/владелец | Ответственность |
|---|---|---|
| Package taxonomy, manifest metadata, compatibility schema | ADR-0003 / package contracts, COD-51 | Типы пакетов и декларативный контракт package author |
| Package Manager Service | packages/package-manager, COD-52 | Node-side operations и единственная npm integration point |
| Registry/source configuration | Package Manager Service, COD-60 | npm registry, scoped registries, local/file и позднее другие источники |
| Package discovery and metadata aggregation | service discovery domain, COD-93 | Поиск, packument, версии, manifest data и optional catalogue |
| Feature/Capability Registry | Engine/Build contracts, COD-34 | Проверка логических возможностей, требований, конфликтов и targets |
| Editor Extension API/lifecycle | Editor Host API/extension registry, COD-53 | Явная регистрация UI и lifecycle расширений |
| Package Manager UI | src/editor, COD-92 design + COD-94 implementation | Отдельное окно/панель управления пакетами проекта |
| Selective build and dependency report | Build pipeline, COD-54 | Проверка package scope/target и build report |

**Package Manager не должен становиться новым универсальным Project Model.** Его UI только показывает проектное состояние, а service оркестрирует package operations. Feature Registry, asset importers и extension registration остаются самостоятельными доменами.

## 5. UX/UI Package Manager для Editor Host

Основной UX reference — Unity 6.6 Package Manager: навигационные контексты, поисковая строка, сортировка и фильтры, центральный список пакетов, details pane, контекстные install/update/remove действия, status/error messages и расширенные настройки registry. Это образец организации workflow, а не требование копировать Unity layout pixel-to-pixel.

### 5.1. Основная компоновка

Рекомендуемая базовая композиция — **Navigation → Package List → Details** внутри Workbench:

- **Navigation (слева):** In Project, Updates, Browse/Registry, Local & Workspace, Errors & Warnings. Контексты отражают пользовательские задачи, а не внутренние npm команды.
- **Package List (центр):** название/иконка, package ID, краткое описание, версия, источник/registry, package kind и понятный статус. Toolbar содержит search, sort, filter, refresh и Add Package.
- **Details (справа):** полная карточка выбранного пакета и primary action. На узкой ширине детальная панель может становиться вкладкой/страницей; не уменьшать список до нечитаемого состояния.
- **Operation/status area:** прогресс, очередь, предупреждения и ссылка на диагностику. Долгие операции не должны скрываться за бесконтекстным spinner.

Не создавать новую docking library специально для Package Manager. Использовать текущую модель Workbench/COD-83 и согласованный layout из Pencil.

### 5.2. Details tabs

Предлагаемый набор вкладок, адаптируемый по доступным данным:

- **Overview:** displayName, package ID, summary, icon/media, publisher/maintainer, source/registry, installed/latest version, project action.
- **Versions:** SemVer, dist-tags, prerelease, дата выпуска, compatibility и причина пометки версии как incompatible.
- **Dependencies:** direct/transitive graph, dependency path, peerDependencies и конфликты. Данные npm resolution не подменять собственным resolver.
- **Compatibility:** Codogma Engine version, Editor Extension API version, supported scopes/targets, verified compatibility и unresolved warnings.
- **Features:** provided feature IDs, requirements/conflicts, project enabled и target inclusion.
- **Changelog / Documentation:** ссылки на README, docs и release notes.
- **License & Source:** SPDX identifier, repository/source URL, package registry, provenance и integrity сведения, доступные registry/service.

Показывать только содержательные вкладки; отсутствие README или curated record не должно блокировать просмотр и установку валидного пакета.

### 5.3. Действия и статусы

- **Install / Update / Remove** относятся к dependency tree проекта.
- **Add package** принимает package name/spec либо источник, реально поддержанный текущей фазой COD-60.
- **Registry settings** настраивают name, URL, scopes и состояние credentials. Не отображать секреты; не записывать токены в tracked project manifest.
- **Extension Activate / Disable** — отдельное действие после install и compatibility/trust checks; не часть автоматической установки.
- **Feature enablement** — отдельная настройка project/target configuration, а не установка пакета.
- Различать installed, available, provided, project-enabled, target-included, editor-activated; один пакет может быть установлен, но не активирован или не включён в текущий build target.

### 5.4. Состояния, которые должны быть спроектированы

Loading/refreshing, initial/empty project, empty registry, no search results, unavailable registry, stale cache, update available, incompatible package, unknown metadata schema, dependency/peer conflict, queued/resolving/downloading/installing/validating, cancellation, success, warning, failed operation и recovery required.

Для каждого состояния должны быть видны контекст проекта, пакет/источник, причина, следующий безопасный шаг и доступность действий. Нельзя показывать фиктивный Install/Update или обещать rollback, если сервис не поддерживает это поведение.

### 5.5. Границы UI

- Package Manager управляет **code packages, dependencies и editor extensions**. Asset Browser/Asset Pack управляет игровыми ресурсами и importer pipeline; не смешивать эти области.
- Host dependencies не показываются как project packages активной игры и не добавляются в project manifest.
- Registry search и metadata inspection read-only; project files меняются только через Package Manager Service.
- Каталоговый badge/curated status не означает «безопасный». Внешний пакет/extension потенциально исполняет код с правами процесса.
- Не копировать Unity-specific My Assets, Services, Built-in modules и Feature Sets как обязательные разделы Codogma. Вводить собственные контексты только для существующих package kinds/capabilities.

## 6. Metadata fields: предлагаемое распределение

Окончательные поля Codogma metadata утверждаются COD-51. Ниже — семантическое распределение, а не JSON Schema:

| Семантика | Владелец | Примеры |
|---|---|---|
| Package identity | Package manifest | name, version |
| npm dependency resolution | Package manifest / npm registry | dependencies, optionalDependencies, peerDependencies, engines, exports |
| Version distribution | Registry packument | versions, dist-tags, tarball, integrity |
| Engine package classification | Codogma metadata | kind, scopes, targets |
| Compatibility | Codogma metadata + validator | supported Engine range, Extension API range, schema version |
| Package-provided behavior | Codogma metadata | entry points, capabilities/features |
| User-facing description | Package manifest; optional catalogue enrichment | description, readme, documentation URL |
| Curated discovery data | Optional catalogue record | displayName, topics, icon, screenshots, categories |
| Publisher/source/provenance | Package manifest + registry + catalogue evidence | author/maintainer, repository, release source, verified tag |
| Project installation state | Project manifest + lockfile + npm service result | installed direct dependency, resolved version, integrity |
| Project feature selection | Versioned project configuration / Feature Registry | enabled features and per-target overrides |
| Runtime Editor activation | Extension lifecycle state | activated/deactivated, activation diagnostics |

Правило приоритетов должно быть полевым. Например, фактическая опубликованная версия и integrity берутся из registry/lockfile; package identity и dependency declarations — из package manifest и результата npm; пользовательский display name/topics могут быть обогащены каталогом; verified compatibility показывается отдельно от заявленной автором metadata. Конфликты не должны молча перезаписывать авторитетные технические поля.

## 7. Безопасность и надёжность

- Scoped registries и частные npm registries — источники стороннего исполняемого кода. Подключение registry должно требовать явного действия и показывать scope routing.
- Search/detail/metadata parsing не исполняет package code и lifecycle scripts.
- Install/update могут запускать package lifecycle scripts согласно явной policy; пользователь должен понимать источник и разрешения. Установка не является sandbox.
- Credentials хранятся за отдельной безопасной границей; не попадают в manifests, URLs, UI responses, logs, error payloads или screenshots.
- Ограничивать Package Manager process активным project root; проверять symlink/root escape, subprocess arguments, environment, cancellation и recovery.
- Не отправлять package operations через pathname-based endpoints, для которых в security baseline остаются TOCTOU gaps. Package Manager не должен считать весь файловый API race-safe.
- Ошибка/отмена npm не должна приводить к ложному отображению старого дерева как актуального. После операции перечитывать и валидировать manifest/lockfile и явно показывать состояние восстановления.
- Не заявлять атомарный rollback без отдельного проверенного механизма.
- Не считать manifest capabilities permission sandbox. Реальная изоляция требует отдельного threat model и architecture.

## 8. Планируемые задачи

| ID | Задача | Ответственность |
|---|---|---|
| [COD-51](https://linear.app/codogma-engine/issue/COD-51/utverdit-package-taxonomy-metadata-i-extension-api-contracts) | Package taxonomy, metadata и Extension API contracts | Основа package manifest и codogma schema |
| [COD-52](https://linear.app/codogma-engine/issue/COD-52/realizovat-bezopasnyj-node-side-package-manager-service) | Node-side Package Manager Service | npm operations, project root, process lifecycle |
| [COD-53](https://linear.app/codogma-engine/issue/COD-53/realizovat-editor-extension-lifecycle-i-registraciyu-rasshirenij) | Extension lifecycle и регистрация расширений | Trust/activation и Host contributions |
| [COD-54](https://linear.app/codogma-engine/issue/COD-54/proverit-selective-installation-game-bundle-i-primer-rasshireniya) | Selective installation и game bundle | Проверка package scope/target и build report |
| [COD-60](https://linear.app/codogma-engine/issue/COD-60/podderzhat-istochniki-npm-paketov-poetapno-i-bezopasno) | Источники npm-пакетов | npm/scoped registry и local/file сначала |
| [COD-92](https://linear.app/codogma-engine/issue/COD-92/sproektirovat-package-manager-uxui-dlya-solidjs-editor-host) | Package Manager UX/UI design | Pencil, flows, states и visual review |
| [COD-93](https://linear.app/codogma-engine/issue/COD-93/realizovat-package-discovery-i-otdelnuyu-curated-catalogue-metadata) | Package discovery и catalogue metadata | Search, packument, metadata aggregation |
| [COD-94](https://linear.app/codogma-engine/issue/COD-94/realizovat-package-manager-v-solidjs-editor-host) | Package Manager Host UI | Интеграция UI + services + extension lifecycle |

COD-92 может идти параллельно с контрактами и сервисом. COD-94 зависит от metadata/API contracts, service, supported sources, discovery API и принятого UX. Рутинная разработка на dev проверяется адресными tests/CI; независимая browser/runtime acceptance остаётся отдельным QA/promotion gate и не должна задерживать независимые engineering slices.

## 9. Reference sources

### OpenUPM — pinned research snapshots

- [openupm/openupm @ 1dc0487475625f832a900eed9a696cbb194d9004](https://github.com/openupm/openupm/tree/1dc0487475625f832a900eed9a696cbb194d9004) — package records, catalogue data and CI validation gate.
- [Package metadata contribution guide](https://openupm.com/docs/adding-upm-package) — package identity, source layout, metadata YAML and tag tracking.
- [openupm/openupm-next @ d3335f0b984d8c83dc247489bca2853207324057](https://github.com/openupm/openupm-next/tree/d3335f0b984d8c83dc247489bca2853207324057) — TypeScript apps/services and shared validator implementation.
- [openupm/openupm-cli @ 1e8c662aac67970cb808f7a21dc3d7fb81721001](https://github.com/openupm/openupm-cli/tree/1e8c662aac67970cb808f7a21dc3d7fb81721001) — CLI project-manifest/scoped-registry operations.
- [OpenUPM CLI behavior](https://github.com/openupm/openupm-cli/blob/1e8c662aac67970cb808f7a21dc3d7fb81721001/README.md).

### Unity 6.6 — UX and package concepts

- [Package Manager window](https://docs.unity.com/en-us/engine/6000.6/manual/packages-list/upm-ui-window/upm-ui).
- [Navigation panel](https://docs.unity.com/en-us/engine/6000.6/manual/packages-list/upm-ui-window/upm-ui-nav).
- [Project manifest](https://docs.unity.com/en-us/engine/6000.6/manual/packages-list/managing-packages-manifest/upm-manifest-prj).
- [Scoped registries](https://docs.unity.com/en-us/engine/6000.6/manual/packages-list/upm-scoped/use).

### Codogma normative docs

- [ADR-0003 — Package architecture and management](decisions/ADR-0003-package-architecture-and-management.md).
- [Roadmap — Stage 8](roadmap.md).
- [Editor UI migration](editor-ui-migration.md).
- [Dependency capability matrix](dependency-capability-matrix.md).
- [Reference sources](REFERENCE-SOURCES.md).

---

**Decision:** begin with npm-compatible package management and a distinct Editor Host window. Adopt OpenUPM’s separation of technical package metadata and curated catalogue data. Do not create a bespoke resolver, lockfile or public registry as part of the first implementation.
