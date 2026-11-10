import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import test from "node:test";
import {
  analyzeProjectBuild,
  type ProjectBuildAnalysisInput,
  type ProjectBuildFileSnapshot,
  type ProjectBuildModuleSnapshot,
  type ProjectBuildPackageSnapshot,
} from "../src/index.js";
import type { ProjectDocumentV1 } from "../src/project-model/contracts.js";
import type { ComponentTypeSchemaV1 } from "../src/components/component-schema.js";
import { componentDefinition } from "./fixtures/acceptance-project/src/FollowTarget.js";

const projectRoot = resolve(process.cwd(), "tests/fixtures/acceptance-project");
const readProjectFile = (relativePath: string): string => {
  const absolutePath = resolve(projectRoot, relativePath);
  assert.ok(
    absolutePath.startsWith(projectRoot + sep),
    "Fixture paths must stay inside the acceptance project.",
  );
  return readFileSync(absolutePath, "utf8");
};
const readJson = (relativePath: string): unknown => JSON.parse(readProjectFile(relativePath));
const fixtureProject = readJson("project.json") as ProjectDocumentV1;
const fixtureSceneAsset = fixtureProject.assets.find((asset) => asset.kind === "scene");
if (!fixtureSceneAsset) {
  throw new Error("Acceptance project fixture must register a Scene asset.");
}
const fixtureSceneAssetId = fixtureSceneAsset.id;
const fixtureScene = readJson(fixtureSceneAsset.path);
const fixtureComponentSchema: ComponentTypeSchemaV1 = componentDefinition.schema;

function makeInput(
  overrides: Partial<ProjectBuildAnalysisInput> = {},
): ProjectBuildAnalysisInput {
  const files: ProjectBuildFileSnapshot[] = fixtureProject.assets.map((asset) => {
    const absolutePath = resolve(projectRoot, asset.path);
    assert.ok(
      absolutePath.startsWith(projectRoot + sep),
      "Fixture asset paths must stay inside the acceptance project.",
    );
    return {
      path: asset.path,
      kind: "file",
      sizeBytes: statSync(absolutePath).size,
    };
  });
  const modules: ProjectBuildModuleSnapshot[] = fixtureProject.componentModules.map((module) => {
    const asset = fixtureProject.assets.find((item) => item.id === module.moduleAssetId);
    assert.ok(asset);
    return {
      id: "module-follow-target",
      assetId: asset.id,
      path: asset.path,
      entryPoint: "component",
    };
  });

  return {
    project: structuredClone(fixtureProject),
    target: "web",
    files,
    scenes: [{ assetId: fixtureSceneAssetId, document: structuredClone(fixtureScene) }],
    prefabs: [],
    componentSchemas: [fixtureComponentSchema],
    modules,
    coverage: {
      resourceReferences: true,
      moduleImports: true,
      packageDependencies: true,
      dynamicImports: true,
      externalRuntimeFiles: true,
    },
    ...overrides,
  };
}

function hasDiagnostic(result: ReturnType<typeof analyzeProjectBuild>, code: string): boolean {
  return result.diagnostics.some((item) => item.code === code);
}

test("build analysis validates the native acceptance project and builds a deterministic asset/module graph", () => {
  const first = analyzeProjectBuild(makeInput());
  const second = analyzeProjectBuild(makeInput());

  assert.equal(first.valid, true, JSON.stringify(first.diagnostics));
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(first.graph.nodes, second.graph.nodes);
  assert.deepEqual(first.graph.edges, second.graph.edges);
  assert.deepEqual(first.report.includedAssets, [
    "asset-follow-target-module",
    "asset-player-sprite",
    "asset-scene-level",
  ]);
  assert.deepEqual(first.report.includedModules, ["module-follow-target"]);
  assert.ok(first.graph.edges.some((edge) =>
    edge.from === "scene:scene-level" &&
    edge.to === "module:module-follow-target" &&
    edge.kind === "imports",
  ));
  assert.ok(first.graph.edges.some((edge) =>
    edge.from === "scene:scene-level" &&
    edge.to === "asset:asset-player-sprite" &&
    edge.kind === "references",
  ));
  assert.equal(first.report.output.status, "not-produced");
});

