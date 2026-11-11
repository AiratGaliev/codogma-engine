import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ComponentRegistry,
  parseProjectDocument,
  type ComponentTypeDefinition,
  type ProjectDocumentV1,
} from "@codogma/cge";
import {
  createBrowserPreviewHost,
  PhaserRuntimeAdapterError,
  type BrowserPreviewErrorEvent,
  type BrowserPreviewLogEvent,
  type PhaserComponentViewContext,
} from "../src/index.js";
import type Phaser from "phaser";
import { MockContainer, MockEvents, MockGameObject } from "./support/mock-phaser.js";

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

function registryFixture(): ComponentRegistry {
  const registry = new ComponentRegistry();
  registry.register(componentDefinition());
  return registry;
}

class FakeScene {
  readonly events = new MockEvents();
  readonly add = {
    container: (): MockContainer => new MockContainer(this),
  };

  create?(): void;
}

class FakeGame {
  static instances: FakeGame[] = [];
  static skipSceneCreate = false;
  readonly events = new MockEvents();
  readonly resized: Array<{ width: number; height: number }> = [];
  readonly scale = {
    resize: (width: number, height: number): void => {
      this.resized.push({ width, height });
    },
  };
  destroyCount = 0;
  readonly scene: FakeScene;

  constructor(readonly config: Phaser.Types.Core.GameConfig) {
    const SceneClass = config.scene as unknown as new () => FakeScene;
    this.scene = new SceneClass();
    FakeGame.instances.push(this);
    if (!FakeGame.skipSceneCreate) this.scene.create?.();
  }

  destroy(removeCanvas?: boolean): void {
    assert.equal(removeCanvas, true);
    this.destroyCount += 1;
    this.scene.events.emit("shutdown");
    this.scene.events.emit("destroy");
    this.events.emit("destroy");
  }
}

const phaser = {
  AUTO: 0,
  Scale: { RESIZE: 5 },
  Core: { Events: { DESTROY: "destroy" } },
  Game: FakeGame,
  Scene: FakeScene,
} as unknown as typeof Phaser;

function createHost(options: {
  readAssetDocument?: (signal: AbortSignal) => Promise<string>;
  factory?: (context: PhaserComponentViewContext) => Phaser.GameObjects.GameObject;
} = {}) {
  return createBrowserPreviewHost({
    phaser,
    parent: {} as HTMLElement,
    project: projectFixture(),
    sceneId: "scene-level",
    registry: registryFixture(),
    readAssetDocument: async (_asset, signal) => {
      if (signal.aborted) throw signal.reason;
      return options.readAssetDocument ? options.readAssetDocument(signal) : sceneText;
    },
    componentViewFactories: {
      [componentTypeId]: (context) => options.factory
        ? options.factory(context)
        : new MockGameObject(context.scene) as unknown as Phaser.GameObjects.GameObject,
    },
  });
}

