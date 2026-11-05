import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  LegacyProjectMigrationError,
  migrateLegacyPrefabDocument,
  migrateLegacySceneDocument,
  migrateSceneDocument,
  migratePrefabDocument,
  legacyComponentInstanceKey,
  parsePrefabDocument,
  parseSceneDocument,
  serializePrefabDocument,
  serializeSceneDocument,
  type LegacyComponentTypeReference,
  type LegacyPrefabReference,
} from "../src/index.js";

const fixture = (name: string): string =>
  readFileSync(resolve(process.cwd(), "tests/fixtures/legacy", name), "utf8");

const componentTypes = new Map<string, LegacyComponentTypeReference>([
  ["PushOnClick", { typeId: "com.codogma.legacy.push-on-click", schemaVersion: 1 }],
  ["Tint", { typeId: "com.codogma.legacy.tint", schemaVersion: 1 }],
]);

const componentInstanceIds = new Map<string, string>([
  [legacyComponentInstanceKey("dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae", "PushOnClick"), "instance-level-push"],
  [legacyComponentInstanceKey("dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae", "Tint"), "instance-level-tint"],
  [legacyComponentInstanceKey("dd494496-e0c6-479b-98ed-25ff529caa6f", "Tint"), "instance-dino-tint"],
  [legacyComponentInstanceKey("dd494496-e0c6-479b-98ed-25ff529caa6f", "PushOnClick"), "instance-dino-push"],
]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

function componentNames(): string[] {
  const document = JSON.parse(fixture("Behaviors.components")) as { components: Array<{ name: string }> };
  return document.components.map((item) => item.name).sort();
}

test("migrates a real legacy SCENE with explicit component and prefab mappings", () => {
  const legacyScene = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const dinoPrefab = JSON.parse(fixture("DinoPrefab.scene")) as Record<string, unknown>;
  const dinoRoot = object((dinoPrefab.displayList as unknown[])[0]);
  const dinoPrefabId = String(dinoPrefab.id);
  const allPrefabIds = new Set([
    dinoPrefabId,
    String((JSON.parse(fixture("CoinPrefab.scene")) as Record<string, unknown>).id),
    "f09cbbd7-3019-4f77-b666-386ed906ee51",
    "67273ad8-1b79-4edb-ac29-ca5abefe6603",
  ]);
  const prefabReferences = new Map<string, LegacyPrefabReference>([
    [dinoPrefabId, {
      rootNodeId: String(dinoRoot.id),
      propertyNames: new Set(["rotating", "origin"]),
    }],
  ]);

  assert.deepEqual(componentNames(), [...componentTypes.keys()].sort());

  const result = migrateLegacySceneDocument(legacyScene, {
    componentTypes,
    componentInstanceIds,
    prefabReferences,
    validationContext: { prefabIds: allPrefabIds },
  });

  assert.equal(result.document.schemaVersion, 1);
  assert.equal(result.document.id, legacyScene.id);
  assert.equal(result.document.rootNodes.length, 5);
  assert.equal(result.sourceVersion, "legacy-scene");

  const firstNode = result.document.rootNodes[0];
  assert.ok(firstNode);
  assert.equal(firstNode.id, "dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae");
  assert.equal(firstNode.name, "dino");
  assert.equal(firstNode.transform.x, 400);
  assert.equal(firstNode.transform.y, 245.50984430371858);
  assert.equal(firstNode.components.length, 2);

  const pushComponent = firstNode.components.find((item) =>
    item.typeId === "com.codogma.legacy.push-on-click");
  assert.ok(pushComponent);
  assert.equal(pushComponent.id, "instance-level-push");
  assert.equal(pushComponent.schemaVersion, 1);
  assert.equal(pushComponent.properties.pushScale, 0.8);

  const dinoInstance = result.document.rootNodes.find((item) => item.id === "1758e6d4-21b2-4ece-8338-193c5d0b73e2");
  assert.ok(dinoInstance);
  assert.ok(dinoInstance.prefabInstance);
  assert.equal(dinoInstance.prefabInstance.prefabId, dinoPrefabId);
  assert.deepEqual(dinoInstance.prefabInstance.overrides, [{
    targetNodeId: String(dinoRoot.id),
    propertyPath: "rotating",
    value: true,
  }]);

  const rawScene = object(object(result.document).legacySource);
  assert.deepEqual(rawScene, legacyScene);
  assert.equal(
    result.diagnostics.some((item) => item.code === "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED"),
    true,
  );
});

test("migrates real legacy Prefab documents and preserves property declarations and source payloads", () => {
  const legacyDino = JSON.parse(fixture("DinoPrefab.scene")) as Record<string, unknown>;
  const legacyCoin = JSON.parse(fixture("CoinPrefab.scene")) as Record<string, unknown>;

  const dino = migrateLegacyPrefabDocument(legacyDino, { componentTypes, componentInstanceIds });
  const coin = migrateLegacyPrefabDocument(legacyCoin, { componentTypes });

  assert.equal(dino.document.id, legacyDino.id);
  assert.equal(dino.document.root.id, "dd494496-e0c6-479b-98ed-25ff529caa6f");
  assert.deepEqual(object(dino.document).legacyPrefabProperties, legacyDino.prefabProperties);
  assert.equal(dino.document.root.components.length, 2);
  assert.deepEqual(object(object(dino.document).legacySource), legacyDino);

  assert.equal(coin.document.id, legacyCoin.id);
  assert.equal(coin.document.root.id, "d1efe159-9dca-4f6a-9de5-14863a905271");
  assert.deepEqual(object(coin.document).legacyPrefabProperties, legacyCoin.prefabProperties);
  assert.equal(coin.document.root.components.length, 0);
  assert.deepEqual(object(object(coin.document).legacySource), legacyCoin);
});

test("preserves unknown legacy component names and their namespaced values without guessing type IDs", () => {
  const source = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const migrated = migrateLegacySceneDocument(source);
  const first = migrated.document.rootNodes[0];
  assert.ok(first);
  assert.equal(first.components.length, 0);
  assert.deepEqual(object(first).legacyComponents, ["PushOnClick", "Tint"]);
  assert.equal(object(object(first).legacySource)["PushOnClick.pushScale"], 0.8);
  assert.equal(
    migrated.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_COMPONENT_PRESERVED" &&
      item.severity === "warning"),
    true,
  );
  assert.deepEqual(object(object(migrated.document).legacySource), source);
});

