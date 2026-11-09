import assert from "node:assert/strict";
import test from "node:test";
import {
  ComponentRegistry,
  ComponentWorld,
  createEngineRuntime,
  createInputService,
  createSceneManager,
  createScheduler,
  createTimeService,
  createTweenService,
  createTypedEventBus,
  type InputCoordinateMapper,
  type InputEvent,
  type InputEventHandler,
  type InputEventSource,
  type InputPointerEvent,
  type InputSubscription,
  type RuntimeSceneSession,
  type SceneLoader,
  type SceneLoadRequest,
} from "../src/index.js";

class FakeInputSource implements InputEventSource {
  private handler: InputEventHandler | undefined;
  subscribe(handler: InputEventHandler): InputSubscription {
    this.handler = handler;
    let disposed = false;
    return {
      get isDisposed(): boolean { return disposed; },
      dispose: () => { disposed = true; this.handler = undefined; },
    };
  }
  emit(event: InputEvent): void { this.handler?.(event); }
}

const coordinates: InputCoordinateMapper = {
  convert(point, from, to) {
    if (from === to) return point;
    if (from === "screen" && to === "canvas") return { x: point.x - 10, y: point.y - 20 };
    return undefined;
  },
};

const modifiers = { alt: false, ctrl: false, meta: false, shift: false };

function pointerEvent(
  phase: InputPointerEvent["phase"],
  options: Partial<Pick<InputPointerEvent, "pointerId" | "buttons" | "pressure">> = {},
): InputPointerEvent {
  return {
    kind: "pointer",
    phase,
    timestampSeconds: 1,
    pointerId: options.pointerId ?? 1,
    pointerType: "touch",
    button: 0,
    buttons: options.buttons ?? (phase === "up" || phase === "cancel" ? 0 : 1),
    pressure: options.pressure ?? (phase === "up" || phase === "cancel" ? 0 : 0.5),
    modifiers,
    coordinates: {
      screen: { x: 20, y: 30 },
      canvas: { x: 10, y: 10 },
      world: { point: { x: 5, y: 5 }, referenceId: "camera-main" },
    },
  };
}

function makeSession(
  sceneId: string,
  hooks: Partial<Record<"activate" | "deactivate" | "pause" | "resume" | "dispose", () => void>> = {},
): RuntimeSceneSession {
  return {
    sceneId,
    activate: () => { hooks.activate?.(); },
    deactivate: () => { hooks.deactivate?.(); },
    pause: () => { hooks.pause?.(); },
    resume: () => { hooks.resume?.(); },
    dispose: () => { hooks.dispose?.(); },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("TimeService advances immutable scaled and unscaled frames without clamping stalls", () => {
  const time = createTimeService();
  time.setTimeScale(0.5);
  const first = time.advance(2);
  assert.equal(first.frameIndex, 1);
  assert.equal(first.deltaSeconds, 1);
  assert.equal(first.unscaledDeltaSeconds, 2);
  assert.equal(first.elapsedSeconds, 1);
  assert.equal(first.unscaledElapsedSeconds, 2);
  assert.equal(Object.isFrozen(first), true);

  time.setPaused(true);
  const paused = time.advance(10);
  assert.equal(paused.deltaSeconds, 0);
  assert.equal(paused.unscaledDeltaSeconds, 10);
  assert.equal(paused.elapsedSeconds, 1);
  assert.equal(paused.unscaledElapsedSeconds, 12);
  assert.equal(paused.isPaused, true);

  time.setPaused(false);
  time.setTimeScale(2);
  const resumed = time.advance(0.25);
  assert.equal(resumed.deltaSeconds, 0.5);
  assert.equal(resumed.elapsedSeconds, 1.5);
  time.dispose();
  assert.throws(() => time.advance(0), /disposed/i);
});

test("TimeService rejects invalid deltas and scales without mutating the current frame", () => {
  const time = createTimeService();
  const initial = time.currentFrame;
  for (const delta of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => time.advance(delta), RangeError);
  }
  for (const scale of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => time.setTimeScale(scale), RangeError);
  }
  assert.equal(time.currentFrame, initial);
});