test("composes one Phaser Game with repeatable Play/Pause/Resume/Restart/Stop and terminal cleanup", async () => {
  FakeGame.instances = [];
  const views: MockGameObject[] = [];
  const host = createBrowserPreviewHost({
    phaser,
    parent: {} as HTMLElement,
    project: projectFixture(),
    sceneId: "scene-level",
    registry: registryFixture(),
    readAssetDocument: async (assetReference, signal) => {
      assert.equal(Object.isFrozen(assetReference), true);
      if (signal.aborted) throw signal.reason;
      return sceneText;
    },
    componentViewFactories: {
      [componentTypeId](context) {
        const asset = context.getAsset("asset-player-sprite");
        assert.equal(asset?.kind, "image");
        assert.equal(asset ? Object.isFrozen(asset) : false, true);
        assert.equal(context.getAsset("missing-asset"), undefined);
        const view = new MockGameObject(context.scene);
        views.push(view);
        return view as unknown as Phaser.GameObjects.GameObject;
      },
    },
  });

  const states: string[] = [];
  const logs: BrowserPreviewLogEvent[] = [];
  host.subscribe("state-change", (event) => states.push(event.current));
  host.subscribe("log", (event) => logs.push(event));

  await host.play();
  const firstSessionId = host.sessionId;
  assert.ok(firstSessionId);
  assert.equal(host.state, "running");
  assert.equal(FakeGame.instances.length, 1);
  const game = FakeGame.instances[0];
  assert.ok(game);
  assert.equal(game.scene.events.listenerCount("update"), 1);
  assert.equal(views.length, 2);

  await host.play();
  assert.equal(host.sessionId, firstSessionId);
  assert.equal(FakeGame.instances.length, 1);
  assert.equal(views.length, 2);

  await host.pause();
  assert.equal(host.state, "paused");
  assert.equal(game.scene.events.listenerCount("update"), 1);
  assert.equal(host.log("info", "paused diagnostic"), true);
  assert.equal(logs.at(-1)?.sessionId, firstSessionId);

  await host.pause();
  await host.resume();
  assert.equal(host.state, "running");
  await host.resume();

  await host.restart();
  const secondSessionId = host.sessionId;
  assert.ok(secondSessionId);
  assert.notEqual(secondSessionId, firstSessionId);
  assert.equal(host.state, "running");
  assert.equal(FakeGame.instances.length, 1);
  assert.equal(game.scene.events.listenerCount("update"), 1);
  assert.equal(views.length, 4);
  assert.ok(views.slice(0, 2).every((view) => view.destroyCount === 1));

  await host.stop();
  assert.equal(host.state, "stopped");
  assert.equal(host.sessionId, null);
  assert.equal(game.scene.events.listenerCount("update"), 0);
  assert.equal(game.scene.events.listenerCount("shutdown"), 0);
  assert.equal(game.scene.events.listenerCount("destroy"), 0);
  assert.equal(host.log("info", "must not escape stopped session"), false);

  await host.stop();
  await host.play();
  const thirdSessionId = host.sessionId;
  assert.ok(thirdSessionId);
  assert.notEqual(thirdSessionId, secondSessionId);
  assert.equal(FakeGame.instances.length, 1);
  assert.equal(game.scene.events.listenerCount("update"), 1);

  await host.dispose();
  assert.equal(host.state, "disposed");
  assert.equal(game.destroyCount, 1);
  assert.equal(game.scene.events.listenerCount("update"), 0);
  assert.equal(game.scene.events.listenerCount("shutdown"), 0);
  assert.equal(game.scene.events.listenerCount("destroy"), 0);
  assert.deepEqual(states, [
    "starting", "running", "paused", "running", "stopping", "starting", "running",
    "stopping", "stopped", "starting", "running", "stopping", "disposed",
  ]);
  await host.dispose();
  assert.equal(game.destroyCount, 1);
});

test("captures Project, Component registry and Scene documents for deterministic restarts", async () => {
  FakeGame.instances = [];
  let source = sceneText;
  let reads = 0;
  const names: string[] = [];
  const project = projectFixture();
  const registry = registryFixture();
  const host = createBrowserPreviewHost({
    phaser,
    parent: {} as HTMLElement,
    project,
    sceneId: "scene-level",
    registry,
    readAssetDocument: async (_asset, signal) => {
      if (signal.aborted) throw signal.reason;
      reads += 1;
      return source;
    },
    componentViewFactories: {
      [componentTypeId](context) {
        names.push(context.node.name);
        return new MockGameObject(context.scene) as unknown as Phaser.GameObjects.GameObject;
      },
    },
  });

  project.name = "Mutated after host creation";
  registry.unregister(componentTypeId);
  await host.play();
  source = sceneText.replace('"name": "Enemy"', '"name": "Renamed after first Preview"');
  await host.restart();

  assert.equal(reads, 1);
  assert.deepEqual(names, ["Player", "Enemy", "Player", "Enemy"]);
  assert.equal(host.projectId, "acceptance-project");
  await host.dispose();
});

