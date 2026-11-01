export interface SpriteAssetRect { x: number; y: number; width: number; height: number; }
export interface SpriteAssetSize { width: number; height: number; }
export interface SpriteAssetFrameDescriptor {
  key: string;
  sourceRect: SpriteAssetRect;
  sourceSize: SpriteAssetSize;
  trimRect: SpriteAssetRect;
}
export interface SpriteAssetSourceInfo { size: number; modifiedAt: number; }

export interface SpriteFrameMetadata extends Record<string, unknown> {
  id?: string;
  sourceRect?: SpriteAssetRect;
  sourceSize?: SpriteAssetSize;
  trimRect?: SpriteAssetRect;
  pivot?: { x: number; y: number };
  trim?: SpriteAssetRect;
  crop?: SpriteAssetRect;
  collisionShapes?: unknown[];
}

export interface SpriteAssetArchivedFrame extends SpriteFrameMetadata { frameKey: string; }
export interface SpriteAssetConflict extends Record<string, unknown> {
  id: string;
  type: "frame-geometry-changed" | "frame-removed";
  frameKey: string;
  message: string;
}

export interface SpriteAssetMetadata extends Record<string, unknown> {
  schemaVersion: number;
  assetId: string;
  source: { url: string; size: number | null; modifiedAt: number | null; signature: string } | null;
  importSettingsFingerprint: string;
  frames: Record<string, SpriteFrameMetadata>;
  orphanedFrames: SpriteAssetArchivedFrame[];
  conflicts: SpriteAssetConflict[];
}

export interface SpriteAssetPackEntry extends Record<string, unknown> {
  type: "image" | "spritesheet";
  key: string;
  url: string;
  frameConfig?: Record<string, unknown>;
  codogma?: SpriteAssetMetadata;
}

export interface SpriteAssetPackDocument extends Record<string, unknown> {
  meta: Record<string, unknown>;
}

export interface SpriteAssetEntryLocation {
  sectionKey: string;
  index: number;
  entry: SpriteAssetPackEntry;
}

const DATA_KEY = "codogma";
const SCHEMA_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeFramesMap(value: unknown): Record<string, SpriteFrameMetadata> {
  const frames: Record<string, SpriteFrameMetadata> = Object.create(null) as Record<string, SpriteFrameMetadata>;
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      const frame = value[key];
      frames[key] = clone(frame) as SpriteFrameMetadata;
    }
  }
  return frames;
}

function fullRect(width: number, height: number): SpriteAssetRect {
  return { x: 0, y: 0, width, height };
}

export function isAssetPackContent(value: unknown): value is SpriteAssetPackDocument {
  if (!isRecord(value) || !isRecord(value.meta)) return false;
  if (value.meta.contentType !== "phasereditor2d.pack.core.AssetContentType") return false;
  return Object.entries(value).some(([key, section]) =>
    key !== "meta" && isRecord(section) && Array.isArray(section.files),
  );
}

