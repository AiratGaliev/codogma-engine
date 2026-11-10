import { afterAll, describe, expect, it } from "vitest";
import { build, type Plugin } from "vite";
import { brotliCompressSync } from "node:zlib";
import {
  analyzeProjectBuild, ComponentRegistry, ProjectSceneLoader,
  type ProjectBuildAnalysisInput, type ProjectBuildModuleImport, type ProjectBuildModuleSnapshot,
  type ProjectBuildOutputManifest, type ProjectDocumentV1, type SceneDocumentV1,
} from "@codogma/cge";
import {
  resolveFeatureSelection, type FeatureRegistryDocumentV1,
  type ProjectFeatureConfigurationV1, type InstalledFeaturePackage,
} from "@codogma/feature-registry";
import {
  compareHtml5BuildManifests, createDefaultHtml5BuildProfile,
  createHtml5BuildManifest, toProjectBuildOutputManifest,
  type Html5BuildArtifactFileInput, type Html5BuildManifestV1, type Html5BuildProfileV1,
} from "@codogma/html5-build";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { componentDefinition } from "../../../packages/cge/tests/fixtures/acceptance-project/src/FollowTarget";

interface CapturedChunk {
  readonly moduleIds: readonly string[];
  readonly includedNodeIds: readonly string[];
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = resolve(repositoryRoot, "src/editor/tests/fixtures/html5-game");
const projectRoot = resolve(repositoryRoot, "packages/cge/tests/fixtures/acceptance-project");
const temporaryRootPromise = import("node:fs/promises").then(({ mkdtemp }) =>
  mkdtemp(resolve(tmpdir(), "codogma-html5-build-")));
const generatedEvidence: Record<string, unknown> = {};

const featureRegistry = JSON.parse(readFileSync(resolve(fixtureRoot, "feature-registry.json"), "utf8")) as FeatureRegistryDocumentV1;
const projectFeatures = JSON.parse(readFileSync(resolve(fixtureRoot, "project-features.json"), "utf8")) as ProjectFeatureConfigurationV1;
const runtimePhaserManifest = JSON.parse(readFileSync(resolve(repositoryRoot, "packages/runtime-phaser/package.json"), "utf8")) as { name: string; version: string };
const installedFeaturePackages: readonly InstalledFeaturePackage[] = [{
  id: "pkg-runtime-phaser", name: runtimePhaserManifest.name, version: runtimePhaserManifest.version,
  scopes: ["runtime"], targets: ["html5"], compatible: true,
}];

function normalizeModuleId(sourceId: string): string {
  const withoutQuery = sourceId.split("?")[0] ?? sourceId;
  if (withoutQuery.startsWith(String.fromCharCode(0))) return "virtual:" + withoutQuery.slice(1);
  const normalized = withoutQuery.split(String.fromCharCode(92)).join("/");
  const path = relative(repositoryRoot, normalized).split(String.fromCharCode(92)).join("/");
  return path.startsWith("../") ? "external/" + path.split("/").slice(-2).join("/") : path;
}

function mapModuleId(moduleId: string): readonly string[] {
  if (moduleId.includes("packages/cge/dist/") || moduleId.includes("node_modules/@codogma/cge/dist/")) return ["package:pkg-cge"];
  if (moduleId.includes("packages/runtime-phaser/dist/") || moduleId.includes("node_modules/@codogma/runtime-phaser/")) return ["package:pkg-runtime-phaser"];
  if (moduleId.includes("node_modules/phaser/")) return ["package:pkg-phaser-engine"];
  if (moduleId.includes("node_modules/eventemitter3/")) return ["package:pkg-eventemitter3"];
  if (moduleId.endsWith("packages/cge/tests/fixtures/acceptance-project/src/FollowTarget.ts")) return ["module:follow-target"];
  if (moduleId.endsWith("src/editor/tests/fixtures/html5-game/src/main.ts")) return ["module:runtime-entry"];
  if (moduleId.endsWith("packages/cge/tests/fixtures/acceptance-project/scenes/Level.cge-scene.json")) return ["asset:asset-scene-level"];
  if (moduleId.endsWith("packages/cge/tests/fixtures/acceptance-project/assets/player.svg")) return ["asset:asset-player-sprite"];
  if (moduleId.endsWith("packages/cge/tests/fixtures/acceptance-project/project.json")) return ["module:project-document"];
  return [];
}

interface CapturedModuleImports { readonly staticImports: readonly string[]; readonly dynamicImports: readonly string[]; }

function createCapturePlugin(captured: Map<string, CapturedChunk>, moduleGraph?: Map<string, CapturedModuleImports>): Plugin {
  return {
    name: "codogma-html5-build-evidence",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        const rawModuleIds = Object.keys(output.modules);
        const moduleIds = [...new Set(rawModuleIds.map(normalizeModuleId))].sort();
        const includedNodeIds = [...new Set(moduleIds.flatMap(mapModuleId))].sort();
        if (moduleGraph) {
          for (const rawId of rawModuleIds) {
            const info = this.getModuleInfo(rawId);
            moduleGraph.set(normalizeModuleId(rawId), {
              staticImports: (info?.importedIds ?? []).map(normalizeModuleId),
              dynamicImports: (info?.dynamicallyImportedIds ?? []).map(normalizeModuleId),
            });
          }
        }
        captured.set(output.fileName, { moduleIds, includedNodeIds });
      }
    },
  };
}

