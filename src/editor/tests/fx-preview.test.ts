import { expect, test } from "vitest";
import { createFxObject } from "../src/domain/fx-model.ts";
import {
  createFxPreview,
  type FxContainerAdapter,
  type FxDisplayObject,
  type FxPhaserAdapter,
  type FxSceneAdapter,
} from "../src/components/fx-preview.ts";

type Listener = (...args: unknown[]) => void;

function emitter() {
  const callbacks = new Map<string, Set<Listener>>();
  return {
    on(event: string, listener: Listener) {
      const listeners = callbacks.get(event) ?? new Set<Listener>();
      listeners.add(listener);
      callbacks.set(event, listeners);
      return this;
    },
    once(event: string, listener: Listener) {
      const wrapped: Listener = (...args) => {
        this.off(event, wrapped);
        listener(...args);
      };
      this.on(event, wrapped);
      return this;
    },
    off(event: string, listener?: Listener) {
      if (!listener) callbacks.delete(event);
      else callbacks.get(event)?.delete(listener);
      return this;
    },
    listeners(event: string) {
      return [...(callbacks.get(event) ?? [])];
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(callbacks.get(event) ?? [])]) listener(...args);
    },
    count(event: string) {
      return callbacks.get(event)?.size ?? 0;
    },
  };
}

function displayObject() {
  const events = emitter();
  const object = {
    ...events,
    x: 120,
    y: 90,
    width: 64,
    height: 48,
    originX: 0.5,
    originY: 0.5,
    scaleX: 1,
    scaleY: 1,
    alpha: 0.75,
    active: true,
    visible: true,
    depth: 2,
    destroyCalls: 0,
    filters: undefined as { internal: { remove(filter: unknown): void } } | undefined,
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setSize(width: number, height: number) { this.width = width; this.height = height; return this; },
    setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; },
    setRotation(_value: number) { return this; },
    setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; },
    setAlpha(value: number) { this.alpha = value; return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setDepth(value: number) { this.depth = value; return this; },
    setScrollFactor(_x: number, _y: number) { return this; },
    clear() { return this; },
    lineStyle(_width: number, _color: number, _alpha: number) { return this; },
    strokeEllipse(_x: number, _y: number, _width: number, _height: number) { return this; },
    destroy() { this.destroyCalls++; this.active = false; return this; },
  };
  return object;
}

function previewEnvironment() {
  const sceneEvents = emitter();
  const created: Array<ReturnType<typeof displayObject>> = [];
  const removedMasks: unknown[] = [];
  const maskConfigs: Record<string, unknown>[] = [];
  let maskConfig: Record<string, unknown> | undefined;
  let gradientConfig: Record<string, unknown> | undefined;
  let bloomConfig: Record<string, unknown> | undefined;
  let shineConfig: Record<string, unknown> | undefined;
  const scene = {
    events: sceneEvents,
    add: {
      rectangle: () => { const item = displayObject(); created.push(item); return item; },
      graphics: () => { const item = displayObject(); created.push(item); return item; },
      gradient: (config: Record<string, unknown>) => {
        gradientConfig = config;
        const item = displayObject();
        created.push(item);
        return item;
      },
    },
  };
  const phaser = {
    Geom: { Rectangle: class { constructor(public x: number, public y: number, public width: number, public height: number) {} } },
    Actions: {
      AddMaskShape: (_parent: ReturnType<typeof displayObject>, config: Record<string, unknown>) => {
        maskConfig = config;
        maskConfigs.push(config);
        return [{ id: `mask-${maskConfigs.length}` }];
      },
      AddEffectBloom: (_parent: ReturnType<typeof displayObject>, config: Record<string, unknown>) => {
        bloomConfig = config;
        return [{ parallelFilters: { destroy: () => { removedMasks.push("bloom"); } } }];
      },
      AddEffectShine: (parent: ReturnType<typeof displayObject>, config: Record<string, unknown>) => {
        shineConfig = config;
        const actionListener = () => undefined;
        parent.once("destroy", actionListener);
        return [{
          blendFilter: { destroy: () => { removedMasks.push("shine-filter"); } },
          tween: { destroy: () => { removedMasks.push("shine-tween"); } },
          dynamicTexture: { destroy: () => { removedMasks.push("shine-texture"); } },
        }];
      },
    },
  };
  const parent = displayObject();
  parent.filters = { internal: { remove: (mask: unknown) => removedMasks.push(mask) } };
  return {
    scene, phaser, parent, created, removedMasks, sceneEvents,
    get maskConfig() { return maskConfig; },
    maskConfigs,
    get gradientConfig() { return gradientConfig; },
    get bloomConfig() { return bloomConfig; },
    get shineConfig() { return shineConfig; },
  };
}

