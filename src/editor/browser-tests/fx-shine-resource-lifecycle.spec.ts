import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fxFixture = await readFile(
  resolve(root, "tests/workspace/test-typescript/scenes/fx-acceptance.scene"),
  "utf8",
);

type TextureSnapshot = {
  key: string;
  type: string;
  width: number | null;
  height: number | null;
};

async function readTextureSnapshot(page: Page): Promise<TextureSnapshot[]> {
  return page.evaluate(() => {
    const game = (window as Window & { __codogmaHostGame?: any }).__codogmaHostGame;
    if (!game?.textures?.list) {
      throw new Error("The Host Phaser Game or TextureManager is unavailable.");
    }

    return Object.entries(game.textures.list).map(([key, texture]: [string, any]) => {
      const source = texture.source?.[0];
      const width = [texture.width, source?.width, source?.glTexture?.width]
        .find((value) => typeof value === "number") ?? null;
      const height = [texture.height, source?.height, source?.glTexture?.height]
        .find((value) => typeof value === "number") ?? null;

      return {
        key,
        type: texture.constructor?.name ?? "Unknown",
        width,
        height,
      };
    });
  });
}

test("Shine releases its ColorRamp and DynamicTexture across repeated add/remove cycles", async ({ page }) => {
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
  });

  // Wrap Phaser.Game before the Host constructs its Scene View game.
  await page.addInitScript(() => {
    const currentDescriptor = Object.getOwnPropertyDescriptor(window, "Phaser");
    let namespace = currentDescriptor?.get
      ? currentDescriptor.get.call(window)
      : currentDescriptor?.value;

    const captureGame = (phaser: any) => {
      if (!phaser || typeof phaser.Game !== "function" || phaser.Game.__codogmaCaptureWrapped) return;

      const OriginalGame = phaser.Game;
      const WrappedGame = new Proxy(OriginalGame, {
        construct(target, args, newTarget) {
          const game = Reflect.construct(target, args, newTarget);
          (window as Window & { __codogmaHostGame?: unknown }).__codogmaHostGame = game;
          return game;
        },
      });
      Object.defineProperty(WrappedGame, "__codogmaCaptureWrapped", { value: true });
      phaser.Game = WrappedGame;
    };

    Object.defineProperty(window, "Phaser", {
      configurable: true,
      enumerable: true,
      get: () => namespace,
      set: (value) => {
        namespace = value;
        captureGame(value);
      },
    });

    captureGame(namespace);
  });

  const fixtureResponse = await page.request.post("http://127.0.0.1:3000/editor/api", {
    data: {
      method: "SetFileString",
      body: { path: "scenes/Level.scene", content: fxFixture },
    },
  });
  expect(fixtureResponse.ok()).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-item-paneldino")).toBeVisible();
  await expect(page.getByTestId("scene-stage").locator("canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => Boolean(
    (window as Window & { __codogmaHostGame?: any }).__codogmaHostGame?.textures?.list,
  ));

  await page.getByTestId("hierarchy-item-paneldino").click();
  const shineCard = page.getByTestId("fx-card-a464e782-c9d8-4b07-9456-b550f7383ed9");
  await expect(shineCard).toBeVisible();

  const beforeRemoval = await readTextureSnapshot(page);
  const shineColorRamp = beforeRemoval.filter((texture) => texture.width === 9 && texture.height === 1);
  const shineDynamicTexture = beforeRemoval.filter((texture) => texture.type === "DynamicTexture");
  expect(shineColorRamp).toHaveLength(1);
  expect(shineDynamicTexture).toHaveLength(2);

  await shineCard.getByRole("button", { name: "Remove Shine effect" }).click();
  await expect(shineCard).toHaveCount(0);
  await expect.poll(async () => {
    const textures = await readTextureSnapshot(page);
    return {
      colorRampCount: textures.filter((texture) => texture.width === 9 && texture.height === 1).length,
      dynamicTextureCount: textures.filter((texture) => texture.type === "DynamicTexture").length,
    };
  }).toEqual({ colorRampCount: 0, dynamicTextureCount: 1 });

  const baseline = await readTextureSnapshot(page);
  expect(baseline.some((texture) => texture.width === 5 && texture.height === 1)).toBe(true);
  const baselineKeys = baseline.map((texture) => texture.key).sort();
  const cycles: Array<{ addedKeys: string[]; returnedToBaseline: boolean }> = [];

  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByLabel("New FX type").selectOption("Shine");
    await page.getByTestId("add-fx").click();
    const addedShineCard = page.locator('[data-testid^="fx-card-"]').filter({
      has: page.getByText("Shine", { exact: true }),
    });
    await expect(addedShineCard).toHaveCount(1);

    await expect.poll(async () => {
      const textures = await readTextureSnapshot(page);
      return textures.filter((texture) => !baselineKeys.includes(texture.key)).length;
    }).toBeGreaterThanOrEqual(2);

    const withShine = await readTextureSnapshot(page);
    const addedKeys = withShine
      .map((texture) => texture.key)
      .filter((key) => !baselineKeys.includes(key));
    expect(withShine.some((texture) => addedKeys.includes(texture.key) && texture.width === 9 && texture.height === 1)).toBe(true);
    expect(withShine.some((texture) => addedKeys.includes(texture.key) && texture.type === "DynamicTexture")).toBe(true);

    await addedShineCard.getByRole("button", { name: "Remove Shine effect" }).click();
    await expect(addedShineCard).toHaveCount(0);
    await expect.poll(async () => (await readTextureSnapshot(page)).map((texture) => texture.key).sort())
      .toEqual(baselineKeys);
    cycles.push({ addedKeys, returnedToBaseline: true });
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  console.log("CODQA19_SHINE_RESOURCE_EVIDENCE=" + JSON.stringify({
    browser: await page.evaluate(() => navigator.userAgent),
    initialColorRampKeys: shineColorRamp.map((texture) => texture.key),
    initialDynamicTextureKeys: shineDynamicTexture.map((texture) => texture.key),
    baselineTextureCount: baselineKeys.length,
    cycles,
    pageErrors,
    consoleErrors,
    failedRequests,
  }));
});
