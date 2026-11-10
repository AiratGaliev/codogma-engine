import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import {
  createManagedProject,
  getProjectManagerSnapshot,
  openManagedProject,
  removeRecentManagedProject,
  type ManagedProjectDirectory,
  type ManagedRecentProject,
  type ProjectManagerSnapshot,
} from "./services/editor-api";
import "./project-manager.css";

type ProjectManagerTheme = "dark" | "light";

interface ProjectManagerProps {
  theme: ProjectManagerTheme;
  canClose: boolean;
  onClose?: () => void;
  onProjectOpened: (recentWarning?: string) => void;
}

function formatLastOpened(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Previously opened";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function displayDiagnostics(items: readonly { path?: string; message: string }[]): string {
  return items.map((item) => (item.path ? item.path + ": " : "") + item.message).join("\n");
}

function suggestedFolderName(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 80) || "New Project";
}

export default function ProjectManager(props: ProjectManagerProps) {
  const [snapshot, setSnapshot] = createSignal<ProjectManagerSnapshot | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [busyProject, setBusyProject] = createSignal("");
  const [view, setView] = createSignal<"home" | "new">("home");
  const [projectName, setProjectName] = createSignal("My 2D Game");
  const [folderName, setFolderName] = createSignal("");
  const [parentRelativePath, setParentRelativePath] = createSignal("");
  const [templateId, setTemplateId] = createSignal("empty-2d");
  const [error, setError] = createSignal("");
  const [warning, setWarning] = createSignal("");

  const availableProjects = createMemo(() =>
    (snapshot()?.projects ?? []).filter((item) => item.manifestValid === true),
  );
  const invalidProjects = createMemo(() =>
    (snapshot()?.projects ?? []).filter((item) => item.manifestValid === false),
  );
  const parentDirectories = createMemo(() =>
    (snapshot()?.directories ?? []).filter((item) => !item.isProject),
  );

  async function refreshSnapshot() {
    setLoading(true);
    setError("");
    try {
      const result = await getProjectManagerSnapshot();
      setSnapshot(result);
      if (result.startupProjectError) setWarning(result.startupProjectError);
      else setWarning("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  async function openProject(project: ManagedProjectDirectory | ManagedRecentProject) {
    if ("status" in project && project.status !== "available") {
      if ("diagnostics" in project && project.diagnostics && project.diagnostics.length > 0) {
        setError(displayDiagnostics(project.diagnostics));
      } else {
        setError("This project is no longer available. Refresh the list or remove it from Recent Projects.");
      }
      return;
    }

    setBusyProject(project.relativePath);
    setError("");
    setWarning("");
    try {
      const result = await openManagedProject(project.relativePath);
      props.onProjectOpened(result.recentWarning || undefined);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setBusyProject("");
    }
  }

  async function createProject(event: SubmitEvent) {
    event.preventDefault();
    setBusyProject("create");
    setError("");
    setWarning("");
    try {
      const result = await createManagedProject({
        name: projectName(),
        folderName: folderName().trim() || suggestedFolderName(projectName()),
        parentRelativePath: parentRelativePath(),
        templateId: templateId(),
      });
      props.onProjectOpened(result.recentWarning || undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyProject("");
    }
  }

  async function removeRecent(projectId: string) {
    setBusyProject("remove:" + projectId);
    setError("");
    try {
      await removeRecentManagedProject(projectId);
      await refreshSnapshot();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyProject("");
    }
  }

  function startCreate() {
    setError("");
    setWarning("");
    setView("new");
  }

  function cancelCreate() {
    setError("");
    setView("home");
  }

  onMount(() => {
    void refreshSnapshot();
  });

  return (
    <main class="project-manager" data-theme={props.theme} data-testid="project-manager">
      <header class="pm-header">
        <div class="pm-brand">
          <span class="pm-brand-mark" aria-hidden="true"><span /></span>
          <span class="pm-brand-name">CODOGMA</span>
          <span class="pm-brand-descriptor">ENGINE</span>
        </div>
        <div class="pm-header-actions">
          <button class="pm-quiet-button" type="button" onClick={() => void refreshSnapshot()} disabled={loading() || busyProject() !== ""}>
            Refresh
          </button>
          <Show when={props.canClose && props.onClose}>
            <button class="pm-close-button" type="button" onClick={() => props.onClose?.()} aria-label="Return to the Editor Workbench">
              Return to Editor
            </button>
          </Show>
        </div>
      </header>

      <section class="pm-content">
        <div class="pm-intro">
          <span class="pm-eyebrow">PROJECT WORKSPACE</span>
          <h1>{view() === "new" ? "Create a project" : "Welcome to Codogma Engine"}</h1>
          <p>
            {view() === "new"
              ? "Choose a project name and location. Codogma validates the complete project before it appears in the Projects folder."
              : "Create a new 2D game project or continue working on one of your existing projects."}
          </p>
        </div>

        <Show when={error()}>
          <div class="pm-message pm-message-error" role="alert">
            <strong>Project Manager</strong>
            <span>{error()}</span>
          </div>
        </Show>
        <Show when={warning()}>
          <div class="pm-message pm-message-warning" role="status">
            <strong>Notice</strong>
            <span>{warning()}</span>
          </div>
        </Show>

        <Show when={view() === "new"} fallback={
          <div class="pm-home">
            <section class="pm-primary-actions" aria-label="Project actions">
              <button class="pm-action-card pm-action-new" type="button" onClick={startCreate} data-testid="new-project">
                <span class="pm-action-icon" aria-hidden="true">＋</span>
                <span class="pm-action-copy">
                  <strong>New Project</strong>
                  <small>Start from an official 2D template</small>
                </span>
                <span class="pm-action-arrow" aria-hidden="true">→</span>
              </button>
              <div class="pm-location-card">
                <span class="pm-location-icon" aria-hidden="true">⌂</span>
                <div>
                  <strong>Projects location</strong>
                  <code>{snapshot()?.projectsRoot ?? "Loading project location…"}</code>
                </div>
              </div>
            </section>

            <section class="pm-section">
              <div class="pm-section-heading">
                <div>
                  <h2>Recent Projects</h2>
                  <p>Projects are matched by their stable Project ID, so moving a folder does not lose its recent entry.</p>
                </div>
                <span class="pm-section-count">{snapshot()?.recentProjects.length ?? 0}</span>
              </div>

              <Show when={!loading()} fallback={<div class="pm-empty-state">Loading recent projects…</div>}>
                <Show when={(snapshot()?.recentProjects.length ?? 0) > 0} fallback={
                  <div class="pm-empty-state">
                    <strong>No recent projects</strong>
                    <span>Projects you open will be listed here.</span>
                  </div>
                }>
                  <div class="pm-project-list">
                    <For each={snapshot()?.recentProjects ?? []}>
                      {(project) => (
                        <article class="pm-project-row" data-testid="recent-project">
                          <span class="pm-project-icon" aria-hidden="true">▧</span>
                          <div class="pm-project-main">
                            <strong>{project.name}</strong>
                            <code>{project.relativePath}</code>
                            <small>{formatLastOpened(project.lastOpenedAt)}</small>
                            <Show when={project.status === "invalid"}>
                              <span class="pm-project-diagnostic">{displayDiagnostics(project.diagnostics) || "The project manifest is invalid."}</span>
                            </Show>
                            <Show when={project.status === "available" && project.diagnostics.length > 0}>
                              <span class="pm-inline-warning">{displayDiagnostics(project.diagnostics)}</span>
                            </Show>
                            <Show when={project.status === "missing"}>
                              <span class="pm-project-diagnostic">Project folder is missing. It may have been moved outside the configured Projects location or deleted.</span>
                            </Show>
                          </div>
                          <span class="pm-project-status" data-status={project.status}>
                            {project.status === "available" ? "Found" : project.status === "invalid" ? "Needs attention" : "Not found"}
                          </span>
                          <button
                            class="pm-row-button"
                            type="button"
                            disabled={busyProject() !== "" || project.status !== "available"}
                            onClick={() => void openProject(project)}
                          >
                            {busyProject() === project.relativePath ? "Opening…" : "Open"}
                          </button>
                          <button
                            class="pm-remove-button"
                            type="button"
                            aria-label={"Remove " + project.name + " from Recent Projects"}
                            title="Remove from Recent Projects"
                            disabled={busyProject() !== ""}
                            onClick={() => void removeRecent(project.projectId)}
                          >×</button>
                        </article>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
              <Show when={snapshot()?.recentError}>
                <p class="pm-inline-warning">{snapshot()?.recentError}</p>
              </Show>
            </section>

            <section class="pm-section">
              <div class="pm-section-heading">
                <div>
                  <h2>Projects</h2>
                  <p>Native Codogma projects found under the configured Projects location.</p>
                </div>
                <span class="pm-section-count">{availableProjects().length}</span>
              </div>
              <Show when={!loading()} fallback={<div class="pm-empty-state">Scanning project folders…</div>}>
                <Show when={availableProjects().length > 0} fallback={
                  <div class="pm-empty-state">
                    <strong>No projects found in this location</strong>
                    <span>Create a project here, or configure PROJECTS_DIR to your preferred projects folder.</span>
                  </div>
                }>
                  <div class="pm-project-list">
                    <For each={availableProjects()}>
                      {(project) => (
                        <article class="pm-project-row" data-testid="project-entry">
                          <span class="pm-project-icon" aria-hidden="true">▧</span>
                          <div class="pm-project-main">
                            <strong>{project.projectName || project.name}</strong>
                            <code>{project.relativePath}</code>
                            <small>{project.runtimeAdapterId || "Native project"}</small>
                          </div>
                          <span class="pm-project-status" data-status="available">Valid manifest</span>
                          <button class="pm-row-button" type="button" disabled={busyProject() !== ""} onClick={() => void openProject(project)}>
                            {busyProject() === project.relativePath ? "Opening…" : "Open"}
                          </button>
                        </article>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </section>

            <Show when={invalidProjects().length > 0}>
              <section class="pm-section">
                <div class="pm-section-heading">
                  <div>
                    <h2>Projects requiring attention</h2>
                    <p>These folders contain project manifests but did not pass the schema check. They will not be opened automatically.</p>
                  </div>
                  <span class="pm-section-count">{invalidProjects().length}</span>
                </div>
                <div class="pm-project-list">
                  <For each={invalidProjects()}>
                    {(project) => (
                      <article class="pm-project-row pm-invalid-row">
                        <span class="pm-project-icon" aria-hidden="true">!</span>
                        <div class="pm-project-main">
                          <strong>{project.name}</strong>
                          <code>{project.relativePath}</code>
                          <span class="pm-project-diagnostic">{displayDiagnostics(project.diagnostics ?? []) || "Project validation failed."}</span>
                        </div>
                        <span class="pm-project-status" data-status="invalid">Invalid</span>
                      </article>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={snapshot()?.scanError}>
              <p class="pm-inline-warning" role="status">{snapshot()?.scanError}</p>
            </Show>
            <Show when={snapshot()?.scanLimitReached}>
              <p class="pm-inline-warning">The project scan reached its safety limit. Set a narrower PROJECTS_DIR to see all folders.</p>
            </Show>
          </div>
        }>
          <form class="pm-create-form" onSubmit={createProject}>
            <label class="pm-field">
              <span>Project name</span>
              <input
                name="projectName"
                value={projectName()}
                maxLength={128}
                required
                onInput={(event) => setProjectName(event.currentTarget.value)}
                placeholder="My 2D Game"
              />
            </label>
            <label class="pm-field">
              <span>Folder name</span>
              <input
                name="folderName"
                value={folderName()}
                maxLength={80}
                onInput={(event) => setFolderName(event.currentTarget.value)}
                placeholder={suggestedFolderName(projectName())}
              />
              <small>Single folder name, without path separators. Existing folders will never be overwritten.</small>
            </label>
            <label class="pm-field">
              <span>Location</span>
              <select value={parentRelativePath()} onChange={(event) => setParentRelativePath(event.currentTarget.value)}>
                <option value="">Projects root</option>
                <For each={parentDirectories()}>
                  {(directory) => <option value={directory.relativePath}>{directory.relativePath}</option>}
                </For>
              </select>
              <small>{snapshot()?.projectsRoot}</small>
            </label>
            <fieldset class="pm-template-field">
              <legend>Template</legend>
              <For each={snapshot()?.templates ?? []}>
                {(template) => (
                  <label class="pm-template-option" classList={{ selected: templateId() === template.id }}>
                    <input
                      type="radio"
                      name="template"
                      value={template.id}
                      checked={templateId() === template.id}
                      onChange={() => setTemplateId(template.id)}
                    />
                    <span class="pm-template-icon" aria-hidden="true">◇</span>
                    <span>
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </span>
                    <span class="pm-template-check" aria-hidden="true">{templateId() === template.id ? "✓" : ""}</span>
                  </label>
                )}
              </For>
            </fieldset>
            <div class="pm-create-summary">
              <strong>What will be created</strong>
              <span>Native Project Model v1 · Main Scene · assets, scripts and build folders · no game-specific code</span>
            </div>
            <div class="pm-form-actions">
              <button class="pm-quiet-button" type="button" onClick={cancelCreate} disabled={busyProject() !== ""}>Cancel</button>
              <button class="pm-create-button" type="submit" disabled={loading() || busyProject() !== "" || !projectName().trim()}>
                {busyProject() === "create" ? "Creating and validating…" : "Create Project"}
              </button>
            </div>
          </form>
        </Show>
      </section>
      <footer class="pm-footer">
        <span>Codogma Engine</span>
        <span>Native Project Model</span>
        <span>Local workspace</span>
      </footer>
    </main>
  );
}
