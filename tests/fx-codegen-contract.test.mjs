import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = new URL("../", import.meta.url);
const builderPath = new URL(
  "source/editor/plugins/phasereditor2d.scene/src/core/code/SceneCodeDOMBuilder.ts",
  repositoryRoot,
);

test("generated Gradient sibling synchronizes its alpha with the parent GameObject", async () => {
  const source = await readFile(fileURLToPath(builderPath), "utf8");
  const gradientBuilder = source.match(
    /if \(obj instanceof ui\.sceneobjects\.FXGradient && parentVarName\) \{([\s\S]*?)\n\s*\}\n\s*\n/,
  );

  assert.ok(gradientBuilder, "SceneCodeDOMBuilder must retain the Gradient codegen branch");
  assert.match(
    gradientBuilder[1],
    /\.setAlpha\(" \+ parent \+ "\.alpha \?\? 1\);/,
    "generated Gradient update code must copy the live parent alpha",
  );
});
