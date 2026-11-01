export interface ProjectEntry {
  name: string;
  isFile: boolean;
  size: number;
  modTime: number;
  children?: ProjectEntry[];
}

export interface ProjectFilesResponse {
  hash: string;
  maxNumberOfFiles: number;
  projectNumberOfFiles: number;
  rootFile: ProjectEntry;
  error: string;
}

interface ApiErrorResponse {
  error?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Editor backend returned ${response.status}: ${text || response.statusText}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Editor backend returned invalid JSON.");
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as ApiErrorResponse).error === "string" &&
    (data as ApiErrorResponse).error
  ) {
    throw new Error((data as ApiErrorResponse).error);
  }

  return data as T;
}

export async function callEditorApi<T>(
  method: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/editor/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, body }),
    credentials: "same-origin",
  });

  return readJson<T>(response);
}

export async function getProjectFiles(): Promise<ProjectFilesResponse> {
  const result = await callEditorApi<ProjectFilesResponse>("GetProjectFiles");

  if (!result.rootFile || !Array.isArray(result.rootFile.children)) {
    throw new Error("The project file API returned an invalid rootFile tree.");
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
  content: string,
): Promise<void> {
  await callEditorApi("SetFileString", {
    path: relativePath,
    content,
  });
}


export async function createProjectFolder(relativePath: string): Promise<void> {
  await callEditorApi("CreateFolder", { path: relativePath });
}

export async function renameProjectFile(relativePath: string, newName: string): Promise<void> {
  await callEditorApi("RenameFile", { path: relativePath, newName });
}

export async function deleteProjectFiles(relativePaths: string[]): Promise<void> {
  if (relativePaths.length === 0) return;
  await callEditorApi("DeleteFiles", { paths: relativePaths });
}
