import type { JsonObject } from "./json.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type CoreDiagnosticCode =
  | "PROJECT_INVALID_DOCUMENT"
  | "PROJECT_PARSE_ERROR"
  | "PROJECT_UNSUPPORTED_VERSION"
  | "PROJECT_DUPLICATE_ID"
  | "PROJECT_INVALID_REFERENCE"
  | "PROJECT_BUILD_GRAPH_INVALID"
  | "PROJECT_BUILD_FILE_MISSING"
  | "PROJECT_BUILD_FILE_UNSAFE"
  | "PROJECT_BUILD_PATH_CONFLICT"
  | "PROJECT_BUILD_DOCUMENT_MISSING"
  | "PROJECT_BUILD_DOCUMENT_ID_MISMATCH"
  | "PROJECT_BUILD_COMPONENT_MODULE_MISSING"
  | "PROJECT_BUILD_COMPONENT_SCHEMA_MISSING"
  | "PROJECT_BUILD_MODULE_MISSING"
  | "PROJECT_BUILD_IMPORT_UNRESOLVED"
  | "PROJECT_BUILD_DYNAMIC_ENTRY_UNDECLARED"
  | "PROJECT_BUILD_PACKAGE_MISSING"
  | "PROJECT_BUILD_PACKAGE_DEPENDENCY_MISSING"
  | "PROJECT_BUILD_PACKAGE_SCOPE_INVALID"
  | "PROJECT_BUILD_PACKAGE_TARGET_UNSUPPORTED"
  | "PROJECT_BUILD_FEATURE_PROVIDER_MISSING"
  | "PROJECT_BUILD_RUNTIME_FILE_MISSING"
  | "PROJECT_BUILD_REFERENCE_SCAN_INCOMPLETE"
  | "PROJECT_BUILD_RESOURCE_UNUSED"
  | "PROJECT_BUILD_OUTPUT_INVALID"
  | "PROJECT_BUILD_OUTPUT_SCOPE_LEAK"
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
  | "CORE_UNKNOWN_COMPONENT"
  | "SCENE_LOAD_ABORTED"
  | "SCENE_LOAD_FAILED";

export interface CoreDiagnosticSource {
  kind:
    | "project"
    | "file"
    | "asset"
    | "scene"
    | "prefab"
    | "component-module"
    | "module"
    | "package"
    | "feature"
    | "runtime-file"
    | "artifact";
  id?: string;
  path?: string;
}

export interface CoreDiagnostic {
  code: CoreDiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  path?: string;
  entityId?: string;
  componentInstanceId?: string;
  propertyName?: string;
  details?: JsonObject;
  source?: CoreDiagnosticSource;
}

export interface ValidationResult<T> {
  valid: boolean;
  diagnostics: CoreDiagnostic[];
  value?: T;
}

export function hasErrors(diagnostics: readonly CoreDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
