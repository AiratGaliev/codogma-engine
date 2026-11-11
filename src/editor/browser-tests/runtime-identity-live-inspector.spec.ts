import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixtureRoot = resolve(process.cwd(), "../../packages/cge/tests/fixtures/acceptance-project");
const fixtureFiles = [
  ["project.json", "project.json"],
  ["scenes/Level.cge-scene.json", "scenes/Level.cge-scene.json"],
  ["src/FollowTarget.ts", "src/FollowTarget.ts"],
  ["assets/player.svg", "assets/player.svg"],
] as const;

async function writeProjectFile(page: Page, relativePath: string, text: string): Promise<void> {
  const response = await page.request.post("http://127.0.0.1:3000/editor/project/operations", {
    data: { operation: "project.writeFile", arguments: { relativePath, text } },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json() as { error?: string };
  expect(result.error).toBeUndefined();
}

async function readScene(page: Page): Promise<{
  rootNodes: Array<{ id: string; components: Array<{ id: string; typeId: string; properties: Record<string, unknown> }> }>;
}> {
  return page.evaluate(async () => {
    const response = await fetch("/editor/project/scenes/Level.cge-scene.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not read the persisted acceptance Scene.");
    return response.json();
  });
}

async function waitForEditor(page: Page): Promise<void> {
  await expect(page.locator(".status-bar-left")).not.toContainText("Loading project", { timeout: 20_000 });
  await expect(page.locator(".connection-overlay")).toHaveCount(0);
  await expect(page.getByTestId("hierarchy-item-player")).toBeVisible();
  await expect(page.getByTestId("component-inspector-component-follow-player")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  for (const [fixturePath, projectPath] of fixtureFiles) {
    await writeProjectFile(page, projectPath, readFileSync(resolve(fixtureRoot, fixturePath), "utf8"));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForEditor(page);
});

test.afterEach(async ({ page }) => {
  for (const [fixturePath, projectPath] of fixtureFiles) {
    await writeProjectFile(page, projectPath, readFileSync(resolve(fixtureRoot, fixturePath), "utf8"));
  }
});

test("runtime selection maps exact duplicate-type instances and live values stay transient across restart/stop", async ({ page }) => {
  const persistedBefore = await readScene(page);
  assert.equal(persistedBefore.rootNodes[0]?.components[0]?.typeId, persistedBefore.rootNodes[1]?.components[0]?.typeId);
  assert.notEqual(persistedBefore.rootNodes[0]?.components[0]?.id, persistedBefore.rootNodes[1]?.components[0]?.id);
  assert.equal(persistedBefore.rootNodes[0]?.components[0]?.properties.speed, 4);
  assert.equal(persistedBefore.rootNodes[1]?.components[0]?.properties.speed, 2);

  await page.getByRole("tab", { name: "Game" }).click();
  await page.getByTestId("play-runtime-preview").click();
  await expect(page.getByTestId("runtime-component-component-follow-player")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("runtime-property-component-follow-player-runtimeElapsedSeconds")).toBeVisible();

  const sessionBefore = await page.locator(".runtime-session-label").textContent();
  expect(sessionBefore).toMatch(/Session/);

  const playerRuntimeValue = page.getByTestId("runtime-property-component-follow-player-runtimeElapsedSeconds");
  await expect.poll(async () => {
    const value = await playerRuntimeValue.locator(".runtime-property-value").textContent();
    return Number(value ?? "-1");
  }, { timeout: 10_000 }).toBeGreaterThan(0);

  // Selecting the second attachment must resolve Enemy by its persisted instance ID,
  // although Player and Enemy share the same Component typeId.
  await page.getByTestId("runtime-component-component-follow-enemy").click();
  await expect(page.getByLabel("Object name")).toHaveValue("Enemy");
  const enemyInspector = page.getByTestId("component-inspector-component-follow-enemy");
  await expect(enemyInspector.getByLabel("speed")).toHaveValue("2");
  await expect(enemyInspector.getByText("SAVED")).toBeVisible();
  const enemyRuntimeValue = page.getByTestId("runtime-property-component-follow-enemy-runtimeElapsedSeconds");
  await expect(enemyRuntimeValue.getByText("LIVE · SESSION ONLY")).toBeVisible();
  await expect.poll(async () => {
    const value = await enemyRuntimeValue.locator(".runtime-property-value").textContent();
    return Number(value ?? "-1");
  }, { timeout: 10_000 }).toBeGreaterThan(0);

  const persistedDuringPreview = await readScene(page);
  assert.equal(persistedDuringPreview.rootNodes[1]?.components[0]?.properties.speed, 2);
  assert.equal("runtimeElapsedSeconds" in (persistedDuringPreview.rootNodes[1]?.components[0]?.properties ?? {}), false);

  await page.getByTestId("restart-runtime-preview").click();
  await expect(page.locator(".runtime-session-label")).not.toHaveText(sessionBefore ?? "", { timeout: 25_000 });
  await expect(page.getByLabel("Object name")).toHaveValue("Player");
  await expect(page.getByTestId("runtime-stale-selection")).toHaveCount(0);

  // The previous Enemy selection is not carried to the new session.
  await page.getByTestId("runtime-component-component-follow-enemy").click();
  await expect(page.getByLabel("Object name")).toHaveValue("Enemy");
  await expect(page.getByTestId("runtime-property-component-follow-enemy-runtimeElapsedSeconds")).toBeVisible();

  await page.getByTestId("stop-runtime-preview").click();
  await expect(page.locator(".runtime-session-label")).toHaveCount(0);
  await expect(page.getByTestId("runtime-node-inspector")).toHaveCount(0);
  await expect(page.getByTestId("runtime-property-component-follow-enemy-runtimeElapsedSeconds").locator(".runtime-property-value")).toHaveCount(0);

  const persistedAfterStop = await readScene(page);
  assert.equal(persistedAfterStop.rootNodes[0]?.components[0]?.properties.speed, 4);
  assert.equal(persistedAfterStop.rootNodes[1]?.components[0]?.properties.speed, 2);
  assert.equal("runtimeElapsedSeconds" in (persistedAfterStop.rootNodes[0]?.components[0]?.properties ?? {}), false);
});
