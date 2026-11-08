import { expect, test, type Locator, type Page } from "@playwright/test";
import { WORKSPACE_LAYOUT_SCHEMA_VERSION } from "../src/domain/workspace-layout.ts";

async function scrollInspectorToAddFx(page: Page) {
  const addFx = page.getByTestId("add-fx");
  await addFx.evaluate((element) => {
    element.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await expect(addFx).toBeInViewport();
}

async function waitForEditorProject(page: Page) {
  await expect(page.locator(".status-bar-left")).not.toContainText("Loading project", {
    timeout: 20_000,
  });
  await expect(page.locator(".connection-overlay")).toHaveCount(0);
}
async function dragDockTabWithPointer(page: Page, source: Locator, target: Locator) {
  await waitForEditorProject(page);
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
  await waitForEditorProject(page);
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

async function dragPanelHeaderWithPointer(
  page: Page,
  source: Locator,
  targetZone: Locator,
) {
  await waitForEditorProject(page);
  const sourceBounds = await source.boundingBox();
  if (!sourceBounds) throw new Error("Source panel header geometry is unavailable.");
  const sourcePoint = {
    x: sourceBounds.x + sourceBounds.width / 2,
    y: sourceBounds.y + sourceBounds.height / 2,
  };

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x + 12, sourcePoint.y, { steps: 3 });
  await expect(targetZone).toBeVisible();

  const targetBounds = await targetZone.boundingBox();
  if (!targetBounds) throw new Error("Pointer drag target geometry is unavailable.");
  await page.mouse.move(
    targetBounds.x + targetBounds.width / 2,
    targetBounds.y + targetBounds.height / 2,
    { steps: 8 },
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
  await expect(page.getByRole("tab", { name: "Console" })).toBeVisible();
  await expect(page.getByTestId("console-panel")).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-layout", "compact");
  await expect(page.getByRole("tab", { name: "Console" })).toBeVisible();
  await expect(page.getByTestId("console-panel")).toHaveCount(0);
});


test("Console is docked in the Bottom group by default and supports reversible Undock", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const consoleTab = page.getByRole("tab", { name: "Console" });
  await expect(consoleTab).toBeVisible();
  await expect(page.getByTestId("splitter-console")).toHaveCount(0);

  await consoleTab.click();
  await expect(page.getByTestId("console-panel")).toBeVisible();
  await page.getByRole("button", { name: "Undock Console" }).click();

  await expect(page.getByRole("tab", { name: "Console" })).toHaveCount(0);
  await expect(page.getByTestId("splitter-console")).toBeVisible();
  await expect(page.getByTestId("console-panel")).toBeVisible();

  await dragPanelHeaderWithPointer(page, page.locator(".desktop-console-panel .console-header"), page.locator(".bottom-tabs"));
  await expect(page.getByRole("tab", { name: "Console" })).toBeVisible();
  await expect(page.getByTestId("splitter-console")).toHaveCount(0);
});


test("Main menu and Add Object menu dismiss on pointer interaction outside", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("menuitem", { name: "View" }).click();
  await expect(page.locator(".menu-popover")).toBeVisible();
  await page.getByRole("menuitem", { name: "Window" }).click();
  await expect(page.getByRole("menuitemradio", { name: "Project" })).toBeVisible();
  await page.locator(".brand-name").click();
  await expect(page.locator(".menu-popover")).toHaveCount(0);

  await page.getByRole("button", { name: "Add object" }).click();
  await expect(page.locator(".add-object-menu")).toBeVisible();
  await page.getByRole("tab", { name: "Game" }).click();
  await expect(page.locator(".add-object-menu")).toHaveCount(0);
});

test("Bottom workspace tabs close independently and the dock collapses when empty", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });

  for (const panel of ["Project", "Animation", "Components", "Console"]) {
    const closeButton = bottomTabs.getByRole("button", { name: "Close " + panel });
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expect(bottomTabs.getByRole("tab", { name: panel })).toHaveCount(0);
  }

  await expect(page.getByTestId("bottom-dock")).toBeHidden();
  await expect(page.getByTestId("splitter-bottom")).toBeHidden();
  await expect(page.getByTestId("workbench")).toHaveClass(/bottom-hidden/);

  await page.getByRole("menuitem", { name: "View" }).click();
  const projectToggle = page.getByRole("menuitemcheckbox", { name: "Project" });
  await expect(projectToggle).toHaveAttribute("aria-checked", "false");
  await projectToggle.click();
  await expect(bottomTabs.getByRole("tab", { name: "Project" })).toBeVisible();
  await expect(page.getByTestId("bottom-dock")).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Project" })).toHaveAttribute("aria-selected", "true");
});

