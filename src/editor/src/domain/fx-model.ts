import {
  isJsonValue,
  type ComponentInstanceDocument,
  type NodeDocument,
} from "@codogma/cge";
import { updateNativeNode, type EditorDocument } from "./scene-model.js";
import { FX_COMPONENT_TYPES } from "./builtin-component-ids.js";
import {
  getNativeFxType,
  validateNativeFxComponentProperties,
  validateNativeFxPropertyValues,
  type NativeFxType,
} from "./fx-validation.js";
export { FX_COMPONENT_TYPES } from "./builtin-component-ids.js";

export type FxType = NativeFxType;
type FxColor = string | number;

interface FxBase extends Record<string, unknown> {
  id: string;
  type: FxType;
  label: string;
  preFX: boolean;
}
export interface CircleFx extends FxBase {
  type: "Circle";
  thickness: number;
  color: FxColor;
  backgroundColor: FxColor;
  scale: number;
  feather: number;
}
export interface BloomFx extends FxBase {
  type: "Bloom";
  threshold: number;
  blurRadius: number;
  blurSteps: number;
  blurQuality: number;
  blendAmount: number;
}
export interface GradientFx extends FxBase {
  type: "Gradient";
  color1: FxColor;
  color2: FxColor;
  alpha: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  size: number;
}
export interface ShineFx extends FxBase {
  type: "Shine";
  radius: number;
  direction: number;
  scale: number;
  duration: number;
  reveal: boolean;
  yoyo: boolean;
}
export type FxObject = CircleFx | BloomFx | GradientFx | ShineFx;

const INTERNAL_FILTER_RENDERERS = new Set([
  "com.codogma.renderer.image",
  "com.codogma.renderer.text",
]);

export interface FxEntry {
  id: string;
  type: FxType;
  source: FxObject;
  component: ComponentInstanceDocument;
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error("Secure randomUUID support is required to create FX component identities.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFxType(value: unknown): value is FxType {
  return typeof value === "string" && Object.hasOwn(FX_COMPONENT_TYPES, value);
}

function getFxTypeFromComponentTypeId(typeId: string): FxType | undefined {
  return getNativeFxType(typeId);
}

function defaults(type: FxType, id: string, preFX: boolean): FxObject {
  const base = { id, type, label: type, preFX };
  switch (type) {
    case "Circle":
      return { ...base, type, thickness: 8, color: "#ff33b2", backgroundColor: "#ff0000", scale: 1, feather: 0.005 };
    case "Bloom":
      return { ...base, type, threshold: 0.5, blurRadius: 2, blurSteps: 4, blurQuality: 0, blendAmount: 1 };
    case "Gradient":
      return { ...base, type, color1: "#ff0000", color2: "#00ff00", alpha: 0.2, fromX: 0, fromY: 0, toX: 0, toY: 1, size: 0 };
    case "Shine":
      return { ...base, type, radius: 0.5, direction: 0.5, scale: 2, duration: 2000, reveal: false, yoyo: false };
  }
}

function validatePatch(source: FxObject, patch: Partial<Omit<FxObject, "id" | "type">>): void {
  validateNativeFxPropertyValues(source.type, patch as Record<string, unknown>, true);
}

function componentToFx(component: ComponentInstanceDocument, type: FxType): FxObject {
  validateNativeFxComponentProperties(component);
  const base = defaults(type, component.id, component.properties.preFX === true);
  const properties = { ...component.properties };
  delete properties.id;
  delete properties.type;
  return { ...base, ...properties } as FxObject;
}

function updateComponent(
  document: EditorDocument,
  nodeId: string,
  instanceId: string,
  update: (component: ComponentInstanceDocument) => ComponentInstanceDocument | null,
): EditorDocument {
  return updateNativeNode(document, nodeId, (node: NodeDocument) => {
    const exists = node.components.some((item) => item.id === instanceId);
    if (!exists) throw new Error(`FX component "${instanceId}" was not found on Node "${nodeId}".`);
    const components = node.components.flatMap((component) => {
      if (component.id !== instanceId) return [component];
      const result = update(component);
      return result ? [result] : [];
    });
    return { ...node, components };
  });
}

export function getNativeNodeEffects(node: NodeDocument): FxEntry[] {
  return node.components.flatMap((component) => {
    const type = getFxTypeFromComponentTypeId(component.typeId);
    if (!type) return [];
    return [{
      id: component.id,
      type,
      source: componentToFx(component, type),
      component,
    }];
  });
}

export function getEnabledNativeNodeEffects(node: NodeDocument): FxEntry[] {
  return getNativeNodeEffects(node).filter((effect) => effect.component.enabled);
}

export function createFxObject(type: FxType, id = createId(), preFX = true): FxObject {
  if (!isFxType(type)) throw new TypeError(`Unsupported FX type "${String(type)}".`);
  return defaults(type, id, preFX);
}

export function addNativeNodeFx(
  document: EditorDocument,
  nodeId: string,
  type: FxType,
  rendererTypeId?: string,
): EditorDocument {
  if (!isFxType(type)) throw new TypeError(`Unsupported FX type "${String(type)}".`);
  const id = createId();
  const value = createFxObject(type, id, false);
  const properties: Record<string, unknown> = { ...value };
  delete properties.id;
  delete properties.type;
  return updateNativeNode(document, nodeId, (node) => {
    const inferredRendererTypeId = rendererTypeId ?? node.components.find((component) =>
      component.typeId === "com.codogma.renderer.image" ||
      component.typeId === "com.codogma.renderer.text" ||
      component.typeId === "com.codogma.renderer.container",
    )?.typeId;
    properties.preFX = inferredRendererTypeId !== undefined && INTERNAL_FILTER_RENDERERS.has(inferredRendererTypeId);
    return {
      ...node,
      components: [...node.components, {
        id,
        typeId: FX_COMPONENT_TYPES[type],
        schemaVersion: 1,
        enabled: true,
        properties,
      }],
    };
  });
}

export function updateNativeNodeFx(
  document: EditorDocument,
  nodeId: string,
  instanceId: string,
  patch: Partial<Omit<FxObject, "id" | "type">>,
): EditorDocument {
  return updateComponent(document, nodeId, instanceId, (component) => {
    const type = getFxTypeFromComponentTypeId(component.typeId);
    if (!type) throw new Error(`Component "${instanceId}" is not a supported FX component.`);
    const current = componentToFx(component, type);
    validatePatch(current, patch);
    const next = { ...current, ...patch };
    const properties: Record<string, unknown> = { ...next };
    delete properties.id;
    delete properties.type;
    if (!isJsonValue(properties) || !isRecord(properties)) {
      throw new TypeError("FX properties must be JSON-compatible.");
    }
    return { ...component, properties };
  });
}

export function removeNativeNodeFx(
  document: EditorDocument,
  nodeId: string,
  instanceId: string,
): EditorDocument {
  return updateComponent(document, nodeId, instanceId, (component) => {
    if (!getFxTypeFromComponentTypeId(component.typeId)) {
      throw new Error(`Component "${instanceId}" is not a supported FX component.`);
    }
    return null;
  });
}
