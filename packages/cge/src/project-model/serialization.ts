import type { CoreDiagnostic } from "../diagnostics.js";
import { isJsonValue, stableStringify, type JsonValue } from "../json.js";
import type { ProjectDocumentV1, SceneDocumentV1, PrefabDocumentV1 } from "./contracts.js";
import { migrateProjectDocument, ProjectMigrationError } from "./migrations.js";
import {
  validateProjectDocument,
  validateSceneDocument,
  validatePrefabDocument,
  type SceneValidationContext,
} from "./validation.js";

export interface ParseResult<T> {
  value?: T;
  diagnostics: CoreDiagnostic[];
  migratedFrom?: number;
}

function parseJson(content: string, label: string): { value?: unknown; diagnostics: CoreDiagnostic[] } {
  try {
    return { value: JSON.parse(content) as unknown, diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [{
        code: "PROJECT_PARSE_ERROR",
        severity: "error",
        message: label + " file is not valid JSON: " + (error instanceof Error ? error.message : String(error)),
      }],
    };
  }
}

export function parseProjectDocument(content: string): ParseResult<ProjectDocumentV1> {
  const parsed = parseJson(content, "Project");
  if (parsed.value === undefined) return { diagnostics: parsed.diagnostics };
  try {
    const result = migrateProjectDocument(parsed.value);
    return {
      value: result.document,
      diagnostics: result.diagnostics,
      ...(result.fromVersion === result.toVersion ? {} : { migratedFrom: result.fromVersion }),
    };
  } catch (error) {
    if (error instanceof ProjectMigrationError) return { diagnostics: error.diagnostics };
    throw error;
  }
}

export function parseSceneDocument(
  content: string,
  context: SceneValidationContext = {},
): ParseResult<SceneDocumentV1> {
  const parsed = parseJson(content, "Scene");
  if (parsed.value === undefined) return { diagnostics: parsed.diagnostics };
  const result = validateSceneDocument(parsed.value, context);
  return result.valid && result.value
    ? { value: result.value, diagnostics: result.diagnostics }
    : { diagnostics: result.diagnostics };
}

export function parsePrefabDocument(
  content: string,
  context: SceneValidationContext = {},
): ParseResult<PrefabDocumentV1> {
  const parsed = parseJson(content, "Prefab");
  if (parsed.value === undefined) return { diagnostics: parsed.diagnostics };
  const result = validatePrefabDocument(parsed.value, context);
  return result.valid && result.value
    ? { value: result.value, diagnostics: result.diagnostics }
    : { diagnostics: result.diagnostics };
}

export function serializeProjectDocument(document: ProjectDocumentV1): string {
  const result = validateProjectDocument(document);
  if (!result.valid || !result.value || !isJsonValue(result.value)) {
    throw new ProjectSerializationError(result.diagnostics);
  }
  return stableStringify(result.value as unknown as JsonValue, 2) + "\n";
}

export function serializeSceneDocument(
  document: SceneDocumentV1,
  context: SceneValidationContext = {},
): string {
  const result = validateSceneDocument(document, context);
  if (!result.valid || !result.value || !isJsonValue(result.value)) throw new ProjectSerializationError(result.diagnostics);
  return stableStringify(result.value as unknown as JsonValue, 2) + "\n";
}

export function serializePrefabDocument(
  document: PrefabDocumentV1,
  context: SceneValidationContext = {},
): string {
  const result = validatePrefabDocument(document, context);
  if (!result.valid || !result.value || !isJsonValue(result.value)) throw new ProjectSerializationError(result.diagnostics);
  return stableStringify(result.value as unknown as JsonValue, 2) + "\n";
}

export class ProjectSerializationError extends Error {
  readonly diagnostics: CoreDiagnostic[];

  constructor(diagnostics: CoreDiagnostic[]) {
    super("Project data cannot be serialized because validation failed.");
    this.name = "ProjectSerializationError";
    this.diagnostics = diagnostics;
  }
}
