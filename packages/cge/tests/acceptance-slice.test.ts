import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import test from "node:test";
import {
  ComponentRegistry,
  parseProjectDocument,
  parseSceneDocument,
  serializeComponentProperties,
  serializeProjectDocument,
  serializeSceneDocument,
  validateComponentTypeSchema,
  validateProjectDocument,
  type ComponentTypeDefinition,
  type ComponentTypeSchemaV1,
  type SceneDocumentV1,
} from "../src/index.js";
import {
  componentDefinition as followTargetDefinition,
  moduleVersion as followTargetModuleVersion,
} from "./fixtures/acceptance-project/src/FollowTarget.js";

const fixtures = resolve(process.cwd(), "tests/fixtures");
const projectRoot = resolve(fixtures, "acceptance-project");
const componentDefinition: ComponentTypeDefinition = followTargetDefinition;
const componentSchema: ComponentTypeSchemaV1 = componentDefinition.schema;

const readFixture = (name: string): string =>
  readFileSync(resolve(fixtures, name), "utf8");

function readProjectAsset(relativePath: string): string {
  const absolutePath = resolve(projectRoot, relativePath);
  assert.ok(
    absolutePath.startsWith(projectRoot + sep),
    "Fixture asset paths must stay inside the acceptance project.",
  );
  return readFileSync(absolutePath, "utf8");
}

function loadContext() {
  const parsedProject = parseProjectDocument(readProjectAsset("project.json"));
  assert.ok(parsedProject.value);
  const project = parsedProject.value;
  const assets = new Map(project.assets.map((asset) => [asset.id, asset] as const));
  return {
    project,
    context: {
      assets,
      componentSchemas: new Map([[componentSchema.typeId, componentSchema]]),
      registeredComponentTypes: new Set([componentSchema.typeId]),
    },
  };
}

function loadScene(
  project: ReturnType<typeof loadContext>["project"],
  context: ReturnType<typeof loadContext>["context"],
) {
  const sceneAssetId = project.scenes[0]?.assetId;
  assert.ok(sceneAssetId);
  const sceneAsset = project.assets.find((asset) => asset.id === sceneAssetId);
  assert.ok(sceneAsset);
  assert.equal(sceneAsset.kind, "scene");
  return parseSceneDocument(readProjectAsset(sceneAsset.path), context);
}

function cloneScene(scene: SceneDocumentV1): SceneDocumentV1 {
  return JSON.parse(JSON.stringify(scene)) as SceneDocumentV1;
}

test("acceptance project is self-contained and declares a real Core component definition", () => {
  const { project } = loadContext();
  const moduleReference = project.componentModules[0];
  assert.ok(moduleReference);
  assert.equal(moduleReference.typeId, componentSchema.typeId);
  assert.equal(moduleReference.version, followTargetModuleVersion);
  assert.equal(componentSchema.version, moduleReference.version);
  assert.equal(componentSchema.schemaVersion, 1);

  const moduleAsset = project.assets.find((asset) => asset.id === moduleReference.moduleAssetId);
  assert.ok(moduleAsset);
  assert.equal(moduleAsset.kind, "script");
  assert.equal(moduleAsset.path, "src/FollowTarget.ts");
  assert.equal(readProjectAsset(moduleAsset.path).includes(componentSchema.typeId), true);

  const sceneAssetId = project.scenes[0]?.assetId;
  assert.ok(sceneAssetId);
  const sceneAsset = project.assets.find((asset) => asset.id === sceneAssetId);
  assert.ok(sceneAsset);
  assert.equal(sceneAsset.path, "scenes/Level.cge-scene.json");

  for (const asset of project.assets) {
    const assetPath = resolve(projectRoot, asset.path);
    assert.ok(assetPath.startsWith(projectRoot + sep), "Project asset must not escape the fixture root.");
    assert.equal(existsSync(assetPath), true, "Missing fixture asset: " + asset.path);
  }

  const registry = new ComponentRegistry();
  registry.register(componentDefinition);
  const registeredDefinition = registry.get(moduleReference.typeId);
  assert.ok(registeredDefinition);

  const createContext = (instanceId: string, nodeId: string) => ({
    instanceId,
    node: { id: nodeId, name: nodeId, active: true },
    properties: {},
  });
  const first = followTargetDefinition.create(createContext("component-first", "node-player"));
  const second = followTargetDefinition.create(createContext("component-second", "node-enemy"));
  first.onUpdate?.(0.25);
  assert.equal(first.instanceId, "component-first");
  assert.equal(second.instanceId, "component-second");
  assert.equal(first.elapsedSeconds, 0.25);
  assert.equal(second.elapsedSeconds, 0);
  assert.notEqual(first, second);
});

test("acceptance fixture connects Project, Scene, module identity and two component instances", () => {
  const { project, context } = loadContext();
  const scene = loadScene(project, context);
  assert.ok(scene.value);
  assert.equal(scene.value.rootNodes.length, 2);

  const first = scene.value.rootNodes[0];
  const second = scene.value.rootNodes[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.id, "node-player");
  assert.equal(second.id, "node-enemy");
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
  assert.deepEqual(
    (reopened.value.rootNodes[0] as unknown as Record<string, unknown>)?.unknownNodeData,
    { retained: ["one", "two"] },
  );

  const serializedProject = serializeProjectDocument(project);
  const reopenedProject = parseProjectDocument(serializedProject);
  assert.ok(reopenedProject.value);
  assert.deepEqual(
    (reopenedProject.value as unknown as Record<string, unknown>).unknownPluginData,
    { keep: true },
  );
});