export function parseAssetPackContent(content: string): SpriteAssetPackDocument {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new TypeError("The Asset Pack file is empty.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new SyntaxError(
      `The Asset Pack file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isAssetPackContent(parsed)) {
    throw new TypeError("The JSON file is not a supported Phaser Editor Asset Pack.");
  }
  return parsed;
}

export function formatAssetPackContent(document: SpriteAssetPackDocument): string {
  if (!isAssetPackContent(document)) {
    throw new TypeError("Cannot serialize an invalid Phaser Editor Asset Pack.");
  }
  return `${JSON.stringify(document, null, 4)}\n`;
}

export function getSpriteAssetEntries(document: SpriteAssetPackDocument): SpriteAssetEntryLocation[] {
  if (!isAssetPackContent(document)) return [];
  const entries: SpriteAssetEntryLocation[] = [];
  for (const [sectionKey, section] of Object.entries(document)) {
    if (sectionKey === "meta" || !isRecord(section) || !Array.isArray(section.files)) continue;
    section.files.forEach((value, index) => {
      if (!isRecord(value)) return;
      if (value.type !== "image" && value.type !== "spritesheet") return;
      if (typeof value.key !== "string" || !value.key.trim()) return;
      entries.push({ sectionKey, index, entry: value as unknown as SpriteAssetPackEntry });
    });
  }
  return entries;
}

export function findSpriteAssetEntry(
  document: SpriteAssetPackDocument,
  assetKey: string,
): SpriteAssetEntryLocation | null {
  return getSpriteAssetEntries(document).find((item) => item.entry.key === assetKey) ?? null;
}

/**
 * Build descriptors only for formats whose slicing contract is known locally.
 * Atlas/multi-atlas frame descriptors require their dedicated importer adapter.
 */
export function describeSpriteAssetFrames(
  entry: SpriteAssetPackEntry,
  imageWidth: number,
  imageHeight: number,
): SpriteAssetFrameDescriptor[] {
  if (!isRecord(entry) || !Number.isInteger(imageWidth) || !Number.isInteger(imageHeight) ||
      imageWidth <= 0 || imageHeight <= 0) {
    throw new TypeError("Sprite source and positive image dimensions are required.");
  }

  if (entry.type === "image") {
    return [{
      key: String(entry.key),
      sourceRect: fullRect(imageWidth, imageHeight),
      sourceSize: { width: imageWidth, height: imageHeight },
      trimRect: fullRect(imageWidth, imageHeight),
    }];
  }

  if (entry.type !== "spritesheet") {
    throw new TypeError(
      `Sprite metadata authoring does not yet support Asset Pack type "${String(entry.type)}".`,
    );
  }

  const config = isRecord(entry.frameConfig) ? entry.frameConfig : {};
  const frameWidth = Number(config.frameWidth ?? config.width);
  const frameHeight = Number(config.frameHeight ?? config.height);
  const margin = Number(config.margin ?? 0);
  const spacing = Number(config.spacing ?? 0);
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight) ||
      frameWidth <= 0 || frameHeight <= 0) {
    throw new TypeError("Spritesheet requires positive integer frameWidth and frameHeight.");
  }
  if (!Number.isFinite(margin) || !Number.isFinite(spacing) || margin < 0 || spacing < 0) {
    throw new RangeError("Spritesheet margin and spacing must be finite non-negative numbers.");
  }

  // Keep the geometry and frame-window semantics in sync with Phaser's
  // SpriteSheet parser: fit frames without extending beyond the source canvas,
  // select source indices using startFrame/endFrame, and name selected frames
  // sequentially from zero (not by their absolute source index).
  const columns = Math.floor((imageWidth - margin + spacing) / (frameWidth + spacing));
  const rows = Math.floor((imageHeight - margin + spacing) / (frameHeight + spacing));
  const count = columns * rows;
  if (columns <= 0 || rows <= 0 || count <= 0) {
    throw new RangeError("Spritesheet frame geometry does not fit inside the source image.");
  }

  const requestedStart = Number(config.startFrame ?? 0);
  let startFrame = Number.isFinite(requestedStart) ? Math.trunc(requestedStart) : 0;
  if (startFrame > count || startFrame < -count) startFrame = 0;
  if (startFrame < 0) startFrame = count + startFrame;

  const requestedEnd = Number(config.endFrame ?? -1);
  let endFrame = Number.isFinite(requestedEnd) ? Math.trunc(requestedEnd) : -1;
  if (endFrame === -1 || endFrame > count || endFrame < startFrame) endFrame = count;

  const descriptors: SpriteAssetFrameDescriptor[] = [];
  let x = margin;
  let y = margin;
  let name = 0;
  for (let frameIndex = 0; frameIndex < count; frameIndex++) {
    if (frameIndex >= startFrame && frameIndex <= endFrame) {
      descriptors.push({
        key: String(name++),
        sourceRect: { x, y, width: frameWidth, height: frameHeight },
        sourceSize: { width: frameWidth, height: frameHeight },
        trimRect: fullRect(frameWidth, frameHeight),
      });
    }

    x += frameWidth + spacing;
    if (x + frameWidth > imageWidth) {
      x = margin;
      y += frameHeight + spacing;
    }
  }
  return descriptors;
}

export function ensureSpriteAssetMetadata(
  entry: SpriteAssetPackEntry,
  sourceInfo: SpriteAssetSourceInfo | null = null,
  descriptors: SpriteAssetFrameDescriptor[] = [],
): SpriteAssetMetadata {
  if (!isRecord(entry)) throw new TypeError("An Asset Pack image/spritesheet entry is required.");
  const raw = entry[DATA_KEY];
  if (raw !== undefined && !isRecord(raw)) {
    throw new TypeError("Codogma sprite metadata must be a JSON object.");
  }
  const rawMetadata = isRecord(raw) ? raw : null;
  const version = Number(rawMetadata?.schemaVersion ?? 0);
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Sprite metadata schema v${version} is newer than supported v${SCHEMA_VERSION}; data is read-only.`,
    );
  }

  const metadata: SpriteAssetMetadata = rawMetadata
    ? {
        ...clone(rawMetadata),
        schemaVersion: SCHEMA_VERSION,
        assetId: typeof rawMetadata.assetId === "string" && rawMetadata.assetId
          ? rawMetadata.assetId
          : createId(),
        source: isRecord(rawMetadata.source)
          ? rawMetadata.source as unknown as SpriteAssetMetadata["source"]
          : null,
        importSettingsFingerprint: typeof rawMetadata.importSettingsFingerprint === "string"
          ? rawMetadata.importSettingsFingerprint
          : "",
        frames: safeFramesMap(rawMetadata.frames),
        orphanedFrames: Array.isArray(rawMetadata.orphanedFrames)
          ? clone(rawMetadata.orphanedFrames) as SpriteAssetArchivedFrame[]
          : [],
        conflicts: Array.isArray(rawMetadata.conflicts)
          ? clone(rawMetadata.conflicts) as SpriteAssetConflict[]
          : [],
      }
    : {
        schemaVersion: SCHEMA_VERSION,
        assetId: createId(),
        source: null,
        importSettingsFingerprint: "",
        frames: Object.create(null) as Record<string, SpriteFrameMetadata>,
        orphanedFrames: [],
        conflicts: [],
      };

  metadata.schemaVersion = SCHEMA_VERSION;
  if (typeof metadata.assetId !== "string" || !metadata.assetId) metadata.assetId = createId();
  metadata.frames = safeFramesMap(metadata.frames);
  if (!Array.isArray(metadata.orphanedFrames)) metadata.orphanedFrames = [];
  if (!Array.isArray(metadata.conflicts)) metadata.conflicts = [];

  for (const descriptor of descriptors) {
    const key = String(descriptor.key);
    const previous = metadata.frames[key];
    if (!previous) {
      metadata.frames[key] = {
        id: createId(),
        sourceRect: clone(descriptor.sourceRect),
        sourceSize: clone(descriptor.sourceSize),
        trimRect: clone(descriptor.trimRect),
      };
      continue;
    }
    if (!isRecord(previous)) {
      throw new TypeError(`Frame metadata "${key}" must be an object.`);
    }
    if (typeof previous.id !== "string" || !previous.id) previous.id = createId();
    previous.sourceRect ??= clone(descriptor.sourceRect);
    previous.sourceSize ??= clone(descriptor.sourceSize);
    previous.trimRect ??= clone(descriptor.trimRect);
  }

  if (!metadata.source && sourceInfo) {
    const url = typeof entry.url === "string" ? entry.url : "";
    const size = Number.isFinite(sourceInfo.size) ? sourceInfo.size : null;
    const modifiedAt = Number.isFinite(sourceInfo.modifiedAt) ? sourceInfo.modifiedAt : null;
    metadata.source = {
      url,
      size,
      modifiedAt,
      signature: fingerprint(`${url}|${size}|${modifiedAt}`),
    };
  }
  if (!metadata.importSettingsFingerprint) {
    metadata.importSettingsFingerprint = fingerprint(JSON.stringify({
      type: entry.type,
      frameConfig: entry.frameConfig ?? null,
    }));
  }
  return metadata;
}

