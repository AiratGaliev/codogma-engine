export const WORKSPACE_LAYOUT_SCHEMA_VERSION = 1;

export type DockZone = "left" | "right" | "bottom";
export type SidePanelId = "Hierarchy" | "Inspector";
export type BottomTab =
  | "Project"
  | "Animation"
  | "Components"
  | "Console"
  | SidePanelId;

export interface WorkspaceLayout {
  schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  consoleHeight: number;
  hierarchyVisible: boolean;
  inspectorVisible: boolean;
  hierarchyZone: DockZone;
  inspectorZone: DockZone;
  leftActivePanel: SidePanelId | null;
  rightActivePanel: SidePanelId | null;
  bottomTab: BottomTab;
  bottomTabOrder: BottomTab[];
  consoleDocked: boolean;
}

const ALL_BOTTOM_TABS: readonly BottomTab[] = [
  "Project",
  "Animation",
  "Components",
  "Console",
  "Hierarchy",
  "Inspector",
];

const SIDE_PANELS: readonly SidePanelId[] = ["Hierarchy", "Inspector"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSidePanelId(value: unknown): value is SidePanelId {
  return value === "Hierarchy" || value === "Inspector";
}

function isDockZone(value: unknown): value is DockZone {
  return value === "left" || value === "right" || value === "bottom";
}

function clampNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;

  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function normalizeBottomTabOrder(value: unknown): BottomTab[] {
  const supplied = Array.isArray(value)
    ? value.filter((item): item is BottomTab =>
        ALL_BOTTOM_TABS.includes(item as BottomTab),
      )
    : [];

  return [
    ...new Set(supplied),
    ...ALL_BOTTOM_TABS.filter((item) => !supplied.includes(item)),
  ];
}

function isVisible(layout: WorkspaceLayout, panel: SidePanelId): boolean {
  return panel === "Hierarchy"
    ? layout.hierarchyVisible
    : layout.inspectorVisible;
}

function getPanelZone(
  layout: WorkspaceLayout,
  panel: SidePanelId,
): DockZone {
  return panel === "Hierarchy"
    ? layout.hierarchyZone
    : layout.inspectorZone;
}

function getVisibleBottomTab(
  layout: WorkspaceLayout,
  compact: boolean,
  preferred: unknown,
): BottomTab {
  const visible = getVisibleBottomTabs(layout, compact);
  return visible.includes(preferred as BottomTab)
    ? (preferred as BottomTab)
    : (visible[0] ?? "Project");
}

function getActiveSidePanel(
  layout: WorkspaceLayout,
  zone: "left" | "right",
  preferred: unknown,
): SidePanelId | null {
  if (
    isSidePanelId(preferred) &&
    getPanelZone(layout, preferred) === zone &&
    isVisible(layout, preferred)
  ) {
    return preferred;
  }

  return getVisibleSidePanels(layout, zone)[0] ?? null;
}

export function createDefaultWorkspaceLayout(
  compact = false,
): WorkspaceLayout {
  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    leftWidth: compact ? 194 : 228,
    rightWidth: compact ? 250 : 280,
    bottomHeight: compact ? 207 : 286,
    consoleHeight: compact ? 60 : 96,
    hierarchyVisible: true,
    inspectorVisible: true,
    hierarchyZone: "left",
    inspectorZone: "right",
    leftActivePanel: "Hierarchy",
    rightActivePanel: "Inspector",
    bottomTab: "Project",
    bottomTabOrder: [...ALL_BOTTOM_TABS],
    consoleDocked: false,
  };
}

/**
 * Restore and validate both the current layout contract and the legacy
 * pre-versioned LayoutState written by COD-80.
 *
 * Unknown panel identifiers are ignored. Missing known panels return to
 * their deterministic home zones; malformed dimensions are clamped.
 */
