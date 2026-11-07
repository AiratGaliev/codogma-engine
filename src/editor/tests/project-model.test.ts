import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test as testCase } from "vitest";
import { reparentSceneNode, getSceneNodeEntries, findSceneNode, createSceneNode } from "../src/domain/scene-model.js";
import { setNativeComponentEnabled } from "../src/domain/components-model.js";
import {
  addNativePrefabInstance,
  addNativePrefabOverride,
  resolveNativePrefabRoot,
} from "../src/domain/prefab-model.js";
import { addNativeNodeFx, getNativeNodeEffects, updateNativeNodeFx } from "../src/domain/fx-model.js";
import {
  addNativePrefabReference,
  createNativeSceneDocument,
  registerNativeScene,
  findPrefabReferenceByAssetPath,
  findSceneReferenceByAssetPath,
  getNativeScriptModules,
  parseNativePrefabDocument,
  parseNativeProjectDocument,
  parseNativeSceneDocument,
  serializeNativePrefabDocument,
  resolvePrefabAsset,
  resolveSceneAsset,
  serializeNativeSceneDocument,
} from "../src/domain/project-model.js";

const fixtureRoot = resolve(process.cwd(), "../../packages/cge/tests/fixtures/acceptance-project");
const project = parseNativeProjectDocument(readFileSync(resolve(fixtureRoot, "project.json"), "utf8"));
const sceneContent = readFileSync(resolve(fixtureRoot, "scenes/Level.cge-scene.json"), "utf8");

testCase("loads the native project manifest and resolves scene, script and asset references by stable ids", () => {
  assert.equal(resolveSceneAsset(project, "scene-level").path, "scenes/Level.cge-scene.json");
  assert.equal(resolveSceneAsset(project, "scene-level").kind, "scene");
  assert.deepEqual(getNativeScriptModules(project), [{
    typeId: "com.codogma.acceptance.follow-target",
    version: "1.0.0",
    assetId: "asset-follow-target-module",
    path: "src/FollowTarget.ts",
  }]);
  assert.equal(findSceneReferenceByAssetPath(project, "scenes/Level.cge-scene.json")?.id, "scene-level");
  assert.equal(findSceneReferenceByAssetPath(project, "scenes/level.scene"), undefined);
});

testCase("parses and serializes the native Scene contract without changing manifest identity", () => {
  const scene = parseNativeSceneDocument(project, "scene-level", sceneContent);
  assert.equal(scene.schemaVersion, 1);
  assert.equal(scene.id, "scene-level");
  assert.equal(scene.rootNodes[0]?.id, "node-player");
  assert.equal(JSON.parse(serializeNativeSceneDocument(project, scene)).id, "scene-level");
});

testCase("rejects unpublished or unsupported document shapes at the native boundary", () => {
  assert.throws(() => parseNativeProjectDocument(JSON.stringify({
    id: "old",
    name: "Old",
    scenes: [],
    assets: [],
    prefabs: [],
    componentModules: [],
    runtime: { adapterId: "phaser", settings: {} },
    displayList: [],
  })), /schema version undefined is not supported/);

  assert.throws(() => parseNativeSceneDocument(project, "scene-level", JSON.stringify({
    id: "scene-level",
    sceneType: "SCENE",
    displayList: [],
    plainObjects: [],
  })), /schema version undefined is not supported/);
  assert.throws(() => parseNativeSceneDocument(project, "missing-scene", sceneContent), /not registered in project.json/);
});

testCase("accepts only built-in renderer/FX types and Project-registered script component types", () => {
  const document = JSON.parse(sceneContent) as Record<string, any>;
  const player = document.rootNodes[0];
  assert.ok(player);
  player.components.push({
    id: "component-native-image",
    typeId: "com.codogma.renderer.image",
    schemaVersion: 1,
    enabled: true,
    properties: { assetId: "asset-player-sprite" },
  });
  player.components.push({
    id: "component-native-bloom",
    typeId: "com.codogma.fx.bloom",
    schemaVersion: 1,
    enabled: true,
    properties: { threshold: 0.5 },
  });
  assert.doesNotThrow(() => parseNativeSceneDocument(project, "scene-level", JSON.stringify(document)));

  player.components.push({
    id: "component-unregistered",
    typeId: "com.example.unregistered",
    schemaVersion: 1,
    enabled: true,
    properties: {},
  });
  assert.throws(
    () => parseNativeSceneDocument(project, "scene-level", JSON.stringify(document)),
    /Component type com\.example\.unregistered is not registered/,
  );
});

