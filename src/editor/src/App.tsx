import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import designTokens from "../design-system/tokens.json";
import {
  createSceneObject,
  findScenePaths,
  formatSceneContent,
  getSceneObjects,
  parseSceneContent,
  removeSceneObject,
  updateSceneObject,
  type SceneDocument,
  type SceneObjectEntry,
} from "./domain/scene-model.ts";
import {
  appendAnimationFrame,
  createAnimation,
  createAnimationDocument,
  formatAnimationContent,
  getAnimationDurationMs,
  getAnimationFrameDurationMs,
  getAnimationTimelinePosition,
  isAnimationContent,
  parseAnimationContent,
  removeAnimation,
  removeAnimationFrame,
  moveAnimationFrame,
  updateAnimation,
  type AnimationDocument,
} from "./domain/animation-model.ts";
import {
  createPrefabDocument,
  createPrefabInstance,
  addPrefabProperty,
  updatePrefabProperty,
  removePrefabProperty,
  type PrefabDocument,
  type PrefabProperty,
} from "./domain/prefab-model.ts";
import {
  addUserComponentDefinition,
  attachUserComponent,
  createUserComponentDefinition,
  detachUserComponent,
  formatUserComponentsContent,
  parseUserComponentsContent,
  removeUserComponentDefinition,
  updateUserComponentDefinition,
  type UserComponentsDocument,
} from "./domain/components-model.ts";
import {
  getProjectFiles,
  readProjectFile,
  writeProjectFile,
  createProjectFolder,
  type ProjectEntry,
} from "./services/editor-api";
import {
  connectEditorMcpBridge,
  type EditorMcpHandler,
} from "./services/editor-mcp-bridge";
import {
  addSceneObjectFx,
  getSceneObjectEffects,
  getUnsupportedSceneObjectEffects,
  removeSceneObjectFx,
  updateSceneObjectFx,
  type FxObject,
  type FxType,
} from "./domain/fx-model.ts";
import FxInspector from "./components/FxInspector";
import PhaserSceneViewport from "./components/PhaserSceneViewport";

type Theme = "dark" | "light";
type ViewportTab = "Scene" | "Game";
type SidePanelId = "Hierarchy" | "Inspector";
type BottomTab = "Project" | "Animation" | "Components" | "Console" | SidePanelId;
type FocusContext = "global" | "scene" | "hierarchy" | "inspector" | "project" | "animation" | "components" | "console";
type ConsoleLevel = "info" | "success" | "warning" | "error";

interface ConsoleMessage {
  id: number;
  level: ConsoleLevel;
  text: string;
  time: string;
}

interface LayoutState {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  consoleHeight: number;
  hierarchyVisible: boolean;
  inspectorVisible: boolean;
  bottomTab: BottomTab;
  bottomTabOrder: BottomTab[];
  dockedPanels: SidePanelId[];
  consoleDocked: boolean;
}

interface Command {
  id: string;
  title: string;
  shortcut?: string;
  run: () => void;
}

const DEFAULT_LAYOUT: LayoutState = {
  leftWidth: 228,
  rightWidth: 280,
  bottomHeight: 286,
  consoleHeight: 96,
  hierarchyVisible: true,
  inspectorVisible: true,
  bottomTab: "Project",
  bottomTabOrder: ["Project", "Animation", "Components", "Console", "Hierarchy", "Inspector"],
  dockedPanels: [],
  consoleDocked: false,
};

function defaultLayout(compact: boolean): LayoutState {
  return compact
    ? { ...DEFAULT_LAYOUT, leftWidth: 194, rightWidth: 250, bottomHeight: 207, consoleHeight: 60 }
    : { ...DEFAULT_LAYOUT };
}

function normalizeBottomTabOrder(value: unknown): BottomTab[] {
  const allowed: BottomTab[] = ["Project", "Animation", "Components", "Console", "Hierarchy", "Inspector"];
  const supplied = Array.isArray(value) ? value.filter((item): item is BottomTab => allowed.includes(item)) : [];
  return [...new Set(supplied), ...allowed.filter((item) => !supplied.includes(item))];
}

function clampLayoutValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function iconPath(theme: Theme, name: string): string {
  return `/editor/app/editor-icons/${theme}/godot/${name}.svg`;
}

function Icon(props: {
  theme: Theme;
  name: string;
  size?: number;
  label?: string;
}) {
  return (
    <img
      class="icon-image"
      src={iconPath(props.theme, props.name)}
      width={props.size ?? 16}
      height={props.size ?? 16}
      alt={props.label ?? ""}
      aria-hidden={props.label ? undefined : "true"}
      loading="lazy"
    />
  );
}