test("legacy Scene and Prefab serialization round-trip the migration envelope", () => {
  const sourceScene = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const dino = JSON.parse(fixture("DinoPrefab.scene")) as Record<string, unknown>;
  const prefabNode = object((dino.displayList as unknown[])[0]);
  const prefabIds = new Set([String(dino.id), "f09cbbd7-3019-4f77-b666-386ed906ee51", "67273ad8-1b79-4edb-ac29-ca5abefe6603"]);
  const scene = migrateLegacySceneDocument(sourceScene, {
    componentTypes,
    componentInstanceIds,
    prefabReferences: new Map([[String(dino.id), {
      rootNodeId: String(prefabNode.id),
      propertyNames: new Set(["rotating"]),
    }]]),
    validationContext: { prefabIds },
  }).document;
  const prefab = migrateLegacyPrefabDocument(dino, { componentTypes, componentInstanceIds }).document;

  const sceneJson = serializeSceneDocument(scene, {
    registeredComponentTypes: new Set([...componentTypes.values()].map((item) => item.typeId)),
    prefabIds,
  });
  const prefabJson = serializePrefabDocument(prefab, {
    registeredComponentTypes: new Set([...componentTypes.values()].map((item) => item.typeId)),
  });
  const parsedScene = parseSceneDocument(sceneJson, {
    registeredComponentTypes: new Set([...componentTypes.values()].map((item) => item.typeId)),
    prefabIds,
  });
  const parsedPrefab = parsePrefabDocument(prefabJson, {
    registeredComponentTypes: new Set([...componentTypes.values()].map((item) => item.typeId)),
  });

  assert.deepEqual(parsedScene.value, scene);
  assert.deepEqual(parsedPrefab.value, prefab);
  assert.deepEqual(object(object(parsedScene.value).legacySource), sourceScene);
  assert.deepEqual(object(object(parsedPrefab.value).legacySource), dino);
});

