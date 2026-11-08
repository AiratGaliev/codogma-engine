import assert from "node:assert/strict";
import test from "node:test";
import {
  serializeComponentProperties,
  serializeSceneDocument,
  parseSceneDocument,
  validateComponentProperties,
  validateComponentPropertyValue,
  validateComponentTypeSchema,
  type ComponentTypeSchemaV1,
  type SceneDocumentV1,
} from "../src/index.js";

const schema: ComponentTypeSchemaV1 = {
  schemaVersion: 1,
  typeId: "com.codogma.follow-target",
  name: "Follow Target",
  version: "1.0.0",
  properties: {
    speed: { type: "number", min: 0, max: 900, defaultValue: 120, required: true },
    mode: { type: "enum", options: ["smooth", "instant"], defaultValue: "smooth" },
    enabled: { type: "boolean", defaultValue: true },
    texture: { type: "asset", assetKinds: ["image"] },
    target: { type: "node", allowSelf: false },
    inspectorExpanded: { type: "boolean", defaultValue: false, storage: "editorOnly" },
    runtimeValue: { type: "number", defaultValue: 0, storage: "runtime" },
  },
};

test("validates stable component type metadata", () => {
  assert.equal(validateComponentTypeSchema(schema).valid, true);
  assert.equal(validateComponentTypeSchema({ ...schema, schemaVersion: 2 }).valid, false);
  assert.equal(
    validateComponentTypeSchema({
      ...schema,
      properties: { mode: { type: "enum", options: [], defaultValue: "missing" } },
    }).valid,
    false,
  );
});

test("applies defaults and serializes only persisted fields", () => {
  const result = validateComponentProperties(schema, { inspectorExpanded: true, runtimeValue: 9 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, { speed: 120, mode: "smooth", enabled: true });
  const serialized = serializeComponentProperties(schema, {
    speed: 25,
    mode: "instant",
    inspectorExpanded: true,
    runtimeValue: 8,
  });
  assert.deepEqual(serialized, {
    speed: 25,
    mode: "instant",
    enabled: true,
  });
});

test("validates enum values, numeric bounds and required properties", () => {
  const result = validateComponentProperties(schema, { speed: 901, mode: "fast" });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.some((item) => item.propertyName === "speed"), true);
  assert.equal(result.diagnostics.some((item) => item.propertyName === "mode"), true);
  assert.equal(result.diagnostics.some((item) => item.code === "COMPONENT_REQUIRED_VALUE"), false);
});

test("validates resource and node references by stable ids", () => {
  const result = validateComponentProperties(schema, {
    speed: 100,
    texture: { assetId: "missing-image" },
    target: { nodeId: "missing-node" },
  }, {
    assets: new Map(),
    nodeIds: new Set(["node-1"]),
    ownerNodeId: "node-1",
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.filter((item) => item.code === "COMPONENT_INVALID_REFERENCE").length, 2);
});

test("validates Asset sub-resource policy and Node target kinds against Project/Scene contexts", () => {
  const referenceSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.reference-test",
    name: "Reference Test",
    version: "1.0.0",
    properties: {
      atlas: { type: "asset", assetKinds: ["other"], allowSubResource: true },
      target: { type: "node", nodeKinds: ["Image"], allowSelf: false },
    },
  };
  const assets = new Map([
    ["asset-atlas", { id: "asset-atlas", path: "assets/ui.json", kind: "other" as const, subResourceId: "frame-player" }],
  ]);
  const context = {
    assets,
    nodeIds: new Set(["node-owner", "node-image", "node-text"]),
    nodeKinds: new Map([
      ["node-owner", "Node" as const],
      ["node-image", "Image" as const],
      ["node-text", "Text" as const],
    ]),
    ownerNodeId: "node-owner",
  };

  const valid = validateComponentProperties(referenceSchema, {
    atlas: { assetId: "asset-atlas", subResourceId: "frame-player" },
    target: { nodeId: "node-image" },
  }, context);
  assert.equal(valid.valid, true);

  const invalidSubResource = validateComponentProperties(referenceSchema, {
    atlas: { assetId: "asset-atlas", subResourceId: "frame-missing" },
    target: { nodeId: "node-image" },
  }, context);
  const invalidTargetKind = validateComponentProperties(referenceSchema, {
    atlas: { assetId: "asset-atlas", subResourceId: "frame-player" },
    target: { nodeId: "node-text" },
  }, context);
  const disallowedSubResource = validateComponentProperties({
    ...referenceSchema,
    properties: { ...referenceSchema.properties, atlas: { type: "asset", assetKinds: ["other"] } },
  }, {
    atlas: { assetId: "asset-atlas", subResourceId: "frame-player" },
  }, context);
  assert.equal(invalidSubResource.valid, false);
  assert.equal(invalidTargetKind.valid, false);
  assert.equal(disallowedSubResource.valid, false);
});