async function collectFiles(outputDirectory: string, captured: ReadonlyMap<string, CapturedChunk>): Promise<Html5BuildArtifactFileInput[]> {
  const result: Html5BuildArtifactFileInput[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Build output must not contain symlinks: " + absolutePath);
      if (entry.isDirectory()) { await visit(absolutePath); continue; }
      if (!entry.isFile()) throw new Error("Build output contains an unsupported filesystem entry: " + absolutePath);
      const path = relative(outputDirectory, absolutePath).split(String.fromCharCode(92)).join("/");
      const contents = new Uint8Array(await readFile(absolutePath));
      const chunk = captured.get(path);
      const includedNodeIds = new Set(chunk?.includedNodeIds ?? []);
      if (path.endsWith(".svg")) includedNodeIds.add("asset:asset-player-sprite");
      result.push({
        path, contents, brotliBytes: brotliCompressSync(contents).byteLength,
        sourceModuleIds: chunk?.moduleIds ?? [], includedNodeIds: [...includedNodeIds],
      });
    }
  }
  await visit(outputDirectory);
  return result;
}

async function buildProfile(profile: Html5BuildProfileV1, label: string, moduleGraph?: Map<string, CapturedModuleImports>): Promise<Html5BuildManifestV1> {
  const temporaryRoot = await temporaryRootPromise;
  const outputDirectory = resolve(temporaryRoot, label);
  const captured = new Map<string, CapturedChunk>();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = profile.kind === "development" ? "development" : "production";
  try {
    await build({
      configFile: false, root: fixtureRoot, base: "./",
      mode: profile.kind === "release" ? "production" : "development",
      logLevel: "silent", plugins: [createCapturePlugin(captured, moduleGraph)],
      build: {
        outDir: outputDirectory, emptyOutDir: true, target: profile.ecmaTarget,
        minify: profile.minify, sourcemap: profile.sourceMaps, manifest: "manifest.json",
        assetsInlineLimit: 0,
      },
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const runtimeEntry = [...captured.entries()].find(([, chunk]) =>
    chunk.moduleIds.includes("src/editor/tests/fixtures/html5-game/src/main.ts")
  );
  if (!runtimeEntry) throw new Error("Bundler did not emit the native runtime entry module.");
  const runtimeEntryCode = await readFile(resolve(outputDirectory, runtimeEntry[0]), "utf8");
  const expectedProfileMarker = profile.kind === "development"
    ? "development|true|false"
    : "production|false|true";
  if (!runtimeEntryCode.includes(expectedProfileMarker)) {
    throw new Error("Bundled Vite environment does not match " + profile.kind + " profile: expected " + expectedProfileMarker);
  }
  const manifest = await createHtml5BuildManifest({
    profile, toolchain: { name: "vite", version: "8.3.5" },
    files: await collectFiles(outputDirectory, captured),
  });
  const artifactPath = process.env.CODOGMA_HTML5_BUILD_OUTPUT;
  if (profile.kind === "release" && label === "release-first" && artifactPath) {
    await rm(artifactPath, { recursive: true, force: true });
    await cp(outputDirectory, artifactPath, { recursive: true });
  }
  return manifest;
}

function createCoreAnalysisInput(
  outputManifest: ProjectBuildOutputManifest,
  featureSnapshots: NonNullable<ProjectBuildAnalysisInput["features"]>,
  moduleGraph: ReadonlyMap<string, CapturedModuleImports>,
): ProjectBuildAnalysisInput {
  const project = JSON.parse(readFileSync(resolve(projectRoot, "project.json"), "utf8")) as ProjectDocumentV1;
  const sceneAsset = project.assets.find((asset) => asset.kind === "scene");
  if (!sceneAsset) throw new Error("Acceptance Project fixture must register a Scene asset.");
  const scene = JSON.parse(readFileSync(resolve(projectRoot, sceneAsset.path), "utf8")) as SceneDocumentV1;
  const files = project.assets.map((asset) => ({
    path: asset.path, kind: "file" as const,
    sizeBytes: readFileSync(resolve(projectRoot, asset.path)).byteLength,
  }));
  const runtimeEntryPath = resolve(fixtureRoot, "src/main.ts");
  files.push({ path: "src/main.ts", kind: "file", sizeBytes: readFileSync(runtimeEntryPath).byteLength });
  const projectDocumentPath = resolve(projectRoot, "project.json");
  files.push({ path: "project.json", kind: "file", sizeBytes: readFileSync(projectDocumentPath).byteLength });

  const projectModules = [
    { sourceId: "src/editor/tests/fixtures/html5-game/src/main.ts", descriptor: { id: "runtime-entry", path: "src/main.ts", entryPoint: "runtime" as const } },
    { sourceId: "packages/cge/tests/fixtures/acceptance-project/project.json", descriptor: { id: "project-document", path: "project.json", entryPoint: "runtime" as const } },
    { sourceId: "packages/cge/tests/fixtures/acceptance-project/src/FollowTarget.ts", descriptor: { id: "follow-target", path: "src/FollowTarget.ts", assetId: "asset-follow-target-module", entryPoint: "component" as const } },
  ];
  const modules: ProjectBuildModuleSnapshot[] = projectModules.map(({ sourceId, descriptor }) => {
    const captured = moduleGraph.get(sourceId);
    if (!captured) throw new Error("Vite module graph omitted required Project module " + sourceId);
    const resolveImports = (values: readonly string[], kind: "static" | "dynamic"): ProjectBuildModuleImport[] => values.flatMap((specifier): ProjectBuildModuleImport[] => {
      const mapped = mapModuleId(specifier);
      const packageId = mapped.find((id) => id.startsWith("package:"));
      if (packageId) return [{ specifier, kind, resolvedPackageId: packageId.slice("package:".length) }];
      const moduleId = mapped.find((id) => id.startsWith("module:"));
      if (moduleId) return [{ specifier, kind, resolvedModuleId: moduleId.slice("module:".length) }];
      return [];
    });
    return { ...descriptor, imports: [
      ...resolveImports(captured.staticImports, "static"),
      ...resolveImports(captured.dynamicImports, "dynamic"),
    ] };
  });

  const workspaceDefinitions = [
    { id: "pkg-cge", path: "packages/cge/package.json", scope: "runtime" as const },
    { id: "pkg-runtime-phaser", path: "packages/runtime-phaser/package.json", scope: "runtime" as const },
    { id: "pkg-editor-host", path: "src/editor/package.json", scope: "editor" as const },
    { id: "pkg-html5-build", path: "packages/html5-build/package.json", scope: "build" as const },
    { id: "pkg-feature-registry", path: "packages/feature-registry/package.json", scope: "build" as const },
  ];
  const workspaceManifests = workspaceDefinitions.map((definition) => ({
    ...definition,
    manifest: JSON.parse(readFileSync(resolve(repositoryRoot, definition.path), "utf8")) as {
      name: string; version: string; dependencies?: Record<string,string>; peerDependencies?: Record<string,string>;
    },
  }));
  const lockfile = JSON.parse(readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8")) as {
    packages: Record<string, { version?: string; dependencies?: Record<string,string> }>;
  };
  const externalDefinitions = [
    { id: "pkg-phaser-engine", name: "phaser", scope: "runtime" as const, lockPath: "node_modules/phaser" },
    { id: "pkg-eventemitter3", name: "eventemitter3", scope: "runtime" as const, lockPath: "node_modules/eventemitter3" },
  ];
  const packageIdByName = new Map<string,string>();
  for (const item of workspaceManifests) packageIdByName.set(item.manifest.name, item.id);
  for (const item of externalDefinitions) packageIdByName.set(item.name, item.id);
  const packages = workspaceManifests.map(({ id, scope, manifest }) => ({
    id, name: manifest.name, version: manifest.version, scope,
    dependencies: Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).flatMap((name) => {
      const dependencyId = packageIdByName.get(name);
      return dependencyId ? [dependencyId] : [];
    }),
  }));
  for (const definition of externalDefinitions) {
    const record = lockfile.packages[definition.lockPath];
    if (!record?.version) throw new Error("Lockfile is missing " + definition.name);
    packages.push({
      id: definition.id,
      name: definition.name,
      version: record.version,
      scope: definition.scope,
      dependencies: Object.keys(record.dependencies ?? {}).flatMap((name) => {
        const dependencyId = packageIdByName.get(name);
        return dependencyId ? [dependencyId] : [];
      }),
    });
  }
  return {
    project, target: "html5", files,
    scenes: [{ assetId: sceneAsset.id, document: scene }], prefabs: [],
    componentSchemas: [componentDefinition.schema], modules, packages, features: featureSnapshots,
    coverage: { resourceReferences: true, moduleImports: true, packageDependencies: true, dynamicImports: true, externalRuntimeFiles: true },
    outputManifest,
  };
}

async function loadNativeAcceptanceScene(): Promise<void> {
  const project = JSON.parse(readFileSync(resolve(projectRoot, "project.json"), "utf8")) as ProjectDocumentV1;
  const sceneAsset = project.assets.find((asset) => asset.kind === "scene");
  if (!sceneAsset) throw new Error("Acceptance Project fixture must register a Scene asset.");
  const sceneText = readFileSync(resolve(projectRoot, sceneAsset.path), "utf8");
  const registry = new ComponentRegistry();
  registry.register(componentDefinition);
  const loader = new ProjectSceneLoader({
    project, registry,
    readAssetDocument: async (asset) => {
      if (asset.id !== sceneAsset.id) throw new Error("Unexpected Scene asset requested by fixture loader.");
      return sceneText;
    },
  });
  const session = await loader.load({ sceneId: project.scenes[0]?.id ?? "", signal: new AbortController().signal });
  try {
    session.activate();
    expect(session.graph.rootNodes).toHaveLength(2);
    expect(session.world.listComponents()).toHaveLength(2);
    expect(session.graph.getNode("node-player")).toBeDefined();
  } finally {
    await session.dispose();
  }
}

afterAll(async () => {
  const evidencePath = process.env.CODOGMA_HTML5_BUILD_EVIDENCE;
  if (evidencePath) {
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, JSON.stringify(generatedEvidence, null, 2) + "\n", "utf8");
  }
  await rm(await temporaryRootPromise, { recursive: true, force: true });
});

describe("independent HTML5 Vite artifact fixture", () => {
  it("repeats Development and Release builds with stable output hashes and module composition", async () => {
    await loadNativeAcceptanceScene();
    const featureInput = {
      registry: featureRegistry, project: projectFeatures,
      installedPackages: installedFeaturePackages, target: "html5", scope: "runtime" as const,
    };
    const featureReport = resolveFeatureSelection(featureInput);
    const repeatedFeatureReport = resolveFeatureSelection(featureInput);
    expect(featureReport.valid, JSON.stringify(featureReport.diagnostics)).toBe(true);
    expect(featureReport).toEqual(repeatedFeatureReport);
    expect(featureReport.includedFeatureIds).toEqual(["runtime.core", "runtime.phaser"]);
    expect(featureReport.excludedFeatureIds).toEqual(["runtime.ecs", "runtime.ecs-phaser"]);

    const releaseModuleGraph = new Map<string, CapturedModuleImports>();
    const results: Record<string, Html5BuildManifestV1> = {};
    for (const kind of ["development", "release"] as const) {
      const profile = createDefaultHtml5BuildProfile(kind);
      const first = await buildProfile(profile, kind + "-first", kind === "release" ? releaseModuleGraph : undefined);
      const second = await buildProfile(profile, kind + "-second");
      const comparison = compareHtml5BuildManifests(first, second);
      expect(comparison.reproducible, JSON.stringify(comparison.differences)).toBe(true);
      expect(first.totals.fileCount).toBeGreaterThan(1);
      expect(first.files.every((file) => Number.isSafeInteger(file.brotliBytes))).toBe(true);
      expect(first.files.some((file) => file.path.endsWith(".js"))).toBe(true);
      expect(first.files.some((file) => file.path.endsWith(".svg"))).toBe(true);
      if (kind === "release") {
        expect(first.files.some((file) => file.includedNodeIds.includes("package:pkg-runtime-phaser"))).toBe(true);
        expect(first.files.some((file) => file.includedNodeIds.includes("package:pkg-phaser-engine"))).toBe(true);
      }
      expect(first.files.some((file) =>
        file.sourceModuleIds.some((id) => id.endsWith("packages/cge/tests/fixtures/acceptance-project/src/FollowTarget.ts"))
      )).toBe(true);
      expect(first.files.every((file) =>
        file.sourceModuleIds.every((id) => !id.includes("src/editor/src/"))
      )).toBe(true);
      if (kind === "development") {
        expect(first.files.some((file) => file.path.endsWith(".js.map"))).toBe(true);
      } else {
        expect(first.files.some((file) => file.path.endsWith(".js.map"))).toBe(false);
      }
      results[kind] = first;
      generatedEvidence[kind] = { manifest: first, comparison };
    }

    const release = results.release;
    if (!release) throw new Error("Release profile did not produce an HTML5 artifact manifest.");
    const releaseManifest = toProjectBuildOutputManifest(release);
    const analysisInput = createCoreAnalysisInput(releaseManifest, featureReport.buildAnalysisFeatures, releaseModuleGraph);
    const analysis = analyzeProjectBuild(analysisInput);
    expect(analysis.valid, JSON.stringify(analysis.diagnostics)).toBe(true);
    expect(analysis.report.output.status).toBe("measured");
    expect(analysis.report.includedPackages).toContain("@codogma/cge@0.1.0");
    expect(analysis.report.includedPackages).toContain("@codogma/runtime-phaser@0.1.0");
    expect(analysis.report.includedPackages).toContain("phaser@4.2.1");
    for (const excludedPackage of [
      "@codogma/editor-host",
      "@codogma/html5-build",
      "@codogma/feature-registry",
    ]) {
      expect(analysis.report.includedPackages.some((name) => name.startsWith(excludedPackage + "@"))).toBe(false);
    }
    expect(analysis.report.includedFeatures).toContain("runtime.core");
    expect(analysis.report.includedFeatures).toContain("runtime.phaser");
    expect(analysis.report.includedFeatures).not.toContain("runtime.ecs");
    expect(analysis.report.includedFeatures).not.toContain("runtime.ecs-phaser");
    expect(analysis.report.includedAssets).toContain("asset-player-sprite");
    expect(analysis.report.includedModules).toContain("runtime-entry");
    expect(analysis.report.includedModules).toContain("project-document");
    expect(analysis.report.includedModules).toContain("follow-target");

    const originalScene = analysisInput.scenes[0];
    if (!originalScene) throw new Error("Core analysis input omitted the Scene document.");
    const unknownTypeScene = JSON.parse(JSON.stringify(originalScene.document)) as SceneDocumentV1;
    const firstComponent = unknownTypeScene.rootNodes[0]?.components[0];
    if (!firstComponent) throw new Error("Acceptance Scene fixture omitted its first Component.");
    firstComponent.typeId = "com.codogma.missing.component";
    const unknownComponent = analyzeProjectBuild({
      ...analysisInput,
      scenes: [{ assetId: originalScene.assetId, document: unknownTypeScene }],
    });
    expect(unknownComponent.valid, "unknown Component type was not rejected").toBe(false);

    const missingComponentModule = analyzeProjectBuild({
      ...analysisInput,
      modules: (analysisInput.modules ?? []).filter((module) => module.id !== "follow-target"),
    });
    expect(missingComponentModule.valid, "missing Component module was not rejected").toBe(false);

    const missingAsset = analyzeProjectBuild({
      ...analysisInput,
      files: analysisInput.files.filter((file) => file.path !== "assets/player.svg"),
    });
    expect(missingAsset.valid, "missing referenced asset was not rejected").toBe(false);

    const unresolvedImport = analyzeProjectBuild({
      ...analysisInput,
      modules: (analysisInput.modules ?? []).map((module) => module.id === "runtime-entry"
        ? {
            ...module,
            imports: [
              ...(module.imports ?? []),
              { specifier: "@codogma/not-installed", kind: "static" as const, resolvedPackageId: "pkg-not-installed" },
            ],
          }
        : module),
    });
    expect(unresolvedImport.valid, "unresolved package import was not rejected").toBe(false);

    generatedEvidence.releaseDiagnostics = {
      unknownComponent: unknownComponent.diagnostics.map((item) => item.code),
      missingComponentModule: missingComponentModule.diagnostics.map((item) => item.code),
      missingAsset: missingAsset.diagnostics.map((item) => item.code),
      unresolvedImport: unresolvedImport.diagnostics.map((item) => item.code),
    };

    const editorLeak = {
      ...releaseManifest,
      files: [...releaseManifest.files, {
        path: "assets/editor-leak.js", sizeBytes: 1, gzipBytes: 1,
        includesNodeIds: ["package:pkg-editor-host"],
      }],
    };
    const rejectedEditorLeak = analyzeProjectBuild(createCoreAnalysisInput(editorLeak, featureReport.buildAnalysisFeatures, releaseModuleGraph));
    expect(rejectedEditorLeak.valid).toBe(false);
    expect(rejectedEditorLeak.diagnostics.some((item) => item.code === "PROJECT_BUILD_OUTPUT_SCOPE_LEAK")).toBe(true);

    const excludedPackageLeakResults = new Map<string, ReturnType<typeof analyzeProjectBuild>>();
    for (const packageId of [
      "pkg-html5-build",
      "pkg-feature-registry",
    ]) {
      const leakedManifest = {
        ...releaseManifest,
        files: [...releaseManifest.files, {
          path: "assets/" + packageId + "-leak.js",
          sizeBytes: 1,
          gzipBytes: 1,
          includesNodeIds: ["package:" + packageId],
        }],
      };
      const result = analyzeProjectBuild(createCoreAnalysisInput(leakedManifest, featureReport.buildAnalysisFeatures, releaseModuleGraph));
      expect(result.valid, packageId + " was not rejected").toBe(false);
      excludedPackageLeakResults.set(packageId, result);
    }

    generatedEvidence.featureSelection = featureReport;
    generatedEvidence.releaseCoreAnalysis = analysis.report;
    generatedEvidence.editorOnlyLeakNegativeCase = {
      rejected: !rejectedEditorLeak.valid,
      diagnosticCodes: rejectedEditorLeak.diagnostics.map((item) => item.code),
    };
    generatedEvidence.excludedPackageLeakNegativeCases = Object.fromEntries(
      [...excludedPackageLeakResults.entries()].map(([id, result]) => [
        id,
        { rejected: !result.valid, diagnosticCodes: result.diagnostics.map((item) => item.code) },
      ])
    );
  }, 60000);
});
