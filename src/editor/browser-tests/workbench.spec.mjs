import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const browserTestDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(browserTestDirectory, "../../..");
const baselineScene = await readFile(
  resolve(repositoryRoot, "tests/workspace/test-typescript/scenes/Level.scene"),
  "utf8",
);

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("http://127.0.0.1:3000/editor/api", {
    data: {
      method: "SetFileString",
      body: { path: "scenes/Level.scene", content: baselineScene },
    },
  });
  expect(response.ok()).toBeTruthy();
});

test("Workbench opens the real project, edits a scene and persists the layout", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();
  await expect(page.getByTestId("hierarchy-item-dino")).toBeVisible();
  await expect(page.getByLabel("Position X")).toHaveValue("400");

  await page.getByLabel("Position X").fill("465");
  await page.getByLabel("Position X").press("Tab");
  await expect(page.getByTestId("save-scene")).toBeEnabled();
  await page.getByTestId("undo").click();
  await expect(page.getByLabel("Position X")).toHaveValue("400");
  await page.getByTestId("redo").click();
  await expect(page.getByLabel("Position X")).toHaveValue("465");

  await page.getByTestId("save-scene").click();
  await expect(page.getByTestId("save-scene")).toBeDisabled();
  const savedX = await page.evaluate(async () => {
    const response = await fetch("/editor/project/scenes/Level.scene", { cache: "no-store" });
    const scene = await response.json();
    return scene.displayList.find((object) => object.label === "dino").x;
  });
  expect(savedX).toBe(465);

  await page.reload();
  await expect(page.getByLabel("Position X")).toHaveValue("465");

  await page.getByRole("tab", { name: "Game" }).click();
  const frame = page.getByTestId("phaser-game-frame");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", /\/editor\/external\/index\.html\?restart=\d+/);
  await expect(page.frameLocator('[data-testid="phaser-game-frame"]').locator("canvas")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("tab", { name: "Scene" }).click();
  await expect(page.getByTestId("scene-stage")).toBeVisible();
  const sceneCanvas = page.getByTestId("scene-stage").locator("canvas");
  await expect(sceneCanvas).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("phaser-game-frame")).toHaveCount(0);

  const canvasBounds = await sceneCanvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.5,
    canvasBounds.y + canvasBounds.height * (406 / 600),
  );
  await expect(page.getByLabel("Object name")).toHaveValue("text_1");

  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Command palette" }).click();
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByLabel("Search commands").fill("Animation");
  await expect(page.getByRole("button", { name: "Show Animation workspace" })).toBeVisible();
  await page.keyboard.press("Escape");

  const boundsBefore = await page.getByTestId("hierarchy-panel").boundingBox();
  const splitter = page.getByTestId("splitter-hierarchy");
  const splitterBounds = await splitter.boundingBox();
  if (boundsBefore && splitterBounds) {
    await page.mouse.move(splitterBounds.x + 2, splitterBounds.y + 80);
    await page.mouse.down();
    await page.mouse.move(splitterBounds.x + 34, splitterBounds.y + 80, { steps: 4 });
    await page.mouse.up();
    const boundsAfter = await page.getByTestId("hierarchy-panel").boundingBox();
    expect(boundsAfter?.width ?? 0).toBeGreaterThan(boundsBefore.width + 15);
  }

  await page.screenshot({ path: "test-results/workbench-1280x720.png", fullPage: true });
  expect(pageErrors).toEqual([]);
});

test("Hierarchy selection and object creation are reflected in the Inspector", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-item-dino")).toBeVisible();
  await page.getByTestId("hierarchy-item-text-1").click();
  await expect(page.getByLabel("Object name")).toHaveValue("text_1");
  await expect(page.getByLabel("Text content")).toHaveValue("Phaser 4.2.1 + Phaser Editor 2D + TypeScript");

  await page.getByRole("button", { name: "Add object" }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByLabel("Object name")).toHaveValue("Text");
  await expect(page.getByLabel("Text content")).toHaveValue("New text");
  await page.getByTestId("undo").click();
  await expect(page.getByLabel("Object name")).toHaveValue("text_1");
});
