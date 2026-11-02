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
  const syncCodeStart = gradientBuilder[1].indexOf("const syncCode = [");
  const syncCodeEnd = gradientBuilder[1].indexOf("].join(", syncCodeStart);
  assert.ok(syncCodeStart >= 0 && syncCodeEnd > syncCodeStart, "Gradient sync code must be emitted as an update callback");
  const syncCode = gradientBuilder[1].slice(syncCodeStart, syncCodeEnd);
  assert.match(
    syncCode,
    /\.setAlpha\(" \+ parent \+ "\.alpha \?\? 1\);/,
    "the live Gradient sync callback must copy the parent alpha",
  );
  assert.match(
    gradientBuilder[1],
    /events\.on\('update', " \+ syncName \+ "\);/,
    "the generated scene must invoke Gradient synchronization on scene updates",
  );
});
