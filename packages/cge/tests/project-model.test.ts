import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  isValidStableId,
  parseProjectDocument,
  serializeProjectDocument,
  validateComponentTypeSchema,
  validateProjectDocument,
  validateSceneDocument,
  validatePrefabDocument,
  isJsonValue,
  stableStringify,
  type ComponentTypeSchemaV1,
  type NodeReferenceKind,
  type JsonValue,
  type PrefabDocumentV1,
  type ProjectDocumentV1,
} from "../src/index.js";

const validProject: ProjectDocumentV1 = {
  schemaVersion: 1,
  id: "project-1",
  name: "Core acceptance",
  scenes: [{ id: "scene-ref-1", assetId: "asset-scene-1" }],
  assets: [{ id: "asset-scene-1", path: "scenes/Level.cge-scene.json", kind: "scene" }],
  prefabs: [],
  componentModules: [],
  runtime: { adapterId: "phaser", settings: {} },
};

test("rejects fields outside the native Project v1 envelope", () => {
  const input = { ...validProject, extensionData: { source: "unsupported", keep: true } };
  const result = validateProjectDocument(input);
  assert.equal(result.valid, false);
  assert.equal(result.value, undefined);
  assert.deepEqual(result.diagnostics.map((item) => [item.code, item.path]), [
    ["PROJECT_INVALID_DOCUMENT", "project.extensionData"],
  ]);
});

test("serializes deterministic JSON and round-trips the same semantic document", () => {
  const first = serializeProjectDocument(validProject);
  const second = serializeProjectDocument(JSON.parse(first) as ProjectDocumentV1);
  assert.equal(first, second);
  assert.equal(first.endsWith("\n"), true);
});

test("rejects unpublished and unsupported Project schema versions without changing the input", () => {
  assert.equal(parseProjectDocument("{").diagnostics[0]?.code, "PROJECT_PARSE_ERROR");
  for (const schemaVersion of [0, 2, 7]) {
    const input = {
      schemaVersion,
      id: "unsupported-project",
      name: "Unsupported",
      extensionData: { keep: true },
    };
    const before = JSON.stringify(input);
    const result = parseProjectDocument(JSON.stringify(input));
    assert.equal(result.value, undefined);
    assert.equal(result.diagnostics[0]?.code, "PROJECT_UNSUPPORTED_VERSION");
    assert.equal(JSON.stringify(input), before);
  }
});

test("checked-in Project fixture uses only the current native schema", () => {
  const fixture = JSON.parse(readFileSync(
    resolve(process.cwd(), "tests/fixtures/project-v1.json"),
    "utf8",
  )) as unknown;
  const parsed = parseProjectDocument(JSON.stringify(fixture));
  assert.equal(parsed.value?.schemaVersion, 1);
});

test("rejects dangling scene refs, duplicate ids and traversal paths", () => {
  const dangling = { ...validProject, scenes: [{ id: "scene-ref-1", assetId: "missing" }] };
  assert.equal(
    validateProjectDocument(dangling).diagnostics.some((item) => item.code === "PROJECT_INVALID_REFERENCE"),
    true,
  );

  const invalid = {
    ...validProject,
    assets: [
      { id: "asset-scene-1", path: "scenes/Level.cge-scene.json", kind: "scene" },
      { id: "asset-scene-1", path: "../outside.png", kind: "image" },
    ],
  };
  const diagnostics = validateProjectDocument(invalid).diagnostics;
  assert.equal(diagnostics.some((item) => item.code === "PROJECT_DUPLICATE_ID"), true);
  assert.equal(diagnostics.some((item) => item.code === "PROJECT_INVALID_DOCUMENT"), true);
});

test("scene validation catches duplicate node ids and invalid transforms", () => {
  const scene = {
    schemaVersion: 1,
    id: "scene-1",
    name: "Level",
    settings: {},
    rootNodes: [{
      id: "node-1",
      name: "Root",
      active: true,
      transform: { x: Number.NaN, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [{
        id: "node-1",
        name: "Duplicate",
        active: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [],
        children: [],
      }],
    }],
  };
  const result = validateSceneDocument(scene);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.some((item) => item.code === "SCENE_DUPLICATE_ID"), true);
  assert.equal(result.diagnostics.some((item) => item.code === "SCENE_INVALID_TRANSFORM"), true);
});

