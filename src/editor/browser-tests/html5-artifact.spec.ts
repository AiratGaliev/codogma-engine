import { expect, test } from "@playwright/test";

test("production artifact loads the native Scene through the Phaser adapter without editor or Vite services", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const forbiddenRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/(?:@vite\/client|src\/main\.ts)(?:\?|$)/.test(path) || path.startsWith("/editor/")) forbiddenRequests.push(request.url());
  });

  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  const canvas = page.locator("canvas[data-codogma-runtime='phaser']");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-codogma-scene-id", "scene-level");
  await expect(canvas).toHaveAttribute("data-codogma-node-count", "2");
  await expect(canvas).toHaveAttribute("data-codogma-component-count", "2");
  await expect(page.locator("canvas[data-codogma-runtime-error]")).toHaveCount(0);
  const firstFrameMs = await page.evaluate(() => performance.getEntriesByName("codogma-first-frame")[0]?.startTime ?? null);
  expect(firstFrameMs).not.toBeNull();
  await testInfo.attach("html5-first-frame.json", {
    body: JSON.stringify({ timeToFirstFrameMs: firstFrameMs, sceneId: "scene-level", nodeCount: 2, componentCount: 2 }, null, 2),
    contentType: "application/json",
  });
  console.log("HTML5_ARTIFACT_TIME_TO_FIRST_FRAME_MS=" + firstFrameMs);
  expect(forbiddenRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