test("Scheduler uses the selected time domain and supports task pause/resume", () => {
  const time = createTimeService();
  const scheduler = createScheduler();
  time.setTimeScale(0.5);
  const calls: string[] = [];
  const scaled = scheduler.schedule(1, () => calls.push("scaled"));
  const unscaled = scheduler.schedule(1, () => calls.push("unscaled"), { timeDomain: "unscaled" });

  scheduler.update(time.advance(1));
  assert.deepEqual(calls, ["unscaled"]);
  assert.equal(scaled.status, "scheduled");

  scaled.pause();
  scheduler.update(time.advance(2));
  assert.deepEqual(calls, ["unscaled"]);
  scaled.resume();

  time.setTimeScale(2);
  scheduler.update(time.advance(0.1));
  assert.deepEqual(calls, ["unscaled"]);
  scheduler.update(time.advance(0.15));
  assert.deepEqual(calls, ["unscaled", "scaled"]);
  assert.equal(scaled.status, "completed");
  assert.equal(scaled.isDisposed, true);
  assert.equal(unscaled.status, "completed");
  scheduler.dispose();
  assert.throws(() => scheduler.schedule(0, () => undefined), /disposed/i);
});

test("Scheduler cancellation and AbortSignal ownership suppress callbacks idempotently", () => {
  const time = createTimeService();
  const scheduler = createScheduler();
  const controller = new AbortController();
  let calls = 0;
  const aborted = scheduler.schedule(0, () => calls++, { signal: controller.signal });
  controller.abort();
  aborted.cancel();
  const cancelled = scheduler.schedule(0, () => calls++);
  cancelled.cancel();
  scheduler.update(time.advance(0));
  assert.equal(calls, 0);
  assert.equal(aborted.status, "cancelled");
  assert.equal(cancelled.status, "cancelled");
});

test("Scheduler processes sibling tasks after callback errors and rejects duplicate frames", () => {
  const time = createTimeService();
  const scheduler = createScheduler();
  let secondCalled = false;
  scheduler.schedule(0, () => { throw new Error("expected callback failure"); });
  scheduler.schedule(0, () => { secondCalled = true; });
  const frame = time.advance(0);
  assert.throws(() => scheduler.update(frame), AggregateError);
  assert.equal(secondCalled, true);
  assert.throws(() => scheduler.update(frame), /frame/i);
});

test("TweenService interpolates numeric own properties and completes exactly once", () => {
  const time = createTimeService();
  const tweens = createTweenService();
  const target = { x: 0, y: 10 };
  let updates = 0;
  let completed = 0;
  const tween = tweens.to(target, { x: 10, y: 0 }, {
    durationSeconds: 2,
    onUpdate: () => updates++,
    onComplete: () => completed++,
  });

  tweens.update(time.advance(1));
  assert.deepEqual(target, { x: 5, y: 5 });
  tweens.update(time.advance(1));
  assert.deepEqual(target, { x: 10, y: 0 });
  assert.equal(tween.status, "completed");
  assert.equal(updates, 2);
  assert.equal(completed, 1);
  tween.cancel();
  assert.equal(completed, 1);
});

test("Tween delay, repeat and yoyo use the same frame snapshot", () => {
  const time = createTimeService();
  const tweens = createTweenService();
  const target = { x: 0 };
  const tween = tweens.to(target, { x: 10 }, {
    durationSeconds: 1,
    delaySeconds: 0.5,
    repeat: 1,
    yoyo: true,
  });
  tweens.update(time.advance(0.25));
  assert.equal(target.x, 0);
  assert.equal(tween.status, "delayed");
  tweens.update(time.advance(0.5));
  assert.equal(target.x, 2.5);
  assert.equal(tween.status, "running");
  tweens.update(time.advance(0.75));
  assert.equal(target.x, 10);
  tweens.update(time.advance(1));
  assert.equal(target.x, 0);
  assert.equal(tween.status, "completed");
});