test("Circle creates a Phaser mask and keeps helper objects in sync, then disposes them", () => {
  const env = previewEnvironment();
  const result = createFxPreview(
    env.scene as unknown as FxSceneAdapter,
    env.phaser as unknown as FxPhaserAdapter,
    env.parent as unknown as FxDisplayObject,
    createFxObject("Circle", "circle"),
  );
  expect(env.maskConfig?.shape).toBe("circle");
  expect(env.maskConfig?.useInternal).toBe(true);
  expect(env.created).toHaveLength(2);
  expect(env.sceneEvents.count("update")).toBe(1);

  env.parent.x = 150;
  env.sceneEvents.emit("update");
  expect(env.created[0]?.x).toBe(150);
  expect(env.created[0]?.alpha).toBeCloseTo(0.3);
  expect(env.created[1]?.alpha).toBeCloseTo(0.75);

  const previousHelpers = env.created.slice();
  env.parent.width = 96;
  env.parent.height = 48;
  env.sceneEvents.emit("update");
  expect(env.maskConfigs).toHaveLength(2);
  expect(env.removedMasks).toContainEqual({ id: "mask-1" });
  expect(previousHelpers.every((helper) => helper.destroyCalls === 1)).toBe(true);
  expect(env.created).toHaveLength(4);

  result.dispose();
  result.dispose();
  expect(env.sceneEvents.count("update")).toBe(0);
  expect(env.removedMasks).toContainEqual({ id: "mask-1" });
  expect(env.removedMasks).toContainEqual({ id: "mask-2" });
  expect(env.created.every((item) => item.destroyCalls === 1)).toBe(true);
});

test("Bloom passes legacy filter settings and releases its ParallelFilters", () => {
  const env = previewEnvironment();
  const effect = createFxObject("Bloom", "bloom");
  effect.preFX = false;
  effect.threshold = 0.35;
  effect.blurSteps = 8;
  const result = createFxPreview(
    env.scene as unknown as FxSceneAdapter,
    env.phaser as unknown as FxPhaserAdapter,
    env.parent as unknown as FxDisplayObject,
    effect,
  );

  expect(env.bloomConfig).toMatchObject({ threshold: 0.35, blurSteps: 8, useInternal: false });
  result.dispose();
  expect(env.removedMasks).toContain("bloom");
});

test("Gradient creates a sibling Game Object, follows transforms and reports parent alpha limitation", () => {
  const env = previewEnvironment();
  const effect = createFxObject("Gradient", "gradient");
  effect.color1 = 0xff0000;
  effect.color2 = "#2020ff";
  effect.alpha = 0.45;
  const result = createFxPreview(env.scene as never, env.phaser as never, env.parent as never, effect);

  expect(env.gradientConfig?.bands).toBeDefined();
  expect(result.diagnostics[0]).toContain("does not inherit the parent object's alpha");
  env.parent.x = 220;
  env.sceneEvents.emit("update");
  expect(env.created[0]?.x).toBe(220);
  result.dispose();
  expect(env.sceneEvents.count("update")).toBe(0);
  expect(env.created[0]?.destroyCalls).toBe(1);
});

test("Shine releases action listeners, filters, tween and DynamicTexture on disposal", () => {
  const env = previewEnvironment();
  const result = createFxPreview(
    env.scene as unknown as FxSceneAdapter,
    env.phaser as unknown as FxPhaserAdapter,
    env.parent as unknown as FxDisplayObject,
    createFxObject("Shine", "shine"),
  );
  expect(env.shineConfig?.useExternal).toBe(false);
  expect(env.parent.listeners("destroy")).toHaveLength(2);

  result.dispose();
  expect(env.parent.listeners("destroy")).toHaveLength(0);
  expect(env.removedMasks).toEqual(["shine-filter", "shine-tween", "shine-texture"]);
});
test("Circle and Gradient helpers keep their order adjacent to a nested Container sibling", () => {
  const env = previewEnvironment();
  const parent = env.parent as unknown as FxDisplayObject;
  const sibling = displayObject() as unknown as FxDisplayObject;
  const children: FxDisplayObject[] = [parent, sibling];
  const container: FxContainerAdapter = {
    getIndex: (child) => children.indexOf(child),
    addAt(child, index) {
      const existing = children.indexOf(child);
      if (existing >= 0) children.splice(existing, 1);
      children.splice(Math.min(Math.max(0, index), children.length), 0, child);
      (child as FxDisplayObject & { parentContainer?: FxContainerAdapter }).parentContainer = container;
      return container;
    },
    add(child) {
      return this.addAt(child, children.length);
    },
  };
  (parent as FxDisplayObject & { parentContainer?: FxContainerAdapter }).parentContainer = container;

  const circle = createFxPreview(
    env.scene as unknown as FxSceneAdapter,
    env.phaser as unknown as FxPhaserAdapter,
    parent,
    createFxObject("Circle", "circle"),
    0,
  );
  const gradient = createFxPreview(
    env.scene as unknown as FxSceneAdapter,
    env.phaser as unknown as FxPhaserAdapter,
    parent,
    createFxObject("Gradient", "gradient"),
    1,
  );

  expect(children).toEqual([
    env.created[0],
    parent,
    env.created[1],
    env.created[2],
    sibling,
  ]);

  gradient.dispose();
  circle.dispose();
});
