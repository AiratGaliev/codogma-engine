import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ComponentRegistry,
  ProjectSceneLoader,
  parseProjectDocument,
  type ComponentTypeDefinition,
  type ProjectDocumentV1,
  type ProjectRuntimeSceneSession,
  type SceneLoadRequest,
} from "@codogma/cge";
import {
  createPhaserRuntimeSceneLoader,
  PhaserRuntimeAdapterError,
  type RuntimeGraphSceneLoader,
} from "../src/index.js";
import { createMockPhaserHost, type MockGameObject } from "./support/mock-phaser.js";

const fixtureRoot = resolve(process.cwd(), "../cge/tests/fixtures/acceptance-project");
const projectText = readFileSync(resolve(fixtureRoot, "project.json"), "utf8");
const sceneText = readFileSync(resolve(fixtureRoot, "scenes/Level.cge-scene.json"), "utf8");
const componentTypeId = "com.codogma.acceptance.follow-target";

function projectFixture(): ProjectDocumentV1 {
  const parsed = parseProjectDocument(projectText);
  assert.ok(parsed.value);
  return parsed.value;
}

function componentDefinition(): ComponentTypeDefinition {
  return {
    schema: {
      schemaVersion: 1,
      typeId: componentTypeId,
      name: "Follow Target",
      version: "1.0.0",
      properties: {
        sprite: { type: "asset", assetKinds: ["image"], required: true },
        target: { type: "node", allowSelf: false, required: true },
        speed: { type: "number", min: 0, defaultValue: 1 },
      },
    },
    create() {
      return { onUpdate() {} };
    },
  };
}

function coreLoader(content = sceneText): ProjectSceneLoader {
  const registry = new ComponentRegistry();
  registry.register(componentDefinition());
  return new ProjectSceneLoader({
    project: projectFixture(),
    registry,
    readAssetDocument: async (_asset, signal) => {
      if (signal.aborted) throw signal.reason;
      return content;
    },
  });
}

function request(): SceneLoadRequest {
  return { sceneId: "scene-level", signal: new AbortController().signal };
}

function componentViews(): { count: number; ids: string[]; objects: MockGameObject[] } {
  return { count: 0, ids: [], objects: [] };
}

test("maps the native Scene Loader hierarchy, Core-owned transforms and stable Component identities", async () => {
  const document = JSON.parse(sceneText) as {
    rootNodes: Array<{ id: string; children: unknown[] }>;
  };
  const player = document.rootNodes[0];
  const enemy = document.rootNodes[1];
  assert.ok(player);
  assert.ok(enemy);
  player.children = [enemy];
  document.rootNodes = [player];

  const host = createMockPhaserHost();
  const created = componentViews();
  const adapter = createPhaserRuntimeSceneLoader(host.scene, coreLoader(JSON.stringify(document)), {
    projectId: "acceptance-project",
    componentViewFactories: {
      [componentTypeId]({ node, component, document: componentDocument }) {
        assert.ok(Object.isFrozen(node));
        assert.ok(Object.isFrozen(node.transform));
        assert.ok(Object.isFrozen(node.children));
        assert.ok(Object.isFrozen(component));
        const object = new MockGameObject(host.scene as unknown as object);
        componentDocument.properties.speed = 999;
        created.count += 1;
        created.ids.push(component.id);
        created.objects.push(object);
        return object as unknown as import("phaser").GameObjects.GameObject;
      },
    },
  });

  const session = await adapter.load(request());
  const playerView = session.getNodeView("node-player");
  const enemyView = session.getNodeView("node-enemy");
  const playerComponent = session.getComponentView("component-follow-player");
  const enemyComponent = session.getComponentView("component-follow-enemy");

  assert.ok(playerView);
  assert.ok(enemyView);
  assert.ok(playerComponent);
  assert.ok(enemyComponent);
  assert.equal(playerView.list[0], playerComponent);
  assert.equal(playerView.list[1], enemyView);
  assert.equal(enemyView.list[0], enemyComponent);
  assert.equal(session.getNodeId(playerView), "node-player");
  assert.equal(session.getNodeId(enemyView), "node-enemy");
  assert.equal(session.getComponentInstanceId(playerComponent), "component-follow-player");
  assert.equal(session.getComponentInstanceId(enemyComponent), "component-follow-enemy");
  assert.notEqual(playerComponent, enemyComponent);
  assert.equal(created.count, 2);
  assert.deepEqual(created.ids, ["component-follow-player", "component-follow-enemy"]);
  assert.equal((playerView as unknown as MockGameObject).x, 80);
  assert.equal((playerView as unknown as MockGameObject).y, 120);
  assert.equal((enemyView as unknown as MockGameObject).x, 240);
  assert.equal((playerComponent as unknown as MockGameObject).originX, 0.5);
  assert.equal(session.coreSession.graph.document.rootNodes[0]?.components[0]?.properties.speed, 4);

  await session.dispose();
});

