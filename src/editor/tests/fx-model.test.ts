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

testCase("rejects invalid persisted FX fields while preserving unknown JSON extension fields", () => {
  const cases = [
    { type: "Bloom" as const, properties: { threshold: 1.1 }, message: /threshold.*at most 1/ },
    { type: "Bloom" as const, properties: { blurSteps: 2.5 }, message: /blurSteps.*integer/ },
    { type: "Gradient" as const, properties: { alpha: -0.1 }, message: /alpha.*at least 0/ },
    { type: "Circle" as const, properties: { color: "red" }, message: /Phaser-compatible HEX color/ },
    { type: "Shine" as const, properties: { duration: 0 }, message: /duration.*at least 1/ },
  ];

  for (const item of cases) {
    const document = addNativeNodeFx(scene(), "node-image", item.type) as SceneDocumentV1;
    const effect = getNativeNodeEffects(findSceneNode(document, "node-image")!)[0]!;
    const invalid: SceneDocumentV1 = {
      ...document,
      rootNodes: [{
        ...document.rootNodes[0]!,
        components: document.rootNodes[0]!.components.map((component) =>
          component.id === effect.id
            ? { ...component, properties: { ...component.properties, ...item.properties } }
            : component,
        ),
      }],
    };
    assert.throws(
      () => getNativeNodeEffects(findSceneNode(invalid, "node-image")!),
      item.message,
    );
  }

  const extensionDocument = addNativeNodeFx(scene(), "node-image", "Bloom") as SceneDocumentV1;
  const extensionEffect = getNativeNodeEffects(findSceneNode(extensionDocument, "node-image")!)[0]!;
  const extended: SceneDocumentV1 = {
    ...extensionDocument,
    rootNodes: [{
      ...extensionDocument.rootNodes[0]!,
      components: extensionDocument.rootNodes[0]!.components.map((component) =>
        component.id === extensionEffect.id
          ? { ...component, properties: { ...component.properties, pluginMetadata: { keep: true } } }
          : component,
      ),
    }],
  };
  assert.deepEqual(
    getNativeNodeEffects(findSceneNode(extended, "node-image")!)[0]?.source.pluginMetadata,
    { keep: true },
  );
});
