import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ComponentRegistry,
  ProjectSceneLoader,
  SceneLoaderError,
  parseProjectDocument,
  type AssetReference,
  type ComponentTypeDefinition,
  type ProjectDocumentV1,
  type SceneDocumentV1,
} from "../src/index.js";
import { componentDefinition as followTargetDefinition } from "./fixtures/acceptance-project/src/FollowTarget.js";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures/acceptance-project");
const projectContent = readFileSync(resolve(fixtureRoot, "project.json"), "utf8");
const sceneContent = readFileSync(resolve(fixtureRoot, "scenes/Level.cge-scene.json"), "utf8");
const baseDefinition: ComponentTypeDefinition = followTargetDefinition;

function fixtureProject(): ProjectDocumentV1 {
  const parsed = parseProjectDocument(projectContent);
  assert.ok(parsed.value);
  return JSON.parse(JSON.stringify(parsed.value)) as ProjectDocumentV1;
}

function fixtureScene(): SceneDocumentV1 {
  return JSON.parse(sceneContent) as SceneDocumentV1;
}

function registryWith(definition: ComponentTypeDefinition = baseDefinition): ComponentRegistry {
  const registry = new ComponentRegistry();
  registry.register(definition);
  return registry;
}

interface TrackingCallbacks {
  onCreate?: (instanceId: string) => void;
  onEnable?: (instanceId: string) => void;
  onStart?: (instanceId: string) => void;
  onUpdate?: (instanceId: string, deltaSeconds: number) => void;
  onDisable?: (instanceId: string) => void;
  onDestroy?: (instanceId: string) => void;
}

function trackingDefinition(events: string[], callbacks: TrackingCallbacks = {}): ComponentTypeDefinition {
  return {
    schema: baseDefinition.schema,
    create(context) {
      return {
        onCreate() {
          events.push("create:" + context.instanceId);
          callbacks.onCreate?.(context.instanceId);
        },
        onEnable() {
          events.push("enable:" + context.instanceId);
          callbacks.onEnable?.(context.instanceId);
        },
        onStart() {
          events.push("start:" + context.instanceId);
          callbacks.onStart?.(context.instanceId);
        },
        onUpdate(deltaSeconds) {
          events.push("update:" + context.instanceId);
          callbacks.onUpdate?.(context.instanceId, deltaSeconds);
        },
        onDisable() {
          events.push("disable:" + context.instanceId);
          callbacks.onDisable?.(context.instanceId);
        },
        onDestroy() {
          events.push("destroy:" + context.instanceId);
          callbacks.onDestroy?.(context.instanceId);
        },
      };
    },
  };
}

interface LoaderOverrides {
  project?: ProjectDocumentV1;
  registry?: ComponentRegistry;
  readAssetDocument?: (asset: AssetReference, signal: AbortSignal) => Promise<string>;
}

function loaderFor(
  content: string = sceneContent,
  overrides: LoaderOverrides = {},
): ProjectSceneLoader {
  return new ProjectSceneLoader({
    project: overrides.project ?? fixtureProject(),
    registry: overrides.registry ?? registryWith(),
    readAssetDocument: overrides.readAssetDocument ?? (async (asset, signal) => {
      assert.equal(asset.kind, "scene");
      if (signal.aborted) throw signal.reason;
      return content;
    }),
  });
}

async function expectLoadError(loader: ProjectSceneLoader, code: string): Promise<SceneLoaderError> {
  let failure: unknown;
  try {
    await loader.load({ sceneId: "scene-level", signal: new AbortController().signal });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof SceneLoaderError, "load must fail with a machine-readable SceneLoaderError");
  assert.equal(failure.code, code);
  assert.ok(failure.diagnostics.some((item) => item.code === code));
  return failure;
}

function changedScene(change: (scene: SceneDocumentV1) => void): string {
  const scene = fixtureScene();
  change(scene);
  return JSON.stringify(scene);
}

