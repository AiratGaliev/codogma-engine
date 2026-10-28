/**
 * Named-parameter helpers for localization texts.
 *
 * Placeholder grammar (contract v1): `{name}`, where name starts with an ASCII
 * letter or underscore and continues with letters, digits or underscores.
 * Anything else inside braces is treated as literal text and is not parsed as
 * a parameter. This intentionally simple grammar avoids promising ICU
 * message-format features (plurals, select, bidi) that are not validated.
 */

const PLACEHOLDER_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export type LocalizationParams = Readonly<Record<string, string | number>>;

/** Returns the distinct placeholder names of a text, in document order. */
export function extractPlaceholders(text: string): string[] {

    const names: string[] = [];

    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {

        const name = match[1];

        // The pattern guarantees a capture, but avoid relying on the index type.
        if (name !== undefined && !names.includes(name)) {
            names.push(name);
        }
    }

    return names;
}

/**
 * Replaces `{name}` placeholders with parameter values.
 *
 * A placeholder without a matching parameter stays visible in the output and
 * must be reported by the caller as a `LOC_MISSING_PARAM` diagnostic, so the
 * problem is never silent. A parameter counts as provided only when `params`
 * has an **own** property with that name: inherited prototype properties
 * (`toString`, `constructor`, ...) are never substituted into game text.
 * Parameter values are converted with `String()`; no HTML/markup escaping is
 * performed.
 */
export function formatMessage(text: string, params: LocalizationParams | undefined): {

    text: string,
    missingParams: string[]
} {

    const missingParams: string[] = [];

    // Also covers `null` passed from non-TypeScript callers.
    if (params === undefined || params === null) {

        for (const name of extractPlaceholders(text)) {
            missingParams.push(name);
        }

        return { text, missingParams };
    }

    const result = text.replace(PLACEHOLDER_PATTERN, (whole, name: string) => {

        // Own properties only: inherited names like "toString" must not leak
        // prototype members into the translated text.
        const provided = Object.prototype.hasOwnProperty.call(params, name);
        const value = provided ? params[name] : undefined;

        if (typeof value !== "string" && typeof value !== "number") {

            if (!missingParams.includes(name)) {
                missingParams.push(name);
            }

            // Keep the placeholder visible instead of producing a broken string.
            return whole;
        }

        return String(value);
    });

    return { text: result, missingParams };
}