function hasUserSettings(frame: unknown): boolean {
  if (!isRecord(frame)) return false;
  if (frame.trim || frame.crop) return true;
  if (Array.isArray(frame.collisionShapes) && frame.collisionShapes.length > 0) return true;
  if (isRecord(frame.pivot)) return Number(frame.pivot.x) !== 0.5 || Number(frame.pivot.y) !== 0.5;
  return false;
}

function sameRect(left: unknown, right: unknown): boolean {
  return isRecord(left) && isRecord(right) &&
    Number(left.x) === Number(right.x) &&
    Number(left.y) === Number(right.y) &&
    Number(left.width) === Number(right.width) &&
    Number(left.height) === Number(right.height);
}

function sameSize(left: unknown, right: unknown): boolean {
  return isRecord(left) && isRecord(right) &&
    Number(left.width) === Number(right.width) &&
    Number(left.height) === Number(right.height);
}

export function validateSpriteCollisionShapes(
  value: unknown,
  frameWidth?: number,
  frameHeight?: number,
): string | null {
  if (!Array.isArray(value)) return "Collision shapes must be a JSON array.";
  const positive = (item: unknown): item is number => isFiniteNumber(item) && item > 0;
  for (let index = 0; index < value.length; index++) {
    const shape = value[index];
    if (!isRecord(shape)) return `Shape ${index + 1}: expected an object.`;
    if (shape.type === "rectangle" || shape.type === "rect") {
      if (!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) ||
          !positive(shape.width) || !positive(shape.height) ||
          shape.x < 0 || shape.y < 0 ||
          (positive(frameWidth) && shape.x + shape.width > frameWidth) ||
          (positive(frameHeight) && shape.y + shape.height > frameHeight)) {
        return `Shape ${index + 1}: rectangle must have a positive size and stay inside the source canvas.`;
      }
      continue;
    }
    if (shape.type === "circle") {
      if (!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !positive(shape.radius) ||
          shape.x < shape.radius || shape.y < shape.radius ||
          (positive(frameWidth) && shape.x + shape.radius > frameWidth) ||
          (positive(frameHeight) && shape.y + shape.radius > frameHeight)) {
        return `Shape ${index + 1}: circle must have a positive radius and stay inside the source canvas (x/y are the center).`;
      }
      continue;
    }
    if (shape.type === "polygon") {
      if (!Array.isArray(shape.points) || shape.points.length < 3) {
        return `Shape ${index + 1}: polygon needs at least three points.`;
      }
      const points: Array<{ x: number; y: number }> = [];
      for (const point of shape.points) {
        const x = Array.isArray(point) ? point[0] : isRecord(point) ? point.x : undefined;
        const y = Array.isArray(point) ? point[1] : isRecord(point) ? point.y : undefined;
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || x < 0 || y < 0 ||
            (positive(frameWidth) && x > frameWidth) ||
            (positive(frameHeight) && y > frameHeight)) {
          return `Shape ${index + 1}: polygon points must be finite and inside the source canvas.`;
        }
        points.push({ x, y });
      }
      if (new Set(points.map((point) => `${point.x},${point.y}`)).size !== points.length) {
        return `Shape ${index + 1}: polygon points must be unique.`;
      }
      let twiceArea = 0;
      for (let point = 0; point < points.length; point++) {
        const current = points[point];
        const next = points[(point + 1) % points.length];
        twiceArea += current.x * next.y - next.x * current.y;
      }
      if (Math.abs(twiceArea) < 1e-8) {
        return `Shape ${index + 1}: polygon must have a non-zero area.`;
      }
      continue;
    }
    return `Shape ${index + 1}: unsupported collision shape type.`;
  }
  return null;
}