test("round-trips Scene component values using the same schema and stable resource references", () => {
  const assets = new Map([
    ["image-player", { id: "image-player", path: "assets/player.png", kind: "image" as const }],
  ]);
  const context = {
    assets,
    componentSchemas: new Map([[schema.typeId, schema]]),
    registeredComponentTypes: new Set([schema.typeId]),
  };
  const scene: SceneDocumentV1 = {
    schemaVersion: 1,
    id: "scene-1",
    name: "Level",
    settings: {},
    rootNodes: [
      {
        id: "node-player",
        name: "Player",
        active: true,
        transform: { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [{
          id: "component-follow",
          typeId: schema.typeId,
          schemaVersion: 1,
          enabled: true,
          properties: {
            speed: 150,
            mode: "instant",
            texture: { assetId: "image-player" },
            target: { nodeId: "node-enemy" },
          },
        }],
        children: [],
      },
      {
        id: "node-enemy",
        name: "Enemy",
        active: true,
        transform: { x: 40, y: 50, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [],
        children: [],
      },
    ],
  };

  const serialized = serializeSceneDocument(scene, context);
  const parsed = parseSceneDocument(serialized, context);
  assert.equal(parsed.value !== undefined, true);
  const player = parsed.value?.rootNodes[0];
  assert.deepEqual(player?.components[0]?.properties, {
    speed: 150,
    mode: "instant",
    enabled: true,
    texture: { assetId: "image-player" },
    target: { nodeId: "node-enemy" },
  });
});

test("rejects malformed type-specific metadata instead of silently ignoring it", () => {
  const invalidNumber = validateComponentTypeSchema({
    schemaVersion: 1,
    typeId: "com.codogma.invalid-number",
    name: "Invalid Number",
    version: "1.0.0",
    properties: { value: { type: "number", integer: "yes" } },
  });
  const invalidString = validateComponentTypeSchema({
    schemaVersion: 1,
    typeId: "com.codogma.invalid-string",
    name: "Invalid String",
    version: "1.0.0",
    properties: { value: { type: "string", minLength: 8, maxLength: 2, pattern: 42 } },
  });
  const invalidNode = validateComponentTypeSchema({
    schemaVersion: 1,
    typeId: "com.codogma.invalid-node",
    name: "Invalid Node",
    version: "1.0.0",
    properties: { target: { type: "node", allowSelf: "false" } },
  });

  const invalidAsset = validateComponentTypeSchema({
    schemaVersion: 1,
    typeId: "com.codogma.invalid-asset",
    name: "Invalid Asset",
    version: "1.0.0",
    properties: { texture: { type: "asset", allowSubResource: "yes" } },
  });
  const invalidNodeKinds = validateComponentTypeSchema({
    schemaVersion: 1,
    typeId: "com.codogma.invalid-node-kinds",
    name: "Invalid Node Kinds",
    version: "1.0.0",
    properties: { target: { type: "node", nodeKinds: ["Image", "Image"] } },
  });

  assert.equal(invalidNumber.valid, false);
  assert.equal(invalidString.valid, false);
  assert.equal(invalidNode.valid, false);
  assert.equal(invalidAsset.valid, false);
  assert.equal(invalidNodeKinds.valid, false);
});

test("preserves undeclared JSON Component properties as forward-compatible extension values", () => {
  const result = validateComponentProperties(schema, {
    speed: 10,
    undeclaredPluginValue: { keep: true },
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    speed: 10,
    mode: "smooth",
    enabled: true,
    undeclaredPluginValue: { keep: true },
  });
  assert.ok(result.diagnostics.some((item) =>
    item.code === "COMPONENT_UNKNOWN_PROPERTY" &&
    item.propertyName === "undeclaredPluginValue" &&
    item.severity === "warning",
  ));
});

test("rejects unknown Component schema envelope and property-schema fields", () => {
  const unknownEnvelope = validateComponentTypeSchema({ ...schema, legacyType: "old-component-contract" });
  const unknownProperty = validateComponentTypeSchema({
    ...schema,
    properties: { ...schema.properties, speed: { ...schema.properties.speed, defValue: 120 } },
  });
  assert.equal(unknownEnvelope.valid, false);
  assert.equal(unknownProperty.valid, false);
  assert.ok(unknownEnvelope.diagnostics.some((item) => item.code === "COMPONENT_INVALID_SCHEMA"));
  assert.ok(unknownProperty.diagnostics.some((item) => item.code === "COMPONENT_INVALID_SCHEMA"));
});

test("preserves undeclared __proto__ data without changing object prototypes", () => {
  const input = JSON.parse('{"__proto__":{"future":true}}') as Record<string, unknown>;
  const result = validateComponentProperties(schema, input);
  assert.equal(result.valid, true);
  assert.ok(result.value);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value, "__proto__"), true);
  assert.deepEqual(result.value["__proto__"], { future: true });
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "future"), false);
});

test("rejects undeclared fields inside typed Asset and Node references", () => {
  const asset = validateComponentPropertyValue(schema, "texture", {
    assetId: "image-player",
    unexpected: true,
  });
  const node = validateComponentPropertyValue(schema, "target", {
    nodeId: "node-enemy",
    unexpected: true,
  });

  assert.equal(asset.valid, false);
  assert.equal(node.valid, false);
  assert.match(asset.diagnostics[0]?.message ?? "", /only assetId and optional subResourceId/);
  assert.match(node.diagnostics[0]?.message ?? "", /only nodeId/);
});

test("rejects non-JSON values for typed property validation with diagnostics", () => {
  const nonJsonProperties = validateComponentProperties(schema, new Date());
  assert.equal(nonJsonProperties.valid, false);
  assert.equal(nonJsonProperties.diagnostics[0]?.code, "COMPONENT_INVALID_VALUE");

  const assetLikeDate = Object.assign(new Date(), { assetId: "image-player" });
  const assetValue = validateComponentPropertyValue(schema, "texture", assetLikeDate);
  assert.equal(assetValue.valid, false);
  assert.equal(assetValue.diagnostics[0]?.code, "COMPONENT_INVALID_VALUE");
  assert.match(assetValue.diagnostics[0]?.message ?? "", /JSON-compatible/);
});
