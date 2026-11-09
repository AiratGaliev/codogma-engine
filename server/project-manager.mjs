import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  parseProjectDocument,
  parseSceneDocument,
  parsePrefabDocument,
  serializeProjectDocument,
  serializeSceneDocument,
} from "../packages/cge/dist/index.js";
import {
  ensureProjectDirectorySafely,
  readFileSafely,
  readProjectDirectoryEntriesSafelySync,
  removeProjectEntrySafely,
  renameProjectEntrySafely,
  safeJoin,
  statProjectDirectorySafelySync,
  statProjectFileSafely,
  writeNewFileSafely,
} from "./path-security.mjs";

const PROJECT_MANIFEST = "project.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const RECENT_PROJECT_LIMIT = 12;
const DIRECTORY_SCAN_LIMIT = 500;
const DIRECTORY_SCAN_DEPTH = 4;

export const BUILT_IN_PROJECT_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "empty-2d",
    name: "Empty 2D Project",
    description: "A clean native project with one empty starter Scene and the Phaser runtime adapter.",
  }),
]);

export class ProjectManagerError extends Error {
  constructor(message, statusCode = 400, diagnostics = []) {
    super(message);
    this.name = "ProjectManagerError";
    this.statusCode = statusCode;
    this.diagnostics = diagnostics;
  }
}

function diagnostic(code, message, relativePath) {
  return {
    code,
    severity: "error",
    message,
    ...(relativePath ? { path: relativePath } : {}),
  };
}

function formatDiagnostics(diagnostics) {
  return diagnostics
    .map((item) => `${item.path ? `${item.path}: ` : ""}${item.message}`)
    .join("\n");
}

