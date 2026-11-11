import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixtureRoot = resolve(process.cwd(), "../../packages/cge/tests/fixtures/acceptance-project");
const fixtureFiles = [
  "project.json",
  "scenes/Level.cge-scene.json",
  "src/FollowTarget.ts",
  "assets/player.svg",
] as const;
const projectApi = "http://127.0.0.1:3000/editor/project/operations";
const createdSourcePath = "src/components/Health.ts";
const createdDirectoryPath = "src/components";
const componentTypeId = "com.codogma.acceptance.health";

async function writeProjectFile(page: Page, relativePath: string, text: string) {
  const response = await page.request.post(projectApi, {
    data: {
      operation: "project.writeFile",
      arguments: { relativePath, text },
    },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json() as { error?: string };
  expect(result.error).toBeUndefined();
}

async function deleteCreatedEntries(page: Page) {
  const response = await page.request.post(projectApi, {
    data: {
      operation: "project.deleteEntries",
      arguments: { relativePaths: [createdSourcePath, createdDirectoryPath, "src/ImportedPulse.ts", "src/PreviewHelper.ts"] },
    },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json() as { error?: string };
  expect(result.error).toBeUndefined();
}

async function waitForNativeProject(page: Page) {
  await expect(page.locator(".status-bar-left")).not.toContainText("Loading project", {
    timeout: 20_000,
  });
  await expect(page.locator(".connection-overlay")).toHaveCount(0);
  await expect(page.getByTestId("hierarchy-item-player")).toBeVisible();
}

async function readProjectFile(page: Page, relativePath: string): Promise<string> {
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  const response = await page.request.get("http://127.0.0.1:3000/editor/project/" + encodedPath);
  expect(response.ok()).toBeTruthy();
  return response.text();
}

test.beforeEach(async ({ page }) => {
  for (const relativePath of fixtureFiles) {
    await writeProjectFile(
      page,
      relativePath,
      readFileSync(resolve(fixtureRoot, relativePath), "utf8"),
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForNativeProject(page);
});

test.afterEach(async ({ page }) => {
  for (const relativePath of fixtureFiles) {
    await writeProjectFile(
      page,
      relativePath,
      readFileSync(resolve(fixtureRoot, relativePath), "utf8"),
    );
  }
  await deleteCreatedEntries(page);
});

test("creates, registers, diagnoses and reopens a native Script Component", async ({ page }) => {
  await page.getByTestId("bottom-tabs").locator('[data-dock-tab="Components"]').click();
  await expect(page.getByTestId("components-workspace")).toBeVisible();
  await page.getByTestId("new-component-module").click();
  await expect(page.getByTestId("component-module-dialog")).toBeVisible();

  await page.getByTestId("component-module-name").fill("Health Controller");
  await page.getByTestId("component-module-type-id").fill(componentTypeId);
  await page.getByTestId("component-module-version").fill("1.2.0");
  await page.getByTestId("component-module-path").fill(createdSourcePath);
  let releaseFileCreate = (): void => {};
  let signalFileCreate = (): void => {};
  const fileCreateStarted = new Promise<void>((resolve) => { signalFileCreate = resolve; });
  const fileCreateGate = new Promise<void>((resolve) => { releaseFileCreate = resolve; });
  await page.route("**/editor/project/operations", async (route) => {
    let body: { operation?: string; arguments?: { relativePath?: string } } = {};
    try { body = route.request().postDataJSON() as typeof body; } catch { /* non-JSON request */ }
    if (body.operation === "project.createFile" && body.arguments?.relativePath === createdSourcePath) {
      signalFileCreate();
      await fileCreateGate;
    }
    await route.continue();
  });
  await page.getByTestId("create-component-module").click();
  try {
    await fileCreateStarted;
    await page.getByLabel("Position X").fill("999");
  } finally {
    releaseFileCreate();
    await page.unroute("**/editor/project/operations");
  }

  await expect(page.getByTestId("component-module-dialog")).toHaveCount(0);
  await expect(page.getByTestId("typescript-source-editor")).toBeVisible();
  await expect(page.getByLabel("Position X")).toHaveValue("80");
  const source = await readProjectFile(page, createdSourcePath);
  assert.ok(source.includes("export const componentDefinition"));
  assert.ok(source.includes(componentTypeId));
  assert.ok(source.includes("create(_context"));

  const manifest = JSON.parse(await readProjectFile(page, "project.json")) as {
    assets: Array<{ id: string; path: string; kind: string }>;
    componentModules: Array<{ typeId: string; moduleAssetId: string; version: string }>;
  };
  const registeredModule = manifest.componentModules.find((item) => item.typeId === componentTypeId);
  assert.ok(registeredModule);
  assert.equal(registeredModule.version, "1.2.0");
  assert.deepEqual(
    manifest.assets.find((asset) => asset.id === registeredModule.moduleAssetId),
    { id: registeredModule.moduleAssetId, path: createdSourcePath, kind: "script" },
  );

  const editor = page.getByTestId("typescript-source-editor");
  await editor.fill('export const invalidValue: number = "not a number";');
  const diagnostics = page.getByTestId("typescript-diagnostics");
  await expect(diagnostics).toContainText("TS2322");
  await expect(diagnostics).toContainText(createdSourcePath);

  // The unsaved diagnostic edit must not replace the persisted starter source.
  await page.reload();
  await waitForNativeProject(page);
  await page.getByTestId("bottom-tabs").locator('[data-dock-tab="Components"]').click();
  await expect(page.getByTestId("components-workspace")).toContainText(componentTypeId);
  await page.getByText("Open Script Asset").click();
  await expect(page.getByTestId("typescript-source-editor")).toHaveValue(source);
  await expect(page.getByTestId("typescript-diagnostics")).toContainText("No Project diagnostics");
  const persistedScene = JSON.parse(await readProjectFile(page, "scenes/Level.cge-scene.json")) as {
    rootNodes: Array<{ id: string; transform: { x: number } }>;
  };
  assert.equal(persistedScene.rootNodes.find((node) => node.id === "node-player")?.transform.x, 80);
});

test("loads a Component definition with a relative Project Script Asset import in native Preview", async ({ page }) => {
  const typeId = "com.codogma.acceptance.imported-pulse";
  const modulePath = "src/ImportedPulse.ts";
  const helperPath = "src/PreviewHelper.ts";
  const componentId = "component-imported-player";
  const project = JSON.parse(await readProjectFile(page, "project.json")) as {
    assets: Array<{ id: string; path: string; kind: string }>;
    componentModules: Array<{ typeId: string; moduleAssetId: string; version: string }>;
  };
  project.assets.push(
    { id: "asset-imported-pulse-module", path: modulePath, kind: "script" },
    { id: "asset-preview-helper", path: helperPath, kind: "script" },
  );
  project.componentModules.push({
    typeId,
    moduleAssetId: "asset-imported-pulse-module",
    version: "1.0.0",
  });

  const scene = JSON.parse(await readProjectFile(page, "scenes/Level.cge-scene.json")) as {
    rootNodes: Array<{ id: string; components: Array<Record<string, unknown>> }>;
  };
  const player = scene.rootNodes.find((node) => node.id === "node-player");
  assert.ok(player);
  player.components.push({
    id: componentId,
    typeId,
    schemaVersion: 1,
    enabled: true,
    properties: {},
  });

  await writeProjectFile(page, helperPath, "export function readImportedPulse(): number { return 73; }\n");
  await writeProjectFile(page, modulePath, [
    'import { readImportedPulse } from "./PreviewHelper.js";',
    "export const componentDefinition = {",
    "  schema: {",
    "    schemaVersion: 1,",
    '    typeId: "' + typeId + '",',
    '    name: "Imported Pulse",',
    '    version: "1.0.0",',
    '    properties: { pulse: { type: "number", storage: "runtime", label: "Imported pulse" } },',
    "  },",
    "  create() {",
    "    let pulse = 0;",
    "    return {",
    "      onUpdate() { pulse = readImportedPulse(); },",
    "      inspect() { return { pulse }; },",
    "    };",
    "  },",
    "};",
    "",
  ].join("\n"));
  await writeProjectFile(page, "scenes/Level.cge-scene.json", JSON.stringify(scene, null, 2));
  await writeProjectFile(page, "project.json", JSON.stringify(project, null, 2));

  await page.reload();
  await waitForNativeProject(page);
  await page.getByRole("tab", { name: "Game" }).click();
  await page.getByTestId("play-runtime-preview").click();

  const runtimeComponent = page.getByTestId("runtime-component-" + componentId);
  await expect(runtimeComponent).toBeVisible({ timeout: 25_000 });
  const liveProperty = page.getByTestId("runtime-property-" + componentId + "-pulse");
  await expect(liveProperty).toBeVisible();
  await expect(liveProperty.getByText("LIVE · SESSION ONLY")).toBeVisible();
  await expect.poll(async () =>
    Number(await liveProperty.locator(".runtime-property-value").textContent() ?? "-1"),
  { timeout: 10_000 }).toBe(73);
  await expect(page.getByTestId("runtime-preview-error")).toHaveCount(0);

  const persisted = JSON.parse(await readProjectFile(page, "scenes/Level.cge-scene.json")) as {
    rootNodes: Array<{ components: Array<{ id: string; properties: Record<string, unknown> }> }>;
  };
  const persistedComponent = persisted.rootNodes[0]?.components.find((item) => item.id === componentId);
  assert.deepEqual(persistedComponent?.properties, {});

  await page.getByTestId("stop-runtime-preview").click();
  await expect(page.locator(".runtime-session-label")).toHaveCount(0);
});
