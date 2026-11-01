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
} from "./domain/scene-model.mjs";
import {
  appendAnimationFrame,
  createAnimation,
  createAnimationDocument,
  formatAnimationContent,
  isAnimationContent,
  parseAnimationContent,
  removeAnimation,
  removeAnimationFrame,
  updateAnimation,
  type AnimationDocument,
} from "./domain/animation-model.mjs";
import {
  createPrefabDocument,
  createPrefabInstance,
  addPrefabProperty,
  removePrefabProperty,
  type PrefabDocument,
  type PrefabProperty,
} from "./domain/prefab-model.mjs";
import {
  addUserComponentDefinition,
  attachUserComponent,
  createUserComponentDefinition,
  detachUserComponent,
  formatUserComponentsContent,
  parseUserComponentsContent,
  type UserComponentDefinition,
  type UserComponentsDocument,
} from "./domain/components-model.mjs";
import {
  getProjectFiles,
  readProjectFile,
  writeProjectFile,
  createProjectFolder,
  type ProjectEntry,
} from "./services/editor-api";
import PhaserSceneViewport from "./components/PhaserSceneViewport";

type Theme = "dark" | "light";
type ViewportTab = "Scene" | "Game";
type BottomTab = "Project" | "Animation" | "Components" | "Console";
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
  consoleDocked: false,
};

