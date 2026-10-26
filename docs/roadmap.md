# Дорожная карта: Codogma Engine

Дорожная карта строится вокруг требований [технического задания](technical-specification.md). Цель — не переписать всю IDE ради нового стека, а развивать самостоятельный Web-first 2D Engine: согласованные проектные данные, TypeScript API, runtime, визуальный редактор, live preview/debugging, asset/build pipeline и интеграции Yandex Games/VK.

Каждый этап должен завершаться проверяемым продуктовым результатом. Длинные этапы разбиваются на независимые задачи и PR. Схемы и библиотеки, помеченные как кандидат, не считаются утверждённой архитектурой до прохождения PoC.

## Приоритеты и рекомендуемый порядок реализации

Номера этапов обозначают крупные рабочие пакеты, но не означают, что все их пункты нужно делать одновременно. Практический порядок поставки — от снятия неопределённости к первому сквозному сценарию, затем к production-возможностям и только потом к необязательным направлениям.

| Очередь | Этапы roadmap | Приоритет | Измеримый результат / правило |
|---|---|---|---|
| 1 | Этап 1: аудит и baseline | **Блокирующий** | Фактическая карта текущих возможностей, зависимостей, качества и производительности. До этого не переписывать работающие подсистемы и не добавлять новые runtime-зависимости. |
| 2 | Этап 1: ADR и toolchain pilot | **Блокирующий для нового Core** | Согласованы границы Project Model/Core/Phaser adapter/Preview Host; новый модуль проходит ограниченный strict typecheck, lint, format check и unit tests. Legacy Colibri массово не мигрируется. |
| 3 | Этап 2: Project Model и минимальный Core | **P0 — основа** | Стабильные IDs, схема/сериализация/миграции, Transform, lifecycle, один пользовательский TypeScript-компонент и один Phaser adapter. Сначала законченный component-object vertical slice; data-oriented ECS — только по результатам сценария и измерений. |
| 4 | Этап 3: Preview Host | **P0 — сквозной сценарий** | Запуск, остановка и повторный запуск, ошибки, реальная runtime-сущность и базовая live-инспекция связаны с проектной моделью. Browser preview не зависит от Tauri. |
| 5 | Этап 4A: HTML5 build и asset validation | **P0 — выпускной фундамент** | Воспроизводимая сборка без открытого редактора, проверка схемы и asset references, понятные ошибки и подтверждение отсутствия editor-only кода в game bundle. |
| 6 | Этап 5: пробелы 2D-редактора | **P0, по матрице capabilities** | После принятия Project Model/Preview contracts закрывать подтверждённые gaps базового workflow. Задачи можно выполнять отдельными vertical slices параллельно с build, но каждая затронутая функция должна пройти save/reopen → preview → build acceptance. P0 из ТЗ — очередь возможностей, а не один большой спринт. |
| 7 | Этап 4B: Platform Services | **P1 после Core и базового build** | Сначала platform-neutral API и mock/local adapter, затем первая целевая интеграция **Yandex Games**. VK Mini Apps и VK Play — отдельные последующие задачи/targets, а не один недифференцированный адаптер. Platform SDK не должен блокировать редакторские vertical slices и независимую HTML5-сборку. |
| 8 | Этап 6: QA, diagnostics и profiling | **Непрерывно; полный gate перед release** | Unit/type/lint checks появляются вместе с соответствующим кодом. Расширенный profiler, browser acceptance и release gates добавляются по мере появления измеряемых подсистем. |
| 9 | Этап 7: Tauri desktop shell | **Не блокирует Web-first MVP** | Начинать после доказанного browser workflow и baseline. Небольшой throwaway PoC допустим раньше для снятия конкретного риска; полноценная упаковка не должна задерживать HTML5 build. |
| 10 | Этап 8: расширения и npm ecosystem | **Отложенный** | Сначала стабильные внутренние контракты и sample projects. Публичные пакеты/plugin API — только после реального потребителя, versioning, тестов и документации. |

### Что не следует делать параллельно «на всякий случай»

- Не переносить существующий редактор на Svelte/новую UI-оболочку до capability audit и сравнительного PoC.
- Не подключать EVA.js поверх Phaser как второй runtime, не создавать второй игровой цикл и не объявлять ECS ускорением без профиля.
- Не начинать замену Phaser на PixiJS, не внедрять несколько physics backends и не добавлять полный набор инструментов Unity/Cocos до подтверждённого gap и ADR/PoC.
- Не внедрять сразу весь набор линтеров/анализаторов во все legacy-пакеты. Сначала — отдельный строгий scope нового кода, корректные entry points и baseline.
- Не начинать перенос Godot Editor Icons массово: сначала инвентаризация IDs, карта используемых команд, light/dark-варианты и проверка лицензии; иконки не должны блокировать Core или HTML5 pipeline.
- Не делать Tauri, систему расширений, advanced lighting, сложные animation graphs и альтернативные runtime adapters обязательными для первого работоспособного сквозного сценария.

