/**
 * Runtime localization service for Codogma games.
 *
 * Pure TypeScript, DOM-free, dependency-free: the same compiled module runs in
 * the browser (game runtime) and in Node (validation, tests, tooling).
 *
 * Fallback policy (deterministic, see docs/localization.md):
 *
 * 1. Look up the message id in the active locale table.
 * 2. If absent, look it up in the configured fallback locale (when set and
 *    registered; a lazily registered fallback becomes active automatically).
 * 3. If still absent, return the visible marker `[[<id>]]` and record a
 *    `LOC_MISSING_TRANSLATION` diagnostic.
 * 4. Structurally invalid tables are rejected at parse time and are never
 *    registered, so their contents are never served as valid translations.
 *
 * Diagnostics are deduplicated by `code + locale + messageId`, so repeatedly
 * resolving the same missing translation does not flood the project
 * diagnostics.
 */

import { LocalizationDiagnostic, LocalizationTableV1 } from "./contract.js";
import { extractPlaceholders, formatMessage, LocalizationParams } from "./format.js";

export interface LocalizationServiceOptions {

    /** Parsed, structurally valid tables. At least the active locale's table is expected. */
    tables: readonly LocalizationTableV1[];

    /** Initial active locale. */
    locale: string;

    /** Locale used when the active locale has no translation for a key. `null` disables fallback. */
    fallbackLocale?: string | null;
}

interface TableIndex {
    locale: string;
    byId: Map<string, string>;
}

function indexTable(table: LocalizationTableV1): TableIndex {

    const byId = new Map<string, string>();

    for (const entry of table.messages) {
        byId.set(entry.id, entry.text);
    }

    return { locale: table.locale, byId };
}

export class LocalizationService {

    private _tables = new Map<string, TableIndex>();

    private _locale: string;

    private _fallbackLocale: string | null;

    private _diagnostics: LocalizationDiagnostic[] = [];

    private _diagnosticKeys = new Set<string>();

    constructor(options: LocalizationServiceOptions) {

        for (const table of options.tables) {
            this.addTable(table);
        }

        this._locale = options.locale;
        this._fallbackLocale = options.fallbackLocale ?? null;

        if (this._fallbackLocale !== null && !this._tables.has(this._fallbackLocale)) {

            this.pushDiagnostic({
                code: "LOC_UNKNOWN_FALLBACK_LOCALE",
                severity: "warning",
                message: `Configured fallback locale "${this._fallbackLocale}" has no localization table;`
                    + " fallback becomes active when its table is registered.",
                locale: this._fallbackLocale
            });
        }

        if (!this._tables.has(this._locale)) {

            this.pushDiagnostic({
                code: "LOC_UNKNOWN_LOCALE",
                severity: "warning",
                message: `Initial locale "${this._locale}" has no localization table;`
                    + " translations will fall back or be marked missing.",
                locale: this._locale
            });
        }
    }

    /** Registers an additional parsed table at runtime (e.g. a lazily loaded locale). */
    registerTable(table: LocalizationTableV1): void {
        this.addTable(table);
    }

    /**
     * Registers one table; a repeated locale keeps the first table with a
     * warning, so re-sent data can never silently replace loaded translations.
     */
    private addTable(table: LocalizationTableV1): void {

        if (this._tables.has(table.locale)) {

            this.pushDiagnostic({
                code: "LOC_DUPLICATE_REGISTRATION",
                severity: "warning",
                message: `A table for locale "${table.locale}" was registered more than once;`
                    + " the first table is kept.",
                locale: table.locale
            });

            return;
        }

        this._tables.set(table.locale, indexTable(table));
    }

    /** Currently active locale. */
    getLocale(): string {
        return this._locale;
    }