export function updateSpriteFrameMetadata(
  entry: SpriteAssetPackEntry,
  frameKey: string,
  patch: Record<string, unknown>,
): SpriteAssetPackEntry {
  if (!isRecord(entry) || !isRecord(patch)) {
    throw new TypeError("A sprite entry and frame patch are required.");
  }
  const next = clone(entry);
  const metadata = ensureSpriteAssetMetadata(next, null, []);
  const frame = metadata.frames[String(frameKey)];
  if (!isRecord(frame)) throw new Error(`Sprite frame "${String(frameKey)}" was not found.`);

  const sourceSize = frame.sourceSize ?? frame.sourceRect;
  const sourceRect = frame.sourceRect ?? frame.sourceSize;
  const nextFrame = { ...frame, ...clone(patch) } as SpriteFrameMetadata;

  if (nextFrame.pivot !== undefined) {
    const pivot = nextFrame.pivot as unknown;
    if (!isRecord(pivot) || !isFiniteNumber(pivot.x) || !isFiniteNumber(pivot.y) ||
        pivot.x < 0 || pivot.x > 1 || pivot.y < 0 || pivot.y > 1) {
      throw new RangeError("Pivot coordinates must be finite values between 0 and 1.");
    }
  }
  for (const group of ["trim", "crop"] as const) {
    const rect: unknown = nextFrame[group];
    if (rect === undefined) continue;
    const bounds = group === "trim" ? sourceSize : sourceRect;
    if (!isRecord(rect) ||
        !isFiniteNumber(rect.x) || !isFiniteNumber(rect.y) ||
        !isFiniteNumber(rect.width) || !isFiniteNumber(rect.height) ||
        rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 ||
        (isRecord(bounds) && rect.x + rect.width > Number(bounds.width)) ||
        (isRecord(bounds) && rect.y + rect.height > Number(bounds.height))) {
      throw new RangeError(`${group} rectangle must be positive and stay inside its frame bounds.`);
    }
  }
  if (nextFrame.collisionShapes !== undefined) {
    const error = validateSpriteCollisionShapes(
      nextFrame.collisionShapes,
      isRecord(sourceSize) ? Number(sourceSize.width) : undefined,
      isRecord(sourceSize) ? Number(sourceSize.height) : undefined,
    );
    if (error) throw new RangeError(error);
  }

  metadata.frames[String(frameKey)] = nextFrame;
  next[DATA_KEY] = metadata;
  return next;
}

