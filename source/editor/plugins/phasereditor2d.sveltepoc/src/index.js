/*
        Svelte PoC bridge (P0 item 8) — hand-written adapter between the colibri
        workbench and the Svelte SceneStatsPanel component.

        This file is the "bridge cost" measurement subject: everything the Svelte
        panel needs from the editor lives here (selection events, theme events,
        project info, workbench actions). Compiled together with the Svelte runtime
        into a single classic script at _out/svelte-poc.js (see build/build.mjs).

        Modes:
        - live:    colibri is present -> registers a real colibri Plugin, adds a
                   "Svelte PoC" tab next to the Inspector and wires workbench events.
        - mock:    colibri is absent (standalone page) -> mounts the same component
                   against a mock event source that implements ONLY the
                   selection-event / theme-event interface. Mocked surface:
                   * selection events: window.sveltePocMock.emitSelection(labels)
                   * theme events:     window.sveltePocMock.toggleTheme()
                   * project files:    fixed number (no file storage)
*/

import { mount } from "svelte";
import SceneStatsPanel from "./compiled/SceneStatsPanel.svelte.js";

const PLUGIN_ID = "phasereditor2d.sveltepoc";
const PART_ID = PLUGIN_ID + ".SceneStatsPart";

function hasColibri() {

    return typeof window !== "undefined"
        && window.colibri
        && window.colibri.Platform
        && typeof window.colibri.Platform.addPlugin === "function";
}

function labelOf(obj) {

    // colibri selections are untyped: the workbench fan-out can leave plain
    // strings/files in a part's selection (e.g. the Outline sync). Handle
    // primitives before probing object APIs, otherwise every string maps to
    // constructor.name === "String" and the panel's keyed list gets duplicate
    // keys (Svelte each_key_duplicate, found during browser verification).
    if (obj === null || obj === undefined) {

        return "null";
    }

    if (typeof obj === "string" || typeof obj === "number") {

        return String(obj);
    }

    try {

        if (obj.getEditorSupport && typeof obj.getEditorSupport().getLabel === "function") {
            return obj.getEditorSupport().getLabel();
        }

        if (typeof obj.getLabel === "function") {
            return obj.getLabel();
        }

    } catch (e) {
        // fall through
    }

    return (obj.constructor && obj.constructor.name) || String(obj);
}

function themeTokens(theme) {

    return {
        id: theme && theme.id ? theme.id : "?",
        dark: Boolean(theme && theme.dark),
        fg: (theme && theme.viewerForeground) || "#e6e7ea",
        accent: (theme && theme.viewerSelectionBackground) || "#ff9d45"
    };
}

/* ============================== live bridge ============================== */

class SveltePocPart extends colibri.ui.ide.Part {

    constructor(onCreatePart) {

        super(PART_ID);

        this.setTitle("Svelte PoC");

        this._onCreatePart = onCreatePart;
    }

    createPart() {

        this._onCreatePart(this.getElement());
    }
}

class LiveBridge {

    constructor(workbench) {

        this.workbench = workbench;
        this.comp = null;
        this.injected = false;
        this.currentPart = null;

        this.selectionListener = () => this.pushSelection();

        workbench.eventProjectOpened.addListener(() => this.injectPanel());

        workbench.eventThemeChanged.addListener(theme => {

            if (this.comp) {
                this.comp.setTheme(themeTokens(theme));
            }
        });

        workbench.eventPartActivated.addListener(() => this.trackActivePart());
    }

    injectPanel() {

        if (this.injected) {
            return;
        }

        this.injected = true;

        const win = this.workbench.getActiveWindow();

        const inspector = win ? win.getView("InspectorView") : null;

        if (!inspector || !inspector.getPartFolder) {

            console.warn("[svelte-poc] InspectorView not found, panel not injected");

            return;
        }

        this.panelPart = new SveltePocPart(el => this.onPanelCreated(el));

        // non-closeable, not selected: the tab appears next to "Inspector"
        inspector.getPartFolder().addPart(this.panelPart, false, false);

        // force creation now (tab is hidden until selected, mount still happens)
        this.panelPart.onPartShown();
    }

