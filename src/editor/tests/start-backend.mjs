import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const editorDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(editorDirectory, "../../..");
const sourceFixture = join(repositoryRoot, "tests", "workspace", "test-typescript");
const temporaryRoot = mkdtempSync(join(tmpdir(), "codogma-editor-host-"));
const projectDirectory = join(temporaryRoot, "project");

cpSync(sourceFixture, projectDirectory, { recursive: true });

const server = spawn(process.execPath, [join(repositoryRoot, "server", "server.mjs")], {
  cwd: repositoryRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: "3000",
    PROJECT_DIR: projectDirectory,
    CODOGMA_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
  },
});

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (server.exitCode === null && server.signalCode === null) server.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

server.once("error", (error) => {
  console.error("Failed to start isolated Editor Host backend:", error);
  rmSync(temporaryRoot, { recursive: true, force: true });
  process.exitCode = 1;
});

server.once("exit", (code, signal) => {
  rmSync(temporaryRoot, { recursive: true, force: true });
  process.exitCode = code ?? (signal ? 1 : 0);
});
