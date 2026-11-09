import type { RuntimeDisposable } from "./common.js";

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
