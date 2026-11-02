import { expect, test, type Locator, type Page } from "@playwright/test";


async function dragDockTabWithPointer(page: Page, source: Locator, target: Locator) {
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  if (!sourceBounds || !targetBounds) throw new Error("Dock tab geometry is unavailable.");

  const sourcePoint = {
    x: sourceBounds.x + sourceBounds.width / 2,
    y: sourceBounds.y + sourceBounds.height / 2,
  };
  const targetPoint = {
    x: targetBounds.x + targetBounds.width / 2,
    y: targetBounds.y + targetBounds.height / 2,
  };

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x + 10, sourcePoint.y, { steps: 2 });
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 10 });
  await page.mouse.up();
}

async function dragDockTabToEmptyZone(page: Page, source: Locator, targetZone: Locator) {
  const sourceBounds = await source.boundingBox();
  if (!sourceBounds) throw new Error("Source dock tab geometry is unavailable.");
  const sourcePoint = {
    x: sourceBounds.x + sourceBounds.width / 2,
    y: sourceBounds.y + sourceBounds.height / 2,
  };

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x + 10, sourcePoint.y, { steps: 2 });
  await expect(targetZone).toBeVisible();

  const targetBounds = await targetZone.boundingBox();
  if (!targetBounds) throw new Error("Empty dock target geometry is unavailable.");
  await page.mouse.move(
    targetBounds.x + targetBounds.width / 2,
    targetBounds.y + targetBounds.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
}

async function saveSceneWithShortcut(page: Page) {
  const responsePromise = page.waitForResponse((response) => {
    if (response.url() !== "http://127.0.0.1:5173/editor/api" || response.request().method() !== "POST") return false;
    try {
      return response.request().postDataJSON()?.method === "SetFileString";
    } catch {
      return false;
    }
  });
  await page.keyboard.press("Control+s");
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  await expect(page.getByTestId("save-scene")).toBeDisabled();
}

async function readSavedScene(page: Page) {
  const response = await page.request.get("http://127.0.0.1:5173/editor/project/scenes/Level.scene");
  expect(response.ok()).toBeTruthy();
  return response.json();
}
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

  await saveSceneWithShortcut(page);
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

  await dragDockTabWithPointer(
    page,
    bottomTabs.getByRole("tab", { name: "Project" }),
    bottomTabs.getByRole("tab", { name: "Animation" }),
  );
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




test("side panels can be grouped in another dock zone, closed and reopened without recreating the Scene canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();

  const initialLayout = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(initialLayout.leftWidth).toBe(228);
  expect(initialLayout.rightWidth).toBe(280);
  expect(initialLayout.bottomHeight).toBe(286);

  const canvas = page.getByTestId("scene-stage").locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const canvasHandle = await canvas.elementHandle();
  expect(canvasHandle).not.toBeNull();
  if (!canvasHandle) throw new Error("Scene canvas is unavailable.");

  const rightTabs = page.getByRole("tablist", { name: "Right dock panels" });
  const inspectorTab = rightTabs.getByRole("tab", { name: "Inspector" });
  await page.locator(".hierarchy-panel .panel-header").dragTo(inspectorTab);
  await expect(rightTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(inspectorTab).toBeVisible();
  const nativeDropOrder = await rightTabs.locator("[data-dock-tab]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-dock-tab")),
  );
  expect(nativeDropOrder.indexOf("Hierarchy")).toBeGreaterThan(nativeDropOrder.indexOf("Inspector"));

  await inspectorTab.click();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();
  await expect(page.getByTestId("hierarchy-panel")).not.toBeVisible();

  await rightTabs.getByRole("tab", { name: "Hierarchy" }).click();
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await page.getByRole("button", { name: "Close Hierarchy" }).click();
  await expect(rightTabs.getByRole("tab", { name: "Hierarchy" })).toHaveCount(0);
  await expect(page.getByTestId("hierarchy-panel")).not.toBeVisible();

  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitem", { name: "Show Hierarchy" }).click();
  await expect(rightTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  expect(await canvasHandle.evaluate((element) => element.isConnected)).toBe(true);

  await page.reload();
  const restoredRightTabs = page.getByRole("tablist", { name: "Right dock panels" });
  await expect(restoredRightTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(restoredRightTabs.getByRole("tab", { name: "Inspector" })).toBeVisible();
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByTestId("hierarchy-panel")).toHaveCount(1);
  await expect(page.getByTestId("inspector-panel")).toHaveCount(1);
  await expect(page.getByTestId("scene-stage").locator("canvas")).toHaveCount(1);

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(persisted.schemaVersion).toBe(1);
  expect(persisted.hierarchyZone).toBe("right");
  expect(persisted.inspectorZone).toBe("right");
});

