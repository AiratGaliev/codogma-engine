import {
  resolveProjectComponentRegistry,
  ComponentRegistry,
  type AssetReference,
  type ComponentTypeDefinition,
  type ComponentTypeSchemaV1,
  type ProjectDocumentV1,
} from "@codogma/cge";
import { BUILTIN_COMPONENT_TYPE_IDS } from "../domain/builtin-component-ids.js";
import type { BrowserPreviewModuleResolutionResult } from "@codogma/runtime-phaser";

export interface EditorPreviewModuleResolutionInput {
  readonly project: ProjectDocumentV1;
  readonly requiredTypeIds: readonly string[];
  readonly signal: AbortSignal;
  readonly readAssetDocument: (asset: AssetReference, signal: AbortSignal) => Promise<string>;
}

export interface PreviewModuleSourceDiagnostic {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

const MAX_PREVIEW_MODULE_BYTES = 1_048_576;
const MAX_PREVIEW_GRAPH_BYTES = 8 * 1_048_576;
const MAX_PREVIEW_MODULES = 128;
const PREVIEW_BUILTIN_ASSET_PREFIX = "codogma-preview-builtin-asset-";

const BUILTIN_COMPONENT_NAMES: Readonly<Record<string, string>> = {
  "com.codogma.renderer.image": "Image Renderer",
  "com.codogma.renderer.text": "Text Renderer",
  "com.codogma.renderer.container": "Container Renderer",
  "com.codogma.fx.circle": "Circle FX",
  "com.codogma.fx.bloom": "Bloom FX",
  "com.codogma.fx.gradient": "Gradient FX",
  "com.codogma.fx.shine": "Shine FX",
};

/**
 * Core's ProjectSceneLoader validates each runtime Component through the
 * Project module manifest. Editor-owned renderer/FX types are not user Script
 * Assets, so Preview adds in-memory-only manifest entries for them.
 */
export function createEditorPreviewProjectSnapshot(
  project: ProjectDocumentV1,
  requiredTypeIds: readonly string[],
): ProjectDocumentV1 {
  const assets = [...project.assets];
  const componentModules = [...project.componentModules];
  const declaredTypes = new Set(componentModules.map((module) => module.typeId));
  const assetIds = new Set(assets.map((asset) => asset.id));
  const assetPaths = new Set(assets.map((asset) => asset.path));

  for (const typeId of [...new Set(requiredTypeIds)].sort()) {
    if (!BUILTIN_COMPONENT_TYPE_IDS.has(typeId) || declaredTypes.has(typeId)) continue;
    const slug = typeId.replace(/[^A-Za-z0-9-]/g, "-");
    const moduleAssetId = PREVIEW_BUILTIN_ASSET_PREFIX + slug;
    const path = "codogma-preview/builtins/" + slug + ".ts";
    if (assetIds.has(moduleAssetId) || assetPaths.has(path)) {
      throw new Error("Preview built-in module reference collides with a Project Asset: " + typeId);
    }
    assets.push({ id: moduleAssetId, path, kind: "script" });
    componentModules.push({ typeId, moduleAssetId, version: "1.0.0" });
    assetIds.add(moduleAssetId);
    assetPaths.add(path);
    declaredTypes.add(typeId);
  }
  return { ...project, assets, componentModules };
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function isPreviewExecutableScriptPath(path: string): boolean {
  return /\.(ts|tsx)$/i.test(path) && !/\.d\.ts$/i.test(path);
}

function diagnosticAt(
  ts: TypeScriptApi,
  sourceFile: import("typescript").SourceFile,
  node: import("typescript").Node,
  message: string,
): PreviewModuleSourceDiagnostic {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { message, line: location.line + 1, column: location.character + 1 };
}

type TypeScriptApi = typeof import("typescript");

/**
 * Resolve only relative imports to explicitly registered Project Script Assets.
 * The TypeScript checker may understand package/baseUrl options, but Preview
 * does not silently load npm packages or files outside the Project boundary.
 */
export function resolvePreviewScriptModuleAsset(
  importerPath: string,
  specifier: string,
  scriptAssets: readonly AssetReference[],
): AssetReference {
  if (!importerPath || importerPath.includes("\\") ||
      (!specifier.startsWith("./") && !specifier.startsWith("../")) ||
      specifier.includes("\\") || specifier.includes("\0") ||
      specifier.includes("?") || specifier.includes("#")) {
    throw new Error(
      'Preview imports must be relative paths to Project Script Assets; unsupported specifier "' + specifier + '".',
    );
  }

  const segments = importerPath.split("/");
  segments.pop();
  for (const segment of specifier.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) throw new Error('Preview import "' + specifier + '" escapes the Project root.');
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  const target = segments.join("/");
  if (!target) throw new Error('Preview import "' + specifier + '" does not resolve to a Project Script Asset.');

  const extension = /\.(ts|tsx|mts|cts|js|jsx)$/i.exec(target)?.[0].toLowerCase();
  const candidates = extension
    ? extension === ".js" ? [target.slice(0, -3) + ".ts", target.slice(0, -3) + ".tsx"]
      : extension === ".jsx" ? [target.slice(0, -4) + ".tsx", target.slice(0, -4) + ".ts"]
      : [target]
    : [
      target + ".ts",
      target + ".tsx",
      target + "/index.ts",
      target + "/index.tsx",
    ];
  const byPath = new Map(scriptAssets.filter((asset) => asset.kind === "script" && isPreviewExecutableScriptPath(asset.path)).map((asset) => [asset.path, asset] as const));
  for (const candidate of candidates) {
    const asset = byPath.get(candidate);
    if (asset) return asset;
  }
  throw new Error(
    'Preview import "' + specifier + '" from "' + importerPath +
    '" does not resolve to a registered .ts/.tsx Script Asset.',
  );
}

async function inspectModuleSource(
  source: string,
  fileName: string,
): Promise<{
  sourceFile?: import("typescript").SourceFile;
  diagnostics: PreviewModuleSourceDiagnostic[];
  imports: Array<{ specifier: string; node: import("typescript").Node }>;
}> {
  const ts = await import("typescript");
  const diagnostics: PreviewModuleSourceDiagnostic[] = [];
  const imports: Array<{ specifier: string; node: import("typescript").Node }> = [];
  if (!/\.(ts|tsx)$/i.test(fileName)) {
    return { diagnostics: [{ message: "Preview Component modules must be .ts or .tsx Script Assets." }], imports };
  }
  if (new TextEncoder().encode(source).byteLength > MAX_PREVIEW_MODULE_BYTES) {
    return { diagnostics: [{ message: "Preview Component module exceeds the 1 MiB source limit." }], imports };
  }

  const scriptKind = fileName.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const parseDiagnostics = (sourceFile as import("typescript").SourceFile & {
    parseDiagnostics: readonly import("typescript").Diagnostic[];
  }).parseDiagnostics;
  for (const item of parseDiagnostics) {
    const location = sourceFile.getLineAndCharacterOfPosition(item.start ?? 0);
    diagnostics.push({
      message: ts.flattenDiagnosticMessageText(item.messageText, "\n"),
      line: location.line + 1,
      column: location.character + 1,
    });
  }
  if (diagnostics.length > 0) return { sourceFile, diagnostics, imports };

  const visit = (node: import("typescript").Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly === true ||
          (!node.importClause?.name && !!node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings) &&
            node.importClause.namedBindings.elements.length > 0 &&
            node.importClause.namedBindings.elements.every((item) => item.isTypeOnly))
        : node.isTypeOnly ||
          (!!node.exportClause && ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((item) => item.isTypeOnly));
      if (!typeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push({ specifier: node.moduleSpecifier.text, node });
      }
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
      imports.push({ specifier: node.moduleReference.expression.text, node });
    } else if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      diagnostics.push(diagnosticAt(
        ts,
        sourceFile,
        node,
        "Dynamic import() and direct require() are not supported by the native Preview module loader; use a static relative import.",
      ));
    } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      diagnostics.push(diagnosticAt(
        ts,
        sourceFile,
        node,
        "import.meta is not available in bundled Preview Component modules.",
      ));
    } else if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      diagnostics.push(diagnosticAt(
        ts,
        sourceFile,
        node,
        "JSX is not part of the runtime Component module contract; export a ComponentBehavior factory instead.",
      ));
    } else if (ts.isAwaitExpression(node)) {
      let parent: import("typescript").Node | undefined = node.parent;
      while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
      if (!parent) {
        diagnostics.push(diagnosticAt(
          ts,
          sourceFile,
          node,
          "Top-level await is not supported in synchronous Preview Component modules.",
        ));
      }
    }
    ts.forEachChild(node, visit);
  };
  sourceFile.forEachChild(visit);
  return { sourceFile, diagnostics, imports };
}

