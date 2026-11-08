import assert from "node:assert/strict";
import { test } from "vitest";
import { checkTypeScriptSource } from "../src/services/typescript-diagnostics.ts";

test("checks TypeScript syntax with the pinned compiler", async () => {
  const result = await checkTypeScriptSource(
    "components/Blink.ts",
    "export class Blink { update(delta: number): void { void delta; } }",
  );
  assert.equal(result.diagnostics.some((item) => item.severity === "error"), false);
  assert.match(result.output, /class Blink/);
});

test("returns source locations for TypeScript parse diagnostics", async () => {
  const result = await checkTypeScriptSource("components/Broken.ts", "export const = 1;");
  assert.equal(result.diagnostics.some((item) => item.severity === "error"), true);
  assert.equal(typeof result.diagnostics[0]?.line, "number");
});