export function reconcileSpriteAssetMetadata(
  previousEntry: SpriteAssetPackEntry,
  nextEntry: SpriteAssetPackEntry,
  sourceInfo: SpriteAssetSourceInfo,
  descriptors: SpriteAssetFrameDescriptor[],
): SpriteAssetPackEntry {
  if (!isRecord(previousEntry) || !isRecord(nextEntry) || !Array.isArray(descriptors)) {
    throw new TypeError("Reimport requires previous/next Asset Pack entries and frame descriptors.");
  }
  const metadata = ensureSpriteAssetMetadata(previousEntry, sourceInfo, []);
  const previousFrames = metadata.frames;
  const nextFrames: Record<string, SpriteFrameMetadata> = Object.create(null) as Record<string, SpriteFrameMetadata>;
  const seen = new Set<string>();

  for (const descriptor of descriptors) {
    const key = String(descriptor.key);
    seen.add(key);
    const previous = previousFrames[key];
    if (!previous) {
      nextFrames[key] = {
        id: createId(),
        sourceRect: clone(descriptor.sourceRect),
        sourceSize: clone(descriptor.sourceSize),
        trimRect: clone(descriptor.trimRect),
      };
      continue;
    }
    const geometryChanged =
      (previous.sourceRect !== undefined && !sameRect(previous.sourceRect, descriptor.sourceRect)) ||
      (previous.sourceSize !== undefined && !sameSize(previous.sourceSize, descriptor.sourceSize)) ||
      (previous.trimRect !== undefined && !sameRect(previous.trimRect, descriptor.trimRect));

    if (!geometryChanged) {
      nextFrames[key] = {
        ...clone(previous),
        id: previous.id || createId(),
        sourceRect: clone(descriptor.sourceRect),
        sourceSize: clone(descriptor.sourceSize),
        trimRect: clone(descriptor.trimRect),
      };
      continue;
    }

    if (hasUserSettings(previous)) {
      if (!metadata.orphanedFrames.some((item) => item.id === previous.id)) {
        metadata.orphanedFrames.push({
          ...clone(previous),
          frameKey: key,
          id: previous.id || createId(),
        });
      }
      metadata.conflicts.push({
        id: createId(),
        type: "frame-geometry-changed",
        frameKey: key,
        previousSourceRect: clone(previous.sourceRect),
        currentSourceRect: clone(descriptor.sourceRect),
        previousSourceSize: clone(previous.sourceSize),
        currentSourceSize: clone(descriptor.sourceSize),
        previousTrimRect: clone(previous.trimRect),
        currentTrimRect: clone(descriptor.trimRect),
        message: "Frame or source canvas geometry changed; authored settings were archived.",
      });
    }
    nextFrames[key] = {
      id: createId(),
      sourceRect: clone(descriptor.sourceRect),
      sourceSize: clone(descriptor.sourceSize),
      trimRect: clone(descriptor.trimRect),
    };
  }

  for (const [key, previous] of Object.entries(previousFrames)) {
    if (seen.has(key) || !hasUserSettings(previous)) continue;
    if (!metadata.orphanedFrames.some((item) => item.id === previous.id)) {
      metadata.orphanedFrames.push({
        ...clone(previous),
        frameKey: key,
        id: previous.id || createId(),
      });
    }
    metadata.conflicts.push({
      id: createId(),
      type: "frame-removed",
      frameKey: key,
      previousSourceRect: clone(previous.sourceRect),
      currentSourceRect: null,
      message: "Frame was removed from the reimported source; authored settings were archived.",
    });
  }

  metadata.frames = nextFrames;
  const url = typeof nextEntry.url === "string" ? nextEntry.url : "";
  const size = Number.isFinite(sourceInfo?.size) ? sourceInfo.size : null;
  const modifiedAt = Number.isFinite(sourceInfo?.modifiedAt) ? sourceInfo.modifiedAt : null;
  metadata.source = {
    url,
    size,
    modifiedAt,
    signature: fingerprint(`${url}|${size}|${modifiedAt}`),
  };
  metadata.importSettingsFingerprint = fingerprint(JSON.stringify({
    type: nextEntry.type,
    frameConfig: nextEntry.frameConfig ?? null,
  }));
  return { ...clone(nextEntry), [DATA_KEY]: metadata };
}

export function setSpriteAssetEntry(
  document: SpriteAssetPackDocument,
  assetKey: string,
  nextEntry: SpriteAssetPackEntry,
): SpriteAssetPackDocument {
  if (!isAssetPackContent(document)) throw new TypeError("A valid Asset Pack document is required.");
  const match = findSpriteAssetEntry(document, assetKey);
  if (!match) throw new Error(`Sprite Asset Pack entry "${assetKey}" was not found.`);
  const next = clone(document);
  const section = next[match.sectionKey];
  if (!isRecord(section) || !Array.isArray(section.files)) {
    throw new TypeError(`Asset Pack section "${match.sectionKey}" is invalid.`);
  }
  section.files[match.index] = clone(nextEntry);
  return next;
}
