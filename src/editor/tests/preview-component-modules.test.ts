import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import {
  inspectPreviewModuleSource,
  createEditorPreviewProjectSnapshot,
  resolveEditorPreviewComponentRegistry,
} from "../src/services/preview-component-modules.js";
import { validateProjectDocument, type ProjectDocumentV1 } from "@codogma/cge";

test("accepts a self-contained TypeScript Component definition", async () => {
  const diagnostics = await inspectPreviewModuleSource(
    'export const componentDefinition = { schema: { schemaVersion: 1, typeId: "com.example.live", name: "Live", version: "1.0.0", properties: {} }, create() { return { onUpdate() {} }; } };',
    "src/Live.ts",
  );
  assert.deepEqual(diagnostics, []);
});

test("rejects static, type-only and dynamic imports before module execution", async () => {
  const staticImport = await inspectPreviewModuleSource(
    'import { ComponentBehavior } from "@codogma/cge"; export const componentDefinition = {};',
    "src/Imported.ts",
  );
  assert.equal(staticImport.length, 1);
  assert.match(staticImport[0]?.message ?? "", /self-contained/);

  const typeImport = await inspectPreviewModuleSource(
    'type Contract = import("@codogma/cge").ComponentBehavior; export const componentDefinition = {};',
    "src/TypeImported.ts",
  );
  assert.equal(typeImport.length, 1);
  assert.match(typeImport[0]?.message ?? "", /self-contained/);

  const dynamicImport = await inspectPreviewModuleSource(
    'export const componentDefinition = { async create() { await import("./other.js"); return {}; } };',
    "src/Dynamic.ts",
  );
  assert.equal(dynamicImport.length, 1);
  assert.match(dynamicImport[0]?.message ?? "", /Dynamic import/);
});

test("rejects unsupported Script Asset extensions and oversized module source", async () => {
  const unsupported = await inspectPreviewModuleSource("export const componentDefinition = {};", "src/module.js");
  assert.match(unsupported[0]?.message ?? "", /\.ts or \.tsx/);
  const oversized = await inspectPreviewModuleSource(" ".repeat(1_048_577), "src/large.ts");
  assert.match(oversized[0]?.message ?? "", /1 MiB/);
});


test("adds editor built-in Component references only to Preview snapshots and registers their runtime types", async () => {
  const project = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../../packages/cge/tests/fixtures/acceptance-project/project.json"),
      "utf8",
    ),
  ) as ProjectDocumentV1;
  const existingModuleCount = project.componentModules.length;
  const existingAssetCount = project.assets.length;
  const previewProject = createEditorPreviewProjectSnapshot(
    project,
    ["com.codogma.renderer.image", "com.codogma.renderer.text"],
  );
  assert.equal(project.componentModules.length, existingModuleCount);
  assert.equal(previewProject.componentModules.length, existingModuleCount + 2);
  assert.equal(previewProject.assets.length, existingAssetCount + 2);
  assert.equal(validateProjectDocument(previewProject).valid, true);

  let readCount = 0;
  const resolved = await resolveEditorPreviewComponentRegistry({
    project: previewProject,
    requiredTypeIds: ["com.codogma.renderer.image", "com.codogma.renderer.text"],
    signal: new AbortController().signal,
    readAssetDocument: async () => {
      readCount += 1;
      throw new Error("Preview built-ins must not read synthetic Script Asset files.");
    },
  });
  assert.deepEqual(resolved.diagnostics, []);
  assert.equal(readCount, 0);
  assert.equal(resolved.registry?.typeIds.has("com.codogma.renderer.image"), true);
  assert.equal(resolved.registry?.typeIds.has("com.codogma.renderer.text"), true);
});


test("rejects TypeScript import-equals require declarations", async () => {
  const diagnostics = await inspectPreviewModuleSource(
    'import Runtime = require("./runtime"); export const componentDefinition = {};',
    "src/RequireEquals.ts",
  );
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0]?.message ?? "", /self-contained/);
});
