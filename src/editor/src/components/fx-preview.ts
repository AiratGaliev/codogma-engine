import type { CircleFx, FxObject, GradientFx, BloomFx, ShineFx } from "../domain/fx-model.ts";

type UpdateListener = () => void;
type DestroyListener = (...args: unknown[]) => void;

export interface FxDisplayObject {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
  originX?: number;
  originY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  alpha?: number;
  visible?: boolean;
  active?: boolean;
  depth?: number;
  scrollFactorX?: number;
  scrollFactorY?: number;
  parentContainer?: FxContainerAdapter | null;
  filters?: { internal: FxFilterList; external: FxFilterList };
  setPosition(x: number, y: number): FxDisplayObject;
  setSize?(width: number, height: number): FxDisplayObject;
  setOrigin?(x: number, y: number): FxDisplayObject;
  setRotation?(radians: number): FxDisplayObject;
  setScale?(x: number, y?: number): FxDisplayObject;
  setAlpha?(alpha: number): FxDisplayObject;
  setVisible?(visible: boolean): FxDisplayObject;
  setDepth?(depth: number): FxDisplayObject;
  setScrollFactor?(x: number, y?: number): FxDisplayObject;
  clear?(): FxDisplayObject;
  lineStyle?(width: number, color: number, alpha?: number): FxDisplayObject;
  strokeEllipse?(x: number, y: number, width: number, height: number): FxDisplayObject;
  destroy?(): void;
  once?(event: string, listener: DestroyListener): FxDisplayObject;
  off?(event: string, listener?: DestroyListener): FxDisplayObject;
  listeners?(event: string): DestroyListener[];
}

export interface FxContainerAdapter {
  add(child: FxDisplayObject): FxContainerAdapter;
  addAt(child: FxDisplayObject, index: number): FxContainerAdapter;
  getIndex(child: FxDisplayObject): number;
}

export interface FxSceneAdapter {
  events: {
    on(event: "update", listener: UpdateListener): void;
    off(event: "update", listener: UpdateListener): void;
  };
  add: {
    rectangle(x: number, y: number, width: number, height: number, color: number, alpha?: number): FxDisplayObject;
    graphics(): FxDisplayObject;
    gradient(config: Record<string, unknown>, x: number, y: number, width: number, height: number): FxDisplayObject;
  };
}

interface FxFilterController { destroy(): void; }

interface FxFilterList {
  remove(filter: unknown): void;
  clear(): void;
}

interface FxParallelFilters extends FxFilterController {
  top: FxFilterList;
  bottom: FxFilterList;
  blend: FxFilterController;
}

interface FxController {
  parallelFilters?: FxParallelFilters;
  blendFilter?: FxFilterController;
  tween?: FxFilterController;
  dynamicTexture?: FxFilterController;
}

export interface FxPhaserAdapter {
  Actions: {
    AddMaskShape(parent: FxDisplayObject, config: Record<string, unknown>): unknown[];
    AddEffectBloom(parent: FxDisplayObject, config: Record<string, unknown>): FxController[];
    AddEffectShine(parent: FxDisplayObject, config: Record<string, unknown>): FxController[];
  };
  Geom: {
    Rectangle: new (x: number, y: number, width: number, height: number) => unknown;
  };
}

