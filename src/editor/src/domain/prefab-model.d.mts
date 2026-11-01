import type { SceneDocument, SceneObject } from "./scene-model.mjs";

export interface PrefabProperty {
  name: string;
  label?: string;
  tooltip?: string;
  defValue?: unknown;
  customDefinition?: boolean;
  type: { id: "string" | "number" | "boolean" | "option"; options?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface PrefabDocument extends SceneDocument {
  sceneType: "PREFAB";
  prefabProperties?: PrefabProperty[];
  name?: string;
}

export function createPrefabDocument(scene: SceneDocument, object: SceneObject, name?: string): PrefabDocument;
export function createPrefabInstance(scene: SceneDocument, prefab: PrefabDocument, options?: Record<string, unknown>): SceneDocument;
export function addPrefabProperty(prefab: PrefabDocument, property: PrefabProperty): PrefabDocument;
export function updatePrefabProperty(prefab: PrefabDocument, propertyName: string, patch: Partial<PrefabProperty>): PrefabDocument;
export function removePrefabProperty(prefab: PrefabDocument, propertyName: string): PrefabDocument;
export function getPrefabPropertyDefault(property: PrefabProperty): unknown;
export function resolvePrefabInstanceValues(prefab: PrefabDocument, instance: SceneObject): Record<string, unknown>;