test("uses deterministic IDs and refuses legacy nodes without existing stable identity", () => {
  const original = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const first = migrateLegacySceneDocument(original, { componentTypes }).document;
  const second = migrateLegacySceneDocument(original, { componentTypes }).document;
  assert.deepEqual(first, second);

  const missingNodeId = clone(original);
  const displayList = missingNodeId.displayList as Array<Record<string, unknown>>;
  delete displayList[0]?.id;
  assert.throws(
    () => migrateLegacySceneDocument(missingNodeId, { componentTypes }),
    (error: unknown) => error instanceof LegacyProjectMigrationError &&
      error.diagnostics.some((item) => item.path?.endsWith(".id")),
  );
});

test("does not reinterpret multiple legacy Prefab roots as a new hierarchy", () => {
  const original = JSON.parse(fixture("DinoPrefab.scene")) as Record<string, unknown>;
  const multipleRoots = clone(original);
  const displayList = multipleRoots.displayList as Array<Record<string, unknown>>;
  const firstRoot = displayList[0];
  assert.ok(firstRoot);
  const extra = clone(firstRoot);
  extra.id = "second-root-id";
  displayList.push(extra);

  assert.throws(
    () => migrateLegacyPrefabDocument(multipleRoots, { componentTypes }),
    (error: unknown) => error instanceof LegacyProjectMigrationError &&
      error.diagnostics.some((item) => item.code === "PROJECT_MIGRATION_INVALID_INPUT"),
  );
});

test("defaults invalid legacy transforms with a warning while preserving the original source field", () => {
  const original = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const invalidTransform = clone(original);
  const displayList = invalidTransform.displayList as Array<Record<string, unknown>>;
  displayList[0] = { ...displayList[0], x: "not-a-number" };

  const result = migrateLegacySceneDocument(invalidTransform, { componentTypes });
  assert.equal(result.document.rootNodes[0]?.transform.x, 0);
  assert.equal(
    result.diagnostics.some((item) => item.code === "PROJECT_LEGACY_TRANSFORM_DEFAULTED"),
    true,
  );
  assert.equal(object(object(result.document.rootNodes[0]).legacySource).x, "not-a-number");
});


test("maps legacy texture keys to stable Project Asset IDs only through an explicit mapping", () => {
  const legacyScene = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const assetPack = JSON.parse(fixture("asset-pack.json")) as {
    section1: { files: Array<{ url: string; type: string; key: string }> };
  };
  const packedImage = assetPack.section1.files.find((item) => item.key === "dino");
  assert.ok(packedImage);
  assert.equal(packedImage.url, "assets/dino.png");
  assert.equal(packedImage.type, "image");

  const asset = { id: "asset-image-dino", path: packedImage.url, kind: "image" as const };
  const migrated = migrateLegacySceneDocument(legacyScene, {
    componentTypes,
    assetReferences: new Map([[packedImage.key, { assetId: asset.id }]]),
    validationContext: { assets: new Map([[asset.id, asset]]) },
  });

  const first = migrated.document.rootNodes[0];
  assert.ok(first);
  assert.deepEqual(first.assetReferences, [{
    propertyPath: "texture",
    assetId: "asset-image-dino",
  }]);
  const rawTexture = object(object(first).legacySource).texture;
  assert.deepEqual(rawTexture, { key: "dino" });
});

test("rejects unresolved Node Asset IDs and duplicate asset-reference property paths", () => {
  const scene = {
    schemaVersion: 1,
    id: "scene-asset-refs",
    name: "Asset refs",
    settings: {},
    rootNodes: [{
      id: "node-asset-refs",
      name: "Sprite",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      assetReferences: [
        { propertyPath: "texture", assetId: "missing-asset" },
        { propertyPath: "texture", assetId: "missing-asset" },
      ],
      children: [],
    }],
  };
  const result = parseSceneDocument(JSON.stringify(scene), { assets: new Map() });
  assert.equal(result.value, undefined);
  assert.equal(result.diagnostics.some((item) => item.code === "PROJECT_INVALID_REFERENCE"), true);
  assert.equal(result.diagnostics.some((item) => item.code === "PROJECT_DUPLICATE_ID"), true);
});


