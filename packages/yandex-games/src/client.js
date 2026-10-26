import { YandexGamesIntegrationError, toError } from "./errors.js";
import { loadYandexGamesSdk } from "./sdk-loader.js";

export function createYandexGamesClient(options = {}) {
    const globalObject = options.globalObject ?? globalThis;
    const documentObject = options.documentObject ?? globalObject?.document;
    const sdkUrl = options.sdkUrl ?? "/sdk.js";
    const sdkOptions = options.sdkOptions ?? {};
    const sdkLoader = options.sdkLoader ?? loadYandexGamesSdk;

    let state = "idle";
    let sdk;
    let initPromise;
    let disposed = false;
    const listeners = new Map();
    const detachCallbacks = [];

    function emit(eventName, payload) {
        const eventListeners = listeners.get(eventName);
        if (!eventListeners) return;

        for (const listener of [...eventListeners]) {
            try {
                listener(payload);
            } catch (error) {
                try { options.onListenerError?.(toError(error), eventName); }
                catch { /* Diagnostics must not disrupt platform callbacks. */ }
            }
        }
    }

    function on(eventName, listener) {
        if (typeof listener !== "function") throw new TypeError("listener must be a function");
        let eventListeners = listeners.get(eventName);
        if (!eventListeners) {
            eventListeners = new Set();
            listeners.set(eventName, eventListeners);
        }
        eventListeners.add(listener);

        return () => {
            eventListeners.delete(listener);
            if (eventListeners.size === 0) listeners.delete(eventName);
        };
    }

    function attachSdkEvents(instance) {
        if (typeof instance?.on === "function") {
            for (const [sdkEventName, clientEventName] of [
                ["game_api_pause", "pause"],
                ["game_api_resume", "resume"]
            ]) {
                const handler = () => emit(clientEventName, { source: "sdk", sdkEventName });
                try {
                    instance.on(sdkEventName, handler);
                    detachCallbacks.push(() => {
                        try { instance.off?.(sdkEventName, handler); } catch { /* Older SDK may omit off(). */ }
                    });
                } catch (error) {
                    emit("diagnostic", {
                        code: "SDK_EVENT_SUBSCRIPTION_FAILED",
                        eventName: sdkEventName,
                        error: toError(error)
                    });
                }
            }
        }

        if (documentObject?.addEventListener) {
            const visibilityHandler = () => emit(
                documentObject.visibilityState === "hidden" ? "pause" : "resume",
                { source: "visibility" }
            );
            documentObject.addEventListener("visibilitychange", visibilityHandler);
            detachCallbacks.push(() => documentObject.removeEventListener?.("visibilitychange", visibilityHandler));
        }
    }

    async function initialize() {
        if (disposed) throw new YandexGamesIntegrationError("CLIENT_DISPOSED", "This Yandex Games client has been disposed.");
        if (state === "ready") return sdk;
        if (initPromise) return initPromise;

        state = "loading";
        initPromise = (async () => {
            try {
                const rootApi = options.sdkApi ?? await sdkLoader({
                    globalObject,
                    documentObject,
                    sdkUrl,
                    timeoutMs: options.sdkLoadTimeoutMs
                });

                if (typeof rootApi?.init !== "function") {
                    throw new YandexGamesIntegrationError("SDK_INIT_MISSING", "YaGames.init() is not available.");
                }

                sdk = await rootApi.init(sdkOptions);
                if (!sdk || typeof sdk !== "object") {
                    throw new YandexGamesIntegrationError("SDK_INIT_INVALID_RESULT", "YaGames.init() did not return an SDK instance.");
                }

                attachSdkEvents(sdk);
                state = "ready";
                emit("initialized", sdk);
                return sdk;
            } catch (error) {
                state = "failed";
                const normalized = error instanceof YandexGamesIntegrationError
                    ? error
                    : new YandexGamesIntegrationError("SDK_INITIALIZATION_FAILED", "Yandex Games SDK initialization failed.", error);
                emit("initialization-error", normalized);
                throw normalized;
            } finally {
                initPromise = undefined;
            }
        })();

        return initPromise;
    }

    function getSDK() {
        if (state !== "ready" || !sdk) {
            throw new YandexGamesIntegrationError(
                "SDK_NOT_INITIALIZED", "Call and await initialize() before using Yandex Games features."
            );
        }
        return sdk;
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        for (const detach of detachCallbacks.splice(0)) {
            try { detach(); } catch { /* Continue cleanup. */ }
        }
        emit("disposed");
        listeners.clear();
        sdk = undefined;
        state = "disposed";
    }

    return {
        initialize, getSDK, on, emit, dispose,
        get state() { return state; },
        get isInitialized() { return state === "ready"; }
    };
}
