import assert from "node:assert/strict";
import { test } from "vitest";
import { renameProjectFile } from "../src/services/editor-api.ts";

test("renameProjectFile sends the server RenameFile oldPath/newPath DTO", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    await renameProjectFile("assets\\hero.png", "hero-renamed.png");

    assert.deepEqual(requestBody, {
      method: "RenameFile",
      body: {
        oldPath: "assets/hero.png",
        newPath: "assets/hero-renamed.png",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("renameProjectFile rejects unsafe relative paths and non-segment names", async () => {
  await assert.rejects(renameProjectFile("../outside.png", "inside.png"), /invalid relative path/);
  await assert.rejects(renameProjectFile("assets/hero.png", "../outside.png"), /single non-empty path segment/);
  await assert.rejects(renameProjectFile("assets/hero.png", "sub/other.png"), /single non-empty path segment/);
});
