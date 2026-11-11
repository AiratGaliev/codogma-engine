import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseProjectDocument } from "../packages/cge/dist/index.js";
import {
  readFileSafely,
  readProjectDirectoryEntriesSafelySync,
  safeJoin,
  statProjectDirectorySafelySync,
} from "./path-security.mjs";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_SCRIPT_ASSETS = 256;
const MAX_PROJECT_SOURCE_FILES = 512;

export interface ProjectTypeScriptDiagnostic {
  code: number;
  severity: "error" | "warning";
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export interface ProjectTypeScriptCheckResult {
  compilerVersion: string;
  checkedFiles: number;
  diagnostics: ProjectTypeScriptDiagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getScriptKind(fileName: string): ts.ScriptKind {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  if (extension === ".json") return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}

function isWithinDirectory(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" ||
    (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function toDiagnostic(
  diagnostic: ts.Diagnostic,
  projectRoot: string,
): ProjectTypeScriptDiagnostic {
  const position = diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    : undefined;
  let filePath: string | undefined;
  if (diagnostic.file) {
    const absolutePath = path.resolve(diagnostic.file.fileName);
    const relativePath = path.relative(projectRoot, absolutePath);
    if (
      relativePath !== "" &&
      relativePath !== ".." &&
      !relativePath.startsWith(".." + path.sep) &&
      !path.isAbsolute(relativePath)
    ) {
      filePath = relativePath.split(path.sep).join("/");
    }
  }
  return {
    code: diagnostic.code,
    severity: diagnostic.category === ts.DiagnosticCategory.Warning ? "warning" : "error",
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ...(filePath ? { path: filePath } : {}),
    ...(position ? { line: position.line + 1, column: position.character + 1 } : {}),
  };
}

function createProjectCompilerHost(
  projectRoot: string,
  options: ts.CompilerOptions,
): ts.CompilerHost {
  const libraryRoot = path.dirname(ts.getDefaultLibFilePath(options));
  const getProjectPath = (fileName: string): string | null => {
    const absolute = path.resolve(fileName);
    const relative = path.relative(projectRoot, absolute);
    if (
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)
    ) return null;
    return safeJoin(projectRoot, relative);
  };
  const isLibraryPath = (fileName: string): boolean =>
    isWithinDirectory(libraryRoot, path.resolve(fileName));
  const host = ts.createCompilerHost(options, true);
  const projectSourceFiles = new Set<string>();

  host.getCurrentDirectory = () => projectRoot;
  host.fileExists = (fileName) => {
    const candidate = getProjectPath(fileName);
    if (candidate !== null) {
      try { return fs.statSync(candidate).isFile(); } catch { return false; }
    }
    return isLibraryPath(fileName) && ts.sys.fileExists(fileName);
  };
  host.readFile = (fileName) => {
    const candidate = getProjectPath(fileName);
    if (candidate !== null) {
      try { return readFileSafely(projectRoot, candidate, "utf8", MAX_SOURCE_BYTES); } catch { return undefined; }
    }
    return isLibraryPath(fileName) ? ts.sys.readFile(fileName) : undefined;
  };
  host.directoryExists = (directoryName) => {
    const candidate = getProjectPath(directoryName);
    if (candidate !== null) return Boolean(statProjectDirectorySafelySync(projectRoot, candidate));
    return isLibraryPath(directoryName) && Boolean(ts.sys.directoryExists?.(directoryName));
  };
  host.getDirectories = (directoryName) => {
    const candidate = getProjectPath(directoryName);
    if (candidate !== null) {
      const entries = readProjectDirectoryEntriesSafelySync(projectRoot, candidate) ?? [];
      return entries
        .filter((entry) => entry.isDirectory && !entry.isSymbolicLink)
        .map((entry) => path.join(candidate, entry.name));
    }
    return isLibraryPath(directoryName) ? (ts.sys.getDirectories?.(directoryName) ?? []) : [];
  };
  host.realpath = (fileName) => {
    const candidate = getProjectPath(fileName);
    if (candidate !== null) {
      try { return fs.realpathSync(candidate); } catch { return candidate; }
    }
    return isLibraryPath(fileName)
      ? (ts.sys.realpath?.(fileName) ?? path.resolve(fileName))
      : path.resolve(fileName);
  };
  host.getSourceFile = (fileName, languageVersion, onError) => {
    const absolutePath = path.resolve(fileName);
    if (isWithinDirectory(projectRoot, absolutePath)) {
      const canonicalPath = host.getCanonicalFileName(absolutePath);
      if (!projectSourceFiles.has(canonicalPath)) {
        if (projectSourceFiles.size >= MAX_PROJECT_SOURCE_FILES) {
          onError?.("Project TypeScript diagnostics reached the 512 Project source-file limit.");
          return undefined;
        }
        projectSourceFiles.add(canonicalPath);
      }
    }
    const content = host.readFile(fileName);
    if (content === undefined) {
      onError?.("Unable to read a safe TypeScript source file: " + fileName);
      return undefined;
    }
    return ts.createSourceFile(
      fileName,
      content,
      languageVersion,
      true,
      getScriptKind(fileName),
    );
  };
  const resolutionCache = ts.createModuleResolutionCache(
    projectRoot,
    (fileName) => host.getCanonicalFileName(fileName),
    options,
  );
  host.resolveModuleNames = (moduleNames, containingFile, _reusedNames, redirectedReference) =>
    moduleNames.map((moduleName) => ts.resolveModuleName(
      moduleName,
      containingFile,
      options,
      host,
      resolutionCache,
      redirectedReference,
    ).resolvedModule);
  return host;
}

function readCompilerOptions(projectRoot: string): {
  options: ts.CompilerOptions;
  diagnostics: ProjectTypeScriptDiagnostic[];
} {
  const defaults: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  };
  const diagnostics: ProjectTypeScriptDiagnostic[] = [];
  const configPath = safeJoin(projectRoot, "tsconfig.json");
  if (!configPath) return { options: defaults, diagnostics };

  let content: string;
  try {
    content = readFileSafely(projectRoot, configPath, "utf8", MAX_MANIFEST_BYTES);
  } catch (error) {
    if (fs.existsSync(configPath)) {
      diagnostics.push({
        code: 90001,
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        path: "tsconfig.json",
      });
    }
    return { options: defaults, diagnostics };
  }

  const parsed = ts.parseConfigFileTextToJson(configPath, content);
  if (parsed.error) diagnostics.push(toDiagnostic(parsed.error, projectRoot));
  const config: Record<string, unknown> = isRecord(parsed.config) ? parsed.config : {};
  if (config.extends) {
    diagnostics.push({
      code: 90002,
      severity: "warning",
      message: "The Editor checker reads compilerOptions from the root tsconfig.json but does not resolve its extends chain.",
      path: "tsconfig.json",
    });
  }
  const rawOptions = isRecord(config.compilerOptions) ? config.compilerOptions : {};
  const converted = ts.convertCompilerOptionsFromJson(rawOptions, projectRoot, configPath);
  diagnostics.push(...converted.errors.map((item) => toDiagnostic(item, projectRoot)));
  return {
    options: { ...defaults, ...converted.options, noEmit: true },
    diagnostics,
  };
}

/**
 * Semantically checks registered TypeScript Script Assets and their Project-local
 * imports. The active editor buffer is overlaid without writing it to disk.
 * Project source is only parsed and type-checked; it is never evaluated.
 */
export function checkProjectTypeScript(
  projectDirectory: string,
  relativePath: string,
  source: string,
): ProjectTypeScriptCheckResult {
  if (typeof relativePath !== "string" || !relativePath || typeof source !== "string") {
    throw new TypeError("relativePath and source are required for TypeScript checking.");
  }
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    throw new Error("The active TypeScript source exceeds the 2 MiB diagnostics limit.");
  }

  const projectRoot = fs.realpathSync(path.resolve(projectDirectory));
  const manifestPath = safeJoin(projectRoot, "project.json");
  if (!manifestPath) throw new Error("The native Project manifest cannot be resolved safely.");
  const manifestContent = readFileSafely(projectRoot, manifestPath, "utf8", MAX_MANIFEST_BYTES);
  const parsedProject = parseProjectDocument(manifestContent);
  if (!parsedProject.value) {
    throw new Error("Cannot type-check an invalid Project manifest.");
  }
  const project = parsedProject.value;

  const activeAsset = project.assets.find((asset) =>
    asset.kind === "script" && asset.path === relativePath,
  );
  if (!activeAsset) {
    throw new Error("TypeScript diagnostics require a registered Script Asset: " + relativePath);
  }
  if (![".ts", ".tsx", ".mts", ".cts"].includes(path.extname(relativePath).toLowerCase())) {
    throw new Error("The active Script Asset must use a TypeScript extension (.ts, .tsx, .mts, or .cts).");
  }

  const scriptAssets = project.assets.filter((asset) => asset.kind === "script");
  if (scriptAssets.length > MAX_SCRIPT_ASSETS) {
    throw new Error("The Project exceeds the TypeScript checker limit of " + MAX_SCRIPT_ASSETS + " Script Assets.");
  }

  const diagnostics: ProjectTypeScriptDiagnostic[] = [];
  const rootNames: string[] = [];
  for (const asset of scriptAssets) {
    if (![".ts", ".tsx", ".mts", ".cts"].includes(path.extname(asset.path).toLowerCase())) continue;
    const fullPath = safeJoin(projectRoot, asset.path);
    if (!fullPath) {
      diagnostics.push({
        code: 90003,
        severity: "error",
        message: "Script Asset path is unsafe.",
        path: asset.path,
      });
      continue;
    }
    if (asset.path !== relativePath) {
      try {
        readFileSafely(projectRoot, fullPath, "utf8", MAX_SOURCE_BYTES);
      } catch (error) {
        diagnostics.push({
          code: 90004,
          severity: "error",
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
  host.readFile = (fileName) =>
    path.resolve(fileName) === activePath ? source : readFile(fileName);
  host.fileExists = (fileName) =>
    path.resolve(fileName) === activePath || fileExists(fileName);

  const program = ts.createProgram({
    rootNames,
    options: compiler.options,
    host,
  });
  diagnostics.push(...ts.getPreEmitDiagnostics(program)
    .filter((item) =>
      item.category === ts.DiagnosticCategory.Error ||
      item.category === ts.DiagnosticCategory.Warning,
    )
    .map((item) => toDiagnostic(item, projectRoot)));
  const checkedFiles = program.getSourceFiles()
    .filter((item) => isWithinDirectory(projectRoot, path.resolve(item.fileName))).length;

  return {
    compilerVersion: ts.version,
    checkedFiles,
    diagnostics,
  };
}