testCase("rejects mismatched manifest identity and non-native file extension", () => {
  assert.throws(() => parseNativeSceneDocument(project, "scene-level", sceneContent.replace('"scene-level"', '"another-scene"')), /does not match document id/);
  const wrongExtensionProject = {
    ...project,
    assets: project.assets.map((asset) => asset.id === "asset-scene-level"
      ? { ...asset, path: "scenes/Level.scene" }
      : asset),
  };
  assert.throws(() => parseNativeSceneDocument(wrongExtensionProject, "scene-level", sceneContent), /must use the native/);
});

testCase("registers a native Prefab asset only through a validated Project manifest reference", () => {
  const prefab = {
    schemaVersion: 1 as const,
    id: "prefab-crate",
    name: "Crate",
    root: {
      id: "node-crate",
      name: "Crate",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    },
  };
  const next = addNativePrefabReference(project, prefab, "asset-prefab-crate", "prefabs/Crate.cge-prefab.json");
  assert.equal(resolvePrefabAsset(next, "prefab-crate").path, "prefabs/Crate.cge-prefab.json");
  assert.equal(findPrefabReferenceByAssetPath(next, "prefabs/Crate.cge-prefab.json")?.id, "prefab-crate");
  assert.throws(() => parseNativePrefabDocument(next, "prefab-crate", JSON.stringify({
    ...prefab,
    schemaVersion: 2,
  })), /not supported/);
  assert.throws(() => addNativePrefabReference(project, prefab, "asset-prefab-crate", "prefabs/Crate.scene"), /relative/);
  for (const path of [
    "/prefabs/Crate.cge-prefab.json",
    "../prefabs/Crate.cge-prefab.json",
    "prefabs/../Crate.cge-prefab.json",
    "prefabs/./Crate.cge-prefab.json",
    "prefabs\\Crate.cge-prefab.json",
  ]) {
    assert.throws(() => addNativePrefabReference(project, prefab, "asset-prefab-safe", path), /relative/);
  }
});

testCase("does not duplicate an asset path or stable asset id while adding a Prefab", () => {
  const prefab = {
    schemaVersion: 1 as const,
    id: "prefab-another",
    name: "Another",
    root: {
      id: "node-another",
      name: "Another",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    },
  };
  assert.throws(() => addNativePrefabReference(project, prefab, "asset-scene-level", "prefabs/Another.cge-prefab.json"), /already registered/);
  const projectWithExistingPrefabPath = {
    ...project,
    assets: [...project.assets, { id: "asset-existing-prefab", path: "prefabs/Existing.cge-prefab.json", kind: "other" as const }],
  };
  assert.throws(() => addNativePrefabReference(projectWithExistingPrefabPath, prefab, "asset-new", "prefabs/Existing.cge-prefab.json"), /already registered/);
});


testCase("creates and registers a native Scene using one Project v1 asset/reference pair", () => {
  const scene = createNativeSceneDocument("  MCP-created Scene  ");
  assert.equal(scene.schemaVersion, 1);
  assert.equal(scene.name, "MCP-created Scene");
  assert.deepEqual(scene.rootNodes, []);
  const next = registerNativeScene(project, scene, "asset-scene-mcp-created", "scenes/McpCreated.cge-scene.json");
  assert.equal(resolveSceneAsset(next, scene.id).path, "scenes/McpCreated.cge-scene.json");
  assert.equal(findSceneReferenceByAssetPath(next, "scenes/McpCreated.cge-scene.json")?.id, scene.id);
});

testCase("rejects invalid or duplicate native Scene asset registration", () => {
  const scene = createNativeSceneDocument("Duplicate test");
  assert.throws(() => registerNativeScene(project, scene, "asset-scene-level", "scenes/Another.cge-scene.json"), /already registered/);
  assert.throws(() => registerNativeScene(project, scene, "asset-scene-new", "scenes/Level.cge-scene.json"), /already registered/);
  assert.throws(() => registerNativeScene(project, scene, "asset-scene-new", "scenes/Another.scene"), /relative .+ path/);
  assert.throws(() => createNativeSceneDocument("   "), /must be non-empty/);
});

