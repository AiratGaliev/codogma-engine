export const PROJECT_SCHEMA_VERSION = 1 as const;
export const SCENE_SCHEMA_VERSION = 1 as const;
export const PREFAB_SCHEMA_VERSION = 1 as const;

export const ASSET_KINDS = [
  "image", "audio", "font", "animation", "tilemap", "script", "scene", "prefab", "other",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export interface TransformData {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
}

export interface AssetReference {
  id: string;
  path: string;
  kind: AssetKind;
  subResourceId?: string;
}

export interface SceneReference {
  id: string;
  assetId: string;
}

export interface PrefabReference {
  id: string;
  assetId: string;
}

export interface ComponentModuleReference {
  typeId: string;
  moduleAssetId: string;
  version: string;
}

export interface RuntimeConfiguration {
  adapterId: string;
  settings: Record<string, unknown>;
}

export interface ProjectDocumentV1 {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  scenes: SceneReference[];
  assets: AssetReference[];
  prefabs: PrefabReference[];
  componentModules: ComponentModuleReference[];
  runtime: RuntimeConfiguration;
}

export interface ComponentInstanceDocument {
  id: string;
  typeId: string;
  schemaVersion: number;
  enabled: boolean;
  properties: Record<string, unknown>;
}

export interface PrefabOverrideDocument {
  targetNodeId: string;
  propertyPath: string;
  value: unknown;
  targetComponentId?: string;
}

export interface PrefabInstanceDocument {
  prefabId: string;
  overrides: PrefabOverrideDocument[];
  sourceNodeId?: string;
}

export interface NodeAssetReferenceDocument {
  readonly propertyPath: string;
  readonly assetId: string;
}

export interface NodeDocument {
  id: string;
  name: string;
  active: boolean;
  transform: TransformData;
  components: ComponentInstanceDocument[];
  assetReferences?: NodeAssetReferenceDocument[];
  children: NodeDocument[];
  prefabInstance?: PrefabInstanceDocument;
}

export interface SceneDocumentV1 {
  schemaVersion: typeof SCENE_SCHEMA_VERSION;
  id: string;
  name: string;
  rootNodes: NodeDocument[];
  settings: Record<string, unknown>;
}

export interface PrefabDocumentV1 {
  schemaVersion: typeof PREFAB_SCHEMA_VERSION;
  id: string;
  name: string;
  root: NodeDocument;
}

export type ProjectDocumentV0 = Record<string, unknown> & {
  schemaVersion: 0;
  id: string;
  name: string;
};

export function createDefaultTransform(): TransformData {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    originX: 0.5,
    originY: 0.5,
  };
}
