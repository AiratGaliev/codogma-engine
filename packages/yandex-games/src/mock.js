import { YandexGamesIntegrationError } from "./errors.js";

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

/**
 * Explicit local-test replacement for the YaGames global.
 * It is opt-in; production builds must use the official SDK.
 */
export function createMockYandexGamesSdk(options = {}) {
    const calls = [];
    const eventListeners = new Map();
    const record = (method, args = {}) => calls.push({ method, args: clone(args) });

    let playerData = clone(options.playerData ?? {});
    let playerStats = clone(options.playerStats ?? {});
    let authorized = Boolean(options.authorized);
    let fullscreenStatus = "off";
    const scores = new Map();
    let reviewRequested = false;

    const environment = clone(options.environment ?? {
        app: { id: "codogma-local", name: "Codogma Local Preview" },
        i18n: { lang: "ru", tld: "ru" },
        payload: null,
        domain: "localhost",
        browser: { lang: "ru", platform: "desktop" }
    });

    const emit = (eventName, payload) => {
        for (const listener of [...(eventListeners.get(eventName) ?? [])]) {
            listener(payload);
        }
    };

    const makePlayer = () => ({
        getData: async (keys) => {
            record("player.getData", { keys });
            if (!Array.isArray(keys)) return clone(playerData);
            return Object.fromEntries(
                keys.filter((key) => Object.hasOwn(playerData, key))
                    .map((key) => [key, clone(playerData[key])])
            );
        },
        setData: async (data, flush = false) => {
            record("player.setData", { data, flush });
            playerData = { ...playerData, ...clone(data) };
        },
        getStats: async (keys) => {
            record("player.getStats", { keys });
            if (!Array.isArray(keys)) return clone(playerStats);
            return Object.fromEntries(
                keys.filter((key) => Object.hasOwn(playerStats, key))
                    .map((key) => [key, playerStats[key]])
            );
        },
        setStats: async (stats) => {
            record("player.setStats", { stats });
            playerStats = { ...playerStats, ...clone(stats) };
        },
        incrementStats: async (stats) => {
            record("player.incrementStats", { stats });
            for (const [key, value] of Object.entries(stats)) {
                playerStats[key] = Number(playerStats[key] ?? 0) + Number(value);
            }
        },
        isAuthorized: () => authorized,
        getUniqueID: () => options.playerId ?? "mock-player",
        getName: () => options.playerName ?? (authorized ? "Mock Yandex Player" : "Guest"),
        getPhoto: () => options.playerPhoto ?? "",
        getPayingStatus: () => options.payingStatus ?? "unknown"
    });

    const adv = {
        showFullscreenAdv({ callbacks = {} } = {}) {
            record("adv.showFullscreenAdv");
            const result = options.fullscreenAd ?? { wasShown: true };
            queueMicrotask(() => {
                if (result.error) callbacks.onError?.(new Error(String(result.error)));
                else if (result.wasShown) callbacks.onOpen?.();
                callbacks.onClose?.(Boolean(result.wasShown));
            });
        },
        showRewardedVideo({ callbacks = {} } = {}) {
            record("adv.showRewardedVideo");
            const result = options.rewardedAd ?? { wasShown: true, rewarded: true };
            queueMicrotask(() => {
                if (result.error) {
                    callbacks.onError?.(new Error(String(result.error)));
                } else if (result.wasShown) {
                    callbacks.onOpen?.();
                    if (result.rewarded) callbacks.onRewarded?.();
                }
                callbacks.onClose?.(Boolean(result.wasShown));
            });
        }
    };

    const configuredLeaderboards = options.leaderboards ?? {};
    const leaderboards = {
        setScore: async (name, score, extraData) => {
            record("leaderboards.setScore", { name, score, extraData });
            scores.set(name, { name, score, extraData });
        },
        getDescription: async (name) => {
            record("leaderboards.getDescription", { name });
            return { name, title: name, description: "" };
        },
        getEntries: async (name, query = {}) => {
            record("leaderboards.getEntries", { name, query });
            const configured = configuredLeaderboards[name];
            const stored = scores.has(name) ? [scores.get(name)] : [];
            const source = (Array.isArray(configured) ? configured : stored)
                .filter(Boolean)
                .sort((a, b) => Number(b.score) - Number(a.score));
            const quantityTop = query.quantityTop ?? 5;

            return {
                leaderboard: { name, title: name },
                ranges: [{ start: 0, size: Math.min(source.length, quantityTop) }],
                userRank: 0,
                entries: source.slice(0, quantityTop).map((entry, index) => ({
                    rank: index + 1,
                    score: entry.score,
                    extraData: entry.extraData,
                    player: { uniqueID: options.playerId ?? "mock-player", publicName: options.playerName ?? "Mock Player" }
                }))
            };
        },
        getPlayerEntry: async (name) => {
            record("leaderboards.getPlayerEntry", { name });
            if (!authorized) throw new Error("Mock player is not authorized.");
            return scores.get(name) ?? null;
        }
    };

    const catalog = clone(options.catalog ?? []);
    const purchases = clone(options.purchases ?? []);
    const payments = {
        getCatalog: async () => {
            record("payments.getCatalog");
            return clone(catalog);
        },
        getPurchases: async () => {
            record("payments.getPurchases");
            return clone(purchases);
        },
        purchase: async ({ id }) => {
            record("payments.purchase", { id });
            if (!catalog.some((item) => item.id === id)) {
                throw new Error(`Unknown mock product: ${id}`);
            }
            const purchase = {
                productID: id,
                purchaseToken: `mock-token-${id}`,
                developerPayload: ""
            };
            purchases.push(purchase);
            return clone(purchase);
        },
        consumePurchase: async (token) => {
            record("payments.consumePurchase", { token });
            const index = purchases.findIndex((item) => item.purchaseToken === token);
            if (index >= 0) purchases.splice(index, 1);
        }
    };

    const sdk = {
        environment,
        adv,
        leaderboards,
        features: {
            LoadingAPI: { ready: () => record("features.LoadingAPI.ready") },
            GameplayAPI: {
                start: () => record("features.GameplayAPI.start"),
                stop: () => record("features.GameplayAPI.stop")
            }
        },
        screen: {
            fullscreen: {
                get status() { return fullscreenStatus; },
                request: async () => {
                    record("screen.fullscreen.request");
                    fullscreenStatus = "on";
                },
                exit: async () => {
                    record("screen.fullscreen.exit");
                    fullscreenStatus = "off";
                }
            }
        },
        feedback: {
            canReview: async () => {
                record("feedback.canReview");
                return {
                    value: options.reviewAvailable ?? true,
                    reason: options.reviewAvailable === false ? "disabled-in-mock" : undefined
                };
            },
            requestReview: async () => {
                record("feedback.requestReview");
                reviewRequested = true;
                return { feedbackSent: options.reviewSent ?? true };
            }
        },
        shortcut: {
            canShowPrompt: async () => {
                record("shortcut.canShowPrompt");
                return { canShow: options.shortcutAvailable ?? true };
            },
            showPrompt: async () => {
                record("shortcut.showPrompt");
                return { outcome: options.shortcutOutcome ?? "accepted" };
            }
        },
        clipboard: {
            writeText: async (text) => record("clipboard.writeText", { text })
        },
        getPlayer: async (playerOptions = {}) => {
            record("getPlayer", playerOptions);
            return makePlayer();
        },
        getPayments: async (paymentsOptions = {}) => {
            record("getPayments", { paymentsOptions });
            if (options.paymentsAvailable === false) {
                throw new YandexGamesIntegrationError("PAYMENTS_UNAVAILABLE", "Mock payments are disabled.");
            }
            return payments;
        },
        getFlags: async ({ defaultFlags = {}, clientFeatures = [] } = {}) => {
            record("getFlags", { defaultFlags, clientFeatures });
            return { ...defaultFlags, ...(options.remoteFlags ?? {}) };
        },
        serverTime: async () => {
            record("serverTime");
            return options.serverTime ?? Date.now();
        },
        openExternalLink: async (url) => record("openExternalLink", { url }),
        auth: {
            openAuthDialog: async () => {
                record("auth.openAuthDialog");
                if (options.authResult === false) throw new Error("Mock authorization was declined.");
                authorized = true;
            }
        },
        isAvailableMethod: async (methodName) => {
            record("isAvailableMethod", { methodName });
            return methodName !== "leaderboards.getPlayerEntry" || authorized;
        },
        on(eventName, listener) {
            let listeners = eventListeners.get(eventName);
            if (!listeners) {
                listeners = new Set();
                eventListeners.set(eventName, listeners);
            }
            listeners.add(listener);
            record("on", { eventName });
        },
        off(eventName, listener) {
            eventListeners.get(eventName)?.delete(listener);
            record("off", { eventName });
        }
    };

    return {
        async init(sdkOptions = {}) {
            record("init", { sdkOptions });
            return sdk;
        },
        calls,
        emit,
        getMockState() {
            return {
                playerData: clone(playerData),
                playerStats: clone(playerStats),
                authorized,
                fullscreenStatus,
                reviewRequested
            };
        }
    };
}