test("rejects non-JSON objects and safely preserves an own __proto__ data key", () => {
  assert.equal(isJsonValue(new Date()), false);
  assert.equal(isJsonValue(new Map()), false);
  assert.equal(isJsonValue({ value: Number.NaN }), false);

  const parsed = JSON.parse('{"__proto__":{"polluted":true},"value":1}') as JsonValue;
  assert.equal(isJsonValue(parsed), true);
  const roundTrip = JSON.parse(stableStringify(parsed)) as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(roundTrip, "__proto__"), true);
  assert.deepEqual(roundTrip.__proto__, { polluted: true });
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
});

test("component validation diagnostics retain the exact persisted property path", () => {
  const componentSchema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.path-check",
    name: "Path Check",
    version: "1.0.0",
    properties: { speed: { type: "number", min: 0 } },
  };
  const result = validateSceneDocument({
    schemaVersion: 1,
    id: "scene-path",
    name: "Path",
    settings: {},
    rootNodes: [{
      id: "node-path",
      name: "Player",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "component-path",
        typeId: componentSchema.typeId,
        schemaVersion: 1,
        enabled: true,
        properties: { speed: -1 },
      }],
      children: [],
    }],
  }, { componentSchemas: new Map([[componentSchema.typeId, componentSchema]]) });

  const diagnostic = result.diagnostics.find((item) => item.propertyName === "speed");
  assert.equal(diagnostic?.path, "rootNodes[0].components[0].properties.speed");
  assert.equal(diagnostic?.componentInstanceId, "component-path");
});

test("validates Prefab override target node and component references", () => {
  const prefab: PrefabDocumentV1 = {
    schemaVersion: 1,
    id: "prefab-1",
    name: "Crate",
    root: {
      id: "prefab-root",
      name: "Root",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "prefab-component",
        typeId: "com.codogma.crate",
        schemaVersion: 1,
        enabled: true,
        properties: {},
      }],
      children: [],
    },
  };
  const makeScene = (overrides: unknown[]) => ({
    schemaVersion: 1,
    id: "scene-prefab",
    name: "Scene",
    settings: {},
    rootNodes: [{
      id: "instance-node",
      name: "Crate Instance",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
      prefabInstance: { prefabId: "prefab-1", overrides },
    }],
  });
  const context = { prefabs: new Map([["prefab-1", prefab]]) };
  const valid = validateSceneDocument(makeScene([
    { targetNodeId: "prefab-root", propertyPath: "transform.x", value: 25 },
    { targetNodeId: "prefab-root", targetComponentId: "prefab-component", propertyPath: "enabled", value: false },
  ]), context);
  assert.equal(valid.valid, true);

  const invalid = validateSceneDocument(makeScene([
    { targetNodeId: "missing-node", propertyPath: "transform.x", value: 25 },
    { targetNodeId: "prefab-root", targetComponentId: "missing-component", propertyPath: "enabled", value: false },
  ]), context);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.diagnostics.filter((item) => item.code === "PROJECT_INVALID_REFERENCE").length, 2);
});

test("rejects malformed and duplicate Prefab overrides", () => {
  const scene = {
    schemaVersion: 1,
    id: "scene-prefab-invalid",
    name: "Scene",
    settings: {},
    rootNodes: [{
      id: "instance-node",
      name: "Crate Instance",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
      prefabInstance: {
        prefabId: "prefab-1",
        overrides: [
          { targetNodeId: "node", propertyPath: "x", value: 1 },
          { targetNodeId: "node", propertyPath: "x", value: 2 },
          { targetNodeId: "", propertyPath: "", value: null },
        ],
      },
    }],
  };
  const result = validateSceneDocument(scene);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.some((item) => item.code === "PROJECT_DUPLICATE_ID"), true);
  assert.equal(result.diagnostics.some((item) => item.code === "SCENE_INVALID_NODE"), true);
});