test("pointer dragging a Bottom tab into a side group preserves the drop target order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await page.locator(".hierarchy-panel .panel-header").dragTo(bottomTabs);
  const sourceTab = bottomTabs.getByRole("tab", { name: "Hierarchy" });
  await expect(sourceTab).toBeVisible();

  const rightTabs = page.getByRole("tablist", { name: "Right dock panels" });
  const targetTab = rightTabs.getByRole("tab", { name: "Inspector" });
  await dragDockTabWithPointer(page, sourceTab, targetTab);

  await expect(rightTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toHaveCount(0);
  const tabOrder = await rightTabs.locator("[data-dock-tab]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-dock-tab")),
  );
  expect(tabOrder.indexOf("Hierarchy")).toBeGreaterThan(tabOrder.indexOf("Inspector"));
});

test("narrow viewport presents saved side panels in Bottom and restores their zones when widened", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".hierarchy-panel .panel-header").dragTo(page.getByTestId("dock-zone-right"));
  const rightTabs = page.getByRole("tablist", { name: "Right dock panels" });
  await expect(rightTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();

  await page.setViewportSize({ width: 700, height: 760 });
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-layout", "compact");
  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Inspector" })).toBeVisible();
  await expect(page.getByTestId("dock-zone-right")).not.toBeVisible();

  await bottomTabs.getByRole("tab", { name: "Hierarchy" }).click();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();
  const narrowState = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(narrowState.schemaVersion).toBe(1);
  expect(narrowState.bottomTab).toBe("Hierarchy");
  expect(narrowState.hierarchyZone).toBe("right");

  await page.reload();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("dock-zone-right")).toBeVisible();
  const restoredTabs = page.getByRole("tablist", { name: "Right dock panels" });
  await expect(restoredTabs.getByRole("tab", { name: "Hierarchy" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Bottom workspace" }).getByRole("tab", { name: "Hierarchy" })).toHaveCount(0);
});

test("dock tabs and splitters support keyboard navigation and focusable resizing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const splitter = page.getByTestId("splitter-hierarchy");
  const initialWidth = Number(await splitter.getAttribute("aria-valuenow"));
  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(initialWidth + 16));
  await page.keyboard.press("Home");
  await expect(splitter).toHaveAttribute("aria-valuenow", "170");

  await page.locator(".hierarchy-panel .panel-header").dragTo(page.getByTestId("dock-zone-right"));
  const rightTabs = page.getByRole("tablist", { name: "Right dock panels" });
  const hierarchyTab = rightTabs.getByRole("tab", { name: "Hierarchy" });
  await hierarchyTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(rightTabs.getByRole("tab", { name: "Inspector" })).toHaveAttribute("aria-selected", "true");
  await expect(rightTabs.getByRole("tab", { name: "Inspector" })).toBeFocused();
});

