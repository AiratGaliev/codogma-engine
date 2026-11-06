test("unpublished and unversioned workspace layouts are not migrated", () => {
  const legacyLayouts: unknown[] = [
    { dockedPanels: ["Hierarchy"], consoleDocked: false },
    ...[0, 1, 2].map(schemaVersion => ({
      schemaVersion,
      dockedPanels: ["Hierarchy"],
      consoleDocked: false,
    })),
  ];

  for (const legacyLayout of legacyLayouts) {
    assert.deepEqual(
      restoreWorkspaceLayout(legacyLayout),
      createDefaultWorkspaceLayout(false),
    );
  }
});

import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createDefaultWorkspaceLayout,
  setBottomPanelVisibility,
  setConsolePanelVisibility,
  getMaximumConsoleHeight,
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
  assert.equal(layout.schemaVersion, 3);
  assert.deepEqual(getVisibleSidePanels(layout, "left"), ["Hierarchy"]);
  assert.deepEqual(getVisibleSidePanels(layout, "right"), ["Inspector"]);
  assert.deepEqual(getVisibleBottomTabs(layout, false), [
    "Project",
    "Animation",
    "Components",
    "Console",
  ]);
  assert.equal(layout.consoleDocked, true);
  assert.equal(layout.bottomHeight, 286);
});

test("restores compact defaults after reopening a wide workspace and preserves custom sizing", () => {
  const wideDefaults = createDefaultWorkspaceLayout(false);
  const compactDefaults = restoreWorkspaceLayout(wideDefaults, true);

  assert.equal(compactDefaults.leftWidth, 194);
  assert.equal(compactDefaults.rightWidth, 250);
  assert.equal(compactDefaults.bottomHeight, 207);

  const customized = restoreWorkspaceLayout({
    ...wideDefaults,
    leftWidth: 260,
    rightWidth: 320,
    bottomHeight: 340,
  }, true);

  assert.equal(customized.leftWidth, 260);
  assert.equal(customized.rightWidth, 320);
  assert.equal(customized.bottomHeight, 340);
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

  assert.equal(layout.schemaVersion, 3);
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
    "Animation",
    "Hierarchy",
    "Components",
    "Console",
  ]);
});

test("migrates schema v1 and places Console in the Bottom group by default", () => {
  const migrated = restoreWorkspaceLayout({
    schemaVersion: 3,
    hierarchyVisible: false,
    inspectorVisible: true,
    hierarchyZone: "right",
    inspectorZone: "bottom",
    bottomTab: "Inspector",
    consoleDocked: true,
    bottomTabOrder: ["Project", "Animation", "Components", "Console", "Hierarchy", "Inspector"],
  });

  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.consoleVisible, true);
  assert.equal(migrated.consoleDocked, true);
  assert.equal(migrated.hierarchyVisible, false);
  assert.equal(migrated.hierarchyZone, "right");
  assert.equal(migrated.inspectorZone, "bottom");
  assert.equal(migrated.bottomTab, "Inspector");
});

test("Bottom workspace panels close independently and restore a visible fallback", () => {
  const initial = createDefaultWorkspaceLayout(false);
  const noProject = setBottomPanelVisibility(initial, "Project", false);
  assert.equal(noProject.projectVisible, false);
  assert.equal(noProject.bottomTab, "Animation");

  const noAnimation = setBottomPanelVisibility(noProject, "Animation", false);
  assert.equal(noAnimation.animationVisible, false);
  assert.equal(noAnimation.bottomTab, "Components");

  const reopened = setBottomPanelVisibility(noAnimation, "Project", true);
  assert.equal(reopened.projectVisible, true);
  assert.equal(reopened.bottomTab, "Project");

  let allClosed = setBottomPanelVisibility(initial, "Project", false);
  allClosed = setBottomPanelVisibility(allClosed, "Animation", false);
  allClosed = setBottomPanelVisibility(allClosed, "Components", false);
  allClosed = setConsolePanelVisibility(allClosed, false);
  assert.deepEqual(getVisibleBottomTabs(allClosed, false), []);
});

