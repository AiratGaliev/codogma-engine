import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(join(repositoryRoot, path), "utf8"));
const rootManifest = readJson("package.json");
const lockfile = readJson("package-lock.json");

const expectedWorkspaces = [
  "packages/cge",
  "packages/editor-mcp-server",
  "packages/game-test-bridge-contract",
  "packages/localization",
  "src/editor",
];

test("only active first-party packages and the native Editor Host are npm workspaces", () => {
  assert.deepEqual(rootManifest.workspaces, ["packages/*", "src/editor"]);

  const actualPackageRoots = readdirSync(join(repositoryRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(repositoryRoot, "packages", entry.name, "package.json")))
    .map((entry) => `packages/${entry.name}`)
    .sort();

  assert.deepEqual(actualPackageRoots, expectedWorkspaces.filter((path) => path.startsWith("packages/")).sort());
  assert.equal(rootManifest.workspaces.some((path) => path.includes("mini-services")), false);
  assert.equal(rootManifest.workspaces.some((path) => path.includes("source/editor")), false);
});

test("root lockfile owns every workspace link and active workspace roots have no nested lockfiles", () => {
  assert.equal(lockfile.lockfileVersion, 3);

  for (const workspacePath of expectedWorkspaces) {
    const manifest = readJson(`${workspacePath}/package.json`);
    const packageRecord = lockfile.packages[workspacePath];
    const linkRecord = lockfile.packages[`node_modules/${manifest.name}`];

    assert.equal(packageRecord?.name, manifest.name, `missing lockfile package record for ${workspacePath}`);
    assert.equal(linkRecord?.link, true, `missing npm workspace link for ${manifest.name}`);
    assert.equal(existsSync(join(repositoryRoot, workspacePath, "package-lock.json")), false);
  }
});

test("first-party workspace consumers use versioned package dependencies instead of file links", () => {
  const localization = readJson("packages/localization/package.json");
  const core = readJson("packages/cge/package.json");
  const editor = readJson("src/editor/package.json");

  assert.equal(rootManifest.dependencies["@codogma/localization"], localization.version);
  assert.equal(editor.dependencies["@codogma/cge"], core.version);
  assert.equal(rootManifest.dependencies["@codogma/localization"].startsWith("file:"), false);
  assert.equal(editor.dependencies["@codogma/cge"].startsWith("file:"), false);
});
