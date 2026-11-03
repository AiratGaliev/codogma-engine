import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import type {
  EventPage,
  GameTestEvent,
  HandshakeMessage,
  RuntimeSnapshot,
  TestActionDescriptor,
  TestActionRequest,
  TestActionResult,
  ValidationIssue,
  ValidationResult,
} from "./types.js";
import { validateEventPageSemantics } from "./events.js";
import { validateEventPayloadSize, validateJsonValue } from "./json-value.js";
import { GAME_TEST_BRIDGE_SCHEMA, GAME_TEST_BRIDGE_SCHEMA_ID } from "./schema.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
  validateFormats: false,
});

ajv.addSchema(GAME_TEST_BRIDGE_SCHEMA);

function compile<T>(definition: string): ValidateFunction<T> {
  return ajv.compile<T>({ $ref: GAME_TEST_BRIDGE_SCHEMA_ID + "#/$defs/" + definition });
}

const validateHandshakeSchema = compile<HandshakeMessage>("HandshakeMessage");
const validateRuntimeSnapshotSchema = compile<RuntimeSnapshot>("RuntimeSnapshot");
const validateEventSchema = compile<GameTestEvent>("GameTestEvent");
const validateEventPageSchema = compile<EventPage>("EventPage");
const validateTestActionDescriptorSchema = compile<TestActionDescriptor>("TestActionDescriptor");
const validateTestActionRequestSchema = compile<TestActionRequest>("TestActionRequest");
const validateTestActionResultSchema = compile<TestActionResult>("TestActionResult");

function schemaIssues(validator: ValidateFunction, input: unknown): readonly ValidationIssue[] {
  return (validator.errors ?? []).map((error) => ({
    code: "SCHEMA_" + error.keyword.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
    path: error.instancePath || "/",
    message: error.message ?? "The value does not match the Game Test Bridge schema.",
  }));
}

function validateWithSchema<T>(
  validator: ValidateFunction<T>,
  input: unknown,
): ValidationResult<T> {
  const inspected = validateJsonValue(input);
  if (!inspected.success) {
    return { success: false, errors: inspected.errors };
  }

  if (!validator(inspected.value)) {
    return { success: false, errors: schemaIssues(validator, inspected.value) };
  }

  return { success: true, value: inspected.value as T };
}

function appendIssues<T>(
  result: ValidationResult<T>,
  issues: readonly ValidationIssue[],
): ValidationResult<T> {
  if (!result.success || issues.length === 0) return result;
  return { success: false, errors: issues };
}

export function validateHandshake(input: unknown): ValidationResult<HandshakeMessage> {
  const result = validateWithSchema(validateHandshakeSchema, input);
  if (!result.success) return result;

  const issues: ValidationIssue[] = [];
  const capabilityIds = new Set<string>();
  for (const capability of result.value.capabilities) {
    if (capabilityIds.has(capability.id)) {
      issues.push({
        code: "DUPLICATE_CAPABILITY_ID",
        path: "/capabilities",
        message: "Capability identifiers must be unique within a handshake.",
      });
    }
    capabilityIds.add(capability.id);
  }

  const actionIds = new Set<string>();
  for (const action of result.value.registeredActions) {
    if (actionIds.has(action.actionId)) {
      issues.push({
        code: "DUPLICATE_ACTION_ID",
        path: "/registeredActions",
        message: "Only one current descriptor per registered action identifier is allowed.",
      });
    }
    actionIds.add(action.actionId);

    if (!capabilityIds.has(action.capabilityId)) {
      issues.push({
        code: "ACTION_CAPABILITY_NOT_DECLARED",
        path: "/registeredActions",
        message: "Every registered action must reference a capability declared by the handshake.",
      });
    }

    if (action.effect === "controlled-state-change" && (
      action.allowedProfiles.length !== 1 || action.allowedProfiles[0] !== "test"
    )) {
      issues.push({
        code: "STATE_CHANGE_ACTION_NOT_TEST_ONLY",
        path: "/registeredActions",
        message: "Controlled state changes must be restricted to the Test profile.",
      });
    }
  }

  return appendIssues(result, issues);
}

export function validateRuntimeSnapshot(input: unknown): ValidationResult<RuntimeSnapshot> {
  return validateWithSchema(validateRuntimeSnapshotSchema, input);
}

export function validateGameTestEvent(input: unknown): ValidationResult<GameTestEvent> {
  const result = validateWithSchema(validateEventSchema, input);
  if (!result.success) return result;

  const payloadResult = validateEventPayloadSize(result.value.payload);
  return payloadResult.success
    ? result
    : { success: false, errors: payloadResult.errors };
}

export function validateEventReadRequest(input: unknown): ValidationResult<unknown> {
  const validator = compile<unknown>("EventReadRequest");
  return validateWithSchema(validator, input);
}

export function validateEventPage(input: unknown): ValidationResult<EventPage> {
  const result = validateWithSchema(validateEventPageSchema, input);
  if (!result.success) return result;

  const semanticIssues = validateEventPageSemantics(result.value);
  return appendIssues(result, semanticIssues);
}

export function validateTestActionDescriptor(input: unknown): ValidationResult<TestActionDescriptor> {
  const result = validateWithSchema(validateTestActionDescriptorSchema, input);
  if (!result.success) return result;

  if (
    result.value.effect === "controlled-state-change" &&
    (result.value.allowedProfiles.length !== 1 || result.value.allowedProfiles[0] !== "test")
  ) {
    return {
      success: false,
      errors: [{
        code: "STATE_CHANGE_ACTION_NOT_TEST_ONLY",
        path: "/allowedProfiles",
        message: "Controlled state changes must be restricted to the Test profile.",
      }],
    };
  }

  return result;
}

export function validateTestActionRequest(input: unknown): ValidationResult<TestActionRequest> {
  const result = validateWithSchema(validateTestActionRequestSchema, input);
  if (!result.success) return result;

  const inputResult = validateEventPayloadSize(result.value.input);
  return inputResult.success
    ? result
    : { success: false, errors: inputResult.errors };
}

export function validateTestActionResult(input: unknown): ValidationResult<TestActionResult> {
  return validateWithSchema(validateTestActionResultSchema, input);
}
