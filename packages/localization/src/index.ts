/**
 * Public entry point of `@codogma/localization`.
 *
 * Optional Codogma Engine localization support: versioned locale tables
 * (contract v1), deterministic fallback, parameter substitution and
 * structured diagnostics shared between project data, validation and the
 * game runtime.
 */

export {
    LOCALIZATION_TABLE_SCHEMA_VERSION,
    type LocalizationDiagnostic,
    type LocalizationDiagnosticCode,
    type LocalizationMessageEntryV1,
    type LocalizationParseResult,
    type LocalizationSeverity,
    type LocalizationTableV1
} from "./contract.js";

export { extractPlaceholders, formatMessage, type LocalizationParams } from "./format.js";

export { canonicalLocaleTag } from "./locale-tag.js";

export { parseLocalizationTable } from "./parse.js";

export {
    validateLocalizationSources,
    type LocalizationProjectValidationResult,
    type LocalizationSourceFile
} from "./project.js";

export { LocalizationService, type LocalizationServiceOptions } from "./service.js";

export {
    validateLocalizationProject,
    type LocalizationProjectTable,
    type ValidateLocalizationProjectOptions
} from "./validate.js";
