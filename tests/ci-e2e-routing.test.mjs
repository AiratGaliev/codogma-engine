import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [fastWorkflow, e2eWorkflow] = await Promise.all([
  readFile(path.join(ROOT, ".github/workflows/ci.yml"), "utf8"),
  readFile(path.join(ROOT, ".github/workflows/e2e.yml"), "utf8"),
]);

test("CI Fast never installs or runs browser/MCP E2E suites", () => {
  assert.doesNotMatch(
    fastWorkflow,
    /(?:playwright\s+install|playwright\s+test|npm\s+run\s+test:browser|npm\s+run\s+test:e2e)/i,
  );
});

test("the E2E workflow is promotion-only and contains the complete current E2E suites", () => {
  assert.match(e2eWorkflow, /pull_request:\s*\n\s*branches:\s*\[test, main\]/);
  assert.doesNotMatch(e2eWorkflow, /^\s*workflow_dispatch:/m);
  assert.match(e2eWorkflow, /github\.base_ref == 'test' && github\.head_ref == 'dev'/);
  assert.match(
    e2eWorkflow,
    /github\.base_ref == 'main' && \(github\.head_ref == 'test' \|\| startsWith\(github\.head_ref, 'hotfix\/'\)\)/,
  );
  assert.match(e2eWorkflow, /npm run test:browser/);
  assert.match(e2eWorkflow, /npm run test:e2e/);
});
