import { createYandexGamesPlatform } from "../src/index.js";

/** Example setup for a Phaser 4 project; adapt pause/resume to your own scenes. */
export async function initializeYandexGames({ pauseGame, resumeGame } = {}) {
    const platform = createYandexGamesPlatform({
        sdkUrl: "/sdk.js",
        lifecycle: {
            onPause: () => pauseGame?.(),
            onResume: () => resumeGame?.()
        }
    });

    await platform.initialize();
    platform.lifecycle.ready(); // call only after the game is playable
    return platform;
}

export async function requestRewardedContinue(platform, grantContinue) {
    const result = await platform.ads.showRewarded();
    if (result.rewarded) grantContinue();
    return result;
}
