import type { CoreDiagnostic } from "../diagnostics.js";
import { cloneJsonValue, isJsonValue, isRecord, type JsonValue } from "../json.js";
import { PROJECT_SCHEMA_VERSION, type ProjectDocumentV0, type ProjectDocumentV1 } from "./contracts.js";
import { validateProjectDocument } from "./validation.js";

export interface ProjectMigrationResult {
  document: ProjectDocumentV1;
  fromVersion: number;
  toVersion: typeof PROJECT_SCHEMA_VERSION;
  diagnostics: CoreDiagnostic[];
}

function migrationError(
  message: string,
  path: string,
  code: CoreDiagnostic["code"] = "PROJECT_MIGRATION_INVALID_INPUT",
): ProjectMigrationError {
  return new ProjectMigrationError(message, [{
    code,
    severity: "error",
    message,
    path,
  }]);
}

/**
 * Migrates Project envelopes in memory only.
 *
 * Missing optional v0 collections receive documented defaults. A present but
 * malformed field is rejected instead of silently replaced with an empty value.
 * The returned graph is detached from the caller's object graph.
 */
export function migrateProjectDocument(input: unknown): ProjectMigrationResult {
  if (!isRecord(input) || !isJsonValue(input)) {
    throw new ProjectMigrationError("Project migration accepts a JSON-compatible object only.", [{
      code: "PROJECT_INVALID_DOCUMENT",
      severity: "error",
      message: "Project migration input must be a JSON-compatible object.",
    }]);
  }
  if (typeof input.schemaVersion !== "number" || !Number.isInteger(input.schemaVersion)) {
    throw migrationError("Project schemaVersion must be an integer.", "schemaVersion", "PROJECT_INVALID_DOCUMENT");
  }

  const source = cloneJsonValue(input as unknown as JsonValue) as Record<string, unknown>;
  const fromVersion = source.schemaVersion as number;
  let migrated: unknown = source;

  if (fromVersion === 0) {
    const legacy = source as unknown as ProjectDocumentV0;
    for (const field of ["scenes", "assets", "prefabs", "componentModules"] as const) {
      if (source[field] !== undefined && !Array.isArray(source[field])) {
        throw migrationError(
          "Project v0 field " + field + " must be an array when present; migration will not replace malformed data with an empty collection.",
          field,
        );
      }
    }

    let runtime: Record<string, unknown>;
    if (source.runtime === undefined) {
      runtime = { adapterId: "phaser", settings: {} };
    } else {
      if (!isRecord(source.runtime) || typeof source.runtime.adapterId !== "string" ||
          source.runtime.adapterId.trim() === "") {
        throw migrationError(
          "Project v0 runtime must be an object with a string adapterId when present; malformed data is not replaced with defaults.",
          "runtime",
        );
      }
      if (source.runtime.settings !== undefined && !isRecord(source.runtime.settings)) {
        throw migrationError(
          "Project v0 runtime.settings must be an object when present.",
          "runtime.settings",
        );
      }
      runtime = {
        ...source.runtime,
        settings: source.runtime.settings === undefined ? {} : source.runtime.settings,
      };
    }

    migrated = {
      ...legacy,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      scenes: legacy.scenes === undefined ? [] : legacy.scenes,
      assets: legacy.assets === undefined ? [] : legacy.assets,
      prefabs: legacy.prefabs === undefined ? [] : legacy.prefabs,
      componentModules: legacy.componentModules === undefined ? [] : legacy.componentModules,
      runtime,
    };
  } else if (fromVersion !== PROJECT_SCHEMA_VERSION) {
    throw migrationError(
      "Project schema version " + fromVersion + " is not supported.",
      "schemaVersion",
      "PROJECT_UNSUPPORTED_VERSION",
    );
  }

  const validation = validateProjectDocument(migrated);
  if (!validation.valid || !validation.value) {
    throw new ProjectMigrationError("Migrated project data is invalid.", validation.diagnostics);
  }
  return {
    document: validation.value,
    fromVersion,
    toVersion: PROJECT_SCHEMA_VERSION,
    diagnostics: validation.diagnostics,
  };
}

export class ProjectMigrationError extends Error {
  readonly diagnostics: CoreDiagnostic[];

  constructor(message: string, diagnostics: CoreDiagnostic[]) {
    super(message);
    this.name = "ProjectMigrationError";
    this.diagnostics = diagnostics;
  }
}
