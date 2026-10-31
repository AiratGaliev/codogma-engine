import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKER = path.join(ROOT, "scripts/check-markdown.mjs");

function runGit(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

test("Markdown checker handles a changed Markdown diff larger than 1 MiB", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "codogma-markdown-check-"));

  try {
    runGit(directory, ["init", "-q"]);
    runGit(directory, ["config", "user.name", "Codogma Tests"]);
    runGit(directory, ["config", "user.email", "codogma-tests@example.invalid"]);

    writeFileSync(path.join(directory, "README.md"), "# Fixture\n", "utf8");
    runGit(directory, ["add", "README.md"]);
    runGit(directory, ["commit", "-q", "-m", "baseline"]);
    const baseSha = runGit(directory, ["rev-parse", "HEAD"]).trim();

    // Один большой добавленный Markdown-блок гарантированно превышает
    // стандартный execFileSync maxBuffer Node.js (1 MiB).
    writeFileSync(path.join(directory, "large-guide.md"), `${"x".repeat(2 * 1024 * 1024)}\n`, "utf8");
    runGit(directory, ["add", "large-guide.md"]);
    runGit(directory, ["commit", "-q", "-m", "large Markdown guide"]);
    const headSha = runGit(directory, ["rev-parse", "HEAD"]).trim();

    const result = spawnSync(process.execPath, [CHECKER, baseSha, headSha], {
      cwd: directory,
      encoding: "utf8",
    });

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Validated 1 changed Markdown file/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