test("legacy and unknown layout data restore deterministic, versioned workspaces", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("codogma-test-layout-seeded") !== null) return;
    sessionStorage.setItem("codogma-test-layout-seeded", "yes");
    localStorage.setItem("codogma.editor.layout", JSON.stringify({
      leftWidth: 255,
      rightWidth: 305,
      bottomHeight: 330,
      consoleHeight: 110,
      hierarchyVisible: true,
      inspectorVisible: true,
      bottomTab: "Hierarchy",
      bottomTabOrder: ["Project", "Animation", "Components", "Console", "Hierarchy", "Inspector"],
      dockedPanels: ["Hierarchy"],
      consoleDocked: false
    }));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("tablist", { name: "Bottom workspace" }).getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(saved.schemaVersion).toBe(1);
  expect(saved.hierarchyZone).toBe("bottom");
  expect(saved.leftWidth).toBe(255);

  await page.evaluate(() => localStorage.setItem("codogma.editor.layout", JSON.stringify({
    schemaVersion: 999,
    leftWidth: 9999,
    hierarchyZone: "floating",
    bottomTab: "Unknown"
  })));
  await page.reload();
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(saved.schemaVersion).toBe(1);
  expect(saved.hierarchyZone).toBe("left");
  expect(saved.leftWidth).toBe(228);
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

test("FX preview reports unsupported parent objects instead of applying filters to Scene View placeholders", async ({ page }) => {
  const scene = JSON.parse(fxAcceptanceScene) as { displayList: Array<Record<string, unknown>> };
  scene.displayList.push({
    type: "Sprite",
    id: "fx-placeholder-sprite",
    label: "fxPlaceholderSprite",
    texture: { key: "dino" },
    x: 650,
    y: 470,
    list: [{
      type: "Bloom",
      id: "fx-placeholder-bloom",
      label: "placeholderBloom",
      preFX: false,
      threshold: 0.45,
      blurRadius: 3,
      blurSteps: 4,
      blurQuality: 1,
      blendAmount: 1,
    }],
  });

  const writeResponse = await page.request.post("http://127.0.0.1:3000/editor/api", {
    data: {
      method: "SetFileString",
      body: { path: "scenes/Level.scene", content: JSON.stringify(scene) },
    },
  });
  expect(writeResponse.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByTestId("hierarchy-item-fxplaceholdersprite")).toBeVisible();
  await page.getByTestId("hierarchy-item-fxplaceholdersprite").click();
  await expect(page.getByTestId("fx-card-fx-placeholder-bloom")).toBeVisible();

  await page.getByRole("tab", { name: "Console" }).click();
  await expect(
    page.getByRole("log", { name: "Editor console" }).getByText(
      /FX preview "Bloom" is unavailable for parent type "Sprite".*placeholder/,
    ),
  ).toBeVisible();

  const saved = await readSavedScene(page);
  const sprite = saved.displayList.find((item: { id?: string }) => item.id === "fx-placeholder-sprite");
  expect(sprite?.list?.[0]).toMatchObject({
    type: "Bloom",
    id: "fx-placeholder-bloom",
    threshold: 0.45,
    preFX: false,
  });
});

