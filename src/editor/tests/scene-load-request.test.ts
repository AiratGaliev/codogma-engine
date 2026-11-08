import assert from "node:assert/strict";
import { test as testCase } from "vitest";
import { beginSceneLoadRequest } from "../src/domain/scene-load-request.js";

testCase("same-document no-op still invalidates an older pending scene load", () => {
  const pendingRequest = beginSceneLoadRequest(10, "scenes/Next.cge-scene.json", "scenes/Current.cge-scene.json", false);
  assert.deepEqual(pendingRequest, { sequence: 11, skip: false });

  const reselectedCurrent = beginSceneLoadRequest(
    pendingRequest.sequence,
    "scenes/Current.cge-scene.json",
    "scenes/Current.cge-scene.json",
    false,
  );
  assert.deepEqual(reselectedCurrent, { sequence: 12, skip: true });
  assert.notEqual(reselectedCurrent.sequence, pendingRequest.sequence);
});

testCase("explicit reload of the current Scene is not skipped", () => {
  assert.deepEqual(
    beginSceneLoadRequest(4, "scenes/Current.cge-scene.json", "scenes/Current.cge-scene.json", true),
    { sequence: 5, skip: false },
  );
});