export interface FxPreviewResult {
  dispose: () => void;
  diagnostics: string[];
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function colorNumber(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (/^#[\da-f]{3}$/i.test(normalized)) {
    const expanded = normalized.slice(1).split("").map((part) => part + part).join("");
    return Number.parseInt(expanded, 16);
  }
  if (/^#[\da-f]{6}$/i.test(normalized)) return Number.parseInt(normalized.slice(1), 16);
  if (/^0x[\da-f]{1,8}$/i.test(normalized)) return Number.parseInt(normalized.slice(2), 16);
  return fallback;
}

function dimensions(parent: FxDisplayObject): { width: number; height: number } {
  return {
    width: Math.max(1, number(parent.width, number(parent.displayWidth, 128))),
    height: Math.max(1, number(parent.height, number(parent.displayHeight, 128))),
  };
}

function attachHelper(parent: FxDisplayObject, helper: FxDisplayObject, indexOffset: number): void {
  const container = parent.parentContainer;
  if (container && helper.parentContainer !== container) {
    const index = container.getIndex(parent);
    container.addAt(helper, Math.max(0, index + indexOffset));
  }
}

function setHelperTransform(helper: FxDisplayObject, parent: FxDisplayObject, depthOffset: number): void {
  helper.setPosition(number(parent.x, 0), number(parent.y, 0));
  helper.setRotation?.(number(parent.rotation, 0));
  helper.setScale?.(number(parent.scaleX, 1), number(parent.scaleY, 1));
  helper.setAlpha?.(number(parent.alpha, 1));
  helper.setVisible?.(parent.active !== false && parent.visible !== false);
  helper.setDepth?.(number(parent.depth, 0) + depthOffset);
  helper.setScrollFactor?.(number(parent.scrollFactorX, 1), number(parent.scrollFactorY, 1));
}

function createCirclePreview(
  scene: FxSceneAdapter,
  phaser: FxPhaserAdapter,
  parent: FxDisplayObject,
  fx: CircleFx,
  renderOrderOffset: number,
): FxPreviewResult {
  let disposed = false;
  let mask: unknown;
  let background: FxDisplayObject | undefined;
  let ring: FxDisplayObject | undefined;
  let lastWidth = 0;
  let lastHeight = 0;
  let syncListener: UpdateListener;
  const helperDestroyed: DestroyListener = () => dispose();

  const removeVisuals = () => {
    background?.off?.("destroy", helperDestroyed);
    ring?.off?.("destroy", helperDestroyed);
    if (mask && parent.filters?.internal) {
      try {
        parent.filters.internal.remove(mask);
      } catch {
        // The renderer may already have released its FilterList during shutdown.
      }
    }
    mask = undefined;
    if (background?.active !== false) {
      try { background?.destroy?.(); } catch { /* Ignore already-destroyed preview helpers. */ }
    }
    if (ring?.active !== false) {
      try { ring?.destroy?.(); } catch { /* Ignore already-destroyed preview helpers. */ }
    }
    background = undefined;
    ring = undefined;
  };

  const buildVisuals = () => {
    removeVisuals();
    const size = dimensions(parent);
    lastWidth = size.width;
    lastHeight = size.height;
    const scale = Math.max(0.01, number(fx.scale, 1));
    const circleWidth = size.width * scale;
    const circleHeight = size.height * scale;

    const masks = phaser.Actions.AddMaskShape(parent, {
      shape: "circle",
      aspectRatio: 1,
      useInternal: true,
      region: new phaser.Geom.Rectangle(
        (size.width - circleWidth) / 2,
        (size.height - circleHeight) / 2,
        circleWidth,
        circleHeight,
      ),
      blurRadius: Math.max(0, number(fx.feather, 0.005) * Math.max(size.width, size.height)),
      blurSteps: 4,
      blurQuality: 1,
      scaleMode: 0,
      padding: 0,
    });
    mask = masks[0];

    background = scene.add.rectangle(
      number(parent.x, 0),
      number(parent.y, 0),
      size.width,
      size.height,
      colorNumber(fx.backgroundColor, 0xff0000),
      0.4,
    );
    ring = scene.add.graphics();
    background.once?.("destroy", helperDestroyed);
    ring.once?.("destroy", helperDestroyed);
  };

  const sync = () => {
    if (disposed) return;
    const size = dimensions(parent);
    if (size.width !== lastWidth || size.height !== lastHeight) {
      buildVisuals();
    }
    if (!background || !ring) return;

    background.setPosition(number(parent.x, 0), number(parent.y, 0));
    background.setSize?.(size.width, size.height);
    background.setOrigin?.(number(parent.originX, 0.5), number(parent.originY, 0.5));
    background.setRotation?.(number(parent.rotation, 0));
    background.setScale?.(number(parent.scaleX, 1), number(parent.scaleY, 1));
    background.setAlpha?.(number(parent.alpha, 1) * 0.4);
    background.setVisible?.(parent.active !== false && parent.visible !== false);
    background.setDepth?.(number(parent.depth, 0) - 0.001);
    background.setScrollFactor?.(number(parent.scrollFactorX, 1), number(parent.scrollFactorY, 1));

    const circleScale = Math.max(0.01, number(fx.scale, 1));
    const originX = number(parent.originX, 0.5);
    const originY = number(parent.originY, 0.5);
    const x = -originX * size.width + (size.width - size.width * circleScale) / 2;
    const y = -originY * size.height + (size.height - size.height * circleScale) / 2;
    ring.clear?.();
    ring.lineStyle?.(
      Math.max(0.01, number(fx.thickness, 8)),
      colorNumber(fx.color, 0xff33b2),
      1,
    );
    ring.strokeEllipse?.(x, y, size.width * circleScale, size.height * circleScale);
    setHelperTransform(ring, parent, 0.001);
    attachHelper(parent, background, 0);
    attachHelper(parent, ring, 1 + renderOrderOffset);
  };

  buildVisuals();
  syncListener = sync;
  scene.events.on("update", syncListener);

  const parentDestroyed: DestroyListener = () => dispose();
  parent.once?.("destroy", parentDestroyed);

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    scene.events.off("update", syncListener);
    parent.off?.("destroy", parentDestroyed);
    removeVisuals();
  }

  sync();
  return { dispose, diagnostics: [] };
}

function toRgba(value: string | number | undefined, alpha: number, fallback: number): number[] {
  const color = colorNumber(value, fallback);
  return [
    ((color >> 16) & 0xff) / 255,
    ((color >> 8) & 0xff) / 255,
    (color & 0xff) / 255,
    alpha,
  ];
}

function createGradientPreview(
  scene: FxSceneAdapter,
  parent: FxDisplayObject,
  fx: GradientFx,
  renderOrderOffset: number,
): FxPreviewResult {
  const size = dimensions(parent);
  const alpha = Math.max(0, Math.min(1, number(fx.alpha, 0.2)));
  const gradient = scene.add.gradient(
    {
      bands: [{
        colorStart: toRgba(fx.color1, alpha, 0xff0000),
        colorEnd: toRgba(fx.color2, alpha, 0x00ff00),
        size: number(fx.size, 0) > 0 ? number(fx.size, 0) : 1,
      }],
      start: { x: number(fx.fromX, 0), y: number(fx.fromY, 0) },
      shape: {
        x: number(fx.toX, 0) - number(fx.fromX, 0),
        y: number(fx.toY, 1) - number(fx.fromY, 0),
      },
      dither: true,
    },
    number(parent.x, 0),
    number(parent.y, 0),
    size.width,
    size.height,
  );
  let disposed = false;
  const sync = () => {
    if (disposed || gradient.active === false) return;
    const nextSize = dimensions(parent);
    gradient.setPosition(number(parent.x, 0), number(parent.y, 0));
    gradient.setSize?.(nextSize.width, nextSize.height);
    gradient.setOrigin?.(number(parent.originX, 0.5), number(parent.originY, 0.5));
    gradient.setRotation?.(number(parent.rotation, 0));
    gradient.setScale?.(number(parent.scaleX, 1), number(parent.scaleY, 1));
    gradient.setVisible?.(parent.active !== false && parent.visible !== false);
    gradient.setScrollFactor?.(number(parent.scrollFactorX, 1), number(parent.scrollFactorY, 1));
    gradient.setDepth?.(number(parent.depth, 0) + 0.001);
    attachHelper(parent, gradient, 1 + renderOrderOffset);
  };
  scene.events.on("update", sync);
  const parentDestroyed: DestroyListener = () => dispose();
  const gradientDestroyed: DestroyListener = () => dispose();
  parent.once?.("destroy", parentDestroyed);
  gradient.once?.("destroy", gradientDestroyed);

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    scene.events.off("update", sync);
    parent.off?.("destroy", parentDestroyed);
    gradient.off?.("destroy", gradientDestroyed);
    if (gradient.active !== false) gradient.destroy?.();
  }