**Правило приоритета:** если задача не разблокирует текущий зависимый этап и не исправляет подтверждённый дефект обязательного workflow, она не должна опережать блокирующие задачи только из-за привлекательности технологии или количества желаемых функций.

## Принципы ведения roadmap

1. Один PR — одна логически завершённая задача. Работу крупной фазы не переносить целиком одним большим PR.
2. Не закрывать чекбокс по наличию кода или успешной компиляции: нужен результат соответствующего acceptance test.
3. Перед переписыванием существующей функции определить, что уже работает в текущем Colibri/Phaser Editor client, где расположены ограничения и что действительно надо заменить.
4. Новый модуль проходит критерии и сравнивается с legacy-сценарием до удаления старой реализации.
5. Не создавать вторую сущность, сцену или игровой цикл там, где можно добавить adapter к существующей реализации.
6. Выделять npm-пакеты, когда у подсистем есть стабильный публичный API и понятные зависимости. Сначала — внутренние модули в monorepo.
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

Первый исполнительский шаг — **Этап 1 (audit & decisions)**. Он не должен превращаться в большой кодовый рефакторинг. Его результат — шесть проверяемых артефактов:
- `docs/capability-matrix.md`: реализовано / частично / отсутствует / не подтверждено для редактора, runtime и export;
- `docs/dependency-capability-matrix.md`: версия, лицензия, runtime/editor/build scope, ограничения и причина сохранения/замены каждой значимой зависимости;
- `docs/decisions/ADR-0001-core-architecture.md`: границы Project Model/Core/Phaser adapter/Editor/Preview Host, lifecycle, time/input/scene contracts и открытые решения;
- `docs/performance-baseline.md`: закреплённые fixtures, среда и фактические baseline measurements, без выдуманных порогов;
- `docs/decisions/ADR-0002-typescript-toolchain.md`: решение по strict TS, lint/format/dead-code/architecture tooling и порядку миграции;
- `docs/code-quality-baseline.md`: текущие compiler/lint/unused-code findings, scope пилота, false-positive policy и правила постепенного усиления CI.

После приёмки этих артефактов следует выполнить Этап 2 как небольшой вертикальный срез: Project/Scene/Node → один пользовательский TypeScript-компонент → Inspector metadata → save/reopen → runtime preview → проверяемый build fixture. На этом шаге fixture доказывает связность сценария, но не заменяет отдельную приёмку полноценного headless HTML5 pipeline на Этапе 4. Не реализовывать все будущие подсистемы в одном PR и не добавлять конкурирующие runtime/renderer/physics зависимости до соответствующих ADR/PoC.

---


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

**Цель:** не начинать большой рефакторинг вслепую. Зафиксировать реальные возможности и выбрать минимальные границы между текущей IDE, проектными данными и будущим движком.

### Внутренняя очередь выполнения

1. **Сначала — факты:** capability audit, текущие TS configs/scripts/lockfiles, форматы проектных данных, реальные границы IFileStorage/HTTP/plugin registry/Undo-Redo, текущие тесты и измеряемый baseline.
2. **Затем — матрицы:** записать найденные gaps, версии/лицензии/scope зависимостей и текущие compiler/lint/unused-code findings. Не переносить пожелания в колонку «реализовано» без evidence.
3. **После baseline — решения:** оформить ADR по архитектуре и toolchain с альтернативами и последствиями. Инструменты оценивать как согласованный набор; сначала проверить конфликты версий и package scope, затем устанавливать.
4. **Пилотировать новый код отдельно:** один минимальный Codogma-owned module с strict TypeScript, runtime validation границ данных, ESLint, Prettier, unit test, а Knip/dependency-cruiser — в report mode.
5. **Gate этапа:** только после артефактов и принятого ADR фиксировать контракт первого vertical slice. Не смешивать этот этап с миграцией legacy-кода или реализацией всех перечисленных редакторских gaps.

### Задачи