function ProjectTreeNode(props: {
  node: ProjectEntry;
  path: string;
  theme: Theme;
  selectedPath: string;
  onSelect: (path: string, isFile: boolean) => void;
  search?: string;
}) {
  const [expanded, setExpanded] = createSignal(
    props.path.length === 0 || props.path === "scenes" || props.path === "assets",
  );
  const isDirectory = () => !props.node.isFile;
  const iconName = () => {
    if (isDirectory()) return expanded() ? "folder" : "folder";
    const extension = props.node.name.toLowerCase().split(".").pop();
    if (extension === "scene" || extension === "prefab") return "packed-scene";
    if (["png", "jpg", "jpeg", "webp"].includes(extension ?? "")) return "image-texture";
    if (extension === "ts" || extension === "tsx" || extension === "js") return "script";
    if (extension === "json") return "file";
    return "text-file";
  };

  return (
    <div class="file-tree-node">
      <button
        class="file-tree-row"
        classList={{
          selected: props.selectedPath === props.path,
          "is-directory": isDirectory(),
        }}
        style={{ "padding-left": `${props.path.split("/").length * 10 + 7}px` }}
        aria-expanded={isDirectory() ? expanded() : undefined}
        onClick={() => {
          if (isDirectory()) setExpanded((value) => !value);
          else props.onSelect(props.path, true);
        }}
        onDblClick={() => {
          if (props.node.isFile) props.onSelect(props.path, true);
        }}
        title={props.path}
      >
        <span class="tree-disclosure" aria-hidden="true">
          <Show when={isDirectory()}>{expanded() ? "▾" : "▸"}</Show>
        </span>
        <Icon theme={props.theme} name={iconName()} size={14} />
        <span class="tree-label">{props.node.name}</span>
        <Show when={props.node.isFile && props.node.name.toLowerCase().endsWith(".scene")}>
          <span class="file-kind">SCENE</span>
        </Show>
      </button>
      <Show when={isDirectory() && expanded()}>
        <div class="file-tree-children">
          <For each={props.node.children ?? []}>
            {(child) => {
              const childPath = props.path
                ? `${props.path}/${child.name}`
                : child.name;
              return (
                <ProjectTreeNode
                  node={child}
                  path={childPath}
                  theme={props.theme}
                  selectedPath={props.selectedPath}
                  onSelect={props.onSelect}
                />
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function flattenProjectFiles(
  node: ProjectEntry,
  prefix = "",
): Array<{ path: string; entry: ProjectEntry }> {
  const result: Array<{ path: string; entry: ProjectEntry }> = [];
  for (const child of node.children ?? []) {
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    result.push({ path, entry: child });
    if (!child.isFile) result.push(...flattenProjectFiles(child, path));
  }
  return result;
}

function PanelHeader(props: {
  title: string;
  icon: string;
  theme: Theme;
  trailing?: string;
  onDragStart?: (event: DragEvent) => void;
  onUndock?: () => void;
}) {
  return (
    <div class="panel-header" draggable={Boolean(props.onDragStart)} onDragStart={props.onDragStart} classList={{ "panel-header-draggable": Boolean(props.onDragStart) }}>
      <Icon theme={props.theme} name={props.icon} size={14} />
      <span>{props.title}</span>
      <Show when={props.trailing}>
        <span class="panel-header-trailing">{props.trailing}</span>
      </Show>
      <Show when={props.onUndock}>
        <button class="panel-undock-button" aria-label={`Undock ${props.title}`} title={`Move ${props.title} back to its default panel`} onClick={(event) => { event.stopPropagation(); props.onUndock?.(); }}>Undock</button>
      </Show>
    </div>
  );
}

function ConsolePanel(props: {
  className: string;
  theme: Theme;
  level: string;
  onLevelChange: (level: string) => void;
  messages: ConsoleMessage[];
  onClear: () => void;
  onDragStart?: (event: DragEvent) => void;
  onUndock?: () => void;
}) {

  return (
    <section class="console-panel" classList={{ [props.className]: true }} data-testid="console-panel" data-focus-context="console">
      <div
        class="console-header"
        draggable={Boolean(props.onDragStart)}
        onDragStart={props.onDragStart}
        classList={{ "console-header-draggable": Boolean(props.onDragStart) }}
      >
        <div class="console-title"><Icon theme={props.theme} name="script" size={13} /> Console</div>
        <select aria-label="Console message filter" value={props.level} onChange={(event) => props.onLevelChange(event.currentTarget.value)}>
          <option value="all">All</option>
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
        <div class="console-header-spacer" />
        <Show when={props.onUndock}>
          <button class="console-undock-button" aria-label="Undock Console" title="Move Console back to its own dock" onClick={props.onUndock}>
            Undock
          </button>
        </Show>
        <span class="console-count">{props.messages.length} messages</span>
        <button class="toolbar-icon-button tiny" aria-label="Clear console" title="Clear console" onClick={props.onClear}>
          <Icon theme={props.theme} name="remove" size={12} />
        </button>
      </div>
      <div class="console-messages" role="log" aria-label="Editor console" aria-live="polite">
        <Show when={props.messages.length > 0} fallback={<div class="console-empty">No messages. Editor diagnostics will appear here.</div>}>
          <For each={props.messages}>
            {(message) => (
              <div class="console-message" classList={{ [message.level]: true }}>
                <span class="console-time">{message.time}</span>
                <span class="console-level">{message.level.toUpperCase()}</span>
                <span class="console-text">{message.text}</span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

function App() {
  const [theme, setTheme] = createSignal<Theme>((() => {
    const stored = window.localStorage.getItem("codogma.editor.theme");
    return stored === "light" ? "light" : "dark";
  })());
  const [projectName, setProjectName] = createSignal("Project");
  const [projectTree, setProjectTree] = createSignal<ProjectEntry | null>(null);
  const [scene, setScene] = createSignal<SceneDocument | null>(null);
  const [scenePath, setScenePath] = createSignal("");
  const [savedContent, setSavedContent] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [animationDocument, setAnimationDocument] = createSignal<AnimationDocument | null>(null);
  const [animationPath, setAnimationPath] = createSignal("");
  const [savedAnimationContent, setSavedAnimationContent] = createSignal("");
  const [selectedAnimationKey, setSelectedAnimationKey] = createSignal("");
  const [animationFrameKey, setAnimationFrameKey] = createSignal("");
  const [animationSaving, setAnimationSaving] = createSignal(false);
  const [animationAssetSources, setAnimationAssetSources] = createSignal<Array<{ key: string; url: string; type: string }>>([]);
  const [animationPlaying, setAnimationPlaying] = createSignal(false);
  const [animationPlayheadMs, setAnimationPlayheadMs] = createSignal(0);
  const [animationPreviewFrameIndex, setAnimationPreviewFrameIndex] = createSignal(0);
  const [selectedAnimationFrameIndex, setSelectedAnimationFrameIndex] = createSignal(0);
  const [componentSources, setComponentSources] = createSignal<Array<{ path: string; document: UserComponentsDocument }>>([]);
  const [componentDocument, setComponentDocument] = createSignal<UserComponentsDocument | null>(null);
  const [componentDocumentPath, setComponentDocumentPath] = createSignal("");
  const [savedComponentContent, setSavedComponentContent] = createSignal("");
  const [componentSaving, setComponentSaving] = createSignal(false);
  const [newComponentName, setNewComponentName] = createSignal("");
  const [newComponentPropertyName, setNewComponentPropertyName] = createSignal("");
  const [newComponentPropertyType, setNewComponentPropertyType] = createSignal<"number" | "string" | "boolean">("number");
  const [componentToAttach, setComponentToAttach] = createSignal("");
  const [prefabCatalog, setPrefabCatalog] = createSignal<Array<{ path: string; document: PrefabDocument }>>([]);
  const [selectedPrefabPath, setSelectedPrefabPath] = createSignal("");
  const [prefabPropertyName, setPrefabPropertyName] = createSignal("");
  const [prefabPropertyType, setPrefabPropertyType] = createSignal<"string" | "number" | "boolean" | "option">("boolean");
  const [prefabPropertyDefault, setPrefabPropertyDefault] = createSignal("");
  const [history, setHistory] = createSignal<SceneDocument[]>([]);
  const [historyIndex, setHistoryIndex] = createSignal(-1);
  const [selectionHistory, setSelectionHistory] = createSignal<Array<{ before: string | null; after: string | null }>>([]);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [loadError, setLoadError] = createSignal("");
  const [activeViewport, setActiveViewport] = createSignal<ViewportTab>("Scene");
  const bottomTab = () => layout().bottomTab;
  const [compactWorkbench, setCompactWorkbench] = createSignal(window.innerWidth <= 1360);
  const [layout, setLayout] = createSignal<LayoutState>((() => {
    const compact = window.innerWidth <= 1360;
    const defaults = defaultLayout(compact);
    const stored = window.localStorage.getItem("codogma.editor.layout");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<LayoutState>;
        const savedLeft = compact && parsed.leftWidth === DEFAULT_LAYOUT.leftWidth ? defaults.leftWidth : parsed.leftWidth;
        const savedRight = compact && parsed.rightWidth === DEFAULT_LAYOUT.rightWidth ? defaults.rightWidth : parsed.rightWidth;
        const savedBottom = compact && parsed.bottomHeight === DEFAULT_LAYOUT.bottomHeight ? defaults.bottomHeight : parsed.bottomHeight;
        const dockedPanels = Array.isArray(parsed.dockedPanels)
          ? parsed.dockedPanels.filter((panel): panel is SidePanelId => panel === "Hierarchy" || panel === "Inspector")
          : [];
        const bottomTabOrder = normalizeBottomTabOrder(parsed.bottomTabOrder);
        const requestedBottomTab = parsed.bottomTab;
        const validBottomTab =
          requestedBottomTab === "Project" ||
          requestedBottomTab === "Animation" ||
          requestedBottomTab === "Components" ||
          (requestedBottomTab === "Console" && (compact || parsed.consoleDocked === true)) ||
          (requestedBottomTab === "Hierarchy" && dockedPanels.includes("Hierarchy")) ||
          (requestedBottomTab === "Inspector" && dockedPanels.includes("Inspector"));
        return {
          leftWidth: clampLayoutValue(savedLeft, defaults.leftWidth, 170, 360),
          rightWidth: clampLayoutValue(savedRight, defaults.rightWidth, 210, 420),
          bottomHeight: clampLayoutValue(savedBottom, defaults.bottomHeight, 150, 420),
          consoleHeight: clampLayoutValue(parsed.consoleHeight, defaults.consoleHeight, 56, 180),
          hierarchyVisible: typeof parsed.hierarchyVisible === "boolean" ? parsed.hierarchyVisible : defaults.hierarchyVisible,
          inspectorVisible: typeof parsed.inspectorVisible === "boolean" ? parsed.inspectorVisible : defaults.inspectorVisible,
          consoleDocked: parsed.consoleDocked === true,
          dockedPanels,
          bottomTabOrder,
          bottomTab: validBottomTab ? requestedBottomTab as BottomTab : "Project",
        };
      } catch {
        window.localStorage.removeItem("codogma.editor.layout");
      }
    }
    return defaults;
  })());
  const [hierarchySearch, setHierarchySearch] = createSignal("");
  const [projectSearch, setProjectSearch] = createSignal("");
  const [selectedProjectPath, setSelectedProjectPath] = createSignal("");
  const [activeMenu, setActiveMenu] = createSignal("");
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [paletteQuery, setPaletteQuery] = createSignal("");
  const [focusContext, setFocusContext] = createSignal<FocusContext>("global");
  const [tool, setTool] = createSignal<"select" | "move" | "rotate" | "scale">("select");
  const [gameInstance, setGameInstance] = createSignal(0);
  const [gameLoaded, setGameLoaded] = createSignal(false);
  const [consoleLevel, setConsoleLevel] = createSignal("all");
  const [consoleMessages, setConsoleMessages] = createSignal<ConsoleMessage[]>([]);
  const [dockTargetActive, setDockTargetActive] = createSignal(false);
  const [draggedDockPanel, setDraggedDockPanel] = createSignal<BottomTab | null>(null);
  const [hiddenObjects, setHiddenObjects] = createSignal(new Set<string>());
  const [lockedObjects, setLockedObjects] = createSignal(new Set<string>());
  const [showObjectMenu, setShowObjectMenu] = createSignal(false);
  const [commandIndex, setCommandIndex] = createSignal(0);

  let messageId = 0;
  let paletteInput: HTMLInputElement | undefined;
  let paletteDialog: HTMLDivElement | undefined;
  let previousPaletteFocus: HTMLElement | null = null;
  let hierarchyPanelElement: HTMLElement | undefined;
  let inspectorPanelElement: HTMLElement | undefined;
  let hierarchyHomeSlot: HTMLDivElement | undefined;
  let inspectorHomeSlot: HTMLDivElement | undefined;
  let bottomDockedContent: HTMLDivElement | undefined;
  let sceneCanvas: HTMLCanvasElement | null = null;
  let disposeEditorMcpBridge: (() => void) | undefined;
  let animationPlaybackRaf = 0;
  let animationPlaybackLastTimestamp = 0;
  let animationPlaybackElapsed = 0;
  let bottomTabPointerDrag: { panel: BottomTab; pointerId: number; startX: number; startY: number; active: boolean } | undefined;
  let suppressDockTabClick = false;
  let resizeState:
    | {
        kind: "left" | "right" | "bottom" | "console";
        startX: number;
        startY: number;
        initialValue: number;
      }
    | undefined;

  const dirty = createMemo(() => {
    const current = scene();
    const saved = savedContent();
    if (!current || !saved) return false;
    try {
      return JSON.stringify(current) !== JSON.stringify(JSON.parse(saved));
    } catch {
      return true;
    }
  });

  const animationDirty = createMemo(() => {
    const current = animationDocument();
    const saved = savedAnimationContent();
    if (!current || !saved) return false;
    try { return formatAnimationContent(current) !== saved; }
    catch { return true; }
  });

  const componentDirty = createMemo(() => {
    const current = componentDocument();
    const saved = savedComponentContent();
    if (!current || !saved) return false;
    try { return formatUserComponentsContent(current) !== saved; }
    catch { return true; }
  });

  const documentDirty = createMemo(() => dirty() || animationDirty() || componentDirty());

  const componentRegistry = createMemo(() => {
    const sources = componentSources();
    const active = componentDocument();
    const activePath = componentDocumentPath();
    const effective = active && activePath
      ? [...sources.filter((source) => source.path !== activePath), { path: activePath, document: active }]
      : sources;
    return effective.flatMap((source) => source.document.components.map((definition) => ({
      path: source.path,
      definition,
    })));
  });

  const sceneObjects = createMemo(() => {
    const current = scene();
    return current ? getSceneObjects(current) : [];
  });

  const selectedObject = createMemo<SceneObjectEntry | undefined>(() => {
    const id = selectedId();
    return id ? sceneObjects().find((item) => item.id === id) : undefined;
  });

  const selectedFxEffects = createMemo(() => {
    const selected = selectedObject();
    return selected ? getSceneObjectEffects(selected.source) : [];
  });

  const selectedUnsupportedFxTypes = createMemo(() => {
    const selected = selectedObject();
    return selected ? getUnsupportedSceneObjectEffects(selected.source) : [];
  });

  const visibleSceneObjects = createMemo(() => {
    const query = hierarchySearch().trim().toLowerCase();
    if (!query) return sceneObjects();
    return sceneObjects().filter((item) => item.name.toLowerCase().includes(query));
  });

  const filteredProjectFiles = createMemo(() => {
    const root = projectTree();
    const query = projectSearch().trim().toLowerCase();
    if (!root || !query) return [];
    return flattenProjectFiles(root).filter(({ path }) =>
      path.toLowerCase().includes(query),
    );
  });

  const visibleBottomTabs = createMemo(() => layout().bottomTabOrder.filter((tab) => {
    if (tab === "Hierarchy" || tab === "Inspector") return layout().dockedPanels.includes(tab);
    if (tab === "Console") return compactWorkbench() || layout().consoleDocked;
    return true;
  }));

  const visibleConsoleMessages = createMemo(() => {
    const level = consoleLevel();
    return level === "all"
      ? consoleMessages()
      : consoleMessages().filter((item) => item.level === level);
  });

  const commands = createMemo<Command[]>(() => [
    {
      id: "save",
      title: "Save active document",
      shortcut: "Ctrl+S",
      run: () => void saveActiveDocument(),
    },
    {
      id: "undo",
      title: "Undo",
      shortcut: "Ctrl+Z",
      run: undo,
    },
    {
      id: "redo",
      title: "Redo",
      shortcut: "Ctrl+Shift+Z",
      run: redo,
    },
    {
      id: "game",
      title: "Open Game view",
      run: () => setActiveViewport("Game"),
    },
    {
      id: "scene",
      title: "Open Scene view",
      run: () => setActiveViewport("Scene"),
    },
    {
      id: "theme",
      title: "Toggle light / dark theme",
      run: toggleTheme,
    },
    {
      id: "hierarchy",
      title: "Toggle Hierarchy panel",
      run: () => toggleSidePanel("Hierarchy"),
    },
    {
      id: "inspector",
      title: "Toggle Inspector panel",
      run: () => toggleSidePanel("Inspector"),
    },
    {
      id: "project",
      title: "Show Project panel",
      run: () => setLayout((current) => ({ ...current, bottomTab: "Project" })),
    },
    {
      id: "animation",
      title: "Show Animation workspace",
      run: () => setLayout((current) => ({ ...current, bottomTab: "Animation" })),
    },
    {
      id: "components",
      title: "Show User Components",
      run: () => setLayout((current) => ({ ...current, bottomTab: "Components" })),
    },
    {
      id: "tool-select",
      title: "Select tool",
      shortcut: "Q",
      run: () => setTool("select"),
    },
    {
      id: "tool-move",
      title: "Move tool",
      shortcut: "W",
      run: () => setTool("move"),
    },
    {
      id: "tool-rotate",
      title: "Rotate tool",
      shortcut: "E",
      run: () => setTool("rotate"),
    },
    {
      id: "tool-scale",
      title: "Scale tool",
      shortcut: "R",
      run: () => setTool("scale"),
    },
    {
      id: "rename",
      title: "Rename selected object",
      shortcut: "F2",
      run: renameSelectedObject,
    },
    {
      id: "delete",
      title: "Delete selected object",
      shortcut: "Delete",
      run: deleteSelectedObject,
    },
    {
      id: "console",
      title: "Show Console workspace",
      run: () => {
        if (compactWorkbench() || layout().consoleDocked) setLayout((current) => ({ ...current, bottomTab: "Console" }));
        else document.querySelector(".desktop-console-panel")?.scrollIntoView({ block: "nearest" });
      },
    },
  ]);

  const filteredCommands = createMemo(() => {
    const query = paletteQuery().trim().toLowerCase();
    return commands().filter((command) => command.title.toLowerCase().includes(query));
  });

  function log(level: ConsoleLevel, text: string) {
    const entry: ConsoleMessage = {
      id: ++messageId,
      level,
      text,
      time: new Date().toLocaleTimeString(),
    };
    setConsoleMessages((current) => [...current, entry].slice(-250));
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
    setActiveMenu("");
  }

  createEffect(() => {
    const mode = theme();
    document.documentElement.dataset.theme = mode;
    for (const [name, definition] of Object.entries(designTokens.variables)) {
      const value = (definition as Record<string, string>)[mode];
      if (value) document.documentElement.style.setProperty(`--${name}`, value);
      else if (typeof definition === "object" && "value" in definition) {
        document.documentElement.style.setProperty(
          `--${name}`,
          String((definition as { value: string | number }).value),
        );
      }
    }
    window.localStorage.setItem("codogma.editor.theme", mode);
  });

  createEffect(() => {
    const current = layout();
    window.localStorage.setItem("codogma.editor.layout", JSON.stringify(current));
  });

  let sceneLoadSequence = 0;
  let documentLoadSequence = 0;

  async function loadScene(path: string, reloadCurrent = false): Promise<boolean> {
    if (path === scenePath() && !reloadCurrent) return true;
    if (animationDirty() || componentDirty()) {
      if (!window.confirm("The active animation or User Components file has unsaved changes. Discard them and open the scene?")) return false;
    }
    if (dirty()) {
      const discardChanges = window.confirm(
        "This scene has unsaved changes. Discard them and open the requested scene?",
      );
      if (!discardChanges) return false;
    }

    const request = ++sceneLoadSequence;
    setLoadError("");
    try {
      const content = await readProjectFile(path);
      if (request !== sceneLoadSequence) return false;
      const parsed = parseSceneContent(content) as SceneDocument;
      stopAnimationPreview(true);
      setScene(parsed);
      setScenePath(path);
      setSavedContent(content);
      setHistory([parsed]);
      setHistoryIndex(0);
      setSelectionHistory([]);
      const firstObject = getSceneObjects(parsed)[0];
      setSelectedId(firstObject?.id ?? null);
      setSelectedProjectPath(path);
      setAnimationDocument(null);
      setAnimationPath("");
      setSavedAnimationContent("");
      setComponentDocument(null);
      setComponentDocumentPath("");
      setSavedComponentContent("");
      setActiveViewport("Scene");
      setGameLoaded(false);
      log("success", `Opened ${path}`);
      return true;
    } catch (error) {
      if (request !== sceneLoadSequence) return false;
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      log("error", message);
      return false;
    }
  }

  async function loadProject() {
    setLoading(true);
    setLoadError("");
    try {
      const result = await getProjectFiles();
      setProjectTree(result.rootFile);
      setProjectName(result.rootFile.name);
      const scenes = findScenePaths(result.rootFile);
      if (scenes.length === 0) {
        throw new Error("No .scene files were found in the selected project.");
      }
      const files = flattenProjectFiles(result.rootFile);
      const availableProjectPaths = new Set(files.filter(({ entry }) => entry.isFile).map(({ path }) => path));
      const animationAssets: Array<{ key: string; url: string; type: string }> = [];
      const assetPackFiles = files.filter(({ path, entry }) => entry.isFile && path.toLowerCase().endsWith("asset-pack.json"));
      for (const packFile of assetPackFiles) {
        try {
          const pack = JSON.parse(await readProjectFile(packFile.path)) as Record<string, unknown>;
          const packDirectory = packFile.path.split("/").slice(0, -1).join("/");
          for (const section of Object.values(pack)) {
            if (!section || typeof section !== "object" || !Array.isArray((section as { files?: unknown }).files)) continue;
            for (const asset of (section as { files: unknown[] }).files) {
              if (!asset || typeof asset !== "object") continue;
              const entry = asset as { key?: unknown; url?: unknown; type?: unknown };
              if (typeof entry.key !== "string" || typeof entry.url !== "string") continue;
              if (/^(?:https?:|data:|blob:)/i.test(entry.url)) continue;
              const candidate = entry.url.replace(/\\/g, "/").replace(/^(?:\.\/|\/)+/, "");
              const resolvedPath = availableProjectPaths.has(candidate)
                ? candidate
                : [packDirectory, candidate].filter(Boolean).join("/");
              if (!availableProjectPaths.has(resolvedPath)) continue;
              animationAssets.push({
                key: entry.key,
                url: resolvedPath,
                type: typeof entry.type === "string" ? entry.type : "image",
              });
            }
          }
        } catch (error) {
          log("warning", `Could not read Asset Pack ${packFile.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      setAnimationAssetSources(animationAssets);
      const [prefabs, components] = await Promise.all([
        Promise.all(scenes.map(async (path) => {
          try {
            const parsed = parseSceneContent(await readProjectFile(path));
            return parsed.sceneType === "PREFAB" ? { path, document: parsed as PrefabDocument } : null;
          } catch { return null; }
        })),
        Promise.all(files.filter(({ path }) => path.toLowerCase().endsWith(".components")).map(async ({ path }) => {
          try { return { path, document: parseUserComponentsContent(await readProjectFile(path)) }; }
          catch (error) { log("warning", `Could not read User Components file ${path}: ${error instanceof Error ? error.message : String(error)}`); return null; }
        })),
      ]);
      setPrefabCatalog(prefabs.filter((item): item is { path: string; document: PrefabDocument } => item !== null));
      setComponentSources(components.filter((item): item is { path: string; document: UserComponentsDocument } => item !== null));
      const preferred = scenes.find((path) => path.toLowerCase() === "scenes/level.scene") ?? scenes.find((path) => !prefabs.some((item) => item?.path === path)) ?? scenes[0];
      if (!preferred) throw new Error("The selected project does not contain an openable scene file.");
      await loadScene(preferred);
      log("info", `Project loaded · ${result.projectNumberOfFiles} files and folders`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      log("error", message);
    } finally {
      setLoading(false);
    }
  }

  function applySceneChange(next: SceneDocument, selectionAfter = selectedId()) {
    const currentIndex = historyIndex();
    const currentHistory = history().slice(0, currentIndex + 1);
    const nextHistory = [...selectionHistory().slice(0, currentIndex), {
      before: selectedId(),
      after: selectionAfter,
    }];
    currentHistory.push(next);
    if (currentHistory.length > 100) {
      currentHistory.shift();
      nextHistory.shift();
    }
    setHistory(currentHistory);
    setSelectionHistory(nextHistory);
    setHistoryIndex(currentHistory.length - 1);
    setScene(next);
    setSelectedId(selectionAfter);
  }

  function undo() {
    const index = historyIndex();
    if (index <= 0) return;
    const nextIndex = index - 1;
    const nextScene = history()[nextIndex];
    if (!nextScene) return;
    setScene(nextScene);
    setSelectedId(selectionHistory()[index - 1]?.before ?? getSceneObjects(nextScene)[0]?.id ?? null);
    setHistoryIndex(nextIndex);
    log("info", "Undo");
  }

  function redo() {
    const index = historyIndex();
    if (index < 0 || index >= history().length - 1) return;
    const nextIndex = index + 1;
    const nextScene = history()[nextIndex];
    if (!nextScene) return;
    setScene(nextScene);
    setSelectedId(selectionHistory()[index]?.after ?? getSceneObjects(nextScene)[0]?.id ?? null);
    setHistoryIndex(nextIndex);
    log("info", "Redo");
  }

  async function refreshProjectTree() {
    const result = await getProjectFiles();
    setProjectTree(result.rootFile);
  }

  async function ensureProjectFolder(relativePath: string) {
    const root = projectTree();
    if (!root) throw new Error("The project tree is not loaded.");
    const existing = flattenProjectFiles(root).find((item) => item.path === relativePath);
    if (existing && !existing.entry.isFile) return;
    if (existing?.entry.isFile) throw new Error(`A file already exists at "${relativePath}".`);
    await createProjectFolder(relativePath);
    await refreshProjectTree();
  }

  function stopAnimationPreview(reset = true) {
    if (animationPlaybackRaf) cancelAnimationFrame(animationPlaybackRaf);
    animationPlaybackRaf = 0;
    animationPlaybackLastTimestamp = 0;
    animationPlaybackElapsed = 0;
    setAnimationPlaying(false);
    if (reset) {
      setAnimationPlayheadMs(0);
      setAnimationPreviewFrameIndex(0);
      setSelectedAnimationFrameIndex(0);
    }
  }

  async function loadAnimationFile(path: string, sourceContent?: string) {
    if (path === animationPath()) return;
    if ((dirty() || componentDirty()) &&
        !window.confirm("The active scene or User Components file has unsaved changes. Discard them?")) return;
    if (animationDirty() && !window.confirm("The active animation file has unsaved changes. Discard them?")) return;
    const request = ++documentLoadSequence;
    try {
      const content = sourceContent ?? await readProjectFile(path);
      if (request !== documentLoadSequence) return;
      const parsed = parseAnimationContent(content);
      setAnimationDocument(parsed);
      setAnimationPath(path);
      setSavedAnimationContent(formatAnimationContent(parsed));
      setSelectedAnimationKey(parsed.anims[0]?.key ?? "");
      setSelectedAnimationFrameIndex(0);
      stopAnimationPreview(true);
      setAnimationFrameKey("");
      setSelectedProjectPath(path);
      setLayout((current) => ({ ...current, bottomTab: "Animation" }));
      log("success", `Opened animation file ${path}`);
    } catch (error) {
      if (request !== documentLoadSequence) return;
      log("error", error instanceof Error ? error.message : String(error));
    }
  }

  async function saveAnimationFile() {
    const current = animationDocument();
    const path = animationPath();
    if (!current || !path || animationSaving()) return;
    setAnimationSaving(true);
    try {
      const content = formatAnimationContent(current);
      await writeProjectFile(path, content);
      setSavedAnimationContent(content);
      log("success", `Saved animations ${path}`);
    } catch (error) {
      log("error", `Animation save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAnimationSaving(false);
    }
  }

  async function createAnimationFile() {
    const path = window.prompt("New Phaser animations JSON path", "animations/animations.json")?.trim();
    if (!path) return;
    if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.json$/i.test(path) || path.split("/").includes("..")) {
      log("error", "Animation file path must be a relative .json path inside the project.");
      return;
    }
    const directory = path.split("/").slice(0, -1).join("/");
    try {
      assertNewProjectFilePath(path);
      if (directory) await ensureProjectFolder(directory);
      const document = createAnimationDocument();
      const content = formatAnimationContent(document);
      await writeProjectFile(path, content);
      stopAnimationPreview(true);
      setAnimationDocument(document);
      setAnimationPath(path);
      setSavedAnimationContent(content);
      setSelectedAnimationKey("");
      setLayout((current) => ({ ...current, bottomTab: "Animation" }));
      await refreshProjectTree();
      log("success", `Created animations file ${path}`);
    } catch (error) {
      log("error", `Could not create animations file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function addAnimationClip() {
    const current = animationDocument();
    if (!current) return;
    stopAnimationPreview(true);
    const source = selectedObject()?.source;
    const texture = source?.texture;
    const textureKey = texture && typeof texture === "object" ? String(texture.key ?? "") : "";
    const next = createAnimation(current, "animation", {
      frames: textureKey ? [{ key: textureKey }] : [],
    });
    setAnimationDocument(next);
    setSelectedAnimationKey(next.anims.at(-1)?.key ?? "");
    setSelectedAnimationFrameIndex(0);
  }

  function updateSelectedAnimation(patch: Record<string, unknown>) {
    const current = animationDocument();
    const key = selectedAnimationKey();
    if (!current || !key) return;
    try {
      stopAnimationPreview(false);
      const next = updateAnimation(current, key, patch);
      setAnimationDocument(next);
      if (typeof patch.key === "string") setSelectedAnimationKey(patch.key);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function deleteAnimationClip(key: string) {
    const current = animationDocument();
    if (!current) return;
    try {
      stopAnimationPreview(true);
      const next = removeAnimation(current, key);
      setAnimationDocument(next);
      setSelectedAnimationKey(next.anims[0]?.key ?? "");
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function deleteAnimationFrame(index: number) {
    const current = animationDocument();
    const key = selectedAnimationKey();
    if (!current || !key) return;
    try {
      stopAnimationPreview(false);
      setAnimationDocument(removeAnimationFrame(current, key, index));
      const count = activeAnimation()?.frames.length ?? 0;
      setSelectedAnimationFrameIndex(Math.max(0, Math.min(index, count - 1)));
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function moveAnimationFrameBy(index: number, offset: -1 | 1) {
    const current = animationDocument();
    const key = selectedAnimationKey();
    const frames = activeAnimation()?.frames ?? [];
    const target = index + offset;
    if (!current || !key || target < 0 || target >= frames.length) return;
    try {
      stopAnimationPreview(false);
      setAnimationDocument(moveAnimationFrame(current, key, index, target));
      setSelectedAnimationFrameIndex(target);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function updateAnimationFrame(index: number, patch: Record<string, unknown>) {
    const current = animationDocument();
    const key = selectedAnimationKey();
    const frames = activeAnimation()?.frames;
    if (!current || !key || !frames || index < 0 || index >= frames.length) return;
    const nextFrames = frames.map((frame, frameIndex) => frameIndex === index ? { ...frame, ...patch } : frame);
    try {
      stopAnimationPreview(false);
      setAnimationDocument(updateAnimation(current, key, { frames: nextFrames }));
      setSelectedAnimationFrameIndex(index);
    }
    catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function addAnimationFrame() {
    const current = animationDocument();
    const key = selectedAnimationKey();
    const frameKey = animationFrameKey().trim();
    if (!current || !key || !frameKey) return;
    try {
      setAnimationDocument(appendAnimationFrame(current, key, { key: frameKey }));
      const lastFrameIndex = Math.max(0, (activeAnimation()?.frames.length ?? 1) - 1);
      setSelectedAnimationFrameIndex(lastFrameIndex);
      setAnimationPreviewFrameIndex(lastFrameIndex);
      setAnimationFrameKey("");
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  async function openUserComponentsFile(path: string) {
    if (path === componentDocumentPath()) return;
    if ((dirty() || animationDirty()) &&
        !window.confirm("The active scene or animation file has unsaved changes. Discard them?")) return;
    if (componentDirty() && !window.confirm("The active User Components file has unsaved changes. Discard them?")) return;
    const request = ++documentLoadSequence;
    try {
      const content = await readProjectFile(path);
      if (request !== documentLoadSequence) return;
      const parsed = parseUserComponentsContent(content);
      setComponentDocument(parsed);
      setComponentDocumentPath(path);
      setSavedComponentContent(formatUserComponentsContent(parsed));
      setSelectedProjectPath(path);
      setLayout((current) => ({ ...current, bottomTab: "Components" }));
      setComponentSources((current) => [
        ...current.filter((item) => item.path !== path),
        { path, document: parsed },
      ]);
      log("success", `Opened User Components ${path}`);
    } catch (error) {
      if (request !== documentLoadSequence) return;
      log("error", error instanceof Error ? error.message : String(error));
    }
  }

  async function openProjectFile(path: string) {
    const normalized = path.toLowerCase();
    if (normalized.endsWith(".scene")) {
      await loadScene(path);
      return;
    }
    if (normalized.endsWith(".components")) {
      await openUserComponentsFile(path);
      return;
    }
    if (normalized.endsWith(".json")) {
      try {
        const content = await readProjectFile(path);
        let parsed: unknown;
        try { parsed = JSON.parse(content); }
        catch { log("info", `Selected JSON file: ${path}`); return; }
        if (isAnimationContent(parsed)) {
          await loadAnimationFile(path, content);
          return;
        }
      } catch (error) {
        log("warning", `Could not inspect ${path}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    }
    setSelectedProjectPath(path);
    log("info", `Selected project file: ${path}`);
  }

  function assertNewProjectFilePath(path: string) {
    const root = projectTree();
    if (!root) throw new Error("The project tree is not loaded.");
    const existing = flattenProjectFiles(root).find((item) => item.path.toLowerCase() === path.toLowerCase());
    if (existing) throw new Error(`A project item already exists at "${path}".`);
  }

  async function saveUserComponentsFile() {
    const current = componentDocument();
    const path = componentDocumentPath();
    if (!current || !path || componentSaving()) return;
    setComponentSaving(true);
    try {
      const content = formatUserComponentsContent(current);
      await writeProjectFile(path, content);
      setSavedComponentContent(content);
      setComponentSources((sources) => sources.map((item) => item.path === path ? { path, document: current } : item));
      log("success", `Saved User Components ${path}`);
    } catch (error) {
      log("error", `Component save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setComponentSaving(false);
    }
  }

  async function createUserComponentsFile() {
    const path = window.prompt("New User Components file path", "components/Behaviors.components")?.trim();
    if (!path) return;
    if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.components$/i.test(path) || path.split("/").includes("..")) {
      log("error", "User Components path must be a relative .components path inside the project.");
      return;
    }
    const directory = path.split("/").slice(0, -1).join("/");
    try {
      assertNewProjectFilePath(path);
      if (directory) await ensureProjectFolder(directory);
      const document: UserComponentsDocument = {
        components: [],
        outputLang: "TYPE_SCRIPT",
        meta: {
          app: "Codogma Engine - User Components Editor",
          url: "https://codogma.com",
          contentType: "phasereditor2d.core.scene.SceneContentType",
        },
      };
      const content = formatUserComponentsContent(document);
      await writeProjectFile(path, content);
      setComponentDocument(document);
      setComponentDocumentPath(path);
      setSavedComponentContent(content);
      setComponentSources((sources) => [...sources, { path, document }]);
      setLayout((current) => ({ ...current, bottomTab: "Components" }));
      await refreshProjectTree();
    } catch (error) {
      log("error", `Could not create User Components file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function addUserComponent() {
    const current = componentDocument();
    const name = newComponentName().trim();
    if (!current || !name) return;
    try {
      const next = addUserComponentDefinition(current, createUserComponentDefinition(name));
      setComponentDocument(next);
      setNewComponentName("");
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function removeUserComponent(name: string) {
    const current = componentDocument();
    if (!current) return;
    try { setComponentDocument(removeUserComponentDefinition(current, name)); }
    catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function removeUserComponentProperty(componentName: string, propertyName: string) {
    const current = componentDocument();
    const definition = current?.components.find((item) => item.name === componentName);
    if (!current || !definition) return;
    try {
      setComponentDocument(updateUserComponentDefinition(current, componentName, {
        properties: (definition.properties ?? []).filter((property) => property.name !== propertyName),
      }));
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function updateAttachedComponentProperty(componentName: string, propertyName: string, value: unknown) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      applySceneChange(updateSceneObject(current, selected.id, { [`${componentName}.${propertyName}`]: value }), selected.id);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function addUserComponentProperty(componentName: string) {
    const current = componentDocument();
    if (!current) return;
    const component = current.components.find((item) => item.name === componentName);
    const propertyName = newComponentPropertyName().trim();
    if (!component || !propertyName) return;
    const defaultValue = newComponentPropertyType() === "number" ? 0
      : newComponentPropertyType() === "boolean" ? false : "";
    try {
      const next = {
        ...current,
        components: current.components.map((item) => item.name === componentName
          ? { ...item, properties: [...(item.properties ?? []), {
              name: propertyName,
              label: propertyName,
              defValue: defaultValue,
              customDefinition: false,
              type: { id: newComponentPropertyType() },
            }] }
          : item),
      };
      setComponentDocument(next);
      setNewComponentPropertyName("");
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function attachComponentToSelected(name: string) {
    const current = scene();
    const selected = selectedObject();
    const definition = componentRegistry().find((item) => item.definition.name === name)?.definition;
    if (!current || !selected || !definition) return;
    try {
      const nextSource = attachUserComponent(selected.source, definition);
      applySceneChange(updateSceneObject(current, selected.id, nextSource), selected.id);
      setComponentToAttach("");
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function detachComponentFromSelected(name: string) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      const nextSource = detachUserComponent(selected.source, name);
      applySceneChange(updateSceneObject(current, selected.id, nextSource), selected.id);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  async function createPrefabFromSelected() {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected || current.sceneType === "PREFAB") return;
    const baseName = selected.name.replace(/[^A-Za-z0-9_-]+/g, "_") || "Prefab";
    const path = window.prompt("Save Prefab scene as", `prefabs/${baseName}.scene`)?.trim();
    if (!path) return;
    if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.scene$/i.test(path) || path.split("/").includes("..")) {
      log("error", "Prefab path must be a relative .scene path inside the project.");
      return;
    }
    const directory = path.split("/").slice(0, -1).join("/");
    try {
      assertNewProjectFilePath(path);
      if (directory) await ensureProjectFolder(directory);
      const prefab = createPrefabDocument(current, selected.source, baseName);
      await writeProjectFile(path, formatSceneContent(prefab as SceneDocument));
      const withoutSource = removeSceneObject(current, selected.id);
      const next = createPrefabInstance(withoutSource, prefab, {
        label: selected.name,
        x: Number(selected.source.x ?? 400),
        y: Number(selected.source.y ?? 300),
        rotation: Number(selected.source.rotation ?? 0),
        scaleX: Number(selected.source.scaleX ?? 1),
        scaleY: Number(selected.source.scaleY ?? 1),
      });
      const instance = getSceneObjects(next).at(-1);
      applySceneChange(next, instance?.id ?? null);
      setPrefabCatalog((catalog) => [...catalog.filter((item) => item.path !== path), { path, document: prefab }]);
      await refreshProjectTree();
      log("success", `Created Prefab ${path} and replaced the selected object with an instance`);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function addPrefabInstance() {
    const current = scene();
    const prefab = prefabCatalog().find((item) => item.path === selectedPrefabPath());
    if (!current || !prefab || current.sceneType === "PREFAB") return;
    const next = createPrefabInstance(current, prefab.document, { x: 400, y: 300 });
    const instance = getSceneObjects(next).at(-1);
    applySceneChange(next, instance?.id ?? null);
  }

  function updatePrefabOverride(property: PrefabProperty, value: unknown) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected || !selected.source.prefabId) return;
    const unlock = Array.isArray(selected.source.unlock) ? selected.source.unlock as string[] : [];
    const nextUnlock = unlock.includes(property.name) ? unlock : [...unlock, property.name];
    const next = updateSceneObject(current, selected.id, { [property.name]: value, unlock: nextUnlock });
    applySceneChange(next, selected.id);
  }

  function addPrefabPropertyFromFields() {
    const current = scene();
    const name = prefabPropertyName().trim();
    if (!current || current.sceneType !== "PREFAB" || !name) return;
    const type = prefabPropertyType();
    let defaultValue: unknown = prefabPropertyDefault();
    let options: string[] | undefined;
    if (type === "number") {
      defaultValue = Number(prefabPropertyDefault() || "0");
      if (!Number.isFinite(defaultValue)) {
        log("error", "Prefab numeric default must be finite.");
        return;
      }
    } else if (type === "boolean") {
      defaultValue = prefabPropertyDefault().toLowerCase() === "true";
    } else if (type === "option") {
      options = prefabPropertyDefault().split(",").map((item) => item.trim()).filter(Boolean);
      if (options.length === 0) {
        log("error", "Enter at least one comma-separated option.");
        return;
      }
      defaultValue = options[0];
    }
    try {
      const next = addPrefabProperty(current as PrefabDocument, {
        name,
        label: name,
        tooltip: name,
        defValue: defaultValue,
        customDefinition: false,
        type: { id: type, ...(options ? { options } : {}) },
      });
      applySceneChange(next as SceneDocument, selectedId());
      setPrefabPropertyName("");
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function removePrefabPropertyFromDocument(name: string) {
    const current = scene();
    if (!current || current.sceneType !== "PREFAB") return;
    try {
      applySceneChange(removePrefabProperty(current as PrefabDocument, name) as SceneDocument, selectedId());
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function updatePrefabPropertyDefault(name: string, patch: Partial<PrefabProperty>) {
    const current = scene();
    if (!current || current.sceneType !== "PREFAB") return;
    try {
      applySceneChange(updatePrefabProperty(current as PrefabDocument, name, patch) as SceneDocument, selectedId());
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }


  async function saveActiveDocument() {
    if (layout().bottomTab === "Animation" && animationDocument()) return saveAnimationFile();
    if (layout().bottomTab === "Components" && componentDocument()) return saveUserComponentsFile();
    return saveScene();
  }

  async function saveScene(): Promise<boolean> {
    const current = scene();
    const path = scenePath();
    if (!current || !path || saving()) return false;

    setSaving(true);
    try {
      const content = formatSceneContent(current);
      await writeProjectFile(path, content);
      setSavedContent(content);
      if (current.sceneType === "PREFAB") {
        setPrefabCatalog((catalog) => catalog.map((item) => item.path === path ? { path, document: current as PrefabDocument } : item));
      }
      log("success", `Saved ${path}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", `Save failed: ${message}`);
      setLoadError(message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateSelectedProperty(key: string, value: string | number | boolean) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      const patch = { [key]: value };
      applySceneChange(updateSceneObject(current, selected.id, patch));
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    }
  }

  function updateObjectProperties(id: string, patch: Record<string, number>) {
    const current = scene();
    if (!current) return;
    try {
      const next = updateSceneObject(current, id, patch) as SceneDocument;
      applySceneChange(next, id);
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    }
  }

  function addFxToSelected(type: FxType) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      applySceneChange(addSceneObjectFx(current, selected.id, type), selected.id);
      log("info", `Added ${type} effect to ${selected.name}`);
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    }
  }

  function updateSelectedFx(id: string, patch: Partial<FxObject>) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      applySceneChange(updateSceneObjectFx(current, selected.id, id, patch), selected.id);
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    }
  }

  function removeSelectedFx(id: string) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      applySceneChange(removeSceneObjectFx(current, selected.id, id), selected.id);
      log("info", `Removed FX ${id}`);
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    }
  }

  function updateSelectedNumber(key: string, event: Event & { currentTarget: HTMLInputElement }) {
    const value = Number(event.currentTarget.value);
    if (!Number.isFinite(value)) return;
    updateSelectedProperty(key, value);
  }

  function addObject(kind: "Image" | "Text" | "Container") {
    const current = scene();
    if (!current) return;
    const next = createSceneObject(current, kind) as SceneDocument;
    const created = getSceneObjects(next).at(-1);
    applySceneChange(next, created?.id ?? selectedId());
    setShowObjectMenu(false);
    log("info", `Created ${kind}`);
  }

  function deleteSelectedObject() {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    const next = removeSceneObject(current, selected.id);
    const remaining = getSceneObjects(next);
    applySceneChange(next, remaining[0]?.id ?? null);
    log("info", `Removed ${selected.name}`);
  }

  function startResize(
    kind: "left" | "right" | "bottom" | "console",
    event: PointerEvent & { currentTarget: HTMLDivElement },
  ) {
    event.preventDefault();
    const current = layout();
    resizeState = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      initialValue:
        kind === "left"
          ? current.leftWidth
          : kind === "right"
            ? current.rightWidth
            : kind === "bottom"
              ? current.bottomHeight
              : current.consoleHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: PointerEvent) {
    if (!resizeState || (event.buttons !== 1 && event.pointerType !== "touch")) return;
    const { kind, startX, startY, initialValue } = resizeState;
    if (kind === "left") {
      setLayout((current) => ({
        ...current,
        leftWidth: Math.min(360, Math.max(170, initialValue + event.clientX - startX)),
      }));
    } else if (kind === "right") {
      setLayout((current) => ({
        ...current,
        rightWidth: Math.min(420, Math.max(210, initialValue + startX - event.clientX)),
      }));
    } else if (kind === "bottom") {
      setLayout((current) => ({
        ...current,
        bottomHeight: Math.min(420, Math.max(150, initialValue + startY - event.clientY)),
      }));
    } else {
      setLayout((current) => ({
        ...current,
        consoleHeight: Math.min(180, Math.max(56, initialValue + startY - event.clientY)),
      }));
    }
  }

  function endResize() {
    resizeState = undefined;
  }

  function handlePanelDragStart(event: DragEvent, panel: string) {
    const dockPanel = panel as BottomTab;
    setDraggedDockPanel(dockPanel);
    event.dataTransfer?.setData("text/plain", panel);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handlePanelDragEnd() {
    setDraggedDockPanel(null);
    setDockTargetActive(false);
  }

  function handleConsoleDragStart(event: DragEvent) {
    handlePanelDragStart(event, "Console");
  }

  function dockSidePanel(panel: SidePanelId, announce = true) {
    const node = panel === "Hierarchy" ? hierarchyPanelElement : inspectorPanelElement;
    if (!node || !bottomDockedContent) {
      log("error", `Cannot dock ${panel}: panel mount is unavailable.`);
      return;
    }
    if (!layout().dockedPanels.includes(panel)) {
      bottomDockedContent.appendChild(node);
      node.classList.add("bottom-docked-panel");
      setLayout((current) => ({
        ...current,
        dockedPanels: [...current.dockedPanels, panel],
        bottomTab: panel,
      }));
      if (announce) log("success", `${panel} docked into Bottom workspace`);
    } else {
      setLayout((current) => ({ ...current, bottomTab: panel }));
    }
  }

  function undockSidePanel(panel: SidePanelId) {
    if (!layout().dockedPanels.includes(panel)) return;
    const node = panel === "Hierarchy" ? hierarchyPanelElement : inspectorPanelElement;
    const home = panel === "Hierarchy" ? hierarchyHomeSlot : inspectorHomeSlot;
    if (node && home) {
      home.appendChild(node);
      node.classList.remove("bottom-docked-panel");
    }
    setLayout((current) => ({
      ...current,
      dockedPanels: current.dockedPanels.filter((item) => item !== panel),
      bottomTab: current.bottomTab === panel ? "Project" : current.bottomTab,
    }));
    log("info", `${panel} returned to its default panel`);
  }

  function toggleSidePanel(panel: SidePanelId) {
    if (layout().dockedPanels.includes(panel)) undockSidePanel(panel);
    const key = panel === "Hierarchy" ? "hierarchyVisible" : "inspectorVisible";
    setLayout((current) => ({ ...current, [key]: !current[key] }));
  }

  function resetWorkbenchLayout() {
    undockSidePanel("Hierarchy");
    undockSidePanel("Inspector");
    setLayout(defaultLayout(compactWorkbench()));
  }

  function startBottomTabPointerDrag(event: PointerEvent & { currentTarget: HTMLButtonElement }, tab: BottomTab) {
    if (event.button !== 0) return;
    bottomTabPointerDrag = { panel: tab, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveBottomTabPointerDrag(event: PointerEvent) {
    const drag = bottomTabPointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 6) {
      drag.active = true;
      setDraggedDockPanel(drag.panel);
      setDockTargetActive(true);
    }
  }

  function endBottomTabPointerDrag(event: PointerEvent) {
    const drag = bottomTabPointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    bottomTabPointerDrag = undefined;
    if (drag.active) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-dock-tab]");
      const targetTab = target?.dataset.dockTab as BottomTab | undefined;
      if (targetTab) reorderBottomTab(drag.panel, targetTab);
      suppressDockTabClick = true;
      event.preventDefault();
    }
    handlePanelDragEnd();
  }

  function cancelBottomTabPointerDrag(event: PointerEvent) {
    if (!bottomTabPointerDrag || bottomTabPointerDrag.pointerId !== event.pointerId) return;
    bottomTabPointerDrag = undefined;
    handlePanelDragEnd();
  }

  function reorderBottomTab(source: BottomTab, target: BottomTab) {
    if (source === target) return;
    setLayout((current) => {
      const order = [...current.bottomTabOrder];
      const sourceIndex = order.indexOf(source);
      const targetIndex = order.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      order.splice(sourceIndex, 1);
      order.splice(targetIndex, 0, source);
      return { ...current, bottomTabOrder: order, bottomTab: source };
    });
  }

  function handleDockDragOver(event: DragEvent) {
    if (!draggedDockPanel() && !event.dataTransfer?.types.includes("text/plain")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDockTargetActive(true);
  }

  function handleDockDragLeave(event: DragEvent & { currentTarget: HTMLDivElement }) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDockTargetActive(false);
  }

  function handleDockDrop(event: DragEvent, explicitTarget?: BottomTab) {
    const transferredPanel = event.dataTransfer?.getData("text/plain");
    const panel = (transferredPanel || draggedDockPanel()) as BottomTab | null;
    const targetElement = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-dock-tab]")
      : null;
    const targetTab = explicitTarget ?? targetElement?.dataset.dockTab as BottomTab | undefined;
    const bottomTabs: BottomTab[] = ["Project", "Animation", "Components", "Console", "Hierarchy", "Inspector"];
    if (!panel || !bottomTabs.includes(panel)) return;
    event.preventDefault();
    setDockTargetActive(false);
    setDraggedDockPanel(null);
    if ((panel === "Hierarchy" || panel === "Inspector") && !layout().dockedPanels.includes(panel)) {
      dockSidePanel(panel);
      return;
    }
    if (panel === "Console" && !layout().consoleDocked && !compactWorkbench()) {
      setLayout((current) => ({ ...current, consoleDocked: true, bottomTab: "Console" }));
      log("success", "Console docked into Bottom workspace");
      return;
    }
    if (targetTab) reorderBottomTab(panel, targetTab);
  }

  function undockConsole() {
    setLayout((current) => ({ ...current, consoleDocked: false, bottomTab: "Project" }));
    log("info", "Console moved back to its own dock");
  }

  function closePalette(restoreFocus = true) {
    setPaletteOpen(false);
    setPaletteQuery("");
    const focusTarget = previousPaletteFocus;
    previousPaletteFocus = null;
    if (restoreFocus && focusTarget) {
      queueMicrotask(() => {
        if (focusTarget.isConnected) focusTarget.focus({ preventScroll: true });
      });
    }
  }

  function runCommand(command: Command) {
    closePalette();
    command.run();
  }

  function openPalette() {
    if (paletteOpen()) return;
    previousPaletteFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPaletteOpen(true);
    setPaletteQuery("");
    setActiveMenu("");
    setCommandIndex(0);
    queueMicrotask(() => paletteInput?.focus());
  }

  function renameSelectedObject() {
    const selected = selectedObject();
    if (!selected) return;
    const label = window.prompt("Object name", selected.name);
    if (label?.trim()) updateSelectedProperty("label", label.trim());
  }

  function updateFocusContext(target: EventTarget | null) {
    const contextElement = target instanceof HTMLElement
      ? target.closest<HTMLElement>("[data-focus-context]")
      : null;
    const context = contextElement?.dataset.focusContext as FocusContext | undefined;
    setFocusContext(context ?? "global");
  }

  function handleFocusIn(event: FocusEvent) {
    updateFocusContext(event.target);
  }

  function handleContextPointerDown(event: PointerEvent) {
    updateFocusContext(event.target);
  }

  function handleKeyDown(event: KeyboardEvent) {
    const target = event.target;
    const isEditable =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

    if (event.key === "Escape") {
      if (paletteOpen()) closePalette();
      setActiveMenu("");
      setShowObjectMenu(false);
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveActiveDocument();
      return;
    }
    if (modifier && event.key.toLowerCase() === "p") {
      event.preventDefault();
      openPalette();
      return;
    }
    if (isEditable) return;

    if (modifier && event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }

    if (focusContext() !== "scene" && focusContext() !== "hierarchy") return;

    if (event.key === "F2") {
      event.preventDefault();
      renameSelectedObject();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelectedObject();
    } else if (event.key.toLowerCase() === "w") {
      event.preventDefault();
      setTool("move");
    } else if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      setTool("rotate");
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      setTool("scale");
    } else if (event.key.toLowerCase() === "q") {
      event.preventDefault();
      setTool("select");
    }
  }

  function handlePaletteKeyDown(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const focusable = paletteDialog?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable.item(0);
    const last = focusable.item(focusable.length - 1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleWorkbenchResize() {
    const previousCompact = compactWorkbench();
    const nextCompact = window.innerWidth <= 1360;
    if (previousCompact === nextCompact) return;
    setCompactWorkbench(nextCompact);
    setLayout((current) => {
      const previousDefaults = defaultLayout(previousCompact);
      const nextDefaults = defaultLayout(nextCompact);
      return {
        ...current,
        leftWidth: current.leftWidth === previousDefaults.leftWidth ? nextDefaults.leftWidth : current.leftWidth,
        rightWidth: current.rightWidth === previousDefaults.rightWidth ? nextDefaults.rightWidth : current.rightWidth,
        bottomHeight: current.bottomHeight === previousDefaults.bottomHeight ? nextDefaults.bottomHeight : current.bottomHeight,
        consoleHeight: current.consoleHeight === previousDefaults.consoleHeight ? nextDefaults.consoleHeight : current.consoleHeight,
        bottomTab: !nextCompact && current.bottomTab === "Console" ? "Project" : current.bottomTab,
      };
    });
  }

  function readMcpPath(value: unknown, field: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`MCP command requires a non-empty ${field}.`);
    }
    const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
    const segments = normalized.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("MCP project paths must stay inside the selected project.");
    }
    return segments.join("/");
  }

  function captureSceneScreenshot(args: Record<string, unknown>) {
    const source = sceneCanvas;
    if (!source?.isConnected || source.width <= 0 || source.height <= 0) {
      throw new Error("The SolidJS Scene viewport has no ready Phaser Canvas. Switch to Scene view and retry.");
    }

    const coordinate = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
    const x = Math.max(0, Math.min(source.width - 1, coordinate(args.x, 0)));
    const y = Math.max(0, Math.min(source.height - 1, coordinate(args.y, 0)));
    const width = Math.max(1, Math.min(source.width - x, coordinate(args.width, source.width - x)));
    const height = Math.max(1, Math.min(source.height - y, coordinate(args.height, source.height - y)));
    if (width * height > 16_777_216) {
      throw new Error("Scene screenshot region is too large (maximum 16 megapixels).");
    }

    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) throw new Error("Could not allocate a 2D context for the Scene screenshot.");

    try {
      context.drawImage(source, x, y, width, height, 0, 0, width, height);
      const dataUrl = output.toDataURL("image/png");
      const separator = dataUrl.indexOf(",");
      if (separator < 0) throw new Error("The Phaser Canvas returned an invalid PNG data URL.");
      return { __image: true, data: dataUrl.slice(separator + 1), mimeType: "image/png" };
    } finally {
      output.width = 1;
      output.height = 1;
    }
  }

  async function readTextureContentBounds(args: Record<string, unknown>) {
    const relativePath = readMcpPath(args.url, "texture url");
    const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`/editor/project/${encodedPath}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Cannot load texture "${relativePath}" (${response.status}).`);
    }

    const blob = await response.blob();
    if (blob.size > 32 * 1024 * 1024) {
      throw new Error("Texture is too large to inspect (maximum 32 MiB).");
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || width * height > 16_777_216) {
        throw new Error("Texture dimensions are invalid or exceed the 16 megapixel inspection limit.");
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Could not allocate a texture inspection context.");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (pixels[(y * width + x) * 4 + 3] === 0) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        return maxX < 0
          ? { x: 0, y: 0, width: 0, height: 0 }
          : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function refreshProjectTreeFromBridge() {
    try {
      const result = await getProjectFiles();
      setProjectTree(result.rootFile);
      setProjectName(result.rootFile.name);
      log("info", "Project files changed outside the active editor document; Project tree refreshed.");
    } catch (error) {
      log("warning", `Could not refresh the Project tree after an MCP file change: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const editorMcpHandlers: Record<string, EditorMcpHandler> = {
    "ide-get-active-scene": async () => {
      const current = scene();
      const currentPath = scenePath();
      if (!current || !currentPath) throw new Error("There is no Scene document open in the SolidJS Editor Host.");
      const settings = (current as SceneDocument & { settings?: Record<string, unknown> }).settings ?? {};
      return {
        scenePath: currentPath,
        sceneKey: settings.sceneKey,
        sceneId: current.id,
      };
    },
    "ide-open-scene": async (args) => {
      const requestedPath = readMcpPath(args.scenePath, "scenePath");
      const opened = await loadScene(requestedPath);
      if (!opened || scenePath() !== requestedPath) {
        throw new Error(`Scene "${requestedPath}" was not opened. The operation may have been cancelled or the file is invalid.`);
      }
      return `Scene opened in the SolidJS Editor Host: ${requestedPath}`;
    },
    "ide-save-scene": async (args) => {
      const requestedPath = readMcpPath(args.scenePath, "scenePath");
      if (scenePath() !== requestedPath) {
        throw new Error(`Scene "${requestedPath}" is not the active scene in the SolidJS Editor Host. Open it first.`);
      }
      if (!(await saveScene())) throw new Error(`Could not save scene "${requestedPath}".`);
      return `Scene saved: ${requestedPath}`;
    },
    "scene-get-screenshot": async (args) => {
      const requestedPath = args.scenePath === undefined ? scenePath() : readMcpPath(args.scenePath, "scenePath");
      if (!requestedPath || requestedPath !== scenePath()) {
        throw new Error("The requested scene is not open in the SolidJS Scene viewport.");
      }
      return captureSceneScreenshot(args);
    },
    "assets-get-texture-content-bounding-box": readTextureContentBounds,
  };

  onMount(() => {
    for (const panel of layout().dockedPanels) {
      const node = panel === "Hierarchy" ? hierarchyPanelElement : inspectorPanelElement;
      if (node && bottomDockedContent) {
        bottomDockedContent.appendChild(node);
        node.classList.add("bottom-docked-panel");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleWorkbenchResize);
    disposeEditorMcpBridge = connectEditorMcpBridge(editorMcpHandlers, {
      onStatus: (status, message) => {
        if (status === "connected") log("success", "SolidJS Editor Host MCP session connected.");
        else if (status === "disconnected") log("warning", message || "SolidJS Editor Host MCP session disconnected.");
      },
      onError: (message) => log("error", `MCP bridge: ${message}`),
      onFilesChanged: refreshProjectTreeFromBridge,
    });
    void loadProject();
  });

  onCleanup(() => {
    disposeEditorMcpBridge?.();
    disposeEditorMcpBridge = undefined;
    sceneCanvas = null;
    stopAnimationPreview(false);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", handleWorkbenchResize);
  });

  const currentObject = () => selectedObject()?.source;
  const activeAnimation = createMemo(() => animationDocument()?.anims.find((item) => item.key === selectedAnimationKey()));
  const animationTimeScale = createMemo(() => animationDocument()?.globalTimeScale ?? 1);
  const animationCycleDurationMs = createMemo(() => {
    const animation = activeAnimation();
    return animation ? getAnimationDurationMs(animation, animationTimeScale()) : 0;
  });
  const animationDurationLabel = createMemo(() => {
    const duration = animationCycleDurationMs();
    return `${(duration / 1000).toFixed(2)} s`;
  });
  const animationFrameSegments = createMemo(() => {
    const animation = activeAnimation();
    if (!animation) return [];
    let offsetMs = 0;
    let offsetPx = 0;
    return animation.frames.map((frame, index) => {
      const durationMs = getAnimationFrameDurationMs(animation, frame, animationTimeScale());
      const widthPx = Math.max(64, Math.min(220, durationMs * 0.8));
      const segment = { frame, index, startMs: offsetMs, durationMs, leftPx: offsetPx, widthPx };
      offsetMs += durationMs;
      offsetPx += widthPx;
      return segment;
    });
  });
  const animationTimelineWidth = createMemo(() =>
    animationFrameSegments().reduce((width, segment) => width + segment.widthPx, 0),
  );
  const animationPosition = createMemo(() => {
    const animation = activeAnimation();
    return animation
      ? getAnimationTimelinePosition(animation, animationPlayheadMs(), animationTimeScale())
      : null;
  });
  const animationPlayheadLeftPx = createMemo(() => {
    const position = animationPosition();
    const segment = animationFrameSegments().find((item) => item.index === position?.frameIndex);
    return segment ? segment.leftPx + segment.widthPx * (position?.progress ?? 0) : 0;
  });
  const animationPreviewFrame = createMemo(() =>
    activeAnimation()?.frames[animationPreviewFrameIndex()] ?? null,
  );
  const animationPreviewAsset = createMemo(() => {
    const frame = animationPreviewFrame();
    return frame ? animationAssetSources().find((asset) => asset.key === frame.key) : undefined;
  });
  const selectedAnimationFrame = createMemo(() =>
    activeAnimation()?.frames[selectedAnimationFrameIndex()] ?? null,
  );
  const animationRulerTicks = createMemo(() => {
    const duration = animationCycleDurationMs();
    return Array.from({ length: 5 }, (_, index) => ({
      index,
      position: index * 25,
      label: `${(duration * index / 4 / 1000).toFixed(2)}s`,
    }));
  });

  function pauseAnimationPreview() {
    if (animationPlaybackRaf) cancelAnimationFrame(animationPlaybackRaf);
    animationPlaybackRaf = 0;
    animationPlaybackLastTimestamp = 0;
    setAnimationPlaying(false);
  }

  function selectAnimationFrame(index: number) {
    const segment = animationFrameSegments().find((item) => item.index === index);
    if (!segment) return;
    pauseAnimationPreview();
    setSelectedAnimationFrameIndex(index);
    setAnimationPreviewFrameIndex(index);
    setAnimationPlayheadMs(segment.startMs);
  }

  function playAnimationPreview() {
    const animation = activeAnimation();
    if (!animation?.frames.length) return;
    pauseAnimationPreview();

    const currentPosition = getAnimationTimelinePosition(animation, animationPlayheadMs(), animationTimeScale());
    animationPlaybackElapsed = currentPosition.completed ? 0 : animationPlayheadMs();
    setAnimationPlayheadMs(animationPlaybackElapsed);
    const initialPosition = getAnimationTimelinePosition(animation, animationPlaybackElapsed, animationTimeScale());
    setAnimationPreviewFrameIndex(Math.max(0, initialPosition.frameIndex));
    setAnimationPlaying(true);

    const tick = (timestamp: number) => {
      if (!animationPlaying()) {
        animationPlaybackRaf = 0;
        return;
      }
      if (!animationPlaybackLastTimestamp) animationPlaybackLastTimestamp = timestamp;
      const delta = Math.min(100, Math.max(0, timestamp - animationPlaybackLastTimestamp));
      animationPlaybackLastTimestamp = timestamp;
      animationPlaybackElapsed += delta;

      const position = getAnimationTimelinePosition(animation, animationPlaybackElapsed, animationTimeScale());
      setAnimationPlayheadMs(position.completed ? position.totalDurationMs : animationPlaybackElapsed);
      setAnimationPreviewFrameIndex(Math.max(0, position.frameIndex));

      if (position.completed) {
        animationPlaybackRaf = 0;
        animationPlaybackLastTimestamp = 0;
        setAnimationPlaying(false);
        return;
      }
      animationPlaybackRaf = requestAnimationFrame(tick);
    };

    animationPlaybackRaf = requestAnimationFrame(tick);
  }

  function seekAnimationTimeline(positionMs: number) {
    const animation = activeAnimation();
    if (!animation) return;
    pauseAnimationPreview();
    const nextPosition = Math.max(0, Math.min(animationCycleDurationMs(), positionMs));
    const framePosition = getAnimationTimelinePosition(animation, nextPosition, animationTimeScale());
    setAnimationPlayheadMs(nextPosition);
    setAnimationPreviewFrameIndex(Math.max(0, framePosition.frameIndex));
    setSelectedAnimationFrameIndex(Math.max(0, framePosition.frameIndex));
  }

  function handleAnimationFrameDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    const sourceIndex = Number(event.dataTransfer?.getData("text/plain"));
    const animation = activeAnimation();
    if (!animation || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= animation.frames.length) return;
    if (sourceIndex === targetIndex) return;
    const current = animationDocument();
    if (!current) return;
    try {
      setAnimationDocument(moveAnimationFrame(current, animation.key, sourceIndex, targetIndex));
      setSelectedAnimationFrameIndex(targetIndex);
      setAnimationPreviewFrameIndex(targetIndex);
      pauseAnimationPreview();
    } catch (error) {
      log("error", `Could not reorder animation frames: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const components = () => {
    const value = currentObject()?.components;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  };

  const selectedComponentDefinitions = createMemo(() =>
    componentRegistry().filter((item) => components().includes(item.definition.name)),
  );
  const hasUnattachedComponents = createMemo(() =>
    componentRegistry().filter((item) => !components().includes(item.definition.name)),
  );
  const selectedPrefab = createMemo(() => {
    const current = scene();
    if (current?.sceneType === "PREFAB") return { path: scenePath(), document: current as PrefabDocument };
    const prefabId = selectedObject()?.source.prefabId;
    return prefabId ? prefabCatalog().find((item) => item.document.id === prefabId) : undefined;
  });
  const selectedPrefabDefinition = createMemo(() => selectedPrefab()?.document ?? null);





  const menuItems: Record<string, Array<{ label: string; shortcut?: string; action: () => void; disabled?: boolean }>> = {
    File: [
      { label: "Save active document", shortcut: "Ctrl+S", action: () => void saveActiveDocument(), disabled: !scene() && !animationDocument() && !componentDocument() },
      { label: "Save Animation", action: () => void saveAnimationFile(), disabled: !animationDocument() || !animationDirty() },
      { label: "Save User Components", action: () => void saveUserComponentsFile(), disabled: !componentDocument() || !componentDirty() },
      { label: "New Animation file", action: () => void createAnimationFile() },
      { label: "New User Components file", action: () => void createUserComponentsFile() },
      { label: "Reload scene from disk", action: () => scenePath() && void loadScene(scenePath(), true), disabled: !scenePath() },
    ],
    Edit: [
      { label: "Undo", shortcut: "Ctrl+Z", action: undo, disabled: historyIndex() <= 0 },
      { label: "Redo", shortcut: "Ctrl+Shift+Z", action: redo, disabled: historyIndex() < 0 || historyIndex() >= history().length - 1 },
      { label: "Command palette", shortcut: "Ctrl+P", action: openPalette },
      { label: "Delete selected object", shortcut: "Del", action: deleteSelectedObject, disabled: !selectedObject() },
      { label: "Create Prefab from selected object", action: () => void createPrefabFromSelected(), disabled: !selectedObject() || scene()?.sceneType === "PREFAB" },
    ],
    View: [
      { label: `${layout().hierarchyVisible ? "Hide" : "Show"} Hierarchy`, action: () => setLayout((current) => ({ ...current, hierarchyVisible: !current.hierarchyVisible })) },
      { label: `${layout().inspectorVisible ? "Hide" : "Show"} Inspector`, action: () => setLayout((current) => ({ ...current, inspectorVisible: !current.inspectorVisible })) },
      { label: "Toggle light / dark theme", action: toggleTheme },
      { label: "Reset workspace layout", action: () => setLayout(defaultLayout(compactWorkbench())) },
    ],
    Window: [
      { label: "Project", action: () => setLayout((current) => ({ ...current, bottomTab: "Project" })) },
      { label: "Animation", action: () => setLayout((current) => ({ ...current, bottomTab: "Animation" })) },
      { label: "Components", action: () => setLayout((current) => ({ ...current, bottomTab: "Components" })) },
      { label: "Console", action: () => {
        if (compactWorkbench() || layout().consoleDocked) setLayout((current) => ({ ...current, bottomTab: "Console" }));
        else document.querySelector(".desktop-console-panel")?.scrollIntoView({ block: "nearest" });
      } },
    ],
    Help: [
      { label: "Editor Host architecture", action: () => log("info", "SolidJS Host · legacy Colibri remains available at /editor/") },
    ],
  };

  return (
    <div
      class="workbench"
      data-testid="workbench"
      data-layout={compactWorkbench() ? "compact" : "wide"}
      classList={{
        "hierarchy-hidden": !layout().hierarchyVisible || layout().dockedPanels.includes("Hierarchy"),
        "inspector-hidden": !layout().inspectorVisible || layout().dockedPanels.includes("Inspector"),
      }}
      style={{
        "--left-panel": `${layout().leftWidth}px`,
        "--right-panel": `${layout().rightWidth}px`,
        "--bottom-panel": `${layout().bottomHeight}px`,
        "--console-height": `${layout().consoleHeight}px`,
      }}
      onPointerMove={moveResize}
      onPointerUp={endResize}
      onPointerCancel={endResize}
      onFocusIn={handleFocusIn}
      onPointerDown={handleContextPointerDown}
    >
      <header class="app-header">
        <div class="title-bar">
          <div class="brand-mark" aria-hidden="true"><span /></div>
          <span class="brand-name">CODOGMA</span>
          <span class="brand-descriptor">ENGINE</span>
          <span class="title-divider" />
          <span class="project-title">{projectName()}</span>
          <span class="branch-badge">DEV</span>
          <span class="document-title">{scenePath().split("/").pop() ?? "No scene"}</span>
          <span class="saved-indicator" classList={{ dirty: dirty() }}>
            <span class="saved-dot" />
            {saving() || animationSaving() || componentSaving() ? "Saving" : documentDirty() ? "Unsaved changes" : "Saved"}
          </span>
          <span class="editor-version">EDITOR HOST</span>
        </div>

        <div class="menu-bar" role="menubar" aria-label="Main menu">
          <For each={Object.keys(menuItems)}>
            {(menu) => (
              <div class="menu-root">
                <button
                  class="menu-button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={activeMenu() === menu}
                  onClick={() => setActiveMenu((current) => current === menu ? "" : menu)}
                  onMouseEnter={() => activeMenu() && setActiveMenu(menu)}
                >
                  {menu}
                </button>
                <Show when={activeMenu() === menu}>
                  <div class="menu-popover" role="menu">
                    <For each={menuItems[menu]}>
                      {(item) => (
                        <button
                          class="menu-item"
                          role="menuitem"
                          disabled={item.disabled}
                          onClick={() => {
                            setActiveMenu("");
                            item.action();
                          }}
                        >
                          <span>{item.label}</span>
                          <Show when={item.shortcut}><kbd>{item.shortcut}</kbd></Show>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
          <div class="menu-spacer" />
          <button class="menu-utility" aria-label="Command palette" onClick={openPalette} title="Command palette · Ctrl+P">
            <Icon theme={theme()} name="search" size={13} />
            <span>Search commands</span>
            <kbd>Ctrl P</kbd>
          </button>
        </div>

        <div class="main-toolbar">
          <div class="toolbar-group">
            <button
              class="toolbar-button"
              data-testid="save-scene"
              disabled={!scene() || saving() || !dirty()}
              onClick={() => void saveScene()}
              title="Save scene · Ctrl+S"
            >
              <Icon theme={theme()} name="save" />
              <span>Save</span>
            </button>
            <span class="toolbar-divider" />
            <button class="toolbar-icon-button" data-testid="undo" disabled={historyIndex() <= 0} onClick={undo} title="Undo · Ctrl+Z">
              <Icon theme={theme()} name="undo-redo" />
            </button>
            <button class="toolbar-icon-button" data-testid="redo" disabled={historyIndex() < 0 || historyIndex() >= history().length - 1} onClick={redo} title="Redo · Ctrl+Shift+Z">
              <Icon theme={theme()} name="undo-redo" />
            </button>
          </div>

          <span class="toolbar-divider" />

          <div class="toolbar-group tool-group" role="toolbar" aria-label="Scene tools">
            <button class="toolbar-icon-button" classList={{ active: tool() === "select" }} aria-label="Select tool" aria-pressed={tool() === "select"} onClick={() => setTool("select")} title="Select · Q">
              <Icon theme={theme()} name="tool-select" />
            </button>
            <button class="toolbar-icon-button" classList={{ active: tool() === "move" }} aria-label="Move tool" aria-pressed={tool() === "move"} onClick={() => setTool("move")} title="Move · W">
              <Icon theme={theme()} name="tool-move" />
            </button>
            <button class="toolbar-icon-button" classList={{ active: tool() === "rotate" }} aria-label="Rotate tool" aria-pressed={tool() === "rotate"} onClick={() => setTool("rotate")} title="Rotate · E">
              <Icon theme={theme()} name="tool-rotate" />
            </button>
            <button class="toolbar-icon-button" classList={{ active: tool() === "scale" }} aria-label="Scale tool" aria-pressed={tool() === "scale"} onClick={() => setTool("scale")} title="Scale · R">
              <Icon theme={theme()} name="tool-scale" />
            </button>
          </div>

          <span class="toolbar-divider" />

          <div class="toolbar-group play-group">
            <button
              class="play-button"
              data-testid="open-game-view"
              onClick={() => {
                setActiveViewport("Game");
                setGameLoaded(false);
              }}
              title="Open existing Phaser game output"
            >
              <Icon theme={theme()} name="play" size={15} />
              <span>Play</span>
            </button>
            <button
              class="toolbar-icon-button"
              aria-label="Restart Game view"
              onClick={() => {
                setGameInstance((value) => value + 1);
                setActiveViewport("Game");
                setGameLoaded(false);
              }}
              title="Restart Game view"
            >
              <Icon theme={theme()} name="reload" />
            </button>
            <button
              class="toolbar-icon-button"
              aria-label="Stop Game view"
              onClick={() => {
                setActiveViewport("Scene");
                setGameLoaded(false);
              }}
              title="Stop and dispose Game view"
            >
              <Icon theme={theme()} name="stop" />
            </button>
          </div>

          <div class="toolbar-spacer" />
          <button class="toolbar-icon-button" aria-label="Toggle theme" onClick={toggleTheme} title="Toggle light / dark theme">
            <span class="theme-symbol">{theme() === "dark" ? "☼" : "◐"}</span>
          </button>
          <button class="toolbar-icon-button" aria-label="Reset layout" onClick={resetWorkbenchLayout} title="Reset workspace layout">
            <Icon theme={theme()} name="reload" />
          </button>
        </div>
      </header>

      <div class="workspace-row">
        <Show when={layout().hierarchyVisible}>
          <div class="panel-home-slot" ref={(element) => { hierarchyHomeSlot = element; }}>
          <aside ref={(element) => { hierarchyPanelElement = element; }} class="panel hierarchy-panel" data-testid="hierarchy-panel" data-focus-context="hierarchy" data-dock-panel="Hierarchy">
            <PanelHeader title="Hierarchy" icon="file-tree" theme={theme()} trailing={sceneObjects().length ? String(sceneObjects().length) : "—"} onDragStart={(event) => handlePanelDragStart(event, "Hierarchy")} onUndock={() => undockSidePanel("Hierarchy")} />
            <div class="panel-toolbar">
              <label class="search-control">
                <Icon theme={theme()} name="search" size={13} />
                <input
                  aria-label="Search hierarchy"
                  placeholder="Search objects…"
                  value={hierarchySearch()}
                  onInput={(event) => setHierarchySearch(event.currentTarget.value)}
                />
                <Show when={hierarchySearch()}>
                  <button aria-label="Clear hierarchy search" onClick={() => setHierarchySearch("")}>×</button>
                </Show>
              </label>
              <div class="add-object-anchor">
                <button class="small-square-button" aria-label="Add object" aria-expanded={showObjectMenu()} onClick={() => setShowObjectMenu((value) => !value)}>
                  <Icon theme={theme()} name="add" size={14} />
                </button>
                <Show when={showObjectMenu()}>
                  <div class="add-object-menu">
                    <button onClick={() => addObject("Image")}><Icon theme={theme()} name="sprite-2d" size={14} /> Image</button>
                    <button onClick={() => addObject("Text")}><Icon theme={theme()} name="text-file" size={14} /> Text</button>
                    <button onClick={() => addObject("Container")}><Icon theme={theme()} name="container" size={14} /> Container</button>
                  </div>
                </Show>
              </div>
            </div>
            <div class="hierarchy-tree" role="tree" aria-label="Scene hierarchy">
              <Show when={scene()} fallback={<div class="empty-panel-hint">Open a scene to see its objects.</div>}>
                <div class="scene-root-row">
                  <Icon theme={theme()} name="packed-scene" size={14} />
                  <span>{scenePath().split("/").pop()}</span>
                  <span class="scene-root-count">{sceneObjects().length}</span>
                </div>
                <For each={visibleSceneObjects()}>
                  {(entry) => (
                    <div class="hierarchy-entry">
                      <button
                        class="hierarchy-row"
                        role="treeitem"
                        data-testid={`hierarchy-item-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        aria-selected={selectedId() === entry.id}
                        aria-level={entry.depth + 1}
                        classList={{ selected: selectedId() === entry.id, locked: lockedObjects().has(entry.id) }}
                        onClick={() => setSelectedId(entry.id)}
                        onDblClick={() => {
                          const nextName = window.prompt("Object name", entry.name);
                          if (nextName?.trim()) updateSelectedProperty("label", nextName.trim());
                        }}
                      >
                        <span class="hierarchy-indent" style={{ width: `${8 + entry.depth * 14}px` }} />
                        <Icon
                          theme={theme()}
                          name={
                            entry.type === "Image"
                              ? "sprite-2d"
                              : entry.type === "Text"
                                ? "label"
                                : entry.type === "Prefab"
                                  ? "packed-scene"
                                  : entry.type === "Container"
                                    ? "container"
                                    : "node-2d"
                          }
                          size={14}
                        />
                        <span class="hierarchy-label">{entry.name}</span>
                        <span class="hierarchy-row-actions">
                          <span
                            role="button"
                            tabIndex={0}
                            class="tree-action"
                            aria-label={hiddenObjects().has(entry.id) ? `Show ${entry.name}` : `Hide ${entry.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setHiddenObjects((current) => {
                                const next = new Set(current);
                                if (next.has(entry.id)) next.delete(entry.id);
                                else next.add(entry.id);
                                return next;
                              });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setHiddenObjects((current) => {
                                  const next = new Set(current);
                                  if (next.has(entry.id)) next.delete(entry.id);
                                  else next.add(entry.id);
                                  return next;
                                });
                              }
                            }}
                          >
                            <Icon theme={theme()} name={hiddenObjects().has(entry.id) ? "gui-visibility-hidden" : "gui-visibility-visible"} size={12} />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            class="tree-action"
                            aria-label={lockedObjects().has(entry.id) ? `Unlock ${entry.name}` : `Lock ${entry.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setLockedObjects((current) => {
                                const next = new Set(current);
                                if (next.has(entry.id)) next.delete(entry.id);
                                else next.add(entry.id);
                                return next;
                              });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setLockedObjects((current) => {
                                  const next = new Set(current);
                                  if (next.has(entry.id)) next.delete(entry.id);
                                  else next.add(entry.id);
                                  return next;
                                });
                              }
                            }}
                          >
                            <Icon theme={theme()} name={lockedObjects().has(entry.id) ? "lock" : "unlock"} size={12} />
                          </span>
                        </span>
                      </button>
                    </div>
                  )}
                </For>
                <Show when={visibleSceneObjects().length === 0}>
                  <div class="empty-panel-hint">No objects match this search.</div>
                </Show>
              </Show>
            </div>
            <div class="panel-footer">
              <span>{sceneObjects().length} objects</span>
              <span>Scene tree</span>
            </div>
          </aside>
          </div>
        </Show>

        <Show when={layout().hierarchyVisible && !layout().dockedPanels.includes("Hierarchy")}>
          <div
            class="vertical-splitter"
            data-testid="splitter-hierarchy"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Hierarchy panel"
            onPointerDown={(event) => startResize("left", event)}
          />
        </Show>

        <main class="center-workspace">
          <div class="viewport-panel panel">
            <div class="viewport-tabs" role="tablist" aria-label="Viewport">
              <button
                class="viewport-tab"
                role="tab"
                aria-selected={activeViewport() === "Scene"}
                classList={{ active: activeViewport() === "Scene" }}
                onClick={() => setActiveViewport("Scene")}
              >
                <Icon theme={theme()} name="tool-select" size={13} />
                Scene
              </button>
              <button
                class="viewport-tab"
                role="tab"
                aria-selected={activeViewport() === "Game"}
                classList={{ active: activeViewport() === "Game" }}
                onClick={() => setActiveViewport("Game")}
              >
                <Icon theme={theme()} name="play-scene" size={13} />
                Game
              </button>
              <div class="viewport-tab-spacer" />
              <span class="viewport-resolution">{activeViewport() === "Scene" ? "800 × 600" : "LIVE GAME"}</span>
              <span class="viewport-status"><span class="status-led" />{activeViewport() === "Scene" ? "Edit mode" : gameLoaded() ? "Runtime loaded" : "Starting runtime"}</span>
            </div>

            <div class="scene-view-pane" classList={{ inactive: activeViewport() !== "Scene" }} aria-hidden={activeViewport() !== "Scene"} tabIndex={0} data-focus-context="scene" onPointerDown={(event) => { const target = event.target as HTMLElement; if (!target.closest("button, input, textarea, select, [role=button]")) event.currentTarget.focus({ preventScroll: true }); }}>
              <div class="scene-controls">
                <div class="scene-control-group">
                  <span class="scene-control-muted">Scene</span>
                  <span class="scene-control-divider" />
                  <span class="scene-control-value">{scenePath().split("/").pop() ?? "No scene"}</span>
                </div>
                <div class="scene-control-group">
                  <span class="scene-control-muted">Phaser Canvas</span>
                  <span class="scene-control-divider" />
                  <span class="scene-control-muted">800 × 600</span>
                </div>
              </div>
              <Show when={scene()} fallback={<div class="viewport-empty">Open a scene from the Project panel.</div>}>
                {(currentScene) => (
                  <PhaserSceneViewport
                    scene={currentScene()}
                    scenePath={scenePath()}
                    selectedId={selectedId()}
                    projectTree={projectTree()}
                    theme={theme()}
                    active={activeViewport() === "Scene"}
                    tool={() => tool()}
                    hiddenIds={() => hiddenObjects()}
                    lockedIds={() => lockedObjects()}
                    onSelect={setSelectedId}
                    onTransform={updateObjectProperties}
                    onStatus={log}
                    onCanvasReady={(canvas) => { sceneCanvas = canvas; }}
                  />
                )}
              </Show>
              <div class="viewport-statusbar">
                <span><Icon theme={theme()} name="tool-select" size={12} /> {tool().charAt(0).toUpperCase() + tool().slice(1)} tool</span>
                <span>Selected: {selectedObject()?.name ?? "None"}</span>
                <span>Phaser runtime · live selection</span>
              </div>
            </div>

            <Show when={activeViewport() === "Game"}>
              <div class="game-viewport" data-testid="game-viewport">
                <div class="game-view-note">
                  <span class="runtime-dot" />
                  Existing project output · `/editor/external/index.html`
                  <span class="game-view-note-spacer" />
                  <button class="small-square-button" onClick={() => { setGameInstance((value) => value + 1); setGameLoaded(false); }} aria-label="Reload Phaser runtime">
                    <Icon theme={theme()} name="reload" size={13} />
                  </button>
                </div>
                <iframe
                  data-testid="phaser-game-frame"
                  title="Existing Phaser game runtime"
                  src={`/editor/external/index.html?restart=${gameInstance()}`}
                  onLoad={() => {
                    setGameLoaded(true);
                    log("success", "Phaser game iframe loaded");
                  }}
                />
                <div class="game-view-caption">Game View loads the existing generated game output. Scene edits are saved to .scene and do not regenerate game.js automatically.</div>
              </div>
            </Show>
          </div>
        </main>

        <Show when={layout().inspectorVisible}>
          <div class="panel-home-slot" ref={(element) => { inspectorHomeSlot = element; }}>
          <Show when={!layout().dockedPanels.includes("Inspector")}>
          <div
            class="vertical-splitter"
            data-testid="splitter-inspector"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Inspector panel"
            onPointerDown={(event) => startResize("right", event)}
          />
          </Show>
          <aside ref={(element) => { inspectorPanelElement = element; }} class="panel inspector-panel" data-testid="inspector-panel" data-focus-context="inspector" data-dock-panel="Inspector">
            <PanelHeader title="Inspector" icon="editor-inspector" theme={theme()} trailing={selectedObject() ? selectedObject()!.type : "—"} onDragStart={(event) => handlePanelDragStart(event, "Inspector")} onUndock={() => undockSidePanel("Inspector")} />
            <Show when={selectedObject()} fallback={<div class="inspector-empty"><Icon theme={theme()} name="node-2d" size={24} /><strong>No object selected</strong><span>Select an object in Hierarchy or Scene.</span></div>}>
              <div class="inspector-scroll">
                <div class="inspector-object-heading">
                  <div class="inspector-object-icon">
                    <Icon theme={theme()} name={selectedObject()?.type === "Image" ? "sprite-2d" : selectedObject()?.type === "Text" ? "label" : "node-2d"} size={20} />
                  </div>
                  <div class="inspector-object-name">
                    <input
                      aria-label="Object name"
                      value={selectedObject()?.name ?? ""}
                      onChange={(event) => updateSelectedProperty("label", event.currentTarget.value)}
                    />
                    <span>{selectedObject()?.type ?? "Object"} · {selectedObject()?.id.slice(0, 8)}</span>
                  </div>
                </div>

                <section class="inspector-section">
                  <div class="inspector-section-heading">
                    <span>Transform</span>
                    <span class="section-heading-actions"><span class="component-state">●</span><Icon theme={theme()} name="anchor" size={12} /></span>
                  </div>
                  <div class="transform-grid">
                    <label class="inspector-field">
                      <span>Position X</span>
                      <input id="transform-x" aria-label="Position X" type="number" step="any" value={String(currentObject()?.x ?? 0)} onChange={(event) => updateSelectedNumber("x", event)} />
                    </label>
                    <label class="inspector-field">
                      <span>Position Y</span>
                      <input id="transform-y" aria-label="Position Y" type="number" step="any" value={String(currentObject()?.y ?? 0)} onChange={(event) => updateSelectedNumber("y", event)} />
                    </label>
                    <label class="inspector-field">
                      <span>Rotation</span>
                      <input aria-label="Rotation" type="number" step="any" value={String(currentObject()?.rotation ?? 0)} onChange={(event) => updateSelectedNumber("rotation", event)} />
                    </label>
                    <span class="field-unit">deg</span>
                    <label class="inspector-field">
                      <span>Scale X</span>
                      <input aria-label="Scale X" type="number" step="any" value={String(currentObject()?.scaleX ?? 1)} onChange={(event) => updateSelectedNumber("scaleX", event)} />
                    </label>
                    <label class="inspector-field">
                      <span>Scale Y</span>
                      <input aria-label="Scale Y" type="number" step="any" value={String(currentObject()?.scaleY ?? 1)} onChange={(event) => updateSelectedNumber("scaleY", event)} />
                    </label>
                    <label class="inspector-field">
                      <span>Origin X</span>
                      <input aria-label="Origin X" type="number" min="0" max="1" step="0.05" value={String(currentObject()?.originX ?? 0.5)} onChange={(event) => updateSelectedNumber("originX", event)} />
                    </label>
                    <label class="inspector-field">
                      <span>Origin Y</span>
                      <input aria-label="Origin Y" type="number" min="0" max="1" step="0.05" value={String(currentObject()?.originY ?? 0.5)} onChange={(event) => updateSelectedNumber("originY", event)} />
                    </label>
                  </div>
                </section>

                <Show when={selectedObject()?.type === "Image"}>
                  <section class="inspector-section">
                    <div class="inspector-section-heading"><span>Texture</span></div>
                    <div class="inspector-resource-row">
                      <Icon theme={theme()} name="image-texture" size={16} />
                      <span>{String(currentObject()?.texture?.key ?? "Missing texture")}</span>
                      <span class="resource-path">{String(currentObject()?.texture?.key ?? "")}</span>
                    </div>
                  </section>
                </Show>

                <Show when={selectedObject()?.type === "Text"}>
                  <section class="inspector-section">
                    <div class="inspector-section-heading"><span>Text</span></div>
                    <label class="inspector-field full-field">
                      <span>Content</span>
                      <textarea
                        aria-label="Text content"
                        rows={3}
                        value={String(currentObject()?.text ?? "")}
                        onChange={(event) => updateSelectedProperty("text", event.currentTarget.value)}
                      />
                    </label>
                  </section>
                </Show>

                <Show when={selectedObject() && selectedObject()?.type !== "Prefab"}>
                  <FxInspector
                    effects={selectedFxEffects()}
                    unsupportedTypes={selectedUnsupportedFxTypes()}
                    onAdd={addFxToSelected}
                    onUpdate={updateSelectedFx}
                    onRemove={removeSelectedFx}
                    onError={(message) => log("warning", message)}
                  />
                </Show>

                <section class="inspector-section" data-testid="attached-components">
                  <div class="inspector-section-heading">
                    <span>User Components</span>
                    <span class="component-count">{components().length}</span>
                  </div>
                  <Show when={selectedComponentDefinitions().length > 0} fallback={<div class="component-empty">No registered components are attached.</div>}>
                    <For each={selectedComponentDefinitions()}>
                      {(entry) => (
                        <div class="attached-component-card">
                          <div class="component-row">
                            <Icon theme={theme()} name="script" size={13} />
                            <span>{entry.definition.displayName ?? entry.definition.name}</span>
                            <span class="component-state">Enabled</span>
                            <button class="toolbar-icon-button tiny" aria-label={`Detach ${entry.definition.name}`} title="Detach component" onClick={() => detachComponentFromSelected(entry.definition.name)}>
                              <Icon theme={theme()} name="remove" size={11} />
                            </button>
                          </div>
                          <For each={entry.definition.properties ?? []}>
                            {(property) => {
                              const propertyValue = () => currentObject()?.[`${entry.definition.name}.${property.name}`] ?? property.defValue;
                              return (
                                <label class="inspector-field component-property-field">
                                  <span>{property.label ?? property.name}</span>
                                  <Show when={property.type?.id === "boolean"}>
                                    <input type="checkbox" aria-label={`${entry.definition.name} ${property.name}`} checked={Boolean(propertyValue())} onChange={(event) => updateAttachedComponentProperty(entry.definition.name, property.name, event.currentTarget.checked)} />
                                  </Show>
                                  <Show when={property.type?.id === "option"}>
                                    <select aria-label={`${entry.definition.name} ${property.name}`} value={String(propertyValue() ?? "")} onChange={(event) => updateAttachedComponentProperty(entry.definition.name, property.name, event.currentTarget.value)}>
                                      <For each={property.type?.options ?? []}>{(option) => <option value={option}>{option}</option>}</For>
                                    </select>
                                  </Show>
                                  <Show when={property.type?.id !== "boolean" && property.type?.id !== "option"}>
                                    <input aria-label={`${entry.definition.name} ${property.name}`} type={property.type?.id === "number" ? "number" : "text"} value={String(propertyValue() ?? "")} onChange={(event) => {
                                      const value = property.type?.id === "number" ? Number(event.currentTarget.value) : event.currentTarget.value;
                                      if (property.type?.id !== "number" || Number.isFinite(value)) updateAttachedComponentProperty(entry.definition.name, property.name, value);
                                    }} />
                                  </Show>
                                </label>
                              );
                            }}
                          </For>
                        </div>
                      )}
                    </For>
                  </Show>
                  <Show when={components().some((name) => !componentRegistry().some((item) => item.definition.name === name))}>
                    <div class="inspector-note">Some attached components have no matching .components definition file. Their serialized references are preserved.</div>
                  </Show>
                  <Show when={hasUnattachedComponents().length > 0}>
                    <div class="component-attach-row">
                      <select aria-label="User Component to attach" value={componentToAttach()} onChange={(event) => setComponentToAttach(event.currentTarget.value)}>
                        <option value="">Attach component…</option>
                        <For each={hasUnattachedComponents()}>
                          {(entry) => <option value={entry.definition.name}>{entry.definition.displayName ?? entry.definition.name} · {entry.path}</option>}
                        </For>
                      </select>
                      <button class="subtle-button" disabled={!componentToAttach()} onClick={() => attachComponentToSelected(componentToAttach())}>Attach</button>
                    </div>
                  </Show>
                </section>

                <Show when={Boolean(currentObject()?.prefabId)}>
                  <section class="inspector-section" data-testid="prefab-overrides">
                    <div class="inspector-section-heading"><span>Prefab overrides</span></div>
                    <Show when={selectedPrefabDefinition()} fallback={<div class="inspector-note">Prefab asset not found. The prefabId reference remains serialized.</div>}>
                      <strong class="prefab-name">{selectedPrefabDefinition()?.name ?? selectedPrefab()?.path}</strong>
                      <For each={selectedPrefabDefinition()?.prefabProperties ?? []}>
                        {(property) => {
                          const value = () => currentObject()?.[property.name] ?? property.defValue;
                          return (
                            <label class="inspector-field prefab-property-field">
                              <span>{property.label ?? property.name}</span>
                              <Show when={property.type.id === "boolean"}>
                                <input type="checkbox" aria-label={`Prefab override ${property.name}`} checked={Boolean(value())} onChange={(event) => updatePrefabOverride(property, event.currentTarget.checked)} />
                              </Show>
                              <Show when={property.type.id === "option"}>
                                <select aria-label={`Prefab override ${property.name}`} value={String(value() ?? "")} onChange={(event) => updatePrefabOverride(property, event.currentTarget.value)}>
                                  <For each={property.type.options ?? []}>{(option) => <option value={option}>{option}</option>}</For>
                                </select>
                              </Show>
                              <Show when={property.type.id === "string" || property.type.id === "number"}>
                                <input aria-label={`Prefab override ${property.name}`} type={property.type.id === "number" ? "number" : "text"} value={String(value() ?? "")} onChange={(event) => {
                                  const nextValue = property.type.id === "number" ? Number(event.currentTarget.value) : event.currentTarget.value;
                                  if (property.type.id !== "number" || Number.isFinite(nextValue)) updatePrefabOverride(property, nextValue);
                                }} />
                              </Show>
                            </label>
                          );
                        }}
                      </For>
                      <button class="subtle-button" onClick={() => selectedPrefab() && void openProjectFile(selectedPrefab()!.path)}>Open Prefab asset</button>
                    </Show>
                  </section>
                </Show>
              </div>
            </Show>
            <Show when={scene()?.sceneType === "PREFAB"}>
              <section class="inspector-section prefab-properties-editor" data-testid="prefab-properties-editor">
                <div class="inspector-section-heading"><span>Prefab properties</span><span class="component-count">{(scene() as PrefabDocument | null)?.prefabProperties?.length ?? 0}</span></div>
                <div class="prefab-property-create">
                  <label class="inspector-field">
                    <span>Property name</span>
                    <input aria-label="New Prefab property name" value={prefabPropertyName()} onInput={(event) => setPrefabPropertyName(event.currentTarget.value)} />
                  </label>
                  <label class="inspector-field">
                    <span>Type</span>
                    <select aria-label="New Prefab property type" value={prefabPropertyType()} onChange={(event) => setPrefabPropertyType(event.currentTarget.value as "string" | "number" | "boolean" | "option")}>
                      <option value="boolean">Boolean</option>
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="option">Option</option>
                    </select>
                  </label>
                  <label class="inspector-field">
                    <span>{prefabPropertyType() === "option" ? "Options (comma separated)" : "Default value"}</span>
                    <input aria-label="New Prefab property default" value={prefabPropertyDefault()} onInput={(event) => setPrefabPropertyDefault(event.currentTarget.value)} placeholder={prefabPropertyType() === "option" ? "small,medium,large" : "Value"} />
                  </label>
                  <button class="subtle-button" disabled={!prefabPropertyName().trim()} onClick={addPrefabPropertyFromFields}>Add property</button>
                </div>
                <For each={(scene() as PrefabDocument | null)?.prefabProperties ?? []}>
                  {(property) => (
                    <div class="prefab-property-definition-row">
                      <div class="prefab-property-label">
                        <span>{property.label ?? property.name}</span>
                        <code>{property.name}</code>
                      </div>
                      <span>{property.type.id}</span>
                      <Show when={property.type.id === "boolean"}>
                        <input type="checkbox" aria-label={`Prefab default ${property.name}`} checked={Boolean(property.defValue)} onChange={(event) => updatePrefabPropertyDefault(property.name, { defValue: event.currentTarget.checked })} />
                      </Show>
                      <Show when={property.type.id === "option"}>
                        <select aria-label={`Prefab default ${property.name}`} value={String(property.defValue ?? "")} onChange={(event) => updatePrefabPropertyDefault(property.name, { defValue: event.currentTarget.value })}>
                          <For each={property.type.options ?? []}>{(option) => <option value={option}>{option}</option>}</For>
                        </select>
                      </Show>
                      <Show when={property.type.id === "string" || property.type.id === "number"}>
                        <input aria-label={`Prefab default ${property.name}`} type={property.type.id === "number" ? "number" : "text"} value={String(property.defValue ?? "")} onChange={(event) => {
                          const value = property.type.id === "number" ? Number(event.currentTarget.value) : event.currentTarget.value;
                          if (property.type.id !== "number" || Number.isFinite(value)) updatePrefabPropertyDefault(property.name, { defValue: value });
                        }} />
                      </Show>
                      <button class="toolbar-icon-button tiny" aria-label={`Remove Prefab property ${property.name}`} onClick={() => removePrefabPropertyFromDocument(property.name)}>
                        <Icon theme={theme()} name="remove" size={11} />
                      </button>
                    </div>
                  )}
                </For>
              </section>
            </Show>
            <Show when={scene() && scene()?.sceneType !== "PREFAB" && prefabCatalog().length > 0}>
              <div class="inspector-panel-action">
                <label class="inspector-field">
                  <span>Instantiate Prefab</span>
                  <select aria-label="Prefab asset to instantiate" value={selectedPrefabPath()} onChange={(event) => setSelectedPrefabPath(event.currentTarget.value)}>
                    <option value="">Select Prefab…</option>
                    <For each={prefabCatalog()}>{(item) => <option value={item.path}>{item.path}</option>}</For>
                  </select>
                </label>
                <button class="subtle-button" disabled={!selectedPrefabPath()} onClick={addPrefabInstance}>Add instance</button>
              </div>
            </Show>
            <Show when={selectedObject() && scene()?.sceneType !== "PREFAB"}>
              <button class="subtle-button create-prefab-button" onClick={() => void createPrefabFromSelected()}>Create Prefab from selected object</button>
            </Show>
            <div class="inspector-footer">
              <span>{selectedObject() ? "Scene object" : "Inspector"}</span>
              <span>{documentDirty() ? "Modified" : "In sync"}</span>
            </div>
          </aside>
          </div>
        </Show>
      </div>

      <div
        class="horizontal-splitter"
        data-testid="splitter-bottom"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom dock"
        onPointerDown={(event) => startResize("bottom", event)}
      />

      <section
        class="bottom-dock"
        data-testid="bottom-dock"
        classList={{ "console-docked": compactWorkbench() || layout().consoleDocked }}
      >
        <div class="bottom-upper-panel">
          <div
            class="bottom-tabs"
            role="tablist"
            aria-label="Bottom workspace"
            classList={{ "dock-drop-target": dockTargetActive() }}
            onDragOver={handleDockDragOver}
            onDragLeave={handleDockDragLeave}
            onDrop={handleDockDrop}
            onPointerMove={moveBottomTabPointerDrag}
            onPointerUp={endBottomTabPointerDrag}
            onPointerCancel={cancelBottomTabPointerDrag}
          >
            <For each={visibleBottomTabs()}>
              {(tab) => (
                <button
                  class="dock-tab"
                  role="tab"
                  data-dock-tab={tab}
                  aria-selected={bottomTab() === tab}
                  classList={{ active: bottomTab() === tab }}
                  onPointerDown={(event) => startBottomTabPointerDrag(event, tab)}
                  onClick={() => {
                    if (suppressDockTabClick) { suppressDockTabClick = false; return; }
                    setLayout((current) => ({ ...current, bottomTab: tab }));
                  }}
                  title={`Drag to reorder ${tab}`}
                >
                  <Icon theme={theme()} name={tab === "Project" ? "folder" : tab === "Animation" ? "animation" : tab === "Components" ? "script" : tab === "Console" ? "script" : tab === "Hierarchy" ? "file-tree" : "editor-inspector"} size={13} />
                  {tab}
                </button>
              )}
            </For>
            <div class="dock-tabs-spacer" />
            <button class="toolbar-icon-button tiny" aria-label="Hide bottom dock" title="Hide bottom workspace" onClick={() => setLayout((current) => ({ ...current, bottomHeight: 150 }))}>
              <span>−</span>
            </button>
          </div>

          <Show when={bottomTab() === "Project"}>
            <div class="project-browser" data-focus-context="project">
              <div class="project-tree-panel">
                <div class="project-tree-header">
                  <span>ASSETS</span>
                  <label class="search-control project-search">
                    <Icon theme={theme()} name="search" size={12} />
                    <input aria-label="Search project files" placeholder="Search assets…" value={projectSearch()} onInput={(event) => setProjectSearch(event.currentTarget.value)} />
                  </label>
                </div>
                <div class="project-tree-scroll">
                  <Show
                    when={projectTree()}
                    fallback={<div class="empty-panel-hint">Loading project files…</div>}
                  >
                    <Show
                      when={!projectSearch().trim()}
                      fallback={
                        <For each={filteredProjectFiles()}>
                          {(file) => (
                            <button
                              class="file-tree-row search-result-row"
                              classList={{ selected: selectedProjectPath() === file.path }}
                              onClick={() => {
                                setSelectedProjectPath(file.path);
                                void openProjectFile(file.path);
                              }}
                            >
                              <Icon theme={theme()} name={file.entry.isFile ? "file" : "folder"} size={13} />
                              <span class="tree-label">{file.path}</span>
                            </button>
                          )}
                        </For>
                      }
                    >
                      <ProjectTreeNode
                        node={projectTree()!}
                        path=""
                        theme={theme()}
                        selectedPath={selectedProjectPath()}
                        onSelect={(path, isFile) => {
                          setSelectedProjectPath(path);
                          if (isFile) void openProjectFile(path);
                          else log("info", `Selected project folder: ${path}`);
                        }}
                      />
                    </Show>
                  </Show>
                </div>
              </div>
              <div class="project-preview-panel">
                <div class="project-preview-heading">Project contents</div>
                <div class="project-preview-content">
                  <Show when={selectedProjectPath()} fallback={<div class="empty-panel-hint">Select a scene or asset to inspect it.</div>}>
                    <Icon theme={theme()} name={selectedProjectPath().endsWith(".scene") ? "packed-scene" : "file"} size={26} />
                    <strong>{selectedProjectPath().split("/").pop()}</strong>
                    <span>{selectedProjectPath()}</span>
                    <Show when={selectedProjectPath().toLowerCase().endsWith(".scene")}>
                      <button class="subtle-button" onClick={() => void loadScene(selectedProjectPath())}>Open Scene / Prefab</button>
                    </Show>
                    <Show when={selectedProjectPath().toLowerCase().endsWith(".components")}>
                      <button class="subtle-button" onClick={() => void openUserComponentsFile(selectedProjectPath())}>Open Components</button>
                    </Show>
                  </Show>
                </div>
              </div>
            </div>
          </Show>

          <Show when={bottomTab() === "Animation"}>
            <div class="animation-workspace" data-testid="animation-workspace" data-focus-context="animation">
              <aside class="animation-track-list">
                <div class="track-header animation-file-header">
                  <span>ANIMATIONS</span>
                  <button class="toolbar-icon-button tiny" aria-label="Create animation file" title="New Phaser animation JSON" onClick={() => void createAnimationFile()}>
                    <Icon theme={theme()} name="add" size={12} />
                  </button>
                </div>
                <div class="animation-file-path">{animationPath() || "No .json animation file open"}</div>
                <Show when={animationDocument()} fallback={<div class="timeline-empty">Open a Phaser v3 Animations JSON file from Project, or create one here.</div>}>
                  <button class="subtle-button animation-add-clip" onClick={addAnimationClip}>+ New animation clip</button>
                  <For each={animationDocument()?.anims ?? []}>
                    {(animation) => (
                      <div class="animation-clip-row" classList={{ selected: selectedAnimationKey() === animation.key }}>
                        <button class="animation-clip-select" onClick={() => { stopAnimationPreview(true); setSelectedAnimationKey(animation.key); setSelectedAnimationFrameIndex(0); }}>
                          <Icon theme={theme()} name="animation" size={13} />
                          <span>{animation.key}</span>
                          <small>{animation.frames.length} frames</small>
                        </button>
                        <button class="toolbar-icon-button tiny" aria-label={`Delete animation ${animation.key}`} title="Delete animation" onClick={() => deleteAnimationClip(animation.key)}>
                          <Icon theme={theme()} name="remove" size={11} />
                        </button>
                      </div>
                    )}
                  </For>
                </Show>
              </aside>
              <div class="animation-timeline">
                <div class="timeline-toolbar">
                  <div class="timeline-title">
                    <strong>{activeAnimation()?.key ?? "Animation Timeline"}</strong>
                    <span>{animationPath() || "Phaser JSONAnimations"}</span>
                  </div>
                  <div class="timeline-actions">
                    <button class="subtle-button" onClick={() => void createAnimationFile()}>New file</button>
                    <button class="primary-button" data-testid="save-animation" disabled={!animationDocument() || !animationDirty() || animationSaving()} onClick={() => void saveAnimationFile()}>
                      {animationSaving() ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
                <Show when={animationDocument()} fallback={<div class="timeline-empty">Animation authoring uses Phaser's existing JSONAnimations format.</div>}>
                  <div class="animation-settings-grid">
                    <label class="inspector-field">
                      <span>Animation key</span>
                      <input aria-label="Animation key" value={activeAnimation()?.key ?? ""} onChange={(event) => updateSelectedAnimation({ key: event.currentTarget.value.trim() })} />
                    </label>
                    <label class="inspector-field">
                      <span>Frame rate</span>
                      <input aria-label="Animation frame rate" type="number" min="0.01" step="any" value={String(activeAnimation()?.frameRate ?? 24)} onChange={(event) => updateSelectedAnimation({ frameRate: Number(event.currentTarget.value) })} />
                    </label>
                    <label class="inspector-field">
                      <span>Repeat</span>
                      <input aria-label="Animation repeat" type="number" step="1" value={String(activeAnimation()?.repeat ?? -1)} onChange={(event) => updateSelectedAnimation({ repeat: Math.trunc(Number(event.currentTarget.value)) })} />
                    </label>
                    <label class="inspector-field">
                      <span>Global time scale</span>
                      <input aria-label="Global animation time scale" type="number" min="0.01" step="any" value={String(animationDocument()?.globalTimeScale ?? 1)} onChange={(event) => {
                        const current = animationDocument();
                        const value = Number(event.currentTarget.value);
                        if (current && Number.isFinite(value) && value > 0) {
                          pauseAnimationPreview();
                          setAnimationDocument({ ...current, globalTimeScale: value });
                        }
                      }} />
                    </label>
                    <label class="inspector-field">
                      <span>Initial delay (ms)</span>
                      <input aria-label="Animation initial delay" type="number" min="0" step="any" value={String(activeAnimation()?.delay ?? 0)} onChange={(event) => updateSelectedAnimation({ delay: Math.max(0, Number(event.currentTarget.value)) })} />
                    </label>
                    <label class="inspector-field">
                      <span>Repeat delay (ms)</span>
                      <input aria-label="Animation repeat delay" type="number" min="0" step="any" value={String(activeAnimation()?.repeatDelay ?? 0)} onChange={(event) => updateSelectedAnimation({ repeatDelay: Math.max(0, Number(event.currentTarget.value)) })} />
                    </label>
                    <label class="inspector-field animation-yoyo-field">
                      <span>Yoyo</span>
                      <input aria-label="Animation yoyo" type="checkbox" checked={Boolean(activeAnimation()?.yoyo)} onChange={(event) => updateSelectedAnimation({ yoyo: event.currentTarget.checked })} />
                    </label>
                  </div>
                  <div class="animation-preview-toolbar">
                    <div class="animation-transport-actions">
                      <button class="toolbar-icon-button" aria-label="Play animation" title="Play" disabled={!activeAnimation()?.frames.length || animationPlaying()} onClick={playAnimationPreview}>▶</button>
                      <button class="toolbar-icon-button" aria-label="Pause animation" title="Pause" disabled={!animationPlaying()} onClick={pauseAnimationPreview}>Ⅱ</button>
                      <button class="toolbar-icon-button" aria-label="Stop animation" title="Stop and rewind" disabled={!animationDocument()} onClick={() => stopAnimationPreview(true)}>■</button>
                      <span class="animation-preview-separator" />
                      <span class="animation-preview-time" data-testid="animation-playhead-time">{(animationPlayheadMs() / 1000).toFixed(2)} s</span>
                    </div>
                    <div class="animation-preview-meta">
                      <span>FPS {activeAnimation()?.frameRate ?? 24}</span>
                      <span>{animationDurationLabel()} / loop</span>
                      <span>{activeAnimation()?.frames.length ?? 0} frames</span>
                    </div>
                  </div>
                  <div class="animation-preview-stage" data-testid="animation-preview-stage">
                    <Show when={animationPreviewAsset()} fallback={<div class="animation-preview-placeholder"><Icon theme={theme()} name="image-texture" size={25} /><span>{animationPreviewFrame()?.key ?? "Select a clip frame"}</span><small>Asset Pack preview unavailable</small></div>}>
                      {(asset) => (
                        <img
                          class="animation-preview-image"
                          data-testid="animation-preview-image"
                          src={`/editor/project/${asset().url.split("/").map(encodeURIComponent).join("/")}`}
                          alt={`Asset Pack image ${asset().key}`}
                        />
                      )}
                    </Show>
                    <div class="animation-preview-caption">
                      <span>{animationPreviewFrame() ? `${animationPreviewFrame()!.key}${animationPreviewFrame()!.frame !== undefined ? ` · ${animationPreviewFrame()!.frame}` : ""}` : "No frame selected"}</span>
                      <span>{animationPosition()?.waiting ? "Repeat delay / initial delay" : animationPlaying() ? "Playing" : "Preview"}</span>
                    </div>
                  </div>
                  <div class="animation-timeline-ruler" data-testid="animation-timeline-ruler">
                    <div
                      class="animation-ruler-track"
                      role="slider"
                      aria-label="Animation timeline playhead"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(animationCycleDurationMs())}
                      aria-valuenow={Math.round(animationPlayheadMs())}
                      tabIndex={0}
                      style={{ width: `${Math.max(1, animationTimelineWidth())}px` }}
                      onClick={(event) => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        if (bounds.width <= 0) return;
                        const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                        seekAnimationTimeline(animationCycleDurationMs() * ratio);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        const step = event.shiftKey ? 100 : 16;
                        seekAnimationTimeline(animationPlayheadMs() + (event.key === "ArrowRight" ? step : -step));
                      }}
                    >
                      <For each={animationRulerTicks()}>
                        {(tick) => (
                          <div class="animation-ruler-tick" style={{ left: `${tick.position}%` }}>
                            <span>{tick.label}</span>
                            <i />
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                  <div class="animation-frame-strip-scroll">
                    <div class="animation-frame-strip" data-testid="animation-frame-strip" style={{ width: `${Math.max(1, animationTimelineWidth())}px` }}>
                      <For each={animationFrameSegments()}>
                        {(segment) => {
                          const asset = () => animationAssetSources().find((item) => item.key === segment.frame.key);
                          return (
                            <button
                              class="animation-frame-strip-item"
                              classList={{
                                selected: selectedAnimationFrameIndex() === segment.index,
                                playing: animationPreviewFrameIndex() === segment.index,
                              }}
                              data-testid={`animation-timeline-frame-${segment.index}`}
                              draggable
                              style={{ width: `${segment.widthPx}px`, left: `${segment.leftPx}px` }}
                              title={`Frame ${segment.index + 1}: ${segment.frame.key} · ${segment.durationMs.toFixed(1)} ms`}
                              onClick={() => selectAnimationFrame(segment.index)}
                              onDragStart={(event) => event.dataTransfer?.setData("text/plain", String(segment.index))}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => handleAnimationFrameDrop(event, segment.index)}
                            >
                              <Show when={asset()}>
                                {(source) => <img src={`/editor/project/${source().url.split("/").map(encodeURIComponent).join("/")}`} alt="" />}
                              </Show>
                              <span>#{segment.index + 1} · {segment.frame.key}</span>
                              <small>{segment.durationMs.toFixed(0)} ms</small>
                            </button>
                          );
                        }}
                      </For>
                      <div class="animation-timeline-playhead" data-testid="animation-timeline-playhead" style={{ left: `${animationPlayheadLeftPx()}px` }} />
                    </div>
                  </div>
                  <div class="animation-frame-toolbar">
                    <strong>Frame properties</strong>
                    <span>{selectedAnimationFrame() ? `Frame ${selectedAnimationFrameIndex() + 1} of ${activeAnimation()?.frames.length ?? 0}` : "No frame selected"}</span>
                  </div>
                  <Show when={selectedAnimationFrame()}>
                    {(frame) => (
                      <div class="animation-selected-frame-fields" data-testid="animation-selected-frame-fields">
                        <label class="inspector-field">
                          <span>Asset Pack key</span>
                          <input aria-label="Selected frame asset key" list="animation-asset-keys" value={frame().key} onChange={(event) => updateAnimationFrame(selectedAnimationFrameIndex(), { key: event.currentTarget.value.trim() })} />
                          <datalist id="animation-asset-keys">
                            <For each={animationAssetSources()}>{(asset) => <option value={asset.key} />}</For>
                          </datalist>
                        </label>
                        <label class="inspector-field">
                          <span>Texture frame (optional)</span>
                          <input aria-label="Selected texture frame" value={String(frame().frame ?? "")} onChange={(event) => updateAnimationFrame(selectedAnimationFrameIndex(), { frame: event.currentTarget.value || undefined })} />
                        </label>
                        <label class="inspector-field">
                          <span>Duration override (ms)</span>
                          <input aria-label="Selected frame duration" type="number" min="0" step="any" value={String(frame().duration ?? "")} placeholder={String(1000 / (activeAnimation()?.frameRate ?? 24))} onChange={(event) => updateAnimationFrame(selectedAnimationFrameIndex(), { duration: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value) })} />
                        </label>
                        <div class="animation-frame-inspector-actions">
                          <button class="toolbar-icon-button tiny" aria-label="Move selected frame up" disabled={selectedAnimationFrameIndex() === 0} onClick={() => moveAnimationFrameBy(selectedAnimationFrameIndex(), -1)}>↑</button>
                          <button class="toolbar-icon-button tiny" aria-label="Move selected frame down" disabled={selectedAnimationFrameIndex() >= (activeAnimation()?.frames.length ?? 0) - 1} onClick={() => moveAnimationFrameBy(selectedAnimationFrameIndex(), 1)}>↓</button>
                          <button class="toolbar-icon-button tiny" aria-label="Remove selected frame" onClick={() => deleteAnimationFrame(selectedAnimationFrameIndex())}><Icon theme={theme()} name="remove" size={11} /></button>
                        </div>
                      </div>
                    )}
                  </Show>
                  <div class="animation-add-frame">
                    <label class="inspector-field">
                      <span>Asset Pack key</span>
                      <input aria-label="New animation frame asset key" list="animation-asset-keys" placeholder="e.g. dino" value={animationFrameKey()} onInput={(event) => setAnimationFrameKey(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") addAnimationFrame(); }} />
                    </label>
                    <button class="subtle-button" disabled={!selectedAnimationKey() || !animationFrameKey().trim()} onClick={addAnimationFrame}>Add frame</button>
                  </div>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={bottomTab() === "Components"}>
            <div class="components-workspace" data-testid="components-workspace" data-focus-context="components">
              <div class="components-toolbar">
                <div class="components-file-heading">
                  <strong>User Components</strong>
                  <span>{componentDocumentPath() || "Open a .components file from Project"}</span>
                </div>
                <div class="timeline-actions">
                  <button class="subtle-button" onClick={() => void createUserComponentsFile()}>New file</button>
                  <button class="primary-button" data-testid="save-components" disabled={!componentDocument() || !componentDirty() || componentSaving()} onClick={() => void saveUserComponentsFile()}>
                    {componentSaving() ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
              <Show when={componentDocument()} fallback={<div class="timeline-empty">Select a .components file in Project or create a new one. Definitions keep the legacy Phaser Editor JSON shape.</div>}>
                <div class="components-create-row">
                  <label class="inspector-field">
                    <span>Component class name</span>
                    <input aria-label="New User Component name" placeholder="e.g. Blink" value={newComponentName()} onInput={(event) => setNewComponentName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") addUserComponent(); }} />
                  </label>
                  <button class="subtle-button" disabled={!newComponentName().trim()} onClick={addUserComponent}>Add component</button>
                </div>
                <div class="components-definition-list">
                  <Show when={(componentDocument()?.components.length ?? 0) > 0} fallback={<div class="timeline-empty">No definitions yet. Add the first User Component.</div>}>
                    <For each={componentDocument()?.components ?? []}>
                      {(definition) => (
                        <section class="components-definition-card" data-testid={`component-definition-${definition.name}`}>
                          <div class="components-definition-heading">
                            <div><strong>{definition.displayName ?? definition.name}</strong><code>{definition.name}</code></div>
                            <button class="toolbar-icon-button tiny" aria-label={`Delete definition ${definition.name}`} title="Remove definition" onClick={() => {
                              if (window.confirm(`Remove User Component "${definition.name}" from this file? Existing scene references are preserved.`)) removeUserComponent(definition.name);
                            }}>
                              <Icon theme={theme()} name="remove" size={12} />
                            </button>
                          </div>
                          <div class="components-definition-meta">
                            <label class="inspector-field">
                              <span>Display name</span>
                              <input aria-label={`${definition.name} display name`} value={definition.displayName ?? definition.name} onChange={(event) => setComponentDocument((current) => current ? updateUserComponentDefinition(current, definition.name, { displayName: event.currentTarget.value }) : current)} />
                            </label>
                            <label class="inspector-field">
                              <span>GameObject type</span>
                              <input aria-label={`${definition.name} GameObject type`} value={definition.gameObjectType ?? "Phaser.GameObjects.Image"} onChange={(event) => setComponentDocument((current) => current ? updateUserComponentDefinition(current, definition.name, { gameObjectType: event.currentTarget.value }) : current)} />
                            </label>
                          </div>
                          <div class="components-property-list">
                            <strong>Properties</strong>
                            <For each={definition.properties ?? []}>
                              {(property) => (
                                <div class="components-property-row">
                                  <span>{property.label ?? property.name}</span>
                                  <code>{property.name}</code>
                                  <span class="components-property-type">{property.type?.id ?? "string"}</span>
                                  <button class="toolbar-icon-button tiny" aria-label={`Remove ${definition.name} property ${property.name}`} onClick={() => removeUserComponentProperty(definition.name, property.name)}>
                                    <Icon theme={theme()} name="remove" size={11} />
                                  </button>
                                </div>
                              )}
                            </For>
                            <div class="components-add-property">
                              <input aria-label={`${definition.name} new property name`} placeholder="propertyName" value={newComponentPropertyName()} onInput={(event) => setNewComponentPropertyName(event.currentTarget.value)} />
                              <select aria-label="User Component property type" value={newComponentPropertyType()} onChange={(event) => setNewComponentPropertyType(event.currentTarget.value as "number" | "string" | "boolean")}>
                                <option value="number">Number</option>
                                <option value="string">String</option>
                                <option value="boolean">Boolean</option>
                              </select>
                              <button class="toolbar-icon-button tiny" aria-label={`Add property to ${definition.name}`} disabled={!newComponentPropertyName().trim()} onClick={() => addUserComponentProperty(definition.name)}>
                                <Icon theme={theme()} name="add" size={12} />
                              </button>
                            </div>
                          </div>
                        </section>
                      )}
                    </For>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>

          <Show when={(compactWorkbench() || layout().consoleDocked) && bottomTab() === "Console"}>
            <ConsolePanel
              className="compact-console-panel"
              theme={theme()}
              level={consoleLevel()}
              onLevelChange={setConsoleLevel}
              messages={visibleConsoleMessages()}
              onClear={() => setConsoleMessages([])}
              {...(!compactWorkbench() && layout().consoleDocked ? { onUndock: undockConsole } : {})}
            />
          </Show>
          <div
            class="bottom-docked-content"
            ref={(element) => { bottomDockedContent = element; }}
            data-testid="bottom-docked-content"
            data-focus-context={bottomTab().toLowerCase()}
            style={{ display: layout().dockedPanels.includes(bottomTab() as SidePanelId) ? "flex" : "none" }}
          />
        </div>

        <Show when={!compactWorkbench() && !layout().consoleDocked}>
          <>
        <div
          class="console-splitter"
          data-testid="splitter-console"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Console panel"
          onPointerDown={(event) => startResize("console", event)}
        />
        <ConsolePanel
          className="desktop-console-panel"
          theme={theme()}
          level={consoleLevel()}
          onLevelChange={setConsoleLevel}
          messages={visibleConsoleMessages()}
          onClear={() => setConsoleMessages([])}
          onDragStart={handleConsoleDragStart}
        />
          </>
        </Show>
      </section>

      <footer class="status-bar">
        <span class="status-bar-left"><span class="status-led" /> {loading() ? "Loading project…" : loadError() ? "Project connection error" : projectName()}</span>
        <Show when={loadError()}><span class="status-error">{loadError()}</span></Show>
        <span class="status-spacer" />
        <span>{scenePath() || "No scene"}</span>
        <span class="status-separator">|</span>
        <span>{sceneObjects().length} objects</span>
        <span class="status-separator">|</span>
        <span>{theme() === "dark" ? "Dark theme" : "Light theme"}</span>
      </footer>

      <Show when={loading()}>
        <div class="loading-overlay" role="status">
          <div class="loading-mark"><span /></div>
          <strong>Opening project</strong>
          <span>Connecting to the local Codogma backend…</span>
        </div>
      </Show>

      <Show when={loadError() && !loading()}>
        <div class="connection-overlay" role="alert">
          <div class="connection-dialog">
            <Icon theme={theme()} name="error-warning" size={26} />
            <strong>Project could not be opened</strong>
            <p>{loadError()}</p>
            <span>Start the Codogma Node server and open the Host through the Vite proxy on port 5173.</span>
            <button class="primary-button" onClick={() => void loadProject()}>Retry connection</button>
          </div>
        </div>
      </Show>

      <Show when={paletteOpen()}>
        <div class="modal-backdrop" onClick={(event) => {
          if (event.target === event.currentTarget) closePalette();
        }}>
          <div class="command-palette" ref={(element) => { paletteDialog = element; }} role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={handlePaletteKeyDown}>
            <div class="palette-search">
              <Icon theme={theme()} name="search" size={16} />
              <input
                ref={(element) => { paletteInput = element; }}
                aria-label="Search commands"
                placeholder="Type a command or panel name…"
                value={paletteQuery()}
                onInput={(event) => { setPaletteQuery(event.currentTarget.value); setCommandIndex(0); }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setCommandIndex((index) => Math.min(index + 1, Math.max(0, filteredCommands().length - 1)));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setCommandIndex((index) => Math.max(0, index - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    const command = filteredCommands()[commandIndex()];
                    if (command) runCommand(command);
                  }
                }}
              />
              <kbd>ESC</kbd>
            </div>
            <div class="palette-results">
              <For each={filteredCommands()}>
                {(command, index) => (
                  <button
                    class="palette-command"
                    classList={{ highlighted: commandIndex() === index() }}
                    onMouseEnter={() => setCommandIndex(index())}
                    onClick={() => runCommand(command)}
                  >
                    <span>{command.title}</span>
                    <Show when={command.shortcut}><kbd>{command.shortcut}</kbd></Show>
                  </button>
                )}
              </For>
              <Show when={filteredCommands().length === 0}>
                <div class="palette-no-results">No matching commands</div>
              </Show>
            </div>
            <div class="palette-footer"><span>↑ ↓ Navigate</span><span>Enter Run</span><span>Esc Close</span></div>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default App;