test("Console visibility is independent from dock placement and survives persistence", () => {
  const docked = {
    ...createDefaultWorkspaceLayout(false),
    consoleDocked: true,
    bottomTab: "Console" as const,
  };
  const closed = setConsolePanelVisibility(docked, false, false);
  assert.equal(closed.consoleVisible, false);
  assert.equal(closed.consoleDocked, true);
  assert.equal(closed.bottomTab, "Project");
  assert.ok(!getVisibleBottomTabs(closed, false).includes("Console"));

  const restored = restoreWorkspaceLayoutContent(serializeWorkspaceLayout(closed, false), false);
  assert.equal(restored.consoleVisible, false);
  assert.equal(restored.consoleDocked, true);
  assert.equal(restored.bottomTab, "Project");

  const reopened = setConsolePanelVisibility(restored, true, false);
  assert.equal(reopened.consoleVisible, true);
  assert.equal(reopened.consoleDocked, true);
  assert.equal(reopened.bottomTab, "Console");
  assert.ok(getVisibleBottomTabs(reopened, false).includes("Console"));
});

test("closing standalone Console leaves the selected Bottom tab unchanged", () => {
  const layout = {
    ...createDefaultWorkspaceLayout(false),
    consoleDocked: false,
    bottomTab: "Animation" as const,
  };
  const closed = setConsolePanelVisibility(layout, false, false);
  assert.equal(closed.consoleVisible, false);
  assert.equal(closed.consoleDocked, false);
  assert.equal(closed.bottomTab, "Animation");
});

test("restores a versioned layout and clamps invalid dimensions", () => {
  const layout = restoreWorkspaceLayout({
    schemaVersion: 3,
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
    "Inspector",
    "Hierarchy",
  ]);
  assert.equal(layout.leftActivePanel, null);
  assert.equal(layout.rightActivePanel, "Hierarchy");
  assert.equal(layout.bottomTab, "Project");
  assert.equal(
    layout.bottomTabOrder.filter((tab) => tab === "Inspector").length,
    1,
  );
});

test("compact viewport exposes side panels in Bottom without mutating their saved zones", () => {
  const layout = createDefaultWorkspaceLayout(true);
  const tabs = getVisibleBottomTabs(layout, true, true);

  assert.ok(tabs.includes("Hierarchy"));
  assert.ok(tabs.includes("Inspector"));
  assert.equal(layout.hierarchyZone, "left");
  assert.equal(layout.inspectorZone, "right");
});

test("compact Console selection survives persistence and restores in compact mode", () => {
  const layout = {
    ...createDefaultWorkspaceLayout(true),
    bottomTab: "Console" as const,
  };
  const restored = restoreWorkspaceLayoutContent(
    serializeWorkspaceLayout(layout, true),
    true,
  );

  assert.equal(restored.bottomTab, "Console");
});

test("narrow responsive presentation persists the selected side panel without changing its saved zone", () => {
  const layout = {
    ...createDefaultWorkspaceLayout(true),
    bottomTab: "Hierarchy" as const,
  };
  const serialized = serializeWorkspaceLayout(layout, true, true);
  const restored = restoreWorkspaceLayoutContent(serialized, true, true);

  assert.equal(restored.bottomTab, "Hierarchy");
  assert.ok(getVisibleBottomTabs(restored, true, true).includes("Hierarchy"));
  assert.equal(restored.hierarchyZone, "left");
});

test("narrow close keeps a valid Bottom tab selected instead of a hidden side panel", () => {
  const layout = {
    ...createDefaultWorkspaceLayout(true),
    hierarchyZone: "right" as const,
    inspectorZone: "right" as const,
    rightActivePanel: "Hierarchy" as const,
    bottomTab: "Hierarchy" as const,
  };
  const closed = setSidePanelVisibility(layout, "Hierarchy", false, true, true);

  assert.equal(closed.bottomTab, "Project");
  assert.equal(closed.inspectorVisible, true);
});

