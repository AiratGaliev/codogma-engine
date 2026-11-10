import assert from "node:assert/strict";
import test from "node:test";
import { resolveProjectComponentRegistry } from "../dist/index.js";

const TYPE_A = "com.codogma.test.component-a";
const TYPE_B = "com.codogma.test.component-b";

function createProject() {
  return {
    schemaVersion: 1,
    id: "resolver-test-project",
    name: "Resolver Test",
    scenes: [],
    assets: [
      { id: "asset-module-a", path: "src/ComponentA.ts", kind: "script" },
      { id: "asset-module-b", path: "src/ComponentB.ts", kind: "script" },
    ],
    prefabs: [],
    componentModules: [
      { typeId: TYPE_A, moduleAssetId: "asset-module-a", version: "1.0.0" },
      { typeId: TYPE_B, moduleAssetId: "asset-module-b", version: "2.0.0" },
    ],
    runtime: { adapterId: "phaser", settings: {} },
  };
}

function definition(typeId, version) {
  return {
    schema: { schemaVersion: 1, typeId, name: typeId, version, properties: {} },
    create() { return {}; },
  };
}

test("resolves only requested Project Component modules in stable order", async () => {
  const project = createProject();
  const loadedAssets = [];
  const result = await resolveProjectComponentRegistry({
    project,
    requiredTypeIds: [TYPE_B, TYPE_A, TYPE_B],
    signal: new AbortController().signal,
    async loadModule(asset) {
      loadedAssets.push(asset.id);
      return asset.id === "asset-module-a"
        ? definition(TYPE_A, "1.0.0")
        : definition(TYPE_B, "2.0.0");
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.loadedTypeIds, [TYPE_A, TYPE_B]);
  assert.deepEqual(loadedAssets, ["asset-module-a", "asset-module-b"]);
  assert.equal(result.registry?.has(TYPE_A), true);
  assert.equal(result.registry?.has(TYPE_B), true);
});

test("fails closed when a required type is absent from Project.componentModules", async () => {
  const result = await resolveProjectComponentRegistry({
    project: createProject(),
    requiredTypeIds: ["com.codogma.test.not-declared"],
    signal: new AbortController().signal,
    async loadModule() {
      assert.fail("The host loader must not run for an undeclared Component type.");
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.registry, undefined);
  assert.ok(result.diagnostics.some((item) => item.code === "PROJECT_BUILD_COMPONENT_MODULE_MISSING"));
});

test("rejects a loaded definition whose stable typeId or version differs from Project", async () => {
  const result = await resolveProjectComponentRegistry({
    project: createProject(),
    requiredTypeIds: [TYPE_A],
    signal: new AbortController().signal,
    async loadModule() {
      return definition(TYPE_A, "9.9.9");
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.registry, undefined);
  assert.ok(result.diagnostics.some((item) => item.code === "COMPONENT_INVALID_SCHEMA"));
});

test("converts an unresolved script module into a machine-readable build diagnostic", async () => {
  const result = await resolveProjectComponentRegistry({
    project: createProject(),
    requiredTypeIds: [TYPE_A],
    signal: new AbortController().signal,
    async loadModule() {
      throw new Error("module file is not available");
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.registry, undefined);
  assert.ok(result.diagnostics.some((item) => item.code === "PROJECT_BUILD_MODULE_MISSING"));
});

test("does not return a partial registry when module resolution is cancelled", async () => {
  const controller = new AbortController();
  const result = await resolveProjectComponentRegistry({
    project: createProject(),
    requiredTypeIds: [TYPE_A, TYPE_B],
    signal: controller.signal,
    async loadModule(asset) {
      controller.abort();
      return asset.id === "asset-module-a"
        ? definition(TYPE_A, "1.0.0")
        : definition(TYPE_B, "2.0.0");
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.registry, undefined);
  assert.ok(result.diagnostics.some((item) => item.code === "SCENE_LOAD_ABORTED"));
});

test("validates Project Model before invoking the host module loader", async () => {
  let loaded = false;
  const result = await resolveProjectComponentRegistry({
    project: { schemaVersion: 99 },
    requiredTypeIds: [TYPE_A],
    signal: new AbortController().signal,
    async loadModule() {
      loaded = true;
      return definition(TYPE_A, "1.0.0");
    },
  });

  assert.equal(result.valid, false);
  assert.equal(loaded, false);
  assert.ok(result.diagnostics.length > 0);
});