test("middle-click closes a Bottom tab and activates a visible fallback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  const animationTab = bottomTabs.getByRole("tab", { name: "Animation" });

  await animationTab.click();
  await expect(animationTab).toHaveAttribute("aria-selected", "true");
  await animationTab.click({ button: "middle" });

  await expect(bottomTabs.getByRole("tab", { name: "Animation" })).toHaveCount(0);
  await expect(bottomTabs.getByRole("tab", { name: "Project" })).toHaveAttribute("aria-selected", "true");
});

test("detached Console remains visible when all Bottom tabs are closed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    const key = "codogma.editor.layout";
    const current = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...current, consoleDocked: false }));
  });
  await page.reload();

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  for (const panel of ["Project", "Animation", "Components"]) {
    await page.getByRole("button", { name: "Close " + panel }).click();
    await expect(bottomTabs.getByRole("tab", { name: panel })).toHaveCount(0);
  }

  await expect(bottomTabs.getByRole("tab")).toHaveCount(0);
  await expect(page.getByTestId("workbench")).toHaveClass(/bottom-tabs-empty/);
  await expect(page.getByTestId("bottom-dock")).toBeVisible();
  await expect(page.getByTestId("splitter-bottom")).toBeVisible();
  await expect(page.getByTestId("splitter-console")).toBeVisible();
  await expect(page.getByTestId("console-panel")).toBeVisible();
});

