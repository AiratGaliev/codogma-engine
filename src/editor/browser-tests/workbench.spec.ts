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
const fxAcceptanceScene = await readFile(
  resolve(repositoryRoot, "tests/workspace/test-typescript/scenes/fx-acceptance.scene"),
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
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();
  await expect(page.getByTestId("hierarchy-item-dino")).toBeVisible();
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-layout", "compact");
  await expect(page.getByTestId("bottom-dock")).toHaveJSProperty("offsetHeight", 207);
  await expect(page.getByTestId("hierarchy-panel")).toHaveJSProperty("offsetWidth", 194);
  await expect(page.getByTestId("inspector-panel")).toHaveJSProperty("offsetWidth", 250);
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
    return scene.displayList.find((object: { label?: string; x?: number }) => object.label === "dino")?.x;
  });
  expect(savedX).toBe(465);

  await page.reload();
  await expect(page.getByLabel("Position X")).toHaveValue("465");
  const sceneCanvas = page.getByTestId("scene-stage").locator("canvas");
  await expect(sceneCanvas).toBeVisible({ timeout: 20_000 });
  const canvasHandle = await sceneCanvas.elementHandle();
  expect(canvasHandle).not.toBeNull();
  if (!canvasHandle) throw new Error("Scene canvas element is unavailable.");

  await page.getByRole("tab", { name: "Game" }).click();
  const frame = page.getByTestId("phaser-game-frame");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", /\/editor\/external\/index\.html\?restart=\d+/);
  await expect(page.frameLocator('[data-testid="phaser-game-frame"]').locator("canvas")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("tab", { name: "Scene" }).click();
  await expect(page.getByTestId("scene-stage")).toBeVisible();
  await expect(sceneCanvas).toBeVisible({ timeout: 20_000 });
  expect(await canvasHandle.evaluate((canvas) => canvas.isConnected)).toBe(true);
  await expect(page.getByTestId("phaser-game-frame")).toHaveCount(0);

  const canvasBounds = await sceneCanvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  if (!canvasBounds) throw new Error("Scene canvas bounds are unavailable.");
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.5,
    canvasBounds.y + canvasBounds.height * (432 / 600),
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

  await page.getByRole("tab", { name: "Console" }).click();
  await expect(page.getByTestId("console-panel")).toBeVisible();
  await expect(page.getByTestId("splitter-console")).toHaveCount(0);
  await page.getByRole("tab", { name: "Project" }).click();
  await expect(page.getByTestId("console-panel")).toHaveCount(0);

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


test("Scene Transform tools manipulate Phaser objects and commit one undoable change", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-item-dino")).toBeVisible();
  await page.getByTestId("hierarchy-item-dino").click();
  await page.getByRole("button", { name: "Move tool" }).click();

  const canvas = page.getByTestId("scene-stage").locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("Scene canvas bounds are unavailable.");

  const startX = bounds.x + bounds.width * 0.5;
  const startY = bounds.y + bounds.height * (245 / 600);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY + 12, { steps: 6 });
  await page.mouse.up();

  const positionX = page.getByLabel("Position X");
  await expect.poll(async () => Number(await positionX.inputValue())).toBeGreaterThan(400);
  await page.getByTestId("undo").click();
  await expect(positionX).toHaveValue("400");
});

test("Workbench switches between the wide and compact dock compositions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-layout", "wide");
  await expect(page.getByTestId("console-panel")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Console" })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-layout", "compact");
  await expect(page.getByRole("tab", { name: "Console" })).toBeVisible();
  await expect(page.getByTestId("console-panel")).toHaveCount(0);
});


test("Console panel can be dragged into the bottom Dock and undocked again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("console-panel")).toBeVisible();
  await expect(page.getByTestId("splitter-console")).toBeVisible();

  await page.locator(".desktop-console-panel .console-header").dragTo(page.locator(".bottom-tabs"));

  await expect(page.getByRole("tab", { name: "Console" })).toBeVisible();
  await expect(page.getByTestId("console-panel")).toBeVisible();
  await expect(page.getByTestId("splitter-console")).toHaveCount(0);
  await expect(page.getByTestId("bottom-dock")).toHaveClass(/console-docked/);

  await page.getByRole("button", { name: "Undock Console" }).click();
  await expect(page.getByRole("tab", { name: "Console" })).toHaveCount(0);
  await expect(page.getByTestId("splitter-console")).toBeVisible();
  await expect(page.getByTestId("console-panel")).toBeVisible();
});