test("ignores unknown and duplicate panel ids and restores missing panels", () => {
  const layout = restoreWorkspaceLayout({
    schemaVersion: 3,
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

  const reverse = reorderDockTab(layout, "Animation", "Project", "bottom");
  assert.ok(
    reverse.bottomTabOrder.indexOf("Animation") >
      reverse.bottomTabOrder.indexOf("Project"),
  );

  const invalid = reorderDockTab(layout, "Hierarchy", "Inspector", "left");
  assert.equal(invalid, layout);
});

test("supports insertion before and after the hovered tab", () => {
  const layout = createDefaultWorkspaceLayout(false);
  const before = reorderDockTab(layout, "Components", "Project", "bottom", false, false, "before");
  assert.ok(before.bottomTabOrder.indexOf("Components") < before.bottomTabOrder.indexOf("Project"));
  const after = reorderDockTab(layout, "Components", "Project", "bottom", false, false, "after");
  assert.ok(after.bottomTabOrder.indexOf("Components") > after.bottomTabOrder.indexOf("Project"));
});

test("compact bottom tab reordering includes temporarily presented side panels", () => {
  const layout = createDefaultWorkspaceLayout(true);
  const reordered = reorderDockTab(layout, "Project", "Hierarchy", "bottom", true, true);
  assert.ok(reordered.bottomTabOrder.indexOf("Project") > reordered.bottomTabOrder.indexOf("Hierarchy"));
  assert.equal(reordered.hierarchyZone, "left");
  assert.equal(reordered.bottomTab, "Project");
});

test("closing a bottom side panel on wide viewport never selects hidden Console", () => {
  const layout = moveDockablePanel(createDefaultWorkspaceLayout(false), "Hierarchy", "bottom");
  const closed = setSidePanelVisibility(layout, "Hierarchy", false, false);
  assert.equal(closed.bottomTab, "Project");
});

test("wide workspace serialization preserves wide defaults and user dimensions", () => {
  const defaults = createDefaultWorkspaceLayout(false);
  const restoredDefaults = restoreWorkspaceLayoutContent(
    serializeWorkspaceLayout(defaults, false),
    false,
  );

  assert.equal(restoredDefaults.leftWidth, 228);
  assert.equal(restoredDefaults.rightWidth, 280);
  assert.equal(restoredDefaults.bottomHeight, 286);

  const custom = {
    ...defaults,
    leftWidth: 264,
    rightWidth: 340,
    bottomHeight: 360,
  };
  const restoredCustom = restoreWorkspaceLayoutContent(
    serializeWorkspaceLayout(custom, false),
    false,
  );

  assert.equal(restoredCustom.leftWidth, 264);
  assert.equal(restoredCustom.rightWidth, 340);
  assert.equal(restoredCustom.bottomHeight, 360);
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

  assert.equal(parsed.schemaVersion, 3);
  assert.equal(parsed.hierarchyZone, "bottom");
  assert.equal("dockedPanels" in parsed, false);
});


test("adapts untouched Console defaults and keeps customized heights", () => {
  const wideDefaults = createDefaultWorkspaceLayout(false);
  const compactDefaults = restoreWorkspaceLayout(wideDefaults, true);

  assert.equal(wideDefaults.consoleHeight, 96);
  assert.equal(compactDefaults.consoleHeight, 60);

  const customized = restoreWorkspaceLayout({
    ...wideDefaults,
    consoleHeight: 125,
  }, true);

  assert.equal(customized.consoleHeight, 125);
});

test("preserves the preferred Console height while clamping only its visible height", () => {
  assert.equal(getMaximumConsoleHeight(150), 61);
  assert.equal(getMaximumConsoleHeight(200), 111);
  assert.equal(getMaximumConsoleHeight(286), 180);
  assert.equal(getMaximumConsoleHeight(420), 180);
  assert.equal(getMaximumConsoleHeight(Number.NaN), 180);

  const impossibleWideLayout = restoreWorkspaceLayout({
    ...createDefaultWorkspaceLayout(false),
    bottomHeight: 150,
    consoleHeight: 180,
    consoleDocked: false,
  });

  assert.equal(impossibleWideLayout.bottomHeight, 150);
  assert.equal(impossibleWideLayout.consoleHeight, 180);
  assert.equal(getMaximumConsoleHeight(impossibleWideLayout.bottomHeight), 61);

  const serialized = restoreWorkspaceLayoutContent(
    serializeWorkspaceLayout(impossibleWideLayout, false),
    false,
  );
  assert.equal(serialized.consoleHeight, 180);
  assert.equal(getMaximumConsoleHeight(serialized.bottomHeight), 61);

  const expanded = { ...serialized, bottomHeight: 286 };
  assert.equal(expanded.consoleHeight, 180);
  assert.equal(getMaximumConsoleHeight(expanded.bottomHeight), 180);

  const dockedConsoleLayout = restoreWorkspaceLayout({
    ...createDefaultWorkspaceLayout(false),
    bottomHeight: 150,
    consoleHeight: 180,
    consoleDocked: true,
  });

  assert.equal(dockedConsoleLayout.consoleHeight, 180);

  const compactLayout = restoreWorkspaceLayout({
    ...createDefaultWorkspaceLayout(false),
    bottomHeight: 150,
    consoleHeight: 180,
  }, true);

  assert.equal(compactLayout.consoleHeight, 180);
});


test("preserves explicitly customized dimensions even when they equal wide defaults", () => {
  const defaults = createDefaultWorkspaceLayout(false);
  const customized = {
    ...defaults,
    leftWidthCustomized: true,
    rightWidthCustomized: true,
    bottomHeightCustomized: true,
    consoleHeightCustomized: true,
  };

  const compact = restoreWorkspaceLayout(customized, true);
  assert.equal(compact.leftWidth, 228);
  assert.equal(compact.rightWidth, 280);
  assert.equal(compact.bottomHeight, 286);
  assert.equal(compact.consoleHeight, 96);
  assert.equal(compact.leftWidthCustomized, true);
  assert.equal(compact.rightWidthCustomized, true);
  assert.equal(compact.bottomHeightCustomized, true);
  assert.equal(compact.consoleHeightCustomized, true);

  const roundTripped = restoreWorkspaceLayoutContent(
    serializeWorkspaceLayout(compact, true),
    true,
  );
  assert.equal(roundTripped.leftWidth, 228);
  assert.equal(roundTripped.rightWidth, 280);
  assert.equal(roundTripped.bottomHeight, 286);
  assert.equal(roundTripped.consoleHeight, 96);

  const untouched = restoreWorkspaceLayout(defaults, true);
  assert.equal(untouched.leftWidth, 194);
  assert.equal(untouched.rightWidth, 250);
  assert.equal(untouched.bottomHeight, 207);
  assert.equal(untouched.consoleHeight, 60);
});


test("moving a side panel out of Bottom preserves the selected compact Console tab", () => {
  const compactLayout = {
    ...createDefaultWorkspaceLayout(true),
    hierarchyZone: "bottom" as const,
    bottomTab: "Console" as const,
  };

  const moved = moveDockablePanel(compactLayout, "Hierarchy", "left", true);
  assert.equal(moved.hierarchyZone, "left");
  assert.equal(moved.bottomTab, "Console");
  assert.ok(getVisibleBottomTabs(moved, true).includes("Console"));
});


test("closing Console in narrow mode selects a visible side panel presented in Bottom", () => {
  const layout = {
    ...createDefaultWorkspaceLayout(true),
    projectVisible: false,
    animationVisible: false,
    componentsVisible: false,
    bottomTab: "Console" as const,
  };

  const closed = setConsolePanelVisibility(layout, false, true, true);
  const visibleTabs = getVisibleBottomTabs(closed, true, true);

  assert.deepEqual(visibleTabs, ["Hierarchy", "Inspector"]);
  assert.equal(closed.bottomTab, "Hierarchy");
  assert.ok(visibleTabs.includes(closed.bottomTab));
});
