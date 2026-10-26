# @codogma/yandex-games

A modular integration layer for the official Yandex Games SDK, designed for Codogma Engine and Phaser-based HTML5 games.

The package does **not** include or redistribute Yandex's SDK script. It loads the official SDK at runtime and exposes typed, testable adapters.

## Install into a game project

During local development from this repository:

```bash
npm install ../path/to/codogma-engine/packages/yandex-games
```

The package is private while the integration contract is being validated. Publish to npm only after the API stabilizes.

## Quick start

For a game uploaded to Yandex Games, the SDK loader URL is normally `/sdk.js`. For your own domain, use the official absolute URL documented by Yandex.

```ts
import { createYandexGamesPlatform } from "@codogma/yandex-games";

export const platform = createYandexGamesPlatform({
  sdkUrl: "/sdk.js",
  lifecycle: {
    onPause: () => pauseGameAudioAndSimulation(),
    onResume: () => resumeGameAudioAndSimulation()
  }
});

await platform.initialize();
platform.lifecycle.ready(); // only when the game is truly interactive
platform.lifecycle.gameplayStart(); // when gameplay starts
```

The wrapper observes Yandex pause/resume and browser visibility events. The game still owns its scene/audio pause logic via callbacks.

## Modular use

For smaller production bundles, build the client and only the feature modules you need:

```ts
import {
  createYandexGamesClient,
  createYandexGamesAds,
  createYandexGamesPlayer,
  createYandexGamesLifecycle
} from "@codogma/yandex-games";

const client = createYandexGamesClient({ sdkUrl: "/sdk.js" });
const lifecycle = createYandexGamesLifecycle(client, {
  onPause: pauseGame,
  onResume: resumeGame
});
const ads = createYandexGamesAds(client);
const player = createYandexGamesPlayer(client);

await client.initialize();
lifecycle.ready();

const ad = await ads.showRewarded();
if (ad.rewarded) grantReward(); // the SDK's onRewarded event is required
```

The `createYandexGamesPlatform()` convenience composition includes all feature modules; use module factories for a smaller bundle.

## Modules in this initial version

- SDK loading/initialization and typed errors.
- Loading/gameplay lifecycle, SDK pause/resume and browser visibility.
- Fullscreen and rewarded ads.
- Player data, numeric stats, profile and explicit authorization.
- Leaderboard scores/entries and method availability.
- Payments catalog/purchases/purchase/consume with optional signed responses.
- Environment/language, remote flags, server time, fullscreen, review prompt, shortcut prompt, clipboard and external links.
- Explicit mock SDK for local development and automated tests.

The visual editor settings panel, automatic export wizard, Metrica helper, translation workflow and specialized banner/sticky widgets are not included in this first code slice; they remain separate roadmap items.

## Local mock

```ts
import { createYandexGamesPlatform, createMockYandexGamesSdk } from "@codogma/yandex-games";

const mockSdk = createMockYandexGamesSdk({
  playerData: { coins: 10 },
  rewardedAd: { wasShown: true, rewarded: true }
});
const platform = createYandexGamesPlatform({ sdkApi: mockSdk });
await platform.initialize();

const result = await platform.ads.showRewarded();
if (result.rewarded) console.log("The mock reports a completed rewarded view.");
```

Mock mode is explicit and must never be chosen implicitly in production.

## Important notes

- Initialize before calling modules.
- Authorization is never opened on startup; call it only after an informed user action.
- A client-side purchase response is not a substitute for server-side validation where required.
- Feature availability and failures must be surfaced; do not assume all SDK capabilities are enabled.
- Test the actual platform build, not only the local mock.
