/**
 * Locale tag policy for contract v1 (see docs/localization.md).
 *
 * A tag is a simplified BCP 47 label: language subtag plus optional
 * `-`-separated subtags, e.g. `ru`, `en-US`, `zh-Hans`. Only the canonical
 * case is accepted: language subtag lowercase, region subtag (2 letters)
 * uppercase, script subtag (4 letters) Titlecase, remaining subtags lowercase.
 * Non-canonical forms are rejected with an explicit diagnostic instead of
 * being matched loosely, so table registration, active-locale switching,
 * fallback lookup and duplicate detection cannot disagree about case.
 */

const LOCALE_TAG_PATTERN = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;

/**
 * Returns the canonical form of a locale tag, or `undefined` when the tag is
 * structurally invalid (wrong characters, `_` instead of `-`). The canonical
 * form of an already canonical tag is the tag itself.
 */
export function canonicalLocaleTag(tag: string): string | undefined {

    if (!LOCALE_TAG_PATTERN.test(tag)) {
        return undefined;
    }

    return tag.split("-").map((subtag, index) => {

        if (index === 0) {
            return subtag.toLowerCase();
        }

        if (subtag.length === 4 && /^[A-Za-z]{4}$/.test(subtag)) {
            // Script subtag: Titlecase, e.g. "hans" -> "Hans".
            return subtag.charAt(0).toUpperCase() + subtag.slice(1, 4).toLowerCase();
        }

        if (subtag.length === 2 && /[A-Za-z]/.test(subtag)) {
            // Region subtag: uppercase, e.g. "us" -> "US".
            return subtag.toUpperCase();
        }

        // Variants, numeric regions and private-use subtags.
        return subtag.toLowerCase();
    })
        .join("-");
}