test("FX Inspector edits legacy effects and creates and restores a new Shine effect", async ({ page }) => {
  // This end-to-end flow covers edit, save, scene reload and FX preview restoration.
  test.setTimeout(90_000);

  const pageErrors: string[] = [];
  const unsupportedContainerInputWarnings: string[] = [];
  const gradientAlphaWarnings: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "warning") return;
    if (message.text().includes("Container.setInteractive")) {
      unsupportedContainerInputWarnings.push(message.text());
    }
    if (message.text().includes("Gradient is rendered as a sibling Game Object")) {
      gradientAlphaWarnings.push(message.text());
    }
  });

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

  const circleThickness = page.getByLabel("Circle Thickness");
  await circleThickness.fill("10");

  // Keep fields below the Inspector viewport actionable without changing selection.
  const bloomThreshold = page.getByLabel("Bloom Threshold");
  await bloomThreshold.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(bloomThreshold).toBeVisible();
  await bloomThreshold.fill("0.45");
  await bloomThreshold.press("Tab");
  await expect(bloomThreshold).toHaveValue("0.45");

  const bloomBlurQuality = page.getByLabel("Bloom Blur Quality");
  await bloomBlurQuality.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(bloomBlurQuality).toBeVisible();
  await bloomBlurQuality.fill("2");
  await bloomBlurQuality.press("Tab");
  await expect(bloomBlurQuality).toHaveValue("2");
  await saveSceneWithShortcut(page);
  let saved = await readSavedScene(page);
  let circleTarget = saved.displayList.find((item: { id?: string }) => item.id === "54a69896-9542-4238-8dfe-943635a5df30");
  expect(circleTarget.list[0].thickness).toBe(10);
  expect(circleTarget.list[1].threshold).toBe(0.45);
  expect(circleTarget.list[1].blurQuality).toBe(2);
  expect(circleTarget.list[1].preFX).toBe(false);

  await page.getByTestId("hierarchy-item-paneldino").press("Enter");
  await expect(page.getByTestId("hierarchy-item-paneldino")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("fx-card-a464e782-c9d8-4b07-9456-b550f7383ed9")).toBeVisible();
  await expect(page.getByLabel("Shine Duration (ms)")).toHaveValue("1500");
  const shineCard = page.getByTestId("fx-card-a464e782-c9d8-4b07-9456-b550f7383ed9");
  await shineCard.getByText("Reveal", { exact: true }).click();
  await expect(page.getByLabel("Shine Reveal")).toBeChecked();

  await page.getByTestId("hierarchy-item-gradienttarget").click();
  await expect(page.getByTestId("fx-card-d7548c09-2f26-450a-85f4-f7aa2c7475b0")).toBeVisible();
  await expect(page.getByLabel("Gradient Alpha")).toHaveValue("0.45");
  await page.getByLabel("Gradient Alpha").fill("0.6");
  await saveSceneWithShortcut(page);
  saved = await readSavedScene(page);
  const panel = saved.displayList.find((item: { id?: string }) => item.id === "317de9d0-d961-417f-bb05-b182fa41c107");
  const shine = panel.list.find((item: { id?: string }) => item.id === "0ecf0bc5-f543-4b6d-87ca-a53e5399321e").list[0];
  const gradientTarget = saved.displayList.find((item: { id?: string }) => item.id === "8f836a97-d201-49da-b69f-012575bf98f5");
  expect(shine.reveal).toBe(true);
  expect(gradientTarget.alpha).toBe(0.5);
  expect(gradientTarget.list[0].alpha).toBe(0.6);
  expect(gradientAlphaWarnings).toEqual([]);

  await page.getByTestId("hierarchy-item-circletarget").click();
  await page.getByRole("button", { name: "Remove Circle effect" }).click();
  await expect(page.getByTestId("fx-card-5ea3aca1-4a1a-4063-899a-636d14a0d234")).toHaveCount(0);
  await page.getByLabel("New FX type").selectOption("Circle");
  await page.getByTestId("add-fx").click();
  await expect(page.getByLabel("Circle Ring Color")).toHaveValue("#ff33b2");
  await page.getByLabel("Circle Ring Color").fill("0xA1B2C3");
  await page.getByLabel("Circle Thickness").fill("8");
  await saveSceneWithShortcut(page);
  saved = await readSavedScene(page);
  circleTarget = saved.displayList.find((item: { id?: string }) => item.id === "54a69896-9542-4238-8dfe-943635a5df30");
  expect(circleTarget.list.map((item: { type: string }) => item.type)).toEqual(["Bloom", "Circle"]);
  expect(circleTarget.list[1]).toMatchObject({ type: "Circle", color: "0xA1B2C3", thickness: 8 });
  expect(saved.displayList.find((item: { id?: string }) => item.id === "8f836a97-d201-49da-b69f-012575bf98f5").alpha).toBe(0.5);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("hierarchy-item-circletarget")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("hierarchy-item-circletarget").click();
  await expect(page.getByLabel("Circle Ring Color")).toHaveValue("0xA1B2C3");
  await expect(page.getByLabel("Circle Thickness")).toHaveValue("8");
  await expect(page.getByTestId("fx-card-5ea3aca1-4a1a-4063-899a-636d14a0d234")).toHaveCount(0);
  expect(gradientAlphaWarnings).toEqual([]);

  await page.getByTestId("hierarchy-item-circletarget").click();
  await page.getByRole("button", { name: "Remove Bloom effect" }).click();
  await saveSceneWithShortcut(page);
  saved = await readSavedScene(page);
  circleTarget = saved.displayList.find((item: { id?: string }) => item.id === "54a69896-9542-4238-8dfe-943635a5df30");
  expect(circleTarget.list.map((item: { type: string }) => item.type)).toEqual(["Circle"]);

  // Create the new preview after the legacy-effect edit/round-trip checks.
  await page.getByTestId("hierarchy-item-aftersibling").click();
  await page.locator(".inspector-scroll").evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.getByLabel("New FX type")).toBeVisible();
  await page.getByLabel("New FX type").selectOption("Shine");
  await page.getByTestId("add-fx").click();
  await expect(page.getByLabel("Shine Duration (ms)")).toHaveValue("2000");
  await saveSceneWithShortcut(page);

  saved = await readSavedScene(page);
  const afterSibling = saved.displayList.find((item: { label?: string }) => item.label === "afterSibling");
  const addedShine = afterSibling.list.find((item: { type?: string; id?: string; duration?: number }) => item.type === "Shine");
  expect(addedShine).toMatchObject({ type: "Shine", duration: 2000, reveal: false, yoyo: false });
  expect(typeof addedShine.id).toBe("string");
  const addedShineId = addedShine.id as string;

  await page.reload({ waitUntil: "domcontentloaded" });
  // loadProject() opens scenes/Level.scene by default; its loaded hierarchy is the readiness signal.
  await expect(page.getByTestId("hierarchy-item-circletarget")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("hierarchy-item-aftersibling").click();
  await expect(page.getByTestId(`fx-card-${addedShineId}`)).toBeVisible();
  await expect(page.getByLabel("Shine Duration (ms)")).toHaveValue("2000");
  expect(pageErrors).toEqual([]);
  expect(unsupportedContainerInputWarnings).toEqual([]);
  expect(gradientAlphaWarnings).toEqual([]);
});


