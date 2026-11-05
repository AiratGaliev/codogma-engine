import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  LegacyProjectMigrationError,
  legacyComponentInstanceKey,
  migrateLegacyPrefabDocument,
  migrateLegacySceneDocument,
  migratePrefabDocument,
  migrateSceneDocument,
  parsePrefabDocument,
  parseSceneDocument,
  serializePrefabDocument,
  serializeSceneDocument,
  type LegacyComponentTypeReference,
  type LegacyPrefabReference,
} from "../src/index.js";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures/legacy");
const readFixture = (name: string): string => readFileSync(resolve(fixtureRoot, name), "utf8");
const parseFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFixture(name)) as Record<string, unknown>;

const componentTypes = new Map<string, LegacyComponentTypeReference>([
  ["PushOnClick", { typeId: "com.codogma.legacy.push-on-click", schemaVersion: 1 }],
  ["Tint", { typeId: "com.codogma.legacy.tint", schemaVersion: 1 }],
]);
const componentInstanceIds = new Map<string, string>([
  [legacyComponentInstanceKey("dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae", "PushOnClick"), "instance-level-push"],
  [legacyComponentInstanceKey("dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae", "Tint"), "instance-level-tint"],
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

function assertNodeSourceTree(actual: unknown, legacy: unknown): void {
  const migrated = object(actual);
  const original = object(legacy);
  assert.deepEqual(migrated.legacySource, original);
  const expectedChildren = Array.isArray(original.list) ? original.list : [];
  const actualChildren = Array.isArray(migrated.children) ? migrated.children : [];
  assert.equal(actualChildren.length, expectedChildren.length);
  for (let index = 0; index < expectedChildren.length; index += 1) {
    assertNodeSourceTree(actualChildren[index], expectedChildren[index]);
  }
}

const legacySceneFixtures = [
  "AgentLevel.scene",
  "CoinRush.scene",
  "Level.scene",
  "MyGame.scene",
  "OfficialE2E.scene",
  "Issue147.scene",
  "Issue154.scene",
  "NestedInsideContainerPrefabInstanceScene.scene",
  "TestListFieldScene.scene",
  "TestOneObjectScene.scene",
  "TestTileSpriteSizeInInspector.scene",
  "TextWordWrapScene.scene",
  "box2d-acceptance.scene",
  "fx-acceptance.scene",
  "PrefabAwakeTest.scene",
  "TestComponentsAwakeEvent.scene",
  "OriginMigration.scene",
] as const;

const legacyPrefabFixtures = [
  "AnotherPrefabPrefab.scene",
  "BaseContainerPrefab.scene",
  "CoinPrefab.scene",
  "DerivedContainer1Prefab.scene",
  "DinoPrefab.scene",
  "DoubleDinoPrefab.scene",
  "NestedPrefabInContainerPrefab.scene",
  "TextWithOriginPrefab.scene",
  "WithAwakeEventPrefab.scene",
  "WithoutAwakeEventPrefab.scene",
] as const;

test("migrates all 27 real legacy Scene and Prefab fixtures without losing source data", () => {
  let warningCount = 0;

  for (const name of legacySceneFixtures) {
    const source = parseFixture(name);
    const roots = Array.isArray(source.displayList) ? source.displayList : [];
    const migrated = migrateLegacySceneDocument(source);
    assert.equal(migrated.document.id, source.id, name);
    assert.equal(migrated.document.rootNodes.length, roots.length, name);
    assert.equal(migrated.document.schemaVersion, 1, name);
    assert.deepEqual(object(migrated.document).legacySource, source, name);
    migrated.document.rootNodes.forEach((node, index) => {
      assertNodeSourceTree(node, roots[index]);
      assert.equal(object(node).legacyCollection, "displayList");
    });
    if (Array.isArray(source.plainObjects) && source.plainObjects.length > 0) {
      assert.equal(
        migrated.diagnostics.some((item) =>
          item.path === "document.plainObjects" &&
          item.code === "PROJECT_LEGACY_FIELD_PRESERVED"),
        true,
        name,
      );
    }
    warningCount += migrated.diagnostics.filter((item) => item.severity === "warning").length;
  }

  for (const name of legacyPrefabFixtures) {
    const source = parseFixture(name);
    const roots = Array.isArray(source.displayList) ? source.displayList : [];
    assert.equal(roots.length, 1, name);
    const migrated = migrateLegacyPrefabDocument(source);
    assert.equal(migrated.document.id, source.id, name);
    assert.equal(migrated.document.schemaVersion, 1, name);
    assertNodeSourceTree(migrated.document.root, roots[0]);
    assert.deepEqual(object(migrated.document).legacySource, source, name);
    assert.deepEqual(
      object(migrated.document).legacyPrefabProperties ?? [],
      source.prefabProperties ?? [],
      name,
    );
    warningCount += migrated.diagnostics.filter((item) => item.severity === "warning").length;
  }

  assert.equal(legacySceneFixtures.length + legacyPrefabFixtures.length, 27);
  assert.ok(warningCount > 0);
});

test("converts legacy Component instances and Prefab overrides only from explicit stable mappings", () => {
  const source = parseFixture("Level.scene");
  const prefab = parseFixture("DinoPrefab.scene");
  const prefabRoot = object((prefab.displayList as unknown[])[0]);
  const legacyPrefabId = String(prefab.id);
  const prefabReferences = new Map<string, LegacyPrefabReference>([
    [legacyPrefabId, {
      prefabId: "project-prefab-dino",
      rootNodeId: String(prefabRoot.id),
      propertyNames: new Set(["rotating", "origin"]),
    }],
  ]);
  const instanceIds = new Map(componentInstanceIds);
  instanceIds.set(
    legacyComponentInstanceKey("dd494496-e0c6-479b-98ed-25ff529caa6f", "Tint"),
    "instance-dino-tint",
  );
  instanceIds.set(
    legacyComponentInstanceKey("dd494496-e0c6-479b-98ed-25ff529caa6f", "PushOnClick"),
    "instance-dino-push",
  );

  const migrated = migrateLegacySceneDocument(source, {
    componentTypes,
    componentInstanceIds: instanceIds,
    prefabReferences,
    validationContext: { prefabIds: new Set(["project-prefab-dino"]) },
  });
  const first = migrated.document.rootNodes[0];
  assert.ok(first);
  assert.equal(first.id, "dbf996fe-97a4-4a56-8978-ba3fb5d1e5ae");
  assert.equal(first.name, "dino");
  assert.equal(first.transform.x, 400);
  assert.equal(first.transform.y, 245.50984430371858);
  assert.equal(first.components.length, 2);
  const push = first.components.find((component) =>
    component.typeId === "com.codogma.legacy.push-on-click");
  assert.ok(push);
  assert.equal(push.id, "instance-level-push");
  assert.equal(push.properties.pushScale, 0.8);

  const prefabInstance = migrated.document.rootNodes.find((node) =>
    node.prefabInstance?.prefabId === "project-prefab-dino");
  assert.ok(prefabInstance?.prefabInstance);
  assert.deepEqual(prefabInstance.prefabInstance.overrides, [{
    targetNodeId: String(prefabRoot.id),
    propertyPath: "rotating",
    value: true,
  }]);
});

test("unknown Component classes, texture keys and Prefab links remain losslessly in legacySource", () => {
  const source = parseFixture("Level.scene");
  const migrated = migrateLegacySceneDocument(source);
  const first = migrated.document.rootNodes[0];
  assert.ok(first);
  assert.equal(first.components.length, 0);
  assert.deepEqual(object(first).legacyComponents, ["PushOnClick", "Tint"]);
  assert.equal(object(object(first).legacySource)["PushOnClick.pushScale"], 0.8);
  assert.equal(
    migrated.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_COMPONENT_PRESERVED" && item.severity === "warning"),
    true,
  );
  assert.equal(
    migrated.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_ASSET_REFERENCE_PRESERVED"),
    true,
  );
  assert.deepEqual(object(migrated.document).legacySource, source);
});

test("does not invent IDs, prefab mappings, or hierarchy groups", () => {
  const scene = parseFixture("Level.scene");
  const missingNodeId = clone(scene);
  const displayList = missingNodeId.displayList as Array<Record<string, unknown>>;
  delete displayList[0]?.id;
  assert.throws(
    () => migrateLegacySceneDocument(missingNodeId),
    (error: unknown) => error instanceof LegacyProjectMigrationError &&
      error.diagnostics.some((item) => item.path?.endsWith(".id")),
  );

  const prefab = parseFixture("DinoPrefab.scene");
  const roots = clone(prefab);
  const prefabRoots = roots.displayList as Array<Record<string, unknown>>;
  const secondRoot = clone(object(prefabRoots[0]));
  secondRoot.id = "second-prefab-root";
  prefabRoots.push(secondRoot);
  assert.throws(
    () => migrateLegacyPrefabDocument(roots),
    (error: unknown) => error instanceof LegacyProjectMigrationError &&
      error.diagnostics.some((item) => item.code === "PROJECT_MIGRATION_INVALID_INPUT"),
  );

  const nestedSource = parseFixture("NestedPrefabInContainerPrefab.scene");
  const nested = migrateLegacyPrefabDocument(nestedSource);
  assert.equal(nested.document.root.children.some((node) => node.prefabInstance !== undefined), false);
  assert.equal(
    nested.diagnostics.some((item) => item.code === "PROJECT_LEGACY_PREFAB_OVERRIDE_PRESERVED"),
    true,
  );
  assert.deepEqual(object(nested.document.root).legacySource, object((nestedSource.displayList as unknown[])[0]));
});

test("defaults malformed Transform values with diagnostics while preserving their original values", () => {
  const source = parseFixture("Level.scene");
  const displayList = source.displayList as Array<Record<string, unknown>>;
  displayList[0] = { ...displayList[0], x: "not-a-number" };
  const migrated = migrateLegacySceneDocument(source);
  assert.equal(migrated.document.rootNodes[0]?.transform.x, 0);
  assert.equal(
    migrated.diagnostics.some((item) =>
      item.code === "PROJECT_LEGACY_TRANSFORM_DEFAULTED" &&
      item.path === "displayList[0].x"),
    true,
  );
  assert.equal(object(object(migrated.document.rootNodes[0]).legacySource).x, "not-a-number");
});

test("Scene and Prefab migration is deterministic, idempotent and round-trips through v1 serializers", () => {
  const sourceScene = parseFixture("Level.scene");
  const sourcePrefab = parseFixture("BaseContainerPrefab.scene");
  const migratedScene = migrateSceneDocument(sourceScene).document;
  const migratedPrefab = migratePrefabDocument(sourcePrefab).document;

  assert.deepEqual(migrateSceneDocument(migratedScene).document, migratedScene);
  assert.deepEqual(migratePrefabDocument(migratedPrefab).document, migratedPrefab);

  const sceneJson = serializeSceneDocument(migratedScene);
  const prefabJson = serializePrefabDocument(migratedPrefab);
  const parsedScene = parseSceneDocument(sceneJson);
  const parsedPrefab = parsePrefabDocument(prefabJson);
  assert.deepEqual(parsedScene.value, migratedScene);
  assert.deepEqual(parsedPrefab.value, migratedPrefab);
  assert.deepEqual(object(object(parsedScene.value).legacySource), sourceScene);
  assert.deepEqual(object(object(parsedPrefab.value).legacySource), sourcePrefab);
});

test("malformed legacy collections are preserved with warnings rather than treated as empty authoring data", () => {
  const source = parseFixture("DinoPrefab.scene");
  const root = object((source.displayList as unknown[])[0]);
  const malformed = {
    ...source,
    displayList: "not-an-array",
    plainObjects: [root],
  };
  assert.throws(
    () => migrateLegacyPrefabDocument(malformed),
    (error: unknown) => error instanceof LegacyProjectMigrationError &&
      error.diagnostics.some((item) => item.path === "displayList"),
  );
});

test("legacy User Component definitions and Asset Pack v2 fixture remain inspectable as source formats", () => {
  const behaviors = JSON.parse(readFixture("Behaviors.components")) as {
    components: Array<{ name: string; generateAwakeEvent: boolean }>;
    outputLang: string;
  };
  const awake = JSON.parse(readFixture("AwakeTest.components")) as {
    components: Array<{ name: string; generateAwakeEvent: boolean }>;
    outputLang: string;
  };
  const assetPack = JSON.parse(readFixture("asset-pack.json")) as {
    meta: { version: number };
    section1: { files: Array<{ key: string; type: string; url: string }> };
  };

  assert.deepEqual(behaviors.components.map((item) => item.name).sort(), ["PushOnClick", "Tint"]);
  assert.deepEqual(awake.components.map((item) => item.name).sort(), ["ComponentWithAwake", "ComponentWithoutAwake"]);
  assert.equal(behaviors.outputLang, "TYPE_SCRIPT");
  assert.equal(awake.outputLang, "TYPE_SCRIPT");
  assert.equal(assetPack.meta.version, 2);
  assert.deepEqual(assetPack.section1.files[0], { type: "image", key: "dino", url: "assets/dino.png" });
});
