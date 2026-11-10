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
import { validateHtml5BuildProfile } from "../packages/html5-build/dist/index.js";

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

test("Empty 2D template persists official Development and Release HTML5 profiles", async () => {
  const sandbox = await createSandbox();
  const created = await createProject(sandbox);
  const profileRoot = path.join(created.projectDirectory, "build", "profiles");
  const development = JSON.parse(await fsp.readFile(path.join(profileRoot, "html5.development.json"), "utf8"));
  const release = JSON.parse(await fsp.readFile(path.join(profileRoot, "html5.release.json"), "utf8"));

  assert.equal(validateHtml5BuildProfile(development).valid, true);
  assert.equal(validateHtml5BuildProfile(release).valid, true);
  assert.equal(development.id, "html5.development");
  assert.equal(development.kind, "development");
  assert.equal(development.outputDirectory, "build/html5/development");
  assert.equal(development.minify, false);
  assert.equal(development.sourceMaps, true);
  assert.equal(release.id, "html5.release");
  assert.equal(release.kind, "release");
  assert.equal(release.outputDirectory, "build/html5/release");
  assert.equal(release.minify, true);
  assert.equal(release.sourceMaps, false);

  const validation = await validateProjectDirectory(created.projectDirectory);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
  assert.equal(validation.buildAnalysis?.target, "html5");
  assert.ok(validation.buildAnalysis?.graph.nodeCount > 0);
});

test("Project Manager delegates Component asset-reference validation to the Core build graph", async () => {
  const sandbox = await createSandbox();
  const fixture = path.resolve("packages/cge/tests/fixtures/acceptance-project");
  const projectDirectory = path.join(sandbox.projectsRoot, "Acceptance-Project");
  await fsp.cp(fixture, projectDirectory, { recursive: true });

  const valid = await validateProjectDirectory(projectDirectory);
  assert.equal(valid.valid, true, JSON.stringify(valid.diagnostics));
  assert.ok(valid.buildGraph?.nodes.some((node) => node.id === "module:com.codogma.acceptance.follow-target"));
  assert.ok(valid.warnings.some((item) => item.code === "PROJECT_BUILD_REFERENCE_SCAN_INCOMPLETE"));

  const scenePath = path.join(projectDirectory, "scenes", "Level.cge-scene.json");
  const scene = JSON.parse(await fsp.readFile(scenePath, "utf8"));
  scene.rootNodes[0].components[0].properties.sprite.assetId = "missing-asset";
  await fsp.writeFile(scenePath, JSON.stringify(scene, null, 2), "utf8");

  const invalid = await validateProjectDirectory(projectDirectory);
  assert.equal(invalid.valid, false);
  assert.ok(
    invalid.diagnostics.some((item) =>
      item.code === "PROJECT_INVALID_REFERENCE" || item.code === "COMPONENT_INVALID_REFERENCE",
    ),
    JSON.stringify(invalid.diagnostics),
  );
});

test("Project Manager rejects malformed persisted HTML5 build profiles", async () => {
  const sandbox = await createSandbox();
  const created = await createProject(sandbox);
  const profilePath = path.join(created.projectDirectory, "build", "profiles", "html5.release.json");
  const profile = JSON.parse(await fsp.readFile(profilePath, "utf8"));
  profile.outputDirectory = "../outside";
  await fsp.writeFile(profilePath, JSON.stringify(profile, null, 2), "utf8");

  const validation = await validateProjectDirectory(created.projectDirectory);
  assert.equal(validation.valid, false);
  assert.ok(validation.diagnostics.some((item) => item.code === "PROJECT_BUILD_PROFILE_INVALID"));
  await assert.rejects(
    openProjectDirectory({
      projectsRoot: sandbox.projectsRoot,
      userDataDirectory: sandbox.userDataDirectory,
      relativePath: created.relativePath,
    }),
    (error) => error instanceof ProjectManagerError && error.statusCode === 422,
  );
});

