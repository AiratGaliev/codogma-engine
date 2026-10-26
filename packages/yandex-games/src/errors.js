export class YandexGamesIntegrationError extends Error {
    constructor(code, message, cause) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = "YandexGamesIntegrationError";
        this.code = code;
    }
}

export function toError(value, fallback = "Unknown Yandex Games SDK error") {
    if (value instanceof Error) return value;
    if (typeof value === "string" && value.trim()) return new Error(value);

    try {
        return new Error(JSON.stringify(value) || fallback);
    } catch {
        return new Error(fallback);
    }
}

export function requireMethod(target, method, label = method) {
    if (!target || typeof target[method] !== "function") {
        throw new YandexGamesIntegrationError(
            "METHOD_UNAVAILABLE",
            `Yandex Games SDK method "${label}" is not available in this environment.`
        );
    }

    return target[method].bind(target);
}