test("rejects malformed optional Asset sub-resource identifiers", () => {
  const asset = validProject.assets[0];
  assert.ok(asset);

  const invalidNumber = validateProjectDocument({
    ...validProject,
    assets: [{ ...asset, subResourceId: 42 }],
  });
  const invalidEmpty = validateProjectDocument({
    ...validProject,
    assets: [{ ...asset, subResourceId: "   " }],
  });

  assert.equal(invalidNumber.valid, false);
  assert.equal(invalidNumber.diagnostics.some((item) => item.path === "assets[0].subResourceId"), true);
  assert.equal(invalidEmpty.valid, false);
  assert.equal(invalidEmpty.diagnostics.some((item) => item.path === "assets[0].subResourceId"), true);
});


test("enforces one stable ID grammar across project, scene and component contracts", () => {
  for (const id of [
    "project-1",
    "com.codogma.player",
    "legacy.user-component:MyClass$1",
    "550e8400-e29b-41d4-a716-446655440000",
  ]) {
    assert.equal(isValidStableId(id), true, "expected valid stable ID: " + id);
  }
  for (const id of ["", " leading", "trailing ", "node/child", "../node", "node\\child"]) {
    assert.equal(isValidStableId(id), false, "expected invalid stable ID: " + id);
  }

  assert.equal(validateProjectDocument({ ...validProject, id: "project/invalid" }).valid, false);
  assert.equal(validateSceneDocument({
    schemaVersion: 1,
    id: "scene/invalid",
    name: "Invalid Scene",
    rootNodes: [],
    settings: {},
  }).valid, false);
  assert.equal(validateComponentTypeSchema({
    schemaVersion: 1,
    typeId: "com/codogma.invalid",
    name: "Invalid Component",
    version: "1.0.0",
    properties: {},
  }).valid, false);
});


test("rejects unknown Project, runtime and Asset fields while retaining native settings bags", () => {
  const input = {
    ...validProject,
    extensionData: { source: "unsupported", retained: true },
    runtime: {
      ...validProject.runtime,
      settings: { adapterOption: { enabled: true } },
      pluginRuntimeData: { retained: true },
    },
    assets: [{ ...validProject.assets[0]!, importMetadata: { retained: true } }],
  };
  const result = validateProjectDocument(input);
  assert.equal(result.valid, false);
  assert.equal(result.value, undefined);
  assert.deepEqual(result.diagnostics.map((item) => item.path).sort(), [
    "assets[0].importMetadata", "project.extensionData", "runtime.pluginRuntimeData",
  ]);

  const settings = validateProjectDocument({
    ...validProject,
    runtime: { ...validProject.runtime, settings: { adapterOption: { enabled: true } } },
  });
  assert.equal(settings.valid, true);
  assert.deepEqual(settings.value?.runtime.settings, { adapterOption: { enabled: true } });
});

