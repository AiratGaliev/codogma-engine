import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { parseComponentSchemaSource } from "../src/domain/component-schema-source.js";

const fixturePath = resolve(
  process.cwd(),
  "../../packages/cge/tests/fixtures/acceptance-project/src/FollowTarget.ts",
);

test("loads the versioned Component Schema from a static module definition", async () => {
  const source = readFileSync(fixturePath, "utf8");
  const result = await parseComponentSchemaSource(
    source,
    "src/FollowTarget.ts",
    "com.codogma.acceptance.follow-target",
    "1.0.0",
  );

  assert.equal(result.valid, true);
  assert.equal(result.value?.schemaVersion, 1);
  assert.equal(result.value?.properties.sprite?.type, "asset");
  assert.equal(result.value?.properties.target?.type, "node");
  assert.deepEqual({ ...result.value?.properties.speed }, {
    type: "number",
    min: 0,
    defaultValue: 1,
  });
});

test("rejects schemas that disagree with the Project manifest identity or version", async () => {
  const source = readFileSync(fixturePath, "utf8");
  const wrongId = await parseComponentSchemaSource(
    source,
    "src/FollowTarget.ts",
    "com.example.other",
    "1.0.0",
  );
  const wrongVersion = await parseComponentSchemaSource(
    source,
    "src/FollowTarget.ts",
    "com.codogma.acceptance.follow-target",
    "2.0.0",
  );

  assert.equal(wrongId.valid, false);
  assert.equal(wrongVersion.valid, false);
  assert.match(wrongId.diagnostics[0]?.message ?? "", /does not match Project module/);
  assert.match(wrongVersion.diagnostics[0]?.message ?? "", /does not match Project module version/);
});

test("does not execute dynamic expressions while reading an untrusted module schema", async () => {
  const source = `
    export const componentDefinition = {
      schema: createSchemaFromUserCode(),
    };
  `;
  const result = await parseComponentSchemaSource(
    source,
    "Unsafe.ts",
    "com.example.unsafe",
    "1.0.0",
  );

  assert.equal(result.valid, false);
  assert.match(result.diagnostics[0]?.message ?? "", /static JSON literals/);
});

test("rejects a module that does not declare an exported Component Definition", async () => {
  const result = await parseComponentSchemaSource(
    'const componentDefinition = { schema: {} };',
    "MissingExport.ts",
    "com.example.missing",
    "1.0.0",
  );

  assert.equal(result.valid, false);
  assert.match(result.diagnostics[0]?.message ?? "", /must export a componentDefinition constant/);
});
