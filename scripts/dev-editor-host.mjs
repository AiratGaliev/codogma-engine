import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const defaultProjectDirectory = resolve(rootDir, "packages", "cge", "tests", "fixtures", "acceptance-project");
const projectDirectory = resolve(rootDir, process.env.PROJECT_DIR || defaultProjectDirectory);
const projectManifest = resolve(projectDirectory, "project.json");

if (!existsSync(projectManifest)) {
  console.error("[dev] The selected PROJECT_DIR is not a native Codogma Project Model v1 directory.");
  console.error("[dev] Missing manifest: " + projectManifest);
  console.error("[dev] Set PROJECT_DIR to a directory containing project.json, or unset PROJECT_DIR to use:");
  console.error("[dev] " + defaultProjectDirectory);
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath
  ? process.execPath
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const npmPrefix = npmExecPath ? [npmExecPath] : [];

const backendPort = Number(process.env.PORT || 3000);
const hostPort = Number(process.env.VITE_PORT || 5173);
const services = [
  {
    name: "Codogma backend",
    command: process.execPath,
    args: [resolve(rootDir, "server", "server.mjs")],
    cwd: rootDir,
  },
  {
    name: "SolidJS Editor Host",
    command: npmCommand,
    args: [...npmPrefix, "run", "dev", "--workspace=@codogma/editor-host"],
    cwd: rootDir,
    shell: process.platform === "win32" && !npmExecPath,
  },
];

console.log("[dev] Starting backend and SolidJS Host.");
console.log("[dev] Backend API: http://127.0.0.1:" + backendPort + "/editor/");
console.log("[dev] SolidJS Host: http://127.0.0.1:" + hostPort + "/");
console.log("[dev] The Host workspace predev hook builds @codogma/cge before Vite starts.");
console.log("[dev] Press Ctrl+C to stop both processes.");

const children = services.map((service) => ({
  ...service,
  child: spawn(service.command, service.args, {
    cwd: service.cwd,
    stdio: "inherit",
    env: process.env,
    ...(service.shell ? { shell: true } : {}),
  }),
}));

let stopping = false;
let exitCode = 0;
let closedCount = 0;

function stopAll(signal) {
  if (stopping) return;
  stopping = true;
  for (const service of children) {
    if (service.child.exitCode === null && service.child.signalCode === null) {
      service.child.kill(signal);
    }
  }
}

const stopped = new Promise((resolveStopped) => {
  for (const service of children) {
    service.child.once("error", (error) => {
      console.error("[dev] " + service.name + " failed to start:", error);
      exitCode = 1;
      stopAll("SIGTERM");
    });
    service.child.once("exit", (code, signal) => {
      if (!stopping) {
        exitCode = code ?? 1;
        console.error("[dev] " + service.name + " stopped unexpectedly (code=" + code + ", signal=" + signal + ").");
        stopAll("SIGTERM");
      }
    });
    service.child.once("close", () => {
      closedCount += 1;
      if (closedCount === children.length) resolveStopped();
    });
  }
});

const onInterrupt = () => stopAll("SIGINT");
const onTerminate = () => {
  exitCode = 1;
  stopAll("SIGTERM");
};
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);

await stopped;
process.off("SIGINT", onInterrupt);
process.off("SIGTERM", onTerminate);
process.exitCode = exitCode;
