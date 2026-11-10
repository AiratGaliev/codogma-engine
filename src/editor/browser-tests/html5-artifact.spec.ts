import { expect, test } from "@playwright/test";

test("production artifact loads the native Scene through the selected Phaser runtime without editor or Vite services", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const forbiddenRequests: string[] = [];
  const crossOriginRequests: string[] = [];
  const invalidMimeResponses: string[] = [];
  const artifactOrigin = new URL("http://127.0.0.1:4179").origin;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    const path = url.pathname;
    if (url.origin !== artifactOrigin) crossOriginRequests.push(request.url());
    if (/\/(?:@vite|@fs|src\/|node_modules\/|editor\/)/.test(path)) forbiddenRequests.push(request.url());
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    const contentType = response.headers()["content-type"] ?? "";
    if (/\.m?js$/.test(path) && !contentType.includes("javascript")) invalidMimeResponses.push(response.url() + " => " + contentType);
    if (/\.svg$/.test(path) && !contentType.includes("svg+xml")) invalidMimeResponses.push(response.url() + " => " + contentType);
  });

  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  const canvas = page.locator("canvas[data-codogma-runtime='phaser']");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-codogma-scene-id", "scene-level");
  await expect(canvas).toHaveAttribute("data-codogma-node-count", "2");
  await expect(canvas).toHaveAttribute("data-codogma-component-count", "2");
  const expectedVariant = process.env.CODOGMA_HTML5_EXPECT_VARIANT ?? "full";
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-phaser-variant", expectedVariant);
  await expect(app).toHaveAttribute("data-phaser-arcade", "true");
  if (expectedVariant === "arcade-only") {
    await expect(app).toHaveAttribute("data-phaser-matter", "false");
  } else {
    await expect(app).toHaveAttribute("data-phaser-matter", "true");
  }
  await expect(page.locator("canvas[data-codogma-runtime-error]")).toHaveCount(0);
  await page.waitForFunction(() => performance.getEntriesByName("codogma-first-frame").length > 0);
  const firstFrameMs = await page.evaluate(() => performance.getEntriesByName("codogma-first-frame")[0]?.startTime ?? null);
  expect(firstFrameMs).not.toBeNull();
  await testInfo.attach("html5-first-frame.json", {
    body: JSON.stringify({ timeToFirstFrameMs: firstFrameMs, sceneId: "scene-level", nodeCount: 2, componentCount: 2 }, null, 2),
    contentType: "application/json",
  });
  console.log("HTML5_ARTIFACT_TIME_TO_FIRST_FRAME_MS=" + firstFrameMs);
  expect(forbiddenRequests).toEqual([]);
  expect(crossOriginRequests).toEqual([]);
  expect(invalidMimeResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
});