test("build validation reports a registered asset that is absent from the host file snapshot", () => {
  const input = makeInput();
  input.files = input.files.filter((file) => file.path !== "assets/player.svg");

  const result = analyzeProjectBuild(input);

  assert.equal(result.valid, false);
  assert.ok(hasDiagnostic(result, "PROJECT_BUILD_FILE_MISSING"));
  assert.ok(result.diagnostics.some((item) =>
    item.code === "PROJECT_BUILD_FILE_MISSING" &&
    item.source?.kind === "asset" &&
    item.source.id === "asset-player-sprite" &&
    item.path === "assets/player.svg",
  ));
});

test("build validation detects path collisions even when Asset IDs differ", () => {
  const input = makeInput();
  const project = input.project as ProjectDocumentV1;
  project.assets.push({
    id: "asset-player-sprite-copy",
    path: "assets/player.svg",
    kind: "image",
  });

  const result = analyzeProjectBuild(input);

  assert.equal(result.valid, false);
  assert.ok(hasDiagnostic(result, "PROJECT_BUILD_PATH_CONFLICT"));
});

test("duplicate project IDs are rejected before a graph can be produced", () => {
  const input = makeInput();
  const project = input.project as ProjectDocumentV1;
  project.assets.push({
    id: "asset-player-sprite",
    path: "assets/another.svg",
    kind: "image",
  });

  const result = analyzeProjectBuild(input);

  assert.equal(result.valid, false);
  assert.ok(hasDiagnostic(result, "PROJECT_DUPLICATE_ID"));
  assert.deepEqual(result.graph.nodes, []);
});

test("unreferenced assets are warnings only when every reference scanner reports complete coverage", () => {
  const complete = makeInput();
  const completeProject = complete.project as ProjectDocumentV1;
  completeProject.assets.push({
    id: "asset-unused-audio",
    path: "assets/unused-audio.ogg",
    kind: "audio",
  });
  complete.files = [...complete.files, {
    path: "assets/unused-audio.ogg",
    kind: "file",
    sizeBytes: 256,
  }];

  const completeResult = analyzeProjectBuild(complete);
  assert.equal(completeResult.valid, true);
  assert.deepEqual(completeResult.report.unusedAssets, ["asset-unused-audio"]);
  assert.ok(completeResult.diagnostics.some((item) =>
    item.code === "PROJECT_BUILD_RESOURCE_UNUSED" && item.severity === "warning",
  ));
  assert.ok(completeResult.graph.excludedNodes.some((item) =>
    item.nodeId === "asset:asset-unused-audio" &&
    item.reason === "unreferenced-resource",
  ));

  const incomplete = makeInput({
    project: structuredClone(completeProject),
    files: [...complete.files],
    coverage: {
      resourceReferences: true,
      moduleImports: true,
      packageDependencies: false,
      dynamicImports: true,
      externalRuntimeFiles: true,
    },
  });
  const incompleteResult = analyzeProjectBuild(incomplete);
  assert.deepEqual(incompleteResult.report.unusedAssets, []);
  assert.ok(hasDiagnostic(incompleteResult, "PROJECT_BUILD_REFERENCE_SCAN_INCOMPLETE"));
  assert.ok(incompleteResult.graph.excludedNodes.some((item) =>
    item.nodeId === "asset:asset-unused-audio" &&
    item.reason === "reference-scan-incomplete",
  ));
});

test("static module imports and declared package dependencies form one transitive production graph", () => {
  const packages: ProjectBuildPackageSnapshot[] = [
    {
      id: "pkg-phaser-root",
      name: "phaser",
      version: "4.2.1",
      scope: "runtime",
      dependencies: ["pkg-eventemitter-root"],
    },
    {
      id: "pkg-eventemitter-root",
      name: "eventemitter3",
      version: "5.0.1",
      scope: "runtime",
      dependencies: [],
    },
    {
      id: "pkg-codogma-ecs",
      name: "@codogma/ecs",
      version: "0.1.0",
      scope: "runtime",
      dependencies: [],
    },
  ];
  const input = makeInput({
    packages,
    modules: [{
      id: "module-follow-target",
      assetId: "asset-follow-target-module",
      path: "src/FollowTarget.ts",
      entryPoint: "component",
      imports: [{ specifier: "phaser", kind: "static", resolvedPackageId: "pkg-phaser-root" }],
    }],
    features: [{
      id: "runtime.ecs",
      providerPackageId: "pkg-codogma-ecs",
      selected: false,
      available: true,
      targetCompatible: true,
    }],
  });

  const result = analyzeProjectBuild(input);

  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.ok(result.report.includedPackages.includes("phaser@4.2.1"));
  assert.ok(result.report.includedPackages.includes("eventemitter3@5.0.1"));
  assert.ok(!result.report.includedPackages.some((name) => name.startsWith("@codogma/ecs@")));
  assert.ok(result.graph.excludedNodes.some((item) =>
    item.nodeId === "package:pkg-codogma-ecs" &&
    item.reason === "feature-not-selected",
  ));
});

