import type { JsonObject } from "./json.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type CoreDiagnosticCode =
  | "PROJECT_INVALID_DOCUMENT"
  | "PROJECT_PARSE_ERROR"
  | "PROJECT_UNSUPPORTED_VERSION"
  | "PROJECT_UNKNOWN_FIELD_PRESERVED"
  | "PROJECT_DUPLICATE_ID"
  | "PROJECT_INVALID_REFERENCE"
  | "SCENE_INVALID_NODE"
  | "SCENE_DUPLICATE_ID"
  | "SCENE_INVALID_TRANSFORM"
  | "COMPONENT_INVALID_SCHEMA"
  | "COMPONENT_INVALID_VALUE"
  | "COMPONENT_REQUIRED_VALUE"
  | "COMPONENT_UNKNOWN_PROPERTY"
  | "COMPONENT_UNKNOWN_TYPE"
  | "COMPONENT_INVALID_REFERENCE"
  | "COMPONENT_DUPLICATE_INSTANCE"
  | "CORE_INVALID_DELTA"
  | "CORE_WORLD_DISPOSED"
  | "CORE_DUPLICATE_REGISTRATION"
  | "CORE_UNKNOWN_NODE"
  | "CORE_UNKNOWN_COMPONENT";

export interface CoreDiagnostic {
  code: CoreDiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  path?: string;
  entityId?: string;
  componentInstanceId?: string;
  propertyName?: string;
  details?: JsonObject;
}

export interface ValidationResult<T> {
  valid: boolean;
  diagnostics: CoreDiagnostic[];
  value?: T;
}

export function hasErrors(diagnostics: readonly CoreDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