export function restoreWorkspaceLayout(
  value: unknown,
  compact = false,
): WorkspaceLayout {
  const defaults = createDefaultWorkspaceLayout(compact);
  if (!isRecord(value)) return defaults;

  const rawVersion = value.schemaVersion;
  const version =
    rawVersion === undefined ? 0 : rawVersion;

  // Version zero is the pre-COD-83 layout persisted by COD-80.
  // Unknown future schemas must not be interpreted as a current contract.
  if (version !== 0 && version !== WORKSPACE_LAYOUT_SCHEMA_VERSION) {
    return defaults;
  }

  const legacyDocked = Array.isArray(value.dockedPanels)
    ? value.dockedPanels.filter(isSidePanelId)
    : [];

  const hierarchyZone =
    version === 0
      ? legacyDocked.includes("Hierarchy")
        ? "bottom"
        : "left"
      : isDockZone(value.hierarchyZone)
        ? value.hierarchyZone
        : defaults.hierarchyZone;

  const inspectorZone =
    version === 0
      ? legacyDocked.includes("Inspector")
        ? "bottom"
        : "right"
      : isDockZone(value.inspectorZone)
        ? value.inspectorZone
        : defaults.inspectorZone;

  const rawOrder = normalizeBottomTabOrder(value.bottomTabOrder);
  const bottomTabOrder = normalizeBottomTabOrder([
    ...rawOrder,
    ...(hierarchyZone === "bottom" ? ["Hierarchy"] : []),
    ...(inspectorZone === "bottom" ? ["Inspector"] : []),
  ]);

  const consoleDocked = value.consoleDocked === true;
  const restored: WorkspaceLayout = {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    leftWidth: clampNumber(value.leftWidth, defaults.leftWidth, 170, 360),
    rightWidth: clampNumber(value.rightWidth, defaults.rightWidth, 210, 420),
    bottomHeight: clampNumber(
      value.bottomHeight,
      defaults.bottomHeight,
      150,
      420,
    ),
    consoleHeight: clampNumber(
      value.consoleHeight,
      defaults.consoleHeight,
      56,
      180,
    ),
    hierarchyVisible:
      typeof value.hierarchyVisible === "boolean"
        ? value.hierarchyVisible
        : defaults.hierarchyVisible,
    inspectorVisible:
      typeof value.inspectorVisible === "boolean"
        ? value.inspectorVisible
        : defaults.inspectorVisible,
    hierarchyZone,
    inspectorZone,
    leftActivePanel: null,
    rightActivePanel: null,
    bottomTab: "Project",
    bottomTabOrder,
    consoleDocked,
  };

  restored.leftActivePanel = getActiveSidePanel(
    restored,
    "left",
    value.leftActivePanel ??
      (version === 0 && hierarchyZone === "left" ? "Hierarchy" : null),
  );
  restored.rightActivePanel = getActiveSidePanel(
    restored,
    "right",
    value.rightActivePanel ??
      (version === 0 && inspectorZone === "right" ? "Inspector" : null),
  );

  const requestedBottomTab = value.bottomTab;
  restored.bottomTab = getVisibleBottomTab(
    restored,
    compact,
    requestedBottomTab,
  );

  return restored;
}

export function restoreWorkspaceLayoutContent(
  content: string | null,
  compact = false,
): WorkspaceLayout {
  if (content === null || content.trim().length === 0) {
    return createDefaultWorkspaceLayout(compact);
  }

  try {
    return restoreWorkspaceLayout(JSON.parse(content) as unknown, compact);
  } catch {
    return createDefaultWorkspaceLayout(compact);
  }
}

export function serializeWorkspaceLayout(layout: WorkspaceLayout): string {
  // Compact mode may legitimately keep Console selected without setting
  // consoleDocked, so allow that tab while normalizing the persisted contract.
  const normalized = restoreWorkspaceLayout(layout, true);
  return JSON.stringify(normalized);
}

export function getVisibleSidePanels(
  layout: WorkspaceLayout,
  zone: "left" | "right",
): SidePanelId[] {
  return layout.bottomTabOrder.filter((panel): panel is SidePanelId => {
    if (!isSidePanelId(panel)) return false;
    return getPanelZone(layout, panel) === zone && isVisible(layout, panel);
  });
}

export function getVisibleBottomTabs(
  layout: WorkspaceLayout,
  compact: boolean,
  forceSidePanelsToBottom = false,
): BottomTab[] {
  return layout.bottomTabOrder.filter((panel) => {
    if (
      panel === "Project" ||
      panel === "Animation" ||
      panel === "Components"
    ) {
      return true;
    }
    if (panel === "Console") return compact || layout.consoleDocked;

    return (
      (forceSidePanelsToBottom || getPanelZone(layout, panel) === "bottom") &&
      isVisible(layout, panel)
    );
  });
}