testCase("round-trips a native Prefab with child Nodes through its registered Project asset", () => {
  const prefab = {
    schemaVersion: 1 as const,
    id: "prefab-with-children",
    name: "Parent Prefab",
    root: {
      id: "node-prefab-root",
      name: "Parent",
      active: true,
      transform: { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [{
        id: "node-prefab-child",
        name: "Child",
        active: true,
        transform: { x: 5, y: 6, rotation: 15, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [{
          id: "component-prefab-child-image",
          typeId: "com.codogma.renderer.image",
          schemaVersion: 1,
          enabled: true,
          properties: { assetId: "asset-player-sprite" },
        }],
        children: [],
      }],
    },
  };
  const registeredProject = addNativePrefabReference(
    project,
    prefab,
    "asset-prefab-with-children",
    "prefabs/Parent.cge-prefab.json",
  );
  const content = serializeNativePrefabDocument(registeredProject, prefab);
  const reopened = parseNativePrefabDocument(registeredProject, prefab.id, content);

  assert.deepEqual(reopened, prefab);
  assert.equal(reopened.root.children[0]?.id, "node-prefab-child");
  assert.equal(reopened.root.children[0]?.components[0]?.properties.assetId, "asset-player-sprite");

  let sceneWithPrefab = parseNativeSceneDocument(registeredProject, "scene-level", sceneContent);
  sceneWithPrefab = addNativePrefabInstance(sceneWithPrefab, prefab);
  const instance = sceneWithPrefab.rootNodes.at(-1);
  assert.ok(instance);
  sceneWithPrefab = addNativePrefabOverride(sceneWithPrefab, instance.id, prefab, {
    targetNodeId: "node-prefab-child",
    propertyPath: "transform.x",
    value: 17,
  });

  const savedScene = serializeNativeSceneDocument(registeredProject, sceneWithPrefab);
  const reopenedScene = parseNativeSceneDocument(registeredProject, "scene-level", savedScene);
  const reopenedInstance = reopenedScene.rootNodes.at(-1);
  assert.ok(reopenedInstance?.prefabInstance);
  assert.equal(reopenedInstance.prefabInstance.prefabId, prefab.id);
  assert.equal(reopenedInstance.prefabInstance.sourceNodeId, prefab.root.id);
  assert.deepEqual(reopenedInstance.prefabInstance.overrides, [{
    targetNodeId: "node-prefab-child",
    propertyPath: "transform.x",
    value: 17,
  }]);
  assert.equal(resolveNativePrefabRoot(reopenedInstance, reopened).children[0]?.transform.x, 17);
});

testCase("round-trips native Scene edits across hierarchy, Component, FX and Asset references", () => {
  let edited = parseNativeSceneDocument(project, "scene-level", sceneContent);
  const playerComponent = edited.rootNodes[0]?.components[0];
  assert.ok(playerComponent);

  edited = setNativeComponentEnabled(edited, "node-player", playerComponent.id, false) as import("@codogma/cge").SceneDocumentV1;
  edited = createSceneNode(edited, "Image", "asset-player-sprite") as import("@codogma/cge").SceneDocumentV1;
  const imageNode = edited.rootNodes.at(-1);
  assert.ok(imageNode);

  edited = reparentSceneNode(edited, imageNode.id, "node-player") as import("@codogma/cge").SceneDocumentV1;
  edited = addNativeNodeFx(edited, imageNode.id, "Bloom") as import("@codogma/cge").SceneDocumentV1;
  const bloom = getNativeNodeEffects(findSceneNode(edited, imageNode.id)!)[0];
  assert.ok(bloom);
  edited = updateNativeNodeFx(edited, imageNode.id, bloom.id, {
    threshold: 0.75,
    blurSteps: 8,
  }) as import("@codogma/cge").SceneDocumentV1;

  const serialized = serializeNativeSceneDocument(project, edited);
  const reopened = parseNativeSceneDocument(project, "scene-level", serialized);
  const reopenedPlayer = findSceneNode(reopened, "node-player");
  const reopenedImage = findSceneNode(reopened, imageNode.id);
  const reopenedModule = reopenedPlayer?.components.find((component) => component.id === playerComponent.id);
  const reopenedRenderer = reopenedImage?.components.find((component) => component.typeId === "com.codogma.renderer.image");
  const reopenedBloom = getNativeNodeEffects(reopenedImage!)[0];

  assert.equal(reopenedModule?.enabled, false);
  assert.equal(reopenedModule?.properties.speed, 4);
  assert.deepEqual(reopenedModule?.properties.pluginExtension, { retained: true });
  assert.equal(reopenedImage?.id, imageNode.id);
  assert.equal(reopenedRenderer?.properties.assetId, "asset-player-sprite");
  assert.equal(getSceneNodeEntries(reopened).find((entry) => entry.id === imageNode.id)?.parentId, "node-player");
  assert.equal(reopenedBloom?.id, bloom.id);
  const reopenedBloomSource = reopenedBloom?.source;
  assert.ok(reopenedBloomSource);
  if (reopenedBloomSource.type !== "Bloom") throw new Error("Expected the saved native FX component to remain Bloom.");
  assert.equal(reopenedBloomSource.threshold, 0.75);
  assert.equal(reopenedBloomSource.blurSteps, 8);
});

testCase("validates built-in Image Renderer Asset references for Scene and Prefab reads and writes", () => {
  const makeImageNode = (assetId: unknown) => ({
    id: "node-image-reference-check",
    name: "Image",
    active: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    components: [{
      id: "component-image-reference-check",
      typeId: "com.codogma.renderer.image",
      schemaVersion: 1,
      enabled: true,
      properties: { assetId },
    }],
    children: [],
  });

  for (const invalidAssetId of ["asset-does-not-exist", "asset-follow-target-module", 42, ""]) {
    const invalidScene = JSON.parse(sceneContent) as import("@codogma/cge").SceneDocumentV1;
    invalidScene.rootNodes.push(makeImageNode(invalidAssetId));
    assert.throws(
      () => serializeNativeSceneDocument(project, invalidScene),
      /Image Asset|Image Renderer assetId|expected "image"/,
    );
    assert.throws(
      () => parseNativeSceneDocument(project, "scene-level", JSON.stringify(invalidScene)),
      /Image Asset|Image Renderer assetId|expected "image"/,
    );

    const prefab = {
      schemaVersion: 1 as const,
      id: "prefab-image-reference-check",
      name: "Image Prefab",
      root: makeImageNode(invalidAssetId),
    };
    const registeredProject = addNativePrefabReference(
      project,
      prefab,
      "asset-prefab-image-reference-check",
      "prefabs/ImageReferenceCheck.cge-prefab.json",
    );
    assert.throws(
      () => serializeNativePrefabDocument(registeredProject, prefab),
      /Image Asset|Image Renderer assetId|expected "image"/,
    );
    assert.throws(
      () => parseNativePrefabDocument(registeredProject, prefab.id, JSON.stringify(prefab)),
      /Image Asset|Image Renderer assetId|expected "image"/,
    );
  }
});

testCase("rejects malformed persisted built-in FX properties at the native document boundary", () => {
  const imageNode = {
    id: "node-invalid-fx",
    name: "Image",
    active: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    components: [{
      id: "component-invalid-fx",
      typeId: "com.codogma.fx.bloom",
      schemaVersion: 1,
      enabled: true,
      properties: { threshold: 1.1 },
    }],
    children: [],
  };

  const invalidScene = JSON.parse(sceneContent) as import("@codogma/cge").SceneDocumentV1;
  invalidScene.rootNodes.push(imageNode);
  assert.throws(
    () => serializeNativeSceneDocument(project, invalidScene),
    /FX property "threshold".*at most 1/,
  );
  assert.throws(
    () => parseNativeSceneDocument(project, "scene-level", JSON.stringify(invalidScene)),
    /FX property "threshold".*at most 1/,
  );

  const prefab = {
    schemaVersion: 1 as const,
    id: "prefab-invalid-fx",
    name: "Invalid FX Prefab",
    root: imageNode,
  };
  const registeredProject = addNativePrefabReference(
    project,
    prefab,
    "asset-prefab-invalid-fx",
    "prefabs/InvalidFx.cge-prefab.json",
  );
  assert.throws(
    () => serializeNativePrefabDocument(registeredProject, prefab),
    /FX property "threshold".*at most 1/,
  );
  assert.throws(
    () => parseNativePrefabDocument(registeredProject, prefab.id, JSON.stringify(prefab)),
    /FX property "threshold".*at most 1/,
  );
});

testCase("runs Core safe-data validation before native Scene and Prefab traversal", () => {
  let getterCalls = 0;
  const unsafeScene = JSON.parse(sceneContent) as import("@codogma/cge").SceneDocumentV1;
  Object.defineProperty(unsafeScene.rootNodes[0]!, "components", {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    },
  });

  assert.throws(
    () => serializeNativeSceneDocument(project, unsafeScene),
    (error: unknown) => error instanceof Error && error.name === "ProjectSerializationError",
  );
  assert.equal(getterCalls, 0, "Scene components getter must not run before Core rejects the document");

  const unsafePrefab = {
    schemaVersion: 1 as const,
    id: "prefab-unsafe-data",
    name: "Unsafe Prefab",
    root: JSON.parse(sceneContent).rootNodes[0] as import("@codogma/cge").NodeDocument,
  };
  const registeredProject = addNativePrefabReference(
    project,
    unsafePrefab,
    "asset-prefab-unsafe-data",
    "prefabs/UnsafeData.cge-prefab.json",
  );
  Object.defineProperty(unsafePrefab.root, "components", {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    },
  });

  assert.throws(
    () => serializeNativePrefabDocument(registeredProject, unsafePrefab),
    (error: unknown) => error instanceof Error && error.name === "ProjectSerializationError",
  );
  assert.equal(getterCalls, 0, "Prefab components getter must not run before Core rejects the document");
});

