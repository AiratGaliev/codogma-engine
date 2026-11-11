import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseProjectDocument } from "../packages/cge/dist/index.js";
import { readFileSafely, readProjectDirectoryEntriesSafelySync, safeJoin, statProjectDirectorySafelySync } from "./path-security.mjs";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_SCRIPT_ASSETS = 256;

function isWithinDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function toDiagnostic(diagnostic, projectRoot) {
  const position = diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    : undefined;
  const filePath = diagnostic.file ? path.relative(projectRoot, diagnostic.file.fileName).split(path.sep).join("/") : undefined;
  return {
    code: diagnostic.code,
    severity: diagnostic.category === ts.DiagnosticCategory.Warning ? "warning" : "error",
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ...(filePath ? { path: filePath } : {}),
    ...(position ? { line: position.line + 1, column: position.character + 1 } : {}),
  };
}

function createProjectCompilerHost(projectRoot, options) {
  const libraryRoot = path.dirname(ts.getDefaultLibFilePath(options));
  const projectPath = (fileName) => {
    const absolute = path.resolve(fileName);
    const relative = path.relative(projectRoot, absolute);
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return null;
    return safeJoin(projectRoot, relative);
  };
  const isLibraryPath = (fileName) => isWithinDirectory(libraryRoot, path.resolve(fileName));
  const host = ts.createCompilerHost(options, true);
  host.getCurrentDirectory = () => projectRoot;
  host.fileExists = (fileName) => {
    const candidate = projectPath(fileName);
    if (candidate !== null) {
      try { return fs.statSync(candidate).isFile(); } catch { return false; }
    }
    return isLibraryPath(fileName) && ts.sys.fileExists(fileName);
  };
  host.readFile = (fileName) => {
    const candidate = projectPath(fileName);
    if (candidate !== null) {
      try { return readFileSafely(projectRoot, candidate, "utf8", MAX_SOURCE_BYTES); } catch { return undefined; }
    }
    return isLibraryPath(fileName) ? ts.sys.readFile(fileName) : undefined;
  };
  host.directoryExists = (directoryName) => {
    const candidate = projectPath(directoryName);
    if (candidate !== null) return Boolean(statProjectDirectorySafelySync(projectRoot, candidate));
    return isLibraryPath(directoryName) && Boolean(ts.sys.directoryExists?.(directoryName));
  };
  host.getDirectories = (directoryName) => {
    const candidate = projectPath(directoryName);
    if (candidate !== null) {
      const entries = readProjectDirectoryEntriesSafelySync(projectRoot, candidate) ?? [];
      return entries.filter((entry) => entry.isDirectory && !entry.isSymbolicLink)
        .map((entry) => path.join(candidate, entry.name));
    }
    return isLibraryPath(directoryName) ? (ts.sys.getDirectories?.(directoryName) ?? []) : [];
  };
  host.realpath = (fileName) => {
    const candidate = projectPath(fileName);
    if (candidate !== null) {
      try { return fs.realpathSync(candidate); } catch { return candidate; }
    }
    return isLibraryPath(fileName) ? (ts.sys.realpath?.(fileName) ?? path.resolve(fileName)) : path.resolve(fileName);
  };
  host.getSourceFile = (fileName, languageVersion, onError) => {
    const content = host.readFile(fileName);
    if (content === undefined) {
      onError?.("Unable to read a safe TypeScript source file: " + fileName);
      return undefined;
    }
    return ts.createSourceFile(fileName, content, languageVersion, true, ts.getScriptKindFromFileName(fileName));
  };
  const resolutionCache = ts.createModuleResolutionCache(
    projectRoot, (fileName) => host.getCanonicalFileName(fileName), options,
  );
  host.resolveModuleNames = (moduleNames, containingFile, _reusedNames, redirectedReference) =>
    moduleNames.map((moduleName) => ts.resolveModuleName(
      moduleName, containingFile, options, host, resolutionCache, redirectedReference,
    ).resolvedModule);
  return host;
}