    /**
     * Switches the active locale. Registering an unknown locale is rejected
     * with a `LOC_UNKNOWN_LOCALE` diagnostic and the previous locale is kept:
     * the switch never silently selects data that does not exist.
     */
    setLocale(locale: string): void {

        if (!this._tables.has(locale)) {

            this.pushDiagnostic({
                code: "LOC_UNKNOWN_LOCALE",
                severity: "warning",
                message: `Cannot switch to locale "${locale}": no localization table is registered.`
                    + ` Keeping locale "${this._locale}".`,
                locale
            });

            return;
        }

        this._locale = locale;
    }

    /** Configured fallback locale, or `null` when no fallback is configured. */
    getFallbackLocale(): string | null {
        return this._fallbackLocale;
    }

    /** `true` when a table is registered for the locale. */
    hasLocale(locale: string): boolean {
        return this._tables.has(locale);
    }

    /** `true` when a direct (non-fallback) translation exists for the active locale. */
    hasMessage(id: string): boolean {

        return this._tables.get(this._locale)?.byId.has(id) ?? false;
    }

    /**
     * Resolves a message id against the active locale, then the fallback
     * locale, then returns the `[[<id>]]` marker. Every fallback or missing
     * case records a deduplicated diagnostic.
     */
    t(id: string, params?: LocalizationParams): string {

        const activeTable = this._tables.get(this._locale);

        const activeText = activeTable?.byId.get(id);

        if (activeText !== undefined) {

            return this.format(id, this._locale, activeText, params);
        }

        const fallbackTable = this._fallbackLocale === null
            ? undefined
            : this._tables.get(this._fallbackLocale);

        const fallbackText = fallbackTable?.byId.get(id);

        if (fallbackTable !== undefined && fallbackText !== undefined) {

            this.pushDiagnostic({
                code: "LOC_FALLBACK_USED",
                severity: "warning",
                message: `Localization key "${id}" is missing in locale "${this._locale}";`
                    + ` the fallback locale "${fallbackTable.locale}" was used.`,
                locale: this._locale,
                messageId: id
            });

            return this.format(id, fallbackTable.locale, fallbackText, params);
        }

        this.pushDiagnostic({
            code: "LOC_MISSING_TRANSLATION",
            severity: "warning",
            message: `Localization key "${id}" has no translation in locale "${this._locale}"`
                + (this._fallbackLocale === null
                    ? " and no fallback locale is configured."
                    : ` nor in fallback locale "${this._fallbackLocale}".`),
            locale: this._locale,
            messageId: id
        });

        return `[[${id}]]`;
    }

    private format(id: string, locale: string, text: string, params: LocalizationParams | undefined): string {

        const { text: formatted, missingParams } = formatMessage(text, params);

        for (const name of missingParams) {

            this.pushDiagnostic({
                code: "LOC_MISSING_PARAM",
                severity: "warning",
                message: `Localization key "${id}" in locale "${locale}" uses the parameter`
                    + ` "{${name}}" which was not provided.`,
                locale,
                messageId: id
            });
        }

        return formatted;
    }

    /** Lists the placeholder names used by a message id in the given locale. */
    getMessagePlaceholders(id: string, locale?: string): string[] {

        const target = locale ?? this._locale;

        const text = this._tables.get(target)?.byId.get(id);

        return text === undefined ? [] : extractPlaceholders(text);
    }

    /** All diagnostics recorded so far, deduplicated, oldest first. */
    getDiagnostics(): readonly LocalizationDiagnostic[] {
        return this._diagnostics;
    }

    /** Clears recorded diagnostics and the deduplication memory. */
    clearDiagnostics(): void {

        this._diagnostics = [];
        this._diagnosticKeys = new Set();
    }

    private pushDiagnostic(diagnostic: LocalizationDiagnostic): void {

        const key = [diagnostic.code, diagnostic.locale ?? "", diagnostic.messageId ?? ""].join("|");

        if (this._diagnosticKeys.has(key)) {
            return;
        }

        this._diagnosticKeys.add(key);
        this._diagnostics.push(diagnostic);
    }
}