test("Tween supports pause/resume, owner cancellation and unscaled time", () => {
  const time = createTimeService();
  const tweens = createTweenService();
  const owner = new AbortController();
  const target = { x: 0 };
  const tween = tweens.to(target, { x: 10 }, {
    durationSeconds: 2,
    signal: owner.signal,
    timeDomain: "unscaled",
  });
  tween.pause();
  tweens.update(time.advance(1));
  assert.equal(target.x, 0);
  tween.resume();
  time.setPaused(true);
  tweens.update(time.advance(1));
  assert.equal(target.x, 5);
  owner.abort();
  tweens.update(time.advance(1));
  assert.equal(target.x, 5);
  assert.equal(tween.status, "cancelled");
});

test("Tween rejects accessor, readonly, non-finite and empty destination properties", () => {
  const tweens = createTweenService();
  const target = Object.defineProperties(
    { x: 0, readonlyValue: 1 },
    { readonlyValue: { writable: false } },
  );
  assert.throws(() => tweens.to(target, { x: Number.NaN }, { durationSeconds: 1 }), /finite/i);
  const readonlyDestination = { readonlyValue: 2 } as unknown as import("../src/index.js").TweenPropertyValues<typeof target>;
  assert.throws(() => tweens.to(target, readonlyDestination, { durationSeconds: 1 }), /writable/i);
  assert.throws(() => tweens.to(target, {}, { durationSeconds: 1 }), /at least one/i);
  assert.throws(() => tweens.to(target, { x: 1 }, { durationSeconds: -1 }), RangeError);
  assert.throws(() => tweens.to(target, { x: 1 }, { durationSeconds: 0, repeat: -1 }), RangeError);
});

test("Tween callback failure cancels only the failed tween and does not block siblings", () => {
  const time = createTimeService();
  const tweens = createTweenService();
  const firstTarget = { x: 0 };
  const secondTarget = { x: 0 };
  const first = tweens.to(firstTarget, { x: 1 }, {
    durationSeconds: 1,
    onUpdate: () => { throw new Error("update failed"); },
  });
  const second = tweens.to(secondTarget, { x: 1 }, { durationSeconds: 1 });
  assert.throws(() => tweens.update(time.advance(0.5)), AggregateError);
  assert.equal(first.status, "cancelled");
  assert.equal(secondTarget.x, 0.5);
  assert.equal(second.status, "running");
});

test("Tween enforces synchronous callbacks and reports the terminal yoyo progress", () => {
  const time = createTimeService();
  const tweens = createTweenService();
  const updateTween = tweens.to({ x: 0 }, { x: 1 }, {
    durationSeconds: 1,
    onUpdate: async () => undefined,
  });
  assert.throws(() => tweens.update(time.advance(0.25)), AggregateError);
  assert.equal(updateTween.status, "cancelled");

  const completionTween = tweens.to({ x: 0 }, { x: 1 }, {
    durationSeconds: 1,
    onComplete: async () => undefined,
  });
  assert.throws(() => tweens.update(time.advance(1)), AggregateError);
  assert.equal(completionTween.status, "completed");
  tweens.dispose();

  const yoyoTime = createTimeService();
  const yoyoTweens = createTweenService();
  const progress: number[] = [];
  yoyoTweens.to({ x: 0 }, { x: 10 }, {
    durationSeconds: 0.5,
    repeat: 1,
    yoyo: true,
    onUpdate: (value) => progress.push(value),
  });
  yoyoTweens.update(yoyoTime.advance(0.5));
  yoyoTweens.update(yoyoTime.advance(0.5));
  assert.equal(progress.at(-1), 0);
  yoyoTweens.dispose();
});

test("Tween rejects asynchronous easing functions", () => {
  const time = createTimeService();
  const tweens = createTweenService();
  const tween = tweens.to({ x: 0 }, { x: 1 }, {
    durationSeconds: 1,
    easing: (async () => 0.5) as unknown as (progress: number) => number,
  });
  assert.throws(() => tweens.update(time.advance(0.5)), AggregateError);
  assert.equal(tween.status, "cancelled");
  tweens.dispose();
});

