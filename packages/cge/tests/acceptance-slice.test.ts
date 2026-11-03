import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  parseProjectDocument,
  parseSceneDocument,
  serializeSceneDocument,
  validateComponentTypeSchema,
  validateProjectDocument,
  type ComponentTypeSchemaV1,
  type SceneDocumentV1,
} from "../src/index.js";

const fixtures = resolve(process.cwd(), "tests/fixtures");
const readFixture = (name: string): string =>
  readFileSync(resolve(fixtures, name), "utf8");

const componentSchema: ComponentTypeSchemaV1 = {
  schemaVersion: 1,
  typeId: "com.codogma.acceptance.follow-target",
  name: "Follow Target",
  version: "1.0.0",
  properties: {
    sprite: { type: "asset", assetKinds: ["image"], required: true },
    target: { type: "node", allowSelf: false, required: true },
    speed: { type: "number", min: 0, defaultValue: 1 },
  },
};

function loadContext() {
  const project = parseProjectDocument(readFixture("acceptance-project-v1.json"));
  assert.ok(project.value);
  const assets = new Map(project.value.assets.map((asset) => [asset.id, asset] as const));
  return {
    project,
    context: {
      assets,
      componentSchemas: new Map([[componentSchema.typeId, componentSchema]]),
      registeredComponentTypes: new Set([componentSchema.typeId]),
    },
  };
}

function cloneScene(scene: SceneDocumentV1): SceneDocumentV1 {
  return JSON.parse(JSON.stringify(scene)) as SceneDocumentV1;
}

test("acceptance fixture connects Project, Scene, module identity and two component instances", () => {
  const { project, context } = loadContext();
  assert.equal(project.value?.componentModules[0]?.typeId, componentSchema.typeId);
  assert.match(readFixture("FollowTarget.ts"), /com\.codogma\.acceptance\.follow-target/);
  assert.equal(
    project.value?.assets.find((asset) => asset.id === project.value?.componentModules[0]?.moduleAssetId)?.kind,
    "script",
  );

  const scene = parseSceneDocument(readFixture("acceptance-scene-v1.json"), context);
  assert.ok(scene.value);
  assert.equal(scene.value.rootNodes.length, 2);

  const first = scene.value.rootNodes[0];
  const second = scene.value.rootNodes[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.components[0]?.typeId, componentSchema.typeId);
  assert.equal(second.components[0]?.typeId, componentSchema.typeId);
  assert.notEqual(first.components[0]?.id, second.components[0]?.id);
  assert.deepEqual(first.components[0]?.properties.target, { nodeId: second.id });
  assert.deepEqual(second.components[0]?.properties.target, { nodeId: first.id });

  const serialized = serializeSceneDocument(scene.value, context);
  const reopened = parseSceneDocument(serialized, context);
  assert.ok(reopened.value);
  assert.deepEqual(reopened.value, scene.value);
  assert.deepEqual((reopened.value as unknown as Record<string, unknown>).unknownSceneData, { retained: true });
  assert.deepEqual(
    reopened.value.rootNodes[0]?.components[0]?.properties.pluginExtension,
    { retained: true },
  );
  assert.deepEqual((reopened.value.rootNodes[0] as unknown as Record<string, unknown>)?.unknownNodeData, { retained: ["one", "two"] });
});

test("negative fixture vectors produce structured Project and Scene diagnostics", () => {
  const negative = JSON.parse(readFixture("acceptance-negative-cases.json")) as {
    brokenAssetId: string;
    brokenNodeId: string;
    duplicateComponentId: string;
    duplicateNodeId: string;
    unknownComponentTypeId: string;
    missingScriptAssetId: string;
    unsupportedProjectVersion: number;
  };
  const { project, context } = loadContext();
  const sourceScene = parseSceneDocument(readFixture("acceptance-scene-v1.json"), context);
  assert.ok(sourceScene.value);

  const brokenAsset = cloneScene(sourceScene.value);
  const assetValue = brokenAsset.rootNodes[0]?.components[0]?.properties.sprite as { assetId: string };
  assetValue.assetId = negative.brokenAssetId;
  assert.equal(
    parseSceneDocument(JSON.stringify(brokenAsset), context).diagnostics.some((item) => item.code === "COMPONENT_INVALID_REFERENCE"),
    true,
  );

  const brokenNode = cloneScene(sourceScene.value);
  const nodeValue = brokenNode.rootNodes[0]?.components[0]?.properties.target as { nodeId: string };
  nodeValue.nodeId = negative.brokenNodeId;
  assert.equal(
    parseSceneDocument(JSON.stringify(brokenNode), context).diagnostics.some((item) => item.code === "COMPONENT_INVALID_REFERENCE"),
    true,
  );

  const duplicateComponent = cloneScene(sourceScene.value);
  const firstComponent = duplicateComponent.rootNodes[0]?.components[0];
  const secondComponent = duplicateComponent.rootNodes[1]?.components[0];
  assert.ok(firstComponent);
  assert.ok(secondComponent);
  secondComponent.id = negative.duplicateComponentId;
  assert.equal(
    parseSceneDocument(JSON.stringify(duplicateComponent), context).diagnostics.some((item) => item.code === "COMPONENT_DUPLICATE_INSTANCE"),
    true,
  );

  const duplicateNode = cloneScene(sourceScene.value);
  const secondNode = duplicateNode.rootNodes[1];
  assert.ok(secondNode);
  secondNode.id = negative.duplicateNodeId;
  assert.equal(
    parseSceneDocument(JSON.stringify(duplicateNode), context).diagnostics.some((item) => item.code === "SCENE_DUPLICATE_ID"),
    true,
  );

  const unknownType = cloneScene(sourceScene.value);
  const unknownComponent = unknownType.rootNodes[1]?.components[0];
  assert.ok(unknownComponent);
  unknownComponent.typeId = negative.unknownComponentTypeId;
  assert.equal(
    parseSceneDocument(JSON.stringify(unknownType), context).diagnostics.some((item) => item.code === "COMPONENT_UNKNOWN_TYPE"),
    true,
  );

  const projectWithoutModule = {
    ...project.value,
    assets: project.value.assets.filter((asset) => asset.id !== negative.missingScriptAssetId),
  };
  assert.equal(
    validateProjectDocument(projectWithoutModule).diagnostics.some((item) => item.code === "PROJECT_INVALID_REFERENCE"),
    true,
  );

  assert.equal(
    parseProjectDocument(JSON.stringify({
      ...project.value,
      schemaVersion: negative.unsupportedProjectVersion,
    })).diagnostics.some((item) => item.code === "PROJECT_UNSUPPORTED_VERSION"),
    true,
  );
});

test("acceptance schema rejects contradictory property constraints", () => {
  const invalid = validateComponentTypeSchema({
    ...componentSchema,
    properties: {
      speed: { type: "number", min: 5, max: 1 },
    },
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.diagnostics.some((item) => item.code === "COMPONENT_INVALID_SCHEMA"), true);
});