function normalizeRelativeDirectory(value, { allowEmpty = false } = {}) {
  if (allowEmpty && value === "") return "";
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return null;
  if (value.startsWith("/") || value.startsWith("\\") || /^[a-zA-Z]:/.test(value)) return null;
  if (value.includes("\\")) return null;

  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.join("/");
}
function normalizeFolderName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (
    name.length === 0
    || name.length > 80
    || Buffer.byteLength(name, "utf8") > 240
    || name === "."
    || name === ".."
    || name.includes("/")
    || /[<>:"\\|?*\u0000-\u001f]/.test(name)
    || /[. ]$/.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)
  ) return null;
  return name;
}
function isNotFound(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

function isWithinDirectory(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function readManifest(directory) {
  try {
    const manifestPath = path.join(directory, PROJECT_MANIFEST);
    const manifestStat = fs.lstatSync(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      return { diagnostics: [diagnostic("PROJECT_MANIFEST_UNSAFE", "project.json must be a regular file, not a symbolic link.", PROJECT_MANIFEST)] };
    }
    const content = readFileSafely(directory, manifestPath, "utf8", MAX_MANIFEST_BYTES);
    return parseProjectDocument(content);
  } catch (error) {
    return {
      diagnostics: [diagnostic(
        "PROJECT_MANIFEST_UNREADABLE",
        error instanceof Error ? error.message : String(error),
        PROJECT_MANIFEST,
      )],
    };
  }
}

function appendCoreDiagnostics(target, diagnostics, relativePath) {
  for (const item of diagnostics) {
    target.push({
      ...item,
      path: item.path ? `${relativePath}:${item.path}` : relativePath,
    });
  }
}

/**
 * Read-only validation for Project Manager open/recovery. Project Model
 * validation and serialization are delegated to @codogma/cge; this module
 * adds filesystem existence and safe-resolution checks at the server edge.
 */
export async function validateProjectDirectory(projectDirectory) {
  let root;
  try {
    root = await fsp.realpath(path.resolve(projectDirectory));
    const rootStat = await fsp.stat(root);
    if (!rootStat.isDirectory()) {
      return { valid: false, diagnostics: [diagnostic("PROJECT_DIRECTORY_INVALID", "Project path is not a directory.")] };
    }
  } catch (error) {
    return {
      valid: false,
      diagnostics: [diagnostic(
        "PROJECT_DIRECTORY_UNAVAILABLE",
        error instanceof Error ? error.message : String(error),
      )],
    };
  }

  const manifest = readManifest(root);
  if (!manifest.value) {
    return {
      valid: false,
      diagnostics: manifest.diagnostics.length
        ? manifest.diagnostics
        : [diagnostic("PROJECT_MANIFEST_INVALID", "The native Project manifest could not be parsed.", PROJECT_MANIFEST)],
    };
  }

  const project = manifest.value;
  const diagnostics = [];
  if (project.scenes.length === 0) {
    diagnostics.push(diagnostic("PROJECT_NO_STARTER_SCENE", "The project does not register a Scene that the Editor Host can open.", PROJECT_MANIFEST));
  }

  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const assetsByPath = new Map();
  for (const asset of project.assets) {
    const fullPath = safeJoin(root, asset.path);
    if (!fullPath || fullPath === root) {
      diagnostics.push(diagnostic("PROJECT_ASSET_PATH_UNSAFE", `Asset "${asset.id}" resolves outside the project.`, asset.path));
      continue;
    }

    const stat = await statProjectFileSafely(root, fullPath);
    if (!stat || !stat.isFile()) {
      diagnostics.push(diagnostic("PROJECT_ASSET_MISSING", `Registered ${asset.kind} asset "${asset.id}" is missing or is not a regular file.`, asset.path));
      continue;
    }
    assetsByPath.set(asset.id, fullPath);
  }

  const prefabIds = new Set(project.prefabs.map((prefab) => prefab.id));
  const prefabs = new Map();
  for (const reference of project.prefabs) {
    const asset = assets.get(reference.assetId);
    const fullPath = assetsByPath.get(reference.assetId);
    if (!asset || asset.kind !== "prefab" || !fullPath) continue;

    try {
      const content = readFileSafely(root, fullPath, "utf8", MAX_DOCUMENT_BYTES);
      const parsed = parsePrefabDocument(content, { assets, prefabIds, prefabs });
      if (!parsed.value) {
        appendCoreDiagnostics(diagnostics, parsed.diagnostics, asset.path);
      } else if (parsed.value.id !== reference.id) {
        diagnostics.push(diagnostic("PROJECT_PREFAB_ID_MISMATCH", `Prefab document id "${parsed.value.id}" does not match manifest id "${reference.id}".`, asset.path));
      } else {
        prefabs.set(reference.id, parsed.value);
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        "PROJECT_PREFAB_UNREADABLE",
        error instanceof Error ? error.message : String(error),
        asset.path,
      ));
    }
  }

  const sceneContext = { assets, prefabIds, prefabs };
  for (const reference of project.scenes) {
    const asset = assets.get(reference.assetId);
    const fullPath = assetsByPath.get(reference.assetId);
    if (!asset || asset.kind !== "scene" || !fullPath) continue;

    try {
      const content = readFileSafely(root, fullPath, "utf8", MAX_DOCUMENT_BYTES);
      const parsed = parseSceneDocument(content, sceneContext);
      if (!parsed.value) {
        appendCoreDiagnostics(diagnostics, parsed.diagnostics, asset.path);
      } else if (parsed.value.id !== reference.id) {
        diagnostics.push(diagnostic("PROJECT_SCENE_ID_MISMATCH", `Scene document id "${parsed.value.id}" does not match manifest id "${reference.id}".`, asset.path));
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        "PROJECT_SCENE_UNREADABLE",
        error instanceof Error ? error.message : String(error),
        asset.path,
      ));
    }
  }

  return {
    valid: diagnostics.length === 0,
    project,
    projectDirectory: root,
    diagnostics,
  };
}

function projectManifestSummary(directory, relativePath) {
  let manifestEntry;
  try {
    manifestEntry = fs.lstatSync(path.join(directory, PROJECT_MANIFEST));
  } catch {
    return {
      name: path.basename(directory),
      relativePath,
      isProject: false,
      manifestValid: null,
    };
  }

  if (!manifestEntry.isFile() || manifestEntry.isSymbolicLink()) {
    return {
      name: path.basename(directory),
      relativePath,
      isProject: true,
      manifestValid: false,
      diagnostics: [diagnostic("PROJECT_MANIFEST_UNSAFE", "project.json must be a regular file, not a symbolic link.", PROJECT_MANIFEST)],
    };
  }

  const parsed = readManifest(directory);
  if (!parsed.value) {
    return {
      name: path.basename(directory),
      relativePath,
      isProject: true,
      manifestValid: false,
      diagnostics: parsed.diagnostics,
    };
  }

  return {
    name: path.basename(directory),
    relativePath,
    isProject: true,
    manifestValid: true,
    projectId: parsed.value.id,
    projectName: parsed.value.name,
    runtimeAdapterId: parsed.value.runtime.adapterId,
  };
}

