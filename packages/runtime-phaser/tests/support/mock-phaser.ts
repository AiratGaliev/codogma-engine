import type Phaser from "phaser";

export class MockEvents {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void): this {
    const bucket = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
    bucket.add(listener);
    this.listeners.set(event, bucket);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

export class MockGameObject {
  readonly scene: object;
  parentContainer: MockContainer | null = null;
  ignoreDestroy = false;
  active = true;
  visible = true;
  isDestroyed = false;
  destroyCount = 0;
  x = 0;
  y = 0;
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  originX = 0.25;
  originY = 0.25;

  constructor(scene: object) {
    this.scene = scene;
  }

  setPosition(x = 0, y = x): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setRotation(rotation = 0): this {
    this.rotation = rotation;
    return this;
  }

  setScale(x = 1, y = x): this {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }

  setActive(value: boolean): this {
    this.active = value;
    return this;
  }

  setVisible(value: boolean): this {
    this.visible = value;
    return this;
  }

  setOrigin(x = 0.5, y = x): this {
    this.originX = x;
    this.originY = y;
    return this;
  }

  destroy(): void {
    if (this.isDestroyed || this.ignoreDestroy) return;
    this.parentContainer?.remove(this);
    this.isDestroyed = true;
    this.destroyCount += 1;
  }
}

export class MockContainer extends MockGameObject {
  readonly list: MockGameObject[] = [];
  exclusive = true;

  add(child: MockGameObject | MockGameObject[]): this {
    for (const item of Array.isArray(child) ? child : [child]) {
      if (this.exclusive) {
        item.parentContainer?.remove(item);
        item.parentContainer = this;
      }
      this.list.push(item);
    }
    return this;
  }

  remove(child: MockGameObject): this {
    const index = this.list.indexOf(child);
    if (index >= 0) {
      this.list.splice(index, 1);
      if (this.exclusive && child.parentContainer === this) child.parentContainer = null;
    }
    return this;
  }

  setExclusive(value: boolean): this {
    this.exclusive = value;
    return this;
  }

  override destroy(): void {
    if (this.isDestroyed || this.ignoreDestroy) return;
    if (this.exclusive) {
      for (const child of [...this.list]) {
        this.remove(child);
        child.destroy();
      }
    }
    this.list.length = 0;
    super.destroy();
  }
}

export interface MockPhaserHost {
  readonly scene: Phaser.Scene;
  readonly events: MockEvents;
  readonly containers: MockContainer[];
}

export function createMockPhaserHost(): MockPhaserHost {
  const events = new MockEvents();
  const containers: MockContainer[] = [];
  const identity = {};
  const scene = {
    events,
    add: {
      container() {
        const container = new MockContainer(identity);
        containers.push(container);
        return container;
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, events, containers };
}
