import { YandexGamesIntegrationError, requireMethod, toError } from "./errors.js";
import { loadYandexGamesSdk } from "./sdk-loader.js";
import { createYandexGamesClient } from "./client.js";

export { YandexGamesIntegrationError, loadYandexGamesSdk, createYandexGamesClient };
export { createMockYandexGamesSdk } from "./mock.js";

export function createYandexGamesLifecycle(client, options = {}) {
    let desiredGameplayActive = false;
    let sdkGameplayActive = false;
    let disposed = false;
    let activeBeforeSuspend = false;
    const suspendReasons = new Set();
    const unsubscribers = [];

    function callLifecycle(method, eventName) {
        if (client.state !== "ready") return false;
        try {
            const sdk = client.getSDK();
            const service = sdk?.features?.[method === "ready" ? "LoadingAPI" : "GameplayAPI"];
            const fn = service?.[method];
            if (typeof fn !== "function") return false;
            fn.call(service);
            client.emit(eventName, { method });
            return true;
        } catch (error) {
            client.emit("diagnostic", { code: "LIFECYCLE_CALL_FAILED", method, error: toError(error) });
            return false;
        }
    }

    function startSdkGameplay() {
        if (sdkGameplayActive || suspendReasons.size > 0 || !desiredGameplayActive) return false;
        sdkGameplayActive = callLifecycle("start", "gameplay-started");
        return sdkGameplayActive;
    }

    function stopSdkGameplay() {
        if (!sdkGameplayActive) return false;
        sdkGameplayActive = false;
        callLifecycle("stop", "gameplay-stopped");
        return true;
    }

    function suspend(reason) {
        if (disposed || suspendReasons.has(reason)) return;
        const firstReason = suspendReasons.size === 0;
        suspendReasons.add(reason);
        if (!firstReason) return;

        activeBeforeSuspend = desiredGameplayActive;
        stopSdkGameplay();
        try { options.onPause?.({ reason }); }
        catch (error) {
            client.emit("diagnostic", { code: "LIFECYCLE_CALLBACK_FAILED", callback: "onPause", error: toError(error) });
        }
        client.emit("game-paused", { reason });
    }

    function resume(reason) {
        if (disposed || !suspendReasons.delete(reason) || suspendReasons.size > 0) return;
        if (activeBeforeSuspend && desiredGameplayActive) {
            startSdkGameplay();
            try { options.onResume?.({ reason }); }
            catch (error) {
                client.emit("diagnostic", { code: "LIFECYCLE_CALLBACK_FAILED", callback: "onResume", error: toError(error) });
            }
        }
        activeBeforeSuspend = false;
        client.emit("game-resumed", { reason });
    }

    unsubscribers.push(client.on("pause", payload => suspend(`platform:${payload?.source ?? "unknown"}`)));
    unsubscribers.push(client.on("resume", payload => resume(`platform:${payload?.source ?? "unknown"}`)));
    unsubscribers.push(client.on("overlay-open", payload => suspend(`overlay:${payload?.token ?? payload?.kind ?? "ad"}`)));
    unsubscribers.push(client.on("overlay-close", payload => resume(`overlay:${payload?.token ?? payload?.kind ?? "ad"}`)));

    return {
        ready() { return !disposed && callLifecycle("ready", "game-ready"); },
        gameplayStart() {
            if (disposed) return false;
            desiredGameplayActive = true;
            return startSdkGameplay();
        },
        gameplayStop() {
            if (disposed) return false;
            desiredGameplayActive = false;
            activeBeforeSuspend = false;
            return stopSdkGameplay();
        },
        get isGameplayActive() { return desiredGameplayActive; },
        get isSuspended() { return suspendReasons.size > 0; },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
            suspendReasons.clear();
            desiredGameplayActive = false;
            sdkGameplayActive = false;
        }
    };
}

let adSequence = 0;
function invokeCallback(client, callback, payload, eventName) {
    if (typeof callback !== "function") return;
    try { callback(payload); }
    catch (error) { client.emit("callback-error", { eventName, error: toError(error) }); }
}

