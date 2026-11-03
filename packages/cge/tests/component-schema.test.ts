import assert from "node:assert/strict";
import test from "node:test";
import {
  serializeComponentProperties,
  validateComponentProperties,
  validateComponentTypeSchema,
  type ComponentTypeSchemaV1,
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
    futureProperty: "preserved",
  });
  assert.deepEqual(serialized, {
    speed: 25,
    mode: "instant",
    enabled: true,
    futureProperty: "preserved",
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