test("Window menu marks the selected Bottom tab with a checkmark", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("menuitem", { name: "Window" }).click();
  const projectItem = page.getByRole("menuitemradio", { name: "Project" });
  const animationItem = page.getByRole("menuitemradio", { name: "Animation" });
  await expect(projectItem).toHaveAttribute("aria-checked", "true");
  await expect(projectItem).toContainText("✓");
  await expect(animationItem).toHaveAttribute("aria-checked", "false");

  await animationItem.click();
  await expect(page.getByRole("tab", { name: "Animation" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("menuitem", { name: "Window" }).click();
  await expect(page.getByRole("menuitemradio", { name: "Project" })).toHaveAttribute("aria-checked", "false");
  const selectedAnimation = page.getByRole("menuitemradio", { name: "Animation" });
  await expect(selectedAnimation).toHaveAttribute("aria-checked", "true");
  await expect(selectedAnimation).toContainText("✓");
});

test("Console closes and reopens in Bottom and explicit Undock persists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await bottomTabs.getByRole("tab", { name: "Console" }).click();
  await expect(page.getByTestId("console-panel")).toBeVisible();

  await bottomTabs.getByRole("button", { name: "Close Console" }).click();
  await expect(bottomTabs.getByRole("tab", { name: "Console" })).toHaveCount(0);
  await expect(page.getByTestId("splitter-console")).toHaveCount(0);
  let persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(persisted.consoleVisible).toBe(false);
  expect(persisted.consoleDocked).toBe(true);

  await page.getByRole("menuitem", { name: "View" }).click();
  const consoleToggle = page.getByRole("menuitemcheckbox", { name: "Console" });
  await expect(consoleToggle).toHaveAttribute("aria-checked", "false");
  await consoleToggle.click();
  await expect(bottomTabs.getByRole("tab", { name: "Console" })).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Console" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("console-panel")).toBeVisible();

  await page.getByRole("button", { name: "Undock Console" }).click();
  await expect(bottomTabs.getByRole("tab", { name: "Console" })).toHaveCount(0);
  await expect(page.getByTestId("splitter-console")).toBeVisible();
  await expect(page.getByTestId("console-panel")).toBeVisible();
  persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(persisted.consoleDocked).toBe(false);

  await page.reload();
  await expect(page.getByTestId("splitter-console")).toBeVisible();
  await expect(page.getByTestId("console-panel")).toBeVisible();
  persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(persisted.consoleDocked).toBe(false);
});

test("undocking Console selects a visible Bottom tab when Project is closed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await page.getByRole("button", { name: "Close Project" }).click();
  await expect(bottomTabs.getByRole("tab", { name: "Project" })).toHaveCount(0);
  await expect(bottomTabs.getByRole("tab", { name: "Animation" })).toHaveAttribute("aria-selected", "true");

  await bottomTabs.getByRole("tab", { name: "Console" }).click();
  await expect(page.getByTestId("console-panel")).toBeVisible();
  await page.getByRole("button", { name: "Undock Console" }).click();

  await expect(bottomTabs.getByRole("tab", { name: "Console" })).toHaveCount(0);
  await expect(bottomTabs.getByRole("tab", { name: "Animation" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("animation-workspace")).toBeVisible();
  await expect(bottomTabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
});

test("Hierarchy and Inspector panels dock into Bottom, persist and restore to their home slots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await dragPanelHeaderWithPointer(page, page.locator(".hierarchy-panel .panel-header"), bottomTabs);
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();

  await page.getByRole("button", { name: "Undock Hierarchy" }).click();
  await expect(page.locator(".workspace-row").getByTestId("hierarchy-panel")).toBeVisible();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toHaveCount(0);

  await dragPanelHeaderWithPointer(page, page.locator(".inspector-panel .panel-header"), bottomTabs);
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
  await dragPanelHeaderWithPointer(page, page.locator(".hierarchy-panel .panel-header"), inspectorTab);
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
  const hierarchyToggle = page.getByRole("menuitemcheckbox", { name: "Hierarchy" });
  await expect(hierarchyToggle).toHaveAttribute("aria-checked", "false");
  await expect(hierarchyToggle).not.toContainText("Hide");
  await hierarchyToggle.click();
  await expect(rightTabs.getByRole("tab", { name: "Hierarchy" })).toBeVisible();

  await page.getByRole("menuitem", { name: "View" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Hierarchy" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitem", { name: "View" }).click();
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
  expect(persisted.schemaVersion).toBe(WORKSPACE_LAYOUT_SCHEMA_VERSION);
  expect(persisted.hierarchyZone).toBe("right");
  expect(persisted.inspectorZone).toBe("right");
});

test("pointer dragging a Bottom tab into a side group preserves the drop target order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await dragPanelHeaderWithPointer(page, page.locator(".hierarchy-panel .panel-header"), bottomTabs);
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
  await expect(page.getByTestId("scene-stage").locator("canvas")).toBeVisible({ timeout: 20_000 });
  await dragPanelHeaderWithPointer(page, page.locator(".hierarchy-panel .panel-header"), page.getByTestId("dock-zone-right"));
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
  expect(narrowState.schemaVersion).toBe(WORKSPACE_LAYOUT_SCHEMA_VERSION);
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

test("panel-header pointer docking preview can be canceled with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForEditorProject(page);
  const header = page.locator(".hierarchy-panel .panel-header");
  const target = page.getByTestId("bottom-tabs");
  const a = await header.boundingBox(), b = await target.boundingBox();
  if (!a || !b) throw new Error("Dock drag geometry is unavailable.");
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
  await page.mouse.down();
  await page.mouse.move(a.x+a.width/2+12,a.y+a.height/2,{steps:3});
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});
  await expect(page.getByTestId("dock-drop-preview")).toBeVisible();
  await expect(page.getByTestId("dock-drag-ghost")).toContainText("Hierarchy");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("dock-drop-preview")).toHaveCount(0);
  await expect(page.getByTestId("dock-drag-ghost")).toHaveCount(0);
  await page.mouse.up();
  const layout = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(layout.hierarchyZone).toBe("left");
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
});

