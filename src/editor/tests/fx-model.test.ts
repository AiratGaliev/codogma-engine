import assert from "node:assert/strict";
import { test as testCase } from "vitest";
import type { SceneDocumentV1 } from "@codogma/cge";
import {
  addNativeNodeFx,
  FX_COMPONENT_TYPES,
  getNativeNodeEffects,
  getEnabledNativeNodeEffects,
  removeNativeNodeFx,
  updateNativeNodeFx,
} from "../src/domain/fx-model.js";
import { findSceneNode } from "../src/domain/scene-model.js";

function scene(): SceneDocumentV1 {
  return {
    schemaVersion: 1,
    id: "scene-fx",
    name: "FX",
    settings: {},
    rootNodes: [{
      id: "node-image",
      name: "Image",
      active: true,
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5 },
      components: [{
        id: "renderer-image",
        typeId: "com.codogma.renderer.image",
        schemaVersion: 1,
        enabled: true,
        properties: { assetId: "asset-image" },
      }],
      children: [],
    }],
  };
}

testCase("stores FX as native Component instances with independent IDs and explicit type IDs", () => {
  const document = addNativeNodeFx(scene(), "node-image", "Circle", "com.codogma.renderer.image") as SceneDocumentV1;
  const node = findSceneNode(document, "node-image");
  const effects = getNativeNodeEffects(node!);
  assert.equal(effects.length, 1);
  assert.equal(effects[0]?.type, "Circle");
  assert.equal(effects[0]?.component.typeId, FX_COMPONENT_TYPES.Circle);
  assert.equal(effects[0]?.id, effects[0]?.component.id);
  assert.equal(effects[0]?.source.preFX, true);
  assert.equal(node?.components.some((item) => "list" in item), false);
});

testCase("validates FX property edits and rejects malformed values", () => {
  let document = addNativeNodeFx(scene(), "node-image", "Bloom") as SceneDocumentV1;
  const effect = getNativeNodeEffects(findSceneNode(document, "node-image")!)[0];
  assert.ok(effect);
  document = updateNativeNodeFx(document, "node-image", effect.id, { threshold: 0.75, blurSteps: 8 }) as SceneDocumentV1;
  assert.equal(getNativeNodeEffects(findSceneNode(document, "node-image")!)[0]?.source.threshold, 0.75);
  assert.throws(() => updateNativeNodeFx(document, "node-image", effect.id, { threshold: 2 }), /at most 1/);
  assert.throws(() => updateNativeNodeFx(document, "node-image", effect.id, { randomField: 1 } as never), /Unsupported Bloom property/);
});

testCase("removes FX by native Component instance identity", () => {
  let document = addNativeNodeFx(scene(), "node-image", "Shine") as SceneDocumentV1;
  const effect = getNativeNodeEffects(findSceneNode(document, "node-image")!)[0];
  assert.ok(effect);
  document = removeNativeNodeFx(document, "node-image", effect.id) as SceneDocumentV1;
  assert.deepEqual(getNativeNodeEffects(findSceneNode(document, "node-image")!), []);
  assert.throws(() => removeNativeNodeFx(document, "node-image", effect.id), /not found/);
});


testCase("keeps disabled FX components editable but excludes them from the runtime preview set", () => {
  const withFx = addNativeNodeFx(scene(), "node-image", "Circle") as SceneDocumentV1;
  const node = findSceneNode(withFx, "node-image")!;
  const fx = getNativeNodeEffects(node)[0]!;
  const disabled: SceneDocumentV1 = {
    ...withFx,
    rootNodes: [{
      ...withFx.rootNodes[0]!,
      components: withFx.rootNodes[0]!.components.map((component) =>
        component.id === fx.id ? { ...component, enabled: false } : component,
      ),
    }],
  };
  const disabledNode = findSceneNode(disabled, "node-image")!;
  assert.equal(getNativeNodeEffects(disabledNode).length, 1);
  assert.equal(getNativeNodeEffects(disabledNode)[0]?.component.enabled, false);
  assert.deepEqual(getEnabledNativeNodeEffects(disabledNode), []);
});