test("migrates displayList and plainObjects from an additional real Scene fixture", () => {
  const source = JSON.parse(fixture("AgentLevel.scene")) as Record<string, unknown>;
  const displayList = source.displayList as unknown[];
  const plainObjects = source.plainObjects as unknown[];
  const migrated = migrateLegacySceneDocument(source);

  assert.equal(migrated.document.rootNodes.length, displayList.length + plainObjects.length);
  const firstPlainObject = object(plainObjects[0]);
  const migratedPlainObject = migrated.document.rootNodes[displayList.length];
  assert.ok(migratedPlainObject);
  assert.equal(migratedPlainObject.id, firstPlainObject.id);
  assert.equal(object(migratedPlainObject).legacyCollection, "plainObjects");
  assert.deepEqual(object(migrated.document).legacySource, source);
});

test("migrates real nested Container Prefab hierarchy without flattening it", () => {
  const baseSource = JSON.parse(fixture("BaseContainerPrefab.scene")) as Record<string, unknown>;
  const nestedSource = JSON.parse(fixture("NestedPrefabInContainerPrefab.scene")) as Record<string, unknown>;
  const base = migrateLegacyPrefabDocument(baseSource).document;
  const nested = migrateLegacyPrefabDocument(nestedSource).document;

  assert.equal(base.root.id, "8a6260f5-41cc-4317-b862-2c49c34ba837");
  assert.deepEqual(
    base.root.children.map((item) => item.id),
    ["4c327af7-0f36-46da-8103-6b52abca1942", "933a50ce-834a-4f1e-b358-b07b98ffc15d"],
  );
  assert.equal(nested.root.id, "6b3513cb-8932-4f92-8d25-ca3527b6eb5d");
  assert.equal(nested.root.children.length, 3);
  assert.equal(nested.root.children[0]?.prefabInstance?.prefabId, "62361060-1303-4a68-b8e6-3ade0fa1d41c");
  assert.equal(nested.root.children[2]?.children[0]?.id, "24c92083-aa88-4a46-9ed9-e6e0d189af5d");
  assert.deepEqual(object(object(nested.root).legacySource), object((nestedSource.displayList as unknown[])[0]));
});

test("keeps nested Prefab override payload explicit instead of flattening it into ordinary children", () => {
  const derivedSource = JSON.parse(fixture("DerivedContainer1Prefab.scene")) as Record<string, unknown>;
  const sceneSource = JSON.parse(fixture("NestedInsideContainerPrefabInstanceScene.scene")) as Record<string, unknown>;
  const derived = migrateLegacyPrefabDocument(derivedSource);
  const scene = migrateLegacySceneDocument(sceneSource);

  assert.equal(derived.document.root.prefabInstance?.prefabId, "ff655d3a-5788-448d-a43a-508b716df366");
  assert.equal(scene.document.rootNodes[0]?.prefabInstance?.prefabId, "0af548e2-20ec-4b0c-a216-2dc598698b2f");
  assert.deepEqual(
    object(object(derived.document.root).legacySource).nestedPrefabs,
    object((derivedSource.displayList as unknown[])[0]).nestedPrefabs,
  );
  assert.deepEqual(
    object(object(scene.document.rootNodes[0]).legacySource).nestedPrefabs,
    object((sceneSource.displayList as unknown[])[0]).nestedPrefabs,
  );
  assert.equal(
    derived.diagnostics.some((item) => item.code === "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED"),
    true,
  );
  assert.equal(
    scene.diagnostics.some((item) => item.code === "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED"),
    true,
  );
});

test("preserves legacy scene-level list declarations with a structured warning", () => {
  const source = JSON.parse(fixture("TestListFieldScene.scene")) as Record<string, unknown>;
  const result = migrateLegacySceneDocument(source);

  assert.deepEqual(object(result.document).legacySource, source);
  assert.equal(result.diagnostics.some((item) =>
    item.path === "document.lists" &&
    item.code === "PROJECT_LEGACY_FIELD_PRESERVED"), true);
});