    onPanelCreated(el) {

        const t0 = performance.now();

        this.comp = mount(SceneStatsPanel, {
            target: el,
            props: {
                actions: {
                    focusOutline: () => this.focusOutline(),
                    selectAll: () => this.selectAllObjects(),
                    benchmark: () => this.runBenchmark()
                }
            }
        });

        this.mountMs = performance.now() - t0;

        this.comp.setMountMs(this.mountMs);

        this.comp.setTheme(themeTokens(colibri.ui.controls.Controls.getTheme()));

        this.pushProjectFiles();

        this.trackActivePart();
    }

    trackActivePart() {

        const part = this.workbench.getActivePart();

        if (part === this.panelPart) {

            if (this.comp) {
                this.comp.setBridgeInfo("live: active part = this panel");
            }

            return;
        }

        if (part !== this.currentPart) {

            if (this.currentPart) {
                this.currentPart.eventSelectionChanged.removeListener(this.selectionListener);
            }

            this.currentPart = part;

            if (part) {
                part.eventSelectionChanged.addListener(this.selectionListener);
            }
        }

        if (this.comp) {

            const name = part ? (part.constructor && part.constructor.name) || part.getId() : "none";

            this.comp.setBridgeInfo("live: colibri workbench, tracked part: " + name);
        }

        this.pushSelection();
    }

    pushSelection() {

        if (!this.comp) {
            return;
        }

        const sel = this.currentPart ? this.currentPart.getSelection() : [];

        this.comp.setSelection(sel.map(labelOf));
    }

    pushProjectFiles() {

        try {

            const files = colibri.ui.ide.FileUtils.getAllFiles();

            if (this.comp) {
                this.comp.setProjectFiles(files.length);
            }

        } catch (e) {

            if (this.comp) {
                this.comp.setProjectFiles(null);
            }
        }
    }

    // panel -> workbench action: focus the Outline view
    focusOutline() {

        const t0 = performance.now();

        const win = this.workbench.getActiveWindow();

        const outline = win ? win.getView("OutlineView") : null;

        if (!outline) {
            return { ok: false, message: "OutlineView not found" };
        }

        this.workbench.setActivePart(outline);

        const ok = this.workbench.getActivePart() === outline;

        return { ok, message: ok ? "ok (" + (performance.now() - t0).toFixed(2) + " ms)" : "failed" };
    }

    // panel -> workbench action: select all objects of the current scene
    selectAllObjects() {

        const t0 = performance.now();

        const part = this.currentPart;

        if (!part || typeof part.getScene !== "function") {
            return { ok: false, message: "no scene editor part active" };
        }

        const scene = part.getScene();

        const objs = (scene && scene.getGameObjects) ? scene.getGameObjects() : null;

        if (!objs) {
            return { ok: false, message: "scene objects unavailable" };
        }

        part.setSelection(objs.slice());

        return { ok: true, message: objs.length + " selected (" + (performance.now() - t0).toFixed(2) + " ms)" };
    }

    // 1000 selection events; through the real workbench event path when possible
    runBenchmark(count = 1000) {

        const labels = Array.from({ length: 20 }, (_, i) => "Object_" + i);

        const before = this.comp.getUpdateCount();

        const throughWorkbench = Boolean(this.currentPart
            && typeof this.currentPart.setSelection === "function");

        const t0 = performance.now();

        if (throughWorkbench) {

            // real path: colibri ListenerList fires, co-listeners (Inspector,
            // outline sync) run too, then our listener updates the component
            for (let i = 0; i < count; i++) {
                this.currentPart.setSelection(labels);
            }

        } else {

            // fallback: direct bridge call (same listener the event would call)
            for (let i = 0; i < count; i++) {
                this.comp.setSelection(labels.slice());
            }
        }

        const totalMs = performance.now() - t0;

        const processed = this.comp.getUpdateCount() - before;

        this.comp.recordBenchmark(totalMs, (totalMs * 1000) / count, throughWorkbench, processed);

        return {
            ok: true,
            message: count + " events in " + totalMs.toFixed(2) + " ms ("
                + ((totalMs * 1000) / count).toFixed(1) + " µs/event, "
                + (throughWorkbench ? "workbench path" : "direct path") + ", "
                + processed + " updates)"
        };
    }
}

