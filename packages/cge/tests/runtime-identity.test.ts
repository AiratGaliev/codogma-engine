import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntimeComponentIdentity,
  createRuntimeEntityIdentity,
  isRuntimeIdentityInScope,
} from "../src/index.js";

const scope = { projectId: "project-a", sceneId: "scene-a", sessionId: "preview-a:session-1" };

test("creates immutable Node and Component identities in an explicit Preview scope", () => {
  const node = createRuntimeEntityIdentity(scope, "node-a");
  const first = createRuntimeComponentIdentity(scope, "node-a", "component-a", "com.example.counter");
  const second = createRuntimeComponentIdentity(scope, "node-a", "component-b", "com.example.counter");

  assert.equal(Object.isFrozen(node), true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.typeId, second.typeId);
  assert.notEqual(first.componentInstanceId, second.componentInstanceId);
  assert.equal(isRuntimeIdentityInScope(node, scope), true);
  assert.equal(isRuntimeIdentityInScope(first, scope), true);
  assert.equal(isRuntimeIdentityInScope(second, scope), true);
});

test("rejects stale Preview sessions, other Projects and malformed IDs", () => {
  const identity = createRuntimeComponentIdentity(scope, "node-a", "component-a", "com.example.counter");
  assert.equal(isRuntimeIdentityInScope(identity, { ...scope, sessionId: "preview-a:session-2" }), false);
  assert.equal(isRuntimeIdentityInScope(identity, { ...scope, projectId: "project-b" }), false);
  assert.equal(isRuntimeIdentityInScope({ ...identity, nodeId: "invalid/node" }, scope), false);
  assert.equal(isRuntimeIdentityInScope({ ...identity, componentInstanceId: "" }, scope), false);
  assert.equal(isRuntimeIdentityInScope({ ...identity, kind: "unknown" }, scope), false);
  let getterCalls = 0;
  const accessorIdentity = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(identity)) {
    Object.defineProperty(accessorIdentity, key, { enumerable: true, value });
  }
  Object.defineProperty(accessorIdentity, "sessionId", {
    enumerable: true,
    get() { getterCalls += 1; return scope.sessionId; },
  });
  assert.equal(isRuntimeIdentityInScope(accessorIdentity, scope), false);
  assert.equal(getterCalls, 0);
});

test("requires a Component instance ID and rejects type-only identity construction", () => {
  assert.throws(
    () => createRuntimeComponentIdentity(scope, "node-a", "", "com.example.counter"),
    /stable Node, instance and type IDs/,
  );
  assert.throws(
    () => createRuntimeEntityIdentity(scope, "node/a"),
    /stable Node ID/,
  );
});