/** Syntax/preflight validation; static dependencies are resolved against the Project manifest separately. */
export async function inspectPreviewModuleSource(
  source: string,
  fileName: string,
): Promise<PreviewModuleSourceDiagnostic[]> {
  return (await inspectModuleSource(source, fileName)).diagnostics;
}

interface CompiledPreviewModule {
  readonly asset: AssetReference;
  readonly outputText: string;
  readonly dependencies: ReadonlyMap<string, string>;
}

function createPreviewBundleSource(
  entryAssetIds: readonly string[],
  modules: ReadonlyMap<string, CompiledPreviewModule>,
): string {
  const factories: string[] = [];
  const dependencyMaps: string[] = [];
  for (const [assetId, record] of modules) {
    factories.push(
      "[" + JSON.stringify(assetId) + ", function(module, exports, require) {\n" +
      record.outputText + "\n}]",
    );
    dependencyMaps.push(
      "[" + JSON.stringify(assetId) + ", new Map(" +
      JSON.stringify([...record.dependencies.entries()]) + ")]",
    );
  }

  return [
    "const __factories = new Map([" + factories.join(",") + "]);",
    "const __dependencies = new Map([" + dependencyMaps.join(",") + "]);",
    "const __cache = new Map();",
    "function __load(id) {",
    "  if (__cache.has(id)) return __cache.get(id).exports;",
    "  const factory = __factories.get(id);",
    "  if (!factory) throw new Error('Preview module is missing from the captured dependency graph: ' + id);",
    "  const record = { exports: {} };",
    "  __cache.set(id, record);",
    "  try {",
    "    factory(record, record.exports, (specifier) => {",
    "      const dependencyId = __dependencies.get(id)?.get(specifier);",
    "      if (!dependencyId) throw new Error('Preview module import was not resolved: ' + specifier);",
    "      return __load(dependencyId);",
    "    });",
    "    return record.exports;",
    "  } catch (error) {",
    "    __cache.delete(id);",
    "    throw error;",
    "  }",
    "}",
    "const __definitions = new Map([" +
      entryAssetIds.map((id) => "[" + JSON.stringify(id) + ", __load(" + JSON.stringify(id) + ").componentDefinition]").join(",") +
      "]);",
    "export default __definitions;",
  ].join("\n");
}

