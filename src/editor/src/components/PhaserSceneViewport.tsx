import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  onMount,
} from "solid-js";
import {
  getSceneObjects,
  type SceneDocument,
} from "../domain/scene-model.ts";
import {
  readProjectFile,
  type ProjectEntry,
} from "../services/editor-api";
import { getSceneObjectEffects, type FxObject } from "../domain/fx-model.ts";
import type { SceneObject } from "../domain/scene-model.ts";
import {
  createFxPreview,
  type FxDisplayObject,
  type FxPhaserAdapter,
  type FxPreviewResult,
  type FxSceneAdapter,
} from "./fx-preview.ts";

interface PhaserGameObject {
  x: number;
  y: number;
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
  setOrigin?(x: number, y: number): PhaserGameObject;
  setPosition?(x: number, y: number): PhaserGameObject;
  setScale?(x: number, y?: number): PhaserGameObject;
  setRotation?(radians: number): PhaserGameObject;
  setAlpha?(alpha: number): PhaserGameObject;
  setInteractive?(): PhaserGameObject;
  disableInteractive?(): PhaserGameObject;
  setVisible?(visible: boolean): PhaserGameObject;
  on?(event: string, callback: (pointer?: PhaserPointer) => void): PhaserGameObject;
  setText?(text: string): PhaserGameObject;
  setSize?(width: number, height: number): PhaserGameObject;
  setFillStyle?(color: number, alpha?: number): PhaserGameObject;
  setStrokeStyle?(width: number, color: number, alpha?: number): PhaserGameObject;
  setDepth?(depth: number): PhaserGameObject;
  destroy?(): void;
  add?(child: PhaserGameObject): PhaserGameObject;
  once?(event: string, listener: (...args: unknown[]) => void): PhaserGameObject;
  off?(event: string, listener?: (...args: unknown[]) => void): PhaserGameObject;
  listeners?(event: string): Array<(...args: unknown[]) => void>;
  filters?: { internal: { remove(filter: unknown): void } };
  parentContainer?: {
    add(child: PhaserGameObject): PhaserGameObject;
    addAt(child: PhaserGameObject, index: number): unknown;
    getIndex(child: PhaserGameObject): number;
  } | null;
}

interface PhaserPointer {
  worldX?: number;
  worldY?: number;
  isDown?: boolean;
}

interface PhaserSceneApi {
  input: {
    on(event: string, listener: (pointer: PhaserPointer) => void): void;
  };
  events: {
    on(event: "update", listener: () => void): void;
    once(event: "shutdown", listener: () => void): void;
    off(event: "update", listener: () => void): void;
  };
  cameras?: {
    main?: {
      setBackgroundColor(color: string): void;
    };
  };
  load: {
    image(key: string, url: string): void;
  };
  add: {
    image(x: number, y: number, key: string): PhaserGameObject;
    text(
      x: number,
      y: number,
      content: string,
      style: Record<string, unknown>,
    ): PhaserGameObject;
    rectangle(
      x: number,
      y: number,
      width: number,
      height: number,
      color?: number,
      alpha?: number,
    ): PhaserGameObject;
    container(x: number, y: number): PhaserGameObject;
    graphics(): PhaserGameObject;
    existing(object: PhaserGameObject): PhaserGameObject;
    gradient(config: Record<string, unknown>, x: number, y: number, width: number, height: number): PhaserGameObject;
  };
}

interface PhaserSceneConstructor {
  new (config?: string | { key: string }): PhaserSceneApi;
}

interface PhaserGameApi {
  canvas?: HTMLCanvasElement;
  renderer?: { constructor?: { name?: string } } | null;
  config?: { renderType?: number; parent?: unknown; customEnvironment?: boolean };
  events: {
    once(event: string, listener: () => void): void;
  };
  destroy(removeCanvas?: boolean): void;
  pause(): void;
  resume(): void;
  scale: {
    refresh?(): void;
  };
}

