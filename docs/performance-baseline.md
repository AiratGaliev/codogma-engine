# Baseline производительности

**Снимок репозитория:** `dev` на `754edaa1f7313409e99c3462a802d5fd430a9a01`, 27.10.2026.  
**Статус:** документ и протокол измерений созданы; достоверные численные baseline results ещё не сняты. В репозитории нет оснований утверждать конкретные FPS, CPU %, latency или размер собранной игры.

## Цель и границы

Снять воспроизводимые baseline measurements для существующего editor workflow и нового первого Core vertical slice. Измерения нужны перед оптимизациями и перед введением performance budgets. Они не должны задерживать локальный audit/toolchain pilot, но значения нельзя заменять оценочными цифрами.

## Закреплённые тестовые сценарии

| ID | Сценарий | Fixture / окружение | Основные метрики | Статус |
|---|---|---|---|---|
| PERF-01 | Холодный старт сервера и открытие IDE | `tests/workspace/test-typescript`; Node.js 22; точная ОС/CPU/browser version записать при запуске | Время старта сервера, HTTP ready, navigation/first usable UI | Не измерено |
| PERF-02 | Открытая IDE без взаимодействия | Одна неизменяемая тестовая сцена; браузер в foreground; фиксированный интервал 60 s | Средний/пиковый CPU процесса/вкладки, память до/после, фоновые задачи | Не измерено |
| PERF-03 | Открытие и редактирование сцены | `Level.scene` плюс один фиксированный сценарий transform/inspector/undo/redo | p50/p95 frame duration, input-to-paint latency, время save/reopen | Не измерено |
| PERF-04 | Asset Pack import/preview | Отдельный набор фиксированных изображений, spritesheet, шрифта и видео; размер/количество файлов записать | Import duration, preview first-frame time, peak memory, ошибки и cleanup | Не измерено |
| PERF-05 | Generated runtime scene | Fixture на Phaser 4.2.1, фиксированные объекты/FX; фиксировать browser/GPU и build | Startup time, frame-time p50/p95, long tasks, output raw/gzip size | Не измерено |
| PERF-06 | Core vertical slice | Project → Scene → Node/Transform → component → save/reopen → preview/build fixture | Время сериализации, round-trip, start/stop/restart, build duration | Будет доступно после реализации |

## Протокол

1. Зафиксировать SHA исходников, Node/npm versions, ОС/CPU/RAM, браузер и версию GPU/драйвера; для browser runtime записать WebGL/GPU mode и фоновую нагрузку.
2. Зафиксировать fixture и сценарий взаимодействия вместе с результатом; не менять ассеты между повторами.
3. Для cold start выполнить 5 прогонов и записать все значения. Для steady-state использовать 3 повторных запуска после прогрева; записывать raw samples, median и p95, а не одно лучшее значение.
4. Не сравнивать разные машины/браузеры или разные fixtures без пометки. Для CPU использовать одну согласованную методику (browser performance trace либо OS process metrics) и описать способ получения результата.
5. Сохранять trace/log или небольшую сводку в PR/CI artifact. Сначала определить baseline, затем обсуждать budgets на основании наблюдаемого workload.
6. Не использовать один headless SwiftShader result как замену измерению целевого браузера с фактическим GPU; отдельно помечать headless/CI environment.

## Наблюдения из статического аудита

- Текущий `npm run build` компилирует editor TypeScript project references; это не benchmark или headless game build.
- CI Fast выполняет build/server/security smoke, а не performance suite.
- В текущей интеграции Phaser 4.2.1 runtime подключается vendored bundle `scripts/phaser.min.js`; эффект реального feature selection на размере bundle не доказан.
- Известные runtime follow-ups FX/Box2D/Asset Pack должны сначала пройти functional acceptance. Нет смысла фиксировать производительность эффекта до подтверждения корректного результата.

## Запись результатов

При первом измерении заменить статусы `Не измерено` только вместе с evidence:

| Поле | Значение |
|---|---|
| Commit SHA | Не записан |
| ОС / CPU / RAM | Не записано |
| Node.js / npm | Не записано |
| Браузер / GPU | Не записано |
| Fixture hash / набор ресурсов | Не записано |
| Raw samples / trace | Не приложены |
| Summary (median / p95) | Не измерено |

Не ставить performance threshold, пока одна и та же процедура не даст воспроизводимые результаты.
