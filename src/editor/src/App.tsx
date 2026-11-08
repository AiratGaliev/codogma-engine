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
  createSceneNode,
  findSceneNode,
  getSceneNodeEntries,
  removeSceneNode,
  reparentSceneNode,
  updateSceneNode,
  isPrefabDocument,
  type EditorDocument,
  type SceneNodeEntry,
  type SceneNodePatch,
  type SceneNodeKind,
} from "./domain/scene-model.ts";
import {
  findPrefabReferenceByAssetPath,
  createNativeSceneDocument,
  findSceneReferenceByAssetPath,
  parseNativePrefabDocument,
  parseNativeProjectDocument,
  parseNativeSceneDocument,
  PROJECT_MANIFEST_PATH,
  registerNativeScene,
  resolvePrefabAsset,
  resolveSceneAsset,
  serializeNativePrefabDocument,
  serializeNativeProjectDocument,
  serializeNativeSceneDocument,
} from "./domain/project-model.ts";
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
  addNativePrefabInstance,
  createNativePrefabDocument,
  registerNativePrefab,
  replaceNativePrefabCatalogDocument,
  type NativePrefabCatalogEntry,
} from "./domain/prefab-model.ts";
import {
  createDocumentHistoryState,
  recordDocumentChange,
  undoDocumentChange,
  redoDocumentChange,
  resolveDocumentChangeRollback,
  type DocumentChangeRollback,
  type DocumentHistoryState,
} from "./domain/document-history.js";
import { beginSceneLoadRequest } from "./domain/scene-load-request.js";
import {
  attachNativeComponent,
  detachNativeComponent,
  setNativeComponentEnabled,
} from "./domain/components-model.ts";
import {
  addNativeNodeFx,
  getNativeNodeEffects,
  removeNativeNodeFx,
  updateNativeNodeFx,
  type FxObject,
  type FxType,
} from "./domain/fx-model.ts";
import {
  getProjectDirectorySnapshot,
  readProjectFile,
  writeProjectFile,
  deleteProjectEntries,
  createProjectDirectory,
  type ProjectTreeEntry,
} from "./services/editor-api";
import {
  checkTypeScriptSource,
  type TypeScriptSourceDiagnostic,
} from "./services/typescript-diagnostics.ts";
import {
  connectEditorMcpBridge,
  type EditorMcpHandler,
} from "./services/editor-mcp-bridge";
import {
  createDefaultWorkspaceLayout,
  getMaximumConsoleHeight,
  getSidePanelHomeZone,
  getVisibleBottomTabs,
  getVisibleSidePanels,
  moveDockablePanel,
  reorderDockTab as reorderWorkspaceDockTab,
  restoreWorkspaceLayoutContent,
  selectSidePanel,
  serializeWorkspaceLayout,
  setBottomPanelVisibility,
  setConsolePanelVisibility,
  setSidePanelVisibility,
  type BottomTab,
  type BottomWorkspacePanel,
  type DockZone,
  type SidePanelId,
  type WorkspaceLayout,
} from "./domain/workspace-layout.ts";
import FxInspector from "./components/FxInspector";
import PhaserSceneViewport from "./components/PhaserSceneViewport";

type Theme = "dark" | "light";
type ViewportTab = "Scene" | "Game" | "Source";
type FocusContext = "global" | "scene" | "hierarchy" | "inspector" | "project" | "animation" | "components" | "console";
type ConsoleLevel = "info" | "success" | "warning" | "error";

type DockDropTarget =
  | { zone: DockZone; kind: "group" }
  | { zone: DockZone; kind: "tab"; target: BottomTab; insertion: "before" | "after" };

interface DockPointerDrag {
  panel: BottomTab;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  active: boolean;
  source: "tab" | "header";
  captureElement: HTMLElement;
}

interface ConsoleMessage {
  id: number;
  level: ConsoleLevel;
  text: string;
  time: string;
}

interface Command {
  id: string;
  title: string;
  shortcut?: string;
  run: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  checkable?: "checkbox" | "radio";
  checked?: boolean;
}

