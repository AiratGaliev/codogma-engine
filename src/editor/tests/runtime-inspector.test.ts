import assert from "node:assert/strict";
import { test } from "vitest";
import type { RuntimeSelectionIdentity } from "@codogma/cge";
import { resolveRuntimeAuthoringSelection } from "../src/domain/runtime-inspector.js";
import type { SceneNodeEntry } from "../src/domain/scene-model.js";

function entry(id: string, componentId: string, typeId: string): SceneNodeEntry {
  const component = { id: componentId, typeId, schemaVersion: 1, enabled: true, properties: {} };
  const node = {
    id,
    name: "Same visible name",
    active: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    components: [component],
    children: [],
  };
  return {
    id,
    name: "Same visible name",
    type: "Node",
    parentId: null,
    depth: 0,
    source: {
      id,
      name: "Same visible name",
      label: "Same visible name",
      type: "Node",
      renderType: "Node",
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      originX: 0.5,
      originY: 0.5,
      active: true,
      alpha: 1,
      depth: 0,
    },
    node,
    renderNode: node,
  } as SceneNodeEntry;
}

function identity(nodeId: string, componentInstanceId: string): Extract<RuntimeSelectionIdentity, { kind: "component" }> {
  return {
    kind: "component",
    projectId: "project",
    sceneId: "scene",
    sessionId: "session",
    nodeId,
    componentInstanceId,
    typeId: "com.codogma.shared-type",
  };
}

test("runtime Component selection maps exact instance IDs across duplicate type instances", () => {
  const first = entry("node-first", "instance-first", "com.codogma.shared-type");
  const second = entry("node-second", "instance-second", "com.codogma.shared-type");
  const resolved = resolveRuntimeAuthoringSelection(identity("node-second", "instance-second"), [first, second]);

  assert.equal(resolved?.status, "resolved");
  if (resolved?.status !== "resolved") assert.fail("Expected exact authoring mapping.");
  assert.equal(resolved.node.id, "node-second");
  assert.equal(resolved.component?.id, "instance-second");
});

test("runtime selection never falls back by name, Node ID or Component type", () => {
  const first = entry("node-first", "instance-first", "com.codogma.shared-type");
  const second = entry("node-second", "instance-second", "com.codogma.shared-type");

  assert.equal(
    resolveRuntimeAuthoringSelection(identity("node-second", "missing-instance"), [first, second])?.status,
    "stale",
  );
  assert.equal(
    resolveRuntimeAuthoringSelection({
      ...identity("node-second", "instance-second"),
      typeId: "com.codogma.other-type",
    }, [first, second])?.status,
    "stale",
  );
  assert.equal(
    resolveRuntimeAuthoringSelection(identity("missing-node", "instance-first"), [first, second])?.status,
    "stale",
  );
});