test("tab insertion marker supports dropping before an existing tab", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForEditorProject(page);
  const tabs = page.getByRole("tablist", { name: "Bottom workspace" });
  const sourceTab = tabs.getByRole("tab", { name: "Animation" });
  const targetTab = tabs.getByRole("tab", { name: "Project" });
  const a = await sourceTab.boundingBox(), b = await targetTab.boundingBox();
  if (!a || !b) throw new Error("Tab drag geometry is unavailable.");
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
  await page.mouse.down();
  await page.mouse.move(a.x+a.width/2+10,a.y+a.height/2,{steps:2});
  await page.mouse.move(b.x+3,b.y+b.height/2,{steps:8});
  await expect(targetTab).toHaveClass(/dock-drop-insert-before/);
  await page.mouse.up();
  const order = await tabs.locator("[data-dock-tab]").evaluateAll((elements) => elements.map((el) => el.getAttribute("data-dock-tab")));
  expect(order.indexOf("Animation")).toBeLessThan(order.indexOf("Project"));
});

test("splitter double-click restores its adaptive workspace default", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const splitter = page.getByTestId("splitter-hierarchy");
  const defaultWidth = Number(await splitter.getAttribute("aria-valuenow"));
  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(defaultWidth + 16));
  await splitter.dblclick();
  await expect(splitter).toHaveAttribute("aria-valuenow", String(defaultWidth));
  const layout = await page.evaluate(() => JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"));
  expect(layout.leftWidthCustomized).toBe(false);
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
  const resizedLayout = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(resizedLayout.leftWidthCustomized).toBe(true);

  await dragPanelHeaderWithPointer(page, page.locator(".hierarchy-panel .panel-header"), page.getByTestId("dock-zone-right"));
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
  expect(saved.schemaVersion).toBe(WORKSPACE_LAYOUT_SCHEMA_VERSION);
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
  expect(saved.schemaVersion).toBe(WORKSPACE_LAYOUT_SCHEMA_VERSION);
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
  test.setTimeout(180_000);

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
  await scrollInspectorToAddFx(page);
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
  await scrollInspectorToAddFx(page);
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
  await waitForEditorProject(page);

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
    localStorage.setItem(key, JSON.stringify({ ...current, consoleHeight: 125, consoleDocked: false }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditorProject(page);

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
  await dragPanelHeaderWithPointer(
    page,
    page.locator(".hierarchy-panel .panel-header"),
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
  await waitForEditorProject(page);

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

  await dragPanelHeaderWithPointer(page, page.locator(".hierarchy-panel .panel-header"), bottomTabs);
  await dragPanelHeaderWithPointer(page, page.locator(".inspector-panel .panel-header"), bottomTabs);
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


test("exact user-selected default dimensions survive compact restore and wide return", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("codogma.editor.layout", JSON.stringify({
      schemaVersion: 1,
      leftWidth: 228,
      rightWidth: 280,
      bottomHeight: 286,
      consoleHeight: 96,
      leftWidthCustomized: true,
      rightWidthCustomized: true,
      bottomHeightCustomized: true,
      consoleHeightCustomized: true,
      hierarchyVisible: true,
      inspectorVisible: true,
      hierarchyZone: "left",
      inspectorZone: "right",
      leftActivePanel: "Hierarchy",
      rightActivePanel: "Inspector",
      bottomTab: "Project",
      bottomTabOrder: ["Project", "Animation", "Components", "Console", "Hierarchy", "Inspector"],
      consoleDocked: false,
    }));
  });

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-panel")).toHaveJSProperty("offsetWidth", 194);
  await expect(page.getByTestId("inspector-panel")).toHaveJSProperty("offsetWidth", 250);

  let persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.leftWidth).toBe(228);
  expect(persisted.rightWidth).toBe(280);
  expect(persisted.bottomHeight).toBe(286);
  expect(persisted.consoleHeight).toBe(96);
  expect(persisted.leftWidthCustomized).toBe(true);
  expect(persisted.rightWidthCustomized).toBe(true);
  expect(persisted.bottomHeightCustomized).toBe(true);
  expect(persisted.consoleHeightCustomized).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("hierarchy-panel")).toHaveJSProperty("offsetWidth", 228);
  await expect(page.getByTestId("inspector-panel")).toHaveJSProperty("offsetWidth", 280);
  persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.leftWidth).toBe(228);
  expect(persisted.rightWidth).toBe(280);
  expect(persisted.bottomHeight).toBe(286);
  expect(persisted.consoleHeight).toBe(96);
});


