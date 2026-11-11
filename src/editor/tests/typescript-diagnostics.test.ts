import assert from "node:assert/strict";
import { test } from "vitest";
import { checkTypeScriptSource } from "../src/services/typescript-diagnostics.ts";

test("requests semantic Project diagnostics using the active Script Asset and unsaved source", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody: unknown;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      compilerVersion: "6.0.3",
      checkedFiles: 3,
      diagnostics: [{ code: 2322, severity: "error", message: "Type 'string' is not assignable to type 'number'.", path: "src/Player.ts", line: 4, column: 7 }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await checkTypeScriptSource("src/Player.ts", "export const speed: number = 'fast';");
    assert.equal(requestUrl, "/editor/project/operations");
    assert.deepEqual(requestBody, {
      operation: "project.checkTypeScript",
      arguments: { relativePath: "src/Player.ts", source: "export const speed: number = 'fast';" },
    });
    assert.equal(result.compilerVersion, "6.0.3");
    assert.equal(result.checkedFiles, 3);
    assert.deepEqual(result.diagnostics[0], {
      code: 2322,
      severity: "error",
      message: "Type 'string' is not assignable to type 'number'.",
      path: "src/Player.ts",
      line: 4,
      column: 7,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed Project TypeScript diagnostic responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    compilerVersion: "6.0.3", checkedFiles: -1, diagnostics: "not-an-array",
  }), { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(checkTypeScriptSource("src/Player.ts", "export {}"), /invalid TypeScript diagnostics/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