test("Input routes exclusively and captures pointer ownership through move and up", () => {
  const source = new FakeInputSource();
  const input = createInputService({
    source,
    routeResolver: {
      resolve(event) {
        if (event.kind === "pointer" && event.coordinates.canvas.x < 15) return "ui";
        return "world";
      },
    },
    coordinates,
  });
  const ui: string[] = [];
  const world: string[] = [];
  input.subscribe("ui", (event) => ui.push(event.kind === "pointer" ? event.phase : event.kind));
  input.subscribe("world", (event) => world.push(event.kind === "pointer" ? event.phase : event.kind));

  source.emit(pointerEvent("down"));
  source.emit(pointerEvent("move"));
  source.emit(pointerEvent("up"));
  assert.deepEqual(ui, ["down", "move", "up"]);
  assert.deepEqual(world, []);
  assert.deepEqual(input.coordinates.convert({ x: 20, y: 30 }, "screen", "canvas"), { x: 10, y: 10 });
  input.dispose();
  assert.throws(() => input.subscribe("ui", () => undefined), /disposed/i);
});

test("Input focus loss cancels every held key and pointer before broadcasting focus", () => {
  const source = new FakeInputSource();
  const input = createInputService({
    source,
    routeResolver: { resolve: () => "world" },
    coordinates,
  });
  const world: string[] = [];
  const ui: string[] = [];
  input.subscribe("world", (event) => {
    world.push(event.kind === "keyboard" ? event.phase : event.kind === "pointer" ? event.phase : event.state);
  });
  input.subscribe("ui", (event) => {
    if (event.kind === "focus") ui.push(event.state);
  });

  source.emit({
    kind: "keyboard",
    phase: "down",
    timestampSeconds: 1,
    code: "KeyW",
    key: "w",
    repeat: false,
    modifiers,
  });
  source.emit(pointerEvent("down"));
  source.emit({ kind: "focus", state: "lost", reason: "background", timestampSeconds: 2 });
  source.emit({
    kind: "keyboard",
    phase: "up",
    timestampSeconds: 3,
    code: "KeyW",
    key: "w",
    repeat: false,
    modifiers,
  });
  source.emit(pointerEvent("up"));

  assert.deepEqual(world, ["down", "down", "cancel", "cancel", "lost"]);
  assert.deepEqual(ui, ["lost"]);
  input.dispose();
});

test("Input ignores keyboard and pointer events while unfocused until focus is regained", () => {
  const source = new FakeInputSource();
  const input = createInputService({
    source,
    routeResolver: { resolve: () => "world" },
    coordinates,
  });
  const observed: string[] = [];
  input.subscribe("world", (event) => {
    if (event.kind === "focus") observed.push(event.state);
    else if (event.kind === "keyboard") observed.push(event.phase);
    else observed.push(event.phase);
  });

  source.emit({ kind: "focus", state: "lost", reason: "background", timestampSeconds: 1 });
  source.emit({
    kind: "keyboard", phase: "down", timestampSeconds: 1.1,
    code: "KeyW", key: "w", repeat: false, modifiers,
  });
  source.emit(pointerEvent("down"));
  assert.deepEqual(observed, ["lost"]);

  source.emit({ kind: "focus", state: "gained", reason: "host", timestampSeconds: 2 });
  source.emit({
    kind: "keyboard", phase: "down", timestampSeconds: 2.1,
    code: "KeyW", key: "w", repeat: false, modifiers,
  });
  source.emit({ kind: "focus", state: "lost", reason: "background", timestampSeconds: 3 });
  assert.deepEqual(observed, ["lost", "gained", "down", "cancel", "lost"]);
  input.dispose();
});

test("Input owner abort releases subscriptions and handler errors do not block siblings", () => {
  const source = new FakeInputSource();
  const input = createInputService({
    source,
    routeResolver: { resolve: () => "world" },
    coordinates,
  });
  const owner = new AbortController();
  let calls = 0;
  input.subscribe("world", () => { throw new Error("input callback failed"); });
  input.subscribe("world", () => calls++);
  const owned = input.subscribe("world", () => calls += 10, { signal: owner.signal });
  owner.abort();
  assert.equal(owned.isDisposed, true);
  assert.throws(() => source.emit(pointerEvent("move")), AggregateError);
  assert.equal(calls, 1);
  input.dispose();
});

