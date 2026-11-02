import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createDefaultWorkspaceLayout,
  getSidePanelHomeZone,
  getVisibleBottomTabs,
  getVisibleSidePanels,
  moveDockablePanel,
  reorderDockTab,
  restoreWorkspaceLayout,
  restoreWorkspaceLayoutContent,
  serializeWorkspaceLayout,
  setSidePanelVisibility,
} from "../src/domain/workspace-layout.ts";

test("creates the stable default three-zone workspace", () => {
  const layout = createDefaultWorkspaceLayout(false);
  assert.equal(layout.schemaVersion, 1);
  assert.deepEqual(getVisibleSidePanels(layout, "left"), ["Hierarchy"]);
  assert.deepEqual(getVisibleSidePanels(layout, "right"), ["Inspector"]);
  assert.deepEqual(getVisibleBottomTabs(layout, false), [
    "Project",
    "Animation",
    "Components",
  ]);
  assert.equal(layout.bottomHeight, 286);
});

test("migrates the legacy COD-80 layout and preserves its user choices", () => {
  const layout = restoreWorkspaceLayout({
    leftWidth: 260,
    rightWidth: 310,
    bottomHeight: 340,
    consoleHeight: 120,
    hierarchyVisible: true,
    inspectorVisible: false,
    bottomTab: "Hierarchy",
    bottomTabOrder: [
      "Project",
      "Inspector",
      "Animation",
      "Hierarchy",
      "Components",
      "Console",
    ],
    dockedPanels: ["Hierarchy", "UnknownPanel", "Hierarchy"],
    consoleDocked: true,
  });

  assert.equal(layout.schemaVersion, 1);
  assert.equal(layout.leftWidth, 260);
  assert.equal(layout.rightWidth, 310);
  assert.equal(layout.hierarchyZone, "bottom");
  assert.equal(layout.inspectorZone, "right");
  assert.equal(layout.inspectorVisible, false);
  assert.equal(layout.bottomTab, "Hierarchy");
  assert.equal(layout.consoleDocked, true);
  assert.deepEqual(getVisibleSidePanels(layout, "right"), []);
  assert.deepEqual(getVisibleBottomTabs(layout, false), [
    "Project",
    "Hierarchy",
    "Animation",
    "Components",
    "Console",
  ]);
});

test("restores a versioned layout and clamps invalid dimensions", () => {
  const layout = restoreWorkspaceLayout({
    schemaVersion: 1,
    leftWidth: 9999,
    rightWidth: 1,
    bottomHeight: Number.NaN,
    consoleHeight: "72",
    hierarchyZone: "right",
    inspectorZone: "right",
    leftActivePanel: "Inspector",
    rightActivePanel: "Hierarchy",
    hierarchyVisible: true,
    inspectorVisible: true,
    bottomTab: "Inspector",
    bottomTabOrder: ["Inspector", "Inspector", "Unknown", "Project"],
    consoleDocked: false,
  });

  assert.equal(layout.leftWidth, 360);
  assert.equal(layout.rightWidth, 210);
  assert.equal(layout.bottomHeight, 286);
  assert.equal(layout.consoleHeight, 72);
  assert.deepEqual(getVisibleSidePanels(layout, "right"), [
    "Project" as never,
  ].filter((value) => value === "Project"));
  assert.equal(layout.leftActivePanel, null);
  assert.equal(layout.rightActivePanel, "Hierarchy");
  assert.equal(layout.bottomTab, "Project");
  assert.equal(
    layout.bottomTabOrder.filter((tab) => tab === "Inspector").length,
    1,
  );
});

test("ignores unknown and duplicate panel ids and restores missing panels", () => {
  const layout = restoreWorkspaceLayout({
    schemaVersion: 1,
    hierarchyZone: "floating",
    inspectorZone: "bottom",
    bottomTabOrder: ["Unknown", "Inspector", "Inspector", "Console"],
    bottomTab: "MissingPanel",
  });

  assert.equal(layout.hierarchyZone, "left");
  assert.equal(layout.inspectorZone, "bottom");
  assert.equal(layout.bottomTab, "Inspector");
  assert.deepEqual(getVisibleSidePanels(layout, "left"), ["Hierarchy"]);
  assert.deepEqual(getVisibleSidePanels(layout, "right"), []);
});

test("unsupported future schemas safely fall back to the current defaults", () => {
  const layout = restoreWorkspaceLayout({
    schemaVersion: 99,
    hierarchyZone: "bottom",
    bottomTab: "Hierarchy",
  });

  assert.deepEqual(layout, createDefaultWorkspaceLayout(false));
});

test("malformed and empty persisted JSON restore deterministic defaults", () => {
  assert.deepEqual(
    restoreWorkspaceLayoutContent("{", true),
    createDefaultWorkspaceLayout(true),
  );
  assert.deepEqual(
    restoreWorkspaceLayoutContent(null, false),
    createDefaultWorkspaceLayout(false),
  );
});

test("moves panels between zones while preserving one active tab per zone", () => {
  const layout = createDefaultWorkspaceLayout(false);
  const withHierarchy = moveDockablePanel(layout, "Hierarchy", "right");

  assert.deepEqual(getVisibleSidePanels(withHierarchy, "left"), []);
  assert.deepEqual(getVisibleSidePanels(withHierarchy, "right"), [
    "Hierarchy",
    "Inspector",
  ]);
  assert.equal(withHierarchy.rightActivePanel, "Hierarchy");

  const withInspector = moveDockablePanel(
    withHierarchy,
    "Inspector",
    "bottom",
  );
  assert.deepEqual(getVisibleSidePanels(withInspector, "right"), [
    "Hierarchy",
  ]);
  assert.equal(withInspector.bottomTab, "Inspector");
  assert.equal(getSidePanelHomeZone("Inspector"), "right");
});

test("closing an active panel selects a visible fallback and reopening restores its zone", () => {
  const layout = moveDockablePanel(
    createDefaultWorkspaceLayout(false),
    "Hierarchy",
    "right",
  );
  const closed = setSidePanelVisibility(layout, "Hierarchy", false);

  assert.equal(closed.rightActivePanel, "Inspector");
  assert.deepEqual(getVisibleSidePanels(closed, "right"), ["Inspector"]);

  const reopened = setSidePanelVisibility(closed, "Hierarchy", true);
  assert.equal(reopened.hierarchyZone, "right");
  assert.equal(reopened.rightActivePanel, "Hierarchy");
});

test("reorders tabs only within their current dock group", () => {
  const layout = createDefaultWorkspaceLayout(false);
  const reordered = reorderDockTab(layout, "Project", "Animation", "bottom");

  assert.ok(
    reordered.bottomTabOrder.indexOf("Project") >
      reordered.bottomTabOrder.indexOf("Animation"),
  );
  assert.equal(reordered.bottomTab, "Project");

  const invalid = reorderDockTab(layout, "Hierarchy", "Inspector", "left");
  assert.equal(invalid, layout);
});

test("serializes only the validated versioned workspace contract", () => {
  const layout = moveDockablePanel(
    createDefaultWorkspaceLayout(false),
    "Hierarchy",
    "bottom",
  );
  const parsed = JSON.parse(serializeWorkspaceLayout(layout)) as {
    schemaVersion: number;
    hierarchyZone: string;
    dockedPanels?: unknown;
  };

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.hierarchyZone, "bottom");
  assert.equal("dockedPanels" in parsed, false);
});
