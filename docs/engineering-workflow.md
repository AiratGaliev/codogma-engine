# Правила разработки и ведения задач Codogma Engine

Этот документ — обязательная памятка для каждой новой задачи. Он дополняет, а не заменяет существующие правила в [README.md](../README.md), нормативное [техническое задание](technical-specification.md), [дорожную карту](roadmap.md) и [матрицу возможностей](capability-matrix.md).
## 0. Команды Linear и распределение ответственности

В проекте Linear используются две отдельные команды. Выбирай команду по типу результата задачи, а не по тому, кто её создал или кто будет выполнять ручную проверку.

| Команда | Идентификатор задач | Ответственность | Какие задачи создавать |
|---|---|---|---|
| **Codogma-engine (COD)** | **COD-N** | Engineering delivery | Реализация, исправления, архитектура, API/контракты, автоматизированные тесты, CI/tooling и изменения инженерной документации. |
| **Codogma QA (CODQA)** | **CODQA-N** | Functional и Release acceptance | Проверка пользовательских сценариев, browser/runtime acceptance подсистем и приёмка конкретных release candidates. |

Обе команды входят в проект [Codogma Engine](https://linear.app/codogma-engine/project/codogma-engine-1a4353b33f63). Ведущая команда проекта — COD; это не меняет распределение ответственности за QA-задачи.

### Выбор типа и команды

- В COD заводить только Engineering issues с типом Engineering. Здесь остаются реализация, исправление найденных дефектов и инженерная работа по созданию инструментов/процесса приёмки.
- В CODQA заводить Functional acceptance для независимой проверки подсистемы или пользовательского workflow и Release acceptance для проверки конкретного release candidate.
- Не создавать QA issue в COD и не переносить реализацию в CODQA ради удобства доски. Если acceptance выявила дефект, QA issue фиксирует результат/ссылку на дефект, а исправление заводится отдельной Engineering/Bug issue в COD.
- **QA issue всегда самостоятельная верхнеуровневая задача команды CODQA.** Не создавать её как sub-issue/child Engineering-задачи и не вкладывать QA issue в иерархию COD. Для traceability использовать только нейтральное отношение Linear `relatedTo` между CODQA и соответствующей COD issue. Такая связь не должна превращаться в `blocks`/`blockedBy`. QA-задачи ведутся отдельно на QA Kanban.
- Для задач проекта используй общий проект Codogma Engine; не создавай дубли проекта только из-за разделения команд.

### Назначение двух досок

- [Development Kanban](https://linear.app/codogma-engine/project/codogma-engine-1a4353b33f63/view/development-kanban-4db756f5f1c6) — инженерный backlog команды COD.
- [QA Kanban](https://linear.app/codogma-engine/project/codogma-engine-1a4353b33f63/view/qa-kanban-918c848c9880) — задачи команды CODQA. Сохранённое представление проверяется по результатам фильтрации Linear; не заменяй эту доску общим project backlog.

### Acceptance lifecycle

- Functional acceptance — отдельная верхнеуровневая задача CODQA на существенную подсистему или целый пользовательский workflow, а не подзадача каждого Engineering issue/PR. Не создавать отдельную QA-задачу на каждый небольшой коммит или PR. До появления интегрированного кандидата с соответствующим объёмом в `test` оставлять QA issue в `Todo`.
- Формальную ручную/browser/runtime acceptance запускать **только после promotion `dev → test` и попадания полного объёма кандидата в ветку `test`**. Проверять один точный `test` SHA для всех применимых CODQA-сценариев кандидата; фиксировать fixture, браузер/ОС/device, viewport/DPR, шаги, expected/actual и evidence. Не проводить эту приёмку на topic branch или по каждой Engineering-задаче отдельно.
- Release acceptance — отдельная задача на каждый promotion candidate, который переносится из dev в test. В ней обязателен точный commit SHA кандидата, результаты обязательных CI/E2E checks, browser/runtime/manual evidence, ограничения и решение о принятии.
- Не переиспользуй закрытую release-acceptance issue для следующего SHA: каждый новый candidate получает отдельную QA issue.
- **Functional/Release acceptance не входит в Engineering DoD и не блокирует COD backlog.** Engineering issue переводится в `Done`, когда выполнены собственные implementation criteria и scoped automated tests, CI Fast успешен, а PR прошёл review и влит в `dev`. Не ждать CODQA issue, ручной проверки, browser/runtime acceptance или продвижения кандидата в `test`. Незавершённая QA-задача не является причиной держать Engineering issue в `In Review` или не начинать следующую независимую задачу.
- QA issue переводится в Done только после подтверждения её собственных критериев и записи evidence. Если acceptance не пройдена, QA issue остаётся/возвращается в работу, а найденный дефект оформляется отдельной Engineering issue в COD.

Для оперативной работы используй командные страницы и документы в Linear: [Codogma-engine (COD)](https://linear.app/codogma-engine/team/COD) и [Codogma QA (CODQA)](https://linear.app/codogma-engine/team/CODQA).

Team home guides: [COD](https://linear.app/codogma-engine/document/codogma-engine-cod-team-home-and-working-agreement-c2f17d6e0e98) and [CODQA](https://linear.app/codogma-engine/document/codogma-qa-codqa-team-home-and-acceptance-guide-aac02e93222c).

## Правила выбора целевого Editor UI (01.11.2026)

- Все новые пользовательские панели, UX и authoring workflows редактора реализуются в самостоятельном SolidJS Host `src/editor/`.
- Временный UI client в `source/editor/` не получает новые features, controls, panels, UI refactors или постоянные integration bridges. Допускаются только критические UI security fixes и release blockers для безопасного production cutover.
- Все новые пользовательские workflows и feature contracts проектируются и реализуются в SolidJS Host с собственными typed services, state owners, tests и runtime integration.
- Наличие панели или завершённой Engineering issue не считается готовностью end-to-end workflow. Проверять native Project Model save/reopen, runtime/build parity и browser acceptance по [capability matrix](capability-matrix.md) и [migration plan](editor-ui-migration.md). Координация UI rollout — COD-82.
- `source/editor/` и `src/editor/` остаются самостоятельными приложениями до production cutover. COD-87 переводит маршрут `/editor/` на новый Host; COD-88 удаляет временный UI client после rollback window.

## 1. Перед началом каждой задачи

1. Прочитать актуальный `README.md`, этот документ, `docs/technical-specification.md`, `docs/roadmap.md` и `docs/capability-matrix.md`. Для затрагиваемой подсистемы изучить связанные ADR, tests, capability/dependency matrices и известные residuals.
2. Проверить именно актуальную ветку `dev`, код, тесты, существующие PR, результаты CI и связанную задачу Linear. Исторические сообщения и старые снимки использовать только как контекст, сверяя их с текущими исходниками.
3. До изменения кода определить Engineering criteria, scoped automated checks и зависимости. Для UI/runtime-задачи указать соответствующую верхнеуровневую CODQA issue или добавить workflow в существующую QA-задачу. Формальную ручную/browser/runtime acceptance планировать на общий `test` candidate после интеграции всех относящихся к нему изменений; не запускать её как gate topic PR или отдельной Engineering issue.
4. Работать через отдельную topic-ветку и PR в правильный target согласно README. Не сливать PR автоматически без явного разрешения пользователя.
5. **Не использовать Remote Desktop Commander.** Не утверждать, что запускались локальные команды, браузерная/ручная приёмка или тесты, если результат фактически не был получен.

## 2. Состояния Linear: точное значение

Статус отражает фактическое состояние конкретной задачи, а не наличие PR и не желание привести доску к визуально завершённому виду.

| Статус | Когда ставить | Когда менять дальше |
|---|---|---|
| `Todo` | Работа ещё не начата. | При начале реализации — `In Progress`. |
| `In Progress` | Для COD: продолжается реализация, исправления, тесты или документация. Для CODQA: формальная проверка уже началась на конкретном `test` SHA. | Для COD — когда implementation criteria и scoped checks завершены, переводить в `In Review`. CODQA остаётся `Todo` до подходящего `test` candidate. |
| `In Review` | Для COD: implementation завершена, PR готов, ожидаются code review и/или обязательные CI checks. Для CODQA этот статус можно использовать только при наличии отдельного процесса review результата acceptance; он не относится к ожиданию будущего тестового кандидата. | Для COD — после успешного review, required checks и merge в `dev` переводить в `Done`; если нужны изменения кода — обратно в `In Progress`. |
| `Done` | Для COD: выполнены собственные Engineering criteria, scoped automated tests, CI Fast и PR evidence, PR прошёл review и влит в `dev`; функциональная/manual/browser/runtime acceptance в CODQA не требуется. Для CODQA: выполнены её acceptance criteria на зафиксированном `test` SHA и evidence записано. | Повторно открывать только если установлено, что критерии именно этой задачи не выполнены или появилась регрессия в её scope. |
| `Canceled` / `Duplicate` | Задача действительно отменена или дублирует другую. | В комментарии/описании указать причину, а для дубля — ссылку на основную задачу. |

### Обязательные правила переходов

- **Для COD не смешивать Engineering Done с продуктовой acceptance.** Код, PR и зелёный CI сами по себе не заменяют проверку Engineering criteria: должны пройти относящиеся к задаче automated tests и CI Fast, а PR/evidence должны быть доступны для review. Но отсутствие ручной/browser/runtime acceptance не удерживает COD issue открытой — эта проверка выполняется отдельно командой CODQA на `test`.
- **Для COD использовать `In Review` только для code review/обязательных CI checks.** Не переводить туда Engineering issue из-за ожидания ручной, визуальной, browser/runtime acceptance или свободного окна QA; эти работы находятся в CODQA и запускаются после promotion в `test`.
- Если остаётся существенная реализация, исправление замечаний или изменение кода по итогам проверки, задача остаётся/возвращается в `In Progress`.
- Не выполнять массовый перевод задач в `Done` ради уборки backlog. Каждую задачу оценивать отдельно по её критериям и фактическим доказательствам.
- При переводе COD issue в `In Review` записать результат реализации, PR, пройденные/непройденные engineering checks, known limitations и замечания, ожидающие code review. Ссылку на CODQA и ожидаемую будущую приёмку указывать для traceability, но не записывать её как блокирующий шаг Engineering.
- При переводе COD issue в `Done` убедиться, что её Engineering criteria, автоматические тесты, CI Fast и PR evidence проверены. Не ждать ручной/user/browser/runtime acceptance и не держать COD issue в `In Review` из-за незакрытой CODQA.
- Если CODQA сообщает о неуспешной acceptance, оставить/вернуть соответствующую QA issue в `In Progress` и создать отдельную Engineering/Bug issue в COD с воспроизводимым дефектом и ссылкой на test SHA/evidence. Не переоткрывать исходную Done Engineering issue автоматически; переоткрытие допустимо только если подтверждено, что её собственные критерии не были выполнены или регрессия входит в её scope.
- Статусы задач и состояние PR согласовывать, но не приравнивать: открытый PR не означает автоматически `In Progress`, а закрытый/слитый PR не означает автоматически `Done`.

## 3. Git branches, PR и продвижение изменений

- Начинать обычную разработку от актуального `dev` в отдельной topic-ветке. Не коммитить напрямую в `dev`, `test` или `main`; документация-only изменения также идут через PR.
- Стандартный маршрут: `topic branch → dev → test → main`. Не направлять обычные feature/fix-ветки прямо в `test` или `main` и не пропускать этапы продвижения.
- Один PR должен решать одну связную задачу. Указать связанный issue Linear и согласовать критерии, описание PR и evidence.
- Не сливать PR автоматически и не выполнять merge без явного разрешения пользователя. Успешные обязательные CI checks необходимы; formal manual/browser/runtime acceptance выполняется на `test` promotion candidate и не является gate обычного feature/fix PR в `dev`.
- Не ослаблять тесты, не отключать required checks и не менять target branch ради обхода красного CI. Исправить причину или явно задокументировать подтверждённый инфраструктурный сбой и повторить проверку.
- **E2E-покрытие развивается вместе с подсистемами:** если задача меняет пользовательский сквозной workflow, интеграцию между слоями или уже покрытый E2E-сценарий, связанные сценарии, fixtures, assertions и cleanup обновляются в том же topic PR. Не откладывать разработку и обслуживание такого покрытия до release candidate; изолированное изменение без затронутого сквозного поведения не требует искусственного E2E-теста.
- **Разделять разработку E2E-покрытия и массовый запуск:** наличие новых или обновлённых E2E-сценариев в topic PR не означает запуск всего набора. Для обычной инженерной задачи CI выполняет быстрые build/typecheck, unit/domain/contract/security и smoke checks. Не делать полный E2E suite обязательным gate для каждого небольшого PR и не переносить на него интеграционную отладку всего набора.
- **Полная интеграционная приёмка выполняется на promotion:** на PR `dev → test` весь E2E-набор запускается обязательно на собранном кандидате. Здесь проводится системная интеграционная отладка; найденные дефекты поведения или тестовой инфраструктуры исправляются, а promotion повторяется после обновления кандидата. Не пропускать, не ослаблять и не удалять проверки ради зелёного результата.
- **Жёсткая граница E2E CI:** ни один E2E suite не запускается в CI на topic/feature/fix PR в `dev`. Это правило распространяется без исключений на Playwright/UI/browser acceptance, MCP E2E, gameplay E2E и любые будущие сквозные сценарии, независимо от изменённых файлов. Полный набор запускается только начиная с promotion PR `dev → test` и далее на последующих release-promotion PR. Не добавлять E2E job/step в CI Fast, path-based browser smoke или ручной dispatch, который позволяет обойти эту границу.
- В том же PR обновлять связанные tests и документацию при изменении поведения, API, генерации кода, форматов проекта, установки или developer workflow.
- Не открывать `dev → test` как способ «поставить в очередь» ещё не завершённую работу. Promotion PR должен представлять реализованный и внутренне целостный acceptance candidate по правилам README.
- В PR/Linear сообщать только то, что подтверждается фактическими результатами. Отделять CI от локального запуска, автоматические тесты от ручной приёмки, а подтверждённые ограничения — от предположений.

## 4. Иерархия документов и evidence

- `README.md` — обязательные правила разработки, ветвления, CI и PR.
- `docs/technical-specification.md` — нормативные продуктовые и технические требования.
- `docs/roadmap.md` — этапы реализации, зависимости, очередность и критерии приёмки.
- `docs/capability-matrix.md` — подтверждённое состояние возможностей, пробелы и доказательства.
- Связанные ADR, dependency/capability matrices и baseline-документы — применять по затрагиваемой области.
- PR и комментарии Linear — источник истории конкретного изменения: ссылки, проверенные результаты, непроведённые тесты, residual risks и остающиеся acceptance steps.

Если источники расходятся, проверить текущую реализацию и тесты, затем согласованно исправить нормативный документ/roadmap/evidence; не считать устаревшее описание доказательством. Не объявлять функцию реализованной только по наличию UI-заготовки, деклараций типов, статического пути кода или успешной сборки, если её контракт требует runtime/browser-проверки.

## 5. Definition of Ready for Review и Definition of Done

**Engineering Ready for Review (COD):** запланированная реализация завершена; код, scoped automated tests и документация обновлены; PR создан; ожидаются только code review и/или required CI checks. Formal browser/runtime/manual acceptance не входит в это состояние и не выполняется для каждого topic PR.

**Engineering Done (COD):** выполнены критерии реализации, scoped automated tests и CI Fast; PR прошёл необходимый review и интегрирован в `dev`, ссылки и evidence записаны в issue. Не требуется ждать CODQA или появления `test` candidate.

**Functional acceptance Done (CODQA):** сценарии проверены на точном интегрированном SHA ветки `test`, а expected/actual, окружение, ограничения и evidence внесены в QA issue. Эта работа может завершиться позже Engineering delivery и не блокирует разработку других задач.

## 6. Итоговый отчёт по задаче

В конце каждой работы указать:

1. Linear issue и актуальный статус.
2. Ветку, PR и изменённые области.
3. Какие тесты и CI checks действительно прошли, со ссылками на результаты.
4. Какие локальные, ручные, browser/runtime checks проведены и какие не проводились.
5. Известные риски, ограничения и незакрытые критерии.
6. Обновлённые документы и необходимые следующие шаги приёмки.

Не обещать выполнение в фоне и не выдавать непроведённые проверки за выполненные.