test("routes Phaser startup diagnostics to the failed run and permits a clean retry", async () => {
  FakeGame.instances = [];
  let fail = true;
  const errors: BrowserPreviewErrorEvent[] = [];
  const host = createHost({
    factory(context) {
      if (fail) throw new Error("Synthetic Component view failure.");
      return new MockGameObject(context.scene) as unknown as Phaser.GameObjects.GameObject;
    },
  });
  host.subscribe("error", (event) => errors.push(event));

  await assert.rejects(host.play(), (error: unknown) => {
    assert.ok(error instanceof PhaserRuntimeAdapterError);
    assert.match(error.diagnostic.causeMessage ?? "", /Synthetic Component view failure/);
    assert.ok(error.originalError instanceof Error);
    assert.match(error.originalError.message, /Synthetic Component view failure/);
    return true;
  });
  const failedSessionId = host.sessionId;
  assert.ok(failedSessionId);
  assert.equal(host.state, "failed");
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.sessionId, failedSessionId);
  assert.equal(errors[0]?.source, "phaser");
  assert.equal(errors[0]?.code, "VIEW_CREATION_FAILED");

  const failedGame = FakeGame.instances[0];
  assert.ok(failedGame);
  assert.equal(failedGame.scene.events.listenerCount("update"), 0);
  assert.equal(failedGame.scene.events.listenerCount("shutdown"), 0);
  assert.equal(failedGame.scene.events.listenerCount("destroy"), 0);

  fail = false;
  await host.play();
  assert.equal(host.state, "running");
  assert.notEqual(host.sessionId, failedSessionId);
  assert.equal(FakeGame.instances.length, 1);
  assert.equal(failedGame.scene.events.listenerCount("update"), 1);
  await host.dispose();
});

test("surfaces Core document errors with the exact Preview session identity", async () => {
  FakeGame.instances = [];
  const errors: BrowserPreviewErrorEvent[] = [];
  const host = createHost({
    readAssetDocument: async () => {
      throw new Error("Synthetic Scene document read failure.");
    },
  });
  host.subscribe("error", (event) => errors.push(event));

  await assert.rejects(host.play(), /Synthetic Scene document read failure/);
  assert.equal(host.state, "failed");
  assert.ok(host.sessionId);
  assert.ok(errors.length > 0);
  assert.ok(errors.every((event) => event.sessionId === host.sessionId));
  assert.ok(errors.some((event) => event.source === "core"));
  const game = FakeGame.instances[0];
  assert.ok(game);
  assert.equal(game.scene.events.listenerCount("update"), 0);
  await host.dispose();
});

test("resizes before and after boot and rejects invalid viewport dimensions", async () => {
  FakeGame.instances = [];
  const host = createHost();
  host.resize(1024, 768);
  await host.play();
  const game = FakeGame.instances[0];
  assert.ok(game);
  assert.equal(game.config.width, 1024);
  assert.equal(game.config.height, 768);
  host.resize(1280, 720);
  assert.deepEqual(game.resized, [{ width: 1280, height: 720 }]);
  assert.throws(() => host.resize(0, 720), /finite positive numbers/);
  assert.throws(() => host.resize(Number.NaN, 720), /finite positive numbers/);
  assert.deepEqual(game.resized, [{ width: 1280, height: 720 }]);
  await host.dispose();
});

test("a Stop racing a queued Play cancels startup without creating a Game or retaining a session", async () => {
  FakeGame.instances = [];
  const host = createHost();
  const play = host.play();
  const stop = host.stop();
  await Promise.all([play, stop]);

  assert.equal(host.state, "stopped");
  assert.equal(host.sessionId, null);
  assert.equal(FakeGame.instances.length, 0);
  await host.dispose();
});

test("isolates event observers so a throwing subscriber cannot break runtime lifecycle", async () => {
  FakeGame.instances = [];
  const host = createHost();
  host.subscribe("state-change", () => {
    throw new Error("Synthetic observer failure.");
  });

  await host.play();
  assert.equal(host.state, "running");
  await host.stop();
  assert.equal(host.state, "stopped");
  await host.dispose();
});


test("times out a Phaser boot that never creates the Preview Scene and releases its partial Game", async () => {
  FakeGame.instances = [];
  FakeGame.skipSceneCreate = true;
  const errors: BrowserPreviewErrorEvent[] = [];
  const host = createBrowserPreviewHost({
    phaser,
    parent: {} as HTMLElement,
    project: projectFixture(),
    sceneId: "scene-level",
    registry: registryFixture(),
    readAssetDocument: async (_asset, signal) => {
      if (signal.aborted) throw signal.reason;
      return sceneText;
    },
    startupTimeoutMs: 5,
  });
  host.subscribe("error", (event) => errors.push(event));

  try {
    await assert.rejects(host.play(), /startup timeout/);
    assert.equal(host.state, "failed");
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.code, "PREVIEW_START_FAILED");
    const game = FakeGame.instances[0];
    assert.ok(game);
    assert.equal(game.destroyCount, 1);
  } finally {
    FakeGame.skipSceneCreate = false;
    await host.dispose();
  }
});


