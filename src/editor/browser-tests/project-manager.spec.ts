import { expect, test } from "@playwright/test";

test("Project Manager creates and reopens a native Empty 2D project with official HTML5 profiles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.locator(".connection-overlay")).toHaveCount(0);

  await page.getByRole("menubar", { name: "Main menu" }).getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menu", { name: "" }).getByRole("menuitem", { name: "Project Manager…" }).click();
  await expect(page.getByTestId("project-manager")).toBeVisible();

  await page.getByTestId("new-project").click();
  await page.locator('input[name="projectName"]').fill("Project Manager Browser Test");
  await page.locator('input[name="folderName"]').fill("Project-Manager-Browser-Test");

  const createResponsePromise = page.waitForResponse((response) => {
    if (!response.url().endsWith("/editor/project/operations") || response.request().method() !== "POST") return false;
    try {
      return response.request().postDataJSON()?.operation === "projectManager.create";
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Create Project", exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBe(true);
  const created = await createResponse.json() as {
    activeProject: { projectId: string; name: string; relativePath: string };
    recentWarning: string;
  };
  expect(created.activeProject).toMatchObject({
    name: "Project Manager Browser Test",
    relativePath: "Project-Manager-Browser-Test",
  });
  expect(created.recentWarning).toContain("incomplete build-reference coverage");

  await expect(page.getByTestId("project-manager")).toHaveCount(0);
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.locator(".connection-overlay")).toHaveCount(0);

  const manifestResponse = await page.request.get("/editor/project/project.json");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json() as {
    schemaVersion: number;
    id: string;
    scenes: Array<{ id: string; assetId: string }>;
    assets: Array<{ id: string; path: string; kind: string }>;
  };
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.id).toBe(created.activeProject.projectId);
  expect(manifest.scenes).toHaveLength(1);
  const sceneAsset = manifest.assets.find((asset) => asset.kind === "scene");
  expect(sceneAsset).toBeDefined();

  const sceneResponse = await page.request.get("/editor/project/" + sceneAsset!.path);
  expect(sceneResponse.ok()).toBe(true);
  const scene = await sceneResponse.json() as { id: string; rootNodes: unknown[] };
  expect(scene.id).toBe(manifest.scenes[0]?.id);
  expect(scene.rootNodes).toEqual([]);

  const developmentResponse = await page.request.get("/editor/project/build/profiles/html5.development.json");
  const releaseResponse = await page.request.get("/editor/project/build/profiles/html5.release.json");
  expect(developmentResponse.ok()).toBe(true);
  expect(releaseResponse.ok()).toBe(true);
  const development = await developmentResponse.json() as { id: string; kind: string; target: string; outputDirectory: string };
  const release = await releaseResponse.json() as { id: string; kind: string; target: string; outputDirectory: string };
  expect(development).toMatchObject({
    id: "html5.development",
    kind: "development",
    target: "html5",
    outputDirectory: "build/html5/development",
  });
  expect(release).toMatchObject({
    id: "html5.release",
    kind: "release",
    target: "html5",
    outputDirectory: "build/html5/release",
  });

  await page.getByRole("menubar", { name: "Main menu" }).getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menu", { name: "" }).getByRole("menuitem", { name: "Project Manager…" }).click();
  const recent = page.getByTestId("recent-project").filter({ hasText: "Project Manager Browser Test" });
  await expect(recent).toBeVisible();
  await expect(recent).toContainText("Found");
  await recent.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByTestId("project-manager")).toHaveCount(0);
  await expect(page.getByTestId("workbench")).toBeVisible();
  const reopenedManifest = await page.request.get("/editor/project/project.json");
  expect(reopenedManifest.ok()).toBe(true);
  expect((await reopenedManifest.json() as { id: string }).id).toBe(created.activeProject.projectId);
});
