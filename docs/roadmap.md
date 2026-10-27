# Дорожная карта: Codogma Engine

Дорожная карта строится вокруг требований [технического задания](technical-specification.md). **Ближайший большой исполнительский этап — модернизация существующего редактора в текущей кодовой базе `source/editor/`**: его UX/UI, основные 2D-workflows, качество изменяемого исходного кода и подтверждение runtime-поведения. Новый Core, перенос каталогов и полная смена UI-стека не должны вытеснять эту работу.

Unity 6 и Cocos Creator 4.0 используются как ориентиры по организации профессионального 2D-редактора и качеству рабочих процессов, а не как требование воспроизвести весь функционал больших движков. Цель — сделать Codogma визуально цельным, удобным и технически надёжным редактором, расширяя существующие подсистемы там, где это оправдано. Каждая задача должна давать работающий результат в коде; документация и матрицы — инструменты принятия решений и фиксации доказательств, а не самостоятельная цель исполнительского этапа.

Каждый этап разбивается на независимые PR с воспроизводимыми критериями приёмки. Сохранять работающие подсистемы и переиспользовать существующие контракты — предпочтительнее переписывания; замену делать только после PoC, показывающего конкретное преимущество.

## Приоритеты и рекомендуемый порядок реализации

Очередность ниже определяет **что агент должен реализовывать первым в существующем репозитории**, а не порядок написания документов. Редакторные улучшения, которые не требуют нового Core, выполняются непосредственно на текущей базе. Архитектурные работы идут параллельно только при наличии отдельной законченной задачи и не должны отвлекать основной поток от редактора.

| Очередь | Рабочий пакет | Приоритет | Измеримый результат / правило |
|---|---|---|---|
| 1 | Инженерная база для изменений существующего редактора | **P0 — сразу** | Clean install, воспроизводимые build/typecheck, тесты для затрагиваемого кода, нужные lint/format checks в ограниченном scope. Не вводить массовый строгий gate для всего legacy-дерева. |
| 2 | Этап 5: визуальная модернизация Editor UX/UI | **P0 — основной видимый результат** | Согласованные панели, toolbar, иерархия, Inspector, assets/workspace, визуальная плотность, типографика, состояния и темы; редактор воспринимается как цельная IDE, а не набор разрозненных legacy-панелей. |
| 3 | Этап 5: стабилизация основных 2D authoring workflows | **P0 — основной функциональный результат** | Scene/Hierarchy/Transform, selection, Inspector/components, сохранение и повторное открытие, Undo/Redo, Prefabs, Asset Pack и существующие инструменты проходят адресные acceptance-проверки. Улучшать текущую реализацию до замены архитектуры. |
| 4 | Этап 5: runtime acceptance и регрессии PR #10 | **P0 — подтверждение качества** | FX Circle/Bloom/Gradient/Shine, Box2D, Asset Pack/importers и codegen проверены в реальном browser/runtime; дефекты исправлены, regression tests добавлены. Зелёная сборка сама по себе недостаточна. |
| 5 | Security fixes для файловых операций и optional mini-services | **P0 для соответствующих API/сервисов** | TOCTOU закрыт race-resistant способом до расширения write APIs/Package Manager; mini-services безопасны по умолчанию до сетевого/недоверенного запуска. Эти фиксы могут идти отдельными PR. |
| 6 | Этап 1: адресное исследование и toolchain migration | **P0 — непрерывно** | Матрицы обновляются по мере реальной проверки; ESLint/Prettier/tests применяются к новому и изменяемому Codogma-owned scope. Полная инвентаризация всего legacy не блокирует исправление подтверждённого дефекта. |
| 7 | Сравнительный PoC Svelte / UI toolchain | **P1 — параллельно, ограниченный scope** | Рабочий прототип на репрезентативной панели, сравнение с текущим Colibri/workbench, решение на evidence. До такого решения не переписывать редактор целиком; обычные улучшения текущего UI не ждут PoC. |
| 8 | Этап 2: Project Model и минимальный Codogma Core | **P1 — после первой стабилизации редактора или отдельным независимым потоком** | Малый проверяемый Project/Scene/Node/Component slice без импорта legacy UI. Core contracts не должны задерживать улучшения, которые можно безопасно сделать на текущей модели. |
| 9 | Этап 3–4A: Preview Host и headless HTML5 build | **P1 — следующие сквозные возможности** | Browser preview, live Inspector и воспроизводимая game build принимаются отдельно после готовности зависимых contracts; существующий `npm run build` не считать сборкой игры. |
| 10 | Platform Services, Tauri, Package Manager и расширенная ecosystem | **P2 / по готовности зависимостей** | Yandex Games раньше последующих targets; Tauri, package ecosystem, PixiJS, дополнительные physics backends и advanced features не отвлекают от текущего редактора без конкретного обоснования. |

## Текущее состояние и границы блокеров (27.10.2026)

Текущая базовая точка `dev` — `754edaa1f7313409e99c3462a802d5fd430a9a01`. Документационный PR #5 и feature PR #10 уже слиты в `dev`. Старые формулировки, где PR #10 описывался как Draft/не часть ветки, считаются устаревшими; runtime follow-ups ниже остаются открытыми.

### Можно начинать сейчас

- **Сразу переходить к изменениям кода существующего редактора.** Матрица возможностей и архитектурные документы уже дают достаточную исходную точку. Дополнять их по мере реализации и проверок, а не превращать их полное заполнение в отдельный большой этап перед первой правкой.
- **Первым потоком делать инженерную надёжность и UX/UI редактора:** необходимые проверки в существующих package roots, улучшение основных панелей и рабочих сценариев, единая визуальная система, темизация и иконки.
- **Закрывать подтверждённые проблемы PR #10** отдельными функциональными задачами: FX, Box2D, Asset Pack, импорт ресурсов, генерация кода. Статус «работает» выставлять только после соответствующего runtime/browser acceptance.
- **Параллельно закрывать security residuals**, не смешивая их с UI-рефакторингом. Race-resistant file API обязателен до новых файловых write paths/Package Manager; optional mini-services обязаны иметь безопасные настройки до запуска в недоверенной сети.
- **Core pilot разрешён параллельно, но не должен быть основной целью ближайшей большой задачи.** Он должен быть изолирован и не блокировать исправление функций, уже реализуемых текущим редактором.
- **Svelte/Vite/dockview/CodeMirror/Monaco исследуются через небольшой рабочий PoC.** Не нужно сначала устанавливать новый стек для всего приложения: сначала сравнить его на одной репрезентативной области, а текущий UI продолжать улучшать.

### P0 — ближайшая исполнительская очередь

1. Подготовить безопасный контур изменений: воспроизводимые clean-install/build/typecheck checks, тестовую инфраструктуру и точечные lint/format проверки для затрагиваемого кода. Новые инструменты внедрять совместимо с текущими root/editor package roots; не форсировать repo-wide строгий режим для legacy.
2. Провести code-level triage по текущему редактору на основе `docs/capability-matrix.md`: выбрать самые заметные UX-пробелы и подтверждённые дефекты, указать файлы/контракты после изучения реализации и сразу приступать к исправлениям. Не заканчивать работу только обновлением таблицы.
3. Модернизировать существующую оболочку/панели редактора: единый визуальный язык, иерархия, toolbar, работа с панелями и tabs, состояния loading/empty/error/disabled/selected, читаемая плотность интерфейса, keyboard navigation/shortcuts и согласованная работа светлой/тёмной тем. Сначала проверить возможности Colibri workbench и расширять их вместо создания конкурирующей оболочки.
4. Реализовать централизованную систему иконок и theme-specific assets на основе закреплённого набора Godot Editor Icons. Инвентаризация IDs, выбор 2D-значков и проверка MIT notices — обязательные шаги реализации, но не основание отложить задачу без срока; итогом должны стать работающий код и визуальная проверка обеих тем.
5. Закрыть основные workflows существующей базы: scene open/edit/save/reopen, hierarchy/selection/Transform, Inspector/components, Undo/Redo, Prefab updates/overrides и ключевые Assets/Pack flows. Каждая изменённая возможность должна иметь regression test и ручной/browser acceptance там, где поведение визуальное.
6. Закрыть runtime follow-ups PR #10: FX generated output vs editor preview, Box2D на 30/60/120 FPS и stop/restart/cleanup, Asset Pack/importer error paths и кодогенерацию. Добавить фикстуры для повторения дефектов.
7. Устранить TOCTOU в файловой безопасности отдельным узким PR; усилить standalone mini-services до безопасных defaults и покрыть negative tests. Не включать новые файловые write operations до race-resistant исправления.
8. Выполнить ограниченный Svelte PoC на реальной панели или редакторском workflow. Сравнить интеграцию, производительность, состояние, темизацию и стоимость bridge с текущим workbench. По результатам записать решение и переходить дальше; не ждать PoC для независимых исправлений текущих панелей.

### Что не блокирует модернизацию текущего редактора

