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

/**
 * Preview deliberately supports self-contained Script Assets only. Project Model
 * IDs select the module; source text never supplies an import path to the Host.
 */
export async function inspectPreviewModuleSource(
  source: string,
  fileName: string,
): Promise<PreviewModuleSourceDiagnostic[]> {
  const ts = await import("typescript");
  const diagnostics: PreviewModuleSourceDiagnostic[] = [];
  if (!/\.tsx?$/i.test(fileName)) {
    return [{ message: "Preview Component modules must be .ts or .tsx Script Assets." }];
  }
  if (new TextEncoder().encode(source).byteLength > MAX_PREVIEW_MODULE_BYTES) {
    return [{ message: "Preview Component module exceeds the 1 MiB source limit." }];
  }

  const scriptKind = fileName.toLowerCase().endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const parseDiagnostics = (sourceFile as import("typescript").SourceFile & {
    parseDiagnostics: readonly import("typescript").Diagnostic[];
  }).parseDiagnostics;
  for (const diagnostic of parseDiagnostics) {
    const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    diagnostics.push({
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      line: location.line + 1,
      column: location.character + 1,
    });
  }
  if (diagnostics.length > 0) return diagnostics;

  const visit = (node: import("typescript").Node): void => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) ||
        ts.isExportDeclaration(node) || ts.isImportTypeNode(node)) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      diagnostics.push({
        message: "Preview Component modules must be self-contained; imports and export declarations are not supported by this Host loader.",
        line: location.line + 1,
        column: location.character + 1,
      });
    } else if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      diagnostics.push({
        message: "Dynamic import() and require() are not supported by the native Preview module loader.",
        line: location.line + 1,
        column: location.character + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  sourceFile.forEachChild(visit);
  return diagnostics;
}

async function loadSelfContainedComponentModule(
  source: string,
  fileName: string,
  signal: AbortSignal,
): Promise<ComponentTypeDefinition> {
  if (isAborted(signal)) throw signal.reason ?? new Error("Preview module loading was cancelled.");
  const diagnostics = await inspectPreviewModuleSource(source, fileName);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map((item) =>
      (item.line === undefined ? "" : item.line + ":" + (item.column ?? 1) + ": ") + item.message
    ).join("\n"));
  }

  const ts = await import("typescript");
  const transpiled = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      sourceMap: false,
      inlineSourceMap: false,
      inlineSources: false,
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
  if (isAborted(signal)) throw signal.reason ?? new Error("Preview module loading was cancelled.");
  if (typeof Blob === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("This browser does not support Blob module URLs required by the native Preview loader.");
  }

  const moduleUrl = URL.createObjectURL(new Blob([transpiled.outputText], { type: "text/javascript" }));
  try {
    // Executing the project's own Component code is intentional on Play. This is
    // not a security sandbox; dependency/import graph support belongs to COD-91.
    const moduleNamespace = await import(/* @vite-ignore */ moduleUrl) as Record<string, unknown>;
    if (isAborted(signal)) throw signal.reason ?? new Error("Preview module loading was cancelled.");
    const definition = moduleNamespace.componentDefinition;
    if (!definition || typeof definition !== "object" ||
        typeof (definition as { create?: unknown }).create !== "function") {
      throw new Error("Script Asset must export componentDefinition with a synchronous create(context) factory.");
    }
    return definition as ComponentTypeDefinition;
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

/** Uses Core's manifest resolver; this Host owns source compilation and execution. */
export async function resolveEditorPreviewComponentRegistry(
  input: EditorPreviewModuleResolutionInput,
): Promise<BrowserPreviewModuleResolutionResult> {
  const previewBuiltinModules = input.project.componentModules.filter((module) =>
    module.moduleAssetId.startsWith(PREVIEW_BUILTIN_ASSET_PREFIX) &&
    BUILTIN_COMPONENT_TYPE_IDS.has(module.typeId),
  );
  const previewBuiltinTypes = new Set(previewBuiltinModules.map((module) => module.typeId));
  const result = await resolveProjectComponentRegistry({
    project: input.project,
    requiredTypeIds: input.requiredTypeIds.filter((typeId) => !previewBuiltinTypes.has(typeId)),
    signal: input.signal,
    loadModule: async (asset, signal) => {
      const source = await input.readAssetDocument(asset, signal);
      if (isAborted(signal)) throw signal.reason ?? new Error("Preview module loading was cancelled.");
      return loadSelfContainedComponentModule(source, asset.path, signal);
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