test("Component schema inspection never executes project TypeScript", async () => {
  const sandbox = await createSandbox();
  const fixture = path.resolve("packages/cge/tests/fixtures/acceptance-project");
  const projectDirectory = path.join(sandbox.projectsRoot, "Unsafe-Schema");
  await fsp.cp(fixture, projectDirectory, { recursive: true });
  const modulePath = path.join(projectDirectory, "src", "FollowTarget.ts");
  const source = await fsp.readFile(modulePath, "utf8");
  await fsp.writeFile(
    modulePath,
    source.replace('export const moduleVersion = "1.0.0";', 'export const moduleVersion = resolveVersion();'),
    "utf8",
  );

  const validation = await validateProjectDirectory(projectDirectory);
  assert.equal(validation.valid, false);
  assert.ok(validation.diagnostics.some((item) =>
    item.code === "COMPONENT_INVALID_SCHEMA" && item.path?.includes("FollowTarget.ts"),
  ));
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

test("Recent Projects marks a manifest-valid project invalid when a registered Scene asset is missing", async () => {
  const sandbox = await createSandbox();
  const created = await createProject(sandbox);
  const opened = await openProjectDirectory({
    projectsRoot: sandbox.projectsRoot,
    userDataDirectory: sandbox.userDataDirectory,
    relativePath: created.relativePath,
  });
  assert.equal(opened.project.id, created.project.id);

  const sceneAsset = created.project.assets.find((asset) => asset.kind === "scene");
  assert.ok(sceneAsset);
  await fsp.unlink(path.join(created.projectDirectory, sceneAsset.path));

  const snapshot = await getProjectManagerSnapshot(sandbox);
  const recent = snapshot.recentProjects[0];
  assert.ok(recent);
  assert.equal(recent.status, "invalid");
  assert.ok(recent.diagnostics.some((item) => item.code === "PROJECT_ASSET_MISSING"));

  await assert.rejects(
    openProjectDirectory({
      projectsRoot: sandbox.projectsRoot,
      userDataDirectory: sandbox.userDataDirectory,
      relativePath: recent.relativePath,
    }),
    (error) => error instanceof ProjectManagerError && error.statusCode === 422,
  );
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

test("concurrent creation attempts cannot overwrite or publish duplicate projects", async () => {
  const sandbox = await createSandbox();
  const results = await Promise.allSettled([
    createProject(sandbox),
    createProject(sandbox),
  ]);

  const successful = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(successful.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.status === "rejected");
  assert.ok(rejected[0].reason instanceof ProjectManagerError);
  assert.equal(rejected[0].reason.statusCode, 409);
  assert.deepEqual(await fsp.readdir(sandbox.projectsRoot), ["My-Game"]);
  const snapshot = await getProjectManagerSnapshot(sandbox);
  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.recentProjects.length, 1);
});

test("opening a project through a symlink outside PROJECTS_DIR is rejected", {
  skip: process.platform === "win32",
}, async () => {
  const sandbox = await createSandbox();
  const outsideRoot = path.join(sandbox.root, "outside-projects");
  const outsideUserData = path.join(sandbox.root, "outside-user-data");
  await fsp.mkdir(outsideRoot, { recursive: true });
  await fsp.mkdir(outsideUserData, { recursive: true });
  const outsideProject = await createProject({
    projectsRoot: outsideRoot,
    userDataDirectory: outsideUserData,
  });
  const linkedPath = path.join(sandbox.projectsRoot, "Linked-Project");
  await fsp.symlink(outsideProject.projectDirectory, linkedPath, "dir");

  await assert.rejects(
    openProjectDirectory({
      projectsRoot: sandbox.projectsRoot,
      userDataDirectory: sandbox.userDataDirectory,
      relativePath: "Linked-Project",
    }),
    (error) => error instanceof ProjectManagerError && error.statusCode === 400,
  );
  assert.equal(fs.lstatSync(linkedPath).isSymbolicLink(), true);
  assert.deepEqual(await fsp.readdir(sandbox.projectsRoot), ["Linked-Project"]);
});
