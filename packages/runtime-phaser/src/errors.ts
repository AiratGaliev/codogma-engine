export type PhaserRuntimeDiagnosticCode =
  | "SCENE_GRAPH_INVALID"
  | "VIEW_CREATION_FAILED"
  | "TRANSFORM_INVALID"
  | "RUNTIME_UPDATE_FAILED"
  | "SCENE_CLEANUP_FAILED";

export interface PhaserRuntimeDiagnostic {
  readonly code: PhaserRuntimeDiagnosticCode;
  readonly severity: "error";
  readonly message: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly nodeId?: string;
  readonly componentInstanceId?: string;
  readonly causeMessage?: string;
}

export class PhaserRuntimeAdapterError extends Error {
  readonly diagnostic: PhaserRuntimeDiagnostic;
  readonly originalError?: unknown;

  constructor(diagnostic: PhaserRuntimeDiagnostic, cause?: unknown) {
    super(diagnostic.message);
    this.name = "PhaserRuntimeAdapterError";
    this.diagnostic = diagnostic;
    if (cause !== undefined) this.originalError = cause;
  }
}