test("loads a deterministic inactive hierarchy and preserves stable runtime identities", async () => {
  const scene = fixtureScene();
  const player = scene.rootNodes[0];
  const enemy = scene.rootNodes[1];
  assert.ok(player);
  assert.ok(enemy);
  player.children = [enemy];
  scene.rootNodes = [player];

  const events: string[] = [];
  const captured = new Map<string, unknown>();
  const definition = trackingDefinition(events);
  const registry = new ComponentRegistry();
  registry.register({
    ...definition,
    create(context) {
      captured.set(context.instanceId, context.properties.speed);
      return definition.create(context);
    },
  });
  const loader = loaderFor(JSON.stringify(scene), { registry });
  const progress: number[] = [];
  const session = await loader.load({
    sceneId: "scene-level",
    signal: new AbortController().signal,
    onProgress: (item) => progress.push(item.progress),
  });

  assert.equal(session.state, "inactive");
  assert.equal(session.isActive, false);
  assert.equal(session.isPaused, false);
  assert.equal(session.sceneId, "scene-level");
  assert.equal(session.world.isDisposed, false);
  assert.deepEqual(events, ["create:component-follow-player", "create:component-follow-enemy"]);
  assert.equal(captured.get("component-follow-player"), 4);
  assert.equal(captured.get("component-follow-enemy"), 2);

  const root = session.graph.rootNodes[0];
  assert.ok(root);
  assert.equal(root.id, "node-player");
  assert.equal(root.parentId, undefined);
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0]?.id, "node-enemy");
  assert.equal(root.children[0]?.parentId, "node-player");
  assert.equal(root.children[0]?.transform.x, 240);
  assert.deepEqual(root.componentInstanceIds, ["component-follow-player"]);
  assert.equal(session.graph.getNode("node-enemy"), root.children[0]);
  assert.equal(session.graph.getComponent("component-follow-player")?.nodeId, "node-player");
  assert.equal(session.graph.getComponent("component-follow-enemy")?.nodeId, "node-enemy");
  assert.equal(session.graph.getAsset("asset-player-sprite")?.kind, "image");
  assert.deepEqual(progress, [...progress].sort((a, b) => a - b));
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
  assert.equal(Object.isFrozen(session.graph.document.rootNodes), true);

  session.activate();
  assert.equal(session.state, "active");
  assert.equal(root.active, true);
  assert.equal(root.children[0]?.active, true);
  assert.deepEqual(events.slice(2), ["enable:component-follow-player", "enable:component-follow-enemy"]);

  session.world.update(0.016);
  assert.equal(session.graph.getComponent("component-follow-player")?.started, true);
  assert.ok(events.includes("start:component-follow-player"));
  assert.ok(events.includes("update:component-follow-player"));

  session.pause();
  assert.equal(session.isPaused, true);
  session.resume();
  assert.equal(session.isPaused, false);
  session.deactivate();
  assert.equal(session.state, "inactive");
  assert.equal(root.active, false);
  assert.equal(root.children[0]?.active, false);
  assert.ok(events.includes("disable:component-follow-player"));
  assert.ok(events.includes("disable:component-follow-enemy"));

  session.dispose();
  session.dispose();
  assert.equal(session.state, "disposed");
  assert.equal(session.world.isDisposed, true);
  assert.equal(events.filter((event) => event === "destroy:component-follow-player").length, 1);
  assert.equal(events.filter((event) => event === "destroy:component-follow-enemy").length, 1);
  assert.throws(() => session.activate(), (error: unknown) =>
    error instanceof SceneLoaderError && error.code === "CORE_WORLD_DISPOSED",
  );
});

test("activation honors parent activity and never activates children of an inactive parent", async () => {
  const scene = fixtureScene();
  const parent = scene.rootNodes[0];
  const child = scene.rootNodes[1];
  assert.ok(parent);
  assert.ok(child);
  parent.active = false;
  parent.children = [child];
  scene.rootNodes = [parent];

  const events: string[] = [];
  const session = await loaderFor(JSON.stringify(scene), {
    registry: registryWith(trackingDefinition(events)),
  }).load({ sceneId: scene.id, signal: new AbortController().signal });

  session.activate();
  assert.equal(session.state, "active");
  assert.equal(session.graph.getNode(parent.id)?.active, false);
  assert.equal(session.graph.getNode(child.id)?.active, false);
  assert.equal(events.includes("enable:component-follow-player"), false);
  assert.equal(events.includes("enable:component-follow-enemy"), false);
  session.dispose();
  assert.equal(session.state, "disposed");
});