function defaultLayout(compact: boolean): LayoutState {
  return compact
    ? { ...DEFAULT_LAYOUT, leftWidth: 194, rightWidth: 250, bottomHeight: 207, consoleHeight: 60 }
    : { ...DEFAULT_LAYOUT };
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
}) {
  return (
    <div class="panel-header">
      <Icon theme={props.theme} name={props.icon} size={14} />
      <span>{props.title}</span>
      <Show when={props.trailing}>
        <span class="panel-header-trailing">{props.trailing}</span>
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
    <section class="console-panel" classList={{ [props.className]: true }} data-testid="console-panel">
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
        return {
          leftWidth: clampLayoutValue(savedLeft, defaults.leftWidth, 170, 360),
          rightWidth: clampLayoutValue(savedRight, defaults.rightWidth, 210, 420),
          bottomHeight: clampLayoutValue(savedBottom, defaults.bottomHeight, 150, 420),
          consoleHeight: clampLayoutValue(parsed.consoleHeight, defaults.consoleHeight, 56, 180),
          hierarchyVisible: typeof parsed.hierarchyVisible === "boolean" ? parsed.hierarchyVisible : defaults.hierarchyVisible,
          inspectorVisible: typeof parsed.inspectorVisible === "boolean" ? parsed.inspectorVisible : defaults.inspectorVisible,
          consoleDocked: parsed.consoleDocked === true,
          bottomTab:
            parsed.bottomTab === "Animation" ||
            parsed.bottomTab === "Components" ||
            (parsed.bottomTab === "Console" && (compact || parsed.consoleDocked === true))
              ? parsed.bottomTab
              : "Project",
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
  const [tool, setTool] = createSignal<"select" | "move" | "rotate" | "scale">("select");
  const [gameInstance, setGameInstance] = createSignal(0);
  const [gameLoaded, setGameLoaded] = createSignal(false);
  const [consoleLevel, setConsoleLevel] = createSignal("all");
  const [consoleMessages, setConsoleMessages] = createSignal<ConsoleMessage[]>([]);
  const [dockTargetActive, setDockTargetActive] = createSignal(false);
  const [hiddenObjects, setHiddenObjects] = createSignal(new Set<string>());
  const [lockedObjects, setLockedObjects] = createSignal(new Set<string>());
  const [showObjectMenu, setShowObjectMenu] = createSignal(false);
  const [commandIndex, setCommandIndex] = createSignal(0);

  let messageId = 0;
  let paletteInput: HTMLInputElement | undefined;
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

  const componentRegistry = createMemo(() =>
    componentSources().flatMap((source) => source.document.components.map((definition) => ({
      path: source.path,
      definition,
    }))),
  );

  const selectedPrefab = createMemo(() => {
    const prefabId = currentObject()?.prefabId;
    return prefabId ? prefabCatalog().find((item) => item.document.id === prefabId) : undefined;
  });

  const selectedPrefabDefinition = createMemo(() => selectedPrefab()?.document ?? null);

  const sceneObjects = createMemo(() => {
    const current = scene();
    return current ? getSceneObjects(current) : [];
  });

  const selectedObject = createMemo<SceneObjectEntry | undefined>(() => {
    const id = selectedId();
    return id ? sceneObjects().find((item) => item.id === id) : undefined;
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

  const visibleConsoleMessages = createMemo(() => {
    const level = consoleLevel();
    return level === "all"
      ? consoleMessages()
      : consoleMessages().filter((item) => item.level === level);
  });

  const commands = createMemo<Command[]>(() => [
    {
      id: "save",
      title: "Save scene",
      shortcut: "Ctrl+S",
      run: () => void saveScene(),
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
      run: () => setLayout((current) => ({ ...current, hierarchyVisible: !current.hierarchyVisible })),
    },
    {
      id: "inspector",
      title: "Toggle Inspector panel",
      run: () => setLayout((current) => ({ ...current, inspectorVisible: !current.inspectorVisible })),
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

  async function loadScene(path: string, reloadCurrent = false) {
    if (path === scenePath() && !reloadCurrent) return;
    if (animationDirty() || componentDirty()) {
      if (!window.confirm("The active animation or component file has unsaved changes. Discard them and open the scene?")) return;
    }
    if (dirty()) {
      const discardChanges = window.confirm(
        "This scene has unsaved changes. Discard them and open the requested scene?",
      );
      if (!discardChanges) return;
    }

    const request = ++sceneLoadSequence;
    setLoadError("");
    try {
      const content = await readProjectFile(path);
      if (request !== sceneLoadSequence) return;
      const parsed = parseSceneContent(content) as SceneDocument;
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
    } catch (error) {
      if (request !== sceneLoadSequence) return;
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      log("error", message);
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
    setScene(history()[nextIndex]);
    setSelectedId(selectionHistory()[index - 1]?.before ?? getSceneObjects(history()[nextIndex])[0]?.id ?? null);
    setHistoryIndex(nextIndex);
    log("info", "Undo");
  }

  function redo() {
    const index = historyIndex();
    if (index < 0 || index >= history().length - 1) return;
    const nextIndex = index + 1;
    setScene(history()[nextIndex]);
    setSelectedId(selectionHistory()[index]?.after ?? getSceneObjects(history()[nextIndex])[0]?.id ?? null);
    setHistoryIndex(nextIndex);
    log("info", "Redo");
  }

  async function refreshProjectTree() {
    const result = await getProjectFiles();
    setProjectTree(result.rootFile);
  }

  async function ensureProjectFolder(relativePath: string) {
    const existing = flattenProjectFiles(projectTree()!).find((item) => item.path === relativePath);
    if (existing && !existing.entry.isFile) return;
    await createProjectFolder(relativePath);
    await refreshProjectTree();
  }

  async function loadAnimationFile(path: string) {
    if (animationDirty() && !window.confirm("The active animation file has unsaved changes. Discard them?")) return;
    const request = ++documentLoadSequence;
    try {
      const content = await readProjectFile(path);
      if (request !== documentLoadSequence) return;
      const parsed = parseAnimationContent(content);
      setAnimationDocument(parsed);
      setAnimationPath(path);
      setSavedAnimationContent(formatAnimationContent(parsed));
      setSelectedAnimationKey(parsed.anims[0]?.key ?? "");
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
      if (directory) await ensureProjectFolder(directory);
      const document = createAnimationDocument();
      const content = formatAnimationContent(document);
      await writeProjectFile(path, content);
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
    const source = selectedObject()?.source;
    const texture = source?.texture;
    const textureKey = texture && typeof texture === "object" ? String(texture.key ?? "") : "";
    const next = createAnimation(current, "animation", {
      frames: textureKey ? [{ key: textureKey }] : [],
    });
    setAnimationDocument(next);
    setSelectedAnimationKey(next.anims.at(-1)?.key ?? "");
  }

  function updateSelectedAnimation(patch: Record<string, unknown>) {
    const current = animationDocument();
    const key = selectedAnimationKey();
    if (!current || !key) return;
    try { setAnimationDocument(updateAnimation(current, key, patch)); }
    catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  function addAnimationFrame() {
    const current = animationDocument();
    const key = selectedAnimationKey();
    const frameKey = animationFrameKey().trim();
    if (!current || !key || !frameKey) return;
    try {
      setAnimationDocument(appendAnimationFrame(current, key, { key: frameKey }));
      setAnimationFrameKey("");
    } catch (error) { log("error", error instanceof Error ? error.message : String(error)); }
  }

  async function openUserComponentsFile(path: string) {
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
    const path = componentDocumentPath();
    const name = newComponentName().trim();
    if (!current || !path || !name) return;
    try {
      const next = addUserComponentDefinition(current, createUserComponentDefinition(name));
      setComponentDocument(next);
      setNewComponentName("");
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

  async function saveActiveDocument() {
    if (animationDocument() && layout().bottomTab === "Animation") return saveAnimationFile();
    if (componentDocument() && layout().bottomTab === "Components") return saveUserComponentsFile();
    return saveScene();
  }

  async function saveScene() {
    const current = scene();
    const path = scenePath();
    if (!current || !path || saving()) return;

    setSaving(true);
    try {
      const content = formatSceneContent(current);
      await writeProjectFile(path, content);
      setSavedContent(content);
      if (current.sceneType === "PREFAB") {
        setPrefabCatalog((catalog) => catalog.map((item) => item.path === path ? { path, document: current as PrefabDocument } : item));
      }
      log("success", `Saved ${path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", `Save failed: ${message}`);
      setLoadError(message);
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

  function handleConsoleDragStart(event: DragEvent) {
    event.dataTransfer?.setData("text/plain", "Console");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handleDockDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("text/plain")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDockTargetActive(true);
  }

  function handleDockDragLeave(event: DragEvent & { currentTarget: HTMLDivElement }) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDockTargetActive(false);
  }

  function handleDockDrop(event: DragEvent) {
    const panel = event.dataTransfer?.getData("text/plain");
    if (panel !== "Console") return;
    event.preventDefault();
    setDockTargetActive(false);
    setLayout((current) => ({ ...current, consoleDocked: true, bottomTab: "Console" }));
    log("success", "Console docked into Bottom workspace");
  }

  function undockConsole() {
    setLayout((current) => ({ ...current, consoleDocked: false, bottomTab: "Project" }));
    log("info", "Console moved back to its own dock");
  }

  function runCommand(command: Command) {
    setPaletteOpen(false);
    setPaletteQuery("");
    command.run();
  }

  function openPalette() {
    setPaletteOpen(true);
    setPaletteQuery("");
    setActiveMenu("");
    setCommandIndex(0);
    queueMicrotask(() => paletteInput?.focus());
  }

  function handleKeyDown(event: KeyboardEvent) {
    const target = event.target;
    const isEditable =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

    if (event.key === "Escape") {
      setPaletteOpen(false);
      setActiveMenu("");
      setShowObjectMenu(false);
      return;
    }

    if (isEditable) return;

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveActiveDocument();
    } else if (modifier && event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redo();
    } else if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    } else if (modifier && event.key.toLowerCase() === "p") {
      event.preventDefault();
      openPalette();
    } else if (event.key === "F2") {
      event.preventDefault();
      const selected = selectedObject();
      if (!selected) return;
      const label = window.prompt("Object name", selected.name);
      if (label?.trim()) updateSelectedProperty("label", label.trim());
    } else if (event.key === "Delete" || event.key === "Backspace") {
      deleteSelectedObject();
    } else if (event.key.toLowerCase() === "w") {
      setTool("move");
    } else if (event.key.toLowerCase() === "e") {
      setTool("rotate");
    } else if (event.key.toLowerCase() === "r") {
      setTool("scale");
    } else if (event.key.toLowerCase() === "q") {
      setTool("select");
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

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleWorkbenchResize);
    void loadProject();
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", handleWorkbenchResize);
  });

  const currentObject = () => selectedObject()?.source;
  const activeAnimation = createMemo(() => animationDocument()?.anims.find((item) => item.key === selectedAnimationKey()));
  const selectedComponentDefinitions = createMemo(() => componentRegistry().filter((item) => components().includes(item.definition.name)));
  const hasUnattachedComponents = createMemo(() => componentRegistry().filter((item) => !components().includes(item.definition.name)));
  const prefabDocumentDirty = () => scene()?.sceneType === "PREFAB" ? dirty() : false;
  const components = () => {
    const value = currentObject()?.components;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  };



  const menuItems: Record<string, Array<{ label: string; shortcut?: string; action: () => void; disabled?: boolean }>> = {
    File: [
      { label: "Save scene", shortcut: "Ctrl+S", action: () => void saveScene(), disabled: !scene() || saving() },
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
        "hierarchy-hidden": !layout().hierarchyVisible,
        "inspector-hidden": !layout().inspectorVisible,
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
            {saving() ? "Saving" : dirty() ? "Unsaved changes" : "Saved"}
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
          <button class="toolbar-icon-button" aria-label="Reset layout" onClick={() => setLayout(defaultLayout(compactWorkbench()))} title="Reset workspace layout">
            <Icon theme={theme()} name="reload" />
          </button>
        </div>
      </header>

      <div class="workspace-row">
        <Show when={layout().hierarchyVisible}>
          <aside class="panel hierarchy-panel" data-testid="hierarchy-panel">
            <PanelHeader title="Hierarchy" icon="file-tree" theme={theme()} trailing={sceneObjects().length ? String(sceneObjects().length) : "—"} />
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
                        classList={{ selected: selectedId() === entry.id, locked: lockedObjects().has(entry.id) }}
                        onClick={() => setSelectedId(entry.id)}
                        onDblClick={() => {
                          const nextName = window.prompt("Object name", entry.name);
                          if (nextName?.trim()) updateSelectedProperty("label", nextName.trim());
                        }}
                      >
                        <span class="hierarchy-indent" />
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
        </Show>

        <Show when={layout().hierarchyVisible}>
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

            <div class="scene-view-pane" classList={{ inactive: activeViewport() !== "Scene" }} aria-hidden={activeViewport() !== "Scene"}>
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
                  />
                )}
              </Show>
              <div class="viewport-statusbar">
                <span><Icon theme={theme()} name="tool-select" size={12} /> {tool()[0].toUpperCase() + tool().slice(1)} tool</span>
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
          <div
            class="vertical-splitter"
            data-testid="splitter-inspector"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Inspector panel"
            onPointerDown={(event) => startResize("right", event)}
          />
          <aside class="panel inspector-panel" data-testid="inspector-panel">
            <PanelHeader title="Inspector" icon="editor-inspector" theme={theme()} trailing={selectedObject() ? selectedObject()!.type : "—"} />
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

                <section class="inspector-section">
                  <div class="inspector-section-heading">
                    <span>Components</span>
                    <span class="component-count">{components().length}</span>
                  </div>
                  <Show when={components().length > 0} fallback={<div class="component-empty">No components attached.</div>}>
                    <For each={components()}>
                      {(component) => (
                        <div class="component-row">
                          <Icon theme={theme()} name="script" size={13} />
                          <span>{component}</span>
                          <span class="component-state">Enabled</span>
                        </div>
                      )}
                    </For>
                  </Show>
                  <Show when={currentObject() && Object.keys(currentObject()!).some((key) => key.includes("."))}>
                    <div class="serialized-properties">
                      <span>Serialized component values</span>
                      <For each={Object.entries(currentObject()!).filter(([key]) => key.includes("."))}>
                        {([key, value]) => <div><span>{key}</span><code>{String(value)}</code></div>}
                      </For>
                    </div>
                  </Show>
                </section>

                <Show when={Boolean(currentObject()?.prefabId)}>
                  <div class="inspector-note">
                    Prefab instance data is preserved. Prefab overrides and refresh actions belong to a later migration slice.
                  </div>
                </Show>
              </div>
            </Show>
            <div class="inspector-footer">
              <span>{selectedObject() ? "Scene object" : "Inspector"}</span>
              <span>{dirty() ? "Modified" : "In sync"}</span>
            </div>
          </aside>
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
          >
            <button class="dock-tab" role="tab" aria-selected={bottomTab() === "Project"} classList={{ active: bottomTab() === "Project" }} onClick={() => setLayout((current) => ({ ...current, bottomTab: "Project" }))}>
              <Icon theme={theme()} name="folder" size={13} /> Project
            </button>
            <button class="dock-tab" role="tab" aria-selected={bottomTab() === "Animation"} classList={{ active: bottomTab() === "Animation" }} onClick={() => setLayout((current) => ({ ...current, bottomTab: "Animation" }))}>
              <Icon theme={theme()} name="animation" size={13} /> Animation
            </button>
            <Show when={compactWorkbench() || layout().consoleDocked}>
              <button class="dock-tab" role="tab" aria-selected={bottomTab() === "Console"} classList={{ active: bottomTab() === "Console" }} onClick={() => setLayout((current) => ({ ...current, bottomTab: "Console" }))}>
                <Icon theme={theme()} name="script" size={13} /> Console
              </button>
            </Show>
            <div class="dock-tabs-spacer" />
            <button class="toolbar-icon-button tiny" aria-label="Hide bottom dock" title="Hide bottom workspace" onClick={() => setLayout((current) => ({ ...current, bottomHeight: 150 }))}>
              <span>−</span>
            </button>
          </div>

          <Show when={bottomTab() === "Project"}>
            <div class="project-browser">
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
                                if (file.path.toLowerCase().endsWith(".scene")) void loadScene(file.path);
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
                          if (isFile && path.toLowerCase().endsWith(".scene")) void loadScene(path);
                          else log("info", `Selected project file: ${path}`);
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
                    <Show when={selectedProjectPath().endsWith(".scene")}>
                      <button class="subtle-button" onClick={() => void loadScene(selectedProjectPath())}>Open Scene</button>
                    </Show>
                  </Show>
                </div>
              </div>
            </div>
          </Show>

          <Show when={bottomTab() === "Animation"}>
            <div class="animation-workspace">
              <div class="animation-track-list">
                <div class="track-header">TRACK / PROPERTY</div>
                <div class="track-row"><Icon theme={theme()} name="sprite-2d" size={13} /> {selectedObject()?.name ?? "No selected object"}</div>
                <div class="track-row muted"><Icon theme={theme()} name="animation" size={13} /> Sprite frames</div>
              </div>
              <div class="animation-timeline">
                <div class="timeline-toolbar">
                  <strong>Animation Timeline</strong>
                  <span>Frame tracks are not connected to a serializable animation model yet.</span>
                </div>
                <div class="timeline-ruler"><For each={["0.00", "0.25", "0.50", "0.75", "1.00"]}>{(time) => <span>{time}s</span>}</For></div>
                <div class="timeline-empty">No animation clip selected</div>
              </div>
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
              onUndock={!compactWorkbench() && layout().consoleDocked ? undockConsole : undefined}
            />
          </Show>
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
          if (event.target === event.currentTarget) setPaletteOpen(false);
        }}>
          <div class="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
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
