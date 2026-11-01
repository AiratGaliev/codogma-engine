import type { SceneObject } from "./scene-model.mjs";
export interface UserComponentProperty {
  name: string; label?: string; tooltip?: string; defValue?: unknown; customDefinition?: boolean;
  type?: { id: "string" | "number" | "boolean" | "option"; options?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}
export interface UserComponentDefinition {
  name: string; displayName?: string; objectDisplayFormat?: string; baseClass?: string; gameObjectType?: string;
  properties: UserComponentProperty[]; generateAwakeEvent?: boolean; [key: string]: unknown;
}
export interface UserComponentsDocument { components: UserComponentDefinition[]; meta?: Record<string, unknown>; [key: string]: unknown; }
export function isUserComponentsContent(value: unknown): value is UserComponentsDocument;
export function parseUserComponentsContent(content: string): UserComponentsDocument;
export function createUserComponentDefinition(name: string, options?: Partial<UserComponentDefinition>): UserComponentDefinition;
export function addUserComponentDefinition(document: UserComponentsDocument, definition: UserComponentDefinition): UserComponentsDocument;
export function updateUserComponentDefinition(document: UserComponentsDocument, name: string, patch: Partial<UserComponentDefinition>): UserComponentsDocument;
export function removeUserComponentDefinition(document: UserComponentsDocument, name: string): UserComponentsDocument;
export function attachUserComponent(object: SceneObject, definition: UserComponentDefinition): SceneObject;
export function detachUserComponent(object: SceneObject, componentName: string): SceneObject;
export function formatUserComponentsContent(document: UserComponentsDocument): string;