test("resolves Asset and Prefab references through the Project stable-ID catalog", async () => {
  const project = fixtureProject();
  project.assets.push({ id: "asset-player-prefab", path: "prefabs/player.cge-prefab.json", kind: "prefab" });
  project.prefabs.push({ id: "prefab-player", assetId: "asset-player-prefab" });
  const scene = fixtureScene();
  const first = scene.rootNodes[0];
  assert.ok(first);
  first.prefabInstance = { prefabId: "prefab-player", overrides: [] };

  const session = await loaderFor(JSON.stringify(scene), { project }).load({
    sceneId: scene.id,
    signal: new AbortController().signal,
  });
  assert.equal(session.graph.getPrefab("prefab-player")?.assetId, "asset-player-prefab");
  assert.equal(session.graph.getPrefab("unknown-prefab"), undefined);
  assert.equal(session.graph.document.rootNodes[0]?.prefabInstance?.prefabId, "prefab-player");
  session.dispose();
});

test("returns structured diagnostics for invalid schema, references and module resolution", async () => {
  const invalidCases: Array<{
    name: string;
    content?: string;
    project?: ProjectDocumentV1;
    registry?: ComponentRegistry;
    code: string;
  }> = [
    {
      name: "invalid declared property",
      content: changedScene((scene) => {
        const component = scene.rootNodes[0]?.components[0];
        assert.ok(component);
        component.properties.speed = -1;
      }),
      code: "COMPONENT_INVALID_VALUE",
    },
    {
      name: "missing Asset reference",
      content: changedScene((scene) => {
        const component = scene.rootNodes[0]?.components[0];
        assert.ok(component);
        component.properties.sprite = { assetId: "missing-asset" };
      }),
      code: "COMPONENT_INVALID_REFERENCE",
    },
    {
      name: "missing Node reference",
      content: changedScene((scene) => {
        const component = scene.rootNodes[0]?.components[0];
        assert.ok(component);
        component.properties.target = { nodeId: "missing-node" };
      }),
      code: "COMPONENT_INVALID_REFERENCE",
    },
    {
      name: "unsupported Scene schema version",
      content: changedScene((scene) => {
        (scene as unknown as { schemaVersion: number }).schemaVersion = 99;
      }),
      code: "PROJECT_UNSUPPORTED_VERSION",
    },
    {
      name: "missing Prefab reference",
      content: changedScene((scene) => {
        const node = scene.rootNodes[0];
        assert.ok(node);
        node.prefabInstance = { prefabId: "missing-prefab", overrides: [] };
      }),
      code: "PROJECT_INVALID_REFERENCE",
    },
    {
      name: "undeclared Component module",
      project: (() => {
        const project = fixtureProject();
        project.componentModules = [];
        return project;
      })(),
      code: "PROJECT_INVALID_REFERENCE",
    },
    {
      name: "module implementation version mismatch",
      project: (() => {
        const project = fixtureProject();
        const module = project.componentModules[0];
        assert.ok(module);
        module.version = "2.0.0";
        return project;
      })(),
      code: "COMPONENT_INVALID_SCHEMA",
    },
    {
      name: "missing registered Component implementation",
      registry: new ComponentRegistry(),
      code: "COMPONENT_UNKNOWN_TYPE",
    },
  ];

  for (const invalid of invalidCases) {
    const loader = loaderFor(invalid.content ?? sceneContent, {
      ...(invalid.project === undefined ? {} : { project: invalid.project }),
      ...(invalid.registry === undefined ? {} : { registry: invalid.registry }),
    });
    await expectLoadError(loader, invalid.code);
  }
});

test("rejects a Scene document whose ID differs from the requested Project Scene", async () => {
  const content = changedScene((scene) => { scene.id = "different-scene"; });
  await expectLoadError(loaderFor(content), "PROJECT_INVALID_REFERENCE");
});

