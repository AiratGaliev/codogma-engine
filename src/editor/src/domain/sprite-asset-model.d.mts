export interface SpriteAssetRect { x:number; y:number; width:number; height:number; }
export interface SpriteAssetSize { width:number; height:number; }
export interface SpriteAssetFrameDescriptor {
  key:string;
  sourceRect:SpriteAssetRect;
  sourceSize:SpriteAssetSize;
  trimRect:SpriteAssetRect;
}
export interface SpriteAssetSourceInfo { size:number; modifiedAt:number; }
export interface SpriteAssetMetadata {
  schemaVersion:number;
  assetId:string;
  source: { url:string; size:number|null; modifiedAt:number|null; signature:string } | null;
  importSettingsFingerprint:string;
  frames:Record<string, Record<string, unknown>>;
  orphanedFrames:Record<string, unknown>[];
  conflicts:Record<string, unknown>[];
  [key:string]:unknown;
}
export interface SpriteAssetPackEntry {
  type:"image"|"spritesheet";
  key:string;
  url:string;
  frameConfig?:Record<string, unknown>;
  codogma?:SpriteAssetMetadata;
  [key:string]:unknown;
}
export interface SpriteAssetPackDocument {
  meta:Record<string, unknown>;
  [key:string]:unknown;
}
export function isAssetPackContent(value:unknown):boolean;
export function parseAssetPackContent(content:string):SpriteAssetPackDocument;
export function formatAssetPackContent(document:SpriteAssetPackDocument):string;
export function getSpriteAssetEntries(document:SpriteAssetPackDocument):Array<{sectionKey:string;index:number;entry:SpriteAssetPackEntry}>;
export function findSpriteAssetEntry(document:SpriteAssetPackDocument,assetKey:string):{sectionKey:string;index:number;entry:SpriteAssetPackEntry}|null;
export function describeSpriteAssetFrames(entry:SpriteAssetPackEntry,imageWidth:number,imageHeight:number):SpriteAssetFrameDescriptor[];
export function ensureSpriteAssetMetadata(entry:SpriteAssetPackEntry,sourceInfo?:SpriteAssetSourceInfo|null,descriptors?:SpriteAssetFrameDescriptor[]):SpriteAssetMetadata;
export function validateSpriteCollisionShapes(value:unknown,frameWidth?:number,frameHeight?:number):string|null;
export function updateSpriteFrameMetadata(entry:SpriteAssetPackEntry,frameKey:string,patch:Record<string,unknown>):SpriteAssetPackEntry;
export function reconcileSpriteAssetMetadata(previousEntry:SpriteAssetPackEntry,nextEntry:SpriteAssetPackEntry,sourceInfo:SpriteAssetSourceInfo,descriptors:SpriteAssetFrameDescriptor[]):SpriteAssetPackEntry;
export function setSpriteAssetEntry(document:SpriteAssetPackDocument,assetKey:string,nextEntry:SpriteAssetPackEntry):SpriteAssetPackDocument;