test("TypedEventBus isolates listeners, supports abort ownership and cleans snapshots", () => {
  type Events = { score: number; message: { text: string } };
  const bus = createTypedEventBus<Events>();
  const owner = new AbortController();
  const received: number[] = [];
  bus.subscribe("score", (value) => received.push(value), { signal: owner.signal });
  bus.subscribe("score", () => { throw new Error("listener failed"); });
  bus.subscribe("score", (value) => received.push(value * 10));
  owner.abort();

  assert.throws(() => bus.emit("score", 2), AggregateError);
  assert.deepEqual(received, [20]);
  bus.clear("score");
  bus.emit("score", 3);
  assert.equal(bus.isDisposed, false);
  bus.dispose();
  assert.throws(() => bus.emit("score", 1), /disposed/i);
});

test("SceneManager activates one scene, replaces it and releases the previous owner", async () => {
  const counts = { firstDispose: 0, secondActivate: 0 };
  const loader: SceneLoader = {
    async load(request: SceneLoadRequest) {
      if (request.signal.aborted) throw new Error("aborted");
      return request.sceneId === "first"
        ? makeSession("first", { dispose: () => counts.firstDispose++ })
        : makeSession("second", { activate: () => counts.secondActivate++ });
    },
  };
  const manager = createSceneManager(loader);
  assert.deepEqual(await manager.switchTo("first"), { status: "activated", sceneId: "first" });
  assert.deepEqual(await manager.switchTo("first"), { status: "already-active", sceneId: "first" });
  assert.deepEqual(await manager.switchTo("second"), { status: "activated", sceneId: "second" });
  assert.equal(manager.activeSceneId, "second");
  assert.equal(counts.firstDispose, 1);
  assert.equal(counts.secondActivate, 1);
  await manager.dispose();
  assert.equal(manager.isDisposed, true);
});

test("SceneManager latest request wins and disposes a late candidate", async () => {
  const firstLoad = deferred<RuntimeSceneSession>();
  const secondLoad = deferred<RuntimeSceneSession>();
  const requests: AbortSignal[] = [];
  const disposed: string[] = [];
  const loader: SceneLoader = {
    load(request) {
      requests.push(request.signal);
      return request.sceneId === "first" ? firstLoad.promise : secondLoad.promise;
    },
  };
  const manager = createSceneManager(loader);
  const first = manager.switchTo("first");
  const second = manager.switchTo("second");
  assert.equal(requests[0]?.aborted, true);
  firstLoad.resolve(makeSession("first", { dispose: () => disposed.push("first") }));
  assert.deepEqual(await first, { status: "cancelled", sceneId: "first" });

  secondLoad.resolve(makeSession("second"));
  assert.deepEqual(await second, { status: "activated", sceneId: "second" });
  assert.deepEqual(disposed, ["first"]);
  await manager.dispose();
});

test("SceneManager activation failure restores the previous active session", async () => {
  let previousActivations = 0;
  let candidateDisposals = 0;
  const loader: SceneLoader = {
    async load(request) {
      return request.sceneId === "previous"
        ? makeSession("previous", { activate: () => previousActivations++ })
        : makeSession("candidate", {
            activate: () => { throw new Error("candidate activation failed"); },
            dispose: () => candidateDisposals++,
          });
    },
  };
  const manager = createSceneManager(loader);
  await manager.switchTo("previous");
  await assert.rejects(manager.switchTo("candidate"), /candidate activation failed/);
  assert.equal(manager.activeSceneId, "previous");
  assert.equal(previousActivations, 2);
  assert.equal(candidateDisposals, 1);
  await manager.dispose();
});

test("SceneManager pause and resume are idempotent across scene switches", async () => {
  const calls: string[] = [];
  const manager = createSceneManager({
    async load(request) {
      return makeSession(request.sceneId, {
        pause: () => calls.push(request.sceneId + ":pause"),
        resume: () => calls.push(request.sceneId + ":resume"),
      });
    },
  });

  await manager.switchTo("first");
  await manager.pause();
  await manager.pause();
  await manager.switchTo("second");
  await manager.resume();
  await manager.resume();

  assert.deepEqual(calls, ["first:pause", "second:pause", "second:resume"]);
  await manager.dispose();
});