test("rolls back every created Component when a later onCreate fails", async () => {
  const events: string[] = [];
  const definition = trackingDefinition(events, {
    onCreate(instanceId) {
      if (instanceId === "component-follow-enemy") throw new Error("enemy initialization failed");
    },
  });
  const loader = loaderFor(sceneContent, { registry: registryWith(definition) });
  await expectLoadError(loader, "SCENE_LOAD_FAILED");

  assert.deepEqual(events, [
    "create:component-follow-player",
    "create:component-follow-enemy",
    "destroy:component-follow-enemy",
    "destroy:component-follow-player",
  ]);
});

test("cancellation during Component onCreate disposes the partial inactive world", async () => {
  const controller = new AbortController();
  const events: string[] = [];
  const definition = trackingDefinition(events, {
    onCreate(instanceId) {
      if (instanceId === "component-follow-player") controller.abort("cancelled in onCreate");
    },
  });
  const loader = loaderFor(sceneContent, { registry: registryWith(definition) });
  let failure: unknown;
  try {
    await loader.load({ sceneId: "scene-level", signal: controller.signal });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof SceneLoaderError);
  assert.equal(failure.code, "SCENE_LOAD_ABORTED");
  assert.deepEqual(events, ["create:component-follow-player", "destroy:component-follow-player"]);
});

test("activation failure rolls back previously enabled Nodes instead of leaving a partial active session", async () => {
  const events: string[] = [];
  const definition = trackingDefinition(events, {
    onEnable(instanceId) {
      if (instanceId === "component-follow-enemy") throw new Error("enable failed");
    },
  });
  const session = await loaderFor(sceneContent, {
    registry: registryWith(definition),
  }).load({ sceneId: "scene-level", signal: new AbortController().signal });

  assert.throws(() => session.activate(), (error: unknown) =>
    error instanceof SceneLoaderError && error.code === "SCENE_LOAD_FAILED",
  );
  assert.equal(session.state, "inactive");
  assert.equal(session.graph.getNode("node-player")?.active, false);
  assert.equal(session.graph.getNode("node-enemy")?.active, false);
  assert.ok(events.includes("disable:component-follow-player"));
  session.dispose();
  assert.equal(session.state, "disposed");
});

test("dispose remains idempotent even when Component cleanup reports an error", async () => {
  let destroyCount = 0;
  const events: string[] = [];
  const definition = trackingDefinition(events, {
    onDestroy() {
      destroyCount += 1;
      throw new Error("cleanup failure");
    },
  });
  const session = await loaderFor(sceneContent, {
    registry: registryWith(definition),
  }).load({ sceneId: "scene-level", signal: new AbortController().signal });

  assert.throws(() => session.dispose(), (error: unknown) =>
    error instanceof SceneLoaderError && error.code === "SCENE_LOAD_FAILED",
  );
  assert.equal(session.state, "disposed");
  assert.equal(destroyCount, 2);
  assert.doesNotThrow(() => session.dispose());
  assert.equal(destroyCount, 2);
});

test("cancellation before load does not call the host document resolver", async () => {
  let resolverCalls = 0;
  const controller = new AbortController();
  controller.abort("cancel before start");
  const loader = loaderFor(sceneContent, {
    readAssetDocument: async () => {
      resolverCalls += 1;
      return sceneContent;
    },
  });
  let failure: unknown;
  try {
    await loader.load({ sceneId: "scene-level", signal: controller.signal });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof SceneLoaderError);
  assert.equal(failure.code, "SCENE_LOAD_ABORTED");
  assert.equal(resolverCalls, 0);
});


test("Scene Loader source imports only host-neutral Core modules", () => {
  const source = readFileSync(resolve(process.cwd(), "src/services/scene-loader.ts"), "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(imports.length > 0);
  assert.ok(imports.every((specifier) => specifier?.startsWith(".")));
  assert.doesNotMatch(source, /\brequestAnimationFrame\b|\bdocument\.createElement\b|\bwindow\./);
});
