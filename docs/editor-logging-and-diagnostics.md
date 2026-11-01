# Editor Logging & Diagnostics

## Статус

**Архитектурное направление зафиксировано; единая система логирования ещё не реализована.** Документ задаёт требования и варианты проектирования, а не описывает существующую возможность. Основная реализация относится к этапу 6 дорожной карты; минимальные диагностические сообщения добавляются в конкретных bug-fix PR по мере необходимости.

## Зачем это необходимо

Без общего журнала разработчик не видит полную последовательность событий между Editor UI, Asset Pack, Scene Editor, Preview/Runtime, build pipeline и Node.js server. Ошибка может проявиться в одном месте, возникнуть в другом процессе и остаться только в DevTools или терминале. В результате поведение движка выглядит как «магия»: невозможно восстановить контекст операции, увидеть вторичный сбой восстановления или понять, какое состояние было до ошибки.

Логирование — не декоративный Console panel и не набор случайных `console.log()`. Это инфраструктурный контракт диагностики, который должен быть доступен каждому модулю движка и давать пользователю понятный, воспроизводимый след событий.

## Текущая база и ограничения

Аудит текущего legacy Colibri editor и Node.js server показывает несколько отдельных механизмов, которые не образуют единую систему:

- Клиент редактора использует браузерный `console.*` в отдельных местах. В просмотренных точках входа нет общего `EditorLogger` и централизованного сбора `window.error` / `unhandledrejection`.
- Браузерная консоль и Node.js terminal принадлежат разным процессам. Вызов `console.error()` из TypeScript-кода Editor виден в Browser DevTools, но автоматически не попадает в терминал сервера.
- `server/server.mjs` содержит локальную функцию `log()`, которая пишет сообщения самого Node.js server в stdout. Команда `npm run dev` дополнительно направляет этот вывод в корневой `dev.log`; это не журнал браузерного редактора и не общий application log.
- Окно **AI → MCP Message Log** показывает только сообщения legacy MCP bridge. Оно не собирает обычные ошибки editor plugins, HTTP server, Preview или игры.
- Подмена `window.alert` в `AlertDialog` улучшает показ alert-сообщений, но не перехватывает исключения и не заменяет журнал.

Поэтому наличие server logger, `dev.log`, Browser Console и MCP Message Log нельзя считать выполнением требования к Editor Logging & Diagnostics.

## Принципы, заимствуемые у ориентиров

Не копировать внутреннюю реализацию Unity, Godot или Cocos Creator. Заимствовать проверенные пользовательские сценарии и независимо реализовать Engine-owned TypeScript contracts.

### Unity 6

Console window объединяет сообщения Editor и scripts, поддерживает поиск и фильтрацию, счётчики типов сообщений, сворачивание повторяющихся ошибок, timestamp, просмотр полного сообщения и stack trace с переходом к исходной строке. Из Console доступны Editor/Player log files; тип stack trace можно настраивать отдельно для типов сообщений.