/* ============================== mock bridge ============================== */

// Standalone mode: reimplements ONLY the selection-event interface (+ theme).
class MockBridge {

    constructor(root) {

        this.comp = mount(SceneStatsPanel, {
            target: root,
            props: {
                actions: {
                    focusOutline: null,
                    selectAll: null,
                    benchmark: () => this.runBenchmark()
                }
            }
        });

        this.selectionListener = labels => this.comp.setSelection(labels);

        this.dark = true;

        this.comp.setMountMs(0); // replaced below by index.html measurement

        this.comp.setTheme(this.currentTheme());

        this.comp.setProjectFiles(42);

        this.comp.setBridgeInfo("MOCK: no colibri, fake selection/theme source (documented in ADR-0004)");
    }

    currentTheme() {

        return {
            id: this.dark ? "dark" : "light",
            dark: this.dark,
            viewerForeground: this.dark ? "#e6e7ea" : "#17181a",
            viewerSelectionBackground: "#ff9d45"
        };
    }

    emitSelection(labels) {

        this.selectionListener(labels);
    }

    toggleTheme() {

        this.dark = !this.dark;

        document.documentElement.classList.toggle("dark", this.dark);
        document.documentElement.classList.toggle("light", !this.dark);

        this.comp.setTheme(this.currentTheme());
    }

    runBenchmark(count = 1000) {

        const labels = Array.from({ length: 20 }, (_, i) => "Object_" + i);

        const before = this.comp.getUpdateCount();

        const t0 = performance.now();

        for (let i = 0; i < count; i++) {
            this.emitSelection(labels);
        }

        const totalMs = performance.now() - t0;

        this.comp.recordBenchmark(totalMs, (totalMs * 1000) / count, false, this.comp.getUpdateCount() - before);

        return { ok: true, message: count + " mock events in " + totalMs.toFixed(2) + " ms" };
    }
}

/* ================================ boot ================================= */

(function boot() {

    if (hasColibri()) {

        class SveltePocPlugin extends colibri.Plugin {

            registerExtensions(reg) {

                new LiveBridge(colibri.ui.ide.Workbench.getWorkbench());
            }
        }

        colibri.Platform.addPlugin(new SveltePocPlugin(PLUGIN_ID));

        console.log("[svelte-poc] plugin registered (live workbench mode)");

        return;
    }

    // standalone/mock mode: only auto-mounts on the standalone test page
    window.addEventListener("DOMContentLoaded", () => {

        const root = document.getElementById("sveltepoc-root");

        if (!root) {
            return;
        }

        const t0 = performance.now();

        const mock = new MockBridge(root);

        const mountMs = performance.now() - t0;

        mock.comp.setMountMs(mountMs);

        window.sveltePocMock = mock;

        document.getElementById("sveltepoc-emit")?.addEventListener("click", () => {

            mock.emitSelection(["Dino", "Coin", "Platform", "Player"]);
        });

        document.getElementById("sveltepoc-theme")?.addEventListener("click", () => mock.toggleTheme());

        document.getElementById("sveltepoc-bench")?.addEventListener("click", () => mock.runBenchmark());

        console.log("[svelte-poc] mock mode mounted in " + mountMs.toFixed(2) + " ms");
    });
})();