  sync();
  const diagnostics = number(parent.alpha, 1) < 1
    ? ["Gradient is rendered as a sibling Game Object; the legacy Phaser codegen does not inherit the parent object's alpha."]
    : [];
  return { dispose, diagnostics };
}

function filterListFor(parent: FxDisplayObject, internal: boolean): FxFilterList {
  const filterList = internal ? parent.filters?.internal : parent.filters?.external;
  if (!filterList) {
    throw new Error("Phaser did not expose the Game Object filter list required to dispose this FX preview.");
  }
  return filterList;
}

/**
 * Phaser 4.2.1 ParallelFilters.destroy() only deactivates the outer controller.
 * Its child lists and blend controller own independent filter resources.
 */
function disposeParallelFilters(filterList: FxFilterList, parallel: FxParallelFilters): void {
  try { parallel.top.clear(); } catch { /* Ignore a list already being released. */ }
  try { parallel.bottom.clear(); } catch { /* Ignore a list already being released. */ }
  try { parallel.blend.destroy(); } catch { /* Ignore an already released blend controller. */ }
  try { filterList.remove(parallel); } catch {
    try { parallel.destroy(); } catch { /* Ignore an already released controller. */ }
  }
}

function createBloomPreview(phaser: FxPhaserAdapter, parent: FxDisplayObject, fx: BloomFx): FxPreviewResult {
  const effect = phaser.Actions.AddEffectBloom(parent, {
    threshold: number(fx.threshold, 0.5),
    blurRadius: Math.max(0, number(fx.blurRadius, 2)),
    blurSteps: Math.max(1, Math.round(number(fx.blurSteps, 4))),
    blurQuality: Math.max(0, Math.min(2, Math.round(number(fx.blurQuality, 0)))),
    blendAmount: Math.max(0, number(fx.blendAmount, 1)),
    useInternal: fx.preFX === true,
  })[0];
  const parallel = effect?.parallelFilters;
  if (!parallel) {
    throw new Error("Phaser did not create the Bloom filter. Confirm the object supports WebGL filters.");
  }
  const createdParallel: FxParallelFilters = parallel;

  let filterList: FxFilterList;
  try {
    filterList = filterListFor(parent, fx.preFX === true);
  } catch (error) {
    try { createdParallel.top.clear(); } catch { /* Ignore partial Phaser setup. */ }
    try { createdParallel.bottom.clear(); } catch { /* Ignore partial Phaser setup. */ }
    try { createdParallel.blend.destroy(); } catch { /* Ignore partial Phaser setup. */ }
    try { createdParallel.destroy(); } catch { /* Ignore partial Phaser setup. */ }
    throw error;
  }

  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    disposeParallelFilters(filterList, createdParallel);
    parent.off?.("destroy", parentDestroyed);
  }

  const parentDestroyed: DestroyListener = () => dispose();
  parent.once?.("destroy", parentDestroyed);
  return { dispose, diagnostics: [] };
}
function createShinePreview(phaser: FxPhaserAdapter, parent: FxDisplayObject, fx: ShineFx): FxPreviewResult {
  const before = parent.listeners?.("destroy") ?? [];
  const effect = phaser.Actions.AddEffectShine(parent, {
    radius: Math.max(0.01, number(fx.radius, 0.5)),
    direction: number(fx.direction, 0.5),
    scale: Math.max(0.1, number(fx.scale, 2)),
    duration: Math.max(1, number(fx.duration, 2000)),
    reveal: fx.reveal === true,
    yoyo: fx.yoyo === true,
    useExternal: fx.preFX !== true,
  })[0];
  const after = parent.listeners?.("destroy") ?? [];
  const actionListeners = after.filter((listener) => !before.includes(listener));
  if (!effect) {
    throw new Error("Phaser did not create the Shine effect. Confirm the object supports WebGL filters.");
  }

  const createdEffect = effect;
  const parallel = createdEffect.parallelFilters;
  const directBlend = createdEffect.blendFilter;
  if (!parallel && !directBlend) {
    throw new Error("Phaser did not create the Shine filter. Confirm the object supports WebGL filters.");
  }

  let filterList: FxFilterList;
  try {
    filterList = filterListFor(parent, fx.preFX === true);
  } catch (error) {
    actionListeners.forEach((listener) => parent.off?.("destroy", listener));
    try { parallel?.top.clear(); } catch { /* Ignore partial Phaser setup. */ }
    try { parallel?.bottom.clear(); } catch { /* Ignore partial Phaser setup. */ }
    try { parallel?.blend.destroy(); } catch { /* Ignore partial Phaser setup. */ }
    try { parallel?.destroy(); } catch { /* Ignore partial Phaser setup. */ }
    try { directBlend?.destroy(); } catch { /* Ignore partial Phaser setup. */ }
    try { createdEffect.tween?.destroy(); } catch { /* Ignore partial Phaser setup. */ }
    try { createdEffect.dynamicTexture?.destroy(); } catch { /* Ignore partial Phaser setup. */ }
    throw error;
  }

  let disposed = false;
  function dispose(fromParentDestroy = false): void {
    if (disposed) return;
    disposed = true;

    actionListeners.forEach((listener) => parent.off?.("destroy", listener));
    parent.off?.("destroy", parentDestroyed);

    if (parallel) disposeParallelFilters(filterList, parallel);
    else if (directBlend) {
      try { filterList.remove(directBlend); } catch {
        try { directBlend.destroy(); } catch { /* Ignore an already released filter. */ }
      }
    }

    // AddEffectShine registers its own DESTROY handler before this preview.
    // That handler releases the tween and DynamicTexture during GameObject.destroy().
    if (!fromParentDestroy) {
      try { createdEffect.tween?.destroy(); } catch { /* Ignore an already stopped tween. */ }
      try { createdEffect.dynamicTexture?.destroy(); } catch { /* Ignore an already released texture. */ }
    }
  }

  const parentDestroyed: DestroyListener = () => dispose(true);
  parent.once?.("destroy", parentDestroyed);
  return { dispose: () => dispose(), diagnostics: [] };
}
export function createFxPreview(
  scene: FxSceneAdapter,
  phaser: FxPhaserAdapter,
  parent: FxDisplayObject,
  effect: FxObject,
  renderOrderOffset = 0,
): FxPreviewResult {
  switch (effect.type) {
    case "Circle":
      return createCirclePreview(scene, phaser, parent, effect, renderOrderOffset);
    case "Bloom":
      return createBloomPreview(phaser, parent, effect);
    case "Gradient":
      return createGradientPreview(scene, parent, effect, renderOrderOffset);
    case "Shine":
      return createShinePreview(phaser, parent, effect);
  }
}
