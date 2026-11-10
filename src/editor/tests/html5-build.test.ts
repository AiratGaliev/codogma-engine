import { afterAll, describe, expect, it } from "vitest";
import { build, type Plugin } from "vite";
import { brotliCompressSync } from "node:zlib";
import {
  analyzeProjectBuild, ProjectSceneLoader, resolveProjectComponentRegistry,
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
const acceptanceProject = JSON.parse(readFileSync(resolve(projectRoot, "project.json"), "utf8")) as ProjectDocumentV1;
const temporaryRootPromise = import("node:fs/promises").then(({ mkdtemp }) =>
  mkdtemp(resolve(tmpdir(), "codogma-html5-build-")));
const generatedEvidence: Record<string, unknown> = {};


const sourceMapsByBuildLabel = new Map<string, Map<string, string>>();

function summarizeSourceMapDifference(firstLabel: string, secondLabel: string, path: string): Record<string, unknown> {
  const firstText = sourceMapsByBuildLabel.get(firstLabel)?.get(path);
  const secondText = sourceMapsByBuildLabel.get(secondLabel)?.get(path);
  if (!firstText || !secondText) return { available: false };
  const first = JSON.parse(firstText) as {
    file?: string; sourceRoot?: string; sources?: string[]; names?: string[];
    mappings?: string; sourcesContent?: Array<string | null>;
  };
  const second = JSON.parse(secondText) as typeof first;
  let rawOffset = 0;
  while (rawOffset < firstText.length && rawOffset < secondText.length
    && firstText[rawOffset] === secondText[rawOffset]) rawOffset += 1;
  const firstRaw = JSON.parse(firstText) as Record<string, unknown>;
  const secondRaw = JSON.parse(secondText) as Record<string, unknown>;
  const extraKeys = [...new Set([...Object.keys(firstRaw), ...Object.keys(secondRaw)])]
    .filter((key) => !["file", "sourceRoot", "sources", "names", "mappings", "sourcesContent"].includes(key))
    .sort();
  const extraKeyDifferences = extraKeys.flatMap((key) =>
    JSON.stringify(firstRaw[key]) === JSON.stringify(secondRaw[key])
      ? []
      : [{ key, first: firstRaw[key], second: secondRaw[key] }],
  );
  const contentChanges = (first.sourcesContent ?? []).flatMap((left, index) => {
    const right = second.sourcesContent?.[index];
    if (left === right) return [];
    const a = left ?? "";
    const b = right ?? "";
    let offset = 0;
    while (offset < a.length && offset < b.length && a[offset] === b[offset]) offset += 1;
    return [{
      source: first.sources?.[index] ?? String(index),
      firstLength: a.length,
      secondLength: b.length,
      firstDifference: offset,
      firstContext: a.slice(Math.max(0, offset - 80), offset + 120),
      secondContext: b.slice(Math.max(0, offset - 80), offset + 120),
    }];
  });
  const firstMappings = first.mappings ?? "";
  const secondMappings = second.mappings ?? "";
  let mappingOffset = 0;
  while (mappingOffset < firstMappings.length && mappingOffset < secondMappings.length
    && firstMappings[mappingOffset] === secondMappings[mappingOffset]) mappingOffset += 1;
  return {
    firstBytes: firstText.length,
    secondBytes: secondText.length,
    rawOffset,
    firstRawContext: firstText.slice(Math.max(0, rawOffset - 120), rawOffset + 180),
    secondRawContext: secondText.slice(Math.max(0, rawOffset - 120), rawOffset + 180),
    firstKeys: Object.keys(firstRaw),
    secondKeys: Object.keys(secondRaw),
    extraKeyDifferences,
    fileEqual: first.file === second.file,
    sourceRootEqual: first.sourceRoot === second.sourceRoot,
    sourcesEqual: JSON.stringify(first.sources) === JSON.stringify(second.sources),
    firstSources: first.sources,
    secondSources: second.sources,
    namesEqual: JSON.stringify(first.names) === JSON.stringify(second.names),
    firstNamesCount: first.names?.length ?? 0,
    secondNamesCount: second.names?.length ?? 0,
    mappingsEqual: firstMappings === secondMappings,
    firstMappingsLength: firstMappings.length,
    secondMappingsLength: secondMappings.length,
    mappingOffset,
    firstMappingContext: firstMappings.slice(Math.max(0, mappingOffset - 80), mappingOffset + 120),
    secondMappingContext: secondMappings.slice(Math.max(0, mappingOffset - 80), mappingOffset + 120),
    contentChanges,
  };
}

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
  if (moduleId.endsWith("node_modules/phaser/dist/phaser.min.js")) return ["package:pkg-phaser-full-umd"];
  if (moduleId.endsWith("node_modules/phaser/dist/phaser-arcade-physics.min.js")) return ["package:pkg-phaser-arcade-umd"];
  if (moduleId === "virtual:vite/preload-helper.js") return ["module:vite-preload-helper"];
  if (moduleId === "virtual:vite/modulepreload-polyfill.js") return ["module:vite-modulepreload-polyfill"];
  const componentModule = acceptanceProject.componentModules.find((reference) => {
    const asset = acceptanceProject.assets.find((candidate) => candidate.id === reference.moduleAssetId);
    return asset !== undefined && moduleId.endsWith(
      "packages/cge/tests/fixtures/acceptance-project/" + asset.path,
    );
  });
  if (componentModule) return ["module:component-" + componentModule.typeId];
  if (
    moduleId.endsWith("src/editor/tests/fixtures/html5-game/src/main.ts") ||
    moduleId.endsWith("src/editor/tests/fixtures/html5-game/src/main-arcade.ts") ||
    moduleId.endsWith("src/editor/tests/fixtures/html5-game/index.html") ||
    moduleId.endsWith("src/editor/tests/fixtures/html5-game/index-arcade.html")
  ) return ["module:runtime-entry"];
  if (moduleId.endsWith("src/editor/tests/fixtures/html5-game/src/runtime.ts")) return ["module:runtime-scene"];
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

interface ViteManifestEntry {
  readonly file?: string;
  readonly src?: string;
  readonly isEntry?: boolean;
}

function assertOutputAttribution(path: string, attribution: CapturedChunk | undefined): void {
  // Development source maps are diagnostic sidecars, not runtime Project graph inputs.
  if (path.endsWith(".map")) return;
  if (!attribution || attribution.includedNodeIds.length === 0) {
    throw new Error("Emitted runtime output has no Project Build Analysis attribution: " + path);
  }
}

async function collectFiles(
  outputDirectory: string,
  captured: ReadonlyMap<string, CapturedChunk>,
  inputHtml: string,
): Promise<Html5BuildArtifactFileInput[]> {
  const viteManifestPath = resolve(outputDirectory, "manifest.json");
  const viteManifest = JSON.parse(await readFile(viteManifestPath, "utf8")) as Record<string, ViteManifestEntry>;
  const assetAttribution = new Map<string, CapturedChunk>();
  for (const entry of Object.values(viteManifest)) {
    if (!entry.file || !entry.src || entry.isEntry) continue;
    const sourceModuleId = normalizeModuleId(resolve(fixtureRoot, entry.src));
    const includedNodeIds = mapModuleId(sourceModuleId);
    if (includedNodeIds.length === 0) {
      throw new Error("Vite emitted asset has no Project Build Analysis attribution: " + entry.src);
    }
    assetAttribution.set(entry.file, {
      moduleIds: [sourceModuleId],
      includedNodeIds,
    });
  }

  const htmlEntrySourceId = normalizeModuleId(resolve(fixtureRoot, inputHtml));
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
      // Vite's internal manifest is only a build-host index; it is not a game runtime dependency.
      if (path === "manifest.json") continue;
      const contents = new Uint8Array(await readFile(absolutePath));
      const chunk = captured.get(path)
        ?? assetAttribution.get(path)
        ?? (path === inputHtml
          ? { moduleIds: [htmlEntrySourceId], includedNodeIds: ["module:runtime-entry"] }
          : undefined);
      assertOutputAttribution(path, chunk);
      result.push({
        path, contents, brotliBytes: brotliCompressSync(contents).byteLength,
        sourceModuleIds: chunk?.moduleIds ?? [], includedNodeIds: chunk?.includedNodeIds ?? [],
      });
    }
  }
  await visit(outputDirectory);
  await rm(viteManifestPath, { force: true });
  return result;
}

