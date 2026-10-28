/**
 * Locale tag policy for contract v1 (see docs/localization.md).
 *
 * This module accepts the language-tag subset of BCP 47 used by the engine:
 * language and optional extlang, script, region, variants, extensions and
 * private-use subtags. Grandfathered tags and standalone private-use tags are
 * intentionally outside this contract.
 *
 * Canonical casing is position-aware: language/extlang and variants are
 * lowercase, script is Titlecase, alphabetic region is uppercase, and
 * extension/private-use subtags are lowercase. Validation and normalization
 * are kept in this module so parsing, runtime registration and project
 * diagnostics apply exactly the same rules in Node and browsers.
 */

const LANGUAGE_SUBTAG_PATTERN = /^[A-Za-z]{2,8}$/;
const EXTENDED_LANGUAGE_SUBTAG_PATTERN = /^[A-Za-z]{3}$/;
const SCRIPT_SUBTAG_PATTERN = /^[A-Za-z]{4}$/;
const ALPHABETIC_REGION_SUBTAG_PATTERN = /^[A-Za-z]{2}$/;
const NUMERIC_REGION_SUBTAG_PATTERN = /^[0-9]{3}$/;
const VARIANT_SUBTAG_PATTERN = /^(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3})$/;
const EXTENSION_SUBTAG_PATTERN = /^[A-Za-z0-9]{2,8}$/;
const PRIVATE_USE_SUBTAG_PATTERN = /^[A-Za-z0-9]{1,8}$/;

// BCP 47 extension singletons exclude "x", which starts the private-use tail.
const EXTENSION_SINGLETON_PATTERN = /^[0-9A-WY-Za-wy-z]$/;

/**
 * Returns the canonical form of a locale tag, or `undefined` when the tag
 * is outside the supported BCP 47 subset. Callers reject tags whose returned
 * canonical form differs from the original, rather than silently rewriting
 * project data or creating case-insensitive runtime collisions.
 */
export function canonicalLocaleTag(tag: string): string | undefined {

    if (typeof tag !== "string") {
        return undefined;
    }

    const subtags = tag.split("-");
    const language = subtags[0];

    if (language === undefined || !LANGUAGE_SUBTAG_PATTERN.test(language)) {
        return undefined;
    }

    const canonicalSubtags = [language.toLowerCase()];
    let index = 1;

    // BCP 47 permits up to three three-letter extlang subtags after a
    // two- or three-letter primary language subtag.
    if (language.length <= 3) {

        let extlangCount = 0;

        while (extlangCount < 3) {

            const subtag = subtags[index];

            if (subtag === undefined || !EXTENDED_LANGUAGE_SUBTAG_PATTERN.test(subtag)) {
                break;
            }

            canonicalSubtags.push(subtag.toLowerCase());
            index += 1;
            extlangCount += 1;
        }
    }

    // Script and region subtags are positional; they are not inferred from
    // every matching subtag later in the tag.
    const script = subtags[index];

    if (script !== undefined && SCRIPT_SUBTAG_PATTERN.test(script)) {
        canonicalSubtags.push(script.charAt(0).toUpperCase() + script.slice(1).toLowerCase());
        index += 1;
    }

    const region = subtags[index];

    if (region !== undefined) {

        if (ALPHABETIC_REGION_SUBTAG_PATTERN.test(region)) {
            canonicalSubtags.push(region.toUpperCase());
            index += 1;

        } else if (NUMERIC_REGION_SUBTAG_PATTERN.test(region)) {
            canonicalSubtags.push(region);
            index += 1;
        }
    }

    // Variants must precede extensions and private use. BCP 47 disallows
    // duplicate variant subtags within the same language tag.
    const seenVariants = new Set<string>();

    while (index < subtags.length) {

        const variant = subtags[index];

        if (variant === undefined || !VARIANT_SUBTAG_PATTERN.test(variant)) {
            break;
        }

        const canonicalVariant = variant.toLowerCase();

        if (seenVariants.has(canonicalVariant)) {
            return undefined;
        }

        seenVariants.add(canonicalVariant);
        canonicalSubtags.push(canonicalVariant);
        index += 1;
    }

    const seenExtensionSingletons = new Set<string>();

    while (index < subtags.length) {

        const subtag = subtags[index];

        if (subtag === undefined) {
            return undefined;
        }

        if (subtag.toLowerCase() === "x") {

            // Private use must contain at least one subtag and consumes the
            // remainder of the tag; private-use subtags may be 1-8 chars.
            index += 1;

            if (index >= subtags.length) {
                return undefined;
            }

            canonicalSubtags.push("x");

            while (index < subtags.length) {

                const privateUseSubtag = subtags[index];

                if (privateUseSubtag === undefined || !PRIVATE_USE_SUBTAG_PATTERN.test(privateUseSubtag)) {
                    return undefined;
                }

                canonicalSubtags.push(privateUseSubtag.toLowerCase());
                index += 1;
            }

            return canonicalSubtags.join("-");
        }

        if (!EXTENSION_SINGLETON_PATTERN.test(subtag)) {
            return undefined;
        }

        const singleton = subtag.toLowerCase();

        if (seenExtensionSingletons.has(singleton)) {
            return undefined;
        }

        seenExtensionSingletons.add(singleton);
        canonicalSubtags.push(singleton);
        index += 1;

        const extensionStart = index;

        while (index < subtags.length) {

            const extensionSubtag = subtags[index];

            if (extensionSubtag === undefined || !EXTENSION_SUBTAG_PATTERN.test(extensionSubtag)) {
                break;
            }

            canonicalSubtags.push(extensionSubtag.toLowerCase());
            index += 1;
        }

        // Every extension singleton must be followed by at least one
        // 2-8 character extension subtag.
        if (index === extensionStart) {
            return undefined;
        }
    }

    return canonicalSubtags.join("-");
}