test("Play queued after Stop is not lost when the previous session is still marked running", async () => {
  FakeGame.instances = [];
  const host = createHost();
  await host.play();
  const firstSessionId = host.sessionId;
  assert.ok(firstSessionId);

  // Stop changes lifecycle only when its serialized operation runs. Play is
  // nevertheless ordered after it rather than treating the stale running
  // state as proof that no restart is required.
  const stop = host.stop();
  const play = host.play();
  await Promise.all([stop, play]);

  assert.equal(host.state, "running");
  assert.ok(host.sessionId);
  assert.notEqual(host.sessionId, firstSessionId);
  assert.equal(FakeGame.instances.length, 1);
  assert.equal(FakeGame.instances[0]?.scene.events.listenerCount("update"), 1);
  await host.dispose();
});


test("fails a pending Scene boot immediately when Phaser destroys the Game unexpectedly", async () => {
  FakeGame.instances = [];
  FakeGame.skipSceneCreate = true;
  const errors: BrowserPreviewErrorEvent[] = [];
  const host = createHost();
  host.subscribe("error", (event) => errors.push(event));
  const play = host.play();

  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const game = FakeGame.instances[0];
    assert.ok(game);
    game.destroy(true);

    await assert.rejects(play, /destroyed before Preview Scene startup completed/);
    assert.equal(host.state, "failed");
    assert.ok(errors.some((event) => event.code === "PREVIEW_GAME_DESTROYED"));
    assert.equal(game.destroyCount, 1);
  } finally {
    FakeGame.skipSceneCreate = false;
    await host.dispose();
  }
});


test("Stop aborts an in-flight Core document read and leaves no active Phaser runtime listeners", async () => {
  FakeGame.instances = [];
  let signalForRead: AbortSignal | undefined;
  let resolveStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const host = createBrowserPreviewHost({
    phaser,
    parent: {} as HTMLElement,
    project: projectFixture(),
    sceneId: "scene-level",
    registry: registryFixture(),
    readAssetDocument: async (_asset, signal) => {
      signalForRead = signal;
      resolveStarted();
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
    componentViewFactories: {
      [componentTypeId](context) {
        return new MockGameObject(context.scene) as unknown as Phaser.GameObjects.GameObject;
      },
    },
  });

  const play = host.play();
  await started;
  const game = FakeGame.instances[0];
  assert.ok(game);
  assert.ok(signalForRead);
  const stop = host.stop();
  await Promise.all([play, stop]);

  assert.equal(signalForRead.aborted, true);
  assert.equal(host.state, "stopped");
  assert.equal(host.sessionId, null);
  assert.equal(game.scene.events.listenerCount("update"), 0);
  assert.equal(game.scene.events.listenerCount("shutdown"), 0);
  assert.equal(game.scene.events.listenerCount("destroy"), 0);
  await host.dispose();
  assert.equal(game.destroyCount, 1);
});


test("recreates Preview only after cleanup of an unexpectedly destroyed active Game", async () => {
  FakeGame.instances = [];
  const views: MockGameObject[] = [];
  const host = createHost({
    factory(context) {
      const view = new MockGameObject(context.scene);
      views.push(view);
      return view as unknown as Phaser.GameObjects.GameObject;
    },
  });

  await host.play();
  const firstSessionId = host.sessionId;
  const firstGame = FakeGame.instances[0];
  assert.ok(firstSessionId);
  assert.ok(firstGame);
  assert.equal(views.length, 2);

  firstGame.destroy(true);
  assert.equal(host.state, "failed");

  await host.play();
  assert.equal(host.state, "running");
  assert.notEqual(host.sessionId, firstSessionId);
  assert.equal(FakeGame.instances.length, 2);
  assert.ok(views.slice(0, 2).every((view) => view.destroyCount === 1));
  assert.equal(FakeGame.instances[1]?.scene.events.listenerCount("update"), 1);
  await host.dispose();
});



test("routes compiler and module-resolution diagnostics to the allocated session before Phaser boot", async () => {
  FakeGame.instances = [];
  const errors: BrowserPreviewErrorEvent[] = [];
  const logs: BrowserPreviewLogEvent[] = [];
  const host = createBrowserPreviewHost({
    phaser,
    parent: {} as HTMLElement,
    project: projectFixture(),
    sceneId: "scene-level",
    readAssetDocument: async (_asset, signal) => {
      if (signal.aborted) throw signal.reason;
      return sceneText;
    },
    resolveComponentRegistry: async (context) => {
      assert.equal(context.sceneId, "scene-level");
      assert.equal(Object.isFrozen(context.project), true);
      return {
        diagnostics: [
          {
            source: "module",
            code: "PROJECT_BUILD_MODULE_MISSING",
            severity: "warning",
            message: "Optional module could not be loaded.",
            path: "src/Optional.ts",
          },
          {
            source: "compiler",
            code: 2307,
            severity: "error",
            message: "Cannot find module './missing'.",
            path: "src/Player.ts",
            line: 4,
            column: 10,
          },
          {
            source: "module",
            code: "PROJECT_BUILD_MODULE_MISSING",
            severity: "error",
            message: "Required Component module is unavailable.",
            path: "src/Player.ts",
            entityId: componentTypeId,
          },
        ],
      };
    },
  });
  host.subscribe("error", (event) => errors.push(event));
  host.subscribe("log", (event) => logs.push(event));

  await assert.rejects(host.play(), /module resolution failed with diagnostics/);
  const failedSessionId = host.sessionId;
  assert.ok(failedSessionId);
  assert.equal(host.state, "failed");
  assert.equal(FakeGame.instances.length, 0);
  assert.equal(errors.length, 2);
  assert.ok(errors.every((event) => event.sessionId === failedSessionId));
  assert.deepEqual(errors.map((event) => event.source), ["compiler", "module"]);
  assert.equal(errors[0]?.code, "2307");
  assert.equal(errors[0]?.path, "src/Player.ts");
  assert.equal(errors[0]?.line, 4);
  assert.equal(errors[0]?.column, 10);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.sessionId, failedSessionId);
  assert.equal(logs[0]?.level, "warn");
  assert.match(logs[0]?.message ?? "", /Optional module could not be loaded/);

  await host.dispose();
});

