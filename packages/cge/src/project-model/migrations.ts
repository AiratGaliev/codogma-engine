import type { CoreDiagnostic } from "../diagnostics.js";
import { PROJECT_SCHEMA_VERSION, type ProjectDocumentV0, type ProjectDocumentV1 } from "./contracts.js";
import { isRecord } from "../json.js";
import { validateProjectDocument } from "./validation.js";

export interface ProjectMigrationResult {
  document: ProjectDocumentV1;
  fromVersion: number;
  toVersion: typeof PROJECT_SCHEMA_VERSION;
  diagnostics: CoreDiagnostic[];
}

export function migrateProjectDocument(input: unknown): ProjectMigrationResult {
  if (!isRecord(input) || typeof input.schemaVersion !== "number") {
    throw new ProjectMigrationError("Project schemaVersion is missing or invalid.", []);
  }
  const fromVersion = input.schemaVersion;
  let migrated: unknown = input;
  if (fromVersion === 0) {
    const legacy = input as ProjectDocumentV0;
    migrated = {
      ...legacy,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      scenes: Array.isArray(legacy.scenes) ? legacy.scenes : [],
      assets: Array.isArray(legacy.assets) ? legacy.assets : [],
      prefabs: Array.isArray(legacy.prefabs) ? legacy.prefabs : [],
      componentModules: Array.isArray(legacy.componentModules) ? legacy.componentModules : [],
      runtime: isRecord(legacy.runtime) && typeof legacy.runtime.adapterId === "string"
        ? legacy.runtime
        : { adapterId: "phaser", settings: {} },
    };
  } else if (fromVersion !== PROJECT_SCHEMA_VERSION) {
    throw new ProjectMigrationError("Project schema version " + fromVersion + " is not supported.", [{
      code: "PROJECT_UNSUPPORTED_VERSION",
      severity: "error",
      message: "Project schema version " + fromVersion + " is not supported.",
      path: "schemaVersion",
    }]);
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