interface PhaserNamespace {
  AUTO: number;
  Scale: {
    FIT: number;
    CENTER_BOTH: number;
  };
  Game: new (config: {
    type: number;
    width: number;
    height: number;
    parent: HTMLElement;
    backgroundColor: string;
    scene: PhaserSceneConstructor[];
    scale: {
      mode: number;
      autoCenter: number;
      width: number;
      height: number;
    };
  }) => PhaserGameApi;
  Scene: PhaserSceneConstructor;
  Actions: {
    AddMaskShape(parent: PhaserGameObject, config: Record<string, unknown>): unknown[];
    AddEffectBloom(parent: PhaserGameObject, config: Record<string, unknown>): Array<{ parallelFilters?: { destroy(): void } }>;
    AddEffectShine(parent: PhaserGameObject, config: Record<string, unknown>): Array<{
      parallelFilters?: { destroy(): void };
      blendFilter?: { destroy(): void };
      tween?: { destroy(): void };
      dynamicTexture?: { destroy(): void };
    }>;
  };
  Geom: {
    Rectangle: new (x: number, y: number, width: number, height: number) => unknown;
  };
}

declare global {
  interface Window {
    Phaser?: PhaserNamespace;
  }
}

interface ImageAsset {
  key: string;
  path: string;
}

type TransformTool = "select" | "move" | "rotate" | "scale";

