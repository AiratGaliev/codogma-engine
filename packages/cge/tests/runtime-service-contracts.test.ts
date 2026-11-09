import assert from "node:assert/strict";
import test from "node:test";
import type {
  InputCoordinateMapper,
  InputEvent,
  InputEventSource,
  InputKeyboardEvent,
  InputRouteResolver,
  InputSubscription,
  RuntimeTimeFrame,
  ScheduleOptions,
  ScheduledTask,
  Scheduler,
  SceneLoader,
  SceneManager,
  RuntimeSceneSession,
  TimeService,
  TweenHandle,
  TweenOptions,
  TweenPropertyValues,
  TweenService,
} from "../src/index.js";

const inputEvent: InputKeyboardEvent = {
  kind: "keyboard",
  phase: "down",
  timestampSeconds: 1.25,
  code: "KeyW",
  key: "w",
  repeat: false,
  modifiers: { alt: false, ctrl: false, meta: false, shift: false },
};

const inputSubscription: InputSubscription = {
  isDisposed: false,
  dispose() {},
};

const inputSource: InputEventSource = {
  subscribe(handler: (event: InputEvent) => void): InputSubscription {
    handler(inputEvent);
    return inputSubscription;
  },
};

const routeResolver: InputRouteResolver = {
  resolve(event) {
    return event.kind === "keyboard" ? "world" : undefined;
  },
};

const coordinateMapper: InputCoordinateMapper = {
  convert(point, from, to) {
    if (from === to) return point;
    if (from === "screen" && to === "canvas") return { x: point.x - 10, y: point.y - 20 };
    return undefined;
  },
};

const frame: RuntimeTimeFrame = {
  frameIndex: 1,
  deltaSeconds: 0.016,
  unscaledDeltaSeconds: 0.016,
  elapsedSeconds: 0.016,
  unscaledElapsedSeconds: 0.016,
  timeScale: 1,
  isPaused: false,
};

const timeService: TimeService = {
  isDisposed: false,
  currentFrame: frame,
  setPaused() {},
  setTimeScale() {},
  advance() { return frame; },
  dispose() {},
};

const scheduledTask: ScheduledTask = {
  isDisposed: false,
  status: "scheduled",
  cancel() {},
  pause() {},
  resume() {},
  dispose() {},
};

const scheduler: Scheduler = {
  isDisposed: false,
  schedule(_delaySeconds: number, _callback: () => void, _options?: ScheduleOptions) {
    return scheduledTask;
  },
  update(_frame) {},
  dispose() {},
};

const tweenHandle: TweenHandle = {
  isDisposed: false,
  status: "running",
  cancel() {},
  pause() {},
  resume() {},
  dispose() {},
};

const tweenService: TweenService = {
  isDisposed: false,
  to<TTarget extends object>(
    _target: TTarget,
    _properties: TweenPropertyValues<TTarget>,
    _options: TweenOptions,
  ) {
    return tweenHandle;
  },
  update(_frame) {},
  dispose() {},
};

const sceneSession: RuntimeSceneSession = {
  sceneId: "scene-main",
  activate() {},
  deactivate() {},
  pause() {},
  resume() {},
  dispose() {},
};

const sceneLoader: SceneLoader = {
  async load(request) {
    assert.equal(request.sceneId, "scene-main");
    assert.equal(request.signal.aborted, false);
    return sceneSession;
  },
};

const sceneManager: SceneManager = {
  isDisposed: false,
  activeSceneId: undefined,
  isSwitching: false,
  async switchTo(sceneId) {
    return { status: "activated", sceneId };
  },
  async pause() {},
  async resume() {},
  async stop() {},
  async dispose() {},
};

test("input provider, routing and coordinate contracts are independently consumable", () => {
  let received: InputEvent | undefined;
  inputSource.subscribe((event) => { received = event; });

  assert.equal(routeResolver.resolve(inputEvent), "world");
  assert.equal(received?.kind, "keyboard");
  assert.deepEqual(coordinateMapper.convert({ x: 20, y: 40 }, "screen", "canvas"), { x: 10, y: 20 });
  assert.equal(coordinateMapper.convert({ x: 1, y: 2 }, "world", "local"), undefined);
});

test("time, scheduler and tween contracts share one host frame", () => {
  assert.equal(timeService.advance(0.016), frame);
  scheduler.schedule(0.25, () => undefined, { timeDomain: "unscaled" });
  scheduler.update(frame);
  tweenService.to({ x: 0, label: "not tweenable" }, { x: 100 }, { durationSeconds: 0.5 });
  tweenService.update(frame);

  assert.equal(scheduledTask.status, "scheduled");
  assert.equal(tweenHandle.status, "running");
});

test("scene loader and manager contracts are host-neutral and asynchronous", async () => {
  const controller = new AbortController();
  const loaded = await sceneLoader.load({ sceneId: "scene-main", signal: controller.signal });
  const result = await sceneManager.switchTo(loaded.sceneId);

  assert.equal(loaded.sceneId, "scene-main");
  assert.deepEqual(result, { status: "activated", sceneId: "scene-main" });
});
