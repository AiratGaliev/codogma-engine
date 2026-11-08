import assert from "node:assert/strict";
import { test as testCase } from "vitest";
import type { ProjectDocumentV1, SceneDocumentV1 } from "@codogma/cge";
import {
  attachNativeComponent,
  createNativeComponentContext,
  detachNativeComponent,
  getNativeComponentInstances,
  setNativeComponentEnabled,
  updateNativeComponentProperties,
  validateNativeComponentProperties,
} from "../src/domain/components-model.js";
import { findSceneNode } from "../src/domain/scene-model.js";
import {
  createDocumentHistoryState,
  recordDocumentChange,
  undoDocumentChange,
  redoDocumentChange,
} from "../src/domain/document-history.js";

const schema = {
  schemaVersion: 1 as const,
  typeId: "com.example.health",
  name: "Health",
  version: "1.0.0",
  properties: {
    hp: { type: "number" as const, min: 0, defaultValue: 100 },
    armor: { type: "boolean" as const, defaultValue: false },
    target: { type: "node" as const, allowSelf: false },
  },
};

const project: ProjectDocumentV1 = {
  schemaVersion: 1,
  id: "project-native",
  name: "Native",
  scenes: [{ id: "scene-native", assetId: "asset-scene" }],
  assets: [
    { id: "asset-scene", path: "scenes/Main.cge-scene.json", kind: "scene" },
    { id: "asset-script", path: "src/Health.ts", kind: "script" },
  ],
  prefabs: [],
  componentModules: [{ typeId: "com.example.health", moduleAssetId: "asset-script", version: "1.0.0" }],
  runtime: { adapterId: "phaser", settings: {} },
};

const context = {
  project,
  schemas: new Map([[schema.typeId, schema]]),
  assets: new Map(project.assets.map((asset) => [asset.id, asset])),
};

function scene(): SceneDocumentV1 {
  return {
    schemaVersion: 1,
    id: "scene-native",
    name: "Main",
    settings: {},
    rootNodes: [{
      id: "node-player",
      name: "Player",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    }],
  };
}

testCase("attaches a registered component with stable type identity and independent instance identity", () => {
  const original = scene();
  const next = attachNativeComponent(original, "node-player", "com.example.health", context) as SceneDocumentV1;
  const node = findSceneNode(next, "node-player");
  assert.equal(node?.components.length, 1);
  assert.equal(node?.components[0]?.typeId, "com.example.health");
  assert.equal(node?.components[0]?.enabled, true);
  assert.notEqual(node?.components[0]?.id, node?.components[0]?.typeId);
  assert.deepEqual(node?.components[0]?.properties, { hp: 100, armor: false });
  assert.deepEqual(getNativeComponentInstances(node!, context).map((item) => item.id), [node?.components[0]?.id]);
  assert.deepEqual(findSceneNode(original, "node-player")?.components, []);
});

