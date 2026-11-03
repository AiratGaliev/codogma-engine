import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  LegacyProjectMigrationError,
  migrateLegacyPrefabDocument,
  migrateLegacySceneDocument,
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
  assert.equal(pushComponent.id, "legacy:dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae:PushOnClick");
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

  const dino = migrateLegacyPrefabDocument(legacyDino, { componentTypes });
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
    prefabReferences: new Map([[String(dino.id), {
      rootNodeId: String(prefabNode.id),
      propertyNames: new Set(["rotating"]),
    }]]),
    validationContext: { prefabIds },
  }).document;
  const prefab = migrateLegacyPrefabDocument(dino, { componentTypes }).document;

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
  const rawTexture = object(first.legacySource).texture;
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