test("responsive Bottom Dock sizing follows its splitter and constrains the detached Console", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");

  const bottomDock = page.getByTestId("bottom-dock");
  const bottomSplitter = page.getByTestId("splitter-bottom");
  await expect(bottomDock).toHaveJSProperty("offsetHeight", 207);

  await bottomSplitter.focus();
  await page.keyboard.press("End");
  await expect(bottomSplitter).toHaveAttribute("aria-valuenow", "420");
  await expect(bottomDock).toHaveJSProperty("offsetHeight", 420);

  await page.setViewportSize({ width: 700, height: 900 });
  await expect(bottomDock).toHaveJSProperty("offsetHeight", 420);
  await bottomSplitter.focus();
  await page.keyboard.press("Home");
  await expect(bottomSplitter).toHaveAttribute("aria-valuenow", "150");
  await expect(bottomDock).toHaveJSProperty("offsetHeight", 150);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const key = "codogma.editor.layout";
    const current = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...current, consoleHeight: 125 }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const consoleSplitter = page.getByTestId("splitter-console");
  const consolePanel = page.getByTestId("console-panel");
  await expect(consoleSplitter).toHaveAttribute("aria-valuemax", "61");
  await expect(consoleSplitter).toHaveAttribute("aria-valuenow", "61");
  await expect(consolePanel).toHaveJSProperty("offsetHeight", 61);
  await consoleSplitter.focus();
  await page.keyboard.press("End");
  await expect(consoleSplitter).toHaveAttribute("aria-valuenow", "61");
  await expect(consolePanel).toHaveJSProperty("offsetHeight", 61);

  let persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.bottomHeight).toBe(150);
  expect(persisted.consoleHeight).toBe(125);

  await bottomSplitter.focus();
  await page.keyboard.press("End");
  await expect(bottomSplitter).toHaveAttribute("aria-valuenow", "420");
  await expect(bottomDock).toHaveJSProperty("offsetHeight", 420);
  await expect(consoleSplitter).toHaveAttribute("aria-valuemax", "180");
  await expect(consoleSplitter).toHaveAttribute("aria-valuenow", "125");
  await expect(consolePanel).toHaveJSProperty("offsetHeight", 125);

  persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.bottomHeight).toBe(420);
  expect(persisted.consoleHeight).toBe(125);
});

