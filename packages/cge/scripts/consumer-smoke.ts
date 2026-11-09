import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      "Command failed (" + command + " " + args.join(" ") + ")\n" +
      "stdout:\n" + result.stdout + "\nstderr:\n" + result.stderr,
    );
  }
  return result.stdout;
}

function runNpm(args: string[], cwd: string): string {
  const npmCli = process.env.npm_execpath;
  if (npmCli === undefined || npmCli.length === 0) {
    throw new Error("Run the consumer smoke through an npm script so npm_execpath is available.");
  }
  return run(process.execPath, [npmCli, ...args], cwd);
}

const packageRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "codogma-cge-consumer-"));
const packDirectory = join(tempRoot, "pack");
const consumerDirectory = join(tempRoot, "consumer");
const sourceDirectory = join(consumerDirectory, "src");
const outputDirectory = join(consumerDirectory, "dist");

try {
  mkdirSync(packDirectory, { recursive: true });
  mkdirSync(sourceDirectory, { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });

  const packOutput = runNpm(
    ["pack", "--json", "--pack-destination", packDirectory],
    packageRoot,
  );
  const packedFiles = JSON.parse(packOutput) as Array<{ filename?: string }>;
  const archiveName = packedFiles[0]?.filename;
  if (archiveName === undefined) throw new Error("npm pack did not return an archive filename.");
  const archivePath = resolve(packDirectory, archiveName);
  if (!existsSync(archivePath)) throw new Error("npm pack archive was not created.");

  writeFileSync(
    join(consumerDirectory, "package.json"),
    JSON.stringify({
      name: "codogma-cge-packed-consumer",
      version: "1.0.0",
      private: true,
      type: "module",
    }, null, 2) + "\n",
    "utf8",
  );
  const fixtureSource = readFileSync(join(packageRoot, "tests", "consumer", "index.mts"), "utf8");
  const consumerSource = join(sourceDirectory, "index.mts");
  writeFileSync(consumerSource, fixtureSource, "utf8");

  runNpm([
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    "--no-save",
    archivePath,
  ], consumerDirectory);

  const packageRequire = createRequire(join(packageRoot, "package.json"));
  let tscPath: string;
  try {
    tscPath = packageRequire.resolve("typescript/bin/tsc");
  } catch (error) {
    throw new Error("The package's pinned TypeScript compiler is not resolvable from the npm workspace.", { cause: error });
  }
  run(process.execPath, [
    tscPath,
    "--strict",
    "--noUncheckedIndexedAccess",
    "--exactOptionalPropertyTypes",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--rootDir",
    sourceDirectory,
    "--outDir",
    outputDirectory,
    consumerSource,
  ], consumerDirectory);

  const runtimeEntry = join(outputDirectory, "index.mjs");
  if (!existsSync(runtimeEntry)) throw new Error("TypeScript consumer output was not emitted.");
  const runtimeOutput = run(process.execPath, [runtimeEntry], consumerDirectory);
  process.stdout.write(runtimeOutput);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