test("SceneManager serializes concurrent pause and scene-switch lifecycle operations", async () => {
  const pauseGate = deferred<void>();
  const calls: string[] = [];
  let firstPauseCalls = 0;
  let secondPauseCalls = 0;
  let secondResumeCalls = 0;
  const manager = createSceneManager({
    async load(request) {
      if (request.sceneId === "first") {
        return {
          sceneId: "first",
          activate() {},
          deactivate() { calls.push("first:deactivate"); },
          pause() {
            firstPauseCalls++;
            calls.push("first:pause-start");
            return pauseGate.promise.then(() => calls.push("first:pause-end"));
          },
          resume() {},
          dispose() { calls.push("first:dispose"); },
        };
      }
      return makeSession("second", {
        activate: () => calls.push("second:activate"),
        pause: () => { secondPauseCalls++; calls.push("second:pause"); },
        resume: () => { secondResumeCalls++; calls.push("second:resume"); },
        deactivate: () => calls.push("second:deactivate"),
        dispose: () => calls.push("second:dispose"),
      });
    },
  });

  await manager.switchTo("first");
  const firstPause = manager.pause();
  const duplicatePause = manager.pause();
  await Promise.resolve();
  const switching = manager.switchTo("second");
  await Promise.resolve();
  assert.deepEqual(calls, ["first:pause-start"]);

  pauseGate.resolve();
  await Promise.all([firstPause, duplicatePause, switching]);
  assert.equal(firstPauseCalls, 1);
  assert.equal(secondPauseCalls, 1);
  assert.deepEqual(calls, [
    "first:pause-start",
    "first:pause-end",
    "first:deactivate",
    "first:dispose",
    "second:activate",
    "second:pause",
  ]);

  await Promise.all([manager.resume(), manager.resume()]);
  assert.equal(secondResumeCalls, 1);
  await manager.dispose();
  assert.deepEqual(calls.slice(-3), [
    "second:resume",
    "second:deactivate",
    "second:dispose",
  ]);
});

test("SceneManager stop deactivates before disposal, cancels loading and remains reusable", async () => {
  const pendingLoad = deferred<RuntimeSceneSession>();
  const lifecycle: string[] = [];
  const loader: SceneLoader = {
    load(request) {
      if (request.sceneId === "pending") return pendingLoad.promise;
      return Promise.resolve(makeSession(request.sceneId, {
        deactivate: () => lifecycle.push(request.sceneId + ":deactivate"),
        dispose: () => lifecycle.push(request.sceneId + ":dispose"),
      }));
    },
  };
  const manager = createSceneManager(loader);
  await manager.switchTo("active");
  const pending = manager.switchTo("pending");
  const stop = manager.stop();
  assert.equal(manager.stop(), stop);
  pendingLoad.resolve(makeSession("pending"));
  assert.deepEqual(await pending, { status: "cancelled", sceneId: "pending" });
  await stop;
  assert.equal(manager.activeSceneId, undefined);
  assert.deepEqual(lifecycle, ["active:deactivate", "active:dispose"]);
  await manager.switchTo("restarted");
  assert.equal(manager.activeSceneId, "restarted");
  await manager.dispose();
  assert.deepEqual(lifecycle.slice(-2), ["restarted:deactivate", "restarted:dispose"]);
});