test("rejects unknown Scene, Node, Transform and Component fields without closing Scene settings", () => {
  const schema: ComponentTypeSchemaV1 = {
    schemaVersion: 1, typeId: "com.codogma.test.follow-target", name: "Follow Target", version: "1.0.0",
    properties: { speed: { type: "number" } },
  };
  const scene = {
    schemaVersion: 1, id: "scene-extensions", name: "Extensions",
    settings: { nativeSetting: { enabled: true } },
    extensionMetadata: { keep: true },
    rootNodes: [{
      id: "node-extensions", name: "Root", active: true, editorMetadata: { selected: true },
      transform: {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5,
        legacyPivot: { keep: true },
      },
      components: [{
        id: "component-extensions", typeId: schema.typeId, schemaVersion: 1, enabled: true,
        customComponentMetadata: { keep: true },
        properties: { speed: 2, pluginProperty: { keep: true } },
      }],
      children: [],
    }],
  };
  const result = validateSceneDocument(scene, {
    componentSchemas: new Map([[schema.typeId, schema]]),
    registeredComponentTypes: new Set([schema.typeId]),
  });
  assert.equal(result.valid, false);
  assert.equal(result.value, undefined);
  assert.deepEqual(result.diagnostics.map((item) => item.path).sort(), [
    "rootNodes[0].components[0].customComponentMetadata",
    "rootNodes[0].editorMetadata",
    "rootNodes[0].transform.legacyPivot",
    "scene.extensionMetadata",
  ]);
  assert.ok(result.diagnostics.some((item) =>
    item.code === "COMPONENT_UNKNOWN_PROPERTY" &&
    item.propertyName === "pluginProperty" &&
    item.severity === "warning",
  ));
  const extensionOnly = validateSceneDocument({
    schemaVersion: 1,
    id: "scene-component-extension",
    name: "Component Extension",
    settings: {},
    rootNodes: [{
      id: "node-extension",
      name: "Node",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "component-extension",
        typeId: schema.typeId,
        schemaVersion: 1,
        enabled: true,
        properties: { speed: 2, pluginProperty: { keep: true } },
      }],
      children: [],
    }],
  }, {
    componentSchemas: new Map([[schema.typeId, schema]]),
    registeredComponentTypes: new Set([schema.typeId]),
  });
  assert.equal(extensionOnly.valid, true);
  assert.deepEqual(extensionOnly.value?.rootNodes[0]?.components[0]?.properties.pluginProperty, { keep: true });

  const settings = validateSceneDocument({
    schemaVersion: 1, id: "scene-settings", name: "Settings",
    settings: { editor: { gridSize: 16 } }, rootNodes: [],
  });
  assert.equal(settings.valid, true);
  assert.deepEqual(settings.value?.settings, { editor: { gridSize: 16 } });
});

test("validates Component Node references against the resolved Scene node kinds", () => {
  const schema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId: "com.codogma.test.image-target",
    name: "Image Target",
    version: "1.0.0",
    properties: {
      target: { type: "node", nodeKinds: ["Image"], allowSelf: false },
    },
  };
  const scene = {
    schemaVersion: 1,
    id: "scene-node-kind",
    name: "Node Kind",
    settings: {},
    rootNodes: [
      {
        id: "node-owner",
        name: "Owner",
        active: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [{
          id: "component-owner",
          typeId: schema.typeId,
          schemaVersion: 1,
          enabled: true,
          properties: { target: { nodeId: "node-image" } },
        }],
        children: [],
      },
      {
        id: "node-image",
        name: "Image",
        active: true,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
        components: [],
        children: [],
      },
    ],
  };
  const context = {
    componentSchemas: new Map([[schema.typeId, schema]]),
    registeredComponentTypes: new Set([schema.typeId]),
    nodeKinds: new Map<string, NodeReferenceKind>([
      ["node-owner", "Node"],
      ["node-image", "Image"],
    ]),
  };
  const valid = validateSceneDocument(scene, context);
  assert.equal(valid.valid, true);

  const invalid = validateSceneDocument(scene, {
    ...context,
    nodeKinds: new Map<string, NodeReferenceKind>([
      ["node-owner", "Node"],
      ["node-image", "Text"],
    ]),
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.diagnostics.some((item) =>
    item.code === "COMPONENT_INVALID_REFERENCE" &&
    item.propertyName === "target" &&
    item.path === "rootNodes[0].components[0].properties.target",
  ));
});

test("rejects unknown Prefab and root Node fields at the native boundary", () => {
  const result = validatePrefabDocument({
    schemaVersion: 1, id: "prefab-extensions", name: "Extensions",
    pluginMetadata: { keep: true },
    root: {
      id: "prefab-root", name: "Root", active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [], children: [], customNodeMetadata: { keep: true },
    },
  });
  assert.equal(result.valid, false);
  assert.equal(result.value, undefined);
  assert.deepEqual(result.diagnostics.map((item) => item.path).sort(), [
    "prefab.pluginMetadata", "root.customNodeMetadata",
  ]);
});

test("rejects future Scene and Prefab versions with explicit version diagnostics", () => {
  const scene = {
    schemaVersion: 2,
    id: "scene-future",
    name: "Future",
    rootNodes: [],
    settings: {},
  };
  const prefab = {
    schemaVersion: 3,
    id: "prefab-future",
    name: "Future",
    root: {},
  };

  for (const result of [validateSceneDocument(scene), validatePrefabDocument(prefab)]) {
    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.code, "PROJECT_UNSUPPORTED_VERSION");
    assert.equal(result.diagnostics[0]?.path, "schemaVersion");
  }
});

