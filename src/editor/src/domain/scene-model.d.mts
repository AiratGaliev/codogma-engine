export interface SceneObject {
  id?: string;
  label?: string;
  type?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  originX?: number;
  originY?: number;
  alpha?: number;
  texture?: { key?: string; [key: string]: unknown };
  components?: string[];
  [key: string]: unknown;
}

export interface SceneDocument {
  id: string;
  sceneType?: string;
  displayList: SceneObject[];
  plainObjects?: SceneObject[];
  [key: string]: unknown;
}

export interface SceneObjectEntry {
  id: string;
  name: string;
  type: string;
  collection: "displayList" | "plainObjects";
  index: number;
  source: SceneObject;
}

export function parseSceneContent(content: string): SceneDocument;
export function getSceneObjects(scene: SceneDocument): SceneObjectEntry[];
export function updateSceneObject(
  scene: SceneDocument,
  id: string,
  patch: Partial<SceneObject>,
): SceneDocument;
export function removeSceneObject(scene: SceneDocument, id: string): SceneDocument;
export function createSceneObject(scene: SceneDocument, kind: "Image" | "Text" | "Container"): SceneDocument;
export function findScenePaths(rootFile: import("../services/editor-api").ProjectEntry): string[];
export function formatSceneContent(scene: SceneDocument): string;