- Завершение полной инвентаризации всех TypeScript-файлов, транзитивных лицензий и всех legacy project configs. Эти сведения пополняются по мере работы и до публикации/массовой архитектурной миграции; они не должны задерживать изолированную исправимую задачу.
- Реализация нового Project Model/Core, runtime adapter или оптимизированного ECS. Это следующий архитектурный поток, а не предусловие для каждой правки текущего Scene Editor, Inspector или Asset Pack.
- Перенос `source/editor` → `src/editor` и npm Workspaces. Они потребуют отдельного миграционного PR до тесной интеграции Editor Host с новыми packages, но не нужны для первой серии UX/bug fixes на текущих путях.
- Полное решение о Svelte. PoC необходимо, чтобы принять архитектурное решение; до результата можно и нужно улучшать текущий UI без необратимой переписи.
- Фактические performance budgets. Сначала нужны воспроизводимые измерения; при этом исправлять подтверждённые блокировки, утечки или грубые регрессии можно сразу с тестом/замером дефекта.
- Tauri, замена Phaser на PixiJS, второй ECS/runtime, дополнительные physics backends и public package registry. Они не входят в основной scope этого этапа.

### Что не следует делать параллельно «на всякий случай»

- Не переписывать Colibri/Editor Host целиком и не переносить весь интерфейс на Svelte без сравнительного PoC и плана совместного существования подсистем.
- Не останавливать исправление существующего редактора, пока проектируют идеальный Core. Для каждой задачи выбирать минимальный контракт, необходимый именно ей.
- Не сводить модернизацию к замене цветов/иконок: визуальная работа должна включать и функциональные состояния, клавиатурный workflow, layout панелей и связанные пользовательские сценарии.
- Не оставлять icon migration только в виде карты: после инвентаризации выполнить внедрение в согласованном UI scope, с отдельными light/dark variants и attribution.
- Не вводить сразу строгий lint/format gate на все legacy-пакеты, не менять все lockfiles/путь editor и не переводить всё на Workspaces одной операцией.
- Не заменять Phaser, не добавлять EVA.js как второй runtime и не вводить ECS-оптимизацию без доказанного gap, PoC и измерений.
- Не отмечать runtime-функции завершёнными по одному лишь TypeScript build, наличию кнопки или генерации исходника.
- Не добавлять зависимости «на будущее». У каждой зависимости должны быть используемая функция, лицензия, scope, критерии приёмки и доказательство, почему текущей реализации недостаточно.

## Принципы ведения roadmap

1. Один PR — одна логически завершённая задача. Работу крупной фазы не переносить целиком одним большим PR.
2. Не закрывать чекбокс по наличию кода или успешной компиляции: нужен результат соответствующего acceptance test.
3. Перед переписыванием существующей функции определить, что уже работает в текущем Colibri/Phaser Editor client, где расположены ограничения и что действительно надо заменить.
4. Новый модуль проходит критерии и сравнивается с legacy-сценарием до удаления старой реализации.
5. Не создавать вторую сущность, сцену или игровой цикл там, где можно добавить adapter к существующей реализации.
6. Исходники самостоятельных, независимо подключаемых возможностей оформлять как пакеты в `packages/` внутри монорепозитория; не создавать пакет на каждый класс. Публичную публикацию выполнять только после стабилизации API, SemVer/compatibility policy, тестов и документации. Локальную совместную разработку связывать через npm Workspaces.
7. Для архитектурных рисков сначала создать PoC и критерии решения. Не считать выбор Tauri, Svelte, PixiJS или ECS доказанным только потому, что существует удачный open-source пример.
8. Значимые пользовательские изменения фиксировать в `CHANGELOG.MD`; обновлять ТЗ и roadmap, когда меняется цель, формат проекта или критерии этапа.
9. Сохранять применимые upstream-уведомления и лицензии. Удаление legacy-кода не означает автоматического права убрать авторские уведомления.

## Как использовать ТЗ, roadmap и технические источники

