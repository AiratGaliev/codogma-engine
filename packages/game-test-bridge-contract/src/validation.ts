import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import type {
  CapabilityDescriptor,
  EventPage,
  EventReadRequest,
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
import { isVersionInRange, isValidVersionRange } from "./version.js";

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

const validateCapabilitySchema = compile<CapabilityDescriptor>("CapabilityDescriptor");
const validateHandshakeSchema = compile<HandshakeMessage>("HandshakeMessage");
const validateRuntimeSnapshotSchema = compile<RuntimeSnapshot>("RuntimeSnapshot");
const validateEventSchema = compile<GameTestEvent>("GameTestEvent");
const validateEventPageSchema = compile<EventPage>("EventPage");
const validateEventReadRequestSchema = compile<EventReadRequest>("EventReadRequest");
const validateTestActionDescriptorSchema = compile<TestActionDescriptor>("TestActionDescriptor");
const validateTestActionRequestSchema = compile<TestActionRequest>("TestActionRequest");
const validateTestActionResultSchema = compile<TestActionResult>("TestActionResult");

function schemaIssues(validator: ValidateFunction): readonly ValidationIssue[] {
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
    return { success: false, errors: schemaIssues(validator) };
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

export function validateCapabilityDescriptor(input: unknown): ValidationResult<CapabilityDescriptor> {
  return validateWithSchema(validateCapabilitySchema, input);
}

export function validateHandshake(input: unknown): ValidationResult<HandshakeMessage> {
  const result = validateWithSchema(validateHandshakeSchema, input);
  if (!result.success) return result;

  const issues: ValidationIssue[] = [];
  const ranges = [
    {
      field: "/supportedProtocolVersions",
      current: result.value.protocolVersion,
      range: result.value.supportedProtocolVersions,
    },
    {
      field: "/supportedSchemaVersions",
      current: result.value.schemaVersion,
      range: result.value.supportedSchemaVersions,
    },
  ] as const;

  for (const entry of ranges) {
    if (!isValidVersionRange(entry.range)) {
      issues.push({
        code: "VERSION_RANGE_INVALID",
        path: entry.field,
        message: "The supported version range must be ordered and must not span incompatible major versions.",
      });
    } else if (!isVersionInRange(entry.current, entry.range)) {
      issues.push({
        code: "CURRENT_VERSION_OUTSIDE_SUPPORT_RANGE",
        path: entry.field,
        message: "The current contract version must be included in the range declared by this peer.",
      });
    }
  }

  const capabilityById = new Map<string, CapabilityDescriptor>();
  for (const capability of result.value.capabilities) {
    if (capabilityById.has(capability.id)) {
      issues.push({
        code: "DUPLICATE_CAPABILITY_ID",
        path: "/capabilities",
        message: "Capability identifiers must be unique within a handshake.",
      });
    }
    capabilityById.set(capability.id, capability);
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

    const capability = capabilityById.get(action.capabilityId);
    if (!capability) {
      issues.push({
        code: "ACTION_CAPABILITY_NOT_DECLARED",
        path: "/registeredActions",
        message: "Every registered action must reference a capability declared by the handshake.",
      });
    } else if (action.status === "available" && capability.status !== "available") {
      issues.push({
        code: "ACTION_CAPABILITY_UNAVAILABLE",
        path: "/registeredActions",
        message: "An available action must reference a fully available capability.",
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

export function validateEventReadRequest(input: unknown): ValidationResult<EventReadRequest> {
  return validateWithSchema(validateEventReadRequestSchema, input);
}

export function validateEventPage(input: unknown): ValidationResult<EventPage> {
  const result = validateWithSchema(validateEventPageSchema, input);
  if (!result.success) return result;

  const semanticIssues = [...validateEventPageSemantics(result.value)];
  result.value.events.forEach((event, index) => {
    const payloadResult = validateEventPayloadSize(event.payload);
    if (!payloadResult.success) {
      for (const error of payloadResult.errors) {
        semanticIssues.push({
          ...error,
          path: "/events/" + index + "/payload" + error.path,
        });
      }
    }
  });

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
  const result = validateWithSchema(validateTestActionResultSchema, input);
  if (!result.success) return result;

  if (result.value.status === "succeeded") {
    const outputResult = validateEventPayloadSize(result.value.output);
    return outputResult.success
      ? result
      : { success: false, errors: outputResult.errors };
  }

  return result;
}