test("Stop waits for failed cleanup initiated by an unexpected external Game destruction", async () => {
  FakeGame.instances = [];
  const host = createHost({
    factory(context) {
      const view = new MockGameObject(context.scene);
      view.destroy = (): void => {
        throw new Error("Synthetic view cleanup failure.");
      };
      return view as unknown as Phaser.GameObjects.GameObject;
    },
  });

  await host.play();
  const game = FakeGame.instances[0];
  assert.ok(game);
  game.destroy(true);

  await assert.rejects(host.stop(), /SceneManager disposal failed/);
  assert.equal(host.state, "failed");
  assert.ok(host.sessionId);

  await assert.rejects(host.dispose(), /Browser Preview Host disposal failed/);
  assert.equal(host.state, "disposed");
});


test("resolves and snapshots a host-owned Component registry before creating the Phaser Game", async () => {
  FakeGame.instances = [];
  let resolutions = 0;
  const host = createBrowserPreviewHost({
    phaser,
    parent: {} as HTMLElement,
    project: projectFixture(),
    sceneId: "scene-level",
    readAssetDocument: async (_asset, signal) => {
      if (signal.aborted) throw signal.reason;
      return sceneText;
    },
    resolveComponentRegistry: async ({ project, sceneId, signal }) => {
      resolutions += 1;
      assert.equal(Object.isFrozen(project), true);
      assert.equal(sceneId, "scene-level");
      assert.equal(signal.aborted, false);
      return { registry: registryFixture(), diagnostics: [] };
    },
    componentViewFactories: {
      [componentTypeId](context) {
        return new MockGameObject(context.scene) as unknown as Phaser.GameObjects.GameObject;
      },
    },
  });

  await host.play();
  const firstSessionId = host.sessionId;
  assert.ok(firstSessionId);
  assert.equal(host.state, "running");
  assert.equal(resolutions, 1);
  assert.equal(FakeGame.instances.length, 1);

  await host.restart();
  assert.notEqual(host.sessionId, firstSessionId);
  assert.equal(resolutions, 1);
  assert.equal(FakeGame.instances.length, 1);
  await host.dispose();
});

