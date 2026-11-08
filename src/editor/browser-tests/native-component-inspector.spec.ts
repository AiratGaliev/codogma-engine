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

async function writeProjectFile(page: Page, relativePath: string, text: string) {
  const response = await page.request.post("http://127.0.0.1:3000/editor/project/operations", {
    data: {
      operation: "project.writeFile",
      arguments: { relativePath, text },
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
  await expect(page.getByTestId("component-inspector-component-follow-player")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  for (const [fixturePath, projectPath] of fixtureFiles) {
    let content = readFileSync(resolve(fixtureRoot, fixturePath), "utf8");
    if (fixturePath === "project.json") {
      const project = JSON.parse(content) as {
        assets: Array<{ id: string; path: string; kind: string; subResourceId?: string }>;
      };
      const sprite = project.assets.find((asset) => asset.id === "asset-player-sprite");
      if (!sprite) throw new Error("Acceptance fixture is missing its Player Sprite Asset.");
      sprite.subResourceId = "player-frame";
      project.assets.push({
        id: "asset-player-sprite-alt",
        path: "assets/alternative.svg",
        kind: "image",
        subResourceId: "player-alt-frame",
      });
      content = JSON.stringify(project, null, 2);
    }
    if (fixturePath === "src/FollowTarget.ts") {
      const original = 'assetKinds: ["image"] as ["image"], required: true';
      if (!content.includes(original)) throw new Error("Acceptance Component Schema fixture has changed unexpectedly.");
      content = content.replace(original, 'assetKinds: ["image"] as ["image"], allowSubResource: true, required: true');
    }
    await writeProjectFile(page, projectPath, content);
  }
  await writeProjectFile(
    page,
    "assets/alternative.svg",
    readFileSync(resolve(fixtureRoot, "assets/player.svg"), "utf8"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForNativeProject(page);
});

test.afterEach(async ({ page }) => {
  for (const [fixturePath, projectPath] of fixtureFiles) {
    await writeProjectFile(
      page,
      projectPath,
      readFileSync(resolve(fixtureRoot, fixturePath), "utf8"),
    );
  }

  const response = await page.request.post("http://127.0.0.1:3000/editor/project/operations", {
    data: {
      operation: "project.deleteEntries",
      arguments: { relativePaths: ["assets/alternative.svg"] },
    },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json() as { error?: string };
  expect(result.error).toBeUndefined();
});

test("schema-driven Inspector filters stable Asset/Node references and preserves invalid drafts until corrected", async ({ page }) => {
  const component = page.getByTestId("component-inspector-component-follow-player");
  const assetPicker = component.getByLabel("sprite");
  const nodePicker = component.getByLabel("target");
  const speed = component.getByLabel("speed");

  await expect(assetPicker.locator("option")).toHaveCount(3);
  await expect(assetPicker.locator('option[value="asset-player-sprite"]')).toHaveCount(1);
  await expect(assetPicker.locator('option[value="asset-player-sprite-alt"]')).toHaveCount(1);
  await expect(assetPicker.locator('option[value="asset-follow-target-module"]')).toHaveCount(0);
  await assetPicker.selectOption("asset-player-sprite-alt");
  await expect(nodePicker.locator('option[value="node-enemy"]')).toHaveCount(1);
  await expect(nodePicker.locator('option[value="node-player"]')).toHaveCount(0);

  await speed.fill("-1");
  await page.getByTestId("hierarchy-item-enemy").click();
  await page.getByTestId("hierarchy-item-player").click();

  await expect(component.getByLabel("speed")).toHaveValue("-1");
  await expect(component.getByText(/below its minimum/)).toBeVisible();

  const beforeSave = await page.evaluate(async () => {
    const response = await fetch("/editor/project/scenes/Level.cge-scene.json", { cache: "no-store" });
    return response.json();
  });
  assert.equal(beforeSave.rootNodes[0].components[0].properties.speed, 4);

  await component.getByLabel("speed").fill("6");
  await page.getByTestId("hierarchy-item-enemy").click();
  await page.getByTestId("hierarchy-item-player").click();
  await expect(component.getByLabel("speed")).toHaveValue("6");
  await expect(component.getByText(/below its minimum/)).toHaveCount(0);
  await page.getByTestId("undo").click();
  await expect(component.getByLabel("speed")).toHaveValue("4");
  await page.getByTestId("redo").click();
  await expect(component.getByLabel("speed")).toHaveValue("6");

  const saveResponse = page.waitForResponse((response) => {
    if (response.url() !== "http://127.0.0.1:5173/editor/project/operations" || response.request().method() !== "POST") return false;
    try {
      return response.request().postDataJSON()?.operation === "project.writeFile" &&
        response.request().postDataJSON()?.arguments?.relativePath === "scenes/Level.cge-scene.json";
    } catch {
      return false;
    }
  });
  await page.getByTestId("save-scene").click();
  const saved = await saveResponse;
  expect(saved.ok()).toBeTruthy();

  const persisted = await page.evaluate(async () => {
    const response = await fetch("/editor/project/scenes/Level.cge-scene.json", { cache: "no-store" });
    return response.json();
  });
  assert.equal(persisted.rootNodes[0].components[0].properties.sprite.assetId, "asset-player-sprite-alt");
  assert.equal(persisted.rootNodes[0].components[0].properties.sprite.subResourceId, "player-alt-frame");
  assert.equal(persisted.rootNodes[0].components[0].properties.target.nodeId, "node-enemy");
  assert.equal(persisted.rootNodes[0].components[0].properties.speed, 6);

  await page.reload();
  await waitForNativeProject(page);
  await expect(page.getByTestId("component-inspector-component-follow-player").getByLabel("speed")).toHaveValue("6");
});
