import assert from "node:assert/strict";
import { test } from "vitest";
import { createProjectFile, renameProjectEntry } from "../src/services/editor-api.ts";

test("renameProjectEntry sends the native project operation contract", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  let requestUrl = "";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    await renameProjectEntry("assets\\hero.png", "hero-renamed.png");

    assert.equal(requestUrl, "/editor/project/operations");
    assert.deepEqual(requestBody, {
      operation: "project.renameEntry",
      arguments: {
        sourcePath: "assets/hero.png",
        destinationPath: "assets/hero-renamed.png",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renameProjectEntry rejects unsafe relative paths and non-segment names", async () => {
  await assert.rejects(renameProjectEntry("../outside.png", "inside.png"), /invalid relative path/);
  await assert.rejects(renameProjectEntry("assets/hero.png", "../outside.png"), /single non-empty path segment/);
  await assert.rejects(renameProjectEntry("assets/hero.png", "sub/other.png"), /single non-empty path segment/);
});


test("createProjectFile uses the exclusive native Project file operation", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody: unknown;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ entry: { relativePath: "src/components/Health.ts" } }), { status: 200 });
  }) as typeof fetch;

  try {
    await createProjectFile("src/components/Health.ts", "export const componentDefinition = {};");
    assert.equal(requestUrl, "/editor/project/operations");
    assert.deepEqual(requestBody, {
      operation: "project.createFile",
      arguments: {
        relativePath: "src/components/Health.ts",
        text: "export const componentDefinition = {};",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