test("incomplete package discovery downgrades unresolved package references to warnings", () => {
  const result = analyzeProjectBuild(makeInput({
    packages: [{
      id: "pkg-phaser-root",
      name: "phaser",
      version: "4.2.1",
      scope: "runtime",
      dependencies: ["pkg-eventemitter-missing"],
    }],
    modules: [{
      id: "module-follow-target",
      assetId: "asset-follow-target-module",
      path: "src/FollowTarget.ts",
      entryPoint: "component",
      imports: [{ specifier: "phaser", kind: "static", resolvedPackageId: "pkg-phaser-root" }],
    }],
    coverage: {
      resourceReferences: true,
      moduleImports: true,
      packageDependencies: false,
      dynamicImports: true,
      externalRuntimeFiles: true,
    },
  }));

  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.ok(result.diagnostics.some((item) =>
    item.code === "PROJECT_BUILD_PACKAGE_DEPENDENCY_MISSING" &&
    item.severity === "warning" &&
    item.source?.id === "pkg-phaser-root",
  ));
  assert.ok(hasDiagnostic(result, "PROJECT_BUILD_REFERENCE_SCAN_INCOMPLETE"));
});

test("an undeclared dynamic import blocks the build; the matching explicit entry point resolves it", () => {
  const modules: ProjectBuildModuleSnapshot[] = [{
    id: "module-follow-target",
    assetId: "asset-follow-target-module",
    path: "src/FollowTarget.ts",
    entryPoint: "component",
    imports: [{ specifier: "./optional-runtime.js", kind: "dynamic", resolvedPackageId: "pkg-optional-runtime" }],
  }];
  const packages: ProjectBuildPackageSnapshot[] = [{
    id: "pkg-optional-runtime",
    name: "optional-runtime",
    version: "1.0.0",
    scope: "runtime",
    dependencies: [],
  }];
  const unresolved = analyzeProjectBuild(makeInput({ modules, packages }));
  assert.equal(unresolved.valid, false);
  assert.ok(hasDiagnostic(unresolved, "PROJECT_BUILD_DYNAMIC_ENTRY_UNDECLARED"));

  const resolved = analyzeProjectBuild(makeInput({
    modules,
    packages,
    dynamicEntryPoints: [{
      sourceModuleId: "module-follow-target",
      specifier: "./optional-runtime.js",
      targetPackageId: "pkg-optional-runtime",
    }],
  }));
  assert.equal(resolved.valid, true, JSON.stringify(resolved.diagnostics));
  assert.ok(resolved.report.includedPackages.includes("optional-runtime@1.0.0"));
});

test("production graph rejects editor-only packages imported by runtime modules", () => {
  const result = analyzeProjectBuild(makeInput({
    packages: [{
      id: "pkg-editor-only",
      name: "@codogma/editor-only",
      version: "1.0.0",
      scope: "editor",
      dependencies: [],
    }],
    modules: [{
      id: "module-follow-target",
      assetId: "asset-follow-target-module",
      path: "src/FollowTarget.ts",
      entryPoint: "component",
      imports: [{
        specifier: "@codogma/editor-only",
        kind: "static",
        resolvedPackageId: "pkg-editor-only",
      }],
    }],
  }));

  assert.equal(result.valid, false);
  assert.ok(hasDiagnostic(result, "PROJECT_BUILD_PACKAGE_SCOPE_INVALID"));
  assert.ok(!result.report.includedPackages.some((name) => name.startsWith("@codogma/editor-only@")));
});