test("EngineRuntime fixes service phase order and integrates the active SceneManager ComponentWorld", async () => {
  type Events = { input: string };
  const source = new FakeInputSource();
  let activeWorld: ComponentWorld | undefined;
  const loadedWorlds: ComponentWorld[] = [];
  const runtime = createEngineRuntime<Events>({
    inputSource: source,
    inputRouteResolver: { resolve: () => "world" },
    inputCoordinates: coordinates,
    sceneLoader: {
      async load(request) {
        const world = new ComponentWorld(request.sceneId, new ComponentRegistry());
        loadedWorlds.push(world);
        world.registerSystem({
          id: "test-observer",
          update(deltaSeconds) {
            order.push("world:" + deltaSeconds);
          },
        });
        return {
          sceneId: request.sceneId,
          activate() { activeWorld = world; },
          deactivate() {
            if (activeWorld === world) activeWorld = undefined;
          },
          pause() {},
          resume() {},
          dispose() {
            if (activeWorld === world) activeWorld = undefined;
            world.dispose();
          },
        };
      },
    },
  });
  const order: string[] = [];
  runtime.scheduler.schedule(0, () => order.push("scheduler"));
  const target = { x: 0 };
  runtime.tweens.to(target, { x: 10 }, {
    durationSeconds: 1,
    onUpdate: () => order.push("tween"),
  });
  runtime.events.subscribe("input", (value) => order.push("event:" + value));
  runtime.input.subscribe("world", (event) => {
    if (event.kind === "pointer") runtime.events.emit("input", event.phase);
  });
  source.emit(pointerEvent("move"));
  await runtime.scenes.switchTo("scene-main");
  assert.ok(activeWorld);
  const frame = runtime.update(1, (deltaSeconds) => activeWorld?.update(deltaSeconds));
  assert.equal(frame.frameIndex, 1);
  assert.deepEqual(order, ["event:move", "scheduler", "tween", "world:1"]);
  assert.equal(target.x, 10);

  await runtime.dispose();
  assert.equal(activeWorld, undefined);
  assert.equal(loadedWorlds[0]?.isDisposed, true);
  assert.equal(runtime.isDisposed, true);
  assert.throws(() => runtime.update(0), /disposed/i);
});


test("SceneManager surfaces failed disposal of a late cancelled candidate", async () => {
  const firstLoad = deferred<RuntimeSceneSession>();
  const secondLoad = deferred<RuntimeSceneSession>();
  const loader: SceneLoader = {
    load(request) {
      return request.sceneId === "first" ? firstLoad.promise : secondLoad.promise;
    },
  };
  const manager = createSceneManager(loader);
  const first = manager.switchTo("first");
  const second = manager.switchTo("second");

  firstLoad.resolve(makeSession("first", {
    dispose: () => { throw new Error("candidate cleanup failed"); },
  }));
  await assert.rejects(first, AggregateError);

  secondLoad.resolve(makeSession("second"));
  assert.deepEqual(await second, { status: "activated", sceneId: "second" });
  await manager.dispose();
});

test("EngineRuntime validates SceneLoader before acquiring a host input subscription", () => {
  let subscribeCalls = 0;
  const source: InputEventSource = {
    subscribe() {
      subscribeCalls++;
      return { isDisposed: false, dispose() {} };
    },
  };

  assert.throws(() => createEngineRuntime({
    inputSource: source,
    inputRouteResolver: { resolve: () => "world" },
    inputCoordinates: coordinates,
    sceneLoader: {} as SceneLoader,
  }), /SceneLoader/);
  assert.equal(subscribeCalls, 0);
});

test("EngineRuntime rejects reentrant disposal and promise-returning world callbacks", async () => {
  const source = new FakeInputSource();
  const runtime = createEngineRuntime({
    inputSource: source,
    inputRouteResolver: { resolve: () => "world" },
    inputCoordinates: coordinates,
    sceneLoader: { async load(request) { return makeSession(request.sceneId); } },
  });

  assert.throws(
    () => runtime.update(0.1, () => runtime.dispose()),
    AggregateError,
  );
  assert.equal(runtime.isDisposed, false);

  assert.throws(
    () => runtime.update(0.1, (() => Promise.resolve()) as unknown as (delta: number) => void),
    AggregateError,
  );
  assert.equal(runtime.isDisposed, false);
  await runtime.dispose();
  assert.equal(runtime.isDisposed, true);
});

test("EngineRuntime still advances later phases after a service callback error", async () => {
  const source = new FakeInputSource();
  const runtime = createEngineRuntime({
    inputSource: source,
    inputRouteResolver: { resolve: () => "world" },
    inputCoordinates: coordinates,
    sceneLoader: { async load(request) { return makeSession(request.sceneId); } },
  });
  const phases: string[] = [];
  runtime.scheduler.schedule(0, () => { throw new Error("scheduled failure"); });
  runtime.tweens.to({ x: 0 }, { x: 1 }, {
    durationSeconds: 1,
    onUpdate: () => phases.push("tween"),
  });
  assert.throws(() => runtime.update(0.5, () => phases.push("world")), AggregateError);
  assert.deepEqual(phases, ["tween", "world"]);
  await runtime.dispose();
});
