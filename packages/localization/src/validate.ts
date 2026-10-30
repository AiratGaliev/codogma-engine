/**
 * Cross-locale project validation for localization tables.
 *
 * Operates on already parsed, structurally valid tables: structural problems
 * (parse errors, unsupported versions, duplicate ids, invalid entries) are
 * reported by {@link parseLocalizationTable} before this step runs.
 *
 * The reference locale is chosen deterministically: the configured fallback
 * locale when it is registered, otherwise the locale with the most message
 * ids, ties broken by the lexicographically smallest locale tag. Two runs on
 * the same inputs always produce the same diagnostics.
 */

import { LocalizationDiagnostic, LocalizationTableV1 } from "./contract.js";
import { extractPlaceholders } from "./format.js";
import { canonicalLocaleTag } from "./locale-tag.js";

/** One validated project table with its optional source file path. */
export interface LocalizationProjectTable {
    table: LocalizationTableV1;

    /** Project-relative path of the table file, when known. */
    file?: string;
}

export interface ValidateLocalizationProjectOptions {
    /**
     * Configured fallback locale of the localization service. When it is not
     * registered as a table, a `LOC_UNKNOWN_FALLBACK_LOCALE` diagnostic is
     * produced; when registered, it also becomes the reference locale.
     */
    fallbackLocale?: string;
}

type DiagnosticSpec = {
    code: LocalizationDiagnostic["code"];
    severity: LocalizationDiagnostic["severity"];
    message: string;
    locale?: string | undefined;
    messageId?: string | undefined;
    file?: string | undefined;
};

function diagnostic(spec: DiagnosticSpec): LocalizationDiagnostic {
    const result: LocalizationDiagnostic = {
        code: spec.code,
        severity: spec.severity,
        message: spec.message
    };

    if (spec.locale !== undefined) {
        result.locale = spec.locale;
    }

    if (spec.messageId !== undefined) {
        result.messageId = spec.messageId;
    }

    if (spec.file !== undefined) {
        result.file = spec.file;
    }

    return result;
}

/**
 * Validates a set of localization tables of one project and returns all
 * cross-locale diagnostics (duplicate locales, unknown fallback, missing and
 * extra keys, placeholder mismatches). Severity meanings are documented in
 * `docs/localization.md`; warnings never block loading, errors do.
 */
