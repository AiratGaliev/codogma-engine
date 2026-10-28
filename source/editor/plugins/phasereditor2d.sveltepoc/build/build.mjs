/*
        Build script for the Svelte PoC plugin (P0 item 8).

        Compiles src/SceneStatsPanel.svelte (Svelte 5, client mode, css injected)
        and bundles it with the Svelte runtime + src/index.js bridge into a single
        classic script at ../_out/svelte-poc.js.

        Run:  npm install && node build.mjs   (inside this build/ folder only —
        the repository root package.json is NOT touched).

        The compiled bundle is committed, so no build step is needed to consume the
        plugin; this script exists to reproduce the output.
*/

import { compile } from "svelte/compiler";
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const srcDir = path.join(here, "..", "src");
const compiledDir = path.join(srcDir, "compiled");
const outFile = path.join(here, "..", "_out", "svelte-poc.js");

const componentSource = fs.readFileSync(path.join(srcDir, "SceneStatsPanel.svelte"), "utf8");

fs.mkdirSync(compiledDir, { recursive: true });

const t0 = performance.now();

const result = compile(componentSource, {
        filename: "SceneStatsPanel.svelte",
        generate: "client",
        css: "injected"
});

const compiledPath = path.join(compiledDir, "SceneStatsPanel.svelte.js");

fs.writeFileSync(compiledPath, result.js.code);

const bundle = await esbuild.build({
        entryPoints: [path.join(srcDir, "index.js")],
        bundle: true,
        format: "iife",
        target: "es2020",
        platform: "browser",
        outfile: outFile,
        minify: true,
        legalComments: "none",
        logLevel: "info",
        nodePaths: [path.join(here, "node_modules")]
});

const ms = (performance.now() - t0).toFixed(0);

const bytes = fs.statSync(outFile).size;

console.log(`svelte-poc build: compile+bundle ${ms} ms, output ${(bytes / 1024).toFixed(1)} kB -> ${path.relative(process.cwd(), outFile)}`);

if (bundle.warnings && bundle.warnings.length > 0) {
        console.warn("esbuild warnings:", bundle.warnings);
}
