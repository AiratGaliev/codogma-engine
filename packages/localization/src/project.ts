/**
 * Project-level localization check (COD-64).
 *
 * Single entry point for tooling (CLI, CI, future editor integration): takes
 * raw table files (text plus project-relative path), parses each one, then
 * runs the cross-locale validation over the structurally valid tables.
 *
 * Deterministic: the result depends only on the input files and options; the
 * same inputs always produce the same diagnostics in the same order. Tables
 * with error-level diagnostics are never returned as usable data.
 */

import { LocalizationDiagnostic, LocalizationTableV1 } from "./contract.js";
import { parseLocalizationTable } from "./parse.js";
import {
    LocalizationProjectTable,
    ValidateLocalizationProjectOptions,
    validateLocalizationProject
} from "./validate.js";

/** One localization table file of a project, as read from disk or network. */
export interface LocalizationSourceFile {
    /** Project-relative path, e.g. `locale/en-US.json`; kept in diagnostics. */
    path: string;

    /** Raw file text (UTF-8). */
    text: string;
}

/** Result of the project-level localization check. */
export interface LocalizationProjectValidationResult {
    /** All parse and cross-locale diagnostics. */
    diagnostics: LocalizationDiagnostic[];

    /** Valid locale tables; these are the actual runtime tables. */
    tables: readonly LocalizationTableV1[];
}

export function validateLocalizationSources(
    files: readonly LocalizationSourceFile[],
    options: ValidateLocalizationProjectOptions = {}
): LocalizationProjectValidationResult {
    const diagnostics: LocalizationDiagnostic[] = [];
    const tables: LocalizationProjectTable[] = [];

    for (const file of files) {
        const parsed = parseLocalizationTable(file.text, file.path);

        diagnostics.push(...parsed.diagnostics);

        if (parsed.table !== undefined) {
            tables.push({ table: parsed.table, file: file.path });
        }
    }

    diagnostics.push(...validateLocalizationProject(tables, options));

    return { diagnostics, tables: tables.map(t => t.table) };
}