export function createYandexGamesAds(client, { timeoutMs = 120000 } = {}) {
    function show(kind, sdkMethod, options = {}) {
        const sdk = client.getSDK();
        const method = sdk?.adv?.[sdkMethod];
        if (typeof method !== "function") {
            throw new YandexGamesIntegrationError("AD_METHOD_UNAVAILABLE", `Yandex Games method "${sdkMethod}" is unavailable.`);
        }

        const token = `ad-${++adSequence}`;

        return new Promise((resolve) => {
            let settled = false;
            let wasShown = false;
            let rewarded = false;
            let lastError;
            let timeoutId;

            const finish = (error) => {
                if (settled) return;
                settled = true;
                if (timeoutId !== undefined) clearTimeout(timeoutId);
                const normalizedError = error ? toError(error) : undefined;
                client.emit("overlay-close", { token, kind, wasShown, error: normalizedError });
                invokeCallback(client, options.onClose, { wasShown, rewarded, error: normalizedError }, "onClose");
                resolve({ kind, wasShown, rewarded, error: normalizedError });
            };

            const callbacks = {
                onOpen: () => {
                    if (settled) return;
                    client.emit("overlay-open", { token, kind });
                    invokeCallback(client, options.onOpen, { kind }, "onOpen");
                },
                onClose: (shown) => {
                    wasShown = Boolean(shown);
                    finish(lastError);
                },
                onError: (error) => {
                    lastError = toError(error, "Yandex Games ad failed.");
                    client.emit("ad-error", { token, kind, error: lastError });
                    invokeCallback(client, options.onError, lastError, "onError");
                }
            };

            if (kind === "rewarded") {
                callbacks.onRewarded = () => {
                    if (settled || rewarded) return;
                    rewarded = true;
                    client.emit("ad-rewarded", { token, kind });
                    invokeCallback(client, options.onRewarded, { kind: "rewarded", token }, "onRewarded");
                };
            }

            timeoutId = setTimeout(() => finish(lastError ?? new YandexGamesIntegrationError(
                "AD_CALLBACK_TIMEOUT", `The Yandex Games ${kind} ad did not complete within ${timeoutMs} ms.`
            )), timeoutMs);

            try { method.call(sdk.adv, { callbacks }); }
            catch (error) {
                lastError = toError(error, "Failed to request Yandex Games ad.");
                finish(lastError);
            }
        });
    }

    return {
        showFullscreen(options = {}) { return show("fullscreen", "showFullscreenAdv", options); },
        showRewarded(options = {}) { return show("rewarded", "showRewardedVideo", options); }
    };
}

export function createYandexGamesPlayer(client) {
    async function getPlayer({ scopes = false } = {}) {
        return requireMethod(client.getSDK(), "getPlayer", "getPlayer")({ scopes: Boolean(scopes) });
    }

    function validateData(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new TypeError("Player data must be an object.");
        }
    }

    return {
        getPlayer,
        async getProfile(options = {}) {
            const player = await getPlayer(options);
            return {
                id: typeof player.getUniqueID === "function" ? player.getUniqueID() : undefined,
                name: typeof player.getName === "function" ? player.getName() : undefined,
                photo: typeof player.getPhoto === "function" ? player.getPhoto("medium") : undefined,
                payingStatus: typeof player.getPayingStatus === "function" ? player.getPayingStatus() : undefined,
                authorized: typeof player.isAuthorized === "function" ? player.isAuthorized() : false
            };
        },
        async isAuthorized() {
            const player = await getPlayer();
            return typeof player.isAuthorized === "function" && player.isAuthorized();
        },
        async authorize(options = {}) {
            const sdk = client.getSDK();
            await requireMethod(sdk?.auth, "openAuthDialog", "auth.openAuthDialog")();
            return getPlayer(options);
        },
        async loadData(keys, options = {}) {
            const player = await getPlayer(options);
            const getData = requireMethod(player, "getData", "player.getData");
            return keys === undefined ? getData() : getData(keys);
        },
        async saveData(data, { flush = true, ...playerOptions } = {}) {
            validateData(data);
            const player = await getPlayer(playerOptions);
            return requireMethod(player, "setData", "player.setData")(data, Boolean(flush));
        },
        async getStats(keys, options = {}) {
            const player = await getPlayer(options);
            const getStats = requireMethod(player, "getStats", "player.getStats");
            return keys === undefined ? getStats() : getStats(keys);
        },
        async setStats(stats, options = {}) {
            validateData(stats);
            const player = await getPlayer(options);
            return requireMethod(player, "setStats", "player.setStats")(stats);
        },
        async incrementStats(stats, options = {}) {
            validateData(stats);
            const player = await getPlayer(options);
            return requireMethod(player, "incrementStats", "player.incrementStats")(stats);
        }
    };
}