function readCompilerOptions(projectRoot) {
  const defaults = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  };
  const diagnostics = [];
  const configPath = safeJoin(projectRoot, "tsconfig.json");
  if (!configPath) return { options: defaults, diagnostics };
  let content;
  try { content = readFileSafely(projectRoot, configPath, 'utf8', MAX_MANIFEST_BYTES); }
  catch (error) {
    if (fs.existsSync(configPath)) diagnostics.push({
      code: 90001, severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      path: 'tsconfig.json',
    });
    return { options: defaults, diagnostics };
  }
  if (content === undefined) return { options: defaults, diagnostics };
  const parsed = ts.parseConfigFileTextToJson(configPath, content);
  if (parsed.error) diagnostics.push(toDiagnostic(parsed.error, projectRoot));
  const config = parsed.config && typeof parsed.config === 'object' ? parsed.config : {};
  if (config.extends) diagnostics.push({
    code: 90002, severity: 'warning',
    message: 'The Editor checker reads compilerOptions from the root tsconfig.json but does not resolve its extends chain.',
    path: 'tsconfig.json',
  });
  const converted = ts.convertCompilerOptionsFromJson(config.compilerOptions ?? {}, projectRoot, configPath);
  diagnostics.push(...converted.errors.map((item) => toDiagnostic(item, projectRoot)));
  return { options: { ...defaults, ...converted.options, noEmit: true }, diagnostics };
}

/**
 * Semantically checks every registered TypeScript Script Asset and its
 * project-local imports. Source is only parsed and type-checked, never run.
 */
export function checkProjectTypeScript(projectDirectory, relativePath, source) {
  if (typeof relativePath !== "string" || !relativePath || typeof source !== "string") {
    throw new TypeError("relativePath and source are required for TypeScript checking.");
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    throw new Error("The active TypeScript source exceeds the 2 MiB diagnostics limit.");
  }
  const projectRoot = fs.realpathSync(path.resolve(projectDirectory));
  const manifestPath = safeJoin(projectRoot, "project.json");
  if (!manifestPath) throw new Error("The native Project manifest cannot be resolved safely.");
  const manifestContent = readFileSafely(projectRoot, manifestPath, "utf8", MAX_MANIFEST_BYTES);
  const project = parseProjectDocument(manifestContent).value;
  if (!project) throw new Error("Cannot type-check an invalid Project manifest.");
  const activeAsset = project.assets.find((asset) => asset.kind === "script" && asset.path === relativePath);
  if (!activeAsset) throw new Error("TypeScript diagnostics require a registered Script Asset: " + relativePath);
  if (![".ts", ".tsx", ".mts", ".cts"].includes(path.extname(relativePath).toLowerCase())) {
    throw new Error("The active Script Asset must use a TypeScript extension (.ts, .tsx, .mts, or .cts).");
  }

  const scriptAssets = project.assets.filter((asset) => asset.kind === "script");
  if (scriptAssets.length > MAX_SCRIPT_ASSETS) {
    throw new Error("The Project exceeds the TypeScript checker limit of " + MAX_SCRIPT_ASSETS + " Script Assets.");
  }
  const diagnostics = [];
  const rootNames = [];
  for (const asset of scriptAssets) {
    if (![".ts", ".tsx", ".mts", ".cts"].includes(path.extname(asset.path).toLowerCase())) continue;
    const fullPath = safeJoin(projectRoot, asset.path);
    if (!fullPath) {
      diagnostics.push({ code: 90003, severity: "error", message: "Script Asset path is unsafe.", path: asset.path });
      continue;
    }
    if (asset.path !== relativePath) {
      try { readFileSafely(projectRoot, fullPath, 'utf8', MAX_SOURCE_BYTES); }
      catch (error) {
        diagnostics.push({
          code: 90004, severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          path: asset.path,
        });
        continue;
      }
    }
    rootNames.push(fullPath);
  }
  const activePath = safeJoin(projectRoot, relativePath);
  if (!activePath) throw new Error("The active Script Asset path is unsafe.");
  if (!rootNames.includes(activePath)) rootNames.push(activePath);

  const compiler = readCompilerOptions(projectRoot);
  diagnostics.push(...compiler.diagnostics);
  const host = createProjectCompilerHost(projectRoot, compiler.options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (fileName) => path.resolve(fileName) === activePath ? source : readFile(fileName);
  host.fileExists = (fileName) => path.resolve(fileName) === activePath || fileExists(fileName);
  const program = ts.createProgram({ rootNames, options: compiler.options, host });
  diagnostics.push(...ts.getPreEmitDiagnostics(program)
    .filter((item) =>
      item.category === ts.DiagnosticCategory.Error ||
      item.category === ts.DiagnosticCategory.Warning,
    )
    .map((item) => toDiagnostic(item, projectRoot)));
  const checkedFiles = program.getSourceFiles().filter((item) => isWithinDirectory(projectRoot, path.resolve(item.fileName))).length;
  return { compilerVersion: ts.version, checkedFiles, diagnostics };
}