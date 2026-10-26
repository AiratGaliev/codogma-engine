import test from "node:test";
import assert from "node:assert/strict";

import {
    createYandexGamesClient,
    createYandexGamesPlatform,
    createMockYandexGamesSdk,
    loadYandexGamesSdk,
    YandexGamesIntegrationError
} from "../../packages/yandex-games/src/index.js";

function makePlatform(mockOptions = {}, options = {}) {
    const mockSdk = createMockYandexGamesSdk(mockOptions);
    const platform = createYandexGamesPlatform({ sdkApi: mockSdk, documentObject: null, ...options });
    return { platform, mockSdk };
}

test("client initialization is idempotent and requires initialization before use", async () => {
    const { platform, mockSdk } = makePlatform();

    assert.throws(() => platform.getSDK(), (error) =>
        error instanceof YandexGamesIntegrationError && error.code === "SDK_NOT_INITIALIZED"
    );

    const [first, second] = await Promise.all([platform.initialize(), platform.initialize()]);
    assert.equal(first, second);
    assert.equal(platform.state, "ready");
    assert.equal(mockSdk.calls.filter((call) => call.method === "init").length, 1);

    platform.dispose();
    assert.equal(platform.state, "disposed");
});

test("SDK loader returns a preloaded YaGames global", async () => {
    const api = { init: async () => ({}) };
    assert.equal(await loadYandexGamesSdk({ globalObject: { YaGames: api }, documentObject: null }), api);
});

test("rewarded ad pauses and resumes gameplay; reward comes from onRewarded", async () => {
    const { platform, mockSdk } = makePlatform({ rewardedAd: { wasShown: true, rewarded: true } });

    await platform.initialize();
    platform.lifecycle.ready();
    platform.lifecycle.gameplayStart();

    const result = await platform.ads.showRewarded();
    assert.equal(result.wasShown, true);
    assert.equal(result.rewarded, true);

    const calls = mockSdk.calls.map((call) => call.method);
    const firstStart = calls.indexOf("features.GameplayAPI.start");
    const stop = calls.indexOf("features.GameplayAPI.stop");
    const resumedStart = calls.lastIndexOf("features.GameplayAPI.start");
    assert.ok(firstStart >= 0);
    assert.ok(stop > firstStart);
    assert.ok(resumedStart > stop);

    platform.dispose();
});

test("closing rewarded ad without reward callback does not award anything", async () => {
    const { platform } = makePlatform({ rewardedAd: { wasShown: true, rewarded: false } });
    await platform.initialize();

    const result = await platform.ads.showRewarded();
    assert.equal(result.wasShown, true);
    assert.equal(result.rewarded, false);

    platform.dispose();
});

test("player data and stats can be saved and loaded", async () => {
    const { platform, mockSdk } = makePlatform({ playerData: { level: 1, coins: 10 }, playerStats: { wins: 2 } });
    await platform.initialize();

    await platform.player.saveData({ level: 3, coins: 25 });
    await platform.player.incrementStats({ wins: 1 });

    assert.deepEqual(await platform.player.loadData(), { level: 3, coins: 25 });
    assert.deepEqual(await platform.player.getStats(), { wins: 3 });
    assert.equal(mockSdk.getMockState().playerData.coins, 25);

    platform.dispose();
});

test("authorization is explicit and returns the refreshed player", async () => {
    const { platform, mockSdk } = makePlatform({ authorized: false });
    await platform.initialize();

    assert.equal(await platform.player.isAuthorized(), false);
    await platform.player.authorize();
    assert.equal(await platform.player.isAuthorized(), true);
    assert.ok(mockSdk.calls.some((call) => call.method === "auth.openAuthDialog"));

    platform.dispose();
});

test("leaderboard score, entries and player entry are wrapped", async () => {
    const { platform } = makePlatform({ authorized: true });
    await platform.initialize();

    await platform.leaderboards.setScore("score", 123);
    assert.equal(await platform.leaderboards.isAvailable("leaderboards.getPlayerEntry"), true);
    assert.equal((await platform.leaderboards.getEntries("score")).entries[0].score, 123);
    assert.equal((await platform.leaderboards.getPlayerEntry("score")).score, 123);

    platform.dispose();
});

test("player leaderboard entry fails clearly when unavailable", async () => {
    const { platform } = makePlatform({ authorized: false });
    await platform.initialize();

    await assert.rejects(platform.leaderboards.getPlayerEntry("score"), (error) =>
        error instanceof YandexGamesIntegrationError && error.code === "LEADERBOARD_PLAYER_ENTRY_UNAVAILABLE"
    );

    platform.dispose();
});

test("payments expose catalog, purchase and consume", async () => {
    const { platform, mockSdk } = makePlatform({ catalog: [{ id: "coins-100", price: "1.00" }] });
    await platform.initialize();

    assert.equal((await platform.payments.getCatalog())[0].id, "coins-100");
    const purchase = await platform.payments.purchase("coins-100");
    assert.equal(purchase.productID, "coins-100");
    await platform.payments.consumePurchase(purchase.purchaseToken);
    assert.equal((await platform.payments.getPurchases()).length, 0);
    assert.ok(mockSdk.calls.some((call) =>
        call.method === "getPayments" && call.args.paymentsOptions.signed === false
    ));

    platform.dispose();
});

test("platform flags merge local defaults with remote values", async () => {
    const { platform } = makePlatform({ remoteFlags: { difficulty: "hard" } });
    await platform.initialize();

    assert.deepEqual(
        await platform.platform.getFlags({ defaultFlags: { difficulty: "normal", music: "on" } }),
        { difficulty: "hard", music: "on" }
    );
    assert.equal(platform.platform.getLanguage(), "ru");

    platform.dispose();
});

test("review and shortcut prompts check availability first", async () => {
    const { platform, mockSdk } = makePlatform({ reviewAvailable: false, shortcutAvailable: false });
    await platform.initialize();

    assert.deepEqual(await platform.platform.requestReview(), {
        requested: false, feedbackSent: false, reason: "disabled-in-mock"
    });
    assert.deepEqual(await platform.platform.showShortcutPrompt(), {
        requested: false, outcome: "unavailable"
    });

    const methods = mockSdk.calls.map((call) => call.method);
    assert.ok(!methods.includes("feedback.requestReview"));
    assert.ok(!methods.includes("shortcut.showPrompt"));
    platform.dispose();
});

test("SDK pause/resume events update gameplay lifecycle", async () => {
    const { platform, mockSdk } = makePlatform();
    await platform.initialize();
    platform.lifecycle.gameplayStart();

    mockSdk.emit("game_api_pause");
    assert.equal(platform.lifecycle.isSuspended, true);
    mockSdk.emit("game_api_resume");
    assert.equal(platform.lifecycle.isSuspended, false);

    const methods = mockSdk.calls.map((call) => call.method);
    assert.equal(methods.filter((method) => method === "features.GameplayAPI.start").length, 2);
    assert.equal(methods.filter((method) => method === "features.GameplayAPI.stop").length, 1);
    platform.dispose();
});

test("fullscreen state tracks request and exit", async () => {
    const { platform } = makePlatform();
    await platform.initialize();

    assert.equal(platform.platform.isFullscreen(), false);
    await platform.platform.requestFullscreen();
    assert.equal(platform.platform.isFullscreen(), true);
    await platform.platform.exitFullscreen();
    assert.equal(platform.platform.isFullscreen(), false);
    platform.dispose();
});
