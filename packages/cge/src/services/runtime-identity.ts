import { isValidStableId } from "../project-model/contracts.js";

/** Scope that prevents runtime identities from crossing Project/Scene/Preview sessions. */
export interface RuntimeIdentityScope {
  readonly projectId: string;
  readonly sceneId: string;
  readonly sessionId: string;
}

/** A runtime Node identified by its persisted Project Model Node ID. */
export interface RuntimeEntityIdentity extends RuntimeIdentityScope {
  readonly kind: "node";
  readonly nodeId: string;
}

/** A Component attachment identified by instanceId; typeId is descriptive metadata only. */
export interface RuntimeComponentIdentity extends RuntimeIdentityScope {
  readonly kind: "component";
  readonly nodeId: string;
  readonly componentInstanceId: string;
  readonly typeId: string;
}

export type RuntimeSelectionIdentity = RuntimeEntityIdentity | RuntimeComponentIdentity;

function assertScope(scope: RuntimeIdentityScope): void {
  if (!scope || !isValidStableId(scope.projectId) ||
      !isValidStableId(scope.sceneId) || !isValidStableId(scope.sessionId)) {
    throw new TypeError("Runtime identity requires valid Project, Scene and session IDs.");
  }
}

/** Creates an immutable Node identity scoped to exactly one Preview run. */
export function createRuntimeEntityIdentity(
  scope: RuntimeIdentityScope,
  nodeId: string,
): RuntimeEntityIdentity {
  assertScope(scope);
  if (!isValidStableId(nodeId)) throw new TypeError("Runtime Node identity requires a stable Node ID.");
  return Object.freeze({ ...scope, kind: "node", nodeId });
}

/** Creates an immutable Component identity without conflating it with its type. */
export function createRuntimeComponentIdentity(
  scope: RuntimeIdentityScope,
  nodeId: string,
  componentInstanceId: string,
  typeId: string,
): RuntimeComponentIdentity {
  assertScope(scope);
  if (!isValidStableId(nodeId) || !isValidStableId(componentInstanceId) || !isValidStableId(typeId)) {
    throw new TypeError("Runtime Component identity requires stable Node, instance and type IDs.");
  }
  return Object.freeze({ ...scope, kind: "component", nodeId, componentInstanceId, typeId });
}

/** Returns false for stale, malformed or cross-session runtime identities. */
export function isRuntimeIdentityInScope(
  identity: unknown,
  scope: RuntimeIdentityScope,
): identity is RuntimeSelectionIdentity {
  try {
    assertScope(scope);
    if (identity === null || typeof identity !== "object" || Array.isArray(identity)) return false;
    const candidate = identity as Record<string, unknown>;
    if (candidate.projectId !== scope.projectId ||
        candidate.sceneId !== scope.sceneId ||
        candidate.sessionId !== scope.sessionId ||
        !isValidStableId(candidate.nodeId)) return false;
    if (candidate.kind === "node") return true;
    return candidate.kind === "component" &&
      isValidStableId(candidate.componentInstanceId) &&
      isValidStableId(candidate.typeId);
  } catch {
    return false;
  }
}
