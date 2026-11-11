import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { parseComponentSchemaSource } from "../src/domain/component-schema-source.js";
import { createNativeComponentModuleSource } from "../src/domain/component-module-source.js";

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

test("rejects a Component Definition without an executable factory export", async () => {
  const missing = await parseComponentSchemaSource(
    'export const componentDefinition = { schema: { schemaVersion: 1 } };',
    "MissingFactory.ts",
    "com.example.missing-factory",
    "1.0.0",
  );
  const nonCallable = await parseComponentSchemaSource(
    'export const componentDefinition = { schema: {}, create: 42 };',
    "InvalidFactory.ts",
    "com.example.invalid-factory",
    "1.0.0",
  );

  assert.equal(missing.valid, false);
  assert.equal(nonCallable.valid, false);
  assert.match(missing.diagnostics[0]?.message ?? "", /callable create factory/);
  assert.match(nonCallable.diagnostics[0]?.message ?? "", /callable method, function, or arrow function/);
});

test("accepts a factory referenced through a local const without executing it", async () => {
  const source = `
    const create = (_context: { readonly instanceId: string }) => ({});
    export const componentDefinition = {
      schema: {
        schemaVersion: 1 as const,
        typeId: "com.example.factory-reference",
        name: "Factory Reference",
        version: "1.0.0",
        properties: {},
      },
      create,
    };
  `;
  const result = await parseComponentSchemaSource(
    source,
    "FactoryReference.ts",
    "com.example.factory-reference",
    "1.0.0",
  );
  assert.equal(result.valid, true);
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

test("creates an editable Script Component starter whose static schema matches its manifest identity", async () => {
  const source = createNativeComponentModuleSource({
    typeId: "com.codogma.generated.health",
    name: 'Health "Controller"',
    version: "1.2.0",
  });
  const result = await parseComponentSchemaSource(
    source,
    "src/components/Health.ts",
    "com.codogma.generated.health",
    "1.2.0",
  );

  assert.equal(result.valid, true);
  assert.equal(result.value?.name, 'Health "Controller"');
  assert.equal(result.value?.typeId, "com.codogma.generated.health");
  assert.deepEqual(result.value?.properties, {});
  assert.match(source, /create\(_context/);
});