export function createYandexGamesLeaderboards(client) {
    async function isAvailable(methodName) {
        const sdk = client.getSDK();
        if (typeof sdk.isAvailableMethod !== "function") return false;
        return Boolean(await sdk.isAvailableMethod(methodName));
    }

    return {
        isAvailable,
        async setScore(name, score, extraData) {
            if (typeof name !== "string" || !name.trim()) throw new TypeError("Leaderboard technical name is required.");
            if (!Number.isFinite(score)) throw new TypeError("Leaderboard score must be a finite number.");
            const setScore = requireMethod(client.getSDK()?.leaderboards, "setScore", "leaderboards.setScore");
            return extraData === undefined ? setScore(name, score) : setScore(name, score, extraData);
        },
        async getDescription(name) {
            return requireMethod(client.getSDK()?.leaderboards, "getDescription", "leaderboards.getDescription")(name);
        },
        async getEntries(name, options = {}) {
            return requireMethod(client.getSDK()?.leaderboards, "getEntries", "leaderboards.getEntries")(name, options);
        },
        async getPlayerEntry(name, options = {}) {
            if (!await isAvailable("leaderboards.getPlayerEntry")) {
                throw new YandexGamesIntegrationError(
                    "LEADERBOARD_PLAYER_ENTRY_UNAVAILABLE",
                    "leaderboards.getPlayerEntry is unavailable. Check player authorization and method availability."
                );
            }
            return requireMethod(client.getSDK()?.leaderboards, "getPlayerEntry", "leaderboards.getPlayerEntry")(name, options);
        }
    };
}

export function createYandexGamesPayments(client, { signed = false } = {}) {
    let paymentsPromise;

    async function getPayments() {
        const sdk = client.getSDK();
        if (!paymentsPromise) {
            paymentsPromise = (async () => {
                if (typeof sdk.getPayments === "function") return sdk.getPayments({ signed: Boolean(signed) });
                if (sdk.payments) return sdk.payments;
                throw new YandexGamesIntegrationError(
                    "PAYMENTS_UNAVAILABLE",
                    "Yandex Games payments are unavailable; enable purchases in the developer console and check SDK configuration."
                );
            })().catch((error) => {
                paymentsPromise = undefined;
                throw error;
            });
        }
        return paymentsPromise;
    }

    return {
        getPayments,
        async getCatalog() {
            return requireMethod(await getPayments(), "getCatalog", "payments.getCatalog")();
        },
        async getPurchases() {
            return requireMethod(await getPayments(), "getPurchases", "payments.getPurchases")();
        },
        async purchase(productId) {
            if (typeof productId !== "string" || !productId.trim()) throw new TypeError("Product id is required.");
            return requireMethod(await getPayments(), "purchase", "payments.purchase")({ id: productId });
        },
        async consumePurchase(token) {
            if (typeof token !== "string" || !token.trim()) throw new TypeError("Purchase token is required.");
            return requireMethod(await getPayments(), "consumePurchase", "payments.consumePurchase")(token);
        }
    };
}