testCase("validates built-in Image and FX values after applying native Prefab component overrides", () => {
  const imagePrefab = {
    schemaVersion: 1 as const,
    id: "prefab-image-override",
    name: "Image Prefab",
    root: {
      id: "node-image-prefab",
      name: "Image",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "component-image-prefab",
        typeId: "com.codogma.renderer.image",
        schemaVersion: 1,
        enabled: true,
        properties: { assetId: "asset-player-sprite" },
      }],
      children: [],
    },
  };
  const registeredImageProject = addNativePrefabReference(project, imagePrefab, "asset-prefab-image-override", "prefabs/ImageOverride.cge-prefab.json");
  const baseImageScene = parseNativeSceneDocument(registeredImageProject, "scene-level", sceneContent, [imagePrefab]);
  const sceneWithImagePrefab = addNativePrefabInstance(baseImageScene, imagePrefab);
  const imageInstance = sceneWithImagePrefab.rootNodes.at(-1)!;
  const invalidImageOverride = addNativePrefabOverride(sceneWithImagePrefab, imageInstance.id, imagePrefab, {
    targetNodeId: "node-image-prefab",
    targetComponentId: "component-image-prefab",
    propertyPath: "assetId",
    value: "asset-not-registered",
  });
  assert.throws(
    () => serializeNativeSceneDocument(registeredImageProject, invalidImageOverride, [imagePrefab]),
    /Image Asset "asset-not-registered" is not registered/,
  );
  assert.throws(
    () => parseNativeSceneDocument(registeredImageProject, "scene-level", JSON.stringify(invalidImageOverride), [imagePrefab]),
    /Image Asset "asset-not-registered" is not registered/,
  );

  const fxPrefab = {
    schemaVersion: 1 as const,
    id: "prefab-fx-override",
    name: "FX Prefab",
    root: {
      id: "node-fx-prefab",
      name: "FX",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "component-fx-prefab",
        typeId: "com.codogma.fx.bloom",
        schemaVersion: 1,
        enabled: true,
        properties: { threshold: 0.5 },
      }],
      children: [],
    },
  };
  const registeredFxProject = addNativePrefabReference(project, fxPrefab, "asset-prefab-fx-override", "prefabs/FxOverride.cge-prefab.json");
  const baseFxScene = parseNativeSceneDocument(registeredFxProject, "scene-level", sceneContent, [fxPrefab]);
  const sceneWithFxPrefab = addNativePrefabInstance(baseFxScene, fxPrefab);
  const fxInstance = sceneWithFxPrefab.rootNodes.at(-1)!;
  const invalidFxOverride = addNativePrefabOverride(sceneWithFxPrefab, fxInstance.id, fxPrefab, {
    targetNodeId: "node-fx-prefab",
    targetComponentId: "component-fx-prefab",
    propertyPath: "threshold",
    value: 1.2,
  });
  assert.throws(
    () => serializeNativeSceneDocument(registeredFxProject, invalidFxOverride, [fxPrefab]),
    /threshold.*at most 1/,
  );
});

