import { YandexGamesIntegrationError } from "./errors.js";

const pendingLoads = new WeakMap();

/** Load the official platform SDK; this package never vendors sdk.js. */
export function loadYandexGamesSdk({
    globalObject = globalThis,
    documentObject = globalObject?.document,
    sdkUrl = "/sdk.js",
    timeoutMs = 15000
} = {}) {
    const existingApi = globalObject?.YaGames;
    if (typeof existingApi?.init === "function") return Promise.resolve(existingApi);

    if (!documentObject || typeof documentObject.createElement !== "function") {
        return Promise.reject(new YandexGamesIntegrationError(
            "SDK_DOCUMENT_UNAVAILABLE",
            "Cannot load Yandex Games SDK without a browser document. Inject sdkApi for tests or non-browser environments."
        ));
    }

    if (typeof sdkUrl !== "string" || !sdkUrl.trim()) {
        return Promise.reject(new YandexGamesIntegrationError("SDK_URL_INVALID", "sdkUrl must be a non-empty URL."));
    }

    let documentLoads = pendingLoads.get(documentObject);
    if (!documentLoads) {
        documentLoads = new Map();
        pendingLoads.set(documentObject, documentLoads);
    }
    if (documentLoads.has(sdkUrl)) return documentLoads.get(sdkUrl);

    const promise = new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId;
        let createdScript = false;
        let script;

        const finish = (error) => {
            if (settled) return;
            settled = true;
            if (timeoutId !== undefined) (globalObject?.clearTimeout || clearTimeout)(timeoutId);
            script?.removeEventListener?.("load", onLoad);
            script?.removeEventListener?.("error", onError);

            if (error) {
                if (createdScript) script?.remove?.();
                reject(error);
            } else {
                resolve(globalObject.YaGames);
            }
        };

        const onLoad = () => {
            if (typeof globalObject?.YaGames?.init !== "function") {
                finish(new YandexGamesIntegrationError(
                    "SDK_GLOBAL_MISSING",
                    "The SDK script loaded, but window.YaGames.init was not found. Check the SDK URL and script order."
                ));
                return;
            }
            finish();
        };

        const onError = () => finish(new YandexGamesIntegrationError(
            "SDK_SCRIPT_FAILED", `Failed to load the Yandex Games SDK from "${sdkUrl}".`
        ));

        const normalizeUrl = (value) => {
            try { return new URL(value, documentObject.baseURI).href; }
            catch { return value; }
        };

        const wantedUrl = normalizeUrl(sdkUrl);
        const scripts = Array.from(documentObject.querySelectorAll?.("script[src]") || []);
        script = scripts.find((candidate) =>
            candidate.getAttribute?.("src") === sdkUrl ||
            normalizeUrl(candidate.src || candidate.getAttribute?.("src") || "") === wantedUrl
        );

        if (!script) {
            script = documentObject.createElement("script");
            script.src = sdkUrl;
            script.async = true;
            if (script.dataset) script.dataset.codogmaYandexGamesSdk = "true";
            createdScript = true;
        }

        if (script.addEventListener) {
            script.addEventListener("load", onLoad, { once: true });
            script.addEventListener("error", onError, { once: true });
        } else {
            script.onload = onLoad;
            script.onerror = onError;
        }

        timeoutId = (globalObject?.setTimeout || setTimeout)(() => {
            finish(new YandexGamesIntegrationError(
                "SDK_LOAD_TIMEOUT", `Timed out while loading Yandex Games SDK from "${sdkUrl}".`
            ));
        }, timeoutMs);

        if (createdScript) {
            const parent = documentObject.head || documentObject.body || documentObject.documentElement;
            if (!parent?.appendChild) {
                finish(new YandexGamesIntegrationError(
                    "SDK_DOCUMENT_NOT_READY", "The document has no head, body or documentElement for adding the SDK script."
                ));
                return;
            }
            parent.appendChild(script);
            script.addEventListener?.("load", () => {
                if (script.dataset) script.dataset.codogmaYandexGamesSdkLoaded = "true";
            }, { once: true });
        }
    });

    documentLoads.set(sdkUrl, promise);
    promise.then(() => documentLoads.delete(sdkUrl), () => documentLoads.delete(sdkUrl));
    return promise;
}