test("Hierarchy and Inspector panels dock into Bottom, persist and restore to their home slots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await page.locator(".hierarchy-panel .panel-header").dragTo(bottomTabs);
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();

  await page.getByRole("button", { name: "Undock Hierarchy" }).click();
  await expect(page.locator(".workspace-row").getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toHaveCount(0);

  await page.locator(".inspector-panel .panel-header").dragTo(bottomTabs);
  await expect(bottomTabs.getByRole("tab", { name: "Inspector" })).toBeVisible();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("inspector-panel")).toBeVisible();
  await page.getByRole("button", { name: "Undock Inspector" }).click();
  await expect(page.locator(".workspace-row").getByTestId("inspector-panel")).toBeVisible();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("inspector-panel")).toHaveCount(0);
});

test("Bottom Dock tabs can be reordered and scene shortcuts respect the focused panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });

  await bottomTabs.getByRole("tab", { name: "Project" }).dragTo(bottomTabs.getByRole("tab", { name: "Animation" }));
  const tabOrder = await bottomTabs.locator("[data-dock-tab]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-dock-tab")),
  );
  expect(tabOrder.indexOf("Project")).toBeGreaterThan(tabOrder.indexOf("Animation"));

  const hierarchyItem = page.getByTestId("hierarchy-item-dino");
  await hierarchyItem.click();
  await page.keyboard.press("w");
  await expect(page.getByRole("button", { name: "Move tool" })).toHaveAttribute("aria-pressed", "true");

  const positionX = page.getByLabel("Position X");
  await positionX.focus();
  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: "Move tool" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Rotate tool" })).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Control+p");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(positionX).toBeFocused();
});


test("SolidJS Host owns an MCP bridge session and serves scene commands", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-item-dino")).toBeVisible();
  await expect(page.getByTestId("scene-stage").locator("canvas")).toBeVisible({ timeout: 20_000 });

  await expect.poll(async () => {
    const response = await page.request.get("/editor/mcp-bridge-status");
    if (!response.ok()) return null;
    const status = await response.json();
    return { connected: status.connected, activeClientType: status.activeClientType };
  }).toEqual({ connected: true, activeClientType: "solidjs" });

  const activeSceneResponse = await page.request.post("/editor/mcp-bridge", {
    data: { tool: "ide-get-active-scene", args: {} },
  });
  expect(activeSceneResponse.ok()).toBeTruthy();
  const activeScene = await activeSceneResponse.json();
  expect(activeScene.content?.[0]?.type).toBe("text");
  const activeSceneData = JSON.parse(activeScene.content[0].text);
  expect(activeSceneData.scenePath).toBe("scenes/Level.scene");
  expect(activeSceneData.sceneKey).toBeTruthy();

  const screenshotResponse = await page.request.post("/editor/mcp-bridge", {
    data: {
      tool: "scene-get-screenshot",
      args: { scenePath: "scenes/Level.scene", x: 0, y: 0, width: 160, height: 120 },
    },
  });
  expect(screenshotResponse.ok()).toBeTruthy();
  const screenshot = await screenshotResponse.json();
  expect(screenshot.content?.[0]?.type).toBe("image");
  expect(screenshot.content[0].mimeType).toBe("image/png");
  expect(screenshot.content[0].data.length).toBeGreaterThan(100);
});