test("pointer panel-header drag can return a Bottom panel to an empty side dock", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await dragPanelHeaderWithPointer(page, page.locator(".hierarchy-panel .panel-header"), bottomTabs);
  await dragPanelHeaderWithPointer(page, page.locator(".inspector-panel .panel-header"), bottomTabs);

  await expect(page.getByTestId("dock-zone-left")).not.toBeVisible();
  await expect(page.getByTestId("dock-zone-right")).not.toBeVisible();

  await bottomTabs.getByRole("tab", { name: "Hierarchy" }).click();
  await dragPanelHeaderWithPointer(
    page,
    page.locator(".hierarchy-panel .panel-header"),
    page.getByTestId("dock-zone-left"),
  );

  const leftTabs = page.getByRole("tablist", { name: "Left dock panels" });
  const hierarchyTab = leftTabs.getByRole("tab", { name: "Hierarchy" });
  await expect(hierarchyTab).toBeVisible();
  await expect(hierarchyTab).toBeFocused();
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(bottomTabs.getByRole("tab", { name: "Hierarchy" })).toHaveCount(0);

  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.hierarchyZone).toBe("left");
});


test("compact Console selection resets only when it is not explicitly docked", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");
  await waitForEditorProject(page);
  await page.evaluate(() => {
    const key = "codogma.editor.layout";
    const current = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...current, consoleDocked: false, bottomTab: "Project" }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditorProject(page);

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  const consoleTab = bottomTabs.getByRole("tab", { name: "Console" });
  await consoleTab.click();
  await expect(consoleTab).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(bottomTabs.getByRole("tab", { name: "Project" })).toHaveAttribute("aria-selected", "true");
  await expect(bottomTabs.getByRole("tab", { name: "Console" })).toHaveCount(0);
  await expect(page.getByTestId("console-panel")).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await page.evaluate(() => {
    const key = "codogma.editor.layout";
    const current = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({
      ...current,
      consoleDocked: true,
      bottomTab: "Console",
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditorProject(page);

  const compactConsoleTab = page.getByRole("tablist", { name: "Bottom workspace" })
    .getByRole("tab", { name: "Console" });
  await expect(compactConsoleTab).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 1440, height: 900 });
  const restoredConsoleTab = page.getByRole("tablist", { name: "Bottom workspace" })
    .getByRole("tab", { name: "Console" });
  await expect(restoredConsoleTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("console-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undock Console" })).toBeVisible();
});


test("undocking a transient narrow Bottom panel keeps it visible until the side docks return", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });

  await dragPanelHeaderWithPointer(page, page.locator(".hierarchy-panel .panel-header"), bottomTabs);
  await page.setViewportSize({ width: 700, height: 900 });

  const narrowTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  await narrowTabs.getByRole("tab", { name: "Hierarchy" }).click();
  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();
  await page.getByRole("button", { name: "Undock Hierarchy" }).click();

  await expect(page.getByTestId("bottom-docked-content").getByTestId("hierarchy-panel")).toBeVisible();
  let persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.hierarchyZone).toBe("left");
  expect(persisted.bottomTab).toBe("Hierarchy");

  await page.setViewportSize({ width: 1440, height: 900 });
  const leftTabs = page.getByRole("tablist", { name: "Left dock panels" });
  await expect(leftTabs.getByRole("tab", { name: "Hierarchy" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("hierarchy-panel")).toBeVisible();
  await expect(narrowTabs.getByRole("tab", { name: "Hierarchy" })).toHaveCount(0);

  persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.hierarchyZone).toBe("left");
  expect(persisted.bottomTab).toBe("Project");
});