async function collectProjectDirectories(projectsRoot) {
  const results = [];
  const scanErrors = [];
  let inspected = 0;

  async function visit(directory, relativeDirectory, depth) {
    if (depth > DIRECTORY_SCAN_DEPTH || inspected >= DIRECTORY_SCAN_LIMIT) return;
    const entries = readProjectDirectoryEntriesSafelySync(projectsRoot, directory);
    if (!entries) {
      scanErrors.push(relativeDirectory || ".");
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (inspected >= DIRECTORY_SCAN_LIMIT) break;
      if (!entry.isDirectory || entry.isSymbolicLink || entry.name.startsWith(".codogma-")) continue;

      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const fullPath = safeJoin(projectsRoot, relativePath);
      if (!fullPath || fullPath === projectsRoot) continue;

      inspected += 1;
      const summary = projectManifestSummary(fullPath, relativePath);
      results.push(summary);
      if (!summary.isProject && depth < DIRECTORY_SCAN_DEPTH) {
        await visit(fullPath, relativePath, depth + 1);
      }
    }
  }

  await visit(projectsRoot, "", 0);
  return {
    directories: results,
    scanLimitReached: inspected >= DIRECTORY_SCAN_LIMIT,
    scanError: scanErrors.length ? `Could not read project folders: ${scanErrors.join(", ")}` : "",
  };
}