test("Animation workspace previews and persists a Phaser JSONAnimations timeline", async ({ page }) => {
  const animationDocument = {
    anims: [{
      key: "walk_preview",
      frameRate: 12,
      repeat: -1,
      yoyo: false,
      frames: [
        { key: "dino", frame: "walk_0", duration: 120 },
        { key: "dino", frame: "walk_1", duration: 100 },
      ],
    }],
    globalTimeScale: 1,
    settings: { sourceLang: "JAVA_SCRIPT", generateCode: false, esModule: false },
    meta: {
      app: "Codogma Engine - Animations Editor",
      contentType: "Phaser v3 Animations",
    },
  };

  const writeResponse = await page.request.post("http://127.0.0.1:3000/editor/api", {
    data: {
      method: "SetFileString",
      body: { path: "animations/walk.json", content: JSON.stringify(animationDocument, null, 2) },
    },
  });
  expect(writeResponse.ok()).toBeTruthy();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Project" }).click();
  await page.getByLabel("Search project files").fill("walk.json");
  await page.getByRole("button", { name: /animations\/walk\.json/ }).click();

  await expect(page.getByTestId("animation-workspace")).toBeVisible();
  await expect(page.getByLabel("Animation key")).toHaveValue("walk_preview");
  await expect(page.getByTestId("animation-frame-strip").getByTestId("animation-timeline-frame-0")).toBeVisible();
  await expect(page.getByTestId("animation-frame-strip").getByTestId("animation-timeline-frame-1")).toBeVisible();
  await expect(page.getByTestId("animation-preview-image")).toBeVisible();

  await page.getByRole("button", { name: "Play animation" }).click();
  await expect.poll(async () => {
    const value = await page.getByTestId("animation-playhead-time").textContent();
    return Number.parseFloat(value ?? "0");
  }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause animation" }).click();
  const pausedTime = await page.getByTestId("animation-playhead-time").textContent();
  await expect(page.getByRole("button", { name: "Play animation" })).toBeEnabled();
  await page.getByRole("button", { name: "Stop animation" }).click();
  await expect(page.getByTestId("animation-playhead-time")).toHaveText("0.00 s");
  expect(pausedTime).not.toBe("0.00 s");

  await page.getByTestId("animation-timeline-frame-0").click();
  await page.getByLabel("Selected frame duration").fill("160");
  await page.getByLabel("Animation yoyo").check();
  await page.getByLabel("Animation repeat delay").fill("40");
  await page.getByRole("button", { name: "Move selected frame down" }).click();
  await page.getByTestId("save-animation").click();
  await expect(page.getByTestId("save-animation")).toBeDisabled();

  const saved = await page.evaluate(async () => {
    const response = await fetch("/editor/project/animations/walk.json", { cache: "no-store" });
    return response.json();
  });
  expect(saved.anims[0].yoyo).toBe(true);
  expect(saved.anims[0].repeatDelay).toBe(40);
  expect(saved.anims[0].frames[1].duration).toBe(160);
  expect(saved.anims[0].frames[0].frame).toBe("walk_1");

  await page.reload();
  await page.getByRole("tab", { name: "Project" }).click();
  await page.getByLabel("Search project files").fill("walk.json");
  await page.getByRole("button", { name: /animations\/walk\.json/ }).click();
  await expect(page.getByLabel("Animation key")).toHaveValue("walk_preview");
  await expect(page.getByLabel("Animation yoyo")).toBeChecked();
  await expect(page.getByLabel("Animation repeat delay")).toHaveValue("40");
  await expect(page.getByLabel("Selected frame duration")).toHaveValue("100");
  await page.getByTestId("animation-timeline-frame-1").click();
  await expect(page.getByLabel("Selected frame duration")).toHaveValue("160");
});

test("FX Inspector edits, previews, saves and reopens legacy Circle, Bloom, Gradient and Shine data", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const writeResponse = await page.request.post("http://127.0.0.1:3000/editor/api", {
    data: {
      method: "SetFileString",
      body: { path: "scenes/Level.scene", content: fxAcceptanceScene },
    },
  });
  expect(writeResponse.ok()).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-item-circletarget")).toBeVisible();
  await expect(page.getByTestId("hierarchy-item-paneldino")).toBeVisible();
  await expect(page.getByTestId("hierarchy-item-circlefx")).toHaveCount(0);

  await page.getByTestId("hierarchy-item-circletarget").click();
  await expect(page.getByTestId("fx-inspector")).toBeVisible();
  await expect(page.getByTestId("fx-card-5ea3aca1-4a1a-4063-899a-636d14a0d234")).toBeVisible();
  await expect(page.getByTestId("fx-card-64b0a02a-3983-4f7f-91f7-679622bb6c38")).toBeVisible();
  await expect(page.getByLabel("Circle Thickness")).toHaveValue("6");
  await expect(page.getByLabel("Bloom Threshold")).toHaveValue("0.3");
  await expect(page.getByLabel("Bloom filter stage")).toHaveValue("external");

  await page.getByLabel("Circle Thickness").fill("10");
  await page.getByLabel("Bloom Threshold").fill("0.45");
  await page.getByLabel("Bloom Threshold").press("Tab");
  await expect(page.getByLabel("Bloom Threshold")).toHaveValue("0.45");
  await page.getByLabel("Bloom Blur Quality").fill("2");
  await page.getByLabel("Bloom Blur Quality").press("Tab");
  await expect(page.getByLabel("Bloom Blur Quality")).toHaveValue("2");
  await page.getByTestId("save-scene").click();
  await expect(page.getByTestId("save-scene")).toBeDisabled();

  let saved = await page.evaluate(async () => {
    const response = await fetch("/editor/project/scenes/Level.scene", { cache: "no-store" });
    return response.json();
  });
  let circleTarget = saved.displayList.find((item: { id?: string }) => item.id === "54a69896-9542-4238-8dfe-943635a5df30");
  expect(circleTarget.list[0].thickness).toBe(10);
  expect(circleTarget.list[1].threshold).toBe(0.45);
  expect(circleTarget.list[1].blurQuality).toBe(2);
  expect(circleTarget.list[1].preFX).toBe(false);

  await page.reload();
  await expect(page.getByRole("button", { name: /Level\\.scene SCENE/ })).toBeVisible();
  await page.getByRole("button", { name: /Level\\.scene SCENE/ }).click();
  await expect(page.getByTestId("hierarchy-item-circletarget")).toBeVisible();
  await page.getByTestId("hierarchy-item-circletarget").click();
  await expect(page.getByLabel("Circle Thickness")).toHaveValue("10");
  await expect(page.getByLabel("Bloom Threshold")).toHaveValue("0.45");

  await page.getByTestId("hierarchy-item-paneldino").click();
  await expect(page.getByTestId("fx-card-a464e782-c9d8-4b07-9456-b550f7383ed9")).toBeVisible();
  await expect(page.getByLabel("Shine Duration (ms)")).toHaveValue("1500");
  await page.getByLabel("Shine Reveal").check();

  await page.getByTestId("hierarchy-item-gradienttarget").click();
  await expect(page.getByTestId("fx-card-d7548c09-2f26-450a-85f4-f7aa2c7475b0")).toBeVisible();
  await expect(page.getByLabel("Gradient Alpha")).toHaveValue("0.45");
  await page.getByLabel("Gradient Alpha").fill("0.6");
  await page.getByTestId("save-scene").click();

  saved = await page.evaluate(async () => {
    const response = await fetch("/editor/project/scenes/Level.scene", { cache: "no-store" });
    return response.json();
  });
  const panel = saved.displayList.find((item: { id?: string }) => item.id === "317de9d0-d961-417f-bb05-b182fa41c107");
  const shine = panel.list.find((item: { id?: string }) => item.id === "0ecf0bc5-f543-4b6d-87ca-a53e5399321e").list[0];
  const gradientTarget = saved.displayList.find((item: { id?: string }) => item.id === "8f836a97-d201-49da-b69f-012575bf98f5");
  expect(shine.reveal).toBe(true);
  expect(gradientTarget.list[0].alpha).toBe(0.6);

  await page.getByTestId("hierarchy-item-circletarget").click();
  await page.getByRole("button", { name: "Remove Bloom effect" }).click();
  await page.getByTestId("save-scene").click();
  saved = await page.evaluate(async () => {
    const response = await fetch("/editor/project/scenes/Level.scene", { cache: "no-store" });
    return response.json();
  });
  circleTarget = saved.displayList.find((item: { id?: string }) => item.id === "54a69896-9542-4238-8dfe-943635a5df30");
  expect(circleTarget.list.map((item: { type: string }) => item.type)).toEqual(["Circle"]);
  expect(pageErrors).toEqual([]);
});
