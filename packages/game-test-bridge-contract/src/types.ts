export type JsonPrimitive = null | boolean | number | string;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ContractVersion = string;
export type OpaqueReference = string;

export type RuntimeProfile = "development" | "test";
export type ReadinessState = "starting" | "ready" | "degraded" | "blocked" | "stopped";
export type TimeDomain = "unix-ms" | "monotonic-ms";

export interface VersionRange {
  minimum: ContractVersion;
  maximumExclusive: ContractVersion;
}

export interface ContractVersionSet {
  protocolVersion: ContractVersion;
  schemaVersion: ContractVersion;
  supportedProtocolVersions: VersionRange;
  supportedSchemaVersions: VersionRange;
}

export interface BridgeDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  source: string;
  field?:
    | "transform.position"
    | "transform.rotation"
    | "transform.scale"
    | "lifecycle"
    | "component.status"
    | "resource.state"
    | "animation.state"
    | "input.device"
    | "physics.body"
    | "metrics.frameTime";
  subjectRef?: OpaqueReference;
}

export interface RuntimeReadiness {
  state: ReadinessState;
  readyForTest: boolean;
  diagnostics: readonly BridgeDiagnostic[];
}

export interface UnsupportedCapabilityReason {
  code:
    | "NOT_DECLARED"
    | "NOT_IMPLEMENTED"
    | "PROFILE_DISABLED"
    | "RUNTIME_LIMITATION"
    | "DEPENDENCY_MISSING"
    | "POLICY_RESTRICTED"
    | "VERSION_MISMATCH"
    | "NOT_APPLICABLE"
    | "OTHER";
  message: string;
  retryable: boolean;
}

export interface CapabilityDescriptor {
  id: string;
  version: ContractVersion;
  description: string;
  scope: "runtime" | "session" | "project";
  status: "available" | "partial" | "unavailable";
  eventTypes: readonly string[];
  reason?: UnsupportedCapabilityReason;
}

export interface HandshakeMessage extends ContractVersionSet {
  kind: "game-test-bridge.handshake";
  engineVersion: string;
  runtimeAdapterVersion: string;
  projectRevision: string;
  buildId: string;
  previewId: string | null;
  testSessionId: string;
  profile: RuntimeProfile;
  actionPolicy: "registered-only";
  readiness: RuntimeReadiness;
  capabilities: readonly CapabilityDescriptor[];
  registeredActions: readonly TestActionDescriptor[];
  extensions?: JsonExtensionMap;
}

export interface JsonExtensionMap {
  readonly [namespace: string]: JsonValue;
}