test("component property serialization keeps persisted extensions and omits editor/runtime state", () => {
  const { context } = loadContext();
  const serialized = serializeComponentProperties(
    componentSchema,
    {
      sprite: { assetId: "asset-player-sprite" },
      target: { nodeId: "node-enemy" },
      speed: 3,
      editorLabel: "Selected in Inspector",
      runtimeElapsedSeconds: 12,
      pluginExtension: { retained: true },
    },
    {
      assets: context.assets,
      nodeIds: new Set(["node-player", "node-enemy"]),
      ownerNodeId: "node-player",
    },
  );

  assert.deepEqual(serialized, {
    sprite: { assetId: "asset-player-sprite" },
    target: { nodeId: "node-enemy" },
    speed: 3,
    pluginExtension: { retained: true },
  });
});

test("negative fixture vectors produce structured Project and Scene diagnostics", () => {
  const negative = JSON.parse(readFixture("acceptance-negative-cases.json")) as {
    brokenAssetId: string;
    brokenNodeId: string;
    duplicateComponentId: string;
    duplicateNodeId: string;
    unknownComponentTypeId: string;
    missingScriptAssetId: string;
    missingModuleTypeId: string;
    invalidComponentSchema: unknown;
    invalidPropertyValue: { property: string; value: number };
    incompatibleComponentSchemaVersion: number;
    unsupportedProjectVersion: number;
  };
  const { project, context } = loadContext();
  const sourceScene = loadScene(project, context);
  assert.ok(sourceScene.value);

  const brokenAsset = cloneScene(sourceScene.value);
  const assetValue = brokenAsset.rootNodes[0]?.components[0]?.properties.sprite as { assetId: string };
  assert.ok(assetValue);
  assetValue.assetId = negative.brokenAssetId;
  assert.equal(
    parseSceneDocument(JSON.stringify(brokenAsset), context).diagnostics.some((item) => item.code === "COMPONENT_INVALID_REFERENCE"),
    true,
  );

  const brokenNode = cloneScene(sourceScene.value);
  const nodeValue = brokenNode.rootNodes[0]?.components[0]?.properties.target as { nodeId: string };
  assert.ok(nodeValue);
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

  const projectWithoutModule = { ...project, componentModules: [] };
  assert.equal(validateProjectDocument(projectWithoutModule).valid, true);
  assert.equal(
    projectWithoutModule.componentModules.some((module) => module.typeId === negative.missingModuleTypeId),
    false,
  );
  const missingModuleScene = cloneScene(sourceScene.value);
  const missingModuleComponent = missingModuleScene.rootNodes[0]?.components[0];
  assert.ok(missingModuleComponent);
  missingModuleComponent.typeId = negative.missingModuleTypeId;
  assert.equal(
    parseSceneDocument(JSON.stringify(missingModuleScene), {
      assets: context.assets,
      componentSchemas: new Map<string, ComponentTypeSchemaV1>(),
      registeredComponentTypes: new Set<string>(),
    }).diagnostics.some((item) => item.code === "COMPONENT_UNKNOWN_TYPE"),
    true,
  );

  const projectWithoutModuleAsset = {
    ...project,
    assets: project.assets.filter((asset) => asset.id !== negative.missingScriptAssetId),
  };
  assert.equal(
    validateProjectDocument(projectWithoutModuleAsset).diagnostics.some((item) => item.code === "PROJECT_INVALID_REFERENCE"),
    true,
  );

  const invalidSchema = validateComponentTypeSchema(negative.invalidComponentSchema);
  assert.equal(invalidSchema.valid, false);
  assert.equal(invalidSchema.diagnostics.some((item) => item.code === "COMPONENT_INVALID_SCHEMA"), true);

  const invalidProperty = cloneScene(sourceScene.value);
  const firstPropertyComponent = invalidProperty.rootNodes[0]?.components[0];
  assert.ok(firstPropertyComponent);
  firstPropertyComponent.properties[negative.invalidPropertyValue.property] = negative.invalidPropertyValue.value;
  assert.equal(
    parseSceneDocument(JSON.stringify(invalidProperty), context).diagnostics.some((item) => item.code === "COMPONENT_INVALID_VALUE"),
    true,
  );

  const incompatibleSchema = cloneScene(sourceScene.value);
  const incompatibleComponent = incompatibleSchema.rootNodes[0]?.components[0];
  assert.ok(incompatibleComponent);
  incompatibleComponent.schemaVersion = negative.incompatibleComponentSchemaVersion;
  assert.equal(
    parseSceneDocument(JSON.stringify(incompatibleSchema), context).diagnostics.some((item) => item.code === "COMPONENT_INVALID_SCHEMA"),
    true,
  );

  assert.equal(
    parseProjectDocument(JSON.stringify({
      ...project,
      schemaVersion: negative.unsupportedProjectVersion,
    })).diagnostics.some((item) => item.code === "PROJECT_UNSUPPORTED_VERSION"),
    true,
  );
});