export function createYandexGamesPlatformServices(client) {
    const getSDK = () => client.getSDK();

    return {
        getEnvironment() { return getSDK().environment; },
        getLanguage() { return getSDK().environment?.i18n?.lang ?? "en"; },
        async getFlags({ defaultFlags = {}, clientFeatures = [] } = {}) {
            return requireMethod(getSDK(), "getFlags", "getFlags")({ defaultFlags, clientFeatures });
        },
        async getServerTime() {
            return requireMethod(getSDK(), "getServerTime", "getServerTime")();
        },
        async requestFullscreen() {
            return requireMethod(getSDK()?.screen?.fullscreen, "request", "screen.fullscreen.request")();
        },
        async exitFullscreen() {
            return requireMethod(getSDK()?.screen?.fullscreen, "exit", "screen.fullscreen.exit")();
        },
        isFullscreen() {
            const fullscreen = getSDK()?.screen?.fullscreen;
            if (!fullscreen) return false;
            const status = typeof fullscreen.status === "function" ? fullscreen.status() : fullscreen.status;
            return status === "on";
        },
        async canReview() {
            return requireMethod(getSDK()?.feedback, "canReview", "feedback.canReview")();
        },
        async requestReview() {
            const feedback = getSDK()?.feedback;
            const permission = await requireMethod(feedback, "canReview", "feedback.canReview")();
            if (!permission?.value) {
                return { requested: false, feedbackSent: false, reason: permission?.reason };
            }
            const result = await requireMethod(feedback, "requestReview", "feedback.requestReview")();
            return { requested: true, feedbackSent: Boolean(result?.feedbackSent ?? result?.sentFeedback) };
        },
        async canShowShortcut() {
            return requireMethod(getSDK()?.shortcut, "canShowPrompt", "shortcut.canShowPrompt")();
        },
        async showShortcutPrompt() {
            const shortcut = getSDK()?.shortcut;
            const permission = await requireMethod(shortcut, "canShowPrompt", "shortcut.canShowPrompt")();
            if (!permission?.canShow) return { requested: false, outcome: "unavailable" };
            const result = await requireMethod(shortcut, "showPrompt", "shortcut.showPrompt")();
            return { requested: true, outcome: result?.outcome ?? "unknown" };
        },
        async writeClipboard(text) {
            if (typeof text !== "string") throw new TypeError("Clipboard text must be a string.");
            const clipboard = getSDK()?.clipboard;
            const writeText = clipboard?.writeText ?? clipboard?.write_text;
            if (typeof writeText !== "function") {
                throw new YandexGamesIntegrationError("CLIPBOARD_UNAVAILABLE", "Clipboard is unavailable in this SDK environment.");
            }
            return writeText.call(clipboard, text);
        },
        async openExternalLink(url) {
            let parsed;
            try { parsed = new URL(url); }
            catch { throw new TypeError("External link must be an absolute HTTP(S) URL."); }
            if (!["https:", "http:"].includes(parsed.protocol)) {
                throw new TypeError("Only HTTP and HTTPS external links are allowed.");
            }
            return requireMethod(getSDK(), "openExternalLink", "openExternalLink")(parsed.href);
        }
    };
}

export function createYandexGamesPlatform(options = {}) {
    const client = createYandexGamesClient(options);
    const lifecycle = createYandexGamesLifecycle(client, options.lifecycle);
    const ads = createYandexGamesAds(client, { timeoutMs: options.adTimeoutMs });
    const player = createYandexGamesPlayer(client);
    const leaderboards = createYandexGamesLeaderboards(client);
    const payments = createYandexGamesPayments(client, { signed: options.signedPayments });
    const platform = createYandexGamesPlatformServices(client);
    const disposeClient = client.dispose.bind(client);

    Object.assign(client, {
        lifecycle, ads, player, leaderboards, payments, platform,
        dispose() {
            lifecycle.dispose();
            disposeClient();
        }
    });

    return client;
}