testCase("rejects unsafe property path segments on native Prefab overrides", () => {
  const prefab = {
    schemaVersion: 1 as const,
    id: "prefab-safe-path",
    name: "Safe Path",
    root: {
      id: "node-safe-path",
      name: "Safe Path",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "component-safe-path",
        typeId: "com.codogma.renderer.image",
        schemaVersion: 1,
        enabled: true,
        properties: { assetId: "asset-player-sprite" },
      }],
      children: [],
    },
  };
  const registered = addNativePrefabReference(project, prefab, "asset-prefab-safe-path", "prefabs/SafePath.cge-prefab.json");
  const base = parseNativeSceneDocument(registered, "scene-level", sceneContent, [prefab]);
  const withInstance = addNativePrefabInstance(base, prefab);
  const instance = withInstance.rootNodes.at(-1)!;
  const invalid = {
    ...withInstance,
    rootNodes: withInstance.rootNodes.map((node) => node.id === instance.id
      ? {
          ...node,
          prefabInstance: {
            ...node.prefabInstance!,
            overrides: [{
              targetNodeId: "node-safe-path",
              targetComponentId: "component-safe-path",
              propertyPath: "__proto__.polluted",
              value: true,
            }],
          },
        }
      : node),
  } as SceneDocumentV1;
  assert.throws(
    () => serializeNativeSceneDocument(registered, invalid, [prefab]),
    /safe identifier segments/,
  );
});
