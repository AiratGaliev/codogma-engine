export interface ProjectTreeEntry {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  size: number;
  modifiedAt: number;
  children?: ProjectTreeEntry[];
}

export interface ProjectDirectorySnapshot {
  contentHash: string;
  entryLimit: number;
  entryCount: number;
  root: ProjectTreeEntry;
}

export interface TypeScriptSourceDiagnostic {
  code: number;
  severity: "error" | "warning";
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export interface TypeScriptSourceCheckResult {
  compilerVersion: string;
  checkedFiles: number;
  diagnostics: TypeScriptSourceDiagnostic[];
}

interface ProjectOperationError {
  error?: string;
  diagnostics?: Array<{ path?: string; message: string }>;
}

async function readJson<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!response.ok) {
    let message = `Project service returned ${response.status}: ${response.statusText}`;
    try {
      const errorData = JSON.parse(responseText) as ProjectOperationError;
      if (typeof errorData.error === "string" && errorData.error) {
        message = errorData.error;
        if (Array.isArray(errorData.diagnostics) && errorData.diagnostics.length > 0) {
          message += "\n" + errorData.diagnostics
            .map((item) => (item.path ? item.path + ": " : "") + item.message)
            .join("\n");
        }
      }
    } catch {
      if (responseText) message += `: ${responseText}`;
    }
    throw new Error(message);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error("Project service returned invalid JSON.");
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as ProjectOperationError).error === "string" &&
    (data as ProjectOperationError).error
  ) {
    throw new Error((data as ProjectOperationError).error);
  }

  return data as T;
}

async function callProjectOperation<T>(
  operation: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/editor/project/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, arguments: args }),
    credentials: "same-origin",
  });

  return readJson<T>(response);
}

export async function getProjectDirectorySnapshot(): Promise<ProjectDirectorySnapshot> {
  const result = await callProjectOperation<ProjectDirectorySnapshot>("project.listEntries");

  if (
    !result.root ||
    result.root.kind !== "directory" ||
    result.root.relativePath !== "" ||
    !Array.isArray(result.root.children)
  ) {
    throw new Error("The project service returned an invalid directory tree.");
  }

  return result;
}

export async function readProjectFile(relativePath: string): Promise<string> {
  const encodedPath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await fetch(`/editor/project/${encodedPath}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Cannot read project file "${relativePath}" (${response.status}).`,
    );
  }

  return response.text();
}

export async function writeProjectFile(
  relativePath: string,
  text: string,
): Promise<void> {
  await callProjectOperation("project.writeFile", { relativePath, text });
}

export async function createProjectDirectory(relativePath: string): Promise<void> {
  await callProjectOperation("project.createDirectory", { relativePath });
}

export async function checkProjectTypeScript(
  relativePath: string,
  source: string,
): Promise<TypeScriptSourceCheckResult> {
  const result = await callProjectOperation<TypeScriptSourceCheckResult>("project.checkTypeScript", {
    relativePath,
    source,
  });
  if (
    !result ||
    typeof result.compilerVersion !== "string" ||
    !Number.isInteger(result.checkedFiles) ||
    result.checkedFiles < 0 ||
    !Array.isArray(result.diagnostics) ||
    result.diagnostics.some((diagnostic) =>
      !diagnostic ||
      !Number.isInteger(diagnostic.code) ||
      (diagnostic.severity !== "error" && diagnostic.severity !== "warning") ||
      typeof diagnostic.message !== "string" ||
      (diagnostic.path !== undefined && typeof diagnostic.path !== "string") ||
      (diagnostic.line !== undefined && (!Number.isInteger(diagnostic.line) || diagnostic.line < 1)) ||
      (diagnostic.column !== undefined && (!Number.isInteger(diagnostic.column) || diagnostic.column < 1)),
    )
  ) {
    throw new Error("The Project service returned invalid TypeScript diagnostics.");
  }
  return result;
}

export async function renameProjectEntry(
  sourcePath: string,
  destinationName: string,
): Promise<void> {
  const normalizedPath = sourcePath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");

  if (
    !normalizedPath ||
    normalizedPath.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalizedPath) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Cannot rename a project entry with an invalid relative path.");
  }

  if (
    !destinationName ||
    destinationName === "." ||
    destinationName === ".." ||
    destinationName.includes("/") ||
    destinationName.includes("\\") ||
    destinationName.includes(String.fromCharCode(0))
  ) {
    throw new Error("The destination name must be a single non-empty path segment.");
  }

  const parentPath = segments.slice(0, -1).join("/");
  const destinationPath = parentPath ? `${parentPath}/${destinationName}` : destinationName;

  await callProjectOperation("project.renameEntry", {
    sourcePath: normalizedPath,
    destinationPath,
  });
}

export async function deleteProjectEntries(relativePaths: string[]): Promise<void> {
  if (relativePaths.length === 0) return;
  await callProjectOperation("project.deleteEntries", { relativePaths });
}


export interface ProjectManagerDiagnostic {
  code: string;
  severity: string;
  message: string;
  path?: string;
}

export interface ManagedProjectDirectory {
  name: string;
  relativePath: string;
  isProject: boolean;
  manifestValid: boolean | null;
  projectId?: string;
  projectName?: string;
  runtimeAdapterId?: string;
  diagnostics?: ProjectManagerDiagnostic[];
}

export interface ManagedRecentProject {
  projectId: string;
  name: string;
  relativePath: string;
  lastOpenedAt: string;
  status: "available" | "invalid" | "missing";
  diagnostics: ProjectManagerDiagnostic[];
}

export interface ProjectManagerTemplate {
  id: string;
  name: string;
  description: string;
}

export interface ProjectManagerSnapshot {
  projectsRoot: string;
  activeProject: { projectId: string; name: string; relativePath: string | null } | null;
  templates: ProjectManagerTemplate[];
  directories: ManagedProjectDirectory[];
  projects: ManagedProjectDirectory[];
  recentProjects: ManagedRecentProject[];
  recentError: string;
  scanLimitReached: boolean;
  scanError: string;
  startupProjectError: string;
}

export interface CreateManagedProjectInput {
  name: string;
  folderName: string;
  parentRelativePath?: string;
  templateId?: string;
}

export interface ManagedProjectActivation {
  activeProject: { projectId: string; name: string; relativePath: string };
  recentWarning: string;
}

export async function getProjectManagerSnapshot(): Promise<ProjectManagerSnapshot> {
  return callProjectOperation<ProjectManagerSnapshot>("projectManager.getSnapshot");
}

export async function createManagedProject(
  input: CreateManagedProjectInput,
): Promise<ManagedProjectActivation> {
  return callProjectOperation<ManagedProjectActivation>("projectManager.create", { ...input });
}

export async function openManagedProject(relativePath: string): Promise<ManagedProjectActivation> {
  return callProjectOperation<ManagedProjectActivation>("projectManager.open", { relativePath });
}

export async function removeRecentManagedProject(projectId: string): Promise<void> {
  await callProjectOperation("projectManager.removeRecent", { projectId });
}
