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
      arguments: { relativePaths: [createdSourcePath, createdDirectoryPath] },
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
  await page.getByTestId("create-component-module").click();

  await expect(page.getByTestId("component-module-dialog")).toHaveCount(0);
  await expect(page.getByTestId("typescript-source-editor")).toBeVisible();
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
});