test("repeated Scene and Prefab migration is deterministic and leaves source inputs untouched", () => {
  const legacyScene = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const legacyPrefab = JSON.parse(fixture("BaseContainerPrefab.scene")) as Record<string, unknown>;
  const sceneBefore = JSON.stringify(legacyScene);
  const prefabBefore = JSON.stringify(legacyPrefab);

  const firstScene = migrateSceneDocument(legacyScene, { componentTypes, componentInstanceIds });
  const secondScene = migrateSceneDocument(firstScene.document, { componentTypes });
  const firstPrefab = migratePrefabDocument(legacyPrefab, { componentTypes, componentInstanceIds });
  const secondPrefab = migratePrefabDocument(firstPrefab.document, { componentTypes });

  assert.equal(firstScene.sourceVersion, "legacy-scene");
  assert.equal(secondScene.sourceVersion, "cge-scene-v1");
  assert.deepEqual(secondScene.document, firstScene.document);
  assert.equal(firstPrefab.sourceVersion, "legacy-prefab");
  assert.equal(secondPrefab.sourceVersion, "cge-prefab-v1");
  assert.deepEqual(secondPrefab.document, firstPrefab.document);
  assert.equal(JSON.stringify(legacyScene), sceneBefore);
  assert.equal(JSON.stringify(legacyPrefab), prefabBefore);
});


test("does not invent Component instance IDs from legacy type names", () => {
  const source = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const result = migrateLegacySceneDocument(source, { componentTypes });
  const firstNode = result.document.rootNodes[0];
  assert.ok(firstNode);
  assert.equal(firstNode.components.length, 0);
  assert.deepEqual(object(firstNode).legacyComponents, ["PushOnClick", "Tint"]);
  assert.equal(result.diagnostics.some((item) =>
    item.code === "PROJECT_LEGACY_COMPONENT_PRESERVED" &&
    item.path === "displayList[0].components[0]"), true);
});


test("rejects invalid stable Component type IDs in explicit legacy mappings", () => {
  const source = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const invalidTypes = new Map<string, LegacyComponentTypeReference>([
    ["PushOnClick", { typeId: "component/type", schemaVersion: 1 }],
  ]);
  const invalidInstanceIds = new Map<string, string>([
    [legacyComponentInstanceKey("dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae", "PushOnClick"), "instance-level-push"],
  ]);
  assert.throws(
    () => migrateLegacySceneDocument(source, {
      componentTypes: invalidTypes,
      componentInstanceIds: invalidInstanceIds,
    }),
    (error: unknown) => error instanceof LegacyProjectMigrationError &&
      error.diagnostics.some((item) => item.code === "PROJECT_MIGRATION_INVALID_INPUT"),
  );
});


test("requires an explicit stable Component instance ID mapping before converting legacy component declarations", () => {
  const source = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const mapping = new Map<string, string>([
    [legacyComponentInstanceKey("dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae", "PushOnClick"), "instance-explicit-push"],
    [legacyComponentInstanceKey("dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae", "Tint"), "instance-explicit-tint"],
  ]);
  const migrated = migrateLegacySceneDocument(source, {
    componentTypes,
    componentInstanceIds: mapping,
  });
  const node = migrated.document.rootNodes[0];
  assert.ok(node);
  assert.deepEqual(
    node.components.map((component) => component.id),
    ["instance-explicit-push", "instance-explicit-tint"],
  );
});


test("preserves legacy renderer type and compiler scope instead of treating them as Node names", () => {
  const level = JSON.parse(fixture("Level.scene")) as Record<string, unknown>;
  const agentLevel = JSON.parse(fixture("AgentLevel.scene")) as Record<string, unknown>;
  const migratedLevel = migrateLegacySceneDocument(level);
  const migratedAgentLevel = migrateLegacySceneDocument(agentLevel);

  const imageNode = migratedLevel.document.rootNodes[0];
  assert.ok(imageNode);
  assert.equal(imageNode.name, "dino");
  assert.equal(object(object(imageNode).legacySource).type, "Image");

  const tilemapNode = migratedAgentLevel.document.rootNodes.find((node) =>
    object(node).id === "ea22bd4a-1ca0-4778-a736-aa388e22cee0");
  assert.ok(tilemapNode);
  assert.equal(tilemapNode.name, "mainLayer_1");
  assert.equal(object(object(tilemapNode).legacySource).type, "EditableTilemapLayer");
  assert.equal(object(object(tilemapNode).legacySource).scope, "METHOD");
  assert.equal(
    migratedAgentLevel.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_FIELD_PRESERVED" &&
      item.path?.endsWith(".scope")),
    true,
  );
  assert.equal(
    migratedAgentLevel.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_FIELD_PRESERVED" &&
      item.path?.endsWith(".type")),
    true,
  );
});