- [Техническое задание](technical-specification.md) — нормативный контракт продукта, архитектуры и acceptance criteria.
- [Каталог источников](REFERENCE-SOURCES.md) — официальные руководства/исходники, версии, кандидаты библиотек и замечания по лицензиям. Ссылка в каталоге является reference, а не утверждением о выборе зависимости.
- [README](../README.md) — подтверждённые команды локальной разработки, правила веток/PR и действующие CI checks.
- Для API/runtime decisions в первую очередь сверять [Phaser docs](https://docs.phaser.io/phaser/getting-started/what-is-phaser), [EVA.js repository](https://github.com/eva-engine/eva.js), [Cocos Creator 4.0 manual](https://docs.cocos.com/creator/4.0/manual/en/) и [Unity 6.6 2D manual](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d). Cocos Creator manual и исходный репозиторий Cocos 4 — разные источники; Unity/Cocos описывают поведение своих продуктов, но не заменяют проектные решения Codogma.
- Для нового кода обязательны TypeScript strict profile и автоматические quality checks из раздела 12.1 ТЗ. Toolchain candidates: [ESLint/typescript-eslint](https://typescript-eslint.io/getting-started/), [Prettier](https://prettier.io/docs/install.html), [Knip](https://knip.dev/), [dependency-cruiser](https://github.com/sverweij/dependency-cruiser). Не указывать команды как доступные, пока они не реализованы.

### Definition of Ready для каждой задачи

Перед началом реализации карточка задачи/PR должна содержать:
1. Ссылку на раздел ТЗ и соответствующий пункт roadmap.
2. Точный пользовательский сценарий или технический дефект и ожидаемое поведение.
3. Перечень затрагиваемых подсистем/файлов после исследования исходников; не выдумывать пути до аудита.
4. Acceptance criteria и минимальный воспроизводимый fixture/test.
5. Обязательные обратносуместимые изменения, миграции/ограничения и то, что явно не входит в scope.
6. Кандидатные библиотеки/источники с версией и лицензией, если нужны; новые зависимости — только после доказательства пробела и решения по PoC/ADR.

### С чего начинается реализация

**Первое агентное задание должно быть кодовым: модернизировать существующий Editor Host и его основные 2D-workflows на текущей базе.** Документы этого PR служат входным контекстом, а не очередным deliverable для агента. Не поручать исполнителю повторно собирать эти же матрицы/ADR до начала работы, кроме адресного уточнения конкретного спорного поведения.

Ожидаемый рабочий порядок:
1. Проверить актуальный `dev`, установить проект согласно README, запустить доступные build/typecheck/smoke checks и зафиксировать фактический baseline.
2. Выбрать конечную группу связанных UI/functional workflows (например, Scene Editor + Hierarchy/Inspector или Asset Pack) и начать с реального кода. Указанные в матрице runtime gaps PR #10 включать в ближайшие задачи, когда соответствующая подсистема затрагивается.
3. Добавить/настроить tests и lint/format для изменяемого Codogma-owned scope. Не включать новые строгие правила на всё legacy-дерево без исправления/миграционного плана.
4. Реализовать согласованную UI-систему и иконки как видимые продуктовые deliverables, включая светлую и тёмную тему. Провести browser acceptance на целевых размерах окна, приложить screenshots до/после или эквивалентные воспроизводимые результаты.
5. Провести сравнительный Svelte PoC отдельным небольшим scope, не блокируя независимые исправления текущего workbench.
6. Для каждого крупного набора изменений открыть отдельный PR с регрессионными тестами и перечислением фактически пройденных проверок; обновить соответствующие части матрицы/worklog по результатам.
7. После первой стабилизации редактора выбрать следующий Core/Preview/HTML5 build slice на основе зависимостей, а не переписывать весь legacy editor заранее.

Полная инвентаризация source tree, фактические performance measurements, migration `source/editor` → `src/editor` и npm Workspaces остаются отдельными задачами, необходимыми к соответствующим gates. Они не используются как повод откладывать независимую модернизацию редактора.

### Подготовленные reference-документы — использовать, не пересоздавать

Эти документы уже созданы как результат предыдущего этапа аудита. Они сохраняют свою актуальность как справочная база и уточняются вместе с кодом, когда меняется фактическое состояние. Агенту не поручается повторно генерировать их вместо реализации.

- `docs/capability-matrix.md` — фактические возможности редактора/runtime/build, evidence, тесты и непроверенные gaps.
- `docs/dependency-capability-matrix.md` — зависимости, версии, лицензии, scope и последствия для реализации.
- `docs/decisions/ADR-0001-core-architecture.md` — границы будущих Project Model/Core/Phaser adapter/Preview Host; относится к будущей интеграции Core.
- `docs/performance-baseline.md` — протокол и fixture для измерений; реальные результаты добавляются только после воспроизводимых прогонов.
- `docs/decisions/ADR-0002-typescript-toolchain.md` — политика TypeScript, lint/format/test и постепенного усиления quality gates.
- `docs/decisions/ADR-0003-package-architecture-and-management.md` — целевые package/workspace/extension boundaries и Package Manager; не блокирует изменения текущего editor UI.
- `docs/code-quality-baseline.md` — исходное состояние compiler/build/security checks и ограничения того, что подтверждается CI.

## Этап 0 — базовая версия и текущая инфраструктура

**Статус: реализованная исходная база.** Используется для сравнения и регрессионной проверки, а не как свидетельство готовности будущих subsystem-ов.

- [x] Брендинг Codogma Engine и metadata продукта.
- [x] Локальный Node.js сервер обслуживает editor UI и проектные HTTP API.
- [x] Интеграция Phaser 4.2.1, типы и адаптации компилятора/редактора.
- [x] Существующие инструменты Scene Editor, Inspector, Prefabs/Components, Assets/Pack, Animations, Tilemap и связанные с ними editor plugins.
- [x] Контракт файлового доступа `IFileStorage`, registry расширений и базовая инфраструктура Undo/Redo в существующем клиенте.
- [x] MCP bridge и необязательный AI Chat service.
- [x] CI Fast: проверка маршрута PR, install dependencies, build редактора и server smoke test.
- [x] MCP integration workflow на PR в `test`/`main`.
- [x] Release workflow формирует ZIP GitHub Actions artifact на `main`.

**Ограничения, которые остаются открытыми:**

- [ ] Автоматизированная карта capabilities: что в каждом редакторе работает, что требует доработки и что ещё не покрывается тестами.
- [ ] Подтверждённая интеграция редактора с живыми объектами runtime, live Inspector и полный browser acceptance pipeline.
- [ ] Собственное независимое от Phaser публичное Engine API / component system.
- [ ] Полный HTML5 asset/build pipeline и platform SDK adapters.
- [ ] Отдельный desktop installer; текущий ZIP artifact не является таким installer.

## Этап 1 — аудит исходников, модель данных и архитектурные решения

**Цель:** дать достаточно фактов, чтобы безопасно модернизировать существующий Editor Host, а не превратить подготовительный этап в отдельный документационный проект. Основные матрицы, ADR и baseline-протоколы уже созданы; неизвестные области уточняются непосредственно перед изменением соответствующего кода.

### Внутренняя очередь выполнения

1. **Начинать с текущего кода:** изучить выбранную подсистему, реальные UX/behavior gaps, существующие contracts, tests и runtime path. Для подтверждённой проблемы сразу формировать implementation PR, а не ждать полной инвентаризации всего репозитория.
2. **Ввести необходимые quality checks в изменяемом scope:** clean install, TypeScript build, targeted tests, ESLint/Prettier для нового/изменяемого Codogma-owned кода; Knip/dependency-cruiser сначала работают в report mode. Не ломать массово legacy Colibri.
3. **Пополнять матрицы по evidence:** фиксировать, что реализовано, что исправлено, какие тесты прошли и что осталось непроверенным. Документация обновляется вместе с соответствующим кодом и не заменяет его.
4. **Оформлять архитектурные решения по необходимости:** strict toolchain pilot, Core contracts и migration plans нужны для новых модулей и тесной интеграции; они не являются gate для независимых UI/bug fixes существующего редактора.
5. **Отдельный gate перед тесной интеграцией нового Core:** принять ADR-0001/0002, пройти toolchain pilot и contract tests. Перенос `source/editor` → `src/editor` и npm Workspaces выполнять отдельными проверяемыми миграционными PR до интеграции в общий Editor Host; не объединять миграцию с массовым рефакторингом.

### Задачи

- [x] Зафиксировать baseline доставки Phaser 4.2.1 по `plugin.json`, root/editor manifests, declarations и Box2D ambient types; сверить с upstream tag `v4.2.1` и отличить модульную структуру исходников от текущего bundle-based подключения Codogma. Вывод и ссылки зафиксированы в ТЗ и каталоге источников; фактическое исключение Phaser-кода из production bundle остаётся отдельной проверкой этапа 4A.
- [x] Создать первоначальную статическую `docs/capability-matrix.md` с evidence и раздельными статусами реализации/автоматических проверок/runtime acceptance; остающиеся runtime gaps перечислены отдельными follow-ups. Обновлять строки по мере проверки функций.
- [ ] Включить отдельные workflow-строки для Sprite Editor (slicing/trim/pivot/collision shapes/sorting/9-slicing), Tilemap brushes/layouts/chunks, camera/coordinate conversion, input (mouse/keyboard/touch), audio lifecycle, UI layouts/text, particles/lighting, localization, save storage и Dev/Release build profiles.
- [ ] Инвентаризировать TypeScript configs/project references, TS compiler options, scripts and lockfiles во всех packages, оценить совместимость обновления от TypeScript 5.3.3, текущий scope TSLint и generated/dynamic plugin entry points; не предполагать, что repo-wide checks уже существуют.
- [ ] Зафиксировать toolchain baseline и staged migration plan для strict TypeScript, ESLint/typescript-eslint, Prettier, Knip и dependency-cruiser; отметить точный initial scope для новых Codogma modules и текущие legacy findings.
- [ ] Для каждой возможности указать: существующая реализация, публичный/внутренний контракт, покрывающие тесты, ограничения и gap относительно целевого UX.
- [ ] Зафиксировать текущие форматы сцен/префабов/ассетов и правила серилизации, идентификации ресурсов и обновления ссылок.
- [ ] Инвентаризировать импортные метаданные, повторный импорт, sprite sheet slicing, atlas build, PSD/Aseprite/Tiled interoperability и явно записать ограничения/потери данных каждого формата.
- [ ] Проследить вызовы существующего `IFileStorage`, HTTP API, plugin registry и Undo/Redo: найти реальные границы, которые можно развивать без переписывания Colibri.
- [x] Создать первоначальную `docs/dependency-capability-matrix.md` для текущих direct package roots, Phaser bundle и Box2D runtime path.
- [ ] Завершить транзитивную dependency/SBOM, license и provenance инвентаризацию; проверить ограничения и стоимость обновления значимых зависимостей до публикации пакетов.
- [ ] Для нового Core toolchain зафиксировать pinned devDependencies, scripts и lockfile; legacy TSLint dependency уже отсутствует, но `lint.sh`/`tslint.json` остаются неактивными артефактами. Удалить или заменить их отдельным cleanup после пилота.
- [ ] Определить вертикальный срез для будущих изменений: сцена → custom TypeScript component → Inspector metadata → save/reopen → preview → live selection/diagnostics → HTML5 build.
- [ ] Подготовить ограниченный TypeScript toolchain pilot для нового Codogma-owned module: strict typecheck, lint, format check, Knip/dependency report и unit test, не затрагивая массово наследуемый Colibri code.
- [x] Зафиксировать решения первого vertical slice в `docs/decisions/ADR-0001-core-architecture.md`: Project Model, Component-object Core, runtime adapter и browser-first Preview Host. Детальные API signatures остаются test-driven реализационными задачами.
- [x] Оформить `docs/decisions/ADR-0002-typescript-toolchain.md`: strict profile и scope нового Core, ESLint/Prettier/Vitest, Knip/dependency-cruiser report mode и staged CI ratchet. Сам toolchain pilot ещё не реализован.
- [ ] Поддерживать `docs/decisions/ADR-0003-package-architecture-and-management.md` как нормативное решение: целевые исходники Editor Host в `src/editor`, самостоятельные package roots в `packages/*`, `@codogma/cge` в `packages/cge`, npm Workspaces для локальной разработки, selective installation в пользовательские проекты и Extension API; точная metadata schema и детали migration/workspace tooling проходят PoC.
- [ ] После фиксации capability/dependency baseline подготовить и выполнить отдельный migration PR `source/editor` → `src/editor`: сохранить внутреннюю структуру и TypeScript project references; обновить root scripts, server `EDITOR_DIR`, CI/cache paths, release archive, `BUILD.md` и README; проверить root/editor clean install, сборку, HTTP smoke и состав ZIP. Не объединять перенос каталога с workspace/lockfile migration.
- [x] Создать `docs/performance-baseline.md` с fixtures и протоколом воспроизводимых измерений без выдуманных порогов.
- [ ] Выполнить и сохранить фактические performance measurements на согласованном окружении; не вводить budgets до получения повторяемых raw samples.

### Критерии приёмки

- [x] Есть первоначальная таблица статусов `docs/capability-matrix.md` с путями evidence, автотестами и оставшимися runtime-acceptance gaps.
- [x] Созданы initial versions `docs/dependency-capability-matrix.md`, `docs/decisions/ADR-0001-core-architecture.md`, `docs/decisions/ADR-0002-typescript-toolchain.md`, `docs/performance-baseline.md` и `docs/code-quality-baseline.md`; `ADR-0003` уже существует. Неизвестные сведения помечены как непроверенные.
- [ ] Закрывать содержательные остатки baseline-документов по потребности соответствующего PR и перед публикацией/массовыми архитектурными изменениями; они не блокируют отдельные безопасные UI/bug fixes существующего редактора.
- [ ] Новый TypeScript pilot проходит strict typecheck, lint, format check и соответствующие unit tests; Knip/dependency-cruiser report scope и false-positive handling документированы.
- [ ] Выделены минимальные контракты Project Model, Runtime Adapter и Preview Host.
- [ ] Подтверждено, какие возможности надо расширять внутри текущего редактора, а какие — изолировать или заменять.
- [ ] Отдельная миграция `source/editor` → `src/editor` принята после сборки редактора, server smoke, CI/release path audit и проверки ZIP без лишних файлов; рабочие команды и README указывают на реально существующие пути.
- [ ] Технологические кандидаты не записаны как окончательное решение без PoC.
- [ ] Риски совместимости и лицензирования описаны с владельцами/планом проверки.

---

## Этап 2 — Project Model и собственный TypeScript Component/ECS Core

**Цель:** создать основу собственного движка над существующим runtime — не подключать второй game runtime поверх Phaser, а связать editor model и игру через общий API.

**Зависимости:** этап 1.

### Внутренняя очередь выполнения

1. **Сначала — формат данных:** схема Project/Scene/Node/Transform/Component/Prefab/Asset Reference, стабильные IDs, сериализация, versioning/migrations и compatibility fixtures.
2. **Затем — минимальный API:** Node/Entity, Transform, Component, lifecycle, events и metadata/schema; Inspector, serialization и runtime adapter используют одну схему.
3. **Затем — один рабочий adapter:** один объект/компонент проходит весь цикл до Phaser display object и обратно к runtime diagnostics. Проверить lifecycle, структурные изменения и disposal; не создавать независимый ticker или вторую точку истины.
4. **Затем — сервисы по реальному срезу:** Input, Time/Tween/scheduler и Scene Manager сначала проектируются на уровне контрактов, а реализуются по минимальной очереди, необходимой для первого реального проекта. Обязательно проверять focus loss, cancellation, pause/resume и cleanup там, где соответствующая capability входит в срез.
5. **Отдельное решение, а не предположение:** data-oriented ECS и дополнительные physics backends не входят в минимальный Core автоматически. Сравнить component-object API и нужные physics capabilities на fixture; усложнять модель только если это оправдано тестами/измерениями.

### Задачи

- [ ] Подготовить минимальный npm Workspace/package skeleton с исходниками Core в `packages/cge` и только теми самостоятельными пакетами, которые нужны первому vertical slice. После отдельной миграции добавить `src/editor` в root Workspaces при подтверждённой совместимости; package/lockfile consolidation провести отдельным проверяемым изменением. Не создавать `src/cge` как параллельный корень исходников.
- [ ] Определить схему проекта и сериализованные контракты для Project, Scene, Node/Entity, Transform, Component, Prefab, Asset Reference и runtime configuration.
- [ ] Ввести стабильные идентификаторы сущностей, компонентов и ассетов; определить поведение переименования/перемещения и восстановления ссылок.
- [ ] Определить версионирование формата и механизм миграции; подготовить compatibility fixtures для текущих проектов.
- [ ] Спроектировать минимальный публичный TypeScript API: Node/Entity, Component, Transform, lifecycle, события и service access.
- [ ] Утвердить границы API для Input (mouse/keyboard/touch и coordinate spaces), Time/Tween/scheduler и Scene Manager (async load, transition, cancellation, disposal); отдельные необязательные capabilities не должны проникать во все компоненты.
- [ ] Прототипировать ECS/component core: registry компонентов, system scheduler, детерминированный lifecycle, структурные изменения и disposal.
- [ ] Интегрировать runtime core в управляемые фазы Phaser tick; не заводить независимый `requestAnimationFrame`.
- [ ] Добавить Component Schema/Metadata для полей Inspector, валидации, default values и ссылок на ресурсы.
- [ ] Создать Phaser adapter для выбранного среза: сущность ↔ sprite/view, Transform ↔ display transform, physics body и lifecycle.
- [ ] Обеспечить одну точку истины для каждого значения. При переносе HP/Transform/AI-state старое поле не должно продолжать независимо изменяться.
- [ ] Изучить EVA.js (GameObject/Component/System, lifecycle, metadata, component observer) как reference. Не подключать его целиком до проверки дублирования Scene/Game/Ticker и renderer dependencies.
- [ ] Сравнить удобство component-object API и необходимость data-oriented ECS на реальном сценарии; не усложнять всё ядро ради неподтверждённого выигрыша FPS.

### Критерии приёмки

- [ ] Работает минимальная сцена с Node, Transform и пользовательским TypeScript-компонентом на текущем Phaser runtime.
- [ ] Lifecycle тестируется при создании, активации, отключении, повторной активации и уничтожении объекта.
- [ ] Добавление/удаление компонентов во время system update безопасно и детерминировано.
- [ ] Повторное открытие проектного файла сохраняет данные; неизвестные/новые поля не теряются молча.
- [ ] Inspector использует те же metadata/schema, что и сериализация и runtime adapter.
- [ ] Core можно тестировать без запуска редактора UI; его публичные API не импортируют Colibri/Tauri API напрямую.
- [ ] Есть результат performance comparison для representative fixture; ECS не объявляется ускорением без данных.
- [ ] Контракты Input/Time/Scene Manager, если входят в пилот, покрывают focus loss, UI-vs-world routing, pause/resume и безопасное освобождение timers/listeners.

**Gate:** прежде чем массово переписывать текущие игровые сущности, Core проходит отдельный пилот на одной законченной механике. Интеграция с Last Hero может использоваться как дополнительная реальная проверка через отдельную ветку/репозиторий, но Codogma не должен получать жёсткую зависимость на код игры.

---

## Этап 3 — Game Preview Host, live Inspector и runtime debugging

**Цель:** сделать рабочую игру доступной из редактора как реальную runtime-сессию, а не только как результат генерации кода.

**Зависимости:** базовые Project Model и Runtime Adapter contracts из этапа 2; первые прототипы можно делать параллельно без ожидания полной ECS.

### Внутренняя очередь выполнения

1. **Первая цель — Browser Preview:** запустить fixture в обычном браузере, обрабатывать повторные Play/Stop/Restart, ошибки запуска и завершать принадлежащие preview процессы без утечек. Это первый путь; Tauri не требуется.
2. **Сразу после него — runtime identity и диагностика:** связать runtime entity/component ID с Project Model, получать реальные runtime values, различать runtime mutations и serialized source data, привязывать errors/logs к запуску.
3. **Следующий UI-слой — Embedded Game View:** подключать после доказанного browser lifecycle. Сравнить отзывчивость редактора под нагрузкой; не обещать изоляцию, если не измерены отдельные context/window/process.
4. **Только затем — расширенная диагностика:** overlays, time scale и single-step после подтверждения scheduler semantics. Отдельное окно — дополнительный способ проверки fullscreen/input/scaling, а не блокер первой browser-сессии.

### Задачи

- [ ] Выделить Game Preview Host с отдельным контрактом от Tauri/Electron и текущего HTTP сервера.
- [ ] Реализовать управление preview: Play, Pause, Resume, Restart/Stop, resize viewport и передачу log/error events.
- [ ] Поддержать Embedded Game View для быстрой итерации.
- [ ] Поддержать запуск игры в отдельном окне, чтобы проверять fullscreen, input, scaling и поведение без панелей редактора.
- [ ] Сохранить внешний запуск в обычном браузере для проверки целевого HTML5 runtime.
- [ ] Реализовать связь runtime entity/component ID с Project Model, когда это возможно без неоднозначности.
- [ ] При выборе объекта во время игры позволить переход к соответствующему объекту редактора и отображать фактические runtime values в Inspector.
- [ ] Разделить transient runtime mutation и изменение исходных сериализованных данных; UI обязан явно обозначать выбранный режим.
- [ ] Передавать сообщения об ошибках запуска, compile/runtime exceptions и недоступных ресурсах.
- [ ] Добавить debug overlays для Transform/physics bodies/collisions в рамках поддерживаемого runtime.
- [ ] Определить семантику time scale и single-step; реализовать после подтверждения, что scheduler может гарантировать корректное pause/step.
- [ ] Измерить отзывчивость редактора под нагрузкой preview. Если embedded preview блокирует UI, проверить отдельный context/window/process вместо обещания изоляции по умолчанию.

### Критерии приёмки

- [ ] Сквозной сценарий: открыть fixture → изменить сцену/компонент → запустить → увидеть игру → выбрать live entity → проверить его компоненты → остановить и повторить запуск.
- [ ] Команды жизненного цикла preview обрабатывают повторные вызовы и ошибки; зависшие server/preview процессы не остаются после Stop/закрытия.
- [ ] Error/log messages связаны с текущим запуском и доступны для диагностики.
- [ ] Live Inspector показывает runtime state, а не только сериализованные значения из editor model.
- [ ] Сборка/запуск браузерного preview не требует Tauri.
- [ ] В документации указаны ограничения процесса изоляции и метрик; производительность подтверждена замером на fixture.

---

## Этап 4 — HTML5 Build Pipeline и Platform Services

**Цель:** проверять не только сцену в редакторе, но и выпускаемую игру; встроить платформенные интеграции через устойчивый API.

**Зависимости:** Project Model и Preview Host из этапов 2–3; platform integration не должна блокировать независимую HTML5-сборку.

### Очередность внутри этапа

1. **Сначала build и validation:** headless-вызов, стабильный output, диагностика схемы/ссылок/ассетов, отделение editor-only зависимостей от game bundle.
2. **Затем resource pipeline:** dependency graph, отчёт о bundle size и только те atlas/compression/import steps, для которых подтверждён gap и выбран воспроизводимый инструмент.
3. **Затем Platform Services:** общий контракт и mock/local adapter; после этого — Yandex Games как первая целевая интеграция.
4. **Отдельными последующими задачами:** VK Mini Apps и VK Play, каждое с собственной capability matrix и acceptance в соответствующем окружении. Не реализовывать все платформенные функции в одном PR.

### Задачи

- [ ] Инвентаризировать используемые builder/bundler-инструменты и расширять существующий pipeline, прежде чем вводить новый.
- [ ] Добавить проверку project schema, отсутствующих ссылок, недоступных ассетов, конфликтов ID и неиспользуемых ресурсов там, где их можно определить безопасно.
- [ ] Построить dependency graph ресурсов для проекта и отчёт о размере/составе production bundle.
- [ ] Проверить, можно ли заменить текущий вендорный Phaser bundle на совместимый upstream variant или воспроизводимую кастомную сборку; на fixture сравнить runtime/API coverage, raw/gzip size и фактическое inclusion/exclusion. Если модуль нельзя исключить проверяемо, зафиксировать ограничение и не заявлять селективную сборку только на основании feature metadata.
- [ ] Ввести минимальный Feature/Capability Registry contract для встроенных функций и test fixture (stable feature IDs, provider, scopes/targets, declared requirements/conflicts); первая сборочная версия не должна зависеть от готовности UI Package Manager.
- [ ] Хранить выбор необязательных features в версионируемой project/target configuration отдельно от установленного npm dependency tree; defaults и required features должны быть явными. На этапе 4A допускается встроенный registry и mock/fixture provider; интеграцию реальных package-provided descriptors через `codogma` metadata выполнить на этапе 8 после утверждения package metadata schema.
- [ ] На основе выбранных features и target вычислять declared feature-dependency closure, проверять недостающих provider packages, конфликты и unsupported scopes/targets; выдавать machine-readable diagnostics, не устанавливая npm dependencies автоматически.
- [ ] Включить состав selected features и причины inclusion/exclusion в build report; проверить на fixture, что выключенные/неподдерживаемые и editor-only contributions не попадают в production bundle там, где это доказуемо import graph/bundler.
- [ ] Добавить target-aware texture compression/quality profiles, atlas variants и fallback для несовместимых browser formats; отчёт должен объяснять размер выбранных вариантов и включение ресурсов.
- [ ] Ввести версионируемые Development/Release build profiles и документировать browser/target matrix, startup size, source maps/debug tools и исключение editor-only dependencies из production; проверить возможность использования [Vite](https://vite.dev/guide/) только после сравнения с текущей сборкой.
- [ ] Реализовать воспроизводимую HTML5-сборку с понятными сообщениями об ошибках и определённым выходным каталогом.
- [ ] Добавить подходящие обработчики ассетов: атласы, оптимизацию изображений, проверку аудио/шрифтов и другие операции только при подтверждённой потребности.
- [ ] Подготовить platform-neutral API Platform Services и Mock/Local implementation.
- [ ] Проверить локальное сохранение пользовательского состояния/прогресса с версионированием, миграциями, повреждёнными данными и graceful handling недоступного browser storage.
- [ ] Добавить Yandex Games adapter к официальному SDK и тестовую реализацию для локальной разработки.
- [ ] Отделить VK Mini Apps/VK Bridge и VK Play как разные targets/integrations с отдельными возможностями.
- [ ] Определить capabilities адаптеров: реклама, rewarded ads, покупки, сохранения, лидерборды, player info и pause/resume.
- [ ] Обрабатывать отказ/отсутствие SDK, смену фокуса, закрытие рекламы, ошибки и восстановление игрового цикла.
- [ ] Проверить первую реальную платформенную интеграцию в допустимом test/sandbox окружении и задокументировать требования к публикации.

### Критерии приёмки

- [ ] Получается независимая HTML5-сборка, работающая без editor server и без Tauri.
- [ ] Сборка проходит asset/project validation и сообщает ошибки до публикации.
- [ ] Platform API работает через mocks локально и через отдельный adapter в целевом окружении.
- [ ] Rewarded reward выдаётся только после подтверждённого успешного завершения рекламного сценария.
- [ ] Недоступность платформенного SDK не приводит к падению базовой игры.
- [ ] В тестах и документации разделены Yandex Games, VK Mini Apps и VK Play.
- [ ] Runtime/build-only зависимости не попадают в лишние production bundles.
- [ ] Feature Registry различает package installed, feature provided/available, feature enabled in project, target-included и runtime/editor-activated states; один статус не переключает другой автоматически. На этапе 4A package-installed/provider state разрешено проверять через тестовый fixture descriptor, не считая финальный package metadata contract уже утверждённым.
- [ ] Fixture проверяет feature dependency closure, отсутствующий provider, несовместимую комбинацию/target и структурированную диагностику.
- [ ] Повторная сборка с той же конфигурацией даёт стабильный список выбранных функций и эквивалентный состав bundle; tree-shaking claims подтверждаются измеримым bundle report, а не одним лишь описанием metadata.
- [ ] В feature-build acceptance явно разделены логическое отключение функции и физическое исключение её runtime-кода; для Phaser-пути исключение считается доказанным только после проверки конечного bundle на fixture.

---

## Этап 5 — качество существующего редактора и 2D-производственные инструменты

**Цель:** сделать текущую кодовую базу основой профессионального 2D-редактора, сопоставимого по качеству основных рабочих процессов и цельности интерфейса с Unity 6 и Cocos Creator 4.0. Это основной исполнительский этап: он должен приводить к изменениям в `source/editor/`, regression tests и проверяемому runtime-поведению, а не только к дополнительным документам.

**Зависимости:** текущая реализация и её existing data/file/plugin/Undo-Redo contracts. Полная готовность нового Core, Preview Host, HTML5 pipeline, перенос `source/editor` → `src/editor` и npm Workspaces **не являются предусловиями** для задач, которые можно корректно выполнить на нынешней базе. Если функция действительно зависит от нового контракта, изолировать только эту подзадачу; не блокировать ею остальную модернизацию.

### Задачи

- [ ] Сначала проверить существующие Colibri/workbench capabilities (панели, вкладки, dock/resize/layout, shortcuts, commands) и усиливать их вместо реализации конкурирующей оболочки.
- [ ] Сформировать и реализовать согласованную визуальную систему редактора: типографика, spacing/density, размеры контролов, toolbar/menu patterns, focus/hover/disabled/selected/error/loading/empty states, keyboard navigation и базовые accessibility expectations.
- [ ] Привести главную рабочую среду к профессиональному 2D-editor workflow: Scene/Game view, Hierarchy, Inspector, Assets/Pack и Console/diagnostics должны иметь понятную роль, согласованную визуальную иерархию и эффективный default layout. Не создавать фиктивные панели без работающего содержания.
- [ ] Проверить поведение панелей при изменении размера окна/панелей, сохранение/восстановление рабочих раскладок и доступность ключевых команд через keyboard shortcuts; переиспользовать существующие механизмы, а новые добавлять только при доказанном gap.
- [ ] Для каждой выбранной подсистемы фиксировать необходимые gaps, tests и acceptance вместе с реализацией, а не выполнять полную инвентаризацию всех файлов до первого исправления.
- [ ] Усилить основной Scene Editor workflow: hierarchy, Transform, selection, multi-edit, Undo/Redo, безопасное сохранение.
- [ ] Проверить Sprite Editor workflow: single/multiple import, sprite sheet slicing, trim/crop, pivot, generated/editable collision geometry, sorting layers/groups, 9-slicing и tiled draw mode.
- [ ] Проверить atlas preview/analyzer: rendered vs culled sprite counts, atlas page count and utilization, duplicate/unused atlas assignments and target variants where instrumentation allows.
- [ ] Зафиксировать правила camera/world/local/screen/UI coordinate conversion, Y-based sorting для top-down сцен, camera bounds/follow и render order между world и UI.
- [ ] Согласовать component metadata, Inspector, custom TypeScript и runtime model.
- [ ] Проверить Prefabs/nested Prefabs/overrides, обновление экземпляров и сохранение связей.
- [ ] Улучшить Tilemap workflow: layers/palettes, reusable brush presets/custom brushes, rule tiles/auto-tiling, collisions/object layers, animated tiles и совместимый [Tiled](https://docs.mapeditor.org/en/latest/manual/introduction/) import/export с предупреждением о неподдерживаемых свойствах.
- [ ] Проверить square-grid workflow, затем оценить hex/isometric layouts; измерить tilemap chunk updates/culling и не перестраивать целую карту при изменении одной клетки.
- [ ] Развивать Animation workflow: timeline/keys/curves/events и state graph по подходам [Cocos Animation Graph](https://github.com/cocos/cocos4/tree/v4.0.0/cocos/animation/marionette) / [Unity Animator Controller](https://docs.unity.com/en-us/engine/6000.6/manual/animation-section/animation-mecanim/animation-animator-controller/animator), но только если это оправдано реальными требованиями и совместимо с текущим Phaser runtime.
- [ ] Проверить Physics Editor на соответствие runtime bodies, collision layers/masks, editable sprite collision shapes и debug overlays; сверить реальные возможности [Phaser physics](https://docs.phaser.io/phaser/concepts/physics) и кандидатов только через ADR/PoC.
- [ ] Проверить input focus/routing (UI versus world), touch cancellation, camera coordinate transforms, audio unlock/focus behavior и lifecycle cleanup.
- [ ] Проверить UI Editor на 9-slice, text/rich text/font fallback, keyboard focus, safe areas, resizing and aspect ratios.
- [ ] Добавить smoke/acceptance fixtures для audio groups, localization keys/fallbacks и save data migration, если соответствующие P1 capabilities реализуются в этой фазе.
- [ ] Проверить точечные importer extensions (PSD/Aseprite) через общий asset metadata/reimport contract, а не через отдельные несогласованные форматы.
- [ ] Рассмотреть UI layout tools: anchors, responsive layout, scale modes, interactive states и mobile safe areas.
- [ ] Улучшать graphics/audio/assets workflow на основе capability matrix и production pain points.
- [ ] Провести отдельный аудит icon identifiers Colibri и подготовить карту перехода на [Godot Editor Icons](https://github.com/godotengine/godot/tree/c8256a8ecec068340753869e423dd478c84ef167/editor/icons): оставить только значки общих UI-команд и поддерживаемых 2D-возможностей, исключить 3D-only icons.
- [ ] Для отобранных значков подготовить и проверить отдельные варианты для светлой и тёмной тем, включая контраст и применимые UI-состояния; зафиксировать source commit, исходный файл, mapping и необходимые MIT notices. Не выполнять массовую замену до ревью карты и плановой задачи.
- [ ] Выполнить ограниченный Svelte PoC на одной существующей панели/workflow и сравнить с текущим Colibri/workbench; проверить совместимость с состоянием редактора, API, темизацией, сборкой, отладкой и стоимостью bridge.
- [ ] По результатам PoC принять явное решение: продолжать текущий workbench, интегрировать Svelte для ограниченного слоя или постепенно мигрировать выбранные views. Полная миграция не является автоматическим результатом успешного PoC.
- [ ] Если новая UI оболочка доказано полезна, переносить views по одной; legacy и новый view сосуществуют только через явный bridge и общий state/model, а не два независимых источника данных.

### Очередность внутри этапа

**A — P0: модернизация рабочей среды и базовый authoring на существующей базе.**
- Сохранение/повторное открытие сцены, hierarchy/Transform, безопасные Undo/Redo и согласованность Prefab/Component metadata с Project Model.
- Input и преобразование координат (mouse/keyboard/touch, UI versus world, camera/viewport), focus loss и cleanup listeners.
- Базовый Sprite workflow: импорт/slicing, trim/pivot, sorting и collision shapes; результат должен сохраняться и соответствовать runtime.
- Минимальные UI anchors/layout/scaling/safe areas и проверка нескольких viewport/aspect ratios.
- Минимальные Physics Editor/runtime contracts, debug overlay и поддерживаемый backend — без обязательства добавлять дополнительные backends.
- Базовый Animation Controller/state workflow и resource lifecycle, когда соответствующая возможность нужна выбранному vertical slice.
- Все эти функции считать завершёнными только после tests/fixtures и согласованного preview/build acceptance. Не реализовывать весь P0 одновременно: брать следующую подсистему по количеству блокирующих gaps и зависимости.

**B — P1: расширение authoring workflow после P0 и общей модели ресурсов.**
- Расширенный Tilemap: reusable brushes, rule tiles/auto-tiling, object/collision layers, Tiled import/export с сообщениями о потерях, затем измерения chunking/culling и большие карты.
- Audio groups/buses, preview и browser focus/autoplay lifecycle; базовые particles с безопасным повторным запуском preview.
- Versioned local storage/save migrations и localization tables/fallbacks, если востребованы первыми реальными проектами.
- PSD/Aseprite importers, atlas variants/advanced analysis и skeletal animation — отдельными PR, по одному импортеру/формату с license review.
- Дополнительные UI layouts и production authoring tools — по capability matrix, а не для формального feature parity.

**C — P2: отложенные или экспериментальные возможности.**
- Hex/isometric tilemaps, spline terrain, advanced lighting/shadows/normal maps/post-processing, trails/motion streaks и сложные animation blend graphs.
- Дополнительные physics backends и backend-specific features — только при измеренной необходимости.
- RTL/complex text shaping и расширенная accessibility — только после проверки ограничений текущего text/runtime backend.
- Ручные renderer optimizations — только если profiler подтверждает конкретный bottleneck.

**P0 — иконки и темы как часть модернизации редактора.** В рамках первого UI-modernization пакета составить mapping используемых IDs и команд, выбрать и внедрить подходящие Godot Editor Icons для общих UI-команд и существующих 2D-возможностей, исключить 3D-only assets, подготовить отдельные light/dark-варианты и сохранить source mapping/MIT notices. Карта — промежуточный шаг, а не завершение задачи: обязательны рабочая интеграция в интерфейс и browser acceptance в обеих темах. Это не требует остановить независимую работу над Core, но должно быть включено в ближайший объём реализации редактора.

**Полная перепись UI-стека — не P0; ограниченный PoC — P1.** Svelte/Vite/dockview/CodeMirror/Monaco сравнить на небольшой реальной панели или workflow, а не по абстрактным преимуществам. До завершения PoC продолжать улучшать текущий workbench. Если новый стек докажет преимущество, переносить views по одному через явный bridge и единый источник данных, сохраняя browser acceptance.

### Критерии приёмки

- [ ] Для каждого перенесённого/изменённого инструмента есть checklist основных действий и regression tests.
- [ ] Undo/Redo, save/reopen, Prefab update и code generation сохраняют ожидаемую семантику.
- [ ] Browser workflow остаётся проверяемым в ходе UI миграции.
- [ ] Набор иконок ограничен общими UI-командами и поддерживаемыми 2D-инструментами; 3D-only иконки не включены и не используются.
- [ ] Светлая и тёмная темы корректно выбирают свои варианты иконок; проверены читаемость, контраст и применимые состояния интерфейса.
- [ ] Происхождение заимствованных значков документировано по конкретному upstream commit и исходным файлам, необходимые license/copyright notices сохранены.
- [ ] Не заявлены поддерживаемыми эффекты/physics/animation capabilities, которые не работают в runtime или export.
- [ ] Удаление legacy view/module возможно только после подтверждённой замены и проверки всех известных consumers.

### Follow-up backlog по PR #10 — закрывать отдельными проверяемыми изменениями

Эти пункты намеренно остаются открытыми: CI Fast подтверждает сборку, запуск локального сервера и конкретные security smoke-сценарии, но не заменяет браузерную приёмку. Не снимать пункты только на основании зелёного typecheck/build.

- [ ] **FX и codegen:** запустить на Phaser 4.2.1 одну fixture-сцену с Circle/Bloom/Gradient/Shine; сравнить редакторский preview и сгенерированную игру, проверить параметры, pre/post FX, вложенные Container, parent transform/alpha, изменение размеров, sibling order, удаление объектов и shutdown/restart. Зафиксировать неподдерживаемое наследование alpha у Gradient как ограничение, пока не появится проверенное решение. Добавить регрессионные проверки синхронизации/пересоздания Circle mask и очистки созданных объектов/listeners.
- [ ] **Box2D runtime:** скомпилировать и реально запустить сгенерированную сцену; проверить направление гравитации и преобразование координат/углов, box/circle fixtures, static/kinematic/dynamic bodies, синхронизацию body/sprite, фиксированный timestep и поведение при просадке/паузе на 30/60/120 FPS. Отдельно проверить stop/shutdown/restart без оставшихся listeners/worlds и два одновременно активных мира с разными World Scale. Если глобальное состояние `WorldStep`/`SetWorldScale` в выбранной версии `phaser-box2d` не позволяет безопасную изоляцию миров, устранить конфликт или явно ограничить и проверить поддерживаемый сценарий. Не считать Debug Draw работающим: runtime-код для него пока не генерируется.
- [ ] **Asset Pack и браузерные API:** проверить загрузку шрифтов и поведение при ошибке/повторе, форматы и доступность compressed textures в целевых браузерах/GPU, вложенные каталоги и несколько batches `DirectoryReader.readEntries()`, продолжение импорта после ошибки одного файла, а также missing/invalid URL и освобождение аудио/видео-ресурсов. Зафиксировать проверенные форматы и браузеры; классификация расширения не равна поддержке preview/runtime.
- [ ] **Regression tests для данных и предпросмотра:** покрыть литералы `undefined` и spread-ключи в JSON/code printer; конфигурацию/удаление кадров Particle Emitter и fallback `__DEFAULT`; spritesheet frame lookup с margin/spacing и до/после загрузки изображения; все поддерживаемые формы Phaser audio/video URL (строка, массив и `{ type, url }`); неудачное чтение/сохранение thumbnail cache и освобождение `blob:` URL. Тесты должны ловить конкретные регрессии, а не только подтверждать отсутствие исключения при сборке.
- [ ] **Server/API security:** сохранить regression tests для bind на loopback, проверки `Host`/`Origin`, лимитов JSON/multipart, файлового listing/read/write/upload, root `phasereditor2d.json`, dangling symlink и built-in/stdio MCP. Проверять, что при отказе не изменяется и не читается файл за пределами проекта. Smoke-тест MCP сейчас проверяет initialize, tools/list и один вызов scene-list tool; отдельно подтвердить совместимость принудительного Zod 4.6.7 override с остальными tool schemas, optional/nested arguments и типовыми ответами, чтобы успешный одиночный вызов не считался полной совместимостью. Если среда не разрешает создавать symlink, явно помечать соответствующую проверку skipped и обеспечивать отдельный runner, где она действительно выполняется.
- [ ] **Закрыть TOCTOU в файловых операциях:** текущая схема real-path containment проверяет путь до последующей операции и не исключает гонку при одновременной замене symlink локальным процессом. Выбрать race-resistant механизм, гарантия которого относится к фактически открытому file handle/target, а не только к предварительной проверке pathname; не считать простую повторную проверку достаточной. Покрыть параллельную подмену ссылки тестом там, где ОС позволяет. Если гарантированную защиту нельзя обеспечить переносимым API, документировать точную границу угрозы и сохранить loopback-only exposure до явного решения по модели угроз. Не помечать риск устранённым только по прохождению текущего security smoke.
- [ ] **Release evidence:** прикреплять к PR результаты ручной browser acceptance и адресных тестов; отдельно записывать, что `npm run test:e2e`/UI E2E или release workflow не запускались, когда это так. Для PR #10 CI Fast прошёл на PR head `3c96dde67eb865a0ee70fdbd5134ab995f846443` перед слиянием в `dev` (`754edaa1f7313409e99c3462a802d5fd430a9a01`); отдельный запуск на merge commit не подтверждён в этом аудите. Это не закрывает runtime/security follow-ups и не заменяет acceptance evidence соответствующих функций.

### Критерий закрытия follow-up backlog

Каждый пункт закрывается только после воспроизводимого теста/fixture либо описанной ручной проверки, прикладывания результата к соответствующему PR и обновления этого списка. Для непроверенного поведения указывать ограничение явно; не выдавать наличие кнопки, type declarations или codegen за доказательство работающего runtime.

---

## Этап 6 — production debugger, profiler и quality gates

**Цель:** обеспечить инженерную диагностику и контроль качества, необходимые для разработки и выпуска коммерческих 2D Web-игр.

**Зависимости:** runtime/model contracts этапов 2–3, build pipeline этапа 4 и изменяемые editor workflows этапа 5. Typecheck/lint/unit checks внедряются с первых новых модулей; этот этап добавляет системную диагностику, воспроизводимый profiling и release gates.

### Приоритеты

Проверки сдвигаются влево и вводятся одновременно с каждой подсистемой: не откладывать unit/typecheck/lint до завершения всей архитектуры. Самостоятельный этап QA нужен для объединения telemetry, regression baselines, широкого browser acceptance и release checklist, а не для первого появления тестов.

### Задачи

- [ ] Добавить runtime log/error console и группировку ошибок по сессии/объекту.
- [ ] Реализовать live runtime hierarchy/component inspector и переходы между runtime selection и editor selection.
- [ ] Добавить физические overlays, состояния объектов и поддерживаемую диагностику animation/resources.
- [ ] Измерять frame time и количество runtime объектов; добавить доступные renderer/texture/resource metrics с точным описанием их источника.
- [ ] В рамках доступной instrumentation добавить 2D-метрики: rendered vs culled sprites, atlas count/pages/utilization, batches/draw calls, tilemap chunks and render/update/collision time, physics step/contact counts, asset loading and bundle size.
- [ ] Для Web release измерять initial download size, time-to-first-frame и отложенную/прогрессивную загрузку; не использовать непроверенные абсолютные thresholds.
- [ ] Добавить memory/CPU measurements только там, где платформа даёт корректную метрику; не подменять измерение оценкой без маркировки.
- [ ] Ввести воспроизводимые performance fixtures и regression baselines.
- [ ] Добавить unit/integration tests для Core, schema, serialization, runtime adapters и project validation.
- [ ] Добавлять browser E2E для ключевых workflows редактора и production build без запуска полного тяжелого UI E2E на каждый рутинный PR, если это не нужно текущему слою.
- [ ] Для release candidate обязать соответствующие integration/build checks и browser/manual acceptance для затронутых UI/runtime сценариев.
- [ ] Сделать отчет о целевом браузере/платформе, результатах проверок и известных ограничениях частью release checklist.

### Критерии приёмки

- [ ] Performance regression измеряется на закреплённой fixture и воспроизводимом окружении.
- [ ] Автоматические проверки покрывают критичные контракты, миграции и жизненный цикл.
- [ ] Browser acceptance подтверждает полный цикл от редактирования сцены до тестирования собранной игры.
- [ ] CI статусы и локальные команды описаны без утверждения, что автоматизация проверяет непокрытые сценарии.
- [ ] Ошибки и известные ограничения релизного кандидата видимы и задокументированы.

---

## Этап 7 — Tauri desktop shell PoC и упаковка

**Приоритет: optional / не блокирует Web-first MVP.** Цель — проверить, насколько хорошо текущий/эволюционирующий редактор работает как desktop-приложение редактора. Tauri — кандидат; это не часть game runtime и не условие выпуска HTML5-игры.

**Зависимости:** контракты Project Services и Preview Host из этапов 2–3 определены; для осмысленного решения предпочтительны стабильный browser workflow и baseline этапов 4–6. Короткий throwaway PoC можно запустить раньше для проверки отдельного риска, но он не должен отвлекать от Core/build и не создаёт обязательства переходить на Tauri.

### Задачи

- [ ] Создать минимальную Tauri 2 оболочку и зафиксировать версии инструментария сборки.
- [ ] Проверить запуск packaged editor и требуемого server/sidecar процесса на чистом Windows окружении без отдельно установленного Node.js.
- [ ] Проверить выбор папки, доступ к файлам, открытие проекта, сохранение, build, preview и корректное завершение фоновых процессов.
- [ ] Проверить embedded Game View и отдельное игровое окно в WebView2; сравнить загрузку WebGL и отзывчивость Inspector с браузерным вариантом.
- [ ] Зафиксировать модель прав доступа к файлам и межпроцессным сообщениям.
- [ ] Измерить cold start, idle CPU/RAM, UI latency и загрузку ресурсов; сравнить Tauri с альтернативой, если есть конкретная причина.
- [ ] Решить, какие системные операции действительно выгодно перенести в Rust. Не переносить всю бизнес-логику или игровой кадр на Rust ради формального разделения.
- [ ] Оставить web/HTML5 export независимым от desktop оболочки.
- [ ] При подтверждении PoC определить выпускной путь и матрицу ОС; не считать macOS/Linux поддержанными без сборки и acceptance.

### Критерии приёмки

- [ ] Desktop запуск не зависит от установленного пользователем Node.js.
- [ ] Основной сценарий открытия/изменения/сохранения/запуска игры пройден на fixture.
- [ ] Preview Host использует тот же контракт, что и browser mode; архитектура runtime не импортирует Tauri API напрямую.
- [ ] File access ограничен выбранным проектом и проверен негативными тестами.
- [ ] Закрытие редактора завершает принадлежащие ей процессы.
- [ ] Есть протокол измерений и принято явное решение продолжать/изменить/отложить Tauri, а не автоматический переход в массовую миграцию.

**Gate:** не начинать переписывание всего UI или файловой системы, пока PoC не покажет, что текущая архитектура действительно блокирует нужный продуктовый workflow. Отрицательный/неубедительный PoC означает отложить Tauri; результаты HTML5 build и browser preview должны оставаться независимыми от решения о desktop оболочке.

---

## Этап 8 — npm-based Package Manager, расширения и экосистема пакетов

**Цель:** предоставить пользователю управляемый набор выбираемых пакетов и единый workflow, при котором пакет может добавлять возможности движка и редактора без правок Editor Host.

**Зависимости:** стабильные контракты Project Model/Core (этап 2), Preview/build (этапы 3–4), editor/runtime integration (этап 5) и diagnostics/quality gates (этап 6). Архитектурные границы и Extension API проектируются заранее; полноценный Package Manager реализуется после подтверждения package/API contracts.

### Задачи

- [ ] Сформировать taxonomy пакетов по ответственности и scope: Core/shared, editor-extension, runtime, build/CLI, platform adapter и tooling. Имя пакета не обязано начинаться с `plugin-`.
- [ ] Поддерживать исходники самостоятельных пакетов в `packages/<name>/` с собственными manifests, публичными exports, тестами и документацией; не создавать отдельный пакет на каждый класс. Пакет можно разрабатывать в монорепозитории до публичной публикации.
- [ ] Настроить npm Workspaces для локальной разработки пакетов и проверить, что workspace linkage не приводит к установке всех пакетов как dependencies каждого потребительского проекта. После миграции редактора включить `src/editor` в согласованную workspace-схему.
- [ ] Обеспечить Core package `@codogma/cge` в `packages/cge/` без зависимости от Editor UI, Colibri, desktop shell, MCP или платформенных SDK.
- [ ] Определить и протестировать engine-specific metadata в namespaced поле `codogma` стандартного `package.json`: kind, scopes/targets, совместимость с Engine/Editor API, explicit entry points и предоставляемые Feature/Capability descriptors (inline или явной ссылкой на декларативное описание). Metadata не дублирует npm dependency tree и не заменяет npm resolver.
- [ ] Утвердить versioned Feature/Capability Registry contract для встроенных и package-provided capabilities: stable IDs, provider, scopes/targets, requirements/conflicts, required/optional/default policy и build/editor entry points. Неоднозначный выбор нескольких providers должен давать diagnostic, если явная multi-provider policy не утверждена. Точная schema и место хранения подтверждаются ADR/PoC.
- [ ] Не дробить Phaser-подсистемы на формальные wrapper-пакеты ради видимости модульности: сначала доказать, что выбранный runtime packaging/build path действительно позволяет независимо выбирать эти подсистемы и исключать ненужный код.
- [ ] Связать descriptors Registry с project feature configuration и target build profiles; зафиксировать отдельно installed/provided/available/enabled/target-included/activated states и обеспечить совместную валидацию для Editor Host, CLI и build.
- [ ] Разделить package dependencies и feature dependencies: npm отвечает за installation/resolution; Registry проверяет требуемые engine capabilities, предлагает диагностируемое действие для недостающего provider, но не запускает собственную установку и не дублирует npm resolver.
- [ ] Утвердить версионируемые TypeScript contracts для Editor Extension API и extension lifecycle; точную схему и API подтвердить через ADR/PoC до обещания публичной совместимости.
- [ ] Создать Node-side Package Manager Service с целевыми исходниками в `packages/package-manager/`: он использует npm CLI, а Editor Host UI обращается к нему через типизированный HTTP/IPC contract; headless CLI использует ту же реализацию сервиса. Структурированные результаты/ошибки и lifecycle операций общие, UI не запускает npm напрямую.
- [ ] Реализовать и протестировать install/update/remove/list для npm dependencies, управление процессами и отмену, безопасную передачу аргументов, ограничение project root, журналирование и восстановление после неудачной операции.
- [ ] Проверить clean install через `npm ci` в отдельном fixture project с committed lockfile; fixture должен объявлять только необходимые пакеты и получать только их транзитивные зависимости.
- [ ] Разделить область установки и исполнения: base Editor Host dependencies, project-level packages и активные editor extensions не должны случайно смешиваться. В целевом сценарии Extension API получает список пакетов активного проекта и активирует только совместимые расширения с явным entry point и разрешённым scope.
- [ ] Обеспечить package-level registrations для команд, меню/shortcuts, panels/views, settings, Inspector property editors, schema validators, asset import/reimport handlers, Scene Editor gizmos/brushes, profiler overlays, build hooks и target profiles.
- [ ] Установку/обновление/удаление сопровождать проверкой metadata/API compatibility и понятной диагностикой. Добавить project-level activation/disable для editor extensions так, чтобы отключение не требовало изменения npm dependency tree и не повреждало проектные данные.
- [ ] Проверить, что editor-only/build-only зависимости не попадают в production game bundle; build pipeline должен анализировать declared scopes/targets и фактический dependency graph.
- [ ] Проверить, что выбранные в проекте features собираются только для совместимых targets, их обязательные feature dependencies включаются прозрачно, а выключенные features не подключаются скрыто.
- [ ] Подготовить machine-readable report с feature IDs, участвующими packages/entry points, причинами включения и диагностикой; корректно обрабатывать dynamic imports и modules с side effects вместо обещаний автоматического удаления.
- [ ] Поддержать источники по очереди: npm registry/scoped registry и local/file packages сначала; Git/tarball — с pinning ревизии, безопасной обработкой credentials и диагностикой.
- [ ] Применить явную политику lifecycle scripts, лицензий, уязвимостей и provenance. Не считать сторонние editor extensions изолированными только по manifest metadata.
- [ ] Рассмотреть curated feature sets как группы пакетов, устанавливаемые явным действием пользователя, а не как отдельный resolver или автоматический набор обязательных dependencies.
- [ ] Не создавать собственный registry или самостоятельную систему подписи на раннем этапе; принять отдельное решение только при подтверждённой потребности.
- [ ] Подготовить documentation/reference package/example project для создания, установки, включения, отключения и тестирования editor extension; каждый supported hook должен иметь версионируемый контракт и minimal acceptance fixture.
- [ ] Публиковать пакеты в npm только после определения SemVer, backward compatibility, лицензирования, публичных exports и воспроизводимого release процесса.
- [ ] Пересматривать Knip entry points и architectural rules при добавлении dynamic extension discovery; не удалять динамически загружаемые расширения на основании одного лишь отсутствия статических imports.

### Критерии приёмки

- [ ] Пакеты имеют явные назначения/scopes, публичные exports и проверяемые compatibility contracts.
- [ ] Пользовательский fixture устанавливает только выбранные прямые пакеты и их транзитивные dependencies через npm; в manifest/lockfile нет автоматически добавленного полного набора Codogma packages.
- [ ] Editor Extension с корректными metadata/entry point регистрирует как минимум одну команду и одну панель через публичный API без изменения исходников Editor Host.
- [ ] Несовместимый или ошибочный extension даёт диагностируемый результат и не приводит к необработанному падению редактора.
- [ ] Отключение extension не повреждает project data и не требует удаления пакета из npm dependency tree.
- [ ] Package Manager Service использует npm как единственный resolver/installer; собственного npm lockfile/resolver в Codogma нет.
- [ ] Feature descriptors проходят schema/compatibility validation, feature scopes/targets не расширяют ограничения package provider, а discovery читает декларативные metadata и не исполняет пакетный код только ради обнаружения функций.
- [ ] Clean-install fixture проходит `npm ci` и build; Editor UI и CLI используют общий service contract.
- [ ] Editor-only/build-only dependencies не попадают в production game bundle без явного разрешённого включения.
- [ ] Credentials не записываются в tracked project files; политика lifecycle scripts и доверия описана.
- [ ] Публичные API тестируются отдельно; для каждого поддерживаемого extension hook есть минимальный пример и acceptance test.

## Дальние направления — после стабилизации Core и HTML5 pipeline

Это возможности для дальнейшего планирования, а не обещания ближайшего релиза:

- Дополнительные runtime adapters (например, PixiJS) после доказанного PoC и оценки стоимости двойной поддержки.
- Расширенные production инструменты для профилирования, runtime recording и debugging.
- Более глубокий asset pipeline, оптимизация загрузки и bundle budgets.
- Дополнительные платформенные SDK и форматы экспорта.
- Spline-based 2D terrain/shapes, advanced 2D lighting/shadows/normal maps and shader/post-process extensions after renderer capability and performance validation.
- Optional 2D bone rigging/skinning and sprite-part attachments beyond imported skeletal animation playback, if authoring demand and runtime integration justify it.
- Advanced localization/text shaping (including RTL), accessibility-focused game UI and hot reload with state preservation only after core lifecycle contracts stabilize.
- Распространение шаблонов/расширений и более широкий plugin ecosystem.
- Интеграция с VS Code или другими IDE как альтернативный интерфейс к тем же проектным контрактам.

---

## Правило завершения этапа

Этап можно объявить завершённым только после выполнения всех его критериев приёмки, обновления соответствующих tests/docs и интеграции в основную ветку разработки. Если критерии не выполняются, этап остаётся открытым; нельзя заменять фактическую приёмку переименованием статуса или набором выполненных подзадач.

Для крупной архитектурной фазы допускается разработка отдельных готовых частей параллельно, но в `dev → test` переводится только согласованный и внутренне целостный acceptance candidate.