test("side dock tabs support pointer docking and reordering into Bottom", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const rightTabs = page.getByRole("tablist", { name: "Right dock panels" });
  await page.locator(".hierarchy-panel .panel-header").dragTo(
    rightTabs.getByRole("tab", { name: "Inspector" }),
  );

  const sourceTab = rightTabs.getByRole("tab", { name: "Hierarchy" });
  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  const targetTab = bottomTabs.getByRole("tab", { name: "Project" });
  await dragDockTabWithPointer(page, sourceTab, targetTab);

  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(rightTabs.getByRole("tab", { name: "Hierarchy" })).toHaveCount(0);
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();
  const order = await bottomTabs.locator("[data-dock-tab]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-dock-tab")),
  );
  expect(order.indexOf("Hierarchy")).toBeGreaterThan(order.indexOf("Project"));
});


test("narrow viewport tab reordering preserves the permanent side dock zones", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto("/");

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Inspector" })).toBeVisible();

  await dragDockTabWithPointer(
    page,
    bottomTabs.getByRole("tab", { name: "Hierarchy" }),
    bottomTabs.getByRole("tab", { name: "Project" }),
  );

  let persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.hierarchyZone).toBe("left");
  expect(persisted.inspectorZone).toBe("right");
  expect(persisted.bottomTab).toBe("Hierarchy");

  await page.setViewportSize({ width: 1440, height: 900 });
  const leftTabs = page.getByRole("tablist", { name: "Left dock panels" });
  const rightTabs = page.getByRole("tablist", { name: "Right dock panels" });
  await expect(leftTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(rightTabs.getByRole("tab", { name: "Inspector" })).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toHaveCount(0);

  persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.hierarchyZone).toBe("left");
  expect(persisted.inspectorZone).toBe("right");
});