- [ ] Составить capability matrix для Scene Editor, Inspector, Prefabs, user components, Undo/Redo, Tilemap, Animation, Physics, Assets, code generation, play mode и MCP; сохранить результат в `docs/capability-matrix.md` с фактическими evidence/tests.
- [ ] Включить отдельные workflow-строки для Sprite Editor (slicing/trim/pivot/collision shapes/sorting/9-slicing), Tilemap brushes/layouts/chunks, camera/coordinate conversion, input (mouse/keyboard/touch), audio lifecycle, UI layouts/text, particles/lighting, localization, save storage и Dev/Release build profiles.
- [ ] Инвентаризировать TypeScript configs/project references, TS compiler options, scripts and lockfiles во всех packages, оценить совместимость обновления от TypeScript 5.3.3, текущий scope TSLint и generated/dynamic plugin entry points; не предполагать, что repo-wide checks уже существуют.
- [ ] Зафиксировать toolchain baseline и staged migration plan для strict TypeScript, ESLint/typescript-eslint, Prettier, Knip и dependency-cruiser; отметить точный initial scope для новых Codogma modules и текущие legacy findings.
- [ ] Для каждой возможности указать: существующая реализация, публичный/внутренний контракт, покрывающие тесты, ограничения и gap относительно целевого UX.
- [ ] Зафиксировать текущие форматы сцен/префабов/ассетов и правила серилизации, идентификации ресурсов и обновления ссылок.
- [ ] Инвентаризировать импортные метаданные, повторный импорт, sprite sheet slicing, atlas build, PSD/Aseprite/Tiled interoperability и явно записать ограничения/потери данных каждого формата.
- [ ] Проследить вызовы существующего `IFileStorage`, HTTP API, plugin registry и Undo/Redo: найти реальные границы, которые можно развивать без переписывания Colibri.
- [ ] Составить Dependency & Capability Matrix текущего форка: версия, лицензия, роль, browser/runtime/editor scope, ограничения и цена обновления; сохранить его в `docs/dependency-capability-matrix.md` и включить транзитивные runtime/build dependencies.
- [ ] Указать developer tools в отдельной категории devDependencies, их package scope, scripts, lockfile, role, runtime exclusion и rationale; убрать дублирующие lint/format tools, если такие найдутся.
- [ ] Определить вертикальный срез для будущих изменений: сцена → custom TypeScript component → Inspector metadata → save/reopen → preview → live selection/diagnostics → HTML5 build.
- [ ] Подготовить ограниченный TypeScript toolchain pilot для нового Codogma-owned module: strict typecheck, lint, format check, Knip/dependency report и unit test, не затрагивая массово наследуемый Colibri code.
- [ ] Зафиксировать ключевые ADR: компонентная модель/ECS, единая модель данных, Runtime Adapter API, Game Preview Host и роль Tauri. Первое решение оформить как `docs/decisions/ADR-0001-core-architecture.md`, явно выделив принятые решения, открытые вопросы, альтернативы и последствия.
- [ ] Оформить `docs/decisions/ADR-0002-typescript-toolchain.md`: strict profile, выбор ESLint/Prettier/Knip/dependency-cruiser, интеграция TypeScript project references, legacy TSLint migration и CI ratchet plan.
- [ ] Описать текущий baseline производительности и проверок в `docs/performance-baseline.md`; закрепить fixtures, браузер/ОС/железо и метод измерения, не ставить пороги без воспроизводимой методики.

### Критерии приёмки

- [ ] Есть таблица фактического состояния `docs/capability-matrix.md`, а не дублированный перечень желаемых функций.
- [ ] Созданы `docs/dependency-capability-matrix.md`, `docs/decisions/ADR-0001-core-architecture.md`, `docs/decisions/ADR-0002-typescript-toolchain.md`, `docs/performance-baseline.md` и `docs/code-quality-baseline.md`; неизвестные сведения помечены как непроверенные, а не придуманы.
- [ ] Новый TypeScript pilot проходит strict typecheck, lint, format check и соответствующие unit tests; Knip/dependency-cruiser report scope и false-positive handling документированы.
- [ ] Выделены минимальные контракты Project Model, Runtime Adapter и Preview Host.
- [ ] Подтверждено, какие возможности надо расширять внутри текущего редактора, а какие — изолировать или заменять.
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
3. **Следующий UI-слой — Embedded Game View:** подключать после доказанного browser lifecycle. Сравнить отзывчивость Studio под нагрузкой; не обещать изоляцию, если не измерены отдельные context/window/process.
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

---

## Этап 5 — качество существующего редактора и 2D-производственные инструменты

**Цель:** развивать текущий редактор по матрице реальных пробелов, не дублируя уже имеющийся функционал.

**Зависимости:** capability audit этапа 1 и контракты/модель этапов 2–3. Asset/build pipeline этапа 4 подключается по мере готовности. P0-задачи можно выполнять отдельными vertical slices, если затронутые контракты уже приняты. Не требуется заранее переписывать Colibri на Svelte.

### Задачи

