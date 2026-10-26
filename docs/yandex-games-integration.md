# Интеграция Yandex Games в Codogma Engine

**Статус:** первая модульная runtime-основа; требуется проверка в реальной среде Яндекс Игр и дальнейшая интеграция в UI редактора и сборщик.

Цель — развивать интеграцию по модели PluginYG2: отдельные модули, удобный API, тестовый адаптер для локальной среды, примеры и проверяемые релизные сценарии. Это не перенос Unity/C# кода: Codogma использует официальный JavaScript SDK и собственные TypeScript/JavaScript адаптеры.

## Принцип

[Unity-PluginYG-2](https://github.com/JustPlay-Max/Unity-PluginYG-2) организует платформенные функции по модулям: authorization, ads, saves/storage, leaderboards, payments, environment, flags, localization, fullscreen, server time, review, clipboard и дополнительные инструменты.

В Codogma перенимаются модульность и workflow. Код Unity, C#-обёртки и WebGL bridge не копируются. SDK подключается официальным способом; не хранить и не распространять собственную копию `sdk.js`.

## Реализовано в первом срезе

Пакет находится в `packages/yandex-games/` и не является обязательной зависимостью редактора.

| Модуль | Возможности |
|---|---|
| Client / SDK Loader | Загрузка официального SDK, защита от параллельных повторных загрузок, типизированные ошибки и идемпотентная инициализация |
| Lifecycle | Game Ready, Gameplay Start/Stop, SDK pause/resume, смена видимости вкладки |
| Ads | Fullscreen и rewarded video; награда только после SDK `onRewarded` |
| Player | Профиль, явная авторизация, cloud data и numeric stats |
| Leaderboards | Scores, description, entries, player entry и проверка доступности методов |
| Payments | Catalog, purchases, purchase/consume, опциональный signed response |
| Platform services | Environment/language, remote flags, server time, fullscreen, review, desktop shortcut, clipboard, external links |
| Mock | Контролируемая имитация SDK для тестов и локального preview |

Feature factories можно использовать отдельно или собрать через `createYandexGamesPlatform()`. Для небольшого production bundle подключайте только необходимые модули и проверяйте итоговый tree-shaking.

## Подключение

Для игры, размещаемой на Яндекс Играх, используйте рекомендуемый платформой путь `/sdk.js`. Для собственного домена используйте актуальный URL из [официальной инструкции](https://yandex.ru/dev/games/doc/ru/sdk/sdk-about). Не скачивайте и не копируйте SDK в репозиторий.

```ts
import { createYandexGamesPlatform } from "@codogma/yandex-games";

const yandex = createYandexGamesPlatform({
  sdkUrl: "/sdk.js",
  lifecycle: { onPause: pauseGame, onResume: resumeGame }
});

await yandex.initialize();
yandex.lifecycle.ready(); // только когда игра готова к взаимодействию
```

Для локального запуска подставляйте `createMockYandexGamesSdk()` явно. Не переключайте production автоматически на mock при ошибке SDK: это скрыло бы проблему интеграции.

## Обязательные гарантии поведения

- Rewarded-награда выдаётся только из события SDK `onRewarded`, а не по факту закрытия рекламы или `wasShown`.
- Во время рекламы gameplay reporting приостанавливается и возобновляется согласно предыдущему состоянию. Игра должна также приостанавливать собственную симуляцию/звук через callbacks.
- Авторизация не запрашивается автоматически. Покажите кнопку, объясните преимущество входа и сохраняйте возможность гостевой игры.
- Ошибки и недоступность SDK-методов должны быть видимы. Не считать отказ/ошибку платежа, рекламы или лидерборда успешным результатом.
- Client-side purchase response сам по себе не является серверной проверкой.
- Remote flags должны поддерживать local defaults; при сетевой ошибке базовый игровой сценарий остаётся доступным.
- `LoadingAPI.ready()` вызывается после загрузки ресурсов и появления интерактивного игрового экрана, не сразу после инициализации SDK.

## Тестирование

Из корня репозитория:

```bash
npm run test:platform
npm run build
```

Mock/unit tests проверяют initialization, module wrappers, rewarded semantics, save data, leaderboard, payments, lifecycle/pause-resume. Они проверяют Codogma adapter, но не заменяют проверку опубликованной игры через консоль Яндекс Игр.

Перед релизом отдельно проверьте SDK loading, Game Ready, рекламу/награду, cloud data, доступность leaderboard, IAP test flow, pause/resume, fullscreen и поведение при временной недоступности сети.

## Что нужно для дальнейшего parity с PluginYG2

Эта первая версия **не является полной функциональной копией** PluginYG2. Следующие отдельные этапы:

1. Editor UI: выбор целевой платформы, доступных модулей, настроек проекта и диагностика SDK.
2. Build/export integration: включение только используемых модулей, проверка entry point SDK и отчёт о production dependencies.
3. Local developer panel: управление mock-сценариями авторизации, рекламы, remote flags и player data.
4. Дополнительные модули по необходимости: Metrica, расширенный localization workflow и другие платформенные utilities.
5. Platform acceptance: тестовое размещение, Yandex debug mode, moderation checklist и релизная smoke-проверка.
6. Версионирование и совместимость API; публиковать пакет в npm только после стабилизации.

Эти задачи нужно выполнять небольшими PR с tests/docs, а не одним большим переписыванием.