test("npm package graph preserves multiple installed versions of the same package", () => {
  const base = makeInput();
  const result = analyzeProjectBuild(makeInput({
    files: [...base.files, {
      path: "src/Secondary.ts",
      kind: "file",
      sizeBytes: 128,
    }],
    packages: [
      {
        id: "pkg-lodash-v4",
        name: "lodash",
        version: "4.17.21",
        scope: "runtime",
        dependencies: [],
      },
      {
        id: "pkg-lodash-v3",
        name: "lodash",
        version: "3.10.1",
        scope: "runtime",
        dependencies: [],
      },
    ],
    modules: [
      {
        id: "module-follow-target",
        assetId: "asset-follow-target-module",
        path: "src/FollowTarget.ts",
        entryPoint: "component",
        imports: [
          { specifier: "lodash", kind: "static", resolvedPackageId: "pkg-lodash-v4" },
          { specifier: "./Secondary.js", kind: "static", resolvedModuleId: "module-secondary" },
        ],
      },
      {
        id: "module-secondary",
        path: "src/Secondary.ts",
        imports: [
          { specifier: "lodash", kind: "static", resolvedPackageId: "pkg-lodash-v3" },
        ],
      },
    ],
  }));

  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.report.includedPackageInstances.map((item) => [item.id, item.name, item.version]),
    [
      ["pkg-lodash-v3", "lodash", "3.10.1"],
      ["pkg-lodash-v4", "lodash", "4.17.21"],
    ],
  );
  assert.ok(result.graph.includedNodeIds.includes("package:pkg-lodash-v3"));
  assert.ok(result.graph.includedNodeIds.includes("package:pkg-lodash-v4"));
});

test("feature provider inclusion requires an explicitly selected available provider", () => {
  const result = analyzeProjectBuild(makeInput({
    packages: [{
      id: "pkg-codogma-ecs",
      name: "@codogma/ecs",
      version: "0.1.0",
      scope: "runtime",
      dependencies: [],
    }],
    features: [{
      id: "runtime.ecs",
      providerPackageId: "pkg-codogma-ecs",
      selected: true,
      available: false,
      targetCompatible: true,
    }],
  }));

  assert.equal(result.valid, false);
  assert.ok(hasDiagnostic(result, "PROJECT_BUILD_FEATURE_PROVIDER_MISSING"));
  assert.ok(!result.report.includedFeatures.includes("runtime.ecs"));
  assert.ok(result.graph.excludedNodes.some((item) =>
    item.nodeId === "feature:runtime.ecs" &&
    item.reason === "provider-unavailable",
  ));
});

test("built-in features are graph roots and do not require a fictitious npm package", () => {
  const result = analyzeProjectBuild(makeInput({
    features: [{
      id: "editor.inspector",
      providerKind: "builtin",
      selected: true,
      available: true,
      targetCompatible: true,
    }],
  }));

  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.ok(result.report.includedFeatures.includes("editor.inspector"));
  assert.ok(result.graph.includedNodeIds.includes("feature:editor.inspector"));
  assert.ok(!result.report.includedPackages.some((name) => name.includes("editor.inspector")));
});

test("a multi-provider feature includes every exact npm provider package instance", () => {
  const result = analyzeProjectBuild(makeInput({
    packages: [
      { id: "pkg-ecs", name: "@codogma/ecs", version: "0.1.0", scope: "runtime", dependencies: [] },
      { id: "pkg-ecs-phaser", name: "@codogma/ecs-phaser", version: "0.1.0", scope: "runtime", dependencies: [] },
    ],
    features: [{
      id: "runtime.ecs-phaser",
      providerKind: "package",
      providerPackageIds: ["pkg-ecs", "pkg-ecs-phaser"],
      selected: true,
      available: true,
      targetCompatible: true,
    }],
  }));

  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.ok(result.report.includedFeatures.includes("runtime.ecs-phaser"));
  assert.ok(result.report.includedPackages.includes("@codogma/ecs@0.1.0"));
  assert.ok(result.report.includedPackages.includes("@codogma/ecs-phaser@0.1.0"));
  assert.ok(result.graph.edges.some((edge) => edge.from === "feature:runtime.ecs-phaser" && edge.to === "package:pkg-ecs" && edge.kind === "provides"));
  assert.ok(result.graph.edges.some((edge) => edge.from === "feature:runtime.ecs-phaser" && edge.to === "package:pkg-ecs-phaser" && edge.kind === "provides"));
});