test("rejects Scene and Prefab accessors without executing their getters", () => {
  let getterCalls = 0;
  const sceneNode = {
    id: "scene-accessor-node",
    name: "Node",
    active: true,
    transform: {
      x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5,
    },
    components: [],
    children: [],
  };
  Object.defineProperty(sceneNode, "extensionData", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { unsafe: true };
    },
  });
  const scene = {
    schemaVersion: 1,
    id: "scene-accessor",
    name: "Accessor Scene",
    rootNodes: [sceneNode],
    settings: {},
  };

  const prefabRoot = {
    id: "prefab-accessor-root",
    name: "Prefab root",
    active: true,
    transform: {
      x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5,
    },
    components: [],
    children: [],
  };
  Object.defineProperty(prefabRoot, "extensionData", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { unsafe: true };
    },
  });
  const prefab = {
    schemaVersion: 1,
    id: "prefab-accessor",
    name: "Accessor Prefab",
    root: prefabRoot,
  };

  assert.equal(validateSceneDocument(scene).valid, false);
  assert.equal(validatePrefabDocument(prefab).valid, false);
  assert.equal(getterCalls, 0);
});

test("rejects Component instance schemaVersion values below one", () => {
  const scene = {
    schemaVersion: 1,
    id: "scene-invalid-component-version",
    name: "Invalid Component",
    rootNodes: [{
      id: "node-invalid-component-version",
      name: "Node",
      active: true,
      transform: {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5,
      },
      components: [{
        id: "component-invalid-version",
        typeId: "com.codogma.test.invalid-version",
        schemaVersion: 0,
        enabled: true,
        properties: {},
      }],
      children: [],
    }],
    settings: {},
  };
  for (const schemaVersion of [0, -1, 1.5]) {
    const input = structuredClone(scene);
    input.rootNodes[0]!.components[0]!.schemaVersion = schemaVersion;
    const result = validateSceneDocument(input);
    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some((item) =>
      item.code === "COMPONENT_INVALID_SCHEMA" &&
      item.path === "rootNodes[0].components[0].schemaVersion"));
  }
});

test("rejects cyclic Scene Node graphs before recursive validation", () => {
  const root: {
    id: string;
    name: string;
    active: boolean;
    transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number; originX: number; originY: number };
    components: unknown[];
    children: unknown[];
  } = {
    id: "node-cycle",
    name: "Cycle",
    active: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    components: [],
    children: [],
  };
  root.children.push(root);
  const result = validateSceneDocument({
    schemaVersion: 1,
    id: "scene-cycle",
    name: "Cycle",
    rootNodes: [root],
    settings: {},
  });
  assert.equal(result.valid, false);
});