async function buildProfile(profile: Html5BuildProfileV1, label: string, moduleGraph?: Map<string, CapturedModuleImports>, inputHtml = "index.html"): Promise<Html5BuildManifestV1> {
  const temporaryRoot = await temporaryRootPromise;
  const buildLabel = label.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const outputDirectory = resolve(temporaryRoot, buildLabel);
  const isDevelopment = profile.kind === "development";
  const captured = new Map<string, CapturedChunk>();
  await build({
    configFile: false,
    root: fixtureRoot,
    base: "./",
    mode: isDevelopment ? "development" : "production",
    logLevel: "silent",
    plugins: [createCapturePlugin(captured, moduleGraph)],
    define: {
      "process.env.NODE_ENV": JSON.stringify(isDevelopment ? "development" : "production"),
      "import.meta.env.DEV": JSON.stringify(isDevelopment),
      "import.meta.env.PROD": JSON.stringify(!isDevelopment),
    },
    build: {
      rolldownOptions: { input: resolve(fixtureRoot, inputHtml) },
      outDir: outputDirectory,
      emptyOutDir: true,
      target: profile.ecmaTarget,
      minify: profile.minify,
      sourcemap: profile.sourceMaps,
      manifest: "manifest.json",
      assetsInlineLimit: 0,
    },
  });

  const expectedEntryModule = inputHtml === "index-arcade.html"
    ? "src/editor/tests/fixtures/html5-game/src/main-arcade.ts"
    : "src/editor/tests/fixtures/html5-game/src/main.ts";
  const runtimeEntry = [...captured.entries()].find(([, chunk]) => chunk.moduleIds.includes(expectedEntryModule));
  if (!runtimeEntry) throw new Error("Bundler did not emit the native runtime entry module for " + label + ".");
  const runtimeEntryCode = await readFile(resolve(outputDirectory, runtimeEntry[0]), "utf8");
  const expectedProfileMarker = profile.kind === "development"
    ? "development|true|false"
    : "production|false|true";
  if (!runtimeEntryCode.includes(expectedProfileMarker)) {
    throw new Error("Bundled Vite environment does not match " + profile.kind + " profile (" + label + "): expected " + expectedProfileMarker);
  }
  const toolchainLock = JSON.parse(readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8")) as {
    packages: Record<string, { version?: string }>;
  };
  const viteVersion = toolchainLock.packages["src/editor/node_modules/vite"]?.version;
  const rolldownVersion = toolchainLock.packages["src/editor/node_modules/rolldown"]?.version;
  if (!viteVersion || !rolldownVersion) throw new Error("package-lock.json must pin the Editor Vite/Rolldown toolchain.");
  const artifactFiles = await collectFiles(outputDirectory, captured, inputHtml);
  sourceMapsByBuildLabel.set(
    label,
    new Map(
      artifactFiles
        .filter((file) => file.path.endsWith(".js.map"))
        .map((file) => [file.path, Buffer.from(file.contents).toString("utf8")]),
    ),
  );
  const manifest = await createHtml5BuildManifest({
    profile, toolchain: { name: "vite+rolldown", version: `${viteVersion}/${rolldownVersion}` },
    files: artifactFiles,
  });
  return manifest;
}