test("uses the Phaser Scene UPDATE event as the only frame source and syncs Core Transform mutations", async () => {
  const host = createMockPhaserHost();
  const observedDeltas: number[] = [];
  const adapter = createPhaserRuntimeSceneLoader(host.scene, coreLoader(), {
    projectId: "acceptance-project",
    update(deltaSeconds, session) {
      observedDeltas.push(deltaSeconds);
      const player = session.graph.getNode("node-player");
      assert.ok(player);
      player.transform.x += 10;
    },
  });

  const session = await adapter.load(request());
  await session.activate();
  const view = session.getNodeView("node-player");
  assert.ok(view);
  assert.equal((view as unknown as MockGameObject).active, true);

  host.events.emit("update", 16, 16);
  host.events.emit("update", 32, 32);

  assert.deepEqual(observedDeltas, [0.016, 0.032]);
  assert.equal(session.graph.getNode("node-player")?.transform.x, 100);
  assert.equal((view as unknown as MockGameObject).x, 100);
  assert.equal(session.coreSession.graph.document.rootNodes[0]?.transform?.x, 80);
  assert.equal(host.events.listenerCount("update"), 1);

  await session.dispose();
  assert.equal(host.events.listenerCount("update"), 0);
});

test("pause keeps views visible but stops updates; deactivate hides them", async () => {
  const host = createMockPhaserHost();
  let updates = 0;
  const adapter = createPhaserRuntimeSceneLoader(host.scene, coreLoader(), {
    projectId: "acceptance-project",
    update() { updates += 1; },
  });
  const session = await adapter.load(request());
  const view = session.getNodeView("node-player");
  assert.ok(view);
  assert.equal((view as unknown as MockGameObject).visible, false);

  await session.activate();
  assert.equal((view as unknown as MockGameObject).visible, true);
  await session.pause();
  const pausedNode = session.coreSession.graph.getNode("node-player");
  assert.ok(pausedNode);
  pausedNode.transform.x = 175;
  host.events.emit("update", 16, 16);
  assert.equal(updates, 0);
  assert.equal((view as unknown as MockGameObject).visible, true);
  assert.equal((view as unknown as MockGameObject).x, 175);

  await session.resume();
  host.events.emit("update", 32, 16);
  assert.equal(updates, 1);

  await session.deactivate();
  assert.equal((view as unknown as MockGameObject).active, false);
  assert.equal((view as unknown as MockGameObject).visible, false);
  await session.dispose();
});

test("disabled Component views stop updating and rendering after Core commits the state", async () => {
  const host = createMockPhaserHost();
  const adapter = createPhaserRuntimeSceneLoader(host.scene, coreLoader(), {
    projectId: "acceptance-project",
    componentViewFactories: {
      [componentTypeId]() {
        return new MockGameObject(host.scene as unknown as object) as unknown as import("phaser").GameObjects.GameObject;
      },
    },
  });
  const session = await adapter.load(request());
  await session.activate();
  const view = session.getComponentView("component-follow-player");
  assert.ok(view);
  assert.equal((view as unknown as MockGameObject).visible, true);

  session.coreSession.world.setComponentEnabled("component-follow-player", false);
  session.coreSession.world.update(0);
  host.events.emit("update", 16, 16);

  assert.equal((view as unknown as MockGameObject).active, false);
  assert.equal((view as unknown as MockGameObject).visible, false);
  await session.dispose();
});

test("rejects a factory result without visibility support and rolls it back", async () => {
  const host = createMockPhaserHost();
  let coreSession: ProjectRuntimeSceneSession | undefined;
  let destroyCount = 0;
  const baseLoader = coreLoader();
  const observingLoader: RuntimeGraphSceneLoader = {
    async load(loadRequest) {
      coreSession = await baseLoader.load(loadRequest);
      return coreSession;
    },
  };
  const adapter = createPhaserRuntimeSceneLoader(host.scene, observingLoader, {
    projectId: "acceptance-project",
    componentViewFactories: {
      [componentTypeId]() {
        return {
          scene: host.scene,
          active: true,
          destroy() { destroyCount += 1; },
        } as unknown as import("phaser").GameObjects.GameObject;
      },
    },
  });

  await assert.rejects(
    adapter.load(request()),
    (error: unknown) => {
      assert.ok(error instanceof PhaserRuntimeAdapterError);
      assert.equal(error.diagnostic.code, "VIEW_CREATION_FAILED");
      assert.equal(error.diagnostic.causeMessage, "A Component view must support Phaser visibility.");
      return true;
    },
  );
  assert.equal(destroyCount, 1);
  assert.equal(host.containers.length, 1);
  assert.equal(host.containers[0]?.destroyCount, 1);
  assert.equal(coreSession?.world.isDisposed, true);
  assert.equal(host.events.listenerCount("update"), 0);
});