function assertLegacyNodeSourceTree(migrated: unknown, legacy: unknown): void {
  const migratedNode = object(migrated);
  const legacyNode = object(legacy);
  assert.deepEqual(object(migratedNode.legacySource), legacyNode);

  const expectedChildren = Array.isArray(legacyNode.list) ? legacyNode.list : [];
  const actualChildren = Array.isArray(migratedNode.children) ? migratedNode.children : [];
  assert.equal(actualChildren.length, expectedChildren.length);

  for (let index = 0; index < expectedChildren.length; index += 1) {
    assertLegacyNodeSourceTree(actualChildren[index], expectedChildren[index]);
  }
}

test("migrates every checked-in legacy Scene and Prefab fixture without losing hierarchy or source fields", () => {
  const fixtureNames = [
  "AgentLevel.scene",
  "CoinPrefab.scene",
  "CoinRush.scene",
  "DinoPrefab.scene",
  "DoubleDinoPrefab.scene",
  "Level.scene",
  "MyGame.scene",
  "OfficialE2E.scene",
  "TestListFieldScene.scene",
  "TestOneObjectScene.scene",
  "TestTileSpriteSizeInInspector.scene",
  "TextWordWrapScene.scene",
  "box2d-acceptance.scene",
  "TestComponentsAwakeEvent.scene",
  "fx-acceptance.scene",
  "Issue147.scene",
  "BaseContainerPrefab.scene",
  "DerivedContainer1Prefab.scene",
  "Issue154.scene",
  "AnotherPrefabPrefab.scene",
  "NestedInsideContainerPrefabInstanceScene.scene",
  "NestedPrefabInContainerPrefab.scene",
  "OriginMigration.scene",
  "TextWithOriginPrefab.scene",
  "PrefabAwakeTest.scene",
  "WithAwakeEventPrefab.scene",
  "WithoutAwakeEventPrefab.scene"
];
  let sceneCount = 0;
  let prefabCount = 0;
  let warningCount = 0;

  for (const name of fixtureNames) {
    const source = JSON.parse(fixture(name)) as Record<string, unknown>;
    const displayList = Array.isArray(source.displayList) ? source.displayList : [];
    const plainObjects = Array.isArray(source.plainObjects) ? source.plainObjects : [];
    const sourceRoots = [...displayList, ...plainObjects];

    if (source.sceneType === "SCENE") {
      const migrated = migrateLegacySceneDocument(source);
      sceneCount += 1;
      assert.equal(migrated.document.id, source.id, name);
      assert.equal(migrated.document.rootNodes.length, sourceRoots.length, name);
      assert.deepEqual(object(object(migrated.document).legacySource), source, name);
      migrated.document.rootNodes.forEach((node, index) => {
        assertLegacyNodeSourceTree(node, sourceRoots[index]);
        assert.equal(object(node).legacyCollection, index < displayList.length ? "displayList" : "plainObjects");
      });
      warningCount += migrated.diagnostics.filter((item) => item.severity === "warning").length;
    } else if (source.sceneType === "PREFAB") {
      assert.equal(sourceRoots.length, 1, name);
      const migrated = migrateLegacyPrefabDocument(source);
      prefabCount += 1;
      assert.equal(migrated.document.id, source.id, name);
      assertLegacyNodeSourceTree(migrated.document.root, sourceRoots[0]);
      assert.deepEqual(object(object(migrated.document).legacySource), source, name);
      assert.equal(
        JSON.stringify(object(migrated.document).legacyPrefabProperties ?? []),
        JSON.stringify(source.prefabProperties ?? []),
        name,
      );
      warningCount += migrated.diagnostics.filter((item) => item.severity === "warning").length;
    } else {
      assert.fail("Unexpected legacy discriminator in fixture " + name);
    }
  }

  assert.equal(sceneCount + prefabCount, fixtureNames.length);
  assert.equal(sceneCount > 0, true);
  assert.equal(prefabCount > 0, true);
  assert.equal(warningCount > 0, true);
});