async function loadProjectComponentModules(
  entryAssets: readonly AssetReference[],
  input: EditorPreviewModuleResolutionInput,
  sourceCache: Map<string, Promise<string>>,
): Promise<ReadonlyMap<string, ComponentTypeDefinition>> {
  if (isAborted(input.signal)) throw input.signal.reason ?? new Error("Preview module loading was cancelled.");
  const scriptAssets = input.project.assets.filter((asset) =>
    asset.kind === "script" && isPreviewExecutableScriptPath(asset.path),
  );
  const modules = new Map<string, CompiledPreviewModule>();
  let totalSourceBytes = 0;

  const visit = async (asset: AssetReference): Promise<void> => {
    if (isAborted(input.signal)) throw input.signal.reason ?? new Error("Preview module loading was cancelled.");
    if (modules.has(asset.id)) return;
    if (modules.size >= MAX_PREVIEW_MODULES) {
      throw new Error("Preview dependency graph exceeds the 128-module limit.");
    }
    if (asset.kind !== "script" || !isPreviewExecutableScriptPath(asset.path)) {
      throw new Error('Preview dependency "' + asset.path + '" is not a supported TypeScript Script Asset.');
    }

    let sourcePromise = sourceCache.get(asset.id);
    if (!sourcePromise) {
      sourcePromise = input.readAssetDocument(asset, input.signal);
      sourceCache.set(asset.id, sourcePromise);
    }
    const source = await sourcePromise;
    if (isAborted(input.signal)) throw input.signal.reason ?? new Error("Preview module loading was cancelled.");
    const bytes = new TextEncoder().encode(source).byteLength;
    totalSourceBytes += bytes;
    if (totalSourceBytes > MAX_PREVIEW_GRAPH_BYTES) {
      throw new Error("Preview dependency graph exceeds the 8 MiB source limit.");
    }

    const inspected = await inspectModuleSource(source, asset.path);
    if (inspected.diagnostics.length > 0 || !inspected.sourceFile) {
      throw new Error(inspected.diagnostics.map((item) =>
        (item.line === undefined ? "" : item.line + ":" + (item.column ?? 1) + ": ") + item.message
      ).join("\n"));
    }

    const dependencies = new Map<string, string>();
    for (const dependency of inspected.imports) {
      const resolved = resolvePreviewScriptModuleAsset(asset.path, dependency.specifier, scriptAssets);
      dependencies.set(dependency.specifier, resolved.id);
    }

    const ts = await import("typescript");
    const transpiled = ts.transpileModule(source, {
      fileName: asset.path,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.Preserve,
        sourceMap: false,
        inlineSourceMap: false,
        inlineSources: false,
        esModuleInterop: true,
      },
    });
    const errors = (transpiled.diagnostics ?? []).filter((item) =>
      item.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length > 0) {
      throw new Error(errors.map((item) =>
        ts.flattenDiagnosticMessageText(item.messageText, "\n")
      ).join("\n"));
    }

    // Insert before traversing dependencies so valid circular imports can use
    // CommonJS-compatible partial exports without recursing forever.
    modules.set(asset.id, { asset, outputText: transpiled.outputText, dependencies });
    for (const dependencyId of dependencies.values()) {
      const dependencyAsset = scriptAssets.find((candidate) => candidate.id === dependencyId);
      if (!dependencyAsset) throw new Error("Resolved Preview dependency disappeared from the Project manifest.");
      await visit(dependencyAsset);
    }
  };

  for (const entryAsset of entryAssets) await visit(entryAsset);
  if (isAborted(input.signal)) throw input.signal.reason ?? new Error("Preview module loading was cancelled.");
  if (typeof Blob === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("This browser does not support Blob module URLs required by the native Preview loader.");
  }

  const moduleUrl = URL.createObjectURL(new Blob(
    [createPreviewBundleSource(entryAssets.map((asset) => asset.id), modules)],
    { type: "text/javascript" },
  ));
  try {
    // The project's own Component code is executed only after explicit Play.
    // This is not a sandbox; only the dependency graph is bounded to Project Assets.
    const moduleNamespace = await import(/* @vite-ignore */ moduleUrl) as { default?: unknown };
    if (isAborted(input.signal)) throw input.signal.reason ?? new Error("Preview module loading was cancelled.");
    if (!(moduleNamespace.default instanceof Map)) {
      throw new Error("Preview module bundle did not return a Component definition map.");
    }
    const definitions = moduleNamespace.default as Map<string, unknown>;
    const result = new Map<string, ComponentTypeDefinition>();
    for (const entryAsset of entryAssets) {
      const definition = definitions.get(entryAsset.id);
      if (!definition || typeof definition !== "object" ||
          typeof (definition as { create?: unknown }).create !== "function") {
        throw new Error(
          'Script Asset "' + entryAsset.path +
          '" must export componentDefinition with a synchronous create(context) factory.',
        );
      }
      result.set(entryAsset.id, definition as ComponentTypeDefinition);
    }
    return result;
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

function createBuiltinPreviewDefinition(typeId: string): ComponentTypeDefinition {
  const schema: ComponentTypeSchemaV1 = {
    schemaVersion: 1,
    typeId,
    name: BUILTIN_COMPONENT_NAMES[typeId] ?? typeId,
    version: "1.0.0",
    properties: {},
  };
  return { schema, create: () => ({}) };
}

/** Uses Core's manifest resolver; this Host owns bounded Project-local module loading. */
export async function resolveEditorPreviewComponentRegistry(
  input: EditorPreviewModuleResolutionInput,
): Promise<BrowserPreviewModuleResolutionResult> {
  const previewBuiltinModules = input.project.componentModules.filter((module) =>
    module.moduleAssetId.startsWith(PREVIEW_BUILTIN_ASSET_PREFIX) &&
    BUILTIN_COMPONENT_TYPE_IDS.has(module.typeId),
  );
  const previewBuiltinTypes = new Set(previewBuiltinModules.map((module) => module.typeId));
  const sourceCache = new Map<string, Promise<string>>();
  const requiredTypes = new Set(input.requiredTypeIds.filter((typeId) => !previewBuiltinTypes.has(typeId)));
  const assetById = new Map(input.project.assets.map((asset) => [asset.id, asset] as const));
  const entryAssets = input.project.componentModules
    .filter((module) => requiredTypes.has(module.typeId))
    .map((module) => assetById.get(module.moduleAssetId))
    .filter((asset): asset is AssetReference =>
      asset !== undefined && asset.kind === "script" && /\\.(ts|tsx)$/i.test(asset.path),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  let definitionsPromise: Promise<ReadonlyMap<string, ComponentTypeDefinition>> | undefined;
  const result = await resolveProjectComponentRegistry({
    project: input.project,
    requiredTypeIds: [...requiredTypes],
    signal: input.signal,
    loadModule: async (asset, signal) => {
      if (signal.aborted) throw signal.reason ?? new Error("Preview module loading was cancelled.");
      definitionsPromise ??= loadProjectComponentModules(entryAssets, input, sourceCache);
      const definitions = await definitionsPromise;
      const definition = definitions.get(asset.id);
      if (!definition) throw new Error('Component module "' + asset.path + '" was not present in the bundled Preview graph.');
      return definition;
    },
  });
  let registry: ComponentRegistry | undefined;
  if (result.registry) {
    registry = new ComponentRegistry();
    for (const module of previewBuiltinModules) registry.register(createBuiltinPreviewDefinition(module.typeId));
    for (const definition of result.registry.list()) registry.register(definition);
  }
  return {
    ...(registry ? { registry } : {}),
    diagnostics: result.diagnostics.map((diagnostic) => ({
      source: diagnostic.source?.kind === "component-module" ? "module" as const : "core" as const,
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
      ...(diagnostic.entityId === undefined ? {} : { entityId: diagnostic.entityId }),
      ...(diagnostic.componentInstanceId === undefined ? {} : { componentInstanceId: diagnostic.componentInstanceId }),
    })),
  };
}