test("adapter failures carry Project, Scene, Node and Component identity and roll Core back", async () => {
  const host = createMockPhaserHost();
  let loadedCoreSession: ProjectRuntimeSceneSession | undefined;
  const baseLoader = coreLoader();
  const observingLoader: RuntimeGraphSceneLoader = {
    async load(loadRequest) {
      loadedCoreSession = await baseLoader.load(loadRequest);
      return loadedCoreSession;
    },
  };
  const diagnostics: unknown[] = [];
  const createdViews: MockGameObject[] = [];
  let factoryCalls = 0;
  const adapter = createPhaserRuntimeSceneLoader(host.scene, observingLoader, {
    projectId: "acceptance-project",
    onDiagnostic(diagnostic) { diagnostics.push(diagnostic); },
    componentViewFactories: {
      [componentTypeId]() {
        factoryCalls += 1;
        if (factoryCalls === 2) throw new Error("Synthetic view construction failure.");
        const view = new MockGameObject(host.scene as unknown as object);
        createdViews.push(view);
        return view as unknown as import("phaser").GameObjects.GameObject;
      },
    },
  });

  await assert.rejects(
    adapter.load(request()),
    (error: unknown) => {
      assert.ok(error instanceof PhaserRuntimeAdapterError);
      assert.equal(error.diagnostic.code, "VIEW_CREATION_FAILED");
      assert.equal(error.diagnostic.projectId, "acceptance-project");
      assert.equal(error.diagnostic.sceneId, "scene-level");
      assert.equal(error.diagnostic.nodeId, "node-enemy");
      assert.equal(error.diagnostic.componentInstanceId, "component-follow-enemy");
      assert.equal(error.diagnostic.causeMessage, "Synthetic view construction failure.");
      return true;
    },
  );
  assert.equal(loadedCoreSession?.world.isDisposed, true);
  assert.equal(createdViews.length, 1);
  assert.equal(createdViews[0]?.destroyCount, 1);
  assert.equal(host.containers.length, 2);
  assert.ok(host.containers.every((container) => container.destroyCount === 1));
  assert.equal(diagnostics.length, 1);
  assert.equal(host.events.listenerCount("update"), 0);
});


test("abort after Core load disposes the prepared session before creating Phaser views", async () => {
  const host = createMockPhaserHost();
  const controller = new AbortController();
  let coreSession: ProjectRuntimeSceneSession | undefined;
  const baseLoader = coreLoader();
  const abortingLoader: RuntimeGraphSceneLoader = {
    async load(loadRequest) {
      coreSession = await baseLoader.load(loadRequest);
      controller.abort(new Error("Synthetic cancellation after Core load."));
      return coreSession;
    },
  };
  const adapter = createPhaserRuntimeSceneLoader(host.scene, abortingLoader, {
    projectId: "acceptance-project",
  });

  await assert.rejects(
    adapter.load({ sceneId: "scene-level", signal: controller.signal }),
    /Synthetic cancellation after Core load\./,
  );
  assert.equal(coreSession?.world.isDisposed, true);
  assert.equal(host.containers.length, 0);
  assert.equal(host.events.listenerCount("update"), 0);
  assert.equal(host.events.listenerCount("shutdown"), 0);
  assert.equal(host.events.listenerCount("destroy"), 0);
});

test("repeated dispose and Phaser Scene shutdown/destroy destroy every owned view once and detach listeners", async () => {
  const host = createMockPhaserHost();
  const componentObjects: MockGameObject[] = [];
  const adapter = createPhaserRuntimeSceneLoader(host.scene, coreLoader(), {
    projectId: "acceptance-project",
    componentViewFactories: {
      [componentTypeId]() {
        const view = new MockGameObject(host.scene as unknown as object);
        componentObjects.push(view);
        return view as unknown as import("phaser").GameObjects.GameObject;
      },
    },
  });
  const session = await adapter.load(request());
  await session.activate();

  const root = session.getNodeView("node-player");
  const view = session.getComponentView("component-follow-player");
  assert.ok(root);
  assert.ok(view);

  host.events.emit("shutdown");
  host.events.emit("destroy");
  await session.dispose();
  await session.dispose();

  assert.equal((root as unknown as MockGameObject).destroyCount, 1);
  assert.equal((view as unknown as MockGameObject).destroyCount, 1);
  assert.ok(componentObjects.every((item) => item.destroyCount === 1));
  assert.equal(host.events.listenerCount("update"), 0);
  assert.equal(host.events.listenerCount("shutdown"), 0);
  assert.equal(host.events.listenerCount("destroy"), 0);
  assert.equal(session.getNodeView("node-player"), undefined);
});