test("short desktop viewports keep the Scene, Bottom Dock and status row inside the window", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 350 });
  await page.goto("/");

  const workbench = page.getByTestId("workbench");
  const workspaceRow = page.locator(".workspace-row");
  const bottomDock = page.getByTestId("bottom-dock");
  const bottomSplitter = page.getByTestId("splitter-bottom");

  await expect(bottomSplitter).toHaveAttribute("aria-valuemin", "149");
  await expect(bottomSplitter).toHaveAttribute("aria-valuemax", "149");
  await expect(bottomSplitter).toHaveAttribute("aria-valuenow", "149");
  await expect(bottomDock).toHaveJSProperty("offsetHeight", 149);
  await expect(workspaceRow).toHaveJSProperty("offsetHeight", 72);

  const geometry = await workbench.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const footer = element.querySelector(".status-bar");
    return {
      height: bounds.height,
      scrollHeight: element.scrollHeight,
      footerBottom: footer?.getBoundingClientRect().bottom ?? Number.NaN,
    };
  });
  expect(geometry.height).toBe(350);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(350);
  expect(geometry.footerBottom).toBeLessThanOrEqual(350);

  await bottomSplitter.focus();
  await page.keyboard.press("Home");
  await expect(bottomSplitter).toHaveAttribute("aria-valuenow", "149");
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("codogma.editor.layout") ?? "{}"),
  );
  expect(persisted.bottomHeight).toBe(286);
});


test("pointercancel clears the drag target and does not swallow a following tab click", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForEditorProject(page);

  const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
  const leftTabs = page.getByRole("tablist", { name: "Left dock panels" });
  const source = leftTabs.getByRole("tab", { name: "Hierarchy" });
  await page.evaluate(() => {
    document.addEventListener("pointerdown", (event) => {
      document.documentElement.dataset.testPointerId = String((event as PointerEvent).pointerId);
    }, { once: true, capture: true });
  });

  const bounds = await source.boundingBox();
  if (!bounds) throw new Error("Hierarchy tab geometry is unavailable.");
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect.poll(() => page.locator("html").getAttribute("data-test-pointer-id")).not.toBeNull();
  const pointerId = Number(await page.locator("html").getAttribute("data-test-pointer-id"));
  expect(Number.isInteger(pointerId)).toBe(true);
  const targetTab = bottomTabs.getByRole("tab", { name: "Animation" });
  const targetBounds = await targetTab.boundingBox();
  if (!targetBounds) throw new Error("Animation tab geometry is unavailable.");
  await page.mouse.move(targetBounds.x + targetBounds.width / 2, targetBounds.y + targetBounds.height / 2, { steps: 8 });
  await expect(targetTab).toHaveClass(/dock-drop-insert/);

  await source.evaluate((element, id) => {
    element.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true,
      pointerId: id,
      pointerType: "mouse",
      button: 0,
      clientX: 0,
      clientY: 0,
    }));
  }, pointerId);
  await expect(page.getByTestId("dock-zone-right")).toBeVisible();
  await expect(page.getByTestId("dock-drop-preview")).toHaveCount(0);
  await expect(page.locator(".dock-drop-target")).toHaveCount(0);
  await expect(page.locator(".dock-drop-insert-before, .dock-drop-insert-after")).toHaveCount(0);
  await page.mouse.up();

  await bottomTabs.getByRole("tab", { name: "Animation" }).click();
  await expect(bottomTabs.getByRole("tab", { name: "Animation" })).toHaveAttribute("aria-selected", "true");
  await expect(source).toHaveAttribute("aria-selected", "true");
});


test("splitter resize ignores unrelated pointer events and stops on lost capture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForEditorProject(page);

  const workbench = page.getByTestId("workbench");
  const splitter = page.getByTestId("splitter-hierarchy");
  const initialWidth = Number(await splitter.getAttribute("aria-valuenow"));
  const bounds = await splitter.boundingBox();
  if (!bounds) throw new Error("Hierarchy splitter geometry is unavailable.");
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.evaluate(() => {
    document.addEventListener("pointerdown", (event) => {
      document.documentElement.dataset.testSplitterPointerId = String((event as PointerEvent).pointerId);
    }, { once: true, capture: true });
  });

  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect.poll(() => page.locator("html").getAttribute("data-test-splitter-pointer-id")).not.toBeNull();
  const pointerId = Number(await page.locator("html").getAttribute("data-test-splitter-pointer-id"));
  expect(Number.isInteger(pointerId)).toBe(true);
  await workbench.dispatchEvent("pointermove", {
    pointerId: pointerId + 1000,
    pointerType: "touch",
    buttons: 1,
    clientX: x + 80,
    clientY: y,
  });
  await expect(splitter).toHaveAttribute("aria-valuenow", String(initialWidth));

  await workbench.dispatchEvent("pointerup", {
    pointerId: pointerId + 1000,
    pointerType: "touch",
    button: 0,
    buttons: 0,
    clientX: x + 80,
    clientY: y,
  });
  await page.mouse.move(x + 16, y);
  await expect(splitter).toHaveAttribute("aria-valuenow", String(initialWidth + 16));

  await splitter.dispatchEvent("lostpointercapture", {
    pointerId,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
  });
  await page.mouse.move(x + 32, y);
  await expect(splitter).toHaveAttribute("aria-valuenow", String(initialWidth + 16));
  await page.mouse.up();
});


