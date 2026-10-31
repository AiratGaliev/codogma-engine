# ADR-0006: AI-assisted Game QA и отдельный Browser QA MCP

**Статус:** принято как целевое архитектурное направление; реализация и выбор browser provider не начаты.  
**Дата:** 31.10.2026  
**Связанные документы:** [Техническое задание](../technical-specification.md), [Дорожная карта](../roadmap.md), [Матрица возможностей](../capability-matrix.md), [ADR-0001: Core architecture](ADR-0001-core-architecture.md), [ADR-0003: Package architecture](ADR-0003-package-architecture-and-management.md).

## Контекст

Текущий Editor MCP предоставляет AI-агенту операции авторинга и редактирования проекта. Он не является полноценной средой автоматизированного тестирования работающей игры.

Практический эксперимент с локальным Codogma показал, что через существующий MCP можно создавать сцены и генерировать TypeScript, но для сквозного gameplay теста потребовалось вручную создавать временные Node.js scripts для transpilation, открытия браузера, чтения CDP state, отправки input, сбора screenshots и проверки игровых сценариев. Такие scripts полезны как диагностический эксперимент, но их появление при обычной разработке игры указывает на недостающий штатный workflow.

Техническое задание уже предусматривает независимые Build Pipeline, Game Preview Host и runtime diagnostics. Нужен отдельный архитектурный слой, который соединит их с управлением реальным браузером и проверяемыми gameplay scenarios.

## Решение

### 1. Не перегружать Editor MCP

Существующий **@codogma/editor-mcp-server** остаётся focused authoring interface: Project/Scene/Node/Component/Prefab/Asset, редакторские действия и project-file APIs.

Создать отдельный companion package с предварительным именем **@codogma/game-qa-mcp**. Он отвечает за тестовые browser sessions, пользовательский ввод, runtime observation, scenario execution и evidence reports. Он не копирует Editor MCP registry и не реализует повторно Build/Preview/Phaser.

### 2. Engine-owned Game Test Bridge

Игровой runtime предоставляет versioned diagnostic contract только в Development/Test profiles. Он передаёт stable IDs, сериализуемые snapshots, typed events и allowlisted diagnostics. Внутренние Phaser objects и backend-specific handles не раскрываются. Bridge не запускает собственный network listener/порт: Preview Host выдаёт ему session-scoped канал, привязанный к конкретному build/preview/test session, origin и ограниченному по времени capability token. Transport остаётся host-owned (например, MessagePort или другой согласованный channel) и закрывается вместе с Preview session.

Bridge не меняет production gameplay, не создаёт второй game loop, не исполняет произвольный код и полностью исключается из Release output. Наблюдение read-only по умолчанию; controlled test actions возможны только через явную регистрацию и Test profile.

### 3. Browser Controller как сменный provider

Browser control — отдельная ответственность, не часть Core и не часть Editor MCP. Браузерные действия следуют циклу observe → resolve target → actionability → execute → verify → recover; target references привязаны к сессии/поколению документа, действия возвращают verified/unverified status, pre/post state и typed recovery hints. Не повторять stale или outcome-unknown действия вслепую.

Playwright является основным кандидатом для isolated browser contexts. CDP — дополнительный способ attach к существующему Chromium-based browser и получения расширенной диагностики. Выбор конкретных пакетов/версий подтверждается отдельным technical spike, capability matrix и security review.

Поддерживаются два explicit modes:
- isolated QA context/profile — default;
- attach к существующему браузеру — только по явному запросу, с выбором конкретной вкладки.

Kimi Browser Extension/WebBridge и открытые WebBridge adapters используются как design references. Codogma не зависит от Kimi extension, его недокументированного протокола или наличия его исходников.

### 4. Declarative Scenario Runner

Game QA MCP предоставляет высокоуровневые операции и запускает versioned declarative scenarios. Сценарий содержит setup, preconditions, browser-level inputs, waits, runtime state/event assertions, evidence checkpoints и teardown.

Произвольный shell execution, arbitrary page evaluation и неограниченный JavaScript не входят в стандартную поверхность MCP. Агент не должен создавать одноразовые infrastructure scripts для запуска браузера, отправки клавиш, ожиданий, чтения runtime или получения screenshots. Project-owned gameplay source и явно объявленные test artifacts остаются частью проекта.

### 5. Evidence-first результаты