test("constrained side docks fit the 781–920px viewport without losing wide preferences", async ({ page }) => {
  await page.setViewportSize({ width: 781, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    const key = "codogma.editor.layout";
    const current = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({
      ...current,
      leftWidth: 360,
      rightWidth: 420,
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const workbench = page.getByTestId("workbench");
  const hierarchy = page.getByTestId("hierarchy-panel");
  const inspector = page.getByTestId("inspector-panel");
  const workspaceRow = page.locator(".workspace-row");
  const leftSplitter = page.getByTestId("splitter-hierarchy");
  const rightSplitter = page.getByTestId("splitter-inspector");

  await expect(workbench).toHaveAttribute("data-layout", "compact");
  await expect(hierarchy).toHaveJSProperty("offsetWidth", 194);
  await expect(inspector).toHaveJSProperty("offsetWidth", 250);
  await expect(leftSplitter).toHaveAttribute("aria-valuemax", "194");
  await expect(leftSplitter).toHaveAttribute("aria-valuenow", "194");
  await expect(rightSplitter).toHaveAttribute("aria-valuemax", "250");
  await expect(rightSplitter).toHaveAttribute("aria-valuenow", "250");

  const centerTrackWidth = await workspaceRow.evaluate((element) => {
    const tracks = getComputedStyle(element).gridTemplateColumns.split(" ");
    return Number.parseFloat(tracks[2] ?? "0");
  });
  expect(centerTrackWidth).toBeGreaterThanOrEqual(320);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(workbench).toHaveAttribute("data-layout", "wide");
  await expect(hierarchy).toHaveJSProperty("offsetWidth", 360);
  await expect(inspector).toHaveJSProperty("offsetWidth", 420);
  await expect(leftSplitter).toHaveAttribute("aria-valuemax", "360");
  await expect(rightSplitter).toHaveAttribute("aria-valuemax", "420");
});


test("empty side dock zones remain valid pointer drop targets and restore tab focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });

  await page.locator(".hierarchy-panel .panel-header").dragTo(bottomTabs);
  await page.locator(".inspector-panel .panel-header").dragTo(bottomTabs);
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Inspector" })).toBeVisible();
  await expect(page.getByTestId("dock-zone-left")).not.toBeVisible();
  await expect(page.getByTestId("dock-zone-right")).not.toBeVisible();

  await dragDockTabToEmptyZone(
    page,
    bottomTabs.getByRole("tab", { name: "Hierarchy" }),
    page.getByTestId("dock-zone-left"),
  );

  const leftTabs = page.getByRole("tablist", { name: "Left dock panels" });
  const hierarchyTab = leftTabs.getByRole("tab", { name: "Hierarchy" });
  await expect(hierarchyTab).toBeVisible();
  await expect(hierarchyTab).toBeFocused();
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toHaveCount(0);

  await dragDockTabToEmptyZone(
    page,
    bottomTabs.getByRole("tab", { name: "Inspector" }),
    page.getByTestId("dock-zone-right"),
  );

  const rightTabs = page.getByRole("tablist", { name: "Right dock panels" });
  const inspectorTab = rightTabs.getByRole("tab", { name: "Inspector" });
  await expect(inspectorTab).toBeVisible();
  await expect(inspectorTab).toBeFocused();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();

  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.hierarchyZone).toBe("left");
  expect(persisted.inspectorZone).toBe("right");
});


test("Bottom Dock preserves its preferred height when the browser viewport becomes shorter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/");

  const bottomDock = page.getByTestId("bottom-dock");
  const bottomSplitter = page.getByTestId("splitter-bottom");
  const workbench = page.getByTestId("workbench");
  await expect(bottomSplitter).toHaveAttribute("aria-valuemax", "251");
  await expect(bottomSplitter).toHaveAttribute("aria-valuenow", "251");
  await expect(bottomDock).toHaveJSProperty("offsetHeight", 251);

  const persistedAtShortHeight = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persistedAtShortHeight.bottomHeight).toBe(286);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(bottomSplitter).toHaveAttribute("aria-valuemax", "420");
  await expect(bottomSplitter).toHaveAttribute("aria-valuenow", "286");
  await expect(bottomDock).toHaveJSProperty("offsetHeight", 286);
  await expect(workbench.getByTestId("hierarchy-panel")).toBeVisible();
});


test("intermediate desktop widths progressively constrain side docks without clipping the Scene", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    const key = "codogma.editor.layout";
    const current = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({
      ...current,
      leftWidth: 360,
      rightWidth: 420,
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const workspaceRow = page.locator(".workspace-row");
  const leftSplitter = page.getByTestId("splitter-hierarchy");
  const rightSplitter = page.getByTestId("splitter-inspector");
  const hierarchy = page.getByTestId("hierarchy-panel");
  const inspector = page.getByTestId("inspector-panel");

  await expect(leftSplitter).toHaveAttribute("aria-valuemax", "265");
  await expect(leftSplitter).toHaveAttribute("aria-valuenow", "265");
  await expect(rightSplitter).toHaveAttribute("aria-valuemax", "322");
  await expect(rightSplitter).toHaveAttribute("aria-valuenow", "322");
  await expect(hierarchy).toHaveJSProperty("offsetWidth", 265);
  await expect(inspector).toHaveJSProperty("offsetWidth", 322);

  const centerTrackWidth = await workspaceRow.evaluate((element) => {
    const tracks = getComputedStyle(element).gridTemplateColumns.split(" ");
    return Number.parseFloat(tracks[2] ?? "0");
  });
  expect(centerTrackWidth).toBeGreaterThanOrEqual(320);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(hierarchy).toHaveJSProperty("offsetWidth", 360);
  await expect(inspector).toHaveJSProperty("offsetWidth", 420);
});
