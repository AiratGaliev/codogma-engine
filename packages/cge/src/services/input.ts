import type { RuntimeDisposable } from "./common.js";
import { assertSynchronousResult } from "./sync-callback.js";

export type InputRoute = "ui" | "world";
export type InputKeyPhase = "down" | "up" | "cancel";
export type InputPointerPhase = "down" | "move" | "up" | "cancel";
export type InputPointerType = "mouse" | "touch" | "pen" | "unknown";

export interface InputModifiers {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

export interface InputPoint {
  readonly x: number;
  readonly y: number;
}

export type InputCoordinateSpace = "screen" | "canvas" | "viewport" | "world" | "local" | "ui";

export interface InputCoordinateContext {
  readonly viewportId?: string;
  readonly cameraId?: string;
  readonly targetId?: string;
}

export interface InputCoordinateSample {
  readonly point: InputPoint;
  readonly referenceId: string;
}

export interface InputPointerCoordinates {
  readonly screen: InputPoint;
  readonly canvas: InputPoint;
  readonly viewport?: InputCoordinateSample;
  readonly world?: InputCoordinateSample;
  readonly local?: InputCoordinateSample;
  readonly ui?: InputPoint;
}

export interface InputCoordinateMapper {
  /** Returns undefined when the required viewport, camera or target context is unavailable. */
  convert(
    point: InputPoint,
    from: InputCoordinateSpace,
    to: InputCoordinateSpace,
    context?: InputCoordinateContext,
  ): InputPoint | undefined;
}

interface InputEventBase {
  /** Monotonic seconds from the runtime host's time origin. */
  readonly timestampSeconds: number;
}

export interface InputKeyboardEvent extends InputEventBase {
  readonly kind: "keyboard";
  readonly phase: InputKeyPhase;
  /** Physical key identifier, e.g. KeyW or Space. */
  readonly code: string;
  /** Layout-dependent key value supplied by the host. */
  readonly key: string;
  readonly repeat: boolean;
  readonly modifiers: InputModifiers;
}

export interface InputPointerEvent extends InputEventBase {
  readonly kind: "pointer";
  readonly phase: InputPointerPhase;
  readonly pointerId: number;
  readonly pointerType: InputPointerType;
  /** Physical button index; -1 when the event is not associated with a button change. */
  readonly button: number;
  /** Normalized bitmask of currently held buttons. */
  readonly buttons: number;
  /** Pressure normalized to the inclusive range 0..1. */
  readonly pressure: number;
  readonly modifiers: InputModifiers;
  readonly coordinates: InputPointerCoordinates;
}

export interface InputFocusEvent extends InputEventBase {
  readonly kind: "focus";
  readonly state: "lost" | "gained";
  readonly reason: "host" | "background" | "unavailable";
}

export type InputEvent = InputKeyboardEvent | InputPointerEvent | InputFocusEvent;
export type RoutedInputEvent = InputKeyboardEvent | InputPointerEvent;
export type InputEventHandler = (event: InputEvent) => void;

export interface InputSubscription extends RuntimeDisposable {}

export interface InputEventSource {
  /** Emits normalized Core events; browser/DOM event objects must not cross this boundary. */
  subscribe(handler: InputEventHandler): InputSubscription;
}

export interface InputRouteResolver {
  /** UI wins over world when both could receive the same physical event; undefined means no recipient. */
  resolve(event: RoutedInputEvent): InputRoute | undefined;
}

export interface InputSubscribeOptions {
  /** Aborting the signal releases this listener. */
  readonly signal?: AbortSignal;
}

/**
 * Routes each physical event exclusively to either UI or world listeners.
 * Focus lifecycle events are broadcast to both routes.
 */
export interface InputService extends RuntimeDisposable {
  subscribe(
    route: InputRoute,
    handler: InputEventHandler,
    options?: InputSubscribeOptions,
  ): InputSubscription;
  readonly coordinates: InputCoordinateMapper;
}

export interface InputServiceOptions {
  readonly source: InputEventSource;
  readonly routeResolver: InputRouteResolver;
  readonly coordinates: InputCoordinateMapper;
}

interface InputListener {
  readonly route: InputRoute;
  readonly handler: InputEventHandler;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
  disposed: boolean;
}

interface HeldInput {
  readonly route: InputRoute;
  readonly event: RoutedInputEvent;
}

class InputSubscriptionImpl implements InputSubscription {
  constructor(private readonly owner: InputServiceImpl, private readonly listener: InputListener) {}
  get isDisposed(): boolean { return this.listener.disposed; }
  dispose(): void { this.owner.remove(this.listener); }
}

function finitePoint(point: InputPoint): boolean {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function snapshotInputEvent(event: InputEvent): InputEvent {
  if (!Number.isFinite(event.timestampSeconds)) throw new RangeError("Input event timestamp must be finite.");
  if (event.kind === "focus") {
    if ((event.state !== "lost" && event.state !== "gained") ||
        (event.reason !== "host" && event.reason !== "background" && event.reason !== "unavailable")) {
      throw new TypeError("Input focus event is invalid.");
    }
    return Object.freeze({ ...event });
  }
  const modifiers = event.modifiers;
  if (!modifiers ||
      typeof modifiers.alt !== "boolean" ||
      typeof modifiers.ctrl !== "boolean" ||
      typeof modifiers.meta !== "boolean" ||
      typeof modifiers.shift !== "boolean") {
    throw new TypeError("Input modifier state is invalid.");
  }
  if (event.kind === "keyboard") {
    if ((event.phase !== "down" && event.phase !== "up" && event.phase !== "cancel") ||
        typeof event.code !== "string" || event.code.length === 0 ||
        typeof event.key !== "string" || typeof event.repeat !== "boolean") {
      throw new TypeError("Normalized keyboard event is invalid.");
    }
    return Object.freeze({ ...event, modifiers: Object.freeze({ ...modifiers }) });
  }
  if ((event.phase !== "down" && event.phase !== "move" && event.phase !== "up" && event.phase !== "cancel") ||
      !Number.isSafeInteger(event.pointerId) ||
      (event.pointerType !== "mouse" && event.pointerType !== "touch" &&
        event.pointerType !== "pen" && event.pointerType !== "unknown") ||
      !Number.isSafeInteger(event.button) || event.button < -1 ||
      !Number.isSafeInteger(event.buttons) || event.buttons < 0 ||
      !Number.isFinite(event.pressure) || event.pressure < 0 || event.pressure > 1 ||
      !event.coordinates || !finitePoint(event.coordinates.screen) || !finitePoint(event.coordinates.canvas)) {
    throw new TypeError("Normalized pointer event is invalid.");
  }
  const coordinates = event.coordinates;
  for (const sample of [coordinates.viewport, coordinates.world, coordinates.local]) {
    if (sample && (!finitePoint(sample.point) || typeof sample.referenceId !== "string")) {
      throw new TypeError("Input coordinate sample is invalid.");
    }
  }
  if (coordinates.ui && !finitePoint(coordinates.ui)) throw new TypeError("UI input coordinates are invalid.");
  return Object.freeze({
    ...event,
    modifiers: Object.freeze({ ...modifiers }),
    coordinates: Object.freeze({
      screen: Object.freeze({ ...coordinates.screen }),
      canvas: Object.freeze({ ...coordinates.canvas }),
      ...(coordinates.viewport ? { viewport: Object.freeze({ ...coordinates.viewport, point: Object.freeze({ ...coordinates.viewport.point }) }) } : {}),
      ...(coordinates.world ? { world: Object.freeze({ ...coordinates.world, point: Object.freeze({ ...coordinates.world.point }) }) } : {}),
      ...(coordinates.local ? { local: Object.freeze({ ...coordinates.local, point: Object.freeze({ ...coordinates.local.point }) }) } : {}),
      ...(coordinates.ui ? { ui: Object.freeze({ ...coordinates.ui }) } : {}),
    }),
  });
}

class InputServiceImpl implements InputService {
  private readonly listeners = new Set<InputListener>();
  private readonly heldKeys = new Map<string, HeldInput>();
  private readonly heldPointers = new Map<number, HeldInput>();
  private sourceSubscription: InputSubscription | undefined;
  private disposed = false;

  constructor(
    private readonly source: InputEventSource,
    private readonly routeResolver: InputRouteResolver,
    readonly coordinates: InputCoordinateMapper,
  ) {
    if (!source || typeof source.subscribe !== "function" ||
        !routeResolver || typeof routeResolver.resolve !== "function" ||
        !coordinates || typeof coordinates.convert !== "function") {
      throw new TypeError("InputService requires explicit source, route resolver and coordinate mapper providers.");
    }
    this.sourceSubscription = source.subscribe((event) => this.receive(event));
    if (!this.sourceSubscription || typeof this.sourceSubscription.dispose !== "function") {
      throw new TypeError("InputEventSource must return a disposable subscription.");
    }
  }

  get isDisposed(): boolean { return this.disposed; }

  subscribe(route: InputRoute, handler: InputEventHandler, options: InputSubscribeOptions = {}): InputSubscription {
    this.assertUsable();
    if (route !== "ui" && route !== "world") throw new TypeError("Input route must be ui or world.");
    if (typeof handler !== "function") throw new TypeError("Input subscription requires a handler.");

    const listener: InputListener = {
      route,
      handler,
      ...(options.signal ? { signal: options.signal } : {}),
      disposed: false,
    };
    if (options.signal) {
      const mutable = listener as { onAbort?: () => void };
      mutable.onAbort = () => this.remove(listener);
      if (options.signal.aborted) {
        listener.disposed = true;
        return new InputSubscriptionImpl(this, listener);
      }
      options.signal.addEventListener("abort", mutable.onAbort, { once: true });
    }
    this.listeners.add(listener);
    return new InputSubscriptionImpl(this, listener);
  }

  remove(listener: InputListener): void {
    if (listener.disposed) return;
    listener.disposed = true;
    if (listener.signal && listener.onAbort) {
      listener.signal.removeEventListener("abort", listener.onAbort);
    }
    this.listeners.delete(listener);
  }

  receive(input: InputEvent): void {
    if (this.disposed) return;
    const event = snapshotInputEvent(input);
    if (event.kind === "focus") {
      this.receiveFocus(event);
      return;
    }
    if (event.kind === "keyboard") this.receiveKeyboard(event);
    else this.receivePointer(event);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    try { this.sourceSubscription?.dispose(); } catch (error) { errors.push(error); }
    this.sourceSubscription = undefined;
    for (const listener of [...this.listeners]) this.remove(listener);
    this.heldKeys.clear();
    this.heldPointers.clear();
    if (errors.length > 0) throw new AggregateError(errors, "InputService cleanup failed.");
  }

  private receiveFocus(event: InputFocusEvent): void {
    const errors: unknown[] = [];
    if (event.state === "lost") {
      for (const [code, held] of this.heldKeys) {
        const original = held.event as InputKeyboardEvent;
        try {
          this.dispatch(held.route, Object.freeze({ ...original, phase: "cancel", repeat: false, timestampSeconds: event.timestampSeconds }));
        } catch (error) { errors.push(error); }
        this.heldKeys.delete(code);
      }
      for (const [pointerId, held] of this.heldPointers) {
        const original = held.event as InputPointerEvent;
        try {
          this.dispatch(held.route, Object.freeze({ ...original, phase: "cancel", buttons: 0, pressure: 0, timestampSeconds: event.timestampSeconds }));
        } catch (error) { errors.push(error); }
        this.heldPointers.delete(pointerId);
      }
    }
    try { this.dispatch("ui", event); } catch (error) { errors.push(error); }
    try { this.dispatch("world", event); } catch (error) { errors.push(error); }
    if (errors.length > 0) throw new AggregateError(errors, "Input focus transition handlers failed.");
  }

  private receiveKeyboard(event: InputKeyboardEvent): void {
    const held = this.heldKeys.get(event.code);
    if (event.phase === "down") {
      const route = held?.route ?? this.routeResolver.resolve(event);
      if (!route) return;
      if (!held) this.heldKeys.set(event.code, { route, event });
      this.dispatch(route, event);
      return;
    }
    if (!held) return;
    this.heldKeys.delete(event.code);
    this.dispatch(held.route, event);
  }

  private receivePointer(event: InputPointerEvent): void {
    const held = this.heldPointers.get(event.pointerId);
    if (event.phase === "down") {
      const route = held?.route ?? this.routeResolver.resolve(event);
      if (!route) return;
      if (!held) this.heldPointers.set(event.pointerId, { route, event });
      else this.heldPointers.set(event.pointerId, { route: held.route, event });
      this.dispatch(route, event);
      return;
    }
    if (event.phase === "move") {
      const route = held?.route ?? this.routeResolver.resolve(event);
      if (route) {
        if (held) this.heldPointers.set(event.pointerId, { route: held.route, event });
        this.dispatch(route, event);
      }
      return;
    }
    if (!held) return;
    if (event.phase === "cancel" || event.buttons === 0) this.heldPointers.delete(event.pointerId);
    else this.heldPointers.set(event.pointerId, { route: held.route, event });
    this.dispatch(held.route, event);
  }

  private dispatch(route: InputRoute, event: InputEvent): void {
    const errors: unknown[] = [];
    const listeners = [...this.listeners].filter((listener) => listener.route === route);
    for (const listener of listeners) {
      if (listener.disposed || !this.listeners.has(listener)) continue;
      try {
        assertSynchronousResult(listener.handler(event), "Input handlers");
      } catch (error) { errors.push(error); }
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more input handlers failed.");
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("InputService is disposed.");
  }
}

export function createInputService(options: InputServiceOptions): InputService {
  return new InputServiceImpl(options.source, options.routeResolver, options.coordinates);
}
