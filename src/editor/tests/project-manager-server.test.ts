import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import { afterEach, test } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../../..");
const editorHostDirectory = path.join(repositoryRoot, "src", "editor", "dist");
const temporaryDirectories = new Set<string>();

async function reserveLoopbackPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function startProjectManagerServer(projectsRoot: string, userDataDirectory: string, initialProject = "") {
  const port = await reserveLoopbackPort();
  const child = spawn(process.execPath, [path.join(repositoryRoot, "server", "server.mjs")], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      PROJECT_DIR: initialProject,
      PROJECTS_DIR: projectsRoot,
      CODOGMA_USER_DATA_DIR: userDataDirectory,
      EDITOR_HOST_DIR: editorHostDirectory,
      CODOGMA_ALLOWED_ORIGINS: "",
      CODOGMA_ALLOWED_HOSTS: "",
    },
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { output += chunk; });
  child.stderr.on("data", (chunk: string) => { output += chunk; });

  const origin = "http://127.0.0.1:" + port;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Project Manager server exited during startup:\n" + output);
    }
    try {
      const response = await fetch(origin + "/editor/mcp-bridge-status");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Wait until the loopback listener is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (!ready) {
    child.kill("SIGTERM");
    throw new Error("Project Manager server did not become ready:\n" + output);
  }

  return {
    origin,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGTERM");
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    },
  };
}

async function callProjectManager<T>(origin: string, operation: string, args: Record<string, unknown> = {}) {
  const response = await fetch(origin + "/editor/project/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, arguments: args }),
  });
  const payload = await response.json() as T & { error?: string };
  return { response, payload };
}

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
  temporaryDirectories.clear();
});

test("Project Manager creates, opens and restores a validated project after server restart", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "codogma-project-manager-server-"));
  temporaryDirectories.add(temporaryRoot);
  const projectsRoot = path.join(temporaryRoot, "projects");
  const userDataDirectory = path.join(temporaryRoot, "user-data");
  await mkdir(projectsRoot, { recursive: true });
  await mkdir(userDataDirectory, { recursive: true });

  let createdProjectId = "";
  let server = await startProjectManagerServer(projectsRoot, userDataDirectory);
  try {
    const initial = await callProjectManager<Record<string, unknown>>(server.origin, "projectManager.getSnapshot");
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload.activeProject, null);
    assert.equal(initial.payload.projectsRoot, projectsRoot);
    const unopenedFile = await fetch(server.origin + "/editor/project/project.json");
    assert.equal(unopenedFile.status, 409);
    const unopenedMcp = await fetch(server.origin + "/editor/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(unopenedMcp.status, 409);

    const created = await callProjectManager<{ activeProject: { projectId: string; name: string; relativePath: string } }>(
      server.origin,
      "projectManager.create",
      { name: "Demo Project", folderName: "Demo-Project", templateId: "empty-2d" },
    );
    assert.equal(created.response.status, 200);
    assert.equal(created.payload.activeProject.name, "Demo Project");
    assert.equal(created.payload.activeProject.relativePath, "Demo-Project");

    const manifestText = await readFile(path.join(projectsRoot, "Demo-Project", "project.json"), "utf8");
    const manifest = JSON.parse(manifestText) as { id: string; scenes: Array<{ id: string; assetId: string }>; assets: Array<{ path: string }> };
    assert.equal(manifest.id, created.payload.activeProject.projectId);
    createdProjectId = manifest.id;
    assert.equal(manifest.scenes.length, 1);
    const sceneAsset = manifest.assets[0];
    const sceneReference = manifest.scenes[0];
    assert.ok(sceneAsset);
    assert.ok(sceneReference);

    const sceneText = await readFile(path.join(projectsRoot, "Demo-Project", sceneAsset.path), "utf8");
    assert.equal((JSON.parse(sceneText) as { id: string }).id, sceneReference.id);

    const duplicate = await callProjectManager(server.origin, "projectManager.create", {
      name: "Another Name",
      folderName: "Demo-Project",
      templateId: "empty-2d",
    });
    assert.equal(duplicate.response.status, 409);
    assert.match(duplicate.payload.error ?? "", /already exists/i);

    const activeManifest = await fetch(server.origin + "/editor/project/project.json");
    assert.equal(activeManifest.status, 200);

    const recents = JSON.parse(await readFile(path.join(userDataDirectory, "recent-projects.json"), "utf8")) as {
      projects: Array<{ projectId: string; relativePath: string }>;
    };
    const recentRecord = recents.projects[0];
    assert.ok(recentRecord);
    assert.equal(recentRecord.projectId, manifest.id);
    assert.equal(recentRecord.relativePath, "Demo-Project");
    assert.equal(JSON.stringify(recents).includes(projectsRoot), false);
  } finally {
    await server.stop();
  }

  server = await startProjectManagerServer(projectsRoot, userDataDirectory, path.join(projectsRoot, "Demo-Project"));
  try {
    const restored = await callProjectManager<{ activeProject: { projectId: string; relativePath: string } }>(
      server.origin,
      "projectManager.getSnapshot",
    );
    assert.equal(restored.response.status, 200);
    assert.equal(restored.payload.activeProject?.relativePath, "Demo-Project");
    assert.equal(restored.payload.activeProject?.projectId, createdProjectId);
    const tree = await fetch(server.origin + "/editor/project/project.json");
    assert.equal(tree.status, 200);
  } finally {
    await server.stop();
  }
});

