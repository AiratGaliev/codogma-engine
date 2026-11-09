import type { RuntimeAsyncDisposable, RuntimeTimeFrame } from "./common.js";
import { createTypedEventBus, type TypedEventBus } from "./events.js";
import {
  createInputService,
  type InputCoordinateMapper,
  type InputEventSource,
  type InputRouteResolver,
  type InputService,
} from "./input.js";
import {
  createSceneManager,
  type SceneLoader,
  type SceneManager,
} from "./scene-manager.js";
import { createScheduler, createTimeService, type Scheduler, type TimeService } from "./time.js";
import { createTweenService, type TweenService } from "./tween.js";
import { assertSynchronousResult } from "./sync-callback.js";

export interface EngineRuntimeOptions {
  readonly inputSource: InputEventSource;
  readonly inputRouteResolver: InputRouteResolver;
  readonly inputCoordinates: InputCoordinateMapper;
  readonly sceneLoader: SceneLoader;
}

export interface EngineRuntime<TEvents extends object> extends RuntimeAsyncDisposable {
  readonly time: TimeService;
  readonly scheduler: Scheduler;
  readonly tweens: TweenService;
  readonly input: InputService;
  readonly events: TypedEventBus<TEvents>;
  readonly scenes: SceneManager;
  /**
   * Consume one host frame in a fixed order: time, scheduler, tweens, then the
   * active ComponentWorld callback. The host still owns and invokes the tick.
   */
  update(unscaledDeltaSeconds: number, updateWorld?: (scaledDeltaSeconds: number) => void): RuntimeTimeFrame;
}

/**
 * Composes optional host-neutral services without a global singleton or an
 * internal loop. The embedding host calls update() from its own frame source.
 */
export function createEngineRuntime<TEvents extends object = Record<string, never>>(
  options: EngineRuntimeOptions,
): EngineRuntime<TEvents> {
  if (!options || typeof options !== "object") {
    throw new TypeError("EngineRuntime requires explicit host service providers.");
  }
  // Validate the loader before acquiring the host input subscription.
  const scenes = createSceneManager(options.sceneLoader);
  const time = createTimeService();
  const scheduler = createScheduler();
  const tweens = createTweenService();
  const events = createTypedEventBus<TEvents>();
  const input = createInputService({
    source: options.inputSource,
    routeResolver: options.inputRouteResolver,
    coordinates: options.inputCoordinates,
  });
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  let updating = false;

  const runtime: EngineRuntime<TEvents> = {
    get isDisposed(): boolean { return disposed; },
    time,
    scheduler,
    tweens,
    input,
    events,
    scenes,
    update(unscaledDeltaSeconds, updateWorld): RuntimeTimeFrame {
      if (disposed) throw new Error("EngineRuntime is disposed.");
      if (updating) throw new Error("EngineRuntime.update() is not re-entrant.");
      if (updateWorld !== undefined && typeof updateWorld !== "function") {
        throw new TypeError("World update must be a function when supplied.");
      }
      const frame = time.advance(unscaledDeltaSeconds);
      updating = true;
      const errors: unknown[] = [];
      try {
        try { scheduler.update(frame); } catch (error) { errors.push(error); }
        try { tweens.update(frame); } catch (error) { errors.push(error); }
        if (updateWorld) {
          try {
            assertSynchronousResult(updateWorld(frame.deltaSeconds), "ComponentWorld update callback");
          } catch (error) { errors.push(error); }
        }
      } finally {
        updating = false;
      }
      if (errors.length > 0) throw new AggregateError(errors, "EngineRuntime frame completed with service errors.");
      return frame;
    },
    dispose(): Promise<void> {
      if (disposePromise) return disposePromise;
      if (updating) throw new Error("EngineRuntime.dispose() cannot run during EngineRuntime.update().");
      disposed = true;
      disposePromise = (async () => {
        const errors: unknown[] = [];
        try { await scenes.dispose(); } catch (error) { errors.push(error); }
        for (const service of [input, events, tweens, scheduler, time]) {
          try { service.dispose(); } catch (error) { errors.push(error); }
        }
        if (errors.length > 0) throw new AggregateError(errors, "EngineRuntime disposal failed.");
      })();
      return disposePromise;
    },
  };
  return runtime;
}