Каждый run создаёт report, связанный с project revision, build/preview/session/scenario IDs и browser environment. Report содержит expected/actual, шаги, runtime/browser errors, event snapshots и ссылки на screenshots/video/traces. Статусы PASS/FAIL/SKIP/UNVERIFIED различаются; dispatched action без проверки результата не считается успешным тестом.

### 6. Безопасность

Первоначальная реализация локальная и loopback-only для Game QA MCP, Browser Controller и локальных orchestration endpoints. Game Test Bridge не имеет собственного порта/listener и доступен только через session-scoped channel Preview Host. Для каждой сессии используется ограниченный по времени capability token и разрешённый preview origin. Изолированный browser context — default; пользовательский профиль и cookies не читаются и не экспортируются автоматически. CDP attach считается высокопривилегированным. Test Bridge отсутствует в Release bundle и подтверждается output-level tests.

## Почему это отдельное направление

Build API отвечает за создание игры. Preview Host отвечает за её жизненный цикл. Game Test Bridge сообщает, что происходит внутри игрового runtime. Browser Controller управляет настоящим браузером. Game QA MCP соединяет эти контракты и организует сценарии и evidence.

Такое разделение не привязывает Core к MCP или Playwright, сохраняет Editor MCP простым и позволяет менять браузерный backend без переписывания игровой модели.

## Рассмотренные reference

- [Kimi Browser Extension / WebBridge](https://www.kimi.com/en/products/kimi-browser-extension) — reference локального browser bridge; не зависимость Codogma.
- [Nimm0ny/kimi-webbridge-mcp](https://github.com/Nimm0ny/kimi-webbridge-mcp) — независимый MCP adapter к Kimi WebBridge; изучать tool profiles, verification, session and smoke/E2E patterns.
- [efrg123/kimi-webbridge](https://github.com/efrg123/kimi-webbridge) — публичные v2 architecture/API/planning documents; использовать observe → target → action → verify → recovery как design reference, не считать все запланированные элементы уже реализованным продуктом.
- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) — reference browser automation.
- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) — reference diagnostics, network, screenshots and performance tooling.

Code reuse requires separate license, security, dependency and compatibility review. Prefer reusable concepts and Codogma-owned contracts over copying an upstream implementation.

## Последствия

**Положительные:**
- AI-агент тестирует gameplay через штатные инструменты, а не пишет временную инфраструктуру.
- Runtime observations основаны на engine-owned IDs/events, а не на попытках распознать Canvas только по картинке.
- Browser control отделён от игровых internals и может сменить provider.
- Отчёты воспроизводимы и пригодны для QA/release acceptance.
- Editor MCP не превращается в универсальный browser automation server.

**Стоимость и ограничения:**
- Появляются дополнительные versioned contracts, session lifecycle и security boundary.
- Для Test Bridge требуется instrumentation в Development/Test runtime и поддерживаемых adapters.
- Browser automation требует browser/version matrix; emulation не заменяет физические устройства.
- Full gameplay suites дороже быстрых unit/contract checks и должны запускаться адресно или на release/test gates.
- Реализация зависит от минимальной готовности Build API и Preview lifecycle.

## Не входит в это решение

- Создание универсального MCP для произвольных веб-сайтов.
- Форк/копирование Kimi Browser Extension.
- Встраивание Playwright/CDP в Core или production game bundle.
- Замена unit/integration tests и существующего browser E2E редактора.
- Автоматическое управление личным браузерным профилем пользователя.
- Произвольный запуск команд ОС или JavaScript из стандартных QA tools.

## Открытые вопросы для technical spike

- Совместимость Playwright и CDP attach с поддерживаемыми версиями Chrome/Yandex Browser.
- Нужен ли extension-based provider для специальных браузерных сценариев; он не входит в initial dependency.
- Точная граница размещения Game Test Bridge между Core и runtime adapters.
- Storage/retention policy для видео и trace artifacts.
- Минимальный перечень engine-owned gameplay events и механизм project-defined semantic events.
- Какой уровень deterministic clock/fixed-step можно гарантировать без изменения semantics реальной игры.

## Критерий закрытия ADR

ADR считается реализованным только после выполнения acceptance criteria ТЗ §13.4 на чистом игровом fixture: build → preview → isolated browser session → real browser input → runtime assertions → restart → evidence report → cleanup, без временных infrastructure scripts, создаваемых AI-агентом.