function iconPath(theme: Theme, name: string): string {
  return `/editor/icons/${theme}/godot/${name}.svg`;
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
  node: ProjectTreeEntry;
  path: string;
  theme: Theme;
  selectedPath: string;
  onSelect: (path: string, isFile: boolean) => void;
  search?: string;
}) {
  const [expanded, setExpanded] = createSignal(
    props.path.length === 0 || props.path === "scenes" || props.path === "assets",
  );
  const isDirectory = () => props.node.kind === "directory";
  const iconName = () => {
    if (isDirectory()) return expanded() ? "folder" : "folder";
    const extension = props.node.name.toLowerCase().split(".").pop();
    if (props.node.name.toLowerCase().endsWith(".cge-scene.json") || props.node.name.toLowerCase().endsWith(".cge-prefab.json")) return "packed-scene";
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
          if (props.node.kind === "file") props.onSelect(props.path, true);
        }}
        title={props.path}
      >
        <span class="tree-disclosure" aria-hidden="true">
          <Show when={isDirectory()}>{expanded() ? "▾" : "▸"}</Show>
        </span>
        <Icon theme={props.theme} name={iconName()} size={14} />
        <span class="tree-label">{props.node.name}</span>
        <Show when={props.node.kind === "file" && (props.node.name.toLowerCase().endsWith(".cge-scene.json") || props.node.name.toLowerCase().endsWith(".cge-prefab.json"))}>
          <span class="file-kind">{props.node.name.toLowerCase().endsWith(".cge-prefab.json") ? "PREFAB" : "SCENE"}</span>
        </Show>
      </button>
      <Show when={isDirectory() && expanded()}>
        <div class="file-tree-children">
          <For each={props.node.children ?? []}>
            {(child) => {
              const childPath = child.relativePath;
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

function flattenProjectEntries(
  node: ProjectTreeEntry,
): Array<{ path: string; entry: ProjectTreeEntry }> {
  const result: Array<{ path: string; entry: ProjectTreeEntry }> = [];
  for (const child of node.children ?? []) {
    result.push({ path: child.relativePath, entry: child });
    if (child.kind === "directory") result.push(...flattenProjectEntries(child));
  }
  return result;
}
function PanelHeader(props: {
  title: string;
  icon: string;
  theme: Theme;
  trailing?: string;
  onPointerDown?: (event: PointerEvent & { currentTarget: HTMLElement }) => void;
  onUndock?: () => void;
  onClose?: () => void;
}) {
  return (
    <div class="panel-header" onPointerDown={(event) => props.onPointerDown?.(event)} classList={{ "panel-header-draggable": Boolean(props.onPointerDown) }}>
      <Icon theme={props.theme} name={props.icon} size={14} />
      <span>{props.title}</span>
      <Show when={props.trailing}>
        <span class="panel-header-trailing">{props.trailing}</span>
      </Show>
      <Show when={props.onUndock}>
        <button class="panel-undock-button" aria-label={`Undock ${props.title}`} title={`Move ${props.title} back to its default panel`} onClick={(event) => { event.stopPropagation(); props.onUndock?.(); }}>Undock</button>
      </Show>
      <Show when={props.onClose}>
        <button class="panel-close-button" aria-label={`Close ${props.title}`} title={`Close ${props.title} panel`} onClick={(event) => { event.stopPropagation(); props.onClose?.(); }}>×</button>
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
  onClose: () => void;
  onPointerDown?: (event: PointerEvent & { currentTarget: HTMLElement }) => void;
  onUndock?: () => void;
}) {

  return (
    <section class="console-panel" classList={{ [props.className]: true }} data-testid="console-panel" data-focus-context="console">
      <div
        class="console-header"
        onPointerDown={(event) => props.onPointerDown?.(event)}
        classList={{ "console-header-draggable": Boolean(props.onPointerDown) }}
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
        <button
          class="panel-close-button console-close-button"
          aria-label="Close Console"
          title="Close Console panel"
          onClick={(event) => { event.stopPropagation(); props.onClose(); }}
        >
          ×
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
  const [projectTree, setProjectTree] = createSignal<ProjectTreeEntry | null>(null);
  const [projectDocument, setProjectDocument] = createSignal<import("@codogma/cge").ProjectDocumentV1 | null>(null);
  const [savedProjectContent, setSavedProjectContent] = createSignal("");
  const [projectSaving, setProjectSaving] = createSignal(false);
  const [scene, setScene] = createSignal<EditorDocument | null>(null);
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
  const [scriptSourcePath, setScriptSourcePath] = createSignal("");
  const [scriptSource, setScriptSource] = createSignal("");
  const [savedScriptSource, setSavedScriptSource] = createSignal("");
  const [scriptSaving, setScriptSaving] = createSignal(false);
  const [scriptChecking, setScriptChecking] = createSignal(false);
  const [scriptDiagnostics, setScriptDiagnostics] = createSignal<TypeScriptSourceDiagnostic[]>([]);
  const [componentToAttach, setComponentToAttach] = createSignal("");
  const [prefabCatalog, setPrefabCatalog] = createSignal<NativePrefabCatalogEntry[]>([]);
  const [selectedPrefabPath, setSelectedPrefabPath] = createSignal("");
  const [history, setHistory] = createSignal<DocumentHistoryState<EditorDocument | null>>(
    createDocumentHistoryState<EditorDocument | null>(null),
  );
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [loadError, setLoadError] = createSignal("");
  const [activeViewport, setActiveViewport] = createSignal<ViewportTab>("Scene");
  const [compactWorkbench, setCompactWorkbench] = createSignal(window.innerWidth <= 1360);
  const [narrowWorkbench, setNarrowWorkbench] = createSignal(window.innerWidth <= 780);
  const [viewportWidth, setViewportWidth] = createSignal(window.innerWidth);
  const [viewportHeight, setViewportHeight] = createSignal(window.innerHeight);
  const [layout, setLayout] = createSignal<WorkspaceLayout>((() => {
    const compact = window.innerWidth <= 1360;
    try {
      return restoreWorkspaceLayoutContent(
        window.localStorage.getItem("codogma.editor.layout"),
        compact,
        window.innerWidth <= 780,
      );
    } catch {
      return createDefaultWorkspaceLayout(compact);
    }
  })());
  const bottomTab = () => layout().bottomTab;
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
  const [dockDropTarget, setDockDropTarget] = createSignal<DockDropTarget | null>(null);
  const [dockDragPosition, setDockDragPosition] = createSignal({ x: 0, y: 0 });
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
  let leftDockedContent: HTMLDivElement | undefined;
  let rightDockedContent: HTMLDivElement | undefined;
  let bottomDockedContent: HTMLDivElement | undefined;
  let sceneCanvas: HTMLCanvasElement | null = null;
  let disposeEditorMcpBridge: (() => void) | undefined;
  let animationPlaybackRaf = 0;
  let animationPlaybackLastTimestamp = 0;
  let animationPlaybackElapsed = 0;
  let dockPointerDrag: DockPointerDrag | undefined;
  let suppressDockTabClick = false;
  let resizeState:
    | {
        kind: "left" | "right" | "bottom" | "console";
        pointerId: number;
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

  const scriptDirty = createMemo(() =>
    Boolean(scriptSourcePath()) && scriptSource() !== savedScriptSource(),
  );

  const projectDirty = createMemo(() => {
    const current = projectDocument();
    if (!current || !savedProjectContent()) return false;
    try { return serializeNativeProjectDocument(current) !== savedProjectContent(); }
    catch { return true; }
  });

  const documentDirty = createMemo(() => dirty() || projectDirty() || animationDirty() || scriptDirty());

  const componentRegistry = createMemo(() => {
    const project = projectDocument();
    if (!project) return [];
    return project.componentModules.map((module) => {
      const asset = project.assets.find((item) => item.id === module.moduleAssetId);
      return {
        path: asset?.path ?? "",
        module,
      };
    }).filter((item) => item.path.length > 0);
  });

  const sceneObjects = createMemo(() => {
    const current = scene();
    return current ? getSceneNodeEntries(current, prefabCatalog().map((item) => item.document)) : [];
  });

  const selectedObject = createMemo<SceneNodeEntry | undefined>(() => {
    const id = selectedId();
    return id ? sceneObjects().find((item) => item.id === id) : undefined;
  });

  const selectedFxEffects = createMemo(() => {
    const selected = selectedObject();
    return selected ? getNativeNodeEffects(selected.node) : [];
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
    return flattenProjectEntries(root).filter(({ path }) =>
      path.toLowerCase().includes(query),
    );
  });

  const visibleBottomTabs = createMemo(() =>
    getVisibleBottomTabs(layout(), compactWorkbench(), narrowWorkbench()),
  );
  const leftDockPanels = createMemo(() =>
    narrowWorkbench() ? [] : getVisibleSidePanels(layout(), "left"),
  );
  const rightDockPanels = createMemo(() =>
    narrowWorkbench() ? [] : getVisibleSidePanels(layout(), "right"),
  );

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
      run: () => openBottomPanel("Project"),
    },
    {
      id: "animation",
      title: "Show Animation workspace",
      run: () => openBottomPanel("Animation"),
    },
    {
      id: "components",
      title: "Show User Components",
      run: () => openBottomPanel("Components"),
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
      title: "Open Console",
      run: openConsole,
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
    try {
      window.localStorage.setItem(
        "codogma.editor.layout",
        serializeWorkspaceLayout(current, compactWorkbench(), narrowWorkbench()),
      );
    } catch (error) {
      log(
        "warning",
        `Workspace layout could not be saved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  let sceneLoadSequence = 0;
  let activeSceneLoads = 0;
  let nativeProjectMutationInProgress = false;
  let documentLoadSequence = 0;
  let scriptCheckSequence = 0;

  async function loadScene(
    path: string,
    reloadCurrent = false,
    allowDuringProjectMutation = false,
  ): Promise<boolean> {
    const loadDecision = beginSceneLoadRequest(sceneLoadSequence, path, scenePath(), reloadCurrent);
    sceneLoadSequence = loadDecision.sequence;
    if (loadDecision.skip) return true;
    if (saving() || (nativeProjectMutationInProgress && !allowDuringProjectMutation)) {
      log("warning", "A native document operation is in progress; opening another document is temporarily blocked.");
      return false;
    }
    if (animationDirty() || scriptDirty()) {
      if (!window.confirm("The active animation or TypeScript source has unsaved changes. Discard them and open the document?")) return false;
    }
    if (dirty() || projectDirty()) {
      if (!window.confirm("The active native document or Project manifest has unsaved changes. Discard them and open the requested document?")) return false;
    }

    const request = sceneLoadSequence;
    const activeDocumentBeforeLoad = scene();
    const activeHistoryBeforeLoad = history();
    const activePathBeforeLoad = scenePath();
    const projectBeforeLoad = projectDocument();
    activeSceneLoads += 1;
    setLoadError("");
    try {
      const project = projectBeforeLoad;
      if (!project) throw new Error("The native Project manifest is not loaded.");
      const sceneReference = findSceneReferenceByAssetPath(project, path);
      const prefabReference = findPrefabReferenceByAssetPath(project, path);
      if (!sceneReference && !prefabReference) throw new Error(`"${path}" is not registered as a Scene or Prefab asset in project.json.`);
      const content = await readProjectFile(path);
      if (
        request !== sceneLoadSequence ||
        saving() ||
        (nativeProjectMutationInProgress && !allowDuringProjectMutation) ||
        scene() !== activeDocumentBeforeLoad ||
        history() !== activeHistoryBeforeLoad ||
        scenePath() !== activePathBeforeLoad ||
        projectDocument() !== project
      ) return false;
      const parsed = sceneReference
        ? parseNativeSceneDocument(project, sceneReference.id, content, prefabCatalog().map((item) => item.document))
        : parseNativePrefabDocument(project, prefabReference!.id, content, prefabCatalog().map((item) => item.document));
      stopAnimationPreview(true);
      setScene(parsed);
      setScenePath(path);
      setSavedContent(content);
      setHistory(createDocumentHistoryState<EditorDocument | null>(parsed));
      const firstObject = getSceneNodeEntries(parsed, prefabCatalog().map((item) => item.document))[0];
      setSelectedId(firstObject?.id ?? null);
      setSelectedProjectPath(path);
      setAnimationDocument(null);
      setAnimationPath("");
      setSavedAnimationContent("");
      setActiveViewport("Scene");
      setGameLoaded(false);
      log("success", `Opened native ${isPrefabDocument(parsed) ? "Prefab" : "Scene"} ${path}`);
      return true;
    } catch (error) {
      if (request !== sceneLoadSequence) return false;
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      log("error", message);
      return false;
    } finally {
      activeSceneLoads = Math.max(0, activeSceneLoads - 1);
    }
  }

  async function loadProject() {
    setLoading(true);
    setLoadError("");
    try {
      const result = await getProjectDirectorySnapshot();
      setProjectTree(result.root);
      setProjectName(result.root.name);
      const manifestContent = await readProjectFile(PROJECT_MANIFEST_PATH);
      const project = parseNativeProjectDocument(manifestContent);
      setProjectDocument(project);
      setSavedProjectContent(serializeNativeProjectDocument(project));

      const files = flattenProjectEntries(result.root);
      const availableProjectPaths = new Set(files.filter(({ entry }) => entry.kind === "file").map(({ path }) => path));
      const animationAssets: Array<{ key: string; url: string; type: string }> = [];
      const assetPackFiles = files.filter(({ path, entry }) => entry.kind === "file" && path.toLowerCase().endsWith("asset-pack.json"));
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
              animationAssets.push({ key: entry.key, url: resolvedPath, type: typeof entry.type === "string" ? entry.type : "image" });
            }
          }
        } catch (error) {
          log("warning", `Could not read external Asset Pack ${packFile.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      setAnimationAssetSources(animationAssets);

      const prefabs = await Promise.all(project.prefabs.map(async (reference) => {
        const asset = resolvePrefabAsset(project, reference.id);
        const document = parseNativePrefabDocument(project, reference.id, await readProjectFile(asset.path));
        return { assetId: reference.assetId, path: asset.path, document };
      }));
      setPrefabCatalog(prefabs);

      const firstScene = project.scenes[0];
      if (!firstScene) throw new Error("The native Project manifest does not register an openable Scene.");
      const sceneAsset = resolveSceneAsset(project, firstScene.id);
      const opened = await loadScene(sceneAsset.path);
      if (!opened) throw new Error(`The registered Scene "${sceneAsset.path}" could not be opened.`);
      log("info", `Native Project loaded · ${result.entryCount} files and folders`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      log("error", message);
    } finally {
      setLoading(false);
    }
  }

  function applySceneChange(
    next: EditorDocument,
    selectionAfter = selectedId(),
    allowDuringProjectMutation = false,
  ): DocumentChangeRollback<EditorDocument | null> | null {
    if (saving() || (nativeProjectMutationInProgress && !allowDuringProjectMutation)) return null;

    const previousDocument = scene();
    const previousState = history();
    const previousSelection = selectedId();
    const committedState = recordDocumentChange(previousState, next, previousSelection, selectionAfter);
    const rollback: DocumentChangeRollback<EditorDocument | null> = {
      previousDocument,
      previousState,
      previousSelection,
      committedDocument: next,
      committedState,
      committedSelection: selectionAfter,
    };

    setHistory(committedState);
    setScene(next);
    setSelectedId(selectionAfter);
    return rollback;
  }

  function undo() {
    if (saving() || nativeProjectMutationInProgress) return;
    const result = undoDocumentChange(history());
    if (!result || !result.document) return;
    setHistory(result.state);
    setScene(result.document);
    setSelectedId(result.selectedId);
    log("info", "Undo");
  }

  function redo() {
    if (saving() || nativeProjectMutationInProgress) return;
    const result = redoDocumentChange(history());
    if (!result || !result.document) return;
    setHistory(result.state);
    setScene(result.document);
    setSelectedId(result.selectedId);
    log("info", "Redo");
  }

  async function refreshProjectTree() {
    const result = await getProjectDirectorySnapshot();
    setProjectTree(result.root);
  }

  async function ensureProjectFolder(relativePath: string) {
    const root = projectTree();
    if (!root) throw new Error("The project tree is not loaded.");
    const existing = flattenProjectEntries(root).find((item) => item.path === relativePath);
    if (existing?.entry.kind === "directory") return;
    if (existing?.entry.kind === "file") throw new Error(`A file already exists at "${relativePath}".`);
    await createProjectDirectory(relativePath);
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
    if ((dirty() || projectDirty() || scriptDirty()) &&
        !window.confirm("The active scene, User Components or TypeScript source has unsaved changes. Discard them?")) return;
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

  async function runTypeScriptSourceCheck(path: string, content: string) {
    const request = ++scriptCheckSequence;
    setScriptChecking(true);
    try {
      const result = await checkTypeScriptSource(path, content);
      if (request === scriptCheckSequence && scriptSourcePath() === path && scriptSource() === content) {
        setScriptDiagnostics(result.diagnostics);
      }
    } catch (error) {
      if (request === scriptCheckSequence) {
        log("warning", `TypeScript diagnostics unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      if (request === scriptCheckSequence) setScriptChecking(false);
    }
  }

  function updateTypeScriptSource(content: string) {
    setScriptSource(content);
    const path = scriptSourcePath();
    if (path) void runTypeScriptSourceCheck(path, content);
  }

  async function openTypeScriptFile(path: string, sourceContent?: string) {
    if (path === scriptSourcePath()) {
      setActiveViewport("Source");
      return;
    }
    if (documentDirty() && !window.confirm("The active document has unsaved changes. Discard them and open the TypeScript source?")) return;
    const request = ++documentLoadSequence;
    try {
      const content = sourceContent ?? await readProjectFile(path);
      if (request !== documentLoadSequence) return;
      setScriptSourcePath(path);
      setScriptSource(content);
      setSavedScriptSource(content);
      setScriptDiagnostics([]);
      setSelectedProjectPath(path);
      setActiveViewport("Source");
      setLayout((current) => ({ ...current, bottomTab: "Components" }));
      await runTypeScriptSourceCheck(path, content);
      log("success", `Opened TypeScript source ${path}`);
    } catch (error) {
      if (request !== documentLoadSequence) return;
      log("error", `Could not open TypeScript source: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveTypeScriptFile() {
    const path = scriptSourcePath();
    if (!path || scriptSaving() || !scriptDirty()) return;
    setScriptSaving(true);
    try {
      const content = scriptSource();
      await writeProjectFile(path, content);
      setSavedScriptSource(content);
      await runTypeScriptSourceCheck(path, content);
      log("success", `Saved TypeScript source ${path}`);
    } catch (error) {
      log("error", `TypeScript source save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setScriptSaving(false);
    }
  }

  async function openProjectFile(path: string) {
    const normalized = path.toLowerCase();
    if (normalized.endsWith(".cge-scene.json") || normalized.endsWith(".cge-prefab.json")) {
      await loadScene(path);
      return;
    }
    if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) {
      await openTypeScriptFile(path);
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
    const existing = flattenProjectEntries(root).find((item) => item.path.toLowerCase() === path.toLowerCase());
    if (existing) throw new Error(`A project item already exists at "${path}".`);
  }

  async function attachComponentToSelected(typeId: string) {
    const current = scene();
    const selected = selectedObject();
    const project = projectDocument();
    if (!current || !selected || !project) return;
    try {
      applySceneChange(attachNativeComponent(current, selected.id, typeId, { project }), selected.id);
      setComponentToAttach("");
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function detachComponentFromSelected(instanceId: string) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try { applySceneChange(detachNativeComponent(current, selected.id, instanceId), selected.id); }
    catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  async function createNativePrefabFromNode(nodeId: string, pathValue: string, nameValue?: string) {
    if (nativeProjectMutationInProgress) throw new Error("Another native Prefab creation is already in progress.");
    if (activeSceneLoads > 0) throw new Error("A native Scene or Prefab document is currently opening. Retry Prefab creation afterwards.");
    if (saving() || projectSaving()) {
      throw new Error("A native document or Project manifest save is in progress. Retry Prefab creation afterwards.");
    }
    nativeProjectMutationInProgress = true;
    try {
      const current = scene();
      const project = projectDocument();
      if (!current || !project || isPrefabDocument(current)) throw new Error("Open a native Scene before creating a Prefab.");
      const selected = getSceneNodeEntries(current, prefabCatalog().map((item) => item.document)).find((item) => item.id === nodeId);
      if (!selected) throw new Error(`Scene Node "${nodeId}" was not found.`);
      const path = readMcpPath(pathValue, "path");
      if (!path.toLowerCase().endsWith(".cge-prefab.json")) {
        throw new Error("Native Prefab path must end with .cge-prefab.json.");
      }
      const name = nameValue?.trim() || selected.name;
      const directory = path.split("/").slice(0, -1).join("/");
      assertNewProjectFilePath(path);

      const prefab = createNativePrefabDocument(selected.node, name);
      const assetId = globalThis.crypto?.randomUUID?.();
      if (!assetId) throw new Error("Secure randomUUID support is required to register native Project assets.");
      const nextProject = registerNativePrefab(project, prefab, assetId, path);
      const prefabContent = serializeNativePrefabDocument(nextProject, prefab);
      const manifestContent = serializeNativeProjectDocument(nextProject);

      // Build and validate the replacement Scene before any file is written.
      const previousNodeIds = new Set(
        getSceneNodeEntries(current, prefabCatalog().map((item) => item.document)).map((entry) => entry.id),
      );
      const withoutSource = removeSceneNode(current, selected.id);
      const nextScene = addNativePrefabInstance(withoutSource as import("@codogma/cge").SceneDocumentV1, prefab, {
        name: selected.name,
        transform: selected.node.transform,
        parentId: selected.parentId,
      });
      const instance = getSceneNodeEntries(nextScene, [...prefabCatalog().map((item) => item.document), prefab])
        .find((entry) => !previousNodeIds.has(entry.id) && entry.node.prefabInstance?.prefabId === prefab.id);
      const sceneContent = serializeNativeSceneDocument(nextProject, nextScene, [...prefabCatalog().map((item) => item.document), prefab]);

      if (directory) await ensureProjectFolder(directory);
      await writeProjectFile(path, prefabContent);
      try {
        await writeProjectFile(PROJECT_MANIFEST_PATH, manifestContent);
      } catch (error) {
        try { await deleteProjectEntries([path]); }
        catch (rollbackError) {
          throw new Error(`Project manifest update failed and the newly written Prefab could not be rolled back: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, { cause: error });
        }
        throw error;
      }

      setProjectDocument(nextProject);
      setSavedProjectContent(manifestContent);
      setPrefabCatalog((catalog) => [...catalog, { assetId, path, document: prefab }]);
      const rollback = applySceneChange(nextScene, instance?.id ?? null, true);
      if (!rollback) {
        throw new Error("The new Prefab and Project manifest were saved, but the active Scene changed before Prefab instantiation could be committed.");
      }
      if (!(await saveScene(true, sceneContent))) {
        throw new Error("Prefab and Project manifest were saved, but the Scene instance could not be saved. The Scene remains dirty for retry.");
      }
      try {
        await refreshProjectTree();
      } catch (error) {
        log("warning", `Native Prefab was saved, but the Project tree could not be refreshed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { prefabId: prefab.id, assetId, path, instanceId: instance?.id ?? null };
    } finally {
      nativeProjectMutationInProgress = false;
    }
  }

  async function createPrefabFromSelected() {
    const selected = selectedObject();
    if (!selected) return;
    const baseName = selected.name.replace(/[^A-Za-z0-9_-]+/g, "_") || "Prefab";
    const path = window.prompt("Save native Prefab as", `prefabs/${baseName}.cge-prefab.json`)?.trim();
    if (!path) return;
    try {
      const result = await createNativePrefabFromNode(selected.id, path, baseName);
      log("success", `Created native Prefab ${result.path} and replaced the selected Node with a Prefab instance`);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function addPrefabInstance() {
    const current = scene();
    const prefab = prefabCatalog().find((item) => item.path === selectedPrefabPath());
    if (!current || !prefab || isPrefabDocument(current)) return;
    try {
      const next = addNativePrefabInstance(current as import("@codogma/cge").SceneDocumentV1, prefab.document, { x: 400, y: 300 });
      const instance = getSceneNodeEntries(next, prefabCatalog().map((item) => item.document)).at(-1);
      applySceneChange(next, instance?.id ?? null);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  async function saveProjectManifest(): Promise<boolean> {
    const current = projectDocument();
    if (!current || projectSaving() || nativeProjectMutationInProgress) return false;
    setProjectSaving(true);
    try {
      const content = serializeNativeProjectDocument(current);
      await writeProjectFile(PROJECT_MANIFEST_PATH, content);
      setSavedProjectContent(content);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", `Project manifest save failed: ${message}`);
      setLoadError(message);
      return false;
    } finally {
      setProjectSaving(false);
    }
  }

  async function saveScene(
    allowDuringProjectMutation = false,
    contentOverride?: string,
  ): Promise<boolean> {
    const current = scene();
    const path = scenePath();
    const project = projectDocument();
    if (
      !current || !path || !project || saving() ||
      (nativeProjectMutationInProgress && !allowDuringProjectMutation)
    ) return false;
    setSaving(true);
    try {
      const prefabDocuments = prefabCatalog().map((item) => item.document);
      const content = contentOverride ?? (isPrefabDocument(current)
        ? serializeNativePrefabDocument(project, current, prefabDocuments)
        : serializeNativeSceneDocument(project, current, prefabDocuments));
      await writeProjectFile(path, content);
      setSavedContent(content);
      if (isPrefabDocument(current)) {
        setPrefabCatalog((catalog) => replaceNativePrefabCatalogDocument(catalog, current));
      }
      log("success", `Saved native ${isPrefabDocument(current) ? "Prefab" : "Scene"} ${path}`);
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
    try { applySceneChange(updateSceneNode(current, selected.id, { [key]: value } as SceneNodePatch)); }
    catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function updateObjectProperties(id: string, patch: Record<string, number>) {
    const current = scene();
    if (!current) return;
    try { applySceneChange(updateSceneNode(current, id, patch), id); }
    catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function addFxToSelected(type: FxType) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      applySceneChange(addNativeNodeFx(current, selected.id, type), selected.id);
      log("info", `Added ${type} effect to ${selected.name}`);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function updateSelectedFx(id: string, patch: Partial<Omit<FxObject, "id" | "type">>) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try { applySceneChange(updateNativeNodeFx(current, selected.id, id, patch), selected.id); }
    catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function removeSelectedFx(id: string) {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      applySceneChange(removeNativeNodeFx(current, selected.id, id), selected.id);
      log("info", `Removed FX ${id}`);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function updateSelectedNumber(key: string, event: Event & { currentTarget: HTMLInputElement }) {
    const value = Number(event.currentTarget.value);
    if (!Number.isFinite(value)) return;
    updateSelectedProperty(key, value);
  }

  function addObject(kind: "Image" | "Text" | "Container") {
    const current = scene();
    if (!current || isPrefabDocument(current)) return;
    const assetId = kind === "Image" ? projectDocument()?.assets.find((asset) => asset.kind === "image")?.id : undefined;
    try {
      const next = createSceneNode(current, kind, assetId);
      const created = getSceneNodeEntries(next, prefabCatalog().map((item) => item.document)).at(-1);
      applySceneChange(next, created?.id ?? selectedId());
      setShowObjectMenu(false);
      log("info", `Created ${kind}`);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function deleteSelectedObject() {
    const current = scene();
    const selected = selectedObject();
    if (!current || !selected) return;
    try {
      const next = removeSceneNode(current, selected.id);
      const remaining = getSceneNodeEntries(next, prefabCatalog().map((item) => item.document));
      applySceneChange(next, remaining[0]?.id ?? null);
      log("info", `Removed ${selected.name}`);
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  async function saveActiveDocument() {
    if (activeViewport() === "Source" && scriptSourcePath()) return saveTypeScriptFile();
    if (layout().bottomTab === "Animation" && animationDocument()) return saveAnimationFile();
    if (projectDirty() && !(await saveProjectManifest())) return false;
    return saveScene();
  }

  function getMaximumSidePanelWidth(kind: "left" | "right"): number {
    const compactMaximum = kind === "left" ? 194 : 250;
    const wideMaximum = kind === "left" ? 360 : 420;
    // Keep the established 781–920 px compact widths, then release the
    // constraint gradually until both wide panels fit alongside a 320 px Scene.
    const progress = Math.min(1, Math.max(0, (viewportWidth() - 920) / 188));
    return Math.round(compactMaximum + (wideMaximum - compactMaximum) * progress);
  }

  function getDisplayedSidePanelWidth(
    kind: "left" | "right",
    current: WorkspaceLayout = layout(),
  ): number {
    const requestedWidth = kind === "left" ? current.leftWidth : current.rightWidth;
    return Math.min(requestedWidth, getMaximumSidePanelWidth(kind));
  }

  function getMinimumBottomHeight(): number {
    const headerHeight = compactWorkbench() ? 88 : 95;
    // Below the normal workspace minimum, allow Bottom to shrink only as far
    // as its tabs and the minimum detached Console can physically fit.
    const availableHeight =
      viewportHeight() - headerHeight - 72 - 4 - 30;
    return Math.max(89, Math.min(150, availableHeight));
  }

  function getMinimumCenterHeight(): number {
    const headerHeight = compactWorkbench() ? 88 : 95;
    const preferredMinimum = narrowWorkbench() ? 260 : 220;
    const availableHeight =
      viewportHeight() - headerHeight - getMinimumBottomHeight() - 4 - 30;
    return Math.max(72, Math.min(preferredMinimum, availableHeight));
  }

  function getMaximumBottomHeight(): number {
    const headerHeight = compactWorkbench() ? 88 : 95;
    return Math.max(
      getMinimumBottomHeight(),
      Math.min(
        420,
        viewportHeight() - headerHeight - getMinimumCenterHeight() - 4 - 30,
      ),
    );
  }

  function getDisplayedBottomHeight(current: WorkspaceLayout = layout()): number {
    return Math.min(current.bottomHeight, getMaximumBottomHeight());
  }

  function getDisplayedConsoleHeight(current: WorkspaceLayout = layout()): number {
    return Math.min(
      current.consoleHeight,
      getMaximumConsoleHeight(getDisplayedBottomHeight(current)),
    );
  }

  function startResize(
    kind: "left" | "right" | "bottom" | "console",
    event: PointerEvent & { currentTarget: HTMLDivElement },
  ) {
    if (resizeState) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const current = layout();
    resizeState = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialValue:
        kind === "left"
          ? getDisplayedSidePanelWidth("left", current)
          : kind === "right"
            ? getDisplayedSidePanelWidth("right", current)
            : kind === "bottom"
              ? getDisplayedBottomHeight(current)
              : getDisplayedConsoleHeight(current),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSplitterKeyDown(
    kind: "left" | "right" | "bottom" | "console",
    event: KeyboardEvent,
  ) {
    const step = event.shiftKey ? 48 : 16;
    const key = event.key;
    let direction = 0;
    if (key === "Home" || key === "End") {
      direction = key === "Home" ? -1 : 1;
    } else if (kind === "left" && key === "ArrowRight") direction = 1;
    else if (kind === "left" && key === "ArrowLeft") direction = -1;
    else if (kind === "right" && key === "ArrowLeft") direction = 1;
    else if (kind === "right" && key === "ArrowRight") direction = -1;
    else if ((kind === "bottom" || kind === "console") && key === "ArrowUp") direction = 1;
    else if ((kind === "bottom" || kind === "console") && key === "ArrowDown") direction = -1;
    else return;

    event.preventDefault();
    setLayout((current) => {
      const keyName =
        kind === "left" ? "leftWidth" :
        kind === "right" ? "rightWidth" :
        kind === "bottom" ? "bottomHeight" : "consoleHeight";
      const customizedKey =
        kind === "left" ? "leftWidthCustomized" :
        kind === "right" ? "rightWidthCustomized" :
        kind === "bottom" ? "bottomHeightCustomized" : "consoleHeightCustomized";
      const minimum =
        kind === "left" ? 170 :
        kind === "right" ? 210 :
        kind === "bottom" ? getMinimumBottomHeight() : 56;
      const maximum =
        kind === "left" || kind === "right"
          ? getMaximumSidePanelWidth(kind)
          : kind === "bottom"
            ? getMaximumBottomHeight()
            : getMaximumConsoleHeight(getDisplayedBottomHeight(current));
      const value =
        kind === "left" || kind === "right"
          ? getDisplayedSidePanelWidth(kind, current)
          : kind === "bottom"
            ? getDisplayedBottomHeight(current)
            : getDisplayedConsoleHeight(current);
      const next = key === "Home"
        ? minimum
        : key === "End"
          ? maximum
          : Math.min(maximum, Math.max(minimum, value + direction * step));
      // A no-op at a responsive limit must not overwrite the persisted
      // preference that is temporarily larger than the current viewport.
      if (next === value) return current;
      return { ...current, [keyName]: next, [customizedKey]: true };
    });
  }

  function moveResize(event: PointerEvent) {
    if (
      !resizeState ||
      resizeState.pointerId !== event.pointerId ||
      (event.buttons !== 1 && event.pointerType !== "touch")
    ) return;
    const { kind, startX, startY, initialValue } = resizeState;
    if (kind === "left") {
      setLayout((current) => {
        const leftWidth = Math.min(
          getMaximumSidePanelWidth("left"),
          Math.max(170, initialValue + event.clientX - startX),
        );
        if (leftWidth === getDisplayedSidePanelWidth("left", current)) return current;
        return { ...current, leftWidth, leftWidthCustomized: true };
      });
    } else if (kind === "right") {
      setLayout((current) => {
        const rightWidth = Math.min(
          getMaximumSidePanelWidth("right"),
          Math.max(210, initialValue + startX - event.clientX),
        );
        if (rightWidth === getDisplayedSidePanelWidth("right", current)) return current;
        return { ...current, rightWidth, rightWidthCustomized: true };
      });
    } else if (kind === "bottom") {
      setLayout((current) => {
        const bottomHeight = Math.min(
          getMaximumBottomHeight(),
          Math.max(getMinimumBottomHeight(), initialValue + startY - event.clientY),
        );
        if (bottomHeight === getDisplayedBottomHeight(current)) return current;
        return { ...current, bottomHeight, bottomHeightCustomized: true };
      });
    } else {
      setLayout((current) => {
        const consoleHeight = Math.min(
          getMaximumConsoleHeight(getDisplayedBottomHeight(current)),
          Math.max(56, initialValue + startY - event.clientY),
        );
        if (consoleHeight === getDisplayedConsoleHeight(current)) return current;
        return { ...current, consoleHeight, consoleHeightCustomized: true };
      });
    }
  }

  function endResize(event: PointerEvent) {
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    resizeState = undefined;
  }

  function resetSplitter(kind: "left" | "right" | "bottom" | "console") {
    const defaults = createDefaultWorkspaceLayout(compactWorkbench());
    setLayout((current) => {
      if (kind === "left") return { ...current, leftWidth: defaults.leftWidth, leftWidthCustomized: false };
      if (kind === "right") return { ...current, rightWidth: defaults.rightWidth, rightWidthCustomized: false };
      if (kind === "bottom") return { ...current, bottomHeight: defaults.bottomHeight, bottomHeightCustomized: false };
      return { ...current, consoleHeight: defaults.consoleHeight, consoleHeightCustomized: false };
    });
  }

  function getStoredPanelZone(panel: SidePanelId): DockZone {
    return panel === "Hierarchy" ? layout().hierarchyZone : layout().inspectorZone;
  }

  function getEffectivePanelZone(panel: SidePanelId): DockZone {
    return narrowWorkbench() ? "bottom" : getStoredPanelZone(panel);
  }

  function isDockPanelActive(panel: SidePanelId): boolean {
    const current = layout();
    const visible = panel === "Hierarchy"
      ? current.hierarchyVisible
      : current.inspectorVisible;
    if (!visible) return false;

    const zone = getEffectivePanelZone(panel);
    if (zone === "left") return current.leftActivePanel === panel;
    if (zone === "right") return current.rightActivePanel === panel;
    return current.bottomTab === panel;
  }

  function getDockContent(zone: DockZone): HTMLDivElement | undefined {
    return zone === "left"
      ? leftDockedContent
      : zone === "right"
        ? rightDockedContent
        : bottomDockedContent;
  }

  function movePanelElementToZone(panel: SidePanelId, zone: DockZone): boolean {
    const node = panel === "Hierarchy"
      ? hierarchyPanelElement
      : inspectorPanelElement;
    const target = getDockContent(zone);
    if (!node || !target) return false;

    const activeElement =
      document.activeElement instanceof HTMLElement &&
      node.contains(document.activeElement)
        ? document.activeElement
        : null;

    if (node.parentElement !== target) target.appendChild(node);
    if (activeElement) {
      queueMicrotask(() => {
        if (activeElement.isConnected) {
          activeElement.focus({ preventScroll: true });
        }
      });
    }
    return true;
  }

  function syncDockPanelElements() {
    movePanelElementToZone("Hierarchy", getEffectivePanelZone("Hierarchy"));
    movePanelElementToZone("Inspector", getEffectivePanelZone("Inspector"));
  }

  function activateSidePanel(panel: SidePanelId) {
    setLayout((current) => selectSidePanel(current, panel));
  }

  function handleDockTabKeyDown(
    event: KeyboardEvent & { currentTarget: HTMLButtonElement },
    zone: DockZone,
  ) {
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=\"tab\"]") ?? [],
    );
    const index = tabs.indexOf(event.currentTarget);
    if (index < 0 || tabs.length === 0) return;
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    nextTab.focus({ preventScroll: true });
    const nextValue = nextTab.dataset.dockTab;
    if (zone === "bottom") {
      if (nextValue === "Project" || nextValue === "Animation" || nextValue === "Components" || nextValue === "Console" || nextValue === "Hierarchy" || nextValue === "Inspector") activateBottomTab(nextValue);
    } else if (nextValue === "Hierarchy" || nextValue === "Inspector") {
      activateSidePanel(nextValue);
    }
  }

  function activateBottomTab(tab: BottomTab) {
    setLayout((current) => {
      if (
        (tab === "Hierarchy" || tab === "Inspector") &&
        !narrowWorkbench()
      ) {
        return selectSidePanel(current, tab);
      }
      return { ...current, bottomTab: tab };
    });
  }

  function dockSidePanel(
    panel: SidePanelId,
    zone: DockZone = "bottom",
    announce = true,
  ) {
    if (!movePanelElementToZone(panel, zone)) {
      log("error", `Cannot dock ${panel}: its panel mount or target zone is unavailable.`);
      return;
    }

    setLayout((current) => moveDockablePanel(current, panel, zone, compactWorkbench()));
    if (announce) {
      const zoneLabel = zone === "left" ? "Left" : zone === "right" ? "Right" : "Bottom";
      log("success", `${panel} docked in the ${zoneLabel} workspace`);
    }
  }

  function undockSidePanel(panel: SidePanelId) {
    const home = getSidePanelHomeZone(panel);
    if (getStoredPanelZone(panel) === home) return;

    if (narrowWorkbench()) {
      // On narrow screens the panel is still presented inside Bottom. Update
      // its permanent home zone without moving its DOM node into a hidden dock.
      if (!movePanelElementToZone(panel, "bottom")) {
        log("error", `Cannot return ${panel} to its home dock: its Bottom mount is unavailable.`);
        return;
      }
      setLayout((current) => ({
        ...moveDockablePanel(current, panel, home, compactWorkbench()),
        bottomTab: panel,
      }));
      focusDockTab(panel, "bottom");
    } else {
      dockSidePanel(panel, home, false);
    }

    log("info", `${panel} returned to its default dock`);
  }

  function closeSidePanel(panel: SidePanelId) {
    const zone = getEffectivePanelZone(panel);
    const next = setSidePanelVisibility(
      layout(),
      panel,
      false,
      compactWorkbench(),
      narrowWorkbench(),
    );
    setLayout(next);
    const fallback = zone === "left"
      ? next.leftActivePanel
      : zone === "right"
        ? next.rightActivePanel
        : next.bottomTab;
    queueMicrotask(() => {
      const target = fallback
        ? document.querySelector<HTMLButtonElement>(
            `[data-dock-zone="${zone}"] [data-dock-tab="${fallback}"], [data-testid="bottom-tabs"] [data-dock-tab="${fallback}"]`,
          )
        : null;
      (target ?? document.querySelector<HTMLButtonElement>(
        "[data-testid=\"bottom-tabs\"] [data-dock-tab=\"Project\"]",
      ))?.focus({ preventScroll: true });
    });
    log("info", panel + " panel closed");
  }

  function focusBottomTab(tab: BottomTab) {
    queueMicrotask(() => {
      document.querySelector<HTMLButtonElement>(
        `[data-testid="bottom-tabs"] [data-dock-tab="${tab}"]`,
      )?.focus({ preventScroll: true });
    });
  }

  function closeConsole() {
    const next = setConsolePanelVisibility(
      layout(),
      false,
      compactWorkbench(),
      narrowWorkbench(),
    );
    setLayout(next);
    focusBottomTab(next.bottomTab);
    log("info", "Console panel closed");
  }

  function openBottomPanel(panel: BottomWorkspacePanel) {
    setLayout((current) =>
      setBottomPanelVisibility(current, panel, true, compactWorkbench(), narrowWorkbench()),
    );
    focusBottomTab(panel);
  }

  function toggleBottomPanel(panel: BottomWorkspacePanel) {
    const visible = panel === "Project"
      ? layout().projectVisible
      : panel === "Animation"
        ? layout().animationVisible
        : layout().componentsVisible;
    setLayout((current) =>
      setBottomPanelVisibility(current, panel, !visible, compactWorkbench(), narrowWorkbench()),
    );
    if (!visible) focusBottomTab(panel);
  }

  function closeBottomPanel(panel: BottomTab) {
    if (panel === "Hierarchy" || panel === "Inspector") {
      closeSidePanel(panel);
      return;
    }
    if (panel === "Console") {
      closeConsole();
      return;
    }

    const next = setBottomPanelVisibility(
      layout(),
      panel,
      false,
      compactWorkbench(),
      narrowWorkbench(),
    );
    setLayout(next);
    focusBottomTab(next.bottomTab);
    log("info", panel + " panel closed");
  }

  function openConsole() {
    const next = setConsolePanelVisibility(
      layout(),
      true,
      compactWorkbench(),
      narrowWorkbench(),
    );
    setLayout(next);

    queueMicrotask(() => {
      if (compactWorkbench() || next.consoleDocked) {
        document.querySelector<HTMLButtonElement>(
          '[data-testid="bottom-tabs"] [data-dock-tab="Console"]',
        )?.focus({ preventScroll: true });
        return;
      }

      const consolePanel = document.querySelector<HTMLElement>(".desktop-console-panel");
      consolePanel?.scrollIntoView({ block: "nearest" });
      consolePanel?.querySelector<HTMLSelectElement>(
        '[aria-label="Console message filter"]',
      )?.focus({ preventScroll: true });
    });
  }

  function toggleConsoleVisibility() {
    if (layout().consoleVisible) closeConsole();
    else openConsole();
  }

  function focusDockTab(panel: SidePanelId, zone: DockZone) {
    queueMicrotask(() => {
      const selector = zone === "bottom"
        ? `[data-testid="bottom-tabs"] [data-dock-tab="${panel}"]`
        : `[data-dock-zone="${zone}"] [data-dock-tab="${panel}"]`;
      document.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
    });
  }

  function focusWorkspacePanel(panel: SidePanelId) {
    focusDockTab(panel, getEffectivePanelZone(panel));
  }

  function toggleSidePanel(panel: SidePanelId) {
    const isVisible = panel === "Hierarchy"
      ? layout().hierarchyVisible
      : layout().inspectorVisible;
    setLayout((current) => {
      const next = setSidePanelVisibility(
        current,
        panel,
        !isVisible,
        compactWorkbench(),
        narrowWorkbench(),
      );
      if (!isVisible && narrowWorkbench()) next.bottomTab = panel;
      return next;
    });
    if (!isVisible) focusWorkspacePanel(panel);
  }

  function resetWorkbenchLayout() {
    const defaults = createDefaultWorkspaceLayout(compactWorkbench());
    movePanelElementToZone("Hierarchy", narrowWorkbench() ? "bottom" : "left");
    movePanelElementToZone("Inspector", narrowWorkbench() ? "bottom" : "right");
    setLayout(defaults);
    log("info", "Workspace layout restored to defaults");
  }

  function startDockPointerDrag(
    event: PointerEvent & { currentTarget: HTMLElement },
    panel: BottomTab,
    source: "tab" | "header",
  ) {
    if (event.button !== 0 || event.isPrimary === false || dockPointerDrag || resizeState) return;
    if (source === "header" && event.target instanceof Element &&
      event.target.closest("button, input, select, textarea, a, [role=\"button\"]")) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    if (source === "tab") suppressDockTabClick = false;
    dockPointerDrag = {
      panel, pointerId: event.pointerId, pointerType: event.pointerType,
      startX: event.clientX, startY: event.clientY, active: false,
      source, captureElement: event.currentTarget,
    };
    setDockDropTarget(null);
  }

  function getDockDropTargetAt(clientX: number, clientY: number, source: BottomTab): DockDropTarget | null {
    const element = document.elementFromPoint(clientX, clientY);
    if (!(element instanceof Element)) return null;
    const zoneValue = element.closest<HTMLElement>("[data-dock-zone]")?.dataset.dockZone;
    if (zoneValue !== "left" && zoneValue !== "right" && zoneValue !== "bottom") return null;
    const zone: DockZone = zoneValue;
    if (!isDockTargetAllowed(source, zone)) return null;
    const tabElement = element.closest<HTMLElement>("[data-dock-tab]");
    const tabValue = tabElement?.dataset.dockTab;
    const validTabs: readonly BottomTab[] = ["Project","Animation","Components","Console","Hierarchy","Inspector"];
    if (tabElement && tabValue && validTabs.includes(tabValue as BottomTab) && tabValue !== source) {
      const bounds = tabElement.getBoundingClientRect();
      return { zone, kind: "tab", target: tabValue as BottomTab,
        insertion: clientX < bounds.left + bounds.width / 2 ? "before" : "after" };
    }
    if (tabValue === source) return null;
    return { zone, kind: "group" };
  }

  function moveDockPointerDrag(event: PointerEvent) {
    const drag = dockPointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const threshold = drag.pointerType === "touch" ? 8 : 6;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < threshold) return;
      drag.active = true;
      setDraggedDockPanel(drag.panel);
    }
    if (event.pointerType !== "touch" && event.buttons !== 1) return;
    event.preventDefault();
    setDockDragPosition({ x: event.clientX, y: event.clientY });
    setDockDropTarget(getDockDropTargetAt(event.clientX, event.clientY, drag.panel));
  }

  function reorderDockPanelTab(source: BottomTab, target: BottomTab, zone: DockZone,
    insertion: "before" | "after" = "after") {
    setLayout((current) => reorderWorkspaceDockTab(
      current, source, target, zone, compactWorkbench(), narrowWorkbench(), insertion,
    ));
  }

  function commitDockDrop(panel: BottomTab, target: DockDropTarget) {
    if (panel === "Hierarchy" || panel === "Inspector") {
      const transientNarrowBottom = narrowWorkbench() && target.zone === "bottom";
      if (transientNarrowBottom) {
        if (target.kind === "tab") reorderDockPanelTab(panel, target.target, target.zone, target.insertion);
        else activateBottomTab(panel);
      } else {
        const currentZone = getStoredPanelZone(panel);
        if (target.zone !== currentZone) dockSidePanel(panel, target.zone);
        if (target.kind === "tab") reorderDockPanelTab(panel, target.target, target.zone, target.insertion);
        else if (target.zone === currentZone) activateSidePanel(panel);
      }
      focusDockTab(panel, target.zone);
      return;
    }
    if (panel === "Console" && !compactWorkbench() && !layout().consoleDocked) {
      setLayout((current) => ({ ...current, consoleDocked: true, bottomTab: "Console" }));
    }
    if (target.kind === "tab") reorderDockPanelTab(panel, target.target, target.zone, target.insertion);
    else activateBottomTab(panel);
  }

  function finishDockPointerDrag(event: PointerEvent) {
    const drag = dockPointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = drag.active ? getDockDropTargetAt(event.clientX, event.clientY, drag.panel) : null;
    dockPointerDrag = undefined;
    setDockDropTarget(null);
    setDraggedDockPanel(null);
    if (drag.source === "tab") suppressDockTabClick = drag.active;
    if (target) commitDockDrop(drag.panel, target);
  }

  function cancelDockPointerDrag(pointerId?: number, releaseCapture = true) {
    const drag = dockPointerDrag;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    dockPointerDrag = undefined;
    setDockDropTarget(null);
    setDraggedDockPanel(null);
    suppressDockTabClick = false;
    if (releaseCapture && drag.captureElement.hasPointerCapture(drag.pointerId)) {
      drag.captureElement.releasePointerCapture(drag.pointerId);
    }
  }

  function shouldIgnoreDockTabClick(event: MouseEvent): boolean {
    if (!suppressDockTabClick) return false;
    suppressDockTabClick = false;
    return event.detail > 0;
  }

  function isDockTargetAllowed(panel: BottomTab, zone: DockZone): boolean {
    if (panel === "Hierarchy" || panel === "Inspector") return zone === "bottom" || !narrowWorkbench();
    return zone === "bottom";
  }

  function isSideDockDragActive(): boolean {
    const panel = draggedDockPanel();
    return !narrowWorkbench() && (panel === "Hierarchy" || panel === "Inspector");
  }

  function isLeftDockZoneAvailable(): boolean {
    return leftDockPanels().length > 0 || isSideDockDragActive();
  }

  function isRightDockZoneAvailable(): boolean {
    return rightDockPanels().length > 0 || isSideDockDragActive();
  }

  function isEmptySideDockDropTarget(zone: "left" | "right"): boolean {
    if (!isSideDockDragActive()) return false;
    return zone === "left" ? leftDockPanels().length === 0 : rightDockPanels().length === 0;
  }

  function isDockGroupPreview(zone: DockZone): boolean {
    const target = dockDropTarget();
    return target?.zone === zone && target.kind === "group";
  }

  function isDockTabInsertionTarget(tab: BottomTab, insertion: "before" | "after"): boolean {
    const target = dockDropTarget();
    return target?.kind === "tab" && target.target === tab && target.insertion === insertion;
  }

  function handleWorkspacePointerMove(event: PointerEvent) {
    moveResize(event);
    moveDockPointerDrag(event);
  }

  function handleWorkspacePointerUp(event: PointerEvent) {
    endResize(event);
    finishDockPointerDrag(event);
  }

  function handleWorkspacePointerCancel(event: PointerEvent) {
    endResize(event);
    cancelDockPointerDrag(event.pointerId, false);
  }

  function handleWorkspaceLostPointerCapture(event: PointerEvent) {
    endResize(event);
    cancelDockPointerDrag(event.pointerId, false);
  }

  function undockConsole() {
    setLayout((current) => {
      const next = { ...current, consoleDocked: false };
      const visibleTabs = getVisibleBottomTabs(
        next,
        compactWorkbench(),
        narrowWorkbench(),
      );
      return {
        ...next,
        bottomTab: visibleTabs.includes("Project")
          ? "Project"
          : (visibleTabs[0] ?? "Project"),
      };
    });
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
    if (!(event.target instanceof Element)) return;

    const openMenuButton = document.querySelector<HTMLButtonElement>(
      '.menu-button[aria-expanded="true"]',
    );
    const openMenuRoot = openMenuButton?.closest(".menu-root");
    if (activeMenu() && (!openMenuRoot || !openMenuRoot.contains(event.target))) {
      setActiveMenu("");
    }

    if (showObjectMenu() && !event.target.closest(".add-object-anchor")) {
      setShowObjectMenu(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    const target = event.target;
    const isEditable =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

    if (event.key === "Escape") {
      if (dockPointerDrag) {
        event.preventDefault();
        cancelDockPointerDrag();
        return;
      }
      if (paletteOpen()) closePalette();
      setActiveMenu("");
      setShowObjectMenu(false);
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
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
    const previousNarrow = narrowWorkbench();
    setViewportWidth(window.innerWidth);
    setViewportHeight(window.innerHeight);
    const nextNarrow = window.innerWidth <= 780;

    if (previousCompact !== nextCompact) {
      setCompactWorkbench(nextCompact);
      setLayout((current) => {
        const previousDefaults = createDefaultWorkspaceLayout(previousCompact);
        const nextDefaults = createDefaultWorkspaceLayout(nextCompact);
        const nextLayout = {
          ...current,
          leftWidth: !current.leftWidthCustomized && current.leftWidth === previousDefaults.leftWidth ? nextDefaults.leftWidth : current.leftWidth,
          rightWidth: !current.rightWidthCustomized && current.rightWidth === previousDefaults.rightWidth ? nextDefaults.rightWidth : current.rightWidth,
          bottomHeight: !current.bottomHeightCustomized && current.bottomHeight === previousDefaults.bottomHeight ? nextDefaults.bottomHeight : current.bottomHeight,
          consoleHeight: !current.consoleHeightCustomized && current.consoleHeight === previousDefaults.consoleHeight ? nextDefaults.consoleHeight : current.consoleHeight,
          bottomTab:
            !nextCompact && !current.consoleDocked && current.bottomTab === "Console"
              ? "Project"
              : current.bottomTab,
        };
        return nextLayout;
      });
    }

    if (previousNarrow !== nextNarrow) {
      setNarrowWorkbench(nextNarrow);
      if (!nextNarrow) {
        setLayout((current) => {
          const selectedTransientSidePanel =
            (current.bottomTab === "Hierarchy" && current.hierarchyZone !== "bottom") ||
            (current.bottomTab === "Inspector" && current.inspectorZone !== "bottom");
          return selectedTransientSidePanel
            ? { ...current, bottomTab: "Project" }
            : current;
        });
      }
      queueMicrotask(syncDockPanelElements);
    }
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
      const result = await getProjectDirectorySnapshot();
      setProjectTree(result.root);
      setProjectName(result.root.name);
      log("info", "Project files changed outside the active editor document; Project tree refreshed.");
    } catch (error) {
      log("warning", `Could not refresh the Project tree after an MCP file change: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function readMcpString(value: unknown, field: string): string {
    if (typeof value !== "string" || !value.trim()) throw new Error(`MCP command requires a non-empty ${field}.`);
    return value.trim();
  }

  function requireActiveMcpDocument(args: Record<string, unknown>, allowPrefab = true): EditorDocument {
    const requestedPath = args.path === undefined ? scenePath() : readMcpPath(args.path, "path");
    const current = scene();
    if (!requestedPath || requestedPath !== scenePath() || !current) {
      throw new Error("The requested native document is not the active document in the SolidJS Editor Host.");
    }
    if (!allowPrefab && isPrefabDocument(current)) {
      throw new Error("This operation requires an active native Scene, not a Prefab document.");
    }
    return current;
  }

  async function persistMcpSceneChange(next: EditorDocument, selectionAfter = selectedId()) {
    if (saving() || nativeProjectMutationInProgress) {
      throw new Error("A native document operation is already in progress. Retry the MCP mutation after it completes.");
    }

    const rollback = applySceneChange(next, selectionAfter);
    if (!rollback) {
      throw new Error("The active native document changed state before the MCP mutation could be applied.");
    }

    if (!(await saveScene())) {
      const restored = resolveDocumentChangeRollback(scene(), history(), selectedId(), rollback);
      if (restored) {
        const validSelection = restored.selectedId !== null &&
          restored.document !== null &&
          getSceneNodeEntries(restored.document, prefabCatalog().map((item) => item.document))
            .some((entry) => entry.id === restored.selectedId);
        setScene(restored.document);
        setHistory(restored.state);
        setSelectedId(validSelection ? restored.selectedId : rollback.previousSelection);
      } else {
        log("warning", "Native document save failed after a subsequent state change; newer editor state was preserved instead of applying an unsafe rollback.");
      }
      throw new Error("The native document change could not be saved.");
    }
    return next;
  }

  const editorMcpHandlers: Record<string, EditorMcpHandler> = {
    "scene-list": async () => {
      const project = projectDocument();
      if (!project) throw new Error("The native Project manifest is not loaded.");
      return project.scenes.map((reference) => {
        const asset = project.assets.find((item) => item.id === reference.assetId);
        return { id: reference.id, assetId: reference.assetId, path: asset?.path ?? null };
      });
    },
    "scene-get-active": async () => {
      const current = scene();
      const path = scenePath();
      if (!current || !path) throw new Error("There is no native document open in the SolidJS Editor Host.");
      return { path, id: current.id, name: current.name, documentType: isPrefabDocument(current) ? "prefab" : "scene" };
    },
    "scene-open": async (args) => {
      const requestedPath = readMcpPath(args.path, "path");
      const opened = await loadScene(requestedPath);
      if (!opened || scenePath() !== requestedPath) {
        throw new Error(`Native document "${requestedPath}" was not opened. The operation may have been cancelled or the file is invalid.`);
      }
      return { path: requestedPath, id: scene()?.id ?? null };
    },
    "scene-save": async (args) => {
      const requestedPath = args.path === undefined ? scenePath() : readMcpPath(args.path, "path");
      if (!requestedPath || scenePath() !== requestedPath) {
        throw new Error("The requested native document is not the active document.");
      }
      if (!(await saveScene())) throw new Error(`Could not save native document "${requestedPath}".`);
      return { path: requestedPath, saved: true };
    },
    "scene-create": async (args) => {
      if (nativeProjectMutationInProgress) throw new Error("Another native Project document transaction is already in progress.");
      if (activeSceneLoads > 0) throw new Error("A native Scene or Prefab document is currently opening.");
      if (saving() || projectSaving()) throw new Error("A native document or Project manifest save is in progress.");
      nativeProjectMutationInProgress = true;
      try {
      const project = projectDocument();
      if (!project) throw new Error("The native Project manifest is not loaded.");
      if (dirty() || projectDirty() || animationDirty() || scriptDirty()) throw new Error("Save the active native document, Animation and Script changes before creating another Scene.");
      const name = readMcpString(args.name, "name");
      const path = readMcpPath(args.path, "path");
      const sceneDocument = createNativeSceneDocument(name);
      const assetId = globalThis.crypto?.randomUUID?.();
      if (!assetId) throw new Error("Secure randomUUID support is required to register native Project assets.");
      const nextProject = registerNativeScene(project, sceneDocument, assetId, path);
      const sceneContent = serializeNativeSceneDocument(nextProject, sceneDocument);
      const manifestContent = serializeNativeProjectDocument(nextProject);
      assertNewProjectFilePath(path);
      const directory = path.split("/").slice(0, -1).join("/");
      if (directory) await ensureProjectFolder(directory);
      await writeProjectFile(path, sceneContent);
      try {
        await writeProjectFile(PROJECT_MANIFEST_PATH, manifestContent);
      } catch (error) {
        try { await deleteProjectEntries([path]); }
        catch (rollbackError) {
          throw new Error(`Project manifest update failed and the new Scene could not be rolled back: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, { cause: error });
        }
        throw error;
      }
      setProjectDocument(nextProject);
      setSavedProjectContent(manifestContent);
      const opened = await loadScene(path, true, true);
      if (!opened) {
        log("warning", `Native Scene "${path}" was created and registered, but could not be opened automatically.`);
      }
      try {
        await refreshProjectTree();
      } catch (error) {
        log("warning", `Native Scene was created, but the Project tree could not be refreshed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { id: sceneDocument.id, assetId, path, name: sceneDocument.name, opened };
      } finally {
        nativeProjectMutationInProgress = false;
      }
    },
    "scene-get-document": async (args) => {
      const current = requireActiveMcpDocument(args);
      return current;
    },
    "scene-get-nodes": async (args) => {
      const current = requireActiveMcpDocument(args);
      return getSceneNodeEntries(current, prefabCatalog().map((item) => item.document)).map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        parentId: entry.parentId,
        depth: entry.depth,
        node: entry.node,
      }));
    },
    "scene-create-node": async (args) => {
      const current = requireActiveMcpDocument(args);
      const kind = readMcpString(args.kind, "kind");
      if (kind !== "Image" && kind !== "Text" && kind !== "Container") {
        throw new Error('Native Node kind must be "Image", "Text" or "Container".');
      }
      const before = new Set(getSceneNodeEntries(current).map((entry) => entry.id));
      let next = createSceneNode(current, kind as SceneNodeKind, typeof args.assetId === "string" ? args.assetId : undefined);
      const created = getSceneNodeEntries(next).find((entry) => !before.has(entry.id));
      if (!created) throw new Error("Native Node creation did not produce a new identity.");
      if (args.parentId !== undefined && args.parentId !== null) {
        next = reparentSceneNode(next, created.id, readMcpString(args.parentId, "parentId"));
      }
      await persistMcpSceneChange(next, created.id);
      return { id: created.id, kind, path: scenePath() };
    },
    "scene-update-node": async (args) => {
      const current = requireActiveMcpDocument(args);
      const nodeId = readMcpString(args.nodeId, "nodeId");
      if (args.patch === null || typeof args.patch !== "object" || Array.isArray(args.patch)) {
        throw new Error("MCP command requires a patch object.");
      }
      const next = updateSceneNode(current, nodeId, args.patch as SceneNodePatch);
      await persistMcpSceneChange(next, nodeId);
      return { id: nodeId, updated: true };
    },
    "scene-delete-node": async (args) => {
      const current = requireActiveMcpDocument(args);
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const next = removeSceneNode(current, nodeId);
      const remaining = getSceneNodeEntries(next, prefabCatalog().map((item) => item.document));
      await persistMcpSceneChange(next, remaining[0]?.id ?? null);
      return { id: nodeId, deleted: true };
    },
    "scene-reparent-node": async (args) => {
      const current = requireActiveMcpDocument(args);
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const parentId = args.parentId === null ? null : readMcpString(args.parentId, "parentId");
      const next = reparentSceneNode(current, nodeId, parentId);
      await persistMcpSceneChange(next, nodeId);
      return { id: nodeId, parentId };
    },
    "scene-clear": async (args) => {
      const current = requireActiveMcpDocument(args, false);
      const removedCount = getSceneNodeEntries(current).length;
      const next = { ...current, rootNodes: [] } as import("@codogma/cge").SceneDocumentV1;
      await persistMcpSceneChange(next, null);
      return { removedCount, cleared: true };
    },
    "prefab-list": async () => {
      const project = projectDocument();
      if (!project) throw new Error("The native Project manifest is not loaded.");
      return prefabCatalog().map((item) => ({
        id: item.document.id,
        name: item.document.name,
        path: item.path,
        assetId: item.assetId,
      }));
    },
    "prefab-get": async (args) => {
      const prefabId = readMcpString(args.prefabId, "prefabId");
      const prefab = prefabCatalog().find((item) => item.document.id === prefabId);
      if (!prefab) throw new Error(`Native Prefab "${prefabId}" was not found in the Project manifest.`);
      return prefab.document;
    },
    "prefab-create": async (args) => {
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const path = readMcpPath(args.path, "path");
      const name = typeof args.name === "string" ? args.name : undefined;
      const result = await createNativePrefabFromNode(nodeId, path, name);
      return result;
    },
    "prefab-instantiate": async (args) => {
      const current = requireActiveMcpDocument(args, false);
      const prefabId = readMcpString(args.prefabId, "prefabId");
      const prefab = prefabCatalog().find((item) => item.document.id === prefabId);
      if (!prefab) throw new Error(`Native Prefab "${prefabId}" was not found in the Project manifest.`);
      const before = new Set(getSceneNodeEntries(current).map((entry) => entry.id));
      const next = addNativePrefabInstance(current as import("@codogma/cge").SceneDocumentV1, prefab.document, {
        ...(typeof args.name === "string" ? { name: args.name } : {}),
        ...(typeof args.x === "number" ? { x: args.x } : {}),
        ...(typeof args.y === "number" ? { y: args.y } : {}),
        ...(typeof args.parentId === "string" ? { parentId: args.parentId } : {}),
      });
      const instance = getSceneNodeEntries(next).find((entry) => !before.has(entry.id));
      if (!instance) throw new Error("Native Prefab instantiation did not produce a new Node identity.");
      await persistMcpSceneChange(next, instance.id);
      return { instanceId: instance.id, prefabId, path: scenePath() };
    },
    "component-attach": async (args) => {
      const current = requireActiveMcpDocument(args);
      const project = projectDocument();
      if (!project) throw new Error("The native Project manifest is not loaded.");
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const typeId = readMcpString(args.typeId, "typeId");
      const properties = args.properties === undefined ? {} : args.properties;
      if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
        throw new Error("Component properties must be an object.");
      }
      const before = new Set(findSceneNode(current, nodeId)?.components.map((item) => item.id) ?? []);
      const next = attachNativeComponent(current, nodeId, typeId, { project }, properties as Record<string, unknown>);
      const instance = findSceneNode(next, nodeId)?.components.find((item) => !before.has(item.id));
      if (!instance) throw new Error("Native Component attach did not produce an instance identity.");
      await persistMcpSceneChange(next, nodeId);
      return { nodeId, instanceId: instance.id, typeId };
    },
    "component-detach": async (args) => {
      const current = requireActiveMcpDocument(args);
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const instanceId = readMcpString(args.instanceId, "instanceId");
      const next = detachNativeComponent(current, nodeId, instanceId);
      await persistMcpSceneChange(next, nodeId);
      return { nodeId, instanceId, detached: true };
    },
    "component-set-enabled": async (args) => {
      const current = requireActiveMcpDocument(args);
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const instanceId = readMcpString(args.instanceId, "instanceId");
      if (typeof args.enabled !== "boolean") throw new Error("Component enabled must be boolean.");
      const next = setNativeComponentEnabled(current, nodeId, instanceId, args.enabled);
      await persistMcpSceneChange(next, nodeId);
      return { nodeId, instanceId, enabled: args.enabled };
    },
    "fx-add": async (args) => {
      const current = requireActiveMcpDocument(args);
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const type = readMcpString(args.type, "type") as FxType;
      const before = new Set(findSceneNode(current, nodeId)?.components.map((item) => item.id) ?? []);
      const next = addNativeNodeFx(current, nodeId, type);
      const effect = findSceneNode(next, nodeId)?.components.find((item) => !before.has(item.id));
      if (!effect) throw new Error("Native FX add did not produce an instance identity.");
      await persistMcpSceneChange(next, nodeId);
      return { nodeId, effectId: effect.id, type };
    },
    "fx-update": async (args) => {
      const current = requireActiveMcpDocument(args);
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const effectId = readMcpString(args.effectId, "effectId");
      if (args.patch === null || typeof args.patch !== "object" || Array.isArray(args.patch)) {
        throw new Error("FX patch must be an object.");
      }
      const next = updateNativeNodeFx(current, nodeId, effectId, args.patch as Partial<Omit<FxObject, "id" | "type">>);
      await persistMcpSceneChange(next, nodeId);
      return { nodeId, effectId, updated: true };
    },
    "fx-remove": async (args) => {
      const current = requireActiveMcpDocument(args);
      const nodeId = readMcpString(args.nodeId, "nodeId");
      const effectId = readMcpString(args.effectId, "effectId");
      const next = removeNativeNodeFx(current, nodeId, effectId);
      await persistMcpSceneChange(next, nodeId);
      return { nodeId, effectId, removed: true };
    },
    "scene-capture-screenshot": async (args) => {
      const requestedPath = args.path === undefined ? scenePath() : readMcpPath(args.path, "path");
      if (!requestedPath || requestedPath !== scenePath()) {
        throw new Error("The requested native Scene is not open in the SolidJS Scene viewport.");
      }
      return captureSceneScreenshot(args);
    },
    "assets-get-texture-content-bounding-box": readTextureContentBounds,
  };

  onMount(() => {
    syncDockPanelElements();
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

  const selectedComponentDefinitions = createMemo(() => {
    const selected = selectedObject();
    const project = projectDocument();
    if (!selected || !project) return [];
    const modules = new Map(project.componentModules.map((module) => [module.typeId, module]));
    return selected.node.components.flatMap((instance) => {
      const module = modules.get(instance.typeId);
      if (!module) return [];
      const asset = project.assets.find((item) => item.id === module.moduleAssetId);
      return asset ? [{ instance, module, asset }] : [];
    });
  });

  const components = () => selectedComponentDefinitions().map((item) => item.instance.typeId);

  const hasUnattachedComponents = createMemo(() => {
    const attached = new Set(components());
    return componentRegistry().filter((entry) => !attached.has(entry.module.typeId));
  });

  const selectedPrefab = createMemo(() => {
    const current = scene();
    if (current && isPrefabDocument(current)) return { path: scenePath(), document: current };
    const prefabId = selectedObject()?.node.prefabInstance?.prefabId;
    return prefabId ? prefabCatalog().find((item) => item.document.id === prefabId) : undefined;
  });
  const selectedPrefabDefinition = createMemo(() => selectedPrefab()?.document ?? null);

  const menuItems = createMemo<Record<string, MenuItem[]>>(() => ({
    File: [
      { label: "Save active document", shortcut: "Ctrl+S", action: () => void saveActiveDocument(), disabled: !scene() && !animationDocument() && !scriptSourcePath() },
      { label: "Save Animation", action: () => void saveAnimationFile(), disabled: !animationDocument() || !animationDirty() },
      { label: "New Animation file", action: () => void createAnimationFile() },
      { label: "Reload scene from disk", action: () => scenePath() && void loadScene(scenePath(), true), disabled: !scenePath() },
    ],
    Edit: [
      { label: "Undo", shortcut: "Ctrl+Z", action: undo, disabled: history().index <= 0 },
      { label: "Redo", shortcut: "Ctrl+Shift+Z", action: redo, disabled: history().index >= history().documents.length - 1 },
      { label: "Command palette", shortcut: "Ctrl+P", action: openPalette },
      { label: "Delete selected object", shortcut: "Del", action: deleteSelectedObject, disabled: !selectedObject() },
      { label: "Create Prefab from selected Node", action: () => void createPrefabFromSelected(), disabled: !selectedObject() || !scene() || isPrefabDocument(scene()!) },
    ],
    View: [
      { label: "Hierarchy", checkable: "checkbox", checked: layout().hierarchyVisible, action: () => toggleSidePanel("Hierarchy") },
      { label: "Inspector", checkable: "checkbox", checked: layout().inspectorVisible, action: () => toggleSidePanel("Inspector") },
      { label: "Project", checkable: "checkbox", checked: layout().projectVisible, action: () => toggleBottomPanel("Project") },
      { label: "Animation", checkable: "checkbox", checked: layout().animationVisible, action: () => toggleBottomPanel("Animation") },
      { label: "Components", checkable: "checkbox", checked: layout().componentsVisible, action: () => toggleBottomPanel("Components") },
      { label: "Console", checkable: "checkbox", checked: layout().consoleVisible, action: toggleConsoleVisibility },
      { label: "Toggle light / dark theme", action: toggleTheme },
      { label: "Reset workspace layout", action: resetWorkbenchLayout },
    ],
    Window: [
      { label: "Project", checkable: "radio", checked: layout().bottomTab === "Project", action: () => openBottomPanel("Project") },
      { label: "Animation", checkable: "radio", checked: layout().bottomTab === "Animation", action: () => openBottomPanel("Animation") },
      { label: "Components", checkable: "radio", checked: layout().bottomTab === "Components", action: () => openBottomPanel("Components") },
      {
        label: "Console",
        ...(compactWorkbench() || layout().consoleDocked ? { checkable: "radio" as const } : {}),
        checked: layout().consoleVisible && (compactWorkbench() || layout().consoleDocked) && layout().bottomTab === "Console",
        action: openConsole,
      },
    ],
    Help: [
      { label: "Editor Host architecture", action: () => log("info", "Native Codogma Editor Host") },
    ],
  }));

  return (
    <div
      class="workbench"
      data-testid="workbench"
      data-layout={compactWorkbench() ? "compact" : "wide"}
      classList={{
        "hierarchy-hidden": !isLeftDockZoneAvailable(),
        "inspector-hidden": !isRightDockZoneAvailable(),
        "bottom-hidden": visibleBottomTabs().length === 0 && !(layout().consoleVisible && !layout().consoleDocked && !compactWorkbench()),
        "bottom-tabs-empty": visibleBottomTabs().length === 0 && layout().consoleVisible && !layout().consoleDocked && !compactWorkbench(),
        "dock-dragging": draggedDockPanel() !== null,
      }}
      style={{
        "--left-panel": `${getDisplayedSidePanelWidth("left")}px`,
        "--right-panel": `${getDisplayedSidePanelWidth("right")}px`,
        "--bottom-panel": `${getDisplayedBottomHeight()}px`,
        "--console-height": `${getDisplayedConsoleHeight()}px`,
        "--center-min-height": `${getMinimumCenterHeight()}px`,
      }}
      onPointerMove={handleWorkspacePointerMove}
      onPointerUp={handleWorkspacePointerUp}
      onPointerCancel={handleWorkspacePointerCancel}
      onLostPointerCapture={handleWorkspaceLostPointerCapture}
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
            {saving() || animationSaving() || projectSaving() ? "Saving" : documentDirty() ? "Unsaved changes" : "Saved"}
          </span>
          <span class="editor-version">EDITOR HOST</span>
        </div>

        <div class="menu-bar" role="menubar" aria-label="Main menu">
          <For each={Object.keys(menuItems())}>
            {(menu) => (
              <div class="menu-root">
                <button
                  class="menu-button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={activeMenu() === menu}
                  onClick={() => setActiveMenu((current) => current === menu ? "" : menu)}
                >
                  {menu}
                </button>
                <Show when={activeMenu() === menu}>
                  <div class="menu-popover" role="menu">
                    <For each={menuItems()[menu]}>
                      {(item) => (
                        <button
                          class="menu-item"
                          role={item.checkable === "checkbox" ? "menuitemcheckbox" : item.checkable === "radio" ? "menuitemradio" : "menuitem"}
                          aria-checked={item.checkable ? item.checked : undefined}
                          classList={{ "menu-item-checkable": Boolean(item.checkable), checked: Boolean(item.checked) }}
                          disabled={item.disabled}
                          onClick={() => {
                            setActiveMenu("");
                            item.action();
                          }}
                        >
                          <span class="menu-item-check" aria-hidden="true">
                            {item.checked ? "✓" : ""}
                          </span>
                          <span class="menu-item-label">{item.label}</span>
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
            <button class="toolbar-icon-button" data-testid="undo" disabled={history().index <= 0} onClick={undo} title="Undo · Ctrl+Z">
              <Icon theme={theme()} name="undo-redo" />
            </button>
            <button class="toolbar-icon-button" data-testid="redo" disabled={history().index >= history().documents.length - 1} onClick={redo} title="Redo · Ctrl+Shift+Z">
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
        <section
          class="side-dock-zone left-side-dock"
          data-testid="dock-zone-left"
          data-dock-zone="left"
          classList={{ "dock-drop-target": isDockGroupPreview("left") }}
          style={{ display: isLeftDockZoneAvailable() ? "flex" : "none" }}
        >
          <div class="side-dock-tabs" role="tablist" aria-label="Left dock panels">
            <For each={leftDockPanels()}>
              {(panel) => (
                <button
                  type="button"
                  class="side-dock-tab"
                  role="tab"
                  data-dock-tab={panel}
                  aria-selected={layout().leftActivePanel === panel}
                  classList={{
                    "dock-drop-insert-before": isDockTabInsertionTarget(panel, "before"),
                    "dock-drop-insert-after": isDockTabInsertionTarget(panel, "after"),
                  }}
                  onKeyDown={(event) => handleDockTabKeyDown(event, "left")}
                  onPointerDown={(event) => startDockPointerDrag(event, panel, "tab")}
                  onClick={(event) => {
                    if (shouldIgnoreDockTabClick(event)) return;
                    activateSidePanel(panel);
                  }}
                >
                  {panel}
                </button>
              )}
            </For>
          </div>
          <div class="side-dock-content" ref={(element) => { leftDockedContent = element; }}>
          <aside ref={(element) => { hierarchyPanelElement = element; }} class="panel hierarchy-panel" classList={{ "dock-panel-inactive": !isDockPanelActive("Hierarchy") }} data-testid="hierarchy-panel" data-focus-context="hierarchy" data-dock-panel="Hierarchy">
            <PanelHeader
              title="Hierarchy"
              icon="file-tree"
              theme={theme()}
              trailing={sceneObjects().length ? String(sceneObjects().length) : "—"}
              onPointerDown={(event) => startDockPointerDrag(event, "Hierarchy", "header")}
              {...(getStoredPanelZone("Hierarchy") !== getSidePanelHomeZone("Hierarchy")
                ? { onUndock: () => undockSidePanel("Hierarchy") }
                : {})}
              onClose={() => closeSidePanel("Hierarchy")}
            />
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
            <Show when={isEmptySideDockDropTarget("left") && !isDockGroupPreview("left")}>
              <div class="side-dock-empty-drop-hint" data-testid="empty-dock-hint-left">
                Drop panel here
              </div>
            </Show>
          </div>
          <Show when={isDockGroupPreview("left")}>
            <div class="dock-drop-preview" data-testid="dock-drop-preview" aria-hidden="true">
              <strong>Left dock</strong>
              <span>Release to move this panel</span>
            </div>
          </Show>
        </section>

        <Show when={isLeftDockZoneAvailable()}>
          <div
            class="vertical-splitter"
            data-testid="splitter-hierarchy"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize left dock"
            aria-valuemin={170}
            aria-valuemax={getMaximumSidePanelWidth("left")}
            aria-valuenow={getDisplayedSidePanelWidth("left")}
            tabIndex={0}
            onPointerDown={(event) => startResize("left", event)}
            onKeyDown={(event) => handleSplitterKeyDown("left", event)}
          onDblClick={() => resetSplitter("left")}
            title="Double-click to reset size"/>
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
              <Show when={scriptSourcePath()}>
                <button
                  class="viewport-tab"
                  role="tab"
                  aria-selected={activeViewport() === "Source"}
                  classList={{ active: activeViewport() === "Source" }}
                  onClick={() => setActiveViewport("Source")}
                >
                  <Icon theme={theme()} name="script" size={13} />
                  Source
                </button>
              </Show>
              <div class="viewport-tab-spacer" />
              <span class="viewport-resolution">{activeViewport() === "Scene" ? "800 × 600" : activeViewport() === "Source" ? "TYPESCRIPT" : "LIVE GAME"}</span>
              <span class="viewport-status"><span class="status-led" />{activeViewport() === "Scene" ? "Edit mode" : activeViewport() === "Source" ? (scriptDirty() ? "Unsaved source" : "Source ready") : gameLoaded() ? "Runtime loaded" : "Starting runtime"}</span>
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
                    projectDocument={projectDocument()}
                    prefabs={prefabCatalog().map((item) => item.document)}
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
                <div class="game-view-caption">Game View loads the existing generated game output. Scene edits are saved to .cge-scene.json and do not regenerate game.js automatically.</div>
              </div>
            </Show>

            <Show when={activeViewport() === "Source"}>
              <div class="typescript-source-workspace" data-testid="typescript-source-workspace">
                <div class="typescript-source-toolbar">
                  <div class="components-file-heading">
                    <strong>{scriptSourcePath().split("/").pop() ?? "TypeScript source"}</strong>
                    <span>{scriptSourcePath()}</span>
                  </div>
                  <div class="timeline-actions">
                    <span class="typescript-diagnostic-status">
                      {scriptChecking() ? "Checking syntax…" : scriptDiagnostics().length === 0 ? "No syntax diagnostics" : `${scriptDiagnostics().length} diagnostic(s)`}
                    </span>
                    <button class="primary-button" data-testid="save-typescript-source" disabled={!scriptDirty() || scriptSaving()} onClick={() => void saveTypeScriptFile()}>
                      {scriptSaving() ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
                <textarea
                  aria-label="TypeScript source"
                  data-testid="typescript-source-editor"
                  class="typescript-source-editor"
                  spellcheck={false}
                  autocapitalize="off"
                  autocomplete="off"
                  autocorrect="off"
                  value={scriptSource()}
                  onInput={(event) => updateTypeScriptSource(event.currentTarget.value)}
                />
                <div class="typescript-diagnostics" data-testid="typescript-diagnostics" role="status" aria-live="polite">
                  <Show when={scriptDiagnostics().length > 0} fallback={<span class="inspector-note">Single-file TypeScript syntax check. Project-wide semantic type checking uses the project's configured tsc build.</span>}>
                    <For each={scriptDiagnostics()}>
                      {(diagnostic) => (
                        <div class="typescript-diagnostic-row" classList={{ error: diagnostic.severity === "error", warning: diagnostic.severity === "warning" }}>
                          <strong>{diagnostic.severity.toUpperCase()}</strong>
                          <span>{diagnostic.line ? `Ln ${diagnostic.line}, Col ${diagnostic.column ?? 1} · ` : ""}{diagnostic.message}</span>
                          <code>TS{diagnostic.code}</code>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </main>

        <Show when={isRightDockZoneAvailable()}>
          <div
            class="vertical-splitter"
            data-testid="splitter-inspector"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize right dock"
            aria-valuemin={210}
            aria-valuemax={getMaximumSidePanelWidth("right")}
            aria-valuenow={getDisplayedSidePanelWidth("right")}
            tabIndex={0}
            onPointerDown={(event) => startResize("right", event)}
            onKeyDown={(event) => handleSplitterKeyDown("right", event)}
          onDblClick={() => resetSplitter("right")}
            title="Double-click to reset size"/>
        </Show>
        <section
          class="side-dock-zone right-side-dock"
          data-testid="dock-zone-right"
          data-dock-zone="right"
          classList={{ "dock-drop-target": isDockGroupPreview("right") }}
          style={{ display: isRightDockZoneAvailable() ? "flex" : "none" }}
        >
          <div class="side-dock-tabs" role="tablist" aria-label="Right dock panels">
            <For each={rightDockPanels()}>
              {(panel) => (
                <button
                  type="button"
                  class="side-dock-tab"
                  role="tab"
                  data-dock-tab={panel}
                  aria-selected={layout().rightActivePanel === panel}
                  classList={{
                    "dock-drop-insert-before": isDockTabInsertionTarget(panel, "before"),
                    "dock-drop-insert-after": isDockTabInsertionTarget(panel, "after"),
                  }}
                  onKeyDown={(event) => handleDockTabKeyDown(event, "right")}
                  onPointerDown={(event) => startDockPointerDrag(event, panel, "tab")}
                  onClick={(event) => {
                    if (shouldIgnoreDockTabClick(event)) return;
                    activateSidePanel(panel);
                  }}
                >
                  {panel}
                </button>
              )}
            </For>
          </div>
          <div class="side-dock-content" ref={(element) => { rightDockedContent = element; }}>
          <aside ref={(element) => { inspectorPanelElement = element; }} class="panel inspector-panel" classList={{ "dock-panel-inactive": !isDockPanelActive("Inspector") }} data-testid="inspector-panel" data-focus-context="inspector" data-dock-panel="Inspector">
            <PanelHeader
              title="Inspector"
              icon="editor-inspector"
              theme={theme()}
              trailing={selectedObject() ? selectedObject()!.type : "—"}
              onPointerDown={(event) => startDockPointerDrag(event, "Inspector", "header")}
              {...(getStoredPanelZone("Inspector") !== getSidePanelHomeZone("Inspector")
                ? { onUndock: () => undockSidePanel("Inspector") }
                : {})}
              onClose={() => closeSidePanel("Inspector")}
            />
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
                    onAdd={addFxToSelected}
                    onUpdate={updateSelectedFx}
                    onRemove={removeSelectedFx}
                    onError={(message) => log("warning", message)}
                  />
                </Show>

                <section class="inspector-section" data-testid="attached-components">
                  <div class="inspector-section-heading">
                    <span>Components</span>
                    <span class="component-count">{selectedComponentDefinitions().length}</span>
                  </div>
                  <Show when={selectedComponentDefinitions().length > 0} fallback={<div class="component-empty">No registered native component modules are attached.</div>}>
                    <For each={selectedComponentDefinitions()}>
                      {(entry) => (
                        <div class="attached-component-card">
                          <div class="component-row">
                            <Icon theme={theme()} name="script" size={13} />
                            <span>{entry.module.typeId}</span>
                            <span class="component-state">v{entry.module.version}</span>
                            <button class="toolbar-icon-button tiny" aria-label={`Detach ${entry.module.typeId}`} title="Detach component" onClick={() => detachComponentFromSelected(entry.instance.id)}>
                              <Icon theme={theme()} name="remove" size={11} />
                            </button>
                          </div>
                          <div class="inspector-note">Instance {entry.instance.id} · {entry.instance.enabled ? "Enabled" : "Disabled"}</div>
                          <Show when={Object.keys(entry.instance.properties).length > 0}>
                            <pre class="component-properties-json">{JSON.stringify(entry.instance.properties, null, 2)}</pre>
                          </Show>
                          <button class="subtle-button" onClick={() => void openTypeScriptFile(entry.asset.path)}>Open Script Asset</button>
                        </div>
                      )}
                    </For>
                  </Show>
                  <Show when={hasUnattachedComponents().length > 0}>
                    <div class="component-attach-row">
                      <select aria-label="Native component module to attach" value={componentToAttach()} onChange={(event) => setComponentToAttach(event.currentTarget.value)}>
                        <option value="">Attach component…</option>
                        <For each={hasUnattachedComponents()}>
                          {(entry) => <option value={entry.module.typeId}>{entry.module.typeId} · {entry.path}</option>}
                        </For>
                      </select>
                      <button class="subtle-button" disabled={!componentToAttach()} onClick={() => void attachComponentToSelected(componentToAttach())}>Attach</button>
                    </div>
                  </Show>
                  <Show when={!projectDocument()?.componentModules.length}>
                    <div class="inspector-note">No native Script Component modules are declared in project.json. Module authoring and schema-driven properties are owned by COD-91 and COD-27.</div>
                  </Show>
                </section>

                <Show when={Boolean(selectedObject()?.node.prefabInstance)}>
                  <section class="inspector-section" data-testid="prefab-overrides">
                    <div class="inspector-section-heading"><span>Prefab instance</span></div>
                    <strong class="prefab-name">{selectedPrefabDefinition()?.name ?? selectedObject()?.node.prefabInstance?.prefabId}</strong>
                    <span class="inspector-note">Prefab ID: {selectedObject()?.node.prefabInstance?.prefabId}</span>
                    <span class="inspector-note">{selectedObject()?.node.prefabInstance?.overrides.length ?? 0} native overrides</span>
                    <button class="subtle-button" disabled={!selectedPrefab()} onClick={() => selectedPrefab() && void openProjectFile(selectedPrefab()!.path)}>Open Prefab asset</button>
                  </section>
                </Show>
                <Show when={scene() && isPrefabDocument(scene()!)}>
                  <section class="inspector-section" data-testid="prefab-document-info">
                    <div class="inspector-section-heading"><span>Native Prefab document</span></div>
                    <span>{selectedPrefabDefinition()?.name ?? "Prefab"}</span>
                    <span class="inspector-note">Schema v1 · single root Node</span>
                    <span class="inspector-note">Nested Prefabs and override propagation are implemented by the dedicated Prefab workflow task.</span>
                  </section>
                </Show>
                <Show when={scene() && !isPrefabDocument(scene()!) && prefabCatalog().length > 0}>
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
                <Show when={selectedObject() && scene() && !isPrefabDocument(scene()!)}>
                  <button class="subtle-button create-prefab-button" onClick={() => void createPrefabFromSelected()}>Create Prefab from selected Node</button>
                </Show>
              </div>
            </Show>
            <div class="inspector-footer">
              <span>{selectedObject() ? "Scene object" : "Inspector"}</span>
              <span>{documentDirty() ? "Modified" : "In sync"}</span>
            </div>
          </aside>
            <Show when={isEmptySideDockDropTarget("right") && !isDockGroupPreview("right")}>
              <div class="side-dock-empty-drop-hint" data-testid="empty-dock-hint-right">
                Drop panel here
              </div>
            </Show>
          </div>
          <Show when={isDockGroupPreview("right")}>
            <div class="dock-drop-preview" data-testid="dock-drop-preview" aria-hidden="true">
              <strong>Right dock</strong>
              <span>Release to move this panel</span>
            </div>
          </Show>
        </section>
      </div>

      <div
        class="horizontal-splitter"
        data-testid="splitter-bottom"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom dock"
        aria-valuemin={getMinimumBottomHeight()}
        aria-valuemax={getMaximumBottomHeight()}
        aria-valuenow={getDisplayedBottomHeight()}
        tabIndex={0}
        onPointerDown={(event) => startResize("bottom", event)}
        onKeyDown={(event) => handleSplitterKeyDown("bottom", event)}
      onDblClick={() => resetSplitter("bottom")}
            title="Double-click to reset size"/>

      <section
        class="bottom-dock"
        data-testid="bottom-dock"
        classList={{
          "console-docked": compactWorkbench() || layout().consoleDocked,
          "console-hidden": !layout().consoleVisible,
        }}
      >
        <div class="bottom-upper-panel" data-dock-zone="bottom">
          <div
            class="bottom-tabs"
            role="tablist"
            aria-label="Bottom workspace"
            data-testid="bottom-tabs"
          >
            <For each={visibleBottomTabs()}>
              {(tab) => (
                <div class="dock-tab-item" role="presentation">
                  <button
                    class="dock-tab"
                    role="tab"
                    data-dock-tab={tab}
                    aria-selected={bottomTab() === tab}
                    classList={{
                      active: bottomTab() === tab,
                      "dock-drop-insert-before": isDockTabInsertionTarget(tab, "before"),
                      "dock-drop-insert-after": isDockTabInsertionTarget(tab, "after"),
                    }}
                    onPointerDown={(event) => startDockPointerDrag(event, tab, "tab")}
                    onAuxClick={(event) => {
                      if (event.button === 1) closeBottomPanel(tab);
                    }}
                    onClick={(event) => {
                      if (shouldIgnoreDockTabClick(event)) return;
                      activateBottomTab(tab);
                    }}
                    onKeyDown={(event) => handleDockTabKeyDown(event, "bottom")}
                    title={"Drag to move or reorder " + tab + " · middle-click to close"}
                  >
                    <Icon theme={theme()} name={tab === "Project" ? "folder" : tab === "Animation" ? "animation" : tab === "Components" ? "script" : tab === "Console" ? "script" : tab === "Hierarchy" ? "file-tree" : "editor-inspector"} size={13} />
                    {tab}
                  </button>
                  <button
                    type="button"
                    class="dock-tab-close"
                    aria-label={"Close " + tab}
                    title={"Close " + tab}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeBottomPanel(tab);
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
            <div class="dock-tabs-spacer" />
            <button class="toolbar-icon-button tiny" aria-label="Reduce bottom dock height" title="Reduce bottom workspace height" onClick={() => setLayout((current) => ({ ...current, bottomHeight: 150 }))}>
              <span>−</span>
            </button>
          </div>

          <Show when={isDockGroupPreview("bottom")}>
            <div class="dock-drop-preview" data-testid="dock-drop-preview" aria-hidden="true">
              <strong>Bottom dock</strong>
              <span>Release to add this panel to the group</span>
            </div>
          </Show>

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
                              <Icon theme={theme()} name={file.entry.kind === "file" ? "file" : "folder"} size={13} />
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
                    <Icon theme={theme()} name={selectedProjectPath().endsWith(".cge-scene.json") || selectedProjectPath().endsWith(".cge-prefab.json") ? "packed-scene" : "file"} size={26} />
                    <strong>{selectedProjectPath().split("/").pop()}</strong>
                    <span>{selectedProjectPath()}</span>
                    <Show when={selectedProjectPath().toLowerCase().endsWith(".cge-scene.json") || selectedProjectPath().toLowerCase().endsWith(".cge-prefab.json")}>
                      <button class="subtle-button" onClick={() => void loadScene(selectedProjectPath())}>Open Native Document</button>
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
                  <strong>Native Component Modules</strong>
                  <span>Registered in project.json · no sidecar .components files</span>
                </div>
              </div>
              <Show when={componentRegistry().length > 0} fallback={<div class="timeline-empty">No native component modules are registered in this Project. Script module authoring belongs to COD-91.</div>}>
                <div class="components-definition-list">
                  <For each={componentRegistry()}>
                    {(entry) => (
                      <section class="components-definition-card">
                        <div class="components-definition-heading">
                          <div><strong>{entry.module.typeId}</strong><code>v{entry.module.version}</code></div>
                          <button class="subtle-button" onClick={() => void openTypeScriptFile(entry.path)}>Open Script Asset</button>
                        </div>
                        <div class="components-definition-meta">
                          <span>Asset ID: {entry.module.moduleAssetId}</span>
                          <span>Path: {entry.path}</span>
                        </div>
                      </section>
                    )}
                  </For>
                </div>
              </Show>
              <div class="inspector-note">This panel reads only native Project manifest references. Creating/editing module manifests and typed property schemas is handled by COD-91/COD-27.</div>
            </div>
          </Show>

          <Show when={layout().consoleVisible && (compactWorkbench() || layout().consoleDocked) && bottomTab() === "Console"}>
            <ConsolePanel
              className="compact-console-panel"
              theme={theme()}
              level={consoleLevel()}
              onLevelChange={setConsoleLevel}
              messages={visibleConsoleMessages()}
              onClear={() => setConsoleMessages([])}
              onClose={closeConsole}
              {...(!compactWorkbench() && layout().consoleDocked ? { onUndock: undockConsole } : {})}
            />
          </Show>
          <div
            class="bottom-docked-content"
            ref={(element) => { bottomDockedContent = element; }}
            data-testid="bottom-docked-content"
            data-focus-context={bottomTab().toLowerCase()}
            style={{
              display:
                (bottomTab() === "Hierarchy" || bottomTab() === "Inspector") &&
                isDockPanelActive(bottomTab() as SidePanelId) &&
                getEffectivePanelZone(bottomTab() as SidePanelId) === "bottom"
                  ? "flex"
                  : "none",
            }}
          />
        </div>

        <Show when={!compactWorkbench() && !layout().consoleDocked && layout().consoleVisible}>
          <>
        <div
          class="console-splitter"
          data-testid="splitter-console"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Console panel"
          aria-valuemin={56}
          aria-valuemax={getMaximumConsoleHeight(getDisplayedBottomHeight())}
          aria-valuenow={getDisplayedConsoleHeight()}
          tabIndex={0}
          onPointerDown={(event) => startResize("console", event)}
          onKeyDown={(event) => handleSplitterKeyDown("console", event)}
        onDblClick={() => resetSplitter("console")}
            title="Double-click to reset size"/>
        <ConsolePanel
          className="desktop-console-panel"
          theme={theme()}
          level={consoleLevel()}
          onLevelChange={setConsoleLevel}
          messages={visibleConsoleMessages()}
          onClear={() => setConsoleMessages([])}
          onClose={closeConsole}
          onPointerDown={(event) => startDockPointerDrag(event, "Console", "header")}
        />
          </>
        </Show>
      </section>

      <Show when={draggedDockPanel()}>
        {(panel) => (
          <div class="dock-drag-ghost" data-testid="dock-drag-ghost" aria-hidden="true"
            style={{ left: `${dockDragPosition().x + 14}px`, top: `${dockDragPosition().y + 14}px` }}>
            <Icon theme={theme()} name={panel() === "Hierarchy" ? "file-tree" : panel() === "Inspector" ? "editor-inspector" : "script"} size={13} />
            <span>{panel()}</span>
          </div>
        )}
      </Show>

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