test("User Component enum fields use Core schema and round-trip through Scene save/reopen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("hierarchy-item-dino")).toBeVisible();
  await page.getByTestId("hierarchy-item-dino").click();

  const attachedComponents = page.getByTestId("attached-components");
  const tint = attachedComponents.getByLabel("Tint tint");
  await expect(tint).toHaveValue("red");

  await attachedComponents.getByRole("button", { name: "Detach Tint" }).click();
  await expect(attachedComponents.getByLabel("Tint tint")).toHaveCount(0);
  await attachedComponents.getByLabel("User Component to attach").selectOption("Tint");
  await attachedComponents.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(attachedComponents.getByLabel("Tint tint")).toHaveValue("red");

  await tint.selectOption("green");
  await expect(tint).toHaveValue("green");
  await saveSceneWithShortcut(page);

  const saved = await readSavedScene(page);
  const dino = saved.displayList.find((object: { label?: string }) => object.label === "dino");
  expect(dino?.["Tint.tint"]).toBe("green");

  await page.reload();
  await expect(page.getByTestId("hierarchy-item-dino")).toBeVisible();
  await page.getByTestId("hierarchy-item-dino").click();
  await expect(page.getByTestId("attached-components").getByLabel("Tint tint")).toHaveValue("green");
  await expect(page.getByTestId("attached-components").getByRole("button", { name: "Detach Tint" })).toBeVisible();
});

test("TypeScript source opens, edits, saves and reopens from the Project browser", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const sourcePath = "components/PushOnClick.ts";
  const originalResponse = await page.request.get("http://127.0.0.1:5173/editor/project/" + sourcePath);
  expect(originalResponse.ok()).toBeTruthy();
  const originalSource = await originalResponse.text();
  const marker = "// Editor Host source authoring acceptance";

  try {
    const bottomTabs = page.getByRole("tablist", { name: "Bottom workspace" });
    await bottomTabs.getByRole("tab", { name: "Project" }).click();
    await page.locator(".file-tree-row").filter({ hasText: "components" }).first().click();
    await page.locator(".file-tree-row").filter({ hasText: "PushOnClick.ts" }).click();

    const editor = page.getByTestId("typescript-source-editor");
    await expect(editor).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Viewport" }).getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true");
    await editor.fill(originalSource + "\\n" + marker);
    await expect(page.getByTestId("save-typescript-source")).toBeEnabled();
    await expect(page.getByTestId("typescript-diagnostics")).not.toContainText("error");
    const saveResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      if (response.url() !== "http://127.0.0.1:5173/editor/api" || request.method() !== "POST") return false;
      try {
        return request.postDataJSON()?.method === "SetFileString";
      } catch {
        return false;
      }
    });
    await page.getByTestId("save-typescript-source").click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBeTruthy();
    await expect(page.getByTestId("save-typescript-source")).toBeDisabled();

    const savedResponse = await page.request.get("http://127.0.0.1:5173/editor/project/" + sourcePath);
    expect(savedResponse.ok()).toBeTruthy();
    expect(await savedResponse.text()).toContain(marker);

    await page.reload();
    await bottomTabs.getByRole("tab", { name: "Project" }).click();
    await page.locator(".file-tree-row").filter({ hasText: "components" }).first().click();
    await page.locator(".file-tree-row").filter({ hasText: "PushOnClick.ts" }).click();
    await expect(page.getByTestId("typescript-source-editor")).toHaveValue(/Editor Host source authoring acceptance/);
  } finally {
    await page.request.post("http://127.0.0.1:3000/editor/api", {
      data: {
        method: "SetFileString",
        body: { path: sourcePath, content: originalSource },
      },
    });
  }
});
