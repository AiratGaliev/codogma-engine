import type { RuntimeDisposable } from "./common.js";
import { assertSynchronousResult } from "./sync-callback.js";

export interface EventSubscription extends RuntimeDisposable {
  unsubscribe(): void;
}

export interface EventSubscribeOptions {
  /** Releases the subscription when its owner is aborted or destroyed. */
  readonly signal?: AbortSignal;
}

export interface TypedEventBus<TEvents extends object> extends RuntimeDisposable {
  subscribe<TKey extends keyof TEvents>(
    type: TKey,
    handler: (payload: TEvents[TKey]) => void,
    options?: EventSubscribeOptions,
  ): EventSubscription;
  emit<TKey extends keyof TEvents>(type: TKey, payload: TEvents[TKey]): void;
  clear<TKey extends keyof TEvents>(type?: TKey): void;
}

interface EventListener<TPayload> {
  readonly handler: (payload: TPayload) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
  disposed: boolean;
}

class EventSubscriptionImpl<TEvents extends object, TKey extends keyof TEvents>
implements EventSubscription {
  constructor(
    private readonly owner: TypedEventBusImpl<TEvents>,
    private readonly type: TKey,
    private readonly listener: EventListener<TEvents[TKey]>,
  ) {}
  get isDisposed(): boolean { return this.listener.disposed; }
  unsubscribe(): void { this.dispose(); }
  dispose(): void { this.owner.remove(this.type, this.listener); }
}

class TypedEventBusImpl<TEvents extends object> implements TypedEventBus<TEvents> {
  private readonly listeners = new Map<keyof TEvents, Set<EventListener<unknown>>>();
  private disposed = false;

  get isDisposed(): boolean { return this.disposed; }

  subscribe<TKey extends keyof TEvents>(
    type: TKey,
    handler: (payload: TEvents[TKey]) => void,
    options: EventSubscribeOptions = {},
  ): EventSubscription {
    this.assertUsable();
    if (typeof handler !== "function") throw new TypeError("Event subscription requires a handler.");
    const listener: EventListener<TEvents[TKey]> = {
      handler,
      ...(options.signal ? { signal: options.signal } : {}),
      disposed: false,
    };
    if (options.signal) {
      const mutable = listener as { onAbort?: () => void };
      mutable.onAbort = () => this.remove(type, listener);
      if (options.signal.aborted) {
        listener.disposed = true;
        return new EventSubscriptionImpl(this, type, listener);
      }
      options.signal.addEventListener("abort", mutable.onAbort, { once: true });
    }
    const bucket = this.listeners.get(type) ?? new Set<EventListener<unknown>>();
    bucket.add(listener as EventListener<unknown>);
    this.listeners.set(type, bucket);
    return new EventSubscriptionImpl(this, type, listener);
  }

  emit<TKey extends keyof TEvents>(type: TKey, payload: TEvents[TKey]): void {
    this.assertUsable();
    const bucket = this.listeners.get(type);
    if (!bucket || bucket.size === 0) return;
    const errors: unknown[] = [];
    // Snapshot semantics: subscriptions added during emit begin on the next emit.
    for (const candidate of [...bucket]) {
      const listener = candidate as EventListener<TEvents[TKey]>;
      if (listener.disposed || !bucket.has(candidate)) continue;
      try {
        assertSynchronousResult(listener.handler(payload), "Event handlers");
      } catch (error) { errors.push(error); }
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more event handlers failed.");
  }

  remove<TKey extends keyof TEvents>(type: TKey, listener: EventListener<TEvents[TKey]>): void {
    if (listener.disposed) return;
    listener.disposed = true;
    if (listener.signal && listener.onAbort) {
      listener.signal.removeEventListener("abort", listener.onAbort);
    }
    const bucket = this.listeners.get(type);
    bucket?.delete(listener as EventListener<unknown>);
    if (bucket?.size === 0) this.listeners.delete(type);
  }

  clear<TKey extends keyof TEvents>(type?: TKey): void {
    this.assertUsable();
    const entries = [...this.listeners.entries()].filter(([key]) => type === undefined || key === type);
    for (const [key, bucket] of entries) {
      for (const listener of [...bucket]) {
        if (listener.disposed) continue;
        listener.disposed = true;
        if (listener.signal && listener.onAbort) listener.signal.removeEventListener("abort", listener.onAbort);
      }
      bucket.clear();
      this.listeners.delete(key);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    // Disposing from a listener clears the remaining snapshot before dispatch continues.
    this.disposed = true;
    this.clearDisposedListeners();
  }

  private clearDisposedListeners(): void {
    for (const bucket of this.listeners.values()) {
      for (const listener of bucket) {
        listener.disposed = true;
        if (listener.signal && listener.onAbort) listener.signal.removeEventListener("abort", listener.onAbort);
      }
      bucket.clear();
    }
    this.listeners.clear();
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("TypedEventBus is disposed.");
  }
}

/** Creates an isolated, typed event bus; there is no process-wide singleton. */
export function createTypedEventBus<TEvents extends object>(): TypedEventBus<TEvents> {
  return new TypedEventBusImpl<TEvents>();
}
