import type {
  CapabilityDescriptor,
  HandshakeMessage,
  RuntimeProfile,
  TestActionFailure,
  TestActionRequest,
  UnsupportedCapabilityReason,
} from "./types.js";

export const EVENT_CAPABILITY_REQUIREMENTS: Readonly<Record<string, string | undefined>> = Object.freeze({
  "physics.contact": "events.physics.contact",
  "gameplay.semantic": "events.gameplay.semantic",
});

export interface UnsupportedCapability {
  capabilityId: string;
  reason: UnsupportedCapabilityReason;
}

export interface CapabilityNegotiationResult {
  accepted: boolean;
  available: readonly CapabilityDescriptor[];
  unsupported: readonly UnsupportedCapability[];
}

function notDeclared(capabilityId: string): UnsupportedCapabilityReason {
  return {
    code: "NOT_DECLARED",
    message: "The runtime adapter did not declare this capability.",
    retryable: false,
  };
}

export function negotiateCapabilities(
  requiredCapabilityIds: readonly string[],
  declaredCapabilities: readonly CapabilityDescriptor[],
): CapabilityNegotiationResult {
  const declaredById = new Map(declaredCapabilities.map((capability) => [capability.id, capability]));
  const available: CapabilityDescriptor[] = [];
  const unsupported: UnsupportedCapability[] = [];
  const seen = new Set<string>();

  for (const capabilityId of requiredCapabilityIds) {
    if (seen.has(capabilityId)) continue;
    seen.add(capabilityId);

    const descriptor = declaredById.get(capabilityId);
    if (!descriptor) {
      unsupported.push({ capabilityId, reason: notDeclared(capabilityId) });
      continue;
    }

    if (descriptor.status === "unavailable") {
      unsupported.push({ capabilityId, reason: descriptor.reason ?? notDeclared(capabilityId) });
      continue;
    }

    available.push(descriptor);
  }

  return {
    accepted: unsupported.length === 0,
    available,
    unsupported,
  };
}

export type TestActionAuthorizationResult =
  | { allowed: true }
  | { allowed: false; failure: TestActionFailure };

function denied(
  code: TestActionFailure["code"],
  message: string,
  retryable = false,
): TestActionAuthorizationResult {
  return {
    allowed: false,
    failure: {
      code,
      message,
      retryable,
      diagnostics: [],
    },
  };
}

export function authorizeRegisteredTestAction(
  request: TestActionRequest,
  handshake: HandshakeMessage,
): TestActionAuthorizationResult {
  if (request.testSessionId !== handshake.testSessionId) {
    return denied("POLICY_RESTRICTED", "The action request belongs to a different test session.");
  }

  const descriptor = handshake.registeredActions.find(
    (action) => action.actionId === request.actionId,
  );

  if (!descriptor) {
    return denied("ACTION_NOT_REGISTERED", "The requested test action is not registered in this session.");
  }

  if (descriptor.version !== request.actionVersion) {
    return denied("ACTION_VERSION_MISMATCH", "The requested test action version is not registered.");
  }

  if (descriptor.status === "unavailable") {
    return denied("CAPABILITY_UNAVAILABLE", descriptor.reason?.message ?? "The registered action is unavailable.");
  }

  if (!descriptor.allowedProfiles.includes(handshake.profile)) {
    return denied("PROFILE_NOT_ALLOWED", "The registered action is not allowed in the active runtime profile.");
  }

  if (descriptor.effect === "controlled-state-change" && handshake.profile !== "test") {
    return denied("PROFILE_NOT_ALLOWED", "State-changing test actions are permitted only in the Test profile.");
  }

  const capability = handshake.capabilities.find(
    (entry) => entry.id === descriptor.capabilityId,
  );

  if (!capability) {
    return denied("CAPABILITY_NOT_DECLARED", "The action capability was not declared by the runtime.");
  }

  if (capability.status === "unavailable") {
    return denied("CAPABILITY_UNAVAILABLE", capability.reason?.message ?? "The action capability is unavailable.");
  }

  return { allowed: true };
}

export function actionAllowedInProfile(
  effect: "observe" | "controlled-state-change",
  profile: RuntimeProfile,
): boolean {
  return effect === "observe" || profile === "test";
}
