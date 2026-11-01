const CONTENT_TYPE = "Phaser v3 Animations";
const APP_NAME = "Codogma Engine - Animations Editor";
const clone = (value) => JSON.parse(JSON.stringify(value));

function assertDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document) || !Array.isArray(document.anims)) {
    throw new TypeError('An animation document must contain an "anims" array.');
  }
  const keys = new Set();
  for (const animation of document.anims) {
    if (!animation || typeof animation !== "object" || typeof animation.key !== "string" || !animation.key.trim()) {
      throw new TypeError("Each animation requires a non-empty key.");
    }
    if (keys.has(animation.key)) throw new Error(`Duplicate animation key "${animation.key}".`);
    keys.add(animation.key);
    if (!Array.isArray(animation.frames)) throw new TypeError(`Animation "${animation.key}" must have a frames array.`);
    for (const frame of animation.frames) {
      if (!frame || typeof frame !== "object" || typeof frame.key !== "string" || !frame.key.trim()) {
        throw new TypeError(`Animation "${animation.key}" contains an invalid frame reference.`);
      }
    }
  }
  if (document.globalTimeScale !== undefined &&
      (typeof document.globalTimeScale !== "number" || !Number.isFinite(document.globalTimeScale) || document.globalTimeScale <= 0)) {
    throw new TypeError("globalTimeScale must be a positive finite number.");
  }
}

function uniqueKey(document, preferred) {
  const base = preferred.trim() || "animation";
  const used = new Set(document.anims.map((item) => item.key));
  if (!used.has(base)) return base;
  let suffix = 1;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function createAnimationDocument() {
  return {
    anims: [],
    globalTimeScale: 1,
    settings: { sourceLang: "JAVA_SCRIPT", generateCode: false, esModule: false },
    meta: { app: APP_NAME, url: "https://codogma.com", contentType: CONTENT_TYPE },
  };
}

export function parseAnimationContent(content) {
  if (typeof content !== "string" || !content.trim()) throw new TypeError("The animation file is empty.");
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (error) { throw new SyntaxError(`The animation file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  assertDocument(parsed);
  if (parsed.meta?.contentType !== CONTENT_TYPE) throw new TypeError("The JSON file is not a Phaser v3 Animations document.");
  return parsed;
}

export function isAnimationContent(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Array.isArray(value.anims) && value.meta?.contentType === CONTENT_TYPE);
}

export function getAnimations(document) {
  assertDocument(document);
  return document.anims.map((source, index) => ({ key: source.key, index, frameCount: source.frames.length, source }));
}

export function createAnimation(document, preferredKey = "animation", options = {}) {
  assertDocument(document);
  const animation = {
    key: uniqueKey(document, preferredKey),
    frameRate: Number.isFinite(options.frameRate) ? options.frameRate : 24,
    repeat: Number.isFinite(options.repeat) ? options.repeat : -1,
    frames: Array.isArray(options.frames) ? clone(options.frames) : [],
  };
  const next = { ...document, anims: [...document.anims, animation] };
  assertDocument(next);
  return next;
}

export function updateAnimation(document, key, patch) {
  assertDocument(document);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("Animation patch must be an object.");
  const index = document.anims.findIndex((item) => item.key === key);
  if (index < 0) throw new Error(`Animation "${key}" was not found.`);
  const anims = document.anims.slice();
  anims[index] = { ...anims[index], ...clone(patch) };
  const next = { ...document, anims };
  assertDocument(next);
  return next;
}

export function removeAnimation(document, key) {
  assertDocument(document);
  const anims = document.anims.filter((item) => item.key !== key);
  if (anims.length === document.anims.length) throw new Error(`Animation "${key}" was not found.`);
  return { ...document, anims };
}

export function appendAnimationFrame(document, animationKey, frame) {
  assertDocument(document);
  if (!frame || typeof frame.key !== "string" || !frame.key.trim()) throw new TypeError("A frame requires a non-empty Asset Pack key.");
  const animation = document.anims.find((item) => item.key === animationKey);
  if (!animation) throw new Error(`Animation "${animationKey}" was not found.`);
  return updateAnimation(document, animationKey, { frames: [...animation.frames, clone(frame)] });
}

export function removeAnimationFrame(document, animationKey, frameIndex) {
  assertDocument(document);
  const animation = document.anims.find((item) => item.key === animationKey);
  if (!animation) throw new Error(`Animation "${animationKey}" was not found.`);
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= animation.frames.length) throw new RangeError("Animation frame index is out of range.");
  return updateAnimation(document, animationKey, { frames: animation.frames.filter((_, index) => index !== frameIndex) });
}

export function moveAnimationFrame(document, animationKey, fromIndex, toIndex) {
  assertDocument(document);
  const animation = document.anims.find((item) => item.key === animationKey);
  if (!animation) throw new Error(`Animation "${animationKey}" was not found.`);
  if (![fromIndex, toIndex].every(Number.isInteger) ||
      fromIndex < 0 || toIndex < 0 || fromIndex >= animation.frames.length || toIndex >= animation.frames.length) {
    throw new RangeError("Animation frame index is out of range.");
  }
  const frames = animation.frames.slice();
  const [frame] = frames.splice(fromIndex, 1);
  frames.splice(toIndex, 0, frame);
  return updateAnimation(document, animationKey, { frames });
}

export function updateAnimationSettings(document, patch) {
  assertDocument(document);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("Animation settings patch must be an object.");
  return { ...document, settings: { ...(document.settings ?? {}), ...clone(patch) } };
}

export function formatAnimationContent(document) {
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