export function validateLocalizationProject(
    projectTables: readonly LocalizationProjectTable[],
    options: ValidateLocalizationProjectOptions = {}
): LocalizationDiagnostic[] {
    const diagnostics: LocalizationDiagnostic[] = [];

    const localesInOrder: string[] = [];
    const tables: LocalizationTableV1[] = [];
    const filesByLocale = new Map<string, string | undefined>();

    for (const entry of projectTables) {
        const { table, file } = entry;
        const { locale } = table;
        const canonicalLocale = canonicalLocaleTag(locale);

        if (canonicalLocale === undefined || canonicalLocale !== locale) {
            diagnostics.push(
                diagnostic({
                    code: "LOC_INVALID_LOCALE",
                    severity: "error",
                    message:
                        `Locale "${locale}" is not a canonical locale tag` +
                        (canonicalLocale === undefined ? "." : `; use "${canonicalLocale}".`),
                    locale,
                    file
                })
            );

            continue;
        }

        if (localesInOrder.includes(locale)) {
            diagnostics.push(
                diagnostic({
                    code: "LOC_DUPLICATE_LOCALE",
                    severity: "error",
                    message: `Locale "${locale}" is defined by more than one localization table.`,
                    locale,
                    file
                })
            );

            continue;
        }

        localesInOrder.push(locale);
        tables.push(table);
        filesByLocale.set(locale, file);
    }

    if (diagnostics.length > 0) {
        return diagnostics;
    }

    // --- fallback configuration ------------------------------------------------

    const fallbackLocale = options.fallbackLocale;

    if (fallbackLocale !== undefined) {
        const canonicalFallback = canonicalLocaleTag(fallbackLocale);

        if (canonicalFallback === undefined || canonicalFallback !== fallbackLocale) {
            diagnostics.push(
                diagnostic({
                    code: "LOC_INVALID_LOCALE",
                    severity: "error",
                    message:
                        `Fallback locale "${fallbackLocale}" is not a canonical locale tag` +
                        (canonicalFallback === undefined ? "." : `; use "${canonicalFallback}".`),
                    locale: fallbackLocale
                })
            );

            return diagnostics;
        }
    }

    if (fallbackLocale !== undefined && !localesInOrder.includes(fallbackLocale)) {
        diagnostics.push(
            diagnostic({
                code: "LOC_UNKNOWN_FALLBACK_LOCALE",
                severity: "error",
                message: `Configured fallback locale "${fallbackLocale}" has no localization table.`,
                locale: fallbackLocale
            })
        );

        return diagnostics;
    }

    // --- deterministic reference locale ------------------------------------------

    let referenceLocale: string;

    if (fallbackLocale !== undefined) {
        referenceLocale = fallbackLocale;
    } else {
        const sortedLocales = [...localesInOrder].sort();
        const countByLocale = new Map<string, number>();

        for (const table of tables) {
            countByLocale.set(table.locale, table.messages.length);
        }

        let bestLocale: string | undefined;
        let bestCount = -1;

        for (const locale of sortedLocales) {
            const count = countByLocale.get(locale) ?? -1;

            if (count > bestCount) {
                bestLocale = locale;
                bestCount = count;
            }
        }

        referenceLocale = bestLocale ?? sortedLocales[0] ?? "";
    }

    const placeholdersByLocale = new Map<string, Map<string, string[]>>();

    for (const table of tables) {
        const placeholdersById = new Map<string, string[]>();

        for (const entry of table.messages) {
            placeholdersById.set(entry.id, extractPlaceholders(entry.text));
        }

        placeholdersByLocale.set(table.locale, placeholdersById);
    }

    const referencePlaceholders = placeholdersByLocale.get(referenceLocale) ?? new Map<string, string[]>();
    const referenceKeys = [...referencePlaceholders.keys()].sort();

    // --- missing and extra keys ----------------------------------------------------

    for (const locale of localesInOrder) {
        if (locale === referenceLocale) {
            continue;
        }

        const placeholders = placeholdersByLocale.get(locale) ?? new Map<string, string[]>();

        for (const key of referenceKeys) {
            if (!placeholders.has(key)) {
                diagnostics.push(
                    diagnostic({
                        code: "LOC_MISSING_KEY",
                        severity: "warning",
                        message:
                            `Localization key "${key}" is missing in locale "${locale}"` +
                            ` (present in reference locale "${referenceLocale}").` +
                            " The fallback locale is used at runtime.",
                        locale,
                        messageId: key,
                        file: filesByLocale.get(locale)
                    })
                );
            }
        }

        for (const key of [...placeholders.keys()].sort()) {
            if (!referencePlaceholders.has(key)) {
                diagnostics.push(
                    diagnostic({
                        code: "LOC_EXTRA_KEY",
                        severity: "warning",
                        message:
                            `Localization key "${key}" exists in locale "${locale}" but not` +
                            ` in reference locale "${referenceLocale}".`,
                        locale,
                        messageId: key,
                        file: filesByLocale.get(locale)
                    })
                );
            }
        }
    }

    // --- placeholder consistency -----------------------------------------------------

    const allKeys = new Set<string>();

    for (const placeholders of placeholdersByLocale.values()) {
        for (const key of placeholders.keys()) {
            allKeys.add(key);
        }
    }

    for (const key of [...allKeys].sort()) {
        const sets = new Map<string, string[]>();

        for (const locale of localesInOrder) {
            const placeholders = placeholdersByLocale.get(locale)?.get(key);

            if (placeholders !== undefined) {
                sets.set(locale, placeholders);
            }
        }

        if (sets.size < 2) {
            continue;
        }

        const referenceSet = sets.get(referenceLocale);

        // Keys absent from the reference are already reported as LOC_EXTRA_KEY.
        if (referenceSet === undefined) {
            continue;
        }

        const referenceSignature = JSON.stringify([...referenceSet].sort());

        for (const locale of localesInOrder) {
            if (locale === referenceLocale) {
                continue;
            }

            const placeholders = sets.get(locale);

            if (placeholders === undefined) {
                continue;
            }

            if (JSON.stringify([...placeholders].sort()) !== referenceSignature) {
                diagnostics.push(
                    diagnostic({
                        code: "LOC_PLACEHOLDER_MISMATCH",
                        severity: "error",
                        message:
                            `Localization key "${key}" uses different placeholders in locale` +
                            ` "${locale}" (${placeholders.join(", ") || "none"}) than in reference` +
                            ` locale "${referenceLocale}" (${referenceSet?.join(", ") || "none"}).` +
                            " At runtime the mismatching placeholder stays visible in the text" +
                            " with a LOC_MISSING_PARAM diagnostic.",
                        locale,
                        messageId: key,
                        file: filesByLocale.get(locale)
                    })
                );
            }
        }
    }

    return diagnostics;
}