export function moveDockablePanel(
  layout: WorkspaceLayout,
  panel: SidePanelId,
  zone: DockZone,
): WorkspaceLayout {
  if (getPanelZone(layout, panel) === zone) {
    return selectSidePanel(layout, panel);
  }

  const next: WorkspaceLayout = {
    ...layout,
    hierarchyZone: panel === "Hierarchy" ? zone : layout.hierarchyZone,
    inspectorZone: panel === "Inspector" ? zone : layout.inspectorZone,
    leftActivePanel: layout.leftActivePanel,
    rightActivePanel: layout.rightActivePanel,
  };

  if (zone === "left") next.leftActivePanel = panel;
  if (zone === "right") next.rightActivePanel = panel;
  if (zone === "bottom") next.bottomTab = panel;

  if (panel === "Hierarchy" && layout.leftActivePanel === panel) {
    next.leftActivePanel = null;
  }
  if (panel === "Hierarchy" && layout.rightActivePanel === panel) {
    next.rightActivePanel = null;
  }
  if (panel === "Inspector" && layout.leftActivePanel === panel) {
    next.leftActivePanel = null;
  }
  if (panel === "Inspector" && layout.rightActivePanel === panel) {
    next.rightActivePanel = null;
  }

  next.leftActivePanel = getActiveSidePanel(
    next,
    "left",
    next.leftActivePanel,
  );
  next.rightActivePanel = getActiveSidePanel(
    next,
    "right",
    next.rightActivePanel,
  );

  if (
    layout.bottomTab === panel &&
    zone !== "bottom"
  ) {
    next.bottomTab = "Project";
  }
  next.bottomTab = getVisibleBottomTab(next, true, next.bottomTab);

  return next;
}

export function selectSidePanel(
  layout: WorkspaceLayout,
  panel: SidePanelId,
): WorkspaceLayout {
  if (!isVisible(layout, panel)) {
    return setSidePanelVisibility(layout, panel, true);
  }

  const zone = getPanelZone(layout, panel);
  if (zone === "left") {
    return { ...layout, leftActivePanel: panel };
  }
  if (zone === "right") {
    return { ...layout, rightActivePanel: panel };
  }
  return { ...layout, bottomTab: panel };
}

export function setSidePanelVisibility(
  layout: WorkspaceLayout,
  panel: SidePanelId,
  visible: boolean,
): WorkspaceLayout {
  const next: WorkspaceLayout = {
    ...layout,
    hierarchyVisible:
      panel === "Hierarchy" ? visible : layout.hierarchyVisible,
    inspectorVisible:
      panel === "Inspector" ? visible : layout.inspectorVisible,
  };

  if (visible) {
    const zone = getPanelZone(next, panel);
    if (zone === "left") next.leftActivePanel = panel;
    else if (zone === "right") next.rightActivePanel = panel;
    else next.bottomTab = panel;
  } else {
    next.leftActivePanel = getActiveSidePanel(
      next,
      "left",
      next.leftActivePanel === panel ? null : next.leftActivePanel,
    );
    next.rightActivePanel = getActiveSidePanel(
      next,
      "right",
      next.rightActivePanel === panel ? null : next.rightActivePanel,
    );
    next.bottomTab = getVisibleBottomTab(
      next,
      true,
      next.bottomTab === panel ? "Project" : next.bottomTab,
    );
  }

  return next;
}

export function toggleSidePanelVisibility(
  layout: WorkspaceLayout,
  panel: SidePanelId,
): WorkspaceLayout {
  return setSidePanelVisibility(layout, panel, !isVisible(layout, panel));
}

export function reorderDockTab(
  layout: WorkspaceLayout,
  source: BottomTab,
  target: BottomTab,
  zone: DockZone,
): WorkspaceLayout {
  if (source === target) return layout;

  const isInZone = (panel: BottomTab): boolean => {
    if (panel === "Project" || panel === "Animation" || panel === "Components") {
      return zone === "bottom";
    }
    if (panel === "Console") {
      return zone === "bottom" && layout.consoleDocked;
    }
    return getPanelZone(layout, panel) === zone && isVisible(layout, panel);
  };

  if (!isInZone(source) || !isInZone(target)) return layout;

  const order = [...layout.bottomTabOrder];
  const sourceIndex = order.indexOf(source);
  const targetIndex = order.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0) return layout;

  order.splice(sourceIndex, 1);
  order.splice(targetIndex, 0, source);

  const next: WorkspaceLayout = { ...layout, bottomTabOrder: order };
  if (zone === "bottom") next.bottomTab = source;
  else if (zone === "left" && isSidePanelId(source)) {
    next.leftActivePanel = source;
  } else if (zone === "right" && isSidePanelId(source)) {
    next.rightActivePanel = source;
  }

  return next;
}

export function getSidePanelHomeZone(panel: SidePanelId): DockZone {
  return panel === "Hierarchy" ? "left" : "right";
}