testCase("prevents duplicate attachment of the same Component type to one Node", () => {
  const first = attachNativeComponent(scene(), "node-player", "com.example.health", context) as SceneDocumentV1;
  assert.throws(
    () => attachNativeComponent(first, "node-player", "com.example.health", context),
    /already attached/,
  );
  const secondNodeScene: SceneDocumentV1 = {
    ...first,
    rootNodes: [...first.rootNodes, {
      id: "node-enemy",
      name: "Enemy",
      active: true,
      transform: { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    }],
  };
  const next = attachNativeComponent(secondNodeScene, "node-enemy", "com.example.health", context) as SceneDocumentV1;
  assert.equal(findSceneNode(next, "node-enemy")?.components[0]?.typeId, "com.example.health");
  assert.notEqual(
    findSceneNode(next, "node-player")?.components[0]?.id,
    findSceneNode(next, "node-enemy")?.components[0]?.id,
  );
});

testCase("rejects component IDs that are not registered by the native Project manifest", () => {
  assert.throws(() => attachNativeComponent(scene(), "node-player", "Health", context), /not registered/);
  assert.throws(() => attachNativeComponent(scene(), "node-player", "com.example.unknown", context), /not registered/);
});

testCase("updates properties and enabled state by instanceId, never by display name", () => {
  let current = attachNativeComponent(scene(), "node-player", "com.example.health", context, { hp: 100 }) as SceneDocumentV1;
  const instance = findSceneNode(current, "node-player")?.components[0];
  assert.ok(instance);
  current = updateNativeComponentProperties(current, "node-player", instance.id, { hp: 75, armor: true }, context) as SceneDocumentV1;
  current = setNativeComponentEnabled(current, "node-player", instance.id, false) as SceneDocumentV1;
  const updated = findSceneNode(current, "node-player")?.components[0];
  assert.deepEqual(updated?.properties, { hp: 75, armor: true });
  assert.equal(updated?.enabled, false);
});

testCase("detaches only the selected instance and rejects malformed property payloads", () => {
  let current = attachNativeComponent(scene(), "node-player", "com.example.health", context) as SceneDocumentV1;
  const instance = findSceneNode(current, "node-player")?.components[0];
  assert.ok(instance);
  current = detachNativeComponent(current, "node-player", instance.id) as SceneDocumentV1;
  assert.deepEqual(findSceneNode(current, "node-player")?.components, []);
  assert.throws(() => updateNativeComponentProperties(current, "node-player", instance.id, { value: undefined }, context), /not found/);
  assert.throws(() => attachNativeComponent(scene(), "node-player", "com.example.health", context, { value: undefined }), /JSON-compatible/);
});


testCase("builds one complete Project/Scene resolver context for Inspector and MCP operations", () => {
  const document: SceneDocumentV1 = {
    ...scene(),
    rootNodes: [
      ...scene().rootNodes,
      {
        id: "node-enemy",
        name: "Enemy",
        active: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [],
        children: [],
      },
    ],
  };
  const referenceSchema = {
    ...schema,
    properties: {
      source: { type: "asset" as const, assetKinds: ["script" as const], required: true },
      target: { type: "node" as const, allowSelf: false, nodeKinds: ["Node" as const], required: true },
    },
  };
  const schemas = new Map([[referenceSchema.typeId, referenceSchema]]);
  const resolved = createNativeComponentContext(document, project, schemas);

  assert.equal(resolved.schemas, schemas);
  assert.equal(resolved.assets?.get("asset-script")?.kind, "script");
  assert.equal(resolved.nodeIds?.has("node-player"), true);
  assert.equal(resolved.nodeIds?.has("node-enemy"), true);
  assert.equal(resolved.nodeKinds?.get("node-enemy"), "Node");

  const valid = attachNativeComponent(document, "node-player", referenceSchema.typeId, resolved, {
    source: { assetId: "asset-script" },
    target: { nodeId: "node-enemy" },
  }) as SceneDocumentV1;
  const instance = findSceneNode(valid, "node-player")?.components[0];
  assert.ok(instance);
  assert.deepEqual(instance.properties, {
    source: { assetId: "asset-script" },
    target: { nodeId: "node-enemy" },
  });

  assert.throws(
    () => attachNativeComponent(document, "node-player", referenceSchema.typeId, resolved, {
      source: { assetId: "asset-scene" },
      target: { nodeId: "node-enemy" },
    }),
    /incompatible kind/,
  );
  assert.throws(
    () => attachNativeComponent(document, "node-player", referenceSchema.typeId, resolved, {
      source: { assetId: "asset-script" },
      target: { nodeId: "node-missing" },
    }),
    /does not exist/,
  );
});

testCase("keeps Asset and Node references intact through Component property undo and redo", () => {
  const document: SceneDocumentV1 = {
    ...scene(),
    rootNodes: [
      ...scene().rootNodes,
      ...["node-enemy", "node-guard"].map((id) => ({
        id,
        name: id === "node-enemy" ? "Enemy" : "Guard",
        active: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [],
        children: [],
      })),
    ],
  };
  const referenceSchema = {
    ...schema,
    properties: {
      source: { type: "asset" as const, assetKinds: ["script" as const], required: true },
      target: { type: "node" as const, allowSelf: false, required: true },
    },
  };
  const context = createNativeComponentContext(
    document,
    project,
    new Map([[referenceSchema.typeId, referenceSchema]]),
  );
  const attached = attachNativeComponent(document, "node-player", referenceSchema.typeId, context, {
    source: { assetId: "asset-script" },
    target: { nodeId: "node-enemy" },
  }) as SceneDocumentV1;
  const instance = findSceneNode(attached, "node-player")?.components[0];
  assert.ok(instance);

  const changed = updateNativeComponentProperties(attached, "node-player", instance.id, {
    source: { assetId: "asset-script" },
    target: { nodeId: "node-guard" },
  }, context) as SceneDocumentV1;
  let history = createDocumentHistoryState(attached);
  history = recordDocumentChange(history, changed, "node-player", "node-player");

  const undone = undoDocumentChange(history);
  assert.ok(undone);
  const undoneInstance = findSceneNode(undone.document, "node-player")?.components[0];
  assert.deepEqual(undoneInstance?.properties, {
    source: { assetId: "asset-script" },
    target: { nodeId: "node-enemy" },
  });
  assert.equal(validateNativeComponentProperties(
    referenceSchema.typeId,
    undoneInstance!.properties,
    context,
    "node-player",
    undone.document,
    instance.id,
  ).valid, true);

  const redone = redoDocumentChange(undone.state);
  assert.ok(redone);
  const redoneInstance = findSceneNode(redone.document, "node-player")?.components[0];
  assert.deepEqual(redoneInstance?.properties, {
    source: { assetId: "asset-script" },
    target: { nodeId: "node-guard" },
  });
  assert.equal(validateNativeComponentProperties(
    referenceSchema.typeId,
    redoneInstance!.properties,
    context,
    "node-player",
    redone.document,
    instance.id,
  ).valid, true);
});

testCase("validates native Component properties with Project/Scene reference contexts and persisted diagnostics", () => {
  const original = scene();
  const withTarget = {
    ...original,
    rootNodes: [
      ...original.rootNodes,
      {
        id: "node-enemy",
        name: "Enemy",
        active: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [],
        children: [],
      },
    ],
  } satisfies SceneDocumentV1;
  const attached = attachNativeComponent(withTarget, "node-player", "com.example.health", context) as SceneDocumentV1;
  const instance = findSceneNode(attached, "node-player")?.components[0];
  assert.ok(instance);

  const valid = validateNativeComponentProperties(
    "com.example.health",
    { hp: 75, armor: true, target: { nodeId: "node-enemy" } },
    context,
    "node-player",
    attached,
    instance.id,
  );
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.value, { hp: 75, armor: true, target: { nodeId: "node-enemy" } });

  const invalid = validateNativeComponentProperties(
    "com.example.health",
    { hp: -1, armor: true, target: { nodeId: "node-missing" } },
    context,
    "node-player",
    attached,
    instance.id,
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.diagnostics.some((item) =>
    item.path === "rootNodes[0].components[0].properties.hp" &&
    item.entityId === "node-player" &&
    item.componentInstanceId === instance.id &&
    item.propertyName === "hp",
  ));
  assert.ok(invalid.diagnostics.some((item) => item.propertyName === "target" && item.code === "COMPONENT_INVALID_REFERENCE"));

  const invalidNumber = validateNativeComponentProperties(
    "com.example.health",
    { hp: Number.POSITIVE_INFINITY, armor: true, target: { nodeId: "node-enemy" } },
    context,
    "node-player",
    attached,
    instance.id,
  );
  assert.equal(invalidNumber.valid, false);
  assert.ok(invalidNumber.diagnostics.some((item) =>
    item.code === "COMPONENT_INVALID_VALUE" &&
    item.path === "rootNodes[0].components[0].properties.hp" &&
    item.propertyName === "hp" &&
    item.componentInstanceId === instance.id &&
    item.message.includes("JSON-compatible"),
  ));
  assert.throws(
    () => updateNativeComponentProperties(
      attached,
      "node-player",
      instance.id,
      { hp: Number.POSITIVE_INFINITY, armor: true, target: { nodeId: "node-enemy" } },
      context,
    ),
    /hp must be JSON-compatible/,
  );
  assert.deepEqual(findSceneNode(attached, "node-player")?.components[0]?.properties, { hp: 100, armor: false });
});

testCase("rejects component attachment when its manifest module has no validated schema", () => {
  assert.throws(
    () => attachNativeComponent(scene(), "node-player", "com.example.health", { project }),
    /no valid registered Component Schema/,
  );
});
