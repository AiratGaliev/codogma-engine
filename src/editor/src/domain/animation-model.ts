export interface AnimationFrame {
  key: string;
  frame?: string | number;
  duration?: number;
  [key: string]: unknown;
}

export interface PhaserAnimationConfig {
  key: string;
  frameRate?: number;
  repeat?: number;
  delay?: number;
  repeatDelay?: number;
  yoyo?: boolean;
  showBeforeDelay?: boolean;
  showOnStart?: boolean;
  hideOnComplete?: boolean;
  skipMissedFrames?: boolean;
  frames: AnimationFrame[];
  [key: string]: unknown;
}

export interface AnimationDocument {
  anims: PhaserAnimationConfig[];
  globalTimeScale?: number;
  settings?: {
    sourceLang?: string;
    generateCode?: boolean;
    esModule?: boolean;
    outputFolder?: string;
    [key: string]: unknown;
  };
  meta: { app?: string; url?: string; contentType: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface AnimationTimelinePosition {
  frameIndex: number;
  elapsedInFrameMs: number;
  frameDurationMs: number;
  progress: number;
  cycleIndex: number;
  completed: boolean;
  waiting: boolean;
  totalDurationMs: number;
}

const CONTENT_TYPE = "Phaser v3 Animations";
const APP_NAME = "Codogma Engine - Animations Editor";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertDocument(document: unknown): asserts document is AnimationDocument {
  if (!isRecord(document) || !Array.isArray(document.anims)) {
    throw new TypeError('An animation document must contain an "anims" array.');
  }
  const keys = new Set<string>();
  for (const value of document.anims) {
    if (!isRecord(value) || typeof value.key !== "string" || !value.key.trim()) {
      throw new TypeError("Each animation requires a non-empty key.");
    }
    const animation = value as unknown as PhaserAnimationConfig;
    if (keys.has(animation.key)) throw new Error(`Duplicate animation key "${animation.key}".`);
    keys.add(animation.key);
    if (!Array.isArray(animation.frames)) {
      throw new TypeError(`Animation "${animation.key}" must have a frames array.`);
    }
    for (const frame of animation.frames) {
      if (!isRecord(frame) || typeof frame.key !== "string" || !frame.key.trim()) {
        throw new TypeError(`Animation "${animation.key}" contains an invalid frame reference.`);
      }
    }
  }
  if (document.globalTimeScale !== undefined &&
      (typeof document.globalTimeScale !== "number" ||
        !Number.isFinite(document.globalTimeScale) ||
        document.globalTimeScale <= 0)) {
    throw new TypeError("globalTimeScale must be a positive finite number.");
  }
}

function uniqueKey(document: AnimationDocument, preferred: string): string {
  const base = preferred.trim() || "animation";
  const used = new Set(document.anims.map((item) => item.key));
  if (!used.has(base)) return base;
  let suffix = 1;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function createAnimationDocument(): AnimationDocument {
  return {
    anims: [],
    globalTimeScale: 1,
    settings: { sourceLang: "JAVA_SCRIPT", generateCode: false, esModule: false },
    meta: { app: APP_NAME, url: "https://codogma.com", contentType: CONTENT_TYPE },
  };
}

export function parseAnimationContent(content: string): AnimationDocument {
  if (typeof content !== "string" || !content.trim()) {
    throw new TypeError("The animation file is empty.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new SyntaxError(
      `The animation file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertDocument(parsed);
  if (parsed.meta?.contentType !== CONTENT_TYPE) {
    throw new TypeError("The JSON file is not a Phaser v3 Animations document.");
  }
  return parsed;
}

export function isAnimationContent(value: unknown): value is AnimationDocument {
  if (!isRecord(value) || !Array.isArray(value.anims) || !isRecord(value.meta)) return false;
  return value.meta.contentType === CONTENT_TYPE && value.anims.every((animation) =>
    isRecord(animation) &&
    typeof animation.key === "string" &&
    Array.isArray(animation.frames),
  );
}

export function getAnimations(
  document: AnimationDocument,
): Array<{ key: string; index: number; frameCount: number; source: PhaserAnimationConfig }> {
  assertDocument(document);
  return document.anims.map((source, index) => ({
    key: source.key,
    index,
    frameCount: source.frames.length,
    source,
  }));
}

export function createAnimation(
  document: AnimationDocument,
  preferredKey = "animation",
  options: Partial<PhaserAnimationConfig> = {},
): AnimationDocument {
  assertDocument(document);
  const animation: PhaserAnimationConfig = {
    key: uniqueKey(document, preferredKey),
    frameRate: Number.isFinite(options.frameRate) ? options.frameRate as number : 24,
    repeat: Number.isFinite(options.repeat) ? options.repeat as number : -1,
    frames: Array.isArray(options.frames) ? clone(options.frames) : [],
  };
  const next = { ...document, anims: [...document.anims, animation] };
  assertDocument(next);
  return next;
}

export function updateAnimation(
  document: AnimationDocument,
  key: string,
  patch: Partial<PhaserAnimationConfig>,
): AnimationDocument {
  assertDocument(document);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("Animation patch must be an object.");
  }
  const index = document.anims.findIndex((item) => item.key === key);
  if (index < 0) throw new Error(`Animation "${key}" was not found.`);
  const anims = document.anims.slice();
  const current = anims[index];
  if (!current) throw new Error(`Animation "${key}" was not found.`);
  anims[index] = { ...current, ...clone(patch) };
  const next = { ...document, anims };
  assertDocument(next);
  return next;
}

export function removeAnimation(document: AnimationDocument, key: string): AnimationDocument {
  assertDocument(document);
  const anims = document.anims.filter((item) => item.key !== key);
  if (anims.length === document.anims.length) throw new Error(`Animation "${key}" was not found.`);
  return { ...document, anims };
}

export function appendAnimationFrame(
  document: AnimationDocument,
  animationKey: string,
  frame: AnimationFrame,
): AnimationDocument {
  assertDocument(document);
  if (!frame || typeof frame.key !== "string" || !frame.key.trim()) {
    throw new TypeError("A frame requires a non-empty Asset Pack key.");
  }
  const animation = document.anims.find((item) => item.key === animationKey);
  if (!animation) throw new Error(`Animation "${animationKey}" was not found.`);
  return updateAnimation(document, animationKey, { frames: [...animation.frames, clone(frame)] });
}

export function removeAnimationFrame(
  document: AnimationDocument,
  animationKey: string,
  frameIndex: number,
): AnimationDocument {
  assertDocument(document);
  const animation = document.anims.find((item) => item.key === animationKey);
  if (!animation) throw new Error(`Animation "${animationKey}" was not found.`);
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= animation.frames.length) {
    throw new RangeError("Animation frame index is out of range.");
  }
  return updateAnimation(document, animationKey, {
    frames: animation.frames.filter((_, index) => index !== frameIndex),
  });
}

export function moveAnimationFrame(
  document: AnimationDocument,
  animationKey: string,
  fromIndex: number,
  toIndex: number,
): AnimationDocument {
  assertDocument(document);
  const animation = document.anims.find((item) => item.key === animationKey);
  if (!animation) throw new Error(`Animation "${animationKey}" was not found.`);
  if (![fromIndex, toIndex].every(Number.isInteger) ||
      fromIndex < 0 || toIndex < 0 ||
      fromIndex >= animation.frames.length || toIndex >= animation.frames.length) {
    throw new RangeError("Animation frame index is out of range.");
  }
  const frames = animation.frames.slice();
  const [frame] = frames.splice(fromIndex, 1);
  if (!frame) throw new RangeError("Animation frame index is out of range.");
  frames.splice(toIndex, 0, frame);
  return updateAnimation(document, animationKey, { frames });
}

export function updateAnimationSettings(
  document: AnimationDocument,
  patch: Record<string, unknown>,
): AnimationDocument {
  assertDocument(document);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("Animation settings patch must be an object.");
  }
  return { ...document, settings: { ...(document.settings ?? {}), ...clone(patch) } };
}

/**
 * Resolve the effective display duration of one Phaser JSONAnimations frame.
 * Per-frame duration overrides frameRate; globalTimeScale is a speed multiplier.
 */
export function getAnimationFrameDurationMs(
  animation: PhaserAnimationConfig,
  frame: AnimationFrame,
  globalTimeScale = 1,
): number {
  const frameRate = Number.isFinite(animation?.frameRate) && (animation.frameRate as number) > 0
    ? animation.frameRate as number
    : 24;
  const timeScale = Number.isFinite(globalTimeScale) && globalTimeScale > 0
    ? globalTimeScale
    : 1;
  const explicitDuration = Number(frame?.duration);
  const duration = Number.isFinite(explicitDuration) && explicitDuration > 0
    ? explicitDuration
    : 1000 / frameRate;
  return duration / timeScale;
}

/** Total duration of one forward (non-yoyo) pass through a Phaser animation. */
export function getAnimationDurationMs(
  animation: PhaserAnimationConfig,
  globalTimeScale = 1,
): number {
  if (!animation || !Array.isArray(animation.frames)) {
    throw new TypeError("Animation duration requires a Phaser animation with a frames array.");
  }
  return animation.frames.reduce(
    (total, frame) => total + getAnimationFrameDurationMs(animation, frame, globalTimeScale),
    0,
  );
}

/**
 * Resolve the active frame for an elapsed preview time without mutating the
 * Phaser JSONAnimations document. Repeat/yoyo/delay semantics stay in the
 * editor preview layer; only the original clip and frame references are saved.
 */
function getRequiredFrameDuration(durations: readonly number[], index: number): number {
  const duration = durations[index];
  if (duration === undefined) throw new Error(`Animation frame duration ${index} is missing.`);
  return duration;
}

export function getAnimationTimelinePosition(
  animation: PhaserAnimationConfig,
  elapsedMs: number,
  globalTimeScale = 1,
): AnimationTimelinePosition {
  if (!animation || !Array.isArray(animation.frames)) {
    throw new TypeError("Animation timeline requires a Phaser animation with a frames array.");
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("Animation elapsed time must be a non-negative finite number.");
  }

  const frames = animation.frames;
  if (frames.length === 0) {
    return {
      frameIndex: -1, elapsedInFrameMs: 0, frameDurationMs: 0, progress: 0,
      cycleIndex: 0, completed: true, waiting: false, totalDurationMs: 0,
    };
  }

  const timeScale = Number.isFinite(globalTimeScale) && globalTimeScale > 0
    ? globalTimeScale
    : 1;
  const frameDurations = frames.map((frame) =>
    getAnimationFrameDurationMs(animation, frame, timeScale)
  );
  const cycleDurationMs = frameDurations.reduce((sum, value) => sum + value, 0);
  const delayMs = Math.max(0, Number(animation.delay) || 0) / timeScale;
  const repeatDelayMs = Math.max(0, Number(animation.repeatDelay) || 0) / timeScale;
  const repeat = Number.isFinite(animation.repeat) ? Math.trunc(animation.repeat as number) : 0;
  const cycleCount = repeat < 0 ? Infinity : Math.max(1, repeat + 1);
  const totalDurationMs = Number.isFinite(cycleCount)
    ? delayMs + cycleDurationMs * cycleCount + repeatDelayMs * Math.max(0, cycleCount - 1)
    : Infinity;

  if (elapsedMs < delayMs) {
    return {
      frameIndex: 0,
      elapsedInFrameMs: 0,
      frameDurationMs: getRequiredFrameDuration(frameDurations, 0)
      progress: 0,
      cycleIndex: 0,
      completed: false,
      waiting: true,
      totalDurationMs,
    };
  }

  const elapsed = elapsedMs - delayMs;
  if (Number.isFinite(cycleCount) && elapsed >= totalDurationMs - delayMs) {
    const lastCycleIndex = Math.max(0, cycleCount - 1);
    const lastFrameIndex = animation.yoyo && lastCycleIndex % 2 === 1 ? 0 : frames.length - 1;
    return {
      frameIndex: lastFrameIndex,
      elapsedInFrameMs: getRequiredFrameDuration(frameDurations, lastFrameIndex),
      frameDurationMs: getRequiredFrameDuration(frameDurations, lastFrameIndex),
      progress: 1,
      cycleIndex: lastCycleIndex,
      completed: true,
      waiting: false,
      totalDurationMs,
    };
  }

  const cycleSpanMs = cycleDurationMs + repeatDelayMs;
  const cycleIndex = cycleSpanMs > 0 ? Math.floor(elapsed / cycleSpanMs) : 0;
  let cyclePositionMs = cycleSpanMs > 0 ? elapsed - cycleIndex * cycleSpanMs : 0;
  if (cyclePositionMs >= cycleDurationMs) {
    const lastFrameIndex = animation.yoyo && cycleIndex % 2 === 1 ? 0 : frames.length - 1;
    return {
      frameIndex: lastFrameIndex,
      elapsedInFrameMs: getRequiredFrameDuration(frameDurations, lastFrameIndex),
      frameDurationMs: getRequiredFrameDuration(frameDurations, lastFrameIndex),
      progress: 1,
      cycleIndex,
      completed: false,
      waiting: true,
      totalDurationMs,
    };
  }

  const reversed = Boolean(animation.yoyo && cycleIndex % 2 === 1);
  let frameIndex = 0;
  let elapsedInFrameMs = 0;
  for (let index = 0; index < frames.length; index++) {
    const duration = getRequiredFrameDuration(frameDurations, index);
    if (cyclePositionMs < duration) {
      frameIndex = reversed ? frames.length - 1 - index : index;
      elapsedInFrameMs = cyclePositionMs;
      break;
    }
    cyclePositionMs -= duration;
  }

  const frameDurationMs = getRequiredFrameDuration(frameDurations, frameIndex);
  return {
    frameIndex,
    elapsedInFrameMs,
    frameDurationMs,
    progress: Math.min(1, Math.max(0, elapsedInFrameMs / frameDurationMs)),
    cycleIndex,
    completed: false,
    waiting: false,
    totalDurationMs,
  };
}

export function formatAnimationContent(document: AnimationDocument): string {
  assertDocument(document);
  const normalized = clone(document);
  normalized.meta = {
    ...(normalized.meta ?? {}),
    app: normalized.meta?.app ?? APP_NAME,
    contentType: CONTENT_TYPE,
  };
  normalized.settings ??= { sourceLang: "JAVA_SCRIPT", generateCode: false, esModule: false };
  return `${JSON.stringify(normalized, null, 4)}\n`;
}