export interface Transform2D {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface SceneSnapshot {
  sceneRef: OpaqueReference;
  typeId: string;
  state: "loading" | "active" | "paused" | "stopping";
  name?: string;
}

export interface ComponentSnapshot {
  componentRef: OpaqueReference;
  typeId: string;
  state: "attached" | "initializing" | "active" | "disabled" | "failed" | "detached";
  diagnostics: readonly BridgeDiagnostic[];
}

export interface EntitySnapshot {
  entityRef: OpaqueReference;
  typeId: string;
  state: "spawning" | "active" | "disabled" | "destroying";
  transform?: Transform2D;
  components: readonly ComponentSnapshot[];
}

export interface ResourceSnapshot {
  resourceRef: OpaqueReference;
  typeId: string;
  state: "queued" | "loading" | "loaded" | "failed" | "unavailable";
  diagnostics: readonly BridgeDiagnostic[];
}

export interface RuntimeMetric {
  name: string;
  value: number;
  unit: string;
  source: string;
  sampledAt: number;
  sampleWindowMs: number;
  accuracy: "exact" | "sampled" | "estimated";
}

export interface RuntimeSnapshot {
  kind: "game-test-bridge.snapshot";
  schemaVersion: ContractVersion;
  testSessionId: string;
  capturedAt: number;
  timeDomain: TimeDomain;
  readiness: RuntimeReadiness;
  activeScene: SceneSnapshot | null;
  entities: readonly EntitySnapshot[];
  resources: readonly ResourceSnapshot[];
  metrics: readonly RuntimeMetric[];
  diagnostics: readonly BridgeDiagnostic[];
  extensions?: JsonExtensionMap;
}

export interface EventPayloadMap {
  "scene.started": { sceneRef: OpaqueReference; sceneTypeId: string };
  "scene.ready": { sceneRef: OpaqueReference };
  "scene.stopped": { sceneRef: OpaqueReference; reason: string };
  "entity.spawned": { entityRef: OpaqueReference; typeId: string };
  "entity.destroyed": { entityRef: OpaqueReference; reason: string };
  "component.attached": { entityRef: OpaqueReference; componentRef: OpaqueReference; typeId: string };
  "component.detached": { entityRef: OpaqueReference; componentRef: OpaqueReference; typeId: string };
  "resource.loaded": { resourceRef: OpaqueReference; typeId: string };
  "resource.failed": { resourceRef: OpaqueReference; typeId: string; errorCode: string };
  "animation.started": { entityRef: OpaqueReference; animationId: string };
  "animation.completed": { entityRef: OpaqueReference; animationId: string };
  "animation.stopped": { entityRef: OpaqueReference; animationId: string; reason: string };
  "input.observed": {
    device: "keyboard" | "pointer" | "touch" | "gamepad" | "other";
    control: string;
    phase: "down" | "up" | "move" | "cancel";
    value: JsonValue;
  };
  "runtime.paused": { reason: string };
  "runtime.resumed": { reason: string };
  "scene.transitioned": { fromSceneRef: OpaqueReference | null; toSceneRef: OpaqueReference };
  "gameplay.semantic": { name: string; schemaVersion: ContractVersion; data: JsonValue };
  "physics.contact": {
    bodyARef: OpaqueReference;
    bodyBRef: OpaqueReference;
    phase: "begin" | "stay" | "end";
  };
}

export type KnownEventType = keyof EventPayloadMap;

export interface GameTestEvent<
  TEventType extends string = string,
  TPayload extends JsonValue = JsonValue,
> {
  kind: "game-test-bridge.event";
  eventId: string;
  sequence: number;
  timestamp: number;
  timeDomain: TimeDomain;
  testSessionId: string;
  sceneRef?: OpaqueReference;
  entityRef?: OpaqueReference;
  eventType: TEventType;
  payload: TPayload;
  extensions?: JsonExtensionMap;
}

export type KnownGameTestEvent = {
  [TEventType in KnownEventType]: GameTestEvent<TEventType, EventPayloadMap[TEventType]>;
}[KnownEventType];

export interface EventReadRequest {
  testSessionId: string;
  cursor: string | null;
  limit: number;
  eventTypes?: readonly string[];
  entityRefs?: readonly OpaqueReference[];
}

export interface SequenceGap {
  fromSequence: number;
  toSequence: number;
  reason: "buffer-overflow" | "retention" | "source-gap";
}

export interface BufferOverflowDiagnostic {
  occurred: boolean;
  capacity: number;
  droppedEventCount: number | null;
}

export interface EventStreamIntegrity {
  coverage: "complete" | "partial" | "unknown";
  sequenceGaps: readonly SequenceGap[];
  bufferOverflow: BufferOverflowDiagnostic;
  lostEventCount: number | null;
}

export interface EventPage {
  kind: "game-test-bridge.event-page";
  testSessionId: string;
  requestCursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  events: readonly GameTestEvent[];
  integrity: EventStreamIntegrity;
}

export interface TestActionDescriptor {
  actionId: string;
  version: ContractVersion;
  description: string;
  capabilityId: string;
  effect: "observe" | "controlled-state-change";
  allowedProfiles: readonly RuntimeProfile[];
  inputSchemaId: string;
  outputSchemaId: string;
  status: "available" | "unavailable";
  reason?: UnsupportedCapabilityReason;
}

export interface TestActionRequest<TInput extends JsonValue = JsonValue> {
  kind: "game-test-bridge.action-request";
  requestId: string;
  testSessionId: string;
  actionId: string;
  actionVersion: ContractVersion;
  input: TInput;
}

export type TestActionFailureCode =
  | "ACTION_NOT_REGISTERED"
  | "ACTION_VERSION_MISMATCH"
  | "CAPABILITY_NOT_DECLARED"
  | "CAPABILITY_UNAVAILABLE"
  | "PROFILE_NOT_ALLOWED"
  | "INPUT_VALIDATION_FAILED"
  | "EXECUTION_FAILED"
  | "TIMEOUT"
  | "CANCELLED"
  | "POLICY_RESTRICTED";

export interface TestActionFailure {
  code: TestActionFailureCode;
  message: string;
  retryable: boolean;
  diagnostics: readonly BridgeDiagnostic[];
}

export interface TestActionSuccess<TOutput extends JsonValue = JsonValue> {
  kind: "game-test-bridge.action-result";
  requestId: string;
  status: "succeeded";
  completedAt: number;
  output: TOutput;
}

export interface TestActionRejectedOrFailed {
  kind: "game-test-bridge.action-result";
  requestId: string;
  status: "rejected" | "failed";
  completedAt: number;
  failure: TestActionFailure;
}

export type TestActionResult<TOutput extends JsonValue = JsonValue> =
  | TestActionSuccess<TOutput>
  | TestActionRejectedOrFailed;

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; errors: readonly ValidationIssue[] };