test("reports Project, Scene, Node and Prefab envelope errors at exact paths", () => {
  const projectCases: Array<[Record<string, unknown>, string]> = [
    [{ ...validProject, id: "project/invalid" }, "id"],
    [{ ...validProject, name: "   " }, "name"],
    [{ ...validProject, scenes: "invalid" }, "scenes"],
    [{ ...validProject, runtime: { adapterId: "", settings: {} } }, "runtime.adapterId"],
    [{ ...validProject, runtime: { adapterId: "phaser", settings: null } }, "runtime.settings"],
  ];
  for (const [input, expectedPath] of projectCases) {
    assert.equal(validateProjectDocument(input).diagnostics[0]?.path, expectedPath);
  }

  const node = {
    id: "node-field-paths",
    name: "Root",
    active: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
    components: [],
    children: [],
  };
  const scene = {
    schemaVersion: 1,
    id: "scene-field-paths",
    name: "Paths",
    rootNodes: [node],
    settings: {},
  };
  const sceneCases: Array<[Record<string, unknown>, string]> = [
    [{ ...scene, id: "scene/invalid" }, "id"],
    [{ ...scene, name: "" }, "name"],
    [{ ...scene, rootNodes: null }, "rootNodes"],
    [{ ...scene, settings: [] }, "settings"],
    [{ ...scene, rootNodes: [{ ...node, name: "" }] }, "rootNodes[0].name"],
    [{ ...scene, rootNodes: [{ ...node, active: "yes" }] }, "rootNodes[0].active"],
    [{ ...scene, rootNodes: [{ ...node, transform: null }] }, "rootNodes[0].transform"],
    [{ ...scene, rootNodes: [{ ...node, components: "invalid" }] }, "rootNodes[0].components"],
    [{ ...scene, rootNodes: [{ ...node, children: "invalid" }] }, "rootNodes[0].children"],
  ];
  for (const [input, expectedPath] of sceneCases) {
    assert.equal(validateSceneDocument(input).diagnostics[0]?.path, expectedPath);
  }

  const prefab = {
    schemaVersion: 1,
    id: "prefab-field-paths",
    name: "Paths",
    root: node,
  };
  const prefabCases: Array<[Record<string, unknown>, string]> = [
    [{ ...prefab, id: "prefab/invalid" }, "id"],
    [{ ...prefab, name: "" }, "name"],
    [{ ...prefab, root: null }, "root"],
  ];
  for (const [input, expectedPath] of prefabCases) {
    assert.equal(validatePrefabDocument(input).diagnostics[0]?.path, expectedPath);
  }
});

test("rejects unsafe property path segments in Prefab overrides", () => {
  const prefab: PrefabDocumentV1 = {
    schemaVersion: 1,
    id: "prefab-safe-path",
    name: "Safe Path",
    root: {
      id: "prefab-root",
      name: "Root",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    },
  };
  const scene = {
    schemaVersion: 1,
    id: "scene-safe-override",
    name: "Safe Override",
    settings: {},
    rootNodes: [{
      id: "instance-safe-override",
      name: "Instance",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
      prefabInstance: {
        prefabId: prefab.id,
        overrides: [{
          targetNodeId: "prefab-root",
          propertyPath: "__proto__.polluted",
          value: true,
        }],
      },
    }],
  };
  const result = validateSceneDocument(scene, { prefabs: new Map([[prefab.id, prefab]]) });
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item) =>
    item.path === "rootNodes[0].prefabInstance.overrides[0].propertyPath" &&
    item.message.includes("safe identifier segments"),
  ));
});

test("rejects unsupported and malformed Node-level Prefab overrides", () => {
  const prefab: PrefabDocumentV1 = {
    schemaVersion: 1,
    id: "prefab-node-overrides",
    name: "Node Overrides",
    root: {
      id: "prefab-node",
      name: "Node",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
    },
  };
  const makeScene = (propertyPath: string, value: unknown) => ({
    schemaVersion: 1,
    id: "scene-node-overrides",
    name: "Scene",
    settings: {},
    rootNodes: [{
      id: "instance-node",
      name: "Instance",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [],
      children: [],
      prefabInstance: {
        prefabId: prefab.id,
        overrides: [{ targetNodeId: prefab.root.id, propertyPath, value }],
      },
    }],
  });
  for (const [propertyPath, value] of [
    ["alpha", 0.5],
    ["name", ""],
    ["name", 12],
    ["active", "false"],
    ["transform.x", "10"],
    ["transform.scaleZ", 1],
  ] as const) {
    const result = validateSceneDocument(makeScene(propertyPath, value), {
      prefabs: new Map([[prefab.id, prefab]]),
    });
    assert.equal(result.valid, false, `expected "${propertyPath}" override to be rejected`);
    assert.ok(result.diagnostics.some((item) =>
      item.path === "rootNodes[0].prefabInstance.overrides[0].propertyPath" &&
      item.message.includes("Node-level Prefab overrides"),
    ));
  }
  for (const [propertyPath, value] of [
    ["name", "Renamed"],
    ["active", false],
    ["transform.x", 20],
    ["transform.rotation", Math.PI],
  ] as const) {
    const result = validateSceneDocument(makeScene(propertyPath, value), {
      prefabs: new Map([[prefab.id, prefab]]),
    });
    assert.equal(result.valid, true, `expected "${propertyPath}" override to remain valid`);
  }
});
