import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import {
  createEmptyProject,
  getProjectManagerSnapshot,
  openProjectDirectory,
  ProjectManagerError,
  removeRecentProject,
  validateProjectDirectory,
} from "../server/project-manager.mjs";
import { writeNewFileSafely } from "../server/path-security.mjs";

const sandboxes = new Set();

async function createSandbox() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "codogma-project-manager-"));
  sandboxes.add(root);
  const projectsRoot = path.join(root, "projects");
  const userDataDirectory = path.join(root, "user-data");
  await fsp.mkdir(projectsRoot, { recursive: true });
  await fsp.mkdir(userDataDirectory, { recursive: true });
  return { root, projectsRoot, userDataDirectory };
}

async function createProject(options, extra = {}) {
  return createEmptyProject({
    ...options,
    name: "My Game",
    folderName: "My-Game",
    templateId: "empty-2d",
  }, extra);
}

after(async () => {
  await Promise.all([...sandboxes].map((directory) => fsp.rm(directory, { recursive: true, force: true })));
});

test("Empty 2D template is generated through Core serializers and passes Project/Scene validation", async () => {
  const sandbox = await createSandbox();
  const result = await createProject(sandbox);
  const projectDirectory = result.projectDirectory;

  assert.equal(result.project.name, "My Game");
  assert.equal(result.project.runtime.adapterId, "phaser");
  assert.equal(result.project.scenes.length, 1);
  assert.equal(result.project.assets.length, 1);
  assert.equal(result.project.componentModules.length, 0);

  const manifestText = await fsp.readFile(path.join(projectDirectory, "project.json"), "utf8");
  const scenePath = result.project.assets[0].path;
  const sceneText = await fsp.readFile(path.join(projectDirectory, scenePath), "utf8");
  const manifest = JSON.parse(manifestText);
  const scene = JSON.parse(sceneText);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.scenes[0].id, scene.id);
  assert.equal(scene.schemaVersion, 1);
  assert.deepEqual(scene.rootNodes, []);
  assert.equal(fs.existsSync(path.join(projectDirectory, "assets", "README.md")), true);
  assert.equal(fs.existsSync(path.join(projectDirectory, "scripts", "README.md")), true);
  assert.equal(fs.existsSync(path.join(projectDirectory, "build", "README.md")), true);
  assert.equal(fs.existsSync(path.join(projectDirectory, "package.json")), false);
  assert.equal(fs.existsSync(path.join(projectDirectory, "src", "main.ts")), false);

  const validation = await validateProjectDirectory(projectDirectory);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
  assert.equal(validation.project.id, manifest.id);
  assert.match(result.relativePath, /^My-Game$/);
});

test("existing destination is never overwritten and duplicate creation is rejected", async () => {
  const sandbox = await createSandbox();
  await createProject(sandbox);
  const readme = path.join(sandbox.projectsRoot, "My-Game", "README.md");
  const original = await fsp.readFile(readme, "utf8");

  await assert.rejects(
    createProject(sandbox),
    (error) => error instanceof ProjectManagerError && error.statusCode === 409,
  );

  assert.equal(await fsp.readFile(readme, "utf8"), original);
  assert.equal(fs.existsSync(path.join(sandbox.projectsRoot, "My-Game", "project.json")), true);
  assert.deepEqual(await fsp.readdir(sandbox.projectsRoot), ["My-Game"]);
});

test("a staging write failure cleans temporary files and leaves no published project", async () => {
  const sandbox = await createSandbox();
  let writeCount = 0;

  await assert.rejects(
    createProject(sandbox, {
      writeFile: (base, target, content) => {
        writeCount += 1;
        if (writeCount === 2) return false;
        return writeNewFileSafely(base, target, content);
      },
    }),
    (error) => error instanceof ProjectManagerError && error.statusCode === 500,
  );

  assert.equal(writeCount, 2);
  assert.deepEqual(await fsp.readdir(sandbox.projectsRoot), []);
});

test("opening a corrupt manifest fails closed and keeps the recent entry marked invalid", async () => {
  const sandbox = await createSandbox();
  const created = await createProject(sandbox);
  await fsp.writeFile(path.join(created.projectDirectory, "project.json"), "{ not valid json", "utf8");

  await assert.rejects(
    openProjectDirectory({
      projectsRoot: sandbox.projectsRoot,
      userDataDirectory: sandbox.userDataDirectory,
      relativePath: created.relativePath,
    }),
    (error) => error instanceof ProjectManagerError && error.statusCode === 422,
  );

  const snapshot = await getProjectManagerSnapshot(sandbox);
  assert.equal(snapshot.recentProjects.length, 1);
  assert.equal(snapshot.recentProjects[0].status, "invalid");
  assert.equal(fs.existsSync(path.join(sandbox.userDataDirectory, "recent-projects.json")), true);
});

test("open, restart snapshot and relocation recovery use stable Project IDs without absolute recents paths", async () => {
  const sandbox = await createSandbox();
  const created = await createProject(sandbox);
  const opened = await openProjectDirectory({
    projectsRoot: sandbox.projectsRoot,
    userDataDirectory: sandbox.userDataDirectory,
    relativePath: created.relativePath,
  });
  assert.equal(opened.project.id, created.project.id);

  const recentFile = path.join(sandbox.userDataDirectory, "recent-projects.json");
  const recentContent = await fsp.readFile(recentFile, "utf8");
  assert.equal(recentContent.includes(sandbox.projectsRoot), false);
  assert.equal(recentContent.includes(sandbox.userDataDirectory), false);

  const relocatedPath = path.join(sandbox.projectsRoot, "Moved-Game");
  await fsp.rename(created.projectDirectory, relocatedPath);
  const movedSnapshot = await getProjectManagerSnapshot(sandbox);
  assert.equal(movedSnapshot.recentProjects[0].status, "available");
  assert.equal(movedSnapshot.recentProjects[0].relativePath, "Moved-Game");

  const reopened = await openProjectDirectory({
    projectsRoot: sandbox.projectsRoot,
    userDataDirectory: sandbox.userDataDirectory,
    relativePath: "Moved-Game",
  });
  assert.equal(reopened.project.id, created.project.id);

  await fsp.rm(relocatedPath, { recursive: true, force: true });
  const missingSnapshot = await getProjectManagerSnapshot(sandbox);
  assert.equal(missingSnapshot.recentProjects[0].status, "missing");
  await removeRecentProject({ userDataDirectory: sandbox.userDataDirectory, projectId: created.project.id });
  const cleanedSnapshot = await getProjectManagerSnapshot(sandbox);
  assert.deepEqual(cleanedSnapshot.recentProjects, []);
});

test("project creation rejects traversal, platform paths and invalid folder names", async () => {
  const sandbox = await createSandbox();
  for (const folderName of ["../escape", "folder/name", "folder\\name", "CON", "trailing."]) {
    await assert.rejects(
      createEmptyProject({
        projectsRoot: sandbox.projectsRoot,
        userDataDirectory: sandbox.userDataDirectory,
        name: "My Game",
        folderName,
      }),
      ProjectManagerError,
    );
  }
  for (const parentRelativePath of ["../outside", "/tmp", "C:\\outside"]) {
    await assert.rejects(
      createEmptyProject({
        projectsRoot: sandbox.projectsRoot,
        userDataDirectory: sandbox.userDataDirectory,
        name: "My Game",
        folderName: "Game",
        parentRelativePath,
      }),
      ProjectManagerError,
    );
  }
  assert.deepEqual(await fsp.readdir(sandbox.projectsRoot), []);
});
