/**
 * Codogma localization contract, schema version 1.
 *
 * A localization table is a JSON document describing the messages of exactly
 * one locale. Message ids are stable, locale-independent keys; the text is the
 * translated, human-readable string. This module owns the versioned contract
 * shared by project data, validation and the runtime service.
 */

/**
 * The only supported table schema version. Unknown/missing versions are
 * rejected by the parser with an explicit diagnostic; they are never silently
 * interpreted as the current version. Future versions of the contract must
 * extend this constant set and document a migration rule.
 */
export const LOCALIZATION_TABLE_SCHEMA_VERSION = 1;

/** One localizable message: a stable id plus its translated text. */
export interface LocalizationMessageEntryV1 {
    /** Stable, locale-independent message key, e.g. `"menu.play"`. */
    id: string;

    /** Translated text, may contain `{name}`-style placeholders. */
    text: string;
}

/** A parsed and structurally valid localization table (schema version 1). */
export interface LocalizationTableV1 {
    /** Always `1` in this contract version. */
    schemaVersion: 1;

    /** Locale tag of this table, e.g. `"en-US"` or `"ru-RU"`. */
    locale: string;

    /** Message entries of this locale. May be empty. */
    messages: LocalizationMessageEntryV1[];
}

/**
 * Structured localization problem, shared by table parsing, project
 * validation and the runtime service. Consumers (editor console, future
 * project-diagnostics panel, CI) render or forward this payload as-is.
 */
export interface LocalizationDiagnostic {
    /** Stable machine-readable problem code (see {@link LocalizationDiagnosticCode}). */
    code: LocalizationDiagnosticCode;

    /** `error` problems block loading/reject data; `warning` problems do not. */
    severity: "error" | "warning";

    /** Human-readable message. */
    message: string;

    /** Locale the problem relates to, when known. */
    locale?: string;

    /** Message id the problem relates to, when known. */
    messageId?: string;

    /** Source file (project-relative path) the problem came from, when known. */
    file?: string;
}

/** All diagnostic codes emitted by the localization module. */
export type LocalizationDiagnosticCode =
    /** The file is not valid JSON. */
    | "LOC_PARSE_ERROR"
    /** The `schemaVersion` field is missing. */
    | "LOC_MISSING_VERSION"
    /** The `schemaVersion` field is present but unsupported. */
    | "LOC_UNSUPPORTED_VERSION"
    /** The `locale` field is missing or not a valid locale tag. */
    | "LOC_INVALID_LOCALE"
    /** The `messages` field is missing or is not an entry array. */
    | "LOC_INVALID_MESSAGES"
    /** An entry is not an object with string `id` and `text`. */
    | "LOC_INVALID_ENTRY"
    /** A message id is empty, not a string or contains whitespace. */
    | "LOC_INVALID_ID"
    /** A message text is empty or not a string. */
    | "LOC_INVALID_TEXT"
    /** The same message id appears more than once in one table. */
    | "LOC_DUPLICATE_ID"
    /** The same locale appears in more than one table of a project. */
    | "LOC_DUPLICATE_LOCALE"
    /** A table was registered for a locale that already has a table; the existing one is kept. */
    | "LOC_DUPLICATE_REGISTRATION"
    /** A configured fallback locale has no registered table. */
    | "LOC_UNKNOWN_FALLBACK_LOCALE"
    /** The requested locale is not registered in the service. */
    | "LOC_UNKNOWN_LOCALE"
    /** A key is missing in a locale compared with the reference locale. */
    | "LOC_MISSING_KEY"
    /** A key is present in a locale but absent in the reference locale. */
    | "LOC_EXTRA_KEY"
    /** Placeholders of one message differ between locales. */
    | "LOC_PLACEHOLDER_MISMATCH"
    /** No translation found in the active or fallback locale; marker returned. */
    | "LOC_MISSING_TRANSLATION"
    /** A translation was taken from the fallback locale. */
    | "LOC_FALLBACK_USED"
    /** A `{param}` placeholder has no matching parameter value. */
    | "LOC_MISSING_PARAM"
    /** A project localization file/directory could not be read by the validation CLI. */
    | "LOC_FILE_ERROR";

/** Severity order helper: errors are reported before warnings by validation. */
export type LocalizationSeverity = LocalizationDiagnostic["severity"];

/** Result of parsing one localization table file. */
export interface LocalizationParseResult {
    /** All diagnostics found for the source text. */
    diagnostics: LocalizationDiagnostic[];

    /**
     * The parsed table, or `undefined` when any error-level diagnostic was
     * produced. Invalid tables are never handed to the runtime as usable data.
     */
    table?: LocalizationTableV1;
}
