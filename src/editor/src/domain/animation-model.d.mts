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
  settings?: { sourceLang?: string; generateCode?: boolean; esModule?: boolean; outputFolder?: string; [key: string]: unknown };
  meta: { app?: string; url?: string; contentType: string; [key: string]: unknown };
  [key: string]: unknown;
}
export function createAnimationDocument(): AnimationDocument;
export function parseAnimationContent(content: string): AnimationDocument;
export function isAnimationContent(value: unknown): value is AnimationDocument;
export function getAnimations(document: AnimationDocument): Array<{ key: string; index: number; frameCount: number; source: PhaserAnimationConfig }>;
export function createAnimation(document: AnimationDocument, preferredKey?: string, options?: Partial<PhaserAnimationConfig>): AnimationDocument;
export function updateAnimation(document: AnimationDocument, key: string, patch: Partial<PhaserAnimationConfig>): AnimationDocument;
export function removeAnimation(document: AnimationDocument, key: string): AnimationDocument;
export function appendAnimationFrame(document: AnimationDocument, animationKey: string, frame: AnimationFrame): AnimationDocument;
export function removeAnimationFrame(document: AnimationDocument, animationKey: string, frameIndex: number): AnimationDocument;
export function moveAnimationFrame(document: AnimationDocument, animationKey: string, fromIndex: number, toIndex: number): AnimationDocument;
export function updateAnimationSettings(document: AnimationDocument, patch: Record<string, unknown>): AnimationDocument;
export function formatAnimationContent(document: AnimationDocument): string;