test("unselected multi-provider features explain exclusion for each installed provider package", () => {
  const result = analyzeProjectBuild(makeInput({
    packages: [
      { id: "pkg-ecs", name: "@codogma/ecs", version: "0.1.0", scope: "runtime", dependencies: [] },
      { id: "pkg-ecs-phaser", name: "@codogma/ecs-phaser", version: "0.1.0", scope: "runtime", dependencies: [] },
    ],
    features: [{
      id: "runtime.ecs-phaser",
      providerKind: "package",
      providerPackageIds: ["pkg-ecs", "pkg-ecs-phaser"],
      selected: false,
      available: true,
      targetCompatible: true,
    }],
  }));

  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.ok(result.graph.excludedNodes.some((item) => item.nodeId === "package:pkg-ecs" && item.reason === "feature-not-selected"));
  assert.ok(result.graph.excludedNodes.some((item) => item.nodeId === "package:pkg-ecs-phaser" && item.reason === "feature-not-selected"));
});

test("rejects contradictory built-in and npm package provider metadata", () => {
  const result = analyzeProjectBuild(makeInput({
    packages: [{ id: "pkg-ecs", name: "@codogma/ecs", version: "0.1.0", scope: "runtime", dependencies: [] }],
    features: [{
      id: "runtime.ecs",
      providerKind: "builtin",
      providerPackageId: "pkg-ecs",
      selected: true,
      available: true,
      targetCompatible: true,
    }],
  }));

  assert.equal(result.valid, false);
  assert.ok(hasDiagnostic(result, "PROJECT_BUILD_GRAPH_INVALID"));
});

test("external runtime file references are part of reachability and unavailable required files block build", () => {
  const available = analyzeProjectBuild(makeInput({
    runtimeFiles: [{
      id: "phaser-runtime",
      path: "vendor/phaser.min.js",
      available: true,
      required: false,
      referencedByNodeIds: ["module:module-follow-target"],
      sizeBytes: 1024,
    }],
  }));
  assert.equal(available.valid, true, JSON.stringify(available.diagnostics));
  assert.ok(available.graph.includedNodeIds.includes("runtime-file:phaser-runtime"));
  assert.ok(available.graph.edges.some((edge) =>
    edge.from === "module:module-follow-target" &&
    edge.to === "runtime-file:phaser-runtime" &&
    edge.kind === "references",
  ));

  const missing = analyzeProjectBuild(makeInput({
    runtimeFiles: [{
      id: "phaser-runtime",
      path: "vendor/phaser.min.js",
      available: false,
      required: true,
    }],
  }));
  assert.equal(missing.valid, false);
  assert.ok(hasDiagnostic(missing, "PROJECT_BUILD_RUNTIME_FILE_MISSING"));
});

test("actual production output manifests report raw and compressed sizes and emitted graph nodes", () => {
  const input = makeInput();
  input.outputManifest = {
    production: true,
    target: "web",
    toolchain: "fixture-bundler@1.0.0",
    files: [{
      path: "dist/index.html",
      sizeBytes: 100,
      gzipBytes: 40,
      brotliBytes: 35,
      includesNodeIds: [
        "asset:asset-scene-level",
        "asset:asset-player-sprite",
        "module:module-follow-target",
      ],
    }],
  };

  const result = analyzeProjectBuild(input);

  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.equal(result.report.output.status, "measured");
  if (result.report.output.status !== "measured") {
    assert.fail("Expected a measured output report.");
  }
  assert.equal(result.report.output.fileCount, 1);
  assert.equal(result.report.output.rawBytes, 100);
  assert.equal(result.report.output.gzipBytes, 40);
  assert.equal(result.report.output.brotliBytes, 35);
  assert.ok(result.graph.nodes.some((node) => node.id === "output:dist/index.html"));
  assert.ok(result.graph.edges.some((edge) =>
    edge.from === "module:module-follow-target" &&
    edge.to === "output:dist/index.html" &&
    edge.kind === "emits",
  ));
});

test("invalid output manifests never produce a measured bundle size", () => {
  const input = makeInput();
  input.outputManifest = {
    production: true,
    target: "web",
    toolchain: "fixture-bundler@1.0.0",
    files: [{
      path: "../outside.js",
      sizeBytes: 100,
      includesNodeIds: [],
    }],
  };

  const result = analyzeProjectBuild(input);

  assert.equal(result.valid, false);
  assert.equal(result.report.output.status, "not-produced");
  assert.ok(hasDiagnostic(result, "PROJECT_BUILD_OUTPUT_INVALID"));
});