async function readRecentRecords(userDataDirectory) {
  const filePath = path.join(userDataDirectory, "recent-projects.json");
  try {
    const fileStat = await fsp.lstat(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      return { records: [], error: "Recent Projects data is not a regular file. It was left untouched." };
    }
    const content = await fsp.readFile(filePath, "utf8");
    const document = JSON.parse(content);
    if (document?.schemaVersion !== 1 || !Array.isArray(document.projects)) {
      return { records: [], error: "Recent Projects data has an unsupported format. It was left untouched." };
    }
    const records = document.projects.filter((item) =>
      item
      && typeof item.projectId === "string"
      && typeof item.projectName === "string"
      && typeof item.relativePath === "string"
      && typeof item.lastOpenedAt === "string"
      && normalizeRelativeDirectory(item.relativePath) !== null,
    ).slice(0, RECENT_PROJECT_LIMIT);
    return { records, error: "" };
  } catch (error) {
    if (isNotFound(error)) return { records: [], error: "" };
    return {
      records: [],
      error: `Recent Projects could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function writeRecentRecords(userDataDirectory, records) {
  await fsp.mkdir(userDataDirectory, { recursive: true, mode: 0o700 });
  const filePath = path.join(userDataDirectory, "recent-projects.json");
  const temporaryPath = path.join(userDataDirectory, `.recent-projects-${crypto.randomUUID()}.tmp`);
  const payload = `${JSON.stringify({ schemaVersion: 1, projects: records.slice(0, RECENT_PROJECT_LIMIT) }, null, 2)}\n`;

  try {
    await fsp.writeFile(temporaryPath, payload, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await fsp.rename(temporaryPath, filePath);
  } finally {
    await fsp.unlink(temporaryPath).catch(() => {});
  }
}

async function rememberProject(userDataDirectory, project, relativePath) {
  const normalized = normalizeRelativeDirectory(relativePath);
  if (normalized === null) return "";

  try {
    const recent = await readRecentRecords(userDataDirectory);
    if (recent.error) return recent.error;
    const next = recent.records.filter((item) => item.projectId !== project.id);
    next.unshift({
      projectId: project.id,
      projectName: project.name,
      relativePath: normalized,
      lastOpenedAt: new Date().toISOString(),
    });
    await writeRecentRecords(userDataDirectory, next);
    return "";
  } catch (error) {
    return `Project opened, but Recent Projects could not be updated: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function resolveProjectDirectory(projectsRoot, relativePath) {
  const normalized = normalizeRelativeDirectory(relativePath);
  if (normalized === null) {
    throw new ProjectManagerError("Choose a project folder inside the configured Projects directory.", 400);
  }
  const fullPath = safeJoin(projectsRoot, normalized);
  if (!fullPath || fullPath === projectsRoot) {
    throw new ProjectManagerError("The selected path is outside the configured Projects directory.", 400);
  }
  try {
    if (fs.lstatSync(fullPath).isSymbolicLink()) {
      throw new ProjectManagerError("Project folders cannot be opened through symbolic links.", 400);
    }
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    if (isNotFound(error)) throw new ProjectManagerError("The selected project folder no longer exists.", 404);
    throw error;
  }
  const stat = statProjectDirectorySafelySync(projectsRoot, fullPath);
  if (!stat || !stat.isDirectory()) {
    throw new ProjectManagerError("The selected path is not an accessible project directory.", 404);
  }
  return { fullPath, relativePath: normalized };
}

export async function openProjectDirectory({ projectsRoot, userDataDirectory, relativePath }) {
  const target = resolveProjectDirectory(projectsRoot, relativePath);
  const validation = await validateProjectDirectory(target.fullPath);
  const canonicalProjectsRoot = await fsp.realpath(path.resolve(projectsRoot));
  if (!isWithinDirectory(canonicalProjectsRoot, validation.projectDirectory ?? target.fullPath)) {
    throw new ProjectManagerError("The project resolves outside the configured Projects directory.", 403);
  }
  if (!validation.valid || !validation.project) {
    throw new ProjectManagerError(
      `Project "${target.relativePath}" failed validation.${validation.diagnostics.length ? `\n${formatDiagnostics(validation.diagnostics)}` : ""}`,
      422,
      validation.diagnostics,
    );
  }

  const recentWarning = await rememberProject(userDataDirectory, validation.project, target.relativePath);
  return {
    projectDirectory: validation.projectDirectory,
    relativePath: target.relativePath,
    project: validation.project,
    recentWarning,
  };
}

function pathExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function assertProjectParent(projectsRoot, relativeParent) {
  const normalized = normalizeRelativeDirectory(relativeParent, { allowEmpty: true });
  if (normalized === null) {
    throw new ProjectManagerError("The selected parent folder must be inside the configured Projects directory.", 400);
  }
  const fullPath = normalized ? safeJoin(projectsRoot, normalized) : projectsRoot;
  if (!fullPath) throw new ProjectManagerError("The selected parent folder is outside the configured Projects directory.", 400);

  const stat = statProjectDirectorySafelySync(projectsRoot, fullPath);
  if (!stat || !stat.isDirectory()) {
    throw new ProjectManagerError("The selected parent folder does not exist or cannot be accessed.", 404);
  }
  if (pathExists(path.join(fullPath, PROJECT_MANIFEST))) {
    throw new ProjectManagerError("A project cannot be created inside another project directory.", 409);
  }
  return { fullPath, relativePath: normalized };
}

function createEmptyTemplate(projectName) {
  const projectId = crypto.randomUUID();
  const sceneId = crypto.randomUUID();
  const sceneAssetId = crypto.randomUUID();
  const project = {
    schemaVersion: 1,
    id: projectId,
    name: projectName,
    scenes: [{ id: sceneId, assetId: sceneAssetId }],
    assets: [{ id: sceneAssetId, path: "scenes/Main.cge-scene.json", kind: "scene" }],
    prefabs: [],
    componentModules: [],
    runtime: { adapterId: "phaser", settings: {} },
  };
  const scene = {
    schemaVersion: 1,
    id: sceneId,
    name: "Main",
    rootNodes: [],
    settings: {},
  };

  return {
    project,
    files: new Map([
      ["project.json", serializeProjectDocument(project)],
      ["scenes/Main.cge-scene.json", serializeSceneDocument(scene)],
      [".gitignore", "dist/\nnode_modules/\n.codogma-cache/\n"],
      ["README.md", `# ${projectName}\n\nAn empty 2D Codogma Engine project.\n\nThe project uses the native Project Model v1 and the `phaser` runtime adapter. Its starter scene is `scenes/Main.cge-scene.json`.\n`],
      ["assets/README.md", "# Assets\n\nPlace project-owned images, audio, fonts and other source assets here.\n"],
      ["scripts/README.md", "# Scripts\n\nPlace project-owned TypeScript scripts here. No game-specific code or optional packages are included in this template.\n"],
      ["build/README.md", "# Build\n\nBuild profiles are configured through the dedicated build workflow when that contract is available. This template does not invent or serialize a build-profile schema.\n"],
    ]),
  };
}

async function publishStagedProject({ projectsRoot, parent, finalPath, stagePath, stageName, projectId }) {
  if (pathExists(finalPath)) {
    throw new ProjectManagerError("A file or folder with this project name already exists. Choose another name or location.", 409);
  }

  // Both directories are siblings on the same filesystem. The final rename is
  // atomic; a short-lived exclusive sibling lock serializes Project Manager
  // create requests from multiple Codogma server instances.
  if (!await renameProjectEntrySafely(projectsRoot, stagePath, finalPath)) {
    throw new ProjectManagerError("The staged project could not be published. The destination was not changed.", 409);
  }

  const published = await validateProjectDirectory(finalPath);
  if (!published.valid || published.project?.id !== projectId) {
    await removeProjectEntrySafely(projectsRoot, finalPath, { recursive: true, force: true });
    throw new ProjectManagerError(
      "The published project failed its post-publish validation and was removed.",
      500,
      published.diagnostics,
    );
  }

  return {
    projectDirectory: published.projectDirectory,
    relativePath: path.relative(projectsRoot, finalPath).split(path.sep).join("/"),
    project: published.project,
    stageName,
    parent,
  };
}

export async function createEmptyProject({
  projectsRoot,
  userDataDirectory,
  name,
  folderName,
  parentRelativePath = "",
  templateId = "empty-2d",
}, dependencies = {}) {
  if (templateId !== "empty-2d") {
    throw new ProjectManagerError(`Unknown project template "${templateId}".`, 400);
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 128 || /[\u0000-\u001f]/.test(name)) {
    throw new ProjectManagerError("Project name must contain between 1 and 128 printable characters.", 400);
  }
  const projectName = name.trim();
  const normalizedFolderName = normalizeFolderName(folderName);
  if (!normalizedFolderName) {
    throw new ProjectManagerError("Folder name is invalid. Use a single folder name without path separators or reserved characters.", 400);
  }

  const parent = assertProjectParent(projectsRoot, parentRelativePath);
  try {
    fs.accessSync(parent.fullPath, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  } catch {
    throw new ProjectManagerError("The selected location is not accessible for creating a project. Check folder permissions.", 403);
  }
  const finalRelativePath = parent.relativePath
    ? `${parent.relativePath}/${normalizedFolderName}`
    : normalizedFolderName;
  const finalPath = safeJoin(projectsRoot, finalRelativePath);
  if (!finalPath || finalPath === projectsRoot) {
    throw new ProjectManagerError("The destination folder is outside the configured Projects directory.", 400);
  }
  if (pathExists(finalPath)) {
    throw new ProjectManagerError("A file or folder with this project name already exists. Nothing was overwritten.", 409);
  }

  const lockPath = path.join(parent.fullPath, `.${normalizedFolderName}.codogma-create.lock`);
  let lockIdentity;
  let stagePath;
  let published = false;

  try {
    const lockContent = JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() });
    if (!writeNewFileSafely(projectsRoot, lockPath, lockContent)) {
      if (pathExists(lockPath)) {
        throw new ProjectManagerError("Another project creation is already using this folder.", 409);
      }
      throw new ProjectManagerError("The selected location is not writable. Check folder permissions.", 403);
    }
    lockIdentity = fs.lstatSync(lockPath);
    if (pathExists(finalPath)) {
      throw new ProjectManagerError("A file or folder with this project name already exists. Nothing was overwritten.", 409);
    }

    const stageName = `.codogma-staging-${process.pid}-${crypto.randomUUID()}`;
    stagePath = path.join(parent.fullPath, stageName);
    if (!safeJoin(projectsRoot, path.relative(projectsRoot, stagePath).split(path.sep).join("/"))
        || !await ensureProjectDirectorySafely(projectsRoot, stagePath)) {
      throw new ProjectManagerError("Could not create a safe staging directory inside the Projects folder.", 500);
    }

    const template = createEmptyTemplate(projectName);
    for (const [relativePath, content] of template.files) {
      const fullPath = safeJoin(stagePath, relativePath);
      if (!fullPath || fullPath === stagePath) {
        throw new ProjectManagerError(`Template path "${relativePath}" is not safe.`, 500);
      }
      const directory = path.dirname(fullPath);
      if (directory !== stagePath && !await ensureProjectDirectorySafely(stagePath, directory)) {
        throw new ProjectManagerError(`Could not prepare the "${path.dirname(relativePath)}" template folder.`, 500);
      }
      const writeFile = dependencies.writeFile ?? writeNewFileSafely;
      if (!writeFile(stagePath, fullPath, content)) {
        throw new ProjectManagerError(`Could not write template file "${relativePath}". No project was published.`, 500, [
          diagnostic("PROJECT_CREATE_WRITE_FAILED", `Could not write "${relativePath}".`, relativePath),
        ]);
      }
    }

    const stagedValidation = await validateProjectDirectory(stagePath);
    if (!stagedValidation.valid || !stagedValidation.project) {
      throw new ProjectManagerError(
        `The staged project failed validation.${stagedValidation.diagnostics.length ? `\n${formatDiagnostics(stagedValidation.diagnostics)}` : ""}`,
        422,
        stagedValidation.diagnostics,
      );
    }

    const result = await publishStagedProject({
      projectsRoot,
      parent,
      finalPath,
      stagePath,
      stageName,
      projectId: stagedValidation.project.id,
    });
    published = true;

    const recentWarning = await rememberProject(userDataDirectory, result.project, result.relativePath);
    return { ...result, recentWarning };
  } catch (error) {
    if (error instanceof ProjectManagerError) throw error;
    const statusCode = error?.code === "EACCES" || error?.code === "EPERM" ? 403 : 500;
    throw new ProjectManagerError(
      `Could not create project: ${error instanceof Error ? error.message : String(error)}`,
      statusCode,
    );
  } finally {
    if (stagePath && !published) {
      await removeProjectEntrySafely(projectsRoot, stagePath, { recursive: true, force: true });
    }
    if (lockIdentity) {
      try {
        const current = await fsp.lstat(lockPath);
        if (current.isFile() && !current.isSymbolicLink() && current.dev === lockIdentity.dev && current.ino === lockIdentity.ino) {
          await removeProjectEntrySafely(projectsRoot, lockPath, { force: true });
        }
      } catch {
        // Cleanup is best-effort and never removes a replacement lock.
      }
    }
  }
}

export async function getProjectManagerSnapshot({
  projectsRoot,
  userDataDirectory,
  activeProjectDirectory = null,
  startupProjectError = "",
}) {
  const root = await fsp.realpath(projectsRoot);
  const { directories, scanLimitReached, scanError } = await collectProjectDirectories(root);
  const { records, error: recentError } = await readRecentRecords(userDataDirectory);
  const projectsById = new Map(directories.filter((item) => item.isProject && item.projectId).map((item) => [item.projectId, item]));
  let recentChanged = false;

  const recentProjects = records.map((record) => {
    const original = directories.find((item) => item.relativePath === record.relativePath);
    let match = original?.projectId === record.projectId ? original : projectsById.get(record.projectId);
    if (match && match.relativePath !== record.relativePath) {
      record.relativePath = match.relativePath;
      record.projectName = match.projectName;
      recentChanged = true;
    }

    if (match) {
      return {
        projectId: record.projectId,
        name: match.projectName || record.projectName,
        relativePath: match.relativePath,
        lastOpenedAt: record.lastOpenedAt,
        status: match.manifestValid ? "available" : "invalid",
        diagnostics: match.diagnostics ?? [],
      };
    }

    const hasInvalidOriginal = original?.isProject && !original.manifestValid;
    return {
      projectId: record.projectId,
      name: record.projectName,
      relativePath: record.relativePath,
      lastOpenedAt: record.lastOpenedAt,
      status: hasInvalidOriginal ? "invalid" : "missing",
      diagnostics: hasInvalidOriginal ? original.diagnostics ?? [] : [],
    };
  });

  if (recentChanged) {
    await writeRecentRecords(userDataDirectory, records).catch(() => {});
  }

  let activeProject = null;
  if (activeProjectDirectory) {
    const active = await validateProjectDirectory(activeProjectDirectory);
    if (active.valid && active.project) {
      let relativePath = null;
      const relative = path.relative(root, active.projectDirectory);
      if (relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) {
        relativePath = relative.split(path.sep).join("/");
      }
      activeProject = {
        projectId: active.project.id,
        name: active.project.name,
        relativePath,
      };
    }
  }

  return {
    projectsRoot: root,
    activeProject,
    templates: BUILT_IN_PROJECT_TEMPLATES,
    directories,
    projects: directories.filter((item) => item.isProject),
    recentProjects,
    recentError,
    scanLimitReached,
    scanError,
    startupProjectError,
  };
}

export async function removeRecentProject({ userDataDirectory, projectId }) {
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new ProjectManagerError("A project id is required to remove a Recent Projects entry.", 400);
  }
  const recent = await readRecentRecords(userDataDirectory);
  if (recent.error) {
    throw new ProjectManagerError(recent.error, 409);
  }
  await writeRecentRecords(userDataDirectory, recent.records.filter((item) => item.projectId !== projectId));
}
