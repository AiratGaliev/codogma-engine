/**
 * Parser and structural validator for localization tables (contract v1).
 *
 * The contract uses an explicit entry array (`"messages": [{ "id", "text" }]`)
 * instead of a plain JSON object, so duplicated message ids are reliably
 * detectable after parsing: `JSON.parse` of an object form silently keeps the
 * last value of a duplicated key. The object form is rejected with an explicit
 * diagnostic instead of being misread.
 */

import {
    LOCALIZATION_TABLE_SCHEMA_VERSION,
    LocalizationDiagnostic,
    LocalizationMessageEntryV1,
    LocalizationParseResult,
    LocalizationTableV1
} from "./contract.js";

/**
 * Simplified BCP 47 check: language subtag plus optional `-`-separated
 * subtags (region/script/variants), e.g. `ru`, `en-US`, `pt-BR`.
 * Underscore forms like `ru_RU` are rejected with a hint.
 */
const LOCALE_TAG_PATTERN = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;

/** Stable message ids must not contain whitespace or leading/trailing spaces. */
const MESSAGE_ID_PATTERN = /^\S+$/;

interface RawRecord {
    [key: string]: unknown;
}

function isRecord(value: unknown): value is RawRecord {

    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Converts a JSON parse failure into a structured diagnostic. When the runtime
 * message exposes an offset, it is translated into `line:column`.
 */
function parseErrorDiagnostic(sourceText: string, error: unknown, file: string | undefined): LocalizationDiagnostic {

    const rawMessage = error instanceof Error ? error.message : String(error);

    let message = `Invalid JSON in localization table: ${rawMessage}`;
    let line: number | undefined;
    let column: number | undefined;

    const positionMatch = rawMessage.match(/position (\d+)/);

    if (positionMatch !== null && positionMatch[1] !== undefined) {

        const offset = Number(positionMatch[1]);

        if (Number.isInteger(offset) && offset >= 0 && offset < sourceText.length) {

            const before = sourceText.slice(0, offset);
            const lines = before.split("\n");

            line = lines.length;
            column = (lines[lines.length - 1]?.length ?? 0) + 1;

            message += ` (line ${line}, column ${column})`;
        }
    }

    const diagnostic: LocalizationDiagnostic = {
        code: "LOC_PARSE_ERROR",
        severity: "error",
        message
    };

    if (file !== undefined) {
        diagnostic.file = file;
    }

    if (line !== undefined && column !== undefined) {
        diagnostic.messageId = `${line}:${column}`;
    }

    return diagnostic;
}

function addDiagnostic(list: LocalizationDiagnostic[], diagnostic: LocalizationDiagnostic): void {
    list.push(diagnostic);
}

/**
 * Parses one localization table from raw JSON text.
 *
 * On any error-level diagnostic the result omits `table`, so structurally
 * invalid data can never reach the runtime as if it were valid translations.
 */
export function parseLocalizationTable(
    sourceText: string,
    file?: string
): LocalizationParseResult {

    const diagnostics: LocalizationDiagnostic[] = [];

    let data: unknown;

    try {
        data = JSON.parse(sourceText) as unknown;
    } catch (error) {
        addDiagnostic(diagnostics, parseErrorDiagnostic(sourceText, error, file));
        return { diagnostics };
    }

    if (!isRecord(data)) {

        const diagnostic: LocalizationDiagnostic = {
            code: "LOC_INVALID_MESSAGES",
            severity: "error",
            message: "Localization table must be a JSON object."
        };

        if (file !== undefined) {
            diagnostic.file = file;
        }

        addDiagnostic(diagnostics, diagnostic);
        return { diagnostics };
    }

    // --- schemaVersion -------------------------------------------------------

    const schemaVersion = data["schemaVersion"];

    if (schemaVersion === undefined) {

        const diagnostic: LocalizationDiagnostic = {
            code: "LOC_MISSING_VERSION",
            severity: "error",
            message: "Localization table is missing the required \"schemaVersion\" field."
        };

        if (file !== undefined) {
            diagnostic.file = file;
        }

        addDiagnostic(diagnostics, diagnostic);

    } else if (schemaVersion !== LOCALIZATION_TABLE_SCHEMA_VERSION) {

        const diagnostic: LocalizationDiagnostic = {
            code: "LOC_UNSUPPORTED_VERSION",
            severity: "error",
            message: `Unsupported localization table schemaVersion: ${JSON.stringify(schemaVersion)}.`
                + ` Supported version: ${LOCALIZATION_TABLE_SCHEMA_VERSION}.`
        };

        if (file !== undefined) {
            diagnostic.file = file;
        }

        addDiagnostic(diagnostics, diagnostic);
    }

    // --- locale --------------------------------------------------------------

    const localeValue = data["locale"];
    let locale: string | undefined;

    if (typeof localeValue !== "string" || !LOCALE_TAG_PATTERN.test(localeValue)) {

        const hint = typeof localeValue === "string" && localeValue.includes("_")
            ? " Use \"-\" instead of \"_\" in the locale tag."
            : "";

        const diagnostic: LocalizationDiagnostic = {
            code: "LOC_INVALID_LOCALE",
            severity: "error",
            message: `Invalid locale tag: ${JSON.stringify(localeValue)}.${hint}`
        };

        if (file !== undefined) {
            diagnostic.file = file;
        }

        addDiagnostic(diagnostics, diagnostic);

    } else {
        locale = localeValue;
    }

    // --- messages ------------------------------------------------------------

    const rawMessages = data["messages"];
    const messages: LocalizationMessageEntryV1[] = [];
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];

    if (!Array.isArray(rawMessages)) {

        const diagnostic: LocalizationDiagnostic = {
            code: "LOC_INVALID_MESSAGES",
            severity: "error",
            message: "Localization table field \"messages\" must be an array of { id, text } entries."
        };

        if (file !== undefined) {
            diagnostic.file = file;
        }

        addDiagnostic(diagnostics, diagnostic);

    } else {

        for (const rawEntry of rawMessages) {

            if (!isRecord(rawEntry)
                || typeof rawEntry["id"] !== "string"
                || typeof rawEntry["text"] !== "string") {

                const diagnostic: LocalizationDiagnostic = {
                    code: "LOC_INVALID_ENTRY",
                    severity: "error",
                    message: "Localization message entry must be an object with string \"id\" and \"text\" fields."
                };

                if (file !== undefined) {
                    diagnostic.file = file;
                }

                addDiagnostic(diagnostics, diagnostic);
                continue;
            }

            const id = rawEntry["id"];
            const text = rawEntry["text"];

            if (id.length === 0 || !MESSAGE_ID_PATTERN.test(id)) {

                const diagnostic: LocalizationDiagnostic = {
                    code: "LOC_INVALID_ID",
                    severity: "error",
                    messageId: id,
                    message: `Invalid localization message id: ${JSON.stringify(id)}.`
                        + " Ids must be non-empty and contain no whitespace."
                };

                if (file !== undefined) {
                    diagnostic.file = file;
                }

                addDiagnostic(diagnostics, diagnostic);
                continue;
            }

            if (text.length === 0) {

                const diagnostic: LocalizationDiagnostic = {
                    code: "LOC_INVALID_TEXT",
                    severity: "error",
                    messageId: id,
                    message: `Localization message "${id}" has an empty text.`
                };

                if (locale !== undefined) {
                    diagnostic.locale = locale;
                }

                if (file !== undefined) {
                    diagnostic.file = file;
                }

                addDiagnostic(diagnostics, diagnostic);
                continue;
            }

            if (seenIds.has(id)) {

                if (!duplicateIds.includes(id)) {
                    duplicateIds.push(id);
                }

                // Keep the first occurrence deterministically; duplicates are reported below.
                continue;
            }

            seenIds.add(id);

            messages.push({ id, text });
        }

        for (const id of duplicateIds) {

            const diagnostic: LocalizationDiagnostic = {
                code: "LOC_DUPLICATE_ID",
                severity: "error",
                messageId: id,
                message: `Duplicate localization message id "${id}" in table.`
            };

            if (locale !== undefined) {
                diagnostic.locale = locale;
            }

            if (file !== undefined) {
                diagnostic.file = file;
            }

            addDiagnostic(diagnostics, diagnostic);
        }
    }

    const hasError = diagnostics.some(item => item.severity === "error");

    if (hasError || locale === undefined) {
        return { diagnostics };
    }

    const table: LocalizationTableV1 = {
        schemaVersion: LOCALIZATION_TABLE_SCHEMA_VERSION,
        locale,
        messages
    };

    return { diagnostics, table };
}
