import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkProjectTypeScript } from "../server/typescript-project-diagnostics.mts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = join(repositoryRoot, "packages", "cge", "tests", "fixtures", "acceptance-project");

async function createProjectFixture() {
  const projectRoot = await mkdtemp(join(tmpdir(), "codogma-ts-check-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await copyFile(join(fixtureRoot, "project.json"), join(projectRoot, "project.json"));
  await copyFile(join(fixtureRoot, "src", "FollowTarget.ts"), join(projectRoot, "src", "FollowTarget.ts"));
  return projectRoot;
}

test("checks registered TypeScript Script Assets and reports semantic diagnostics", async (t) => {
  const projectRoot = await createProjectFixture();
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const source = await readFile(join(projectRoot, "src", "FollowTarget.ts"), "utf8");

  const valid = checkProjectTypeScript(projectRoot, "src/FollowTarget.ts", source);
  assert.equal(valid.compilerVersion, "6.0.3");
  assert.ok(valid.checkedFiles >= 1);
  assert.deepEqual(valid.diagnostics.filter((item) => item.severity === "error"), []);

  const typeError = checkProjectTypeScript(
    projectRoot, "src/FollowTarget.ts", source + "\nconst invalidNumber: number = \"not a number\";\n",
  );
  assert.ok(typeError.diagnostics.some((item) => item.code === 2322 && item.path === "src/FollowTarget.ts"));

  const unresolvedImport = checkProjectTypeScript(
    projectRoot, "src/FollowTarget.ts", "import missing from \"./module-that-does-not-exist.js\";\n" + source,
  );
  assert.ok(unresolvedImport.diagnostics.some((item) => item.code === 2307));
});

test("only checks registered Script Asset paths and refuses project path traversal", async (t) => {
  const projectRoot = await createProjectFixture();
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const source = await readFile(join(projectRoot, "src", "FollowTarget.ts"), "utf8");
  assert.throws(() => checkProjectTypeScript(projectRoot, "../outside.ts", source), /registered Script Asset/);
  assert.throws(() => checkProjectTypeScript(projectRoot, "scenes/Level.cge-scene.json", source), /registered Script Asset/);
});