- [ ] Для каждого текущего editor subsystem зафиксировать состояние, тесты и отличия от требуемого UX.
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
- [ ] Решение о Svelte/Vite/dockview/CodeMirror/Monaco принимать после сравнительного прототипа; если текущий workbench подходит, расширять его.
- [ ] Если новая UI оболочка доказано полезна, переносить views по одной; legacy и новый view сосуществуют только через явный bridge, а не два независимых источника данных.

### Очередность внутри этапа

**A — P0: базовый авторинг, только подтверждённые gaps по docs/capability-matrix.md.**
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

**Отдельная UI-задача — иконки и темы.** После аудита identifiers и текущей theme system составить карту иконок Godot, выбрать только общие UI/поддерживаемые 2D-команды, исключить 3D-only assets, подготовить отдельные light/dark-варианты и сохранить source mapping/MIT notices. Это обязательное требование качества UI, но оно не блокирует проектную модель, runtime, preview или HTML5 build; массовую замену выполнять после ревью карты.

**Переписывание UI-стека — не P0.** Svelte/Vite/dockview/CodeMirror/Monaco сравнивать только отдельным прототипом после подтверждения конкретного ограничения текущего workbench. Если миграция оправдана, переносить views по одному, сохраняя единый источник данных и browser acceptance.

### Критерии приёмки

- [ ] Для каждого перенесённого/изменённого инструмента есть checklist основных действий и regression tests.
- [ ] Undo/Redo, save/reopen, Prefab update и code generation сохраняют ожидаемую семантику.
- [ ] Browser workflow остаётся проверяемым в ходе UI миграции.
- [ ] Набор иконок ограничен общими UI-командами и поддерживаемыми 2D-инструментами; 3D-only иконки не включены и не используются.
- [ ] Светлая и тёмная темы корректно выбирают свои варианты иконок; проверены читаемость, контраст и применимые состояния интерфейса.
- [ ] Происхождение заимствованных значков документировано по конкретному upstream commit и исходным файлам, необходимые license/copyright notices сохранены.
- [ ] Не заявлены поддерживаемыми эффекты/physics/animation capabilities, которые не работают в runtime или export.
- [ ] Удаление legacy view/module возможно только после подтверждённой замены и проверки всех известных consumers.

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

## Этап 8 — расширения и экосистема пакетов

**Цель:** предоставить возможность развивать жанровые инструменты и платформенные интеграции без перегрузки ядра.

**Зависимости:** стабильные контракты Project Model/Core (этап 2), Preview/build (этапы 3–4), editor/runtime integration (этап 5) и diagnostics/quality gates (этап 6). Экосистема расширений не должна предшествовать стабильности этих контрактов.

### Задачи

- [ ] Разделить engine/editor/build/platform code на внутренние модули с явными зависимостями.
- [ ] Определить manifest/metadata расширения, совместимость версий, lifecycle, разрешения и точки интеграции.
- [ ] Зафиксировать отдельные extension hooks для custom Inspector editors/schema validators, import/reimport pipeline, Scene Editor gizmos/brushes, profiler overlays, build hooks, target profiles and localization tools.
- [ ] Выделять пакет для самостоятельной подсистемы только при наличии стабильного публичного API, тестов и независимой ответственности.
- [ ] Рассмотреть расширения для графов диалогов/квестов, AI/NPC behavior, navigation, waves, localization и других жанровых инструментов.
- [ ] Разграничить editor plugin, game runtime package, build tool и platform adapter: они не должны по умолчанию загружаться в один и тот же runtime.
- [ ] Подготовить документацию/пример создания расширения и совместимый test project.
- [ ] Пересматривать Knip entry points и architectural rules при добавлении нового plugin registry/module boundary, чтобы автоматический анализ не ошибочно удалял dynamic plugins и не допускал межслойные импорты.
- [ ] Поддерживать несколько небольших reference/sample projects (например, top-down, platformer и UI-heavy/mobile) и минимальные project templates, собираемые CI и основанные на публичном API.
- [ ] Публиковать npm-пакеты только после определения semver, backward compatibility и поддержки API.
- [ ] Рассмотреть MCP/AI tools как безопасный интерфейс к проектным операциям с валидацией, ограничением scope и понятными подтверждениями разрушительных действий.

### Критерии приёмки

- [ ] Расширение заявляет зависимости и совместимые версии.
- [ ] Установка/отключение расширения не повреждает проектные данные.
- [ ] Публичные API тестируются отдельно и документированы.
- [ ] Каждый supported extension hook имеет minimal example project, version contract, declared scope (editor/runtime/build) и acceptance test; editor-only modules не попадают в runtime build по умолчанию.
- [ ] Runtime зависимости расширения не попадают в game build без явного включения.
- [ ] Совместимость и лицензии проверены перед публикацией.

---

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