interface Props {
  scene: SceneDocument | null;
  scenePath: string | null;
  selectedId: string | null;
  projectTree: ProjectEntry | null;
  theme: "dark" | "light";
  active: boolean;
  tool: () => TransformTool;
  hiddenIds: () => ReadonlySet<string>;
  lockedIds: () => ReadonlySet<string>;
  onSelect: (id: string) => void;
  onTransform: (id: string, patch: Record<string, number>) => void;
  onStatus: (level: "info" | "success" | "warning" | "error", message: string) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

interface SceneEntry {
  id: string;
  type: string;
  parentId: string | null;
  source: Record<string, unknown>;
}

const RUNTIME_WIDTH = 800;
const RUNTIME_HEIGHT = 600;
const phaserLoads = new Map<string, Promise<PhaserNamespace>>();

function encodeProjectPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeProjectPath(value: string): string | null {
  const path = (value.split(/[?#]/, 1)[0] ?? "").replace(/\\/g, "/").trim();
  if (
    !path ||
    path.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(path) ||
    /^[a-z]:/i.test(path)
  ) {
    return null;
  }

  const normalized = path.replace(/^\.\//, "").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) return null;
  return normalized;
}

function flattenFiles(
  root: ProjectEntry | null,
  prefix = "",
): Array<{ path: string; entry: ProjectEntry }> {
  const result: Array<{ path: string; entry: ProjectEntry }> = [];
  for (const child of root?.children ?? []) {
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    result.push({ path, entry: child });
    if (!child.isFile) result.push(...flattenFiles(child, path));
  }
  return result;
}

async function discoverPhaserScript(root: ProjectEntry | null): Promise<string> {
  try {
    const html = await readProjectFile("index.html");
    const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
      .map((match) => match[1])
      .filter((source): source is string => Boolean(source));
    const source = scriptSources.find((candidate) => /phaser[^/]*\.m?js(?:[?#]|$)/i.test(candidate));
    if (source) {
      const path = normalizeProjectPath(source);
      if (path) return path;
    }
  } catch {
    // The explicit project file inventory below remains the fallback.
  }

  const files = flattenFiles(root);
  const candidate = files.find(({ path }) => /(^|\/)phaser(?:\.min)?\.js$/i.test(path));
  if (!candidate) {
    throw new Error("Could not find a local Phaser runtime. Add a local phaser*.js script to the project index.html.");
  }
  return candidate.path;
}

function collectImageAssets(value: unknown, result: ImageAsset[], depth = 0): void {
  if (depth > 12 || value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) collectImageAssets(item, result, depth + 1);
    return;
  }

  const record = value as Record<string, unknown>;
  if (
    record.type === "image" &&
    typeof record.key === "string" &&
    typeof record.url === "string"
  ) {
    const path = normalizeProjectPath(record.url);
    if (path) result.push({ key: record.key, path });
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      collectImageAssets(nested, result, depth + 1);
    }
  }
}

async function discoverImageAssets(root: ProjectEntry | null): Promise<ImageAsset[]> {
  const packFiles = flattenFiles(root).filter(({ path }) =>
    /(^|\/)asset-pack\.json$/i.test(path),
  );
  const assets = new Map<string, string>();

  for (const pack of packFiles) {
    try {
      const content = await readProjectFile(pack.path);
      const parsed: unknown = JSON.parse(content);
      const found: ImageAsset[] = [];
      collectImageAssets(parsed, found);
      for (const item of found) assets.set(item.key, item.path);
    } catch {
      // A malformed optional pack should not prevent the remaining packs loading.
    }
  }

  return [...assets].map(([key, path]) => ({ key, path }));
}

async function loadPhaserRuntime(path: string): Promise<PhaserNamespace> {
  if (window.Phaser) return window.Phaser;
  const cached = phaserLoads.get(path);
  if (cached) return cached;

  const promise = new Promise<PhaserNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.dataset.codogmaPhaser = path;
    script.src = `/editor/project/${encodeProjectPath(path)}`;
    script.onload = () => {
      if (window.Phaser) resolve(window.Phaser);
      else reject(new Error("The Phaser script loaded but did not expose window.Phaser."));
    };
    script.onerror = () => reject(new Error(`Failed to load Phaser runtime from "${path}".`));
    document.head.append(script);
  });

  phaserLoads.set(path, promise);
  try {
    return await promise;
  } catch (error) {
    phaserLoads.delete(path);
    throw error;
  }
}

function numeric(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function PhaserSceneViewport(props: Props) {
  let mount: HTMLDivElement | undefined;
  let game: PhaserGameApi | undefined;
  let sceneRuntime: PhaserSceneApi | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let sceneReady = false;
  let selectionFrame: PhaserGameObject | undefined;
  let activeScenePath: string | null | undefined;
  let activeProjectTree: ProjectEntry | null | undefined;
  let phaserApi: PhaserNamespace | undefined;
  let webGlRenderer = false;
  let canvasFxWarningShown = false;
  const gameObjects = new Map<string, PhaserGameObject>();
  const fxPreviewResources = new Map<string, { fingerprint: string; result: FxPreviewResult }>();
  const failedFxPreviews = new Map<string, string>();
  const [runtimeState, setRuntimeState] = createSignal<"loading" | "ready" | "error">("loading");
  const [runtimeError, setRuntimeError] = createSignal("");
  const [gameReady, setGameReady] = createSignal(false);

  let transformDrag: {
    id: string;
    tool: Exclude<TransformTool, "select">;
    object: PhaserGameObject;
    pointerStartX: number;
    pointerStartY: number;
    objectStartX: number;
    objectStartY: number;
    rotationStart: number;
    scaleXStart: number;
    scaleYStart: number;
    patch: Record<string, number>;
  } | undefined;

  function finishTransformDrag() {
    const drag = transformDrag;
    transformDrag = undefined;
    if (drag && Object.keys(drag.patch).length > 0) props.onTransform(drag.id, drag.patch);
  }

  function createEntry(
    entry: SceneEntry,
    runtime: PhaserSceneApi,
    imageKeys: Set<string>,
  ): PhaserGameObject {
    const x = numeric(entry.source.x, RUNTIME_WIDTH / 2);
    const y = numeric(entry.source.y, RUNTIME_HEIGHT / 2);

    if (entry.type === "Container") return runtime.add.container(x, y);

    if (entry.type === "Image") {
      const texture = entry.source.texture;
      const key =
        texture && typeof texture === "object"
          ? String((texture as Record<string, unknown>).key ?? "")
          : "";
      if (key && imageKeys.has(key)) return runtime.add.image(x, y, key);
      props.onStatus("warning", `Texture "${key || "(empty)"}" was not found in the project's Asset Packs.`);
    }

    if (entry.type === "Text") {
      return runtime.add.text(
        x,
        y,
        String(entry.source.text ?? entry.source.label ?? ""),
        {
          fontFamily: String(entry.source.fontFamily ?? "Arial"),
          fontSize: String(entry.source.fontSize ?? "16px"),
          color: String(entry.source.color ?? "#E7EBF2"),
          align: String(entry.source.align ?? "left"),
          wordWrap: entry.source.wordWrapWidth
            ? { width: numeric(entry.source.wordWrapWidth, 320) }
            : undefined,
        },
      );
    }

    const placeholder = runtime.add.rectangle(x, y, 38, 28, 0x34375e, 0.9);
    placeholder.setStrokeStyle?.(1, 0x9298ff, 0.85);
    return placeholder;
  }

  function clearFxPreviews(): void {
    for (const resource of fxPreviewResources.values()) resource.result.dispose();
    fxPreviewResources.clear();
    failedFxPreviews.clear();
  }

  function syncFxPreviews(entries: SceneEntry[]): void {
    if (!sceneRuntime || !phaserApi) return;
    const desired = new Map<string, { parentId: string; effect: FxObject; fingerprint: string; renderOrderOffset: number }>();

    for (const entry of entries) {
      if (!gameObjects.has(entry.id)) continue;
      let renderOrderOffset = 0;
      for (const effect of getSceneObjectEffects(entry.source as SceneObject)) {
        const key = `${entry.id}:${effect.id}`;
        desired.set(key, {
          parentId: entry.id,
          effect: effect.source,
          fingerprint: JSON.stringify(effect.source),
          renderOrderOffset,
        });
        if (effect.source.type === "Circle" || effect.source.type === "Gradient") {
          renderOrderOffset += 1;
        }
      }
    }

    for (const [key, resource] of fxPreviewResources) {
      const next = desired.get(key);
      if (!next || next.fingerprint !== resource.fingerprint) {
        resource.result.dispose();
        fxPreviewResources.delete(key);
      }
    }
    for (const [key, fingerprint] of failedFxPreviews) {
      if (desired.get(key)?.fingerprint !== fingerprint) failedFxPreviews.delete(key);
    }

    if (desired.size === 0) {
      canvasFxWarningShown = false;
      return;
    }
    if (!webGlRenderer) {
      if (!canvasFxWarningShown) {
        props.onStatus("warning", "FX settings are saved, but Scene View preview requires WebGL. Canvas renderer does not support Phaser FX filters.");
        canvasFxWarningShown = true;
      }
      return;
    }
    canvasFxWarningShown = false;

    for (const [key, item] of desired) {
      if (fxPreviewResources.has(key) || failedFxPreviews.get(key) === item.fingerprint) continue;
      const parent = gameObjects.get(item.parentId);
      if (!parent) continue;
      try {
        const result = createFxPreview(
          sceneRuntime as unknown as FxSceneAdapter,
          phaserApi as unknown as FxPhaserAdapter,
          parent as unknown as FxDisplayObject,
          item.effect,
          item.renderOrderOffset,
        );
        fxPreviewResources.set(key, { fingerprint: item.fingerprint, result });
        for (const diagnostic of result.diagnostics) props.onStatus("warning", diagnostic);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedFxPreviews.set(key, item.fingerprint);
        props.onStatus("warning", `FX preview "${item.effect.type}" is unavailable: ${message}`);
      }
    }
  }

  function syncScene() {
    if (!sceneReady || !sceneRuntime) return;

    if (activeScenePath !== props.scenePath || activeProjectTree !== props.projectTree) {
      clearFxPreviews();
      for (const object of [...gameObjects.values()].reverse()) object.destroy?.();
      gameObjects.clear();
      selectionFrame?.destroy?.();
      selectionFrame = sceneRuntime.add.rectangle(0, 0, 1, 1, 0x000000, 0);
      selectionFrame.setStrokeStyle?.(1, 0x9298ff, 1);
      selectionFrame.setDepth?.(1000);
      selectionFrame.setAlpha?.(0);
      activeScenePath = props.scenePath;
      activeProjectTree = props.projectTree;
    }

    const current = props.scene;
    const entries = current
      ? getSceneObjects(current).map((entry) => ({
          id: entry.id,
          type: entry.type,
          parentId: entry.parentId,
          source: entry.source as Record<string, unknown>,
        }))
      : [];
    const activeIds = new Set(entries.map((entry) => entry.id));
    const assets = (sceneRuntime as PhaserSceneApi & { __imageKeys?: Set<string> }).__imageKeys ?? new Set<string>();

    for (const entry of entries) {
      let object = gameObjects.get(entry.id);
      if (!object) {
        const createdObject = createEntry(entry, sceneRuntime, assets);
        const parentObject = entry.parentId ? gameObjects.get(entry.parentId) : undefined;
        if (parentObject?.add) parentObject.add(createdObject);
        object = createdObject;
        createdObject.setInteractive?.();
        createdObject.on?.("pointerdown", (pointer) => {
          if (props.hiddenIds().has(entry.id) || props.lockedIds().has(entry.id)) return;
          props.onSelect(entry.id);
          const activeTool = props.tool();
          if (activeTool === "select" || !pointer) {
            transformDrag = undefined;
            return;
          }

          const liveSource = props.scene
            ? getSceneObjects(props.scene).find((candidate) => candidate.id === entry.id)?.source as Record<string, unknown> | undefined
            : undefined;
          transformDrag = {
            id: entry.id,
            tool: activeTool,
            object: createdObject,
            pointerStartX: numeric(pointer.worldX, createdObject.x),
            pointerStartY: numeric(pointer.worldY, createdObject.y),
            objectStartX: createdObject.x,
            objectStartY: createdObject.y,
            rotationStart: numeric(liveSource?.rotation, 0) * (Math.PI / 180),
            scaleXStart: numeric(liveSource?.scaleX, 1),
            scaleYStart: numeric(liveSource?.scaleY, 1),
            patch: {},
          };
        });
        gameObjects.set(entry.id, createdObject);
      }

      const x = numeric(entry.source.x, RUNTIME_WIDTH / 2);
      const y = numeric(entry.source.y, RUNTIME_HEIGHT / 2);
      object.setPosition?.(x, y);
      object.setOrigin?.(
        numeric(entry.source.originX, 0.5),
        numeric(entry.source.originY, 0.5),
      );
      object.setScale?.(
        numeric(entry.source.scaleX, 1),
        numeric(entry.source.scaleY, 1),
      );
      object.setRotation?.(numeric(entry.source.rotation, 0) * (Math.PI / 180));
      object.setAlpha?.(numeric(entry.source.alpha, 1));
      object.setDepth?.(numeric(entry.source.depth, 0));
      const isHidden = props.hiddenIds().has(entry.id);
      const isLocked = props.lockedIds().has(entry.id);
      object.setVisible?.(!isHidden);
      if (isHidden || isLocked) object.disableInteractive?.();
      else object.setInteractive?.();
      if (entry.type === "Text") {
        object.setText?.(String(entry.source.text ?? entry.source.label ?? ""));
      }
    }

    syncFxPreviews(entries);

    for (const [id, object] of gameObjects) {
      if (!activeIds.has(id)) {
        object.destroy?.();
        gameObjects.delete(id);
      }
    }

    const selected = props.selectedId && !props.hiddenIds().has(props.selectedId)
      ? gameObjects.get(props.selectedId)
      : undefined;
    if (selected && selectionFrame) {
      const container = selected.parentContainer;
      if (container) {
        if (selectionFrame.parentContainer !== container) container.add(selectionFrame);
        const selectedIndex = container.getIndex(selected);
        container.addAt(selectionFrame, Math.max(0, selectedIndex + 1));
      } else if (selectionFrame.parentContainer) {
        sceneRuntime?.add.existing(selectionFrame);
      }

      const width = Math.max(12, numeric(selected.displayWidth, numeric(selected.width, 38)));
      const height = Math.max(12, numeric(selected.displayHeight, numeric(selected.height, 28)));
      selectionFrame.setPosition?.(selected.x, selected.y);
      selectionFrame.setRotation?.(numeric(selected.rotation, 0));
      selectionFrame.setSize?.(width + 10, height + 10);
      selectionFrame.setFillStyle?.(0x000000, 0);
      selectionFrame.setStrokeStyle?.(1, 0x9298ff, 1);
      selectionFrame.setAlpha?.(1);
    } else {
      selectionFrame?.setAlpha?.(0);
    }
  }

  createEffect(() => {
    props.scene;
    props.selectedId;
    props.hiddenIds();
    props.lockedIds();
    if (sceneReady) syncScene();
  });

  createEffect(() => {
    const background = props.theme === "dark" ? "#202a37" : "#f2f5f9";
    sceneRuntime?.cameras?.main?.setBackgroundColor(background);
  });

  createEffect(() => {
    const ready = gameReady();
    const active = props.active;
    const instance = game;
    if (!ready || !instance) return;

    if (active) {
      instance.resume();
      instance.scale.refresh?.();
    } else {
      instance.pause();
    }
  });

  onMount(() => {
    let disposed = false;

    void (async () => {
      try {
        const runtimePath = await discoverPhaserScript(props.projectTree);
        const [phaser, imageAssets] = await Promise.all([
          loadPhaserRuntime(runtimePath),
          discoverImageAssets(props.projectTree),
        ]);
        if (disposed || !mount) return;

        const ImageScene = class extends phaser.Scene {
          constructor() {
            super({ key: "CodogmaScenePreview" });
          }

          preload() {
            for (const asset of imageAssets) {
              this.load.image(asset.key, `/editor/project/${encodeProjectPath(asset.path)}`);
            }
          }

          create() {
            sceneRuntime = this;
            this.events.once("shutdown", () => {
              clearFxPreviews();
              gameObjects.clear();
              failedFxPreviews.clear();
              selectionFrame = undefined;
              sceneRuntime = undefined;
              activeScenePath = undefined;
              activeProjectTree = undefined;
              sceneReady = false;
            });
            this.cameras?.main?.setBackgroundColor(props.theme === "dark" ? "#202a37" : "#f2f5f9");
            this.input.on("pointermove", (pointer) => {
              const drag = transformDrag;
              if (!drag || pointer.isDown !== true) return;
              const pointerX = numeric(pointer.worldX, drag.pointerStartX);
              const pointerY = numeric(pointer.worldY, drag.pointerStartY);
              const deltaX = pointerX - drag.pointerStartX;
              const deltaY = pointerY - drag.pointerStartY;

              if (drag.tool === "move") {
                const x = drag.objectStartX + deltaX;
                const y = drag.objectStartY + deltaY;
                drag.object.setPosition?.(x, y);
                drag.patch = { x, y };
              } else if (drag.tool === "rotate") {
                const rotation = drag.rotationStart + deltaX * 0.01;
                drag.object.setRotation?.(rotation);
                drag.patch = { rotation: rotation * (180 / Math.PI) };
              } else {
                const factor = Math.max(0.01, 1 + deltaX / 100);
                const scaleX = drag.scaleXStart * factor;
                const scaleY = drag.scaleYStart * factor;
                drag.object.setScale?.(scaleX, scaleY);
                drag.patch = { scaleX, scaleY };
              }
            });
            this.input.on("pointerup", () => finishTransformDrag());
            this.input.on("pointerupoutside", () => finishTransformDrag());
            (this as PhaserSceneApi & { __imageKeys?: Set<string> }).__imageKeys =
              new Set(imageAssets.map((asset) => asset.key));
            selectionFrame = this.add.rectangle(0, 0, 1, 1, 0x000000, 0);
            selectionFrame.setStrokeStyle?.(1, 0x9298ff, 1);
            selectionFrame?.setDepth?.(1000);
            selectionFrame?.setAlpha?.(0);
            const sceneGame = (this as unknown as { sys?: { game?: PhaserGameApi } }).sys?.game;
            const activeGame = sceneGame ?? game;
            const canvas = activeGame?.canvas;
            const rendererName = activeGame?.renderer?.constructor?.name ?? "none";
            webGlRenderer = /webgl/i.test(rendererName);
            phaserApi = phaser;
            const renderType = activeGame?.config?.renderType ?? "unknown";
            if (canvas && mount && canvas.parentElement !== mount) {
              mount.append(canvas);
            }
            const canvasMounted = Boolean(canvas && mount?.contains(canvas));
            if (!canvasMounted) {
              throw new Error(
                `Phaser ${rendererName} renderer did not attach its canvas to the Scene viewport (renderType=${renderType}, parent=${activeGame?.config?.parent === mount}).`,
              );
            }
            sceneReady = true;
            setRuntimeState("ready");
            setGameReady(true);
            props.onCanvasReady?.(canvas ?? null);
            syncScene();
            props.onStatus("success", `Phaser Scene View ready · ${rendererName} · ${runtimePath}`);
          }
        };

        game = new phaser.Game({
          type: phaser.AUTO,
          width: RUNTIME_WIDTH,
          height: RUNTIME_HEIGHT,
          parent: mount,
          backgroundColor: props.theme === "dark" ? "#202a37" : "#f2f5f9",
          scene: [ImageScene],
          scale: {
            mode: phaser.Scale.FIT,
            autoCenter: phaser.Scale.CENTER_BOTH,
            width: RUNTIME_WIDTH,
            height: RUNTIME_HEIGHT,
          },
        });

        resizeObserver = new ResizeObserver(() => {
          // Scale.FIT preserves the logical 800×600 world and recalculates the display fit.
          game?.scale.refresh?.();
        });
        resizeObserver.observe(mount);
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        setRuntimeError(message);
        setRuntimeState("error");
        props.onStatus("error", `Phaser Scene View unavailable: ${message}`);
      }
    })();

    onCleanup(() => {
      disposed = true;
      resizeObserver?.disconnect();
      clearFxPreviews();
      game?.destroy(true);
      props.onCanvasReady?.(null);
      transformDrag = undefined;
      game = undefined;
      setGameReady(false);
      sceneRuntime = undefined;
      phaserApi = undefined;
      webGlRenderer = false;
      sceneReady = false;
      selectionFrame = undefined;
      gameObjects.clear();
    });
  });

  return (
    <div class="scene-viewport" data-testid="scene-viewport">
      <div class="scene-stage phaser-scene-stage" data-testid="scene-stage" ref={(element) => { mount = element; }} />
      <Show when={runtimeState() !== "ready"}>
        <div class="phaser-runtime-state" role={runtimeState() === "error" ? "alert" : "status"}>
          <Show when={runtimeState() === "loading"}>
            <span class="runtime-loading-indicator" />
            Loading the project's Phaser runtime…
          </Show>
          <Show when={runtimeState() === "error"}>
            <strong>Scene View could not start</strong>
            <span>{runtimeError()}</span>
          </Show>
        </div>
      </Show>
      <div class="viewport-coordinate">World space · {RUNTIME_WIDTH} × {RUNTIME_HEIGHT}</div>
    </div>
  );
}

export default PhaserSceneViewport;