function createCoreAnalysisInput(
  outputManifest: ProjectBuildOutputManifest,
  featureSnapshots: NonNullable<ProjectBuildAnalysisInput["features"]>,
  moduleGraph: ReadonlyMap<string, CapturedModuleImports>,
  phaserVariant: "full" | "arcade-only" = "full",
  entrySourceId = "src/editor/tests/fixtures/html5-game/src/main.ts",
): ProjectBuildAnalysisInput {
  const project = JSON.parse(readFileSync(resolve(projectRoot, "project.json"), "utf8")) as ProjectDocumentV1;
  const sceneAsset = project.assets.find((asset) => asset.kind === "scene");
  if (!sceneAsset) throw new Error("Acceptance Project fixture must register a Scene asset.");
  const scene = JSON.parse(readFileSync(resolve(projectRoot, sceneAsset.path), "utf8")) as SceneDocumentV1;
  const files: Array<ProjectBuildAnalysisInput["files"][number]> = project.assets.map((asset) => ({
    path: asset.path, kind: "file" as const,
    sizeBytes: readFileSync(resolve(projectRoot, asset.path)).byteLength,
  }));
  const entryPath = entrySourceId.endsWith("main-arcade.ts") ? "src/main-arcade.ts" : "src/main.ts";
  const runtimeEntryPath = resolve(fixtureRoot, entryPath);
  files.push({ path: entryPath, kind: "file", sizeBytes: readFileSync(runtimeEntryPath).byteLength });
  const runtimeScenePath = resolve(fixtureRoot, "src/runtime.ts");
  files.push({ path: "src/runtime.ts", kind: "file", sizeBytes: readFileSync(runtimeScenePath).byteLength });
  // These virtual modules are generated by pinned Vite and are part of the emitted runtime graph.
  files.push({ path: "generated/vite-preload-helper.js", kind: "file" });
  files.push({ path: "generated/vite-modulepreload-polyfill.js", kind: "file" });
  const projectDocumentPath = resolve(projectRoot, "project.json");
  files.push({ path: "project.json", kind: "file", sizeBytes: readFileSync(projectDocumentPath).byteLength });

  const projectModules = [
    { sourceId: entrySourceId, descriptor: { id: "runtime-entry", path: entryPath, entryPoint: "runtime" as const } },
    { sourceId: "src/editor/tests/fixtures/html5-game/src/runtime.ts", descriptor: { id: "runtime-scene", path: "src/runtime.ts", entryPoint: "runtime" as const } },
    { sourceId: "virtual:vite/preload-helper.js", descriptor: { id: "vite-preload-helper", path: "generated/vite-preload-helper.js", entryPoint: "runtime" as const } },
    { sourceId: "virtual:vite/modulepreload-polyfill.js", descriptor: { id: "vite-modulepreload-polyfill", path: "generated/vite-modulepreload-polyfill.js", entryPoint: "runtime" as const } },
    { sourceId: "packages/cge/tests/fixtures/acceptance-project/project.json", descriptor: { id: "project-document", path: "project.json", entryPoint: "runtime" as const } },
    ...project.componentModules.map((moduleReference) => {
      const asset = project.assets.find((candidate) => candidate.id === moduleReference.moduleAssetId);
      if (!asset || asset.kind !== "script") {
        throw new Error("Project Component module " + moduleReference.typeId + " has no registered script Asset.");
      }
      return {
        sourceId: normalizeModuleId(resolve(projectRoot, asset.path)),
        descriptor: {
          id: "component-" + moduleReference.typeId,
          path: asset.path,
          assetId: moduleReference.moduleAssetId,
          entryPoint: "component" as const,
        },
      };
    }),
  ];
  const assetReferences: Array<NonNullable<ProjectBuildAnalysisInput["assetReferences"]>[number]> = [];
  const modules: ProjectBuildModuleSnapshot[] = projectModules.map(({ sourceId, descriptor }) => {
    const captured = moduleGraph.get(sourceId);
    if (!captured) throw new Error("Vite module graph omitted required Project module " + sourceId);
    const resolveImports = (values: readonly string[], kind: "static" | "dynamic"): ProjectBuildModuleImport[] => values.flatMap((specifier): ProjectBuildModuleImport[] => {
      const mapped = mapModuleId(specifier);
      const packageId = mapped.find((id) => id.startsWith("package:"));
      if (packageId) return [{ specifier, kind, resolvedPackageId: packageId.slice("package:".length) }];
      const moduleId = mapped.find((id) => id.startsWith("module:"));
      if (moduleId) return [{ specifier, kind, resolvedModuleId: moduleId.slice("module:".length) }];
      const assetId = mapped.find((id) => id.startsWith("asset:"));
      if (assetId) {
        assetReferences.push({
          assetId: assetId.slice("asset:".length),
          sourceNodeId: "module:" + descriptor.id,
          reason: kind + " import " + specifier,
          path: specifier,
        });
        return [];
      }
      throw new Error("Project module import has no stable Project Build Analysis mapping: " + descriptor.id + " -> " + specifier);
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
  const phaserLockRecord = lockfile.packages["node_modules/phaser"];
  if (!phaserLockRecord?.version) throw new Error("Lockfile is missing the pinned Phaser package.");
  const externalDefinitions = phaserVariant === "full"
    ? [{ id: "pkg-phaser-full-umd", packageName: "phaser", name: "phaser-full-umd", version: phaserLockRecord.version, scope: "runtime" as const }]
    : [{ id: "pkg-phaser-arcade-umd", packageName: "phaser", name: "phaser-arcade-umd", version: phaserLockRecord.version, scope: "runtime" as const }];
  const packageIdByName = new Map<string,string>();
  for (const item of workspaceManifests) packageIdByName.set(item.manifest.name, item.id);
  for (const item of externalDefinitions) packageIdByName.set(item.packageName, item.id);
  const packages = workspaceManifests.map(({ id, scope, manifest }) => ({
    id, name: manifest.name, version: manifest.version, scope,
    dependencies: Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).flatMap((name) => {
      const dependencyId = packageIdByName.get(name);
      return dependencyId ? [dependencyId] : [];
    }),
  }));
  for (const definition of externalDefinitions) {
    packages.push({
      id: definition.id,
      name: definition.name,
      version: definition.version,
      scope: definition.scope,
      dependencies: [],
    });
  }
  const dynamicEntryPoints: Array<NonNullable<ProjectBuildAnalysisInput["dynamicEntryPoints"]>[number]> = [];
  for (const module of modules) {
    for (const entry of module.imports ?? []) {
      if (entry.kind !== "dynamic") continue;
      if (!entry.resolvedModuleId) {
        throw new Error(
          "Dynamic imports must resolve to a Project manifest Component module: " +
          module.id + " -> " + entry.specifier,
        );
      }
      const target = projectModules.find(
        (candidate) => candidate.descriptor.id === entry.resolvedModuleId,
      );
      if (!target || target.descriptor.entryPoint !== "component") {
        throw new Error(
          "Dynamic import target is not a declared Project Component module: " +
          module.id + " -> " + entry.specifier,
        );
      }
      dynamicEntryPoints.push({
        sourceModuleId: module.id,
        specifier: entry.specifier,
        targetModuleId: entry.resolvedModuleId,
      });
    }
  }

  return {
    project, target: "html5", files,
    scenes: [{ assetId: sceneAsset.id, document: scene }], prefabs: [],
    componentSchemas: projectModules
      .filter((item) => item.descriptor.entryPoint === "component")
      .map(() => componentDefinition.schema),
    modules, packages, features: featureSnapshots,
    assetReferences,
    dynamicEntryPoints,
    coverage: { resourceReferences: true, moduleImports: true, packageDependencies: true, dynamicImports: true, externalRuntimeFiles: true },
    outputManifest,
  };
}

async function loadNativeAcceptanceScene(): Promise<void> {
  const project = JSON.parse(readFileSync(resolve(projectRoot, "project.json"), "utf8")) as ProjectDocumentV1;
  const sceneAsset = project.assets.find((asset) => asset.kind === "scene");
  if (!sceneAsset) throw new Error("Acceptance Project fixture must register a Scene asset.");
  const sceneText = readFileSync(resolve(projectRoot, sceneAsset.path), "utf8");
  const scene = JSON.parse(sceneText) as SceneDocumentV1;
  const requiredTypeIds = [...new Set(
    (function collect(nodes: SceneDocumentV1["rootNodes"]): string[] {
      return nodes.flatMap((node) => [
        ...node.components.map((component) => component.typeId),
        ...collect(node.children),
      ]);
    })(scene.rootNodes),
  )].sort((left, right) => left.localeCompare(right));
  const controller = new AbortController();
  const moduleResolution = await resolveProjectComponentRegistry({
    project,
    requiredTypeIds,
    signal: controller.signal,
    loadModule: async (asset) => {
      if (asset.path !== "src/FollowTarget.ts") {
        throw new Error("No pinned fixture module loader is registered for " + asset.path);
      }
      return componentDefinition;
    },
  });
  expect(moduleResolution.valid, JSON.stringify(moduleResolution.diagnostics)).toBe(true);
  if (!moduleResolution.registry) throw new Error("Project Component resolver did not return a complete Registry.");
  expect(moduleResolution.loadedTypeIds).toEqual(requiredTypeIds);
  const loader = new ProjectSceneLoader({
    project, registry: moduleResolution.registry,
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
  it("rejects unclassified runtime output while allowing Development source-map sidecars", () => {
    expect(() => assertOutputAttribution("assets/unknown-runtime.js", undefined))
      .toThrow(/no Project Build Analysis attribution/);
    expect(() => assertOutputAttribution("assets/unknown-runtime.js", {
      moduleIds: ["unknown-module"],
      includedNodeIds: [],
    })).toThrow(/no Project Build Analysis attribution/);
    expect(() => assertOutputAttribution("assets/index.js.map", undefined)).not.toThrow();
  });

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
    const reproducibilityByProfile: Record<string, boolean> = {};
    const results: Record<string, Html5BuildManifestV1> = {};
    for (const kind of ["development", "release"] as const) {
      const profile = createDefaultHtml5BuildProfile(kind);
      const first = await buildProfile(profile, kind + "-first", kind === "release" ? releaseModuleGraph : undefined);
      const second = await buildProfile(profile, kind + "-second");
      const comparison = {
        ...compareHtml5BuildManifests(first, second),
        reproducibilityScope: "all-output-files",
      };
      expect(
        comparison.reproducible,
        JSON.stringify({
          differences: comparison.differences,
          changedMapPath: comparison.differences.find((difference) => difference.path?.endsWith(".map"))?.path,
          sourceMap: comparison.differences.find((difference) => difference.path?.endsWith(".map"))?.path
            ? summarizeSourceMapDifference(
                kind + "-first",
                kind + "-second",
                comparison.differences.find((difference) => difference.path?.endsWith(".map"))!.path!,
              )
            : null,
          firstChangedMapManifest: comparison.differences.find((difference) => difference.path?.endsWith(".map"))?.path
            ? first.files.find((file) => file.path === comparison.differences.find((difference) => difference.path?.endsWith(".map"))?.path)
            : undefined,
          secondChangedMapManifest: comparison.differences.find((difference) => difference.path?.endsWith(".map"))?.path
            ? second.files.find((file) => file.path === comparison.differences.find((difference) => difference.path?.endsWith(".map"))?.path)
            : undefined,
        }),
      ).toBe(true);
      expect(
        comparison.differences.filter((difference) => difference.path?.endsWith(".map") === true),
      ).toEqual([]);
      reproducibilityByProfile[kind] = comparison.reproducible;
      expect(first.totals.fileCount).toBeGreaterThan(1);
      expect(first.files.every((file) => Number.isSafeInteger(file.brotliBytes))).toBe(true);
      expect(first.files.some((file) => file.path.endsWith(".js"))).toBe(true);
      expect(first.files.some((file) => file.path === "manifest.json")).toBe(false);
      expect(first.files.find((file) => file.path === "index.html" || file.path === "index-arcade.html")?.includedNodeIds).toContain("module:runtime-entry");
      expect(first.files.some((file) => file.path.endsWith(".svg"))).toBe(true);
      expect(
        first.files.filter((file) => !file.path.endsWith(".map"))
          .every((file) => file.includedNodeIds.length > 0),
      ).toBe(true);
      if (kind === "release") {
        expect(first.files.some((file) => file.includedNodeIds.includes("package:pkg-runtime-phaser"))).toBe(true);
        expect(first.files.some((file) => file.includedNodeIds.includes("package:pkg-phaser-full-umd"))).toBe(true);
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
    const unclassifiedRuntimeModules = [...releaseModuleGraph.keys()].filter(
      (moduleId) => mapModuleId(moduleId).length === 0,
    );
    expect(unclassifiedRuntimeModules, "every emitted runtime module must be mapped to a Project Build Analysis node").toEqual([]);

    const releaseManifest = toProjectBuildOutputManifest(release);
    const analysisInput = createCoreAnalysisInput(releaseManifest, featureReport.buildAnalysisFeatures, releaseModuleGraph, "full");
    const analysis = analyzeProjectBuild(analysisInput);
    expect(analysis.valid, JSON.stringify(analysis.diagnostics)).toBe(true);
    expect(analysis.report.output.status).toBe("measured");
    if (analysis.report.output.status !== "measured") throw new Error("Release output manifest was not measured.");
    const fullPhaserFile = analysis.report.output.files.find((file) => file.path.includes("phaser.min-"));
    expect(fullPhaserFile?.includesNodeIds).toContain("package:pkg-phaser-full-umd");
    expect(fullPhaserFile?.sizeBytes).toBeGreaterThan(1_000_000);
    expect(analysis.report.includedPackages).toContain("@codogma/cge@0.1.0");
    expect(analysis.report.includedPackages).toContain("@codogma/runtime-phaser@0.1.0");
    expect(analysis.report.includedPackages).toContain("phaser-full-umd@4.2.1");
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
    expect(analysis.report.includedModules).toContain("runtime-scene");
    expect(analysis.report.includedModules).toContain("vite-preload-helper");
    expect(analysis.report.includedModules).toContain("vite-modulepreload-polyfill");
    expect(analysis.report.includedModules).toContain("project-document");
    expect(analysis.report.includedModules).toContain("component-com.codogma.acceptance.follow-target");
    expect(analysisInput.dynamicEntryPoints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceModuleId: "runtime-scene",
        targetModuleId: "component-com.codogma.acceptance.follow-target",
      }),
    ]));

    const arcadeModuleGraph = new Map<string, CapturedModuleImports>();
    const arcadeProfile = createDefaultHtml5BuildProfile("release");
    const arcadeFirst = await buildProfile(arcadeProfile, "arcade-candidate-first", arcadeModuleGraph, "index-arcade.html");
    const arcadeSecond = await buildProfile(arcadeProfile, "arcade-candidate-second", undefined, "index-arcade.html");
    const arcadeReproducibility = compareHtml5BuildManifests(arcadeFirst, arcadeSecond);
    expect(arcadeReproducibility.reproducible, JSON.stringify(arcadeReproducibility.differences)).toBe(true);
    const arcadeAnalysisInput = createCoreAnalysisInput(
      toProjectBuildOutputManifest(arcadeFirst),
      featureReport.buildAnalysisFeatures,
      arcadeModuleGraph,
      "arcade-only",
      "src/editor/tests/fixtures/html5-game/src/main-arcade.ts",
    );
    const arcadeAnalysis = analyzeProjectBuild(arcadeAnalysisInput);
    expect(arcadeAnalysis.valid, JSON.stringify(arcadeAnalysis.diagnostics)).toBe(true);
    if (arcadeAnalysis.report.output.status !== "measured") throw new Error("Arcade-only output manifest was not measured.");
    const arcadePhaserFile = arcadeAnalysis.report.output.files.find((file) => file.path.includes("phaser-arcade-physics.min-"));
    expect(arcadePhaserFile?.includesNodeIds).toContain("package:pkg-phaser-arcade-umd");
    expect(arcadePhaserFile?.sizeBytes).toBeGreaterThan(1_000_000);
    expect(arcadeAnalysis.report.includedPackages).toContain("@codogma/runtime-phaser@0.1.0");
    expect(arcadeAnalysis.report.includedPackages).toContain("phaser-arcade-umd@4.2.1");
    expect(arcadeAnalysis.report.includedPackages.some((name) => name.startsWith("phaser-full-umd@"))).toBe(false);
    expect(arcadeAnalysis.report.includedFeatures).toEqual(analysis.report.includedFeatures);
    expect(arcadeAnalysis.report.includedModules).toEqual(analysis.report.includedModules);
    expect(arcadeAnalysis.report.includedAssets).toEqual(analysis.report.includedAssets);

    generatedEvidence.phaserVariantComparison = {
      full: {
        rawBytes: release.totals.rawBytes,
        gzipBytes: release.totals.gzipBytes,
        brotliBytes: release.totals.brotliBytes,
        includedPackages: analysis.report.includedPackages,
      },
      arcadeOnly: {
        rawBytes: arcadeFirst.totals.rawBytes,
        gzipBytes: arcadeFirst.totals.gzipBytes,
        brotliBytes: arcadeFirst.totals.brotliBytes,
        includedPackages: arcadeAnalysis.report.includedPackages,
      },
      deltaArcadeMinusFull: {
        rawBytes: arcadeFirst.totals.rawBytes - release.totals.rawBytes,
        gzipBytes: arcadeFirst.totals.gzipBytes - release.totals.gzipBytes,
        brotliBytes: (arcadeFirst.totals.brotliBytes ?? 0) - (release.totals.brotliBytes ?? 0),
      },
      reproducibility: {
        full: reproducibilityByProfile.release === true,
        arcadeOnly: arcadeReproducibility.reproducible,
      },
      fixtureCompositionCoverage: {
        sameProjectModules: arcadeAnalysis.report.includedModules,
        sameFeatureSet: arcadeAnalysis.report.includedFeatures,
        sameAssets: arcadeAnalysis.report.includedAssets,
      },
      runtimeApiContract: [
        "Game", "Scene", "AUTO", "Scene.load.svg", "Scene.add.image",
        "Arcade.add.existing", "Arcade.Body",
      ],
    };

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
      modules: (analysisInput.modules ?? []).filter((module) => module.id !== "component-com.codogma.acceptance.follow-target"),
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
    for (const invalidResult of [unknownComponent, missingComponentModule, missingAsset, unresolvedImport]) {
      expect(invalidResult.diagnostics.length, "Release rejection must include diagnostics").toBeGreaterThan(0);
      expect(
        invalidResult.diagnostics.every((diagnostic) => typeof diagnostic.code === "string" && diagnostic.code.length > 0),
        "Release diagnostics must expose machine-readable codes",
      ).toBe(true);
    }

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

    const artifactRoot = await temporaryRootPromise;
    const fullArtifactPath = process.env.CODOGMA_HTML5_BUILD_OUTPUT;
    if (fullArtifactPath) {
      await rm(fullArtifactPath, { recursive: true, force: true });
      await cp(resolve(artifactRoot, "release-first"), fullArtifactPath, { recursive: true });
    }
    const arcadeArtifactPath = process.env.CODOGMA_HTML5_ARCADE_OUTPUT;
    if (arcadeArtifactPath) {
      await rm(arcadeArtifactPath, { recursive: true, force: true });
      await cp(resolve(artifactRoot, "arcade-candidate-first"), arcadeArtifactPath, { recursive: true });
    }

    generatedEvidence.featureSelection = featureReport;
    generatedEvidence.releaseCoreAnalysis = analysis.report;
    generatedEvidence.arcadeCoreAnalysis = arcadeAnalysis.report;
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
