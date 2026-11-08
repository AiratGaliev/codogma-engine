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

interface ProjectOperationError {
  error?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Project service returned ${response.status}: ${responseText || response.statusText}`,
    );
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

export async function callProjectOperation<T>(
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