Референсы: [Unity 6 — Console window](https://docs.unity.com/en-us/engine/6000.6/manual/unity-editor/editor-windows-views-reference/console-window), [Console window reference](https://docs.unity.com/en-us/engine/6000.0/manual/unity-editor/editor-windows-views-reference/console), [Log files reference](https://docs.unity.com/en-us/engine/6000.5/manual/get-started/project-configuration/log-files).

### Godot 4

Output panel разделяет Log, Error, Warning и Editor messages, позволяет фильтровать сообщения по типу и тексту, очищать вывод и управлять очисткой при запуске. Отдельная logging configuration управляет stdout/stderr и файловым логированием. Важный паттерн — редакторские сообщения и вывод запущенной игры доступны в понятном диагностическом workflow, а не только в инструментах разработчика.

Референсы: [Godot 4.6 — Output panel](https://docs.godotengine.org/en/4.6/tutorials/scripting/debug/output_panel.html), [Godot — Logging](https://docs.godotengine.org/en/latest/tutorials/scripting/logging.html), [Godot 4.4 — Debugging tools / File Logging](https://docs.godotengine.org/en/4.4/tutorials/scripting/debug/overview_of_debugging_tools.html).

### Cocos Creator 4.0

Preview workflow позволяет выбирать уровни сообщений, выводимых в browser console, и показывает сообщения Simulator в Console panel. API `error()` принимает не только строку, но и объекты диагностики. В более ранней официальной документации Console panel отдельно описаны текстовый/regex-фильтр, уровни сообщений, объединение повторов и открытие log file; эти паттерны полезны как UX-reference, но не считаются подтверждённым описанием каждой детали UI версии 4.0.

Референсы: [Cocos Creator 4.0 — Project Preview & Debugging](https://docs.cocos.com/creator/4.0/manual/en/editor/preview/), [Cocos Creator 4.0 — error API](https://docs.cocos.com/creator/4.0/api/en/function/error), [Cocos Creator 3.4 — Console panel reference](https://docs.cocos.com/creator/3.4/en/editor/console/).

## Целевая архитектура

### 1. Общий API и контракт записи

Ввести общий Engine-owned API (предварительное имя `EditorLogger`) и типизированную запись, не зависящие от Colibri, SolidJS, DOM, Node.js или конкретной панели UI.

Минимальная запись должна содержать:

- `timestamp` — время события в ISO 8601 / epoch milliseconds;
- `level` — `debug`, `info`, `warn`, `error`;
- `channel` — `editor`, `runtime`, `build`, `server`, `mcp` либо `extension`;
- `subsystem` — стабильный идентификатор подсистемы, например `asset-pack`, `scene-editor`, `preview`;
- `message` — короткое понятное описание события;
- `error` — нормализованные `name`, `message`, `stack` и ограниченная цепочка `cause`, если есть исключение;
- `context` — ограниченный набор сериализуемых полей: operation, asset key, scene/entity ID, project/build/runtime session ID и т. п.;
- `repeatCount` / `correlationId` — для группировки одинаковых сообщений и связи событий одной операции.

Не хранить произвольные живые объекты, DOM nodes, Phaser objects, secrets или бесконечные ссылки в журнале. Контекст формируется на границе операции из разрешённых полей; исходная ошибка и stack trace не должны теряться при нормализации.

### 2. Независимые каналы и sinks

Один UI-independent logging contract используется legacy Colibri на переходе и текущим SolidJS Host; после cutover целевым consumer остаётся SolidJS. Источники и sinks должны быть разделены:

- **Editor** — жизненный цикл UI, команды, панели, Inspector, imports, plugin lifecycle и ошибки редактора.
- **Runtime** — сообщения конкретной Preview/game session; session ID обязателен, чтобы не смешивать две запущенные игры.
- **Build** — build/validation diagnostics с привязкой к build ID и source location.
- **Server** — Node.js HTTP/API и инфраструктурные ошибки.
- **MCP** — инструментальные вызовы и транспорт; существующий MCP Message Log может остаться специализированным представлением этого канала.

Минимальные sinks: bounded in-memory store для Console panel, Browser Console adapter для немедленной диагностики и Node.js/file sink для терминала и сохраняемого журнала. В режиме разработки ошибки и предупреждения клиента должны иметь возможность попасть в server log через отдельный защищённый transport. Не предполагать, что browser `console.error` сам по себе пишет в stdout Node.js.

### 3. Console panel в Editor

Добавить штатную dockable Console/Output panel с:

- фильтрами по уровню и каналу, поиском по тексту и subsystem;
- timestamp, counters и группировкой одинаковых повторяющихся сообщений;
- списком записей и отдельной областью полного сообщения/stack trace/context;
- переходом по доступной source location; по возможности — выбором связанного asset/scene/entity в соответствующей панели;
- командами Clear view, Copy/Export diagnostics и Open log file;
- явным различием очистки видимого списка и удаления сохранённого log file;
- независимыми фильтрами Editor / Runtime / Build / Server / MCP.

Обычная статусная строка может показывать последнее важное сообщение/количество новых ошибок, но не заменяет полноценную Console panel.

### 4. Перехват необработанных ошибок

Центральная интеграция должна собирать `window.error` и `unhandledrejection`, добавляя context текущей editor/runtime session. Перехватчик не должен без причины подавлять стандартное browser reporting, блокировать приложение или генерировать дублирующиеся записи; нужны deduplication и тесты на оба типа событий.

На границах операций логировать ошибки с полезным контекстом. Не превращать все ошибки в безымянные строки и не заменять исходный stack trace новым исключением без причины.

### 5. Правила catch/recovery

Пустой `catch` допустим только для явно ожидаемого и безопасного fallback, причина игнорирования должна быть документирована. Во всех остальных случаях ошибка должна быть возвращена/переброшена, показана пользователю или зарегистрирована.

Особое правило rollback/recovery: если основная операция завершилась ошибкой и восстановление состояния тоже не удалось, логировать **обе** ошибки с контекстом операции, но наружу сохранять первоначальную ошибку как primary cause. Сбой rollback должен быть виден как отдельная серьёзная диагностика, а не исчезать внутри пустого `catch`.

### 6. Terminal и persistent log files

- Node.js server продолжает писать структурированные записи в stdout/stderr; `dev.log` остаётся полезным capture текущего dev process, но не единственным хранилищем.
- Browser-originated diagnostics должны передаваться на сервер отдельным same-origin/loopback endpoint или другим явно выбранным transport. Endpoint обязан проверять Origin/Host, loopback boundary, payload size и rate; он не должен давать browser-коду произвольную запись в filesystem.
- File sink должен поддерживать ограничение размера/retention и безопасную ротацию. Выбор каталога (per-user application logs vs project-local diagnostics), имя файла и OS-specific путь требуется отдельным решением; не засорять пользовательский проект логами без opt-in.
- Ошибка транспорта logging не должна мешать редактированию. При недоступном server sink событие остаётся в Browser Console и bounded memory buffer.

### 7. Development / production policy и производительность

В Development должны быть доступны подробные диагностические контексты и stack trace для ошибок. В production нельзя отправлять debug/info по умолчанию или собирать лишние пользовательские данные; уровни, retention и поведение должны быть настраиваемыми. Stack trace и сериализация тяжёлых объектов выполняются только для нужных уровней/режимов. Повторяющиеся ошибки группируются и ограничиваются по частоте, чтобы ошибки из frame loop не переполняли память и диск.

Нужны redaction secrets/tokens, ограничение длины сообщений и metadata, защита от циклических объектов и стабильное поведение при переполнении буфера.

## Планируемые этапы

1. Утвердить типизированный LogEntry/API и правила catch/recovery; подключить Browser Console adapter.
2. Ввести общий bounded store, Console panel и автоматический сбор необработанных browser errors.
3. Добавить защищённый Browser → Node transport, server/file sink, ротацию и открытие log file из Editor.
4. Разделить Editor/Runtime/Build/Server/MCP sessions, добавить source/context navigation и отчёт diagnostics.
5. Добавить тесты, release policy, privacy/redaction и измерить влияние на производительность.

## Критерии приёмки будущей реализации

- Сообщение, записанное из любой поддерживаемой editor subsystem через общий API, появляется в Console panel с правильными level/channel/subsystem/context.
- Необработанные browser error и rejected Promise видны в журнале с stack trace и без двойной регистрации.
- Ошибка в reimport и ошибка rollback/recovery различимы; primary error сохраняется, secondary error не теряется.
- Вызовы Editor, Runtime, Build, Server и MCP не смешиваются; Runtime logs привязаны к сессии.
- Поиск, фильтрация, повторная группировка, clear view, копирование/export и открытие log file проверяются автоматически и в browser acceptance.
- При остановке Preview её session resources/listeners очищаются, но уже собранный диагностический отчёт остаётся доступен согласно retention policy.
- Browser → Node log transport не принимает non-loopback/foreign-origin requests, ограничивает размер/rate и не пишет произвольные пути.
- File logs имеют ограничение размера/retention, не содержат известных секретов и не попадают в release bundle как debug artifacts.
- Недоступность log transport не ломает Editor; локальная диагностика остаётся доступной.
- CI и ручная приёмка проверяют реальный browser/OS workflow, а не только unit tests logger.

## Границы текущей задачи

Текущий PR добавляет только диагностический `console.error` при неудаче восстановления Asset Pack после ошибки reimport. Он не реализует общий API, Console panel, browser-to-server transport, файловую ротацию или автоматический сбор глобальных ошибок. Эти функции остаются отдельным архитектурным направлением этапа 6.