test("keeps both real legacy User Component definition formats inspectable without fabricating a schema version", () => {
  const behaviors = JSON.parse(fixture("Behaviors.components")) as {
    components: Array<{ name: string; properties: Array<{ name: string; type: { id: string } }>; generateAwakeEvent: boolean }>;
    outputLang: string;
  };
  const awake = JSON.parse(fixture("AwakeTest.components")) as {
    components: Array<{ name: string; gameObjectType: string; generateAwakeEvent: boolean }>;
    outputLang: string;
  };

  assert.deepEqual(behaviors.components.map((item) => item.name).sort(), ["PushOnClick", "Tint"]);
  assert.equal(behaviors.components.find((item) => item.name === "PushOnClick")?.properties[0]?.type.id, "number");
  assert.equal(behaviors.components.find((item) => item.name === "PushOnClick")?.generateAwakeEvent, true);
  assert.equal(awake.components.map((item) => item.name).sort().join(","), "ComponentWithAwake,ComponentWithoutAwake");
  assert.equal(awake.components.find((item) => item.name === "ComponentWithAwake")?.generateAwakeEvent, true);
  assert.equal(awake.components.find((item) => item.name === "ComponentWithoutAwake")?.generateAwakeEvent, false);
  assert.equal(behaviors.outputLang, "TYPE_SCRIPT");
  assert.equal(awake.outputLang, "TYPE_SCRIPT");
});


test("reports unsupported Scene and Prefab schema versions through migration entry points", () => {
  const unsupported = (error: unknown): boolean =>
    error instanceof LegacyProjectMigrationError &&
    error.diagnostics.some((item) =>
      item.code === "PROJECT_UNSUPPORTED_VERSION" &&
      item.path === "schemaVersion" &&
      item.severity === "error");

  assert.throws(
    () => migrateSceneDocument({ schemaVersion: 9, id: "scene-future", name: "Future", rootNodes: [], settings: {} }),
    unsupported,
  );
  assert.throws(
    () => migratePrefabDocument({ schemaVersion: 9, id: "prefab-future", name: "Future", root: {} }),
    unsupported,
  );
});

test("warns when an invalid legacy active value is defaulted and preserves the original value", () => {
  const source = {
    id: "scene-invalid-active",
    sceneType: "SCENE",
    displayList: [{ id: "node-invalid-active", active: "false" }],
    plainObjects: [],
  };

  const result = migrateLegacySceneDocument(source);
  assert.equal(result.document.rootNodes[0]?.active, true);
  assert.equal(
    result.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_FIELD_PRESERVED" &&
      item.path === "displayList[0].active" &&
      item.entityId === "node-invalid-active"),
    true,
  );
  assert.deepEqual(object(object(result.document).legacySource), source);
});

test("warns when malformed legacy Prefab root collections are ignored", () => {
  const fixtureSource = JSON.parse(fixture("DinoPrefab.scene")) as Record<string, unknown>;
  const root = object((fixtureSource.displayList as unknown[])[0]);

  const malformedDisplayList = {
    ...fixtureSource,
    displayList: "not-an-array",
    plainObjects: [root],
  };
  const migratedDisplayList = migrateLegacyPrefabDocument(malformedDisplayList);
  assert.equal(migratedDisplayList.document.root.id, root.id);
  assert.equal(
    migratedDisplayList.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_FIELD_PRESERVED" && item.path === "displayList"),
    true,
  );
  assert.deepEqual(object(object(migratedDisplayList.document).legacySource), malformedDisplayList);

  const malformedPlainObjects = {
    ...fixtureSource,
    plainObjects: "not-an-array",
  };
  const migratedPlainObjects = migrateLegacyPrefabDocument(malformedPlainObjects);
  assert.equal(migratedPlainObjects.document.root.id, root.id);
  assert.equal(
    migratedPlainObjects.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_FIELD_PRESERVED" && item.path === "plainObjects"),
    true,
  );
  assert.deepEqual(object(object(migratedPlainObjects.document).legacySource), malformedPlainObjects);
});
