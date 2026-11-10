import assert from "node:assert/strict";
import test from "node:test";
import {
  compareHtml5BuildManifests,
  createDefaultHtml5BuildProfile,
  createHtml5BuildManifest,
  toProjectBuildOutputManifest,
  validateHtml5BuildProfile,
} from "../dist/index.js";

const toolchain = { name: "vite", version: "8.3.5" };
const encoder = new TextEncoder();

async function manifestFor(contents) {
  return createHtml5BuildManifest({
    profile: createDefaultHtml5BuildProfile("release"),
    toolchain,
    files: [{
      path: "index.html",
      contents: encoder.encode(contents),
      sourceModuleIds: ["fixture:index.html"],
      includedNodeIds: ["project:acceptance-project"],
    }],
  });
}

test("default HTML5 profiles have explicit Development and Release semantics", () => {
  const development = createDefaultHtml5BuildProfile("development");
  const release = createDefaultHtml5BuildProfile("release");
  assert.equal(development.target, "html5");
  assert.equal(development.kind, "development");
  assert.equal(development.minify, false);
  assert.equal(development.sourceMaps, true);
  assert.equal(release.kind, "release");
  assert.equal(release.minify, true);
  assert.equal(release.sourceMaps, false);
  assert.equal(validateHtml5BuildProfile(release).valid, true);
});

test("profile validation rejects unknown fields and unsafe output paths", () => {
  const profile = createDefaultHtml5BuildProfile("release");
  assert.equal(validateHtml5BuildProfile({ ...profile, futureSetting: true }).valid, false);
  assert.equal(validateHtml5BuildProfile({ ...profile, outputDirectory: "../outside" }).valid, false);
  assert.equal(validateHtml5BuildProfile({ ...profile, outputDirectory: "C:/outside" }).valid, false);
  assert.equal(validateHtml5BuildProfile({ ...profile, target: "desktop" }).valid, false);
});

test("artifact manifests sort files and record stable content and gzip hashes", async () => {
  const profile = createDefaultHtml5BuildProfile("release");
  const content = encoder.encode("<html><body>same build</body></html>");
  const first = await createHtml5BuildManifest({
    profile,
    toolchain,
    files: [
      { path: "assets/main.js", contents: content, sourceModuleIds: ["module:b", "module:a"], includedNodeIds: ["module:b"] },
      { path: "index.html", contents: encoder.encode("<html></html>") },
    ],
  });
  const second = await createHtml5BuildManifest({
    profile,
    toolchain,
    files: [
      { path: "index.html", contents: encoder.encode("<html></html>") },
      { path: "assets/main.js", contents: content, sourceModuleIds: ["module:a", "module:b"], includedNodeIds: ["module:b"] },
    ],
  });
  assert.deepEqual(first, second);
  assert.equal(first.files[0].path, "assets/main.js");
  assert.equal(first.files[0].sha256.length, 64);
  assert.ok(first.files[0].gzipBytes > 0);
  assert.equal(first.files[0].brotliBytes, undefined);
  assert.deepEqual(first.files[0].sourceModuleIds, ["module:a", "module:b"]);
  assert.deepEqual(compareHtml5BuildManifests(first, second), { reproducible: true, differences: [] });
});

test("manifest creation rejects traversal and duplicate output paths", async () => {
  const profile = createDefaultHtml5BuildProfile("release");
  await assert.rejects(
    createHtml5BuildManifest({
      profile, toolchain,
      files: [{ path: "../outside.js", contents: encoder.encode("bad") }],
    }),
    /unsafe path segment/,
  );
  await assert.rejects(
    createHtml5BuildManifest({
      profile, toolchain,
      files: [
        { path: "index.html", contents: encoder.encode("one") },
        { path: "index.html", contents: encoder.encode("two") },
      ],
    }),
    /Duplicate build output path/,
  );
});

test("comparison detects changed output bytes and Core receives measured release metadata", async () => {
  const first = await manifestFor("<html>first</html>");
  const changed = await manifestFor("<html>second</html>");
  const comparison = compareHtml5BuildManifests(first, changed);
  assert.equal(comparison.reproducible, false);
  assert.equal(comparison.differences[0].kind, "file-changed");

  const coreManifest = toProjectBuildOutputManifest(first);
  assert.equal(coreManifest.production, true);
  assert.equal(coreManifest.target, "html5");
  assert.equal(coreManifest.toolchain, "vite@8.3.5");
  assert.equal(coreManifest.files[0].path, "index.html");
  assert.ok((coreManifest.files[0].gzipBytes ?? 0) > 0);
});
