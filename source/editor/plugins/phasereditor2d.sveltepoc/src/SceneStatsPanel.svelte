<!--
        Svelte PoC panel (P0 item 8) — Scene Stats.

        Shows the current workbench selection (count + object labels), the project
        file count and its own integration metrics (mount cost, updates processed,
        selection-benchmark results). Theme-aware through the same convention the
        colibri workbench uses: `html.dark` / `html.light` root classes plus the
        theme palette tokens passed by the bridge as CSS custom properties.

        The component is UI-only: all workbench access goes through the `actions`
        prop (panel -> workbench) and imperative exports (workbench -> panel),
        so the same component runs against the live colibri workbench or a mock.
-->
<script>
        let selection = $state([]);
        let theme = $state({ id: "?", dark: true, fg: "#e6e7ea", accent: "#ff9d45" });
        let projectFiles = $state(null);
        let mountMs = $state(null);
        let updates = $state(0);
        let bench = $state(null);
        let bridgeInfo = $state("");
        let actionFeedback = $state("");

        let { actions = {} } = $props();

        const MAX_NAMES = 10;

        let hiddenCount = $derived(Math.max(0, selection.length - MAX_NAMES));

        function runAction(name, fn) {
                if (typeof fn !== "function") {
                        actionFeedback = `${name}: not available in this mode`;
                        return;
                }
                try {
                        const r = fn();
                        actionFeedback = `${name}: ${r && r.message ? r.message : "ok"}`;
                } catch (e) {
                        actionFeedback = `${name}: ERROR ${e && e.message ? e.message : e}`;
                }
        }

        // ---- imperative API used by the bridge (workbench -> panel) ----

        export function setSelection(labels) {
                selection = labels;
                updates++;
        }

        export function setTheme(t) {
                theme = {
                        id: t.id,
                        dark: Boolean(t.dark),
                        fg: t.fg || "#e6e7ea",
                        accent: t.accent || "#ff9d45",
                };
                updates++;
        }

        export function setProjectFiles(n) {
                projectFiles = n;
        }

        export function setMountMs(ms) {
                mountMs = ms;
        }

        export function setBridgeInfo(s) {
                bridgeInfo = s;
        }

        export function getUpdateCount() {
                return updates;
        }

        export function recordBenchmark(totalMs, perEventUs, throughWorkbench, processed) {
                bench = { totalMs, perEventUs, throughWorkbench, processed };
        }
</script>

<div
        class="sveltepoc-panel"
        style="--sveltepoc-fg: {theme.fg}; --sveltepoc-accent: {theme.accent};"
>
        <div class="sveltepoc-header">
                <span class="sveltepoc-title">Svelte PoC — Scene Stats</span>
                <span class="sveltepoc-chip">theme: {theme.id}</span>
        </div>

        <div class="sveltepoc-row">
                <span class="sveltepoc-label">Selection</span>
                <span class="sveltepoc-value">{selection.length} object{selection.length === 1 ? "" : "s"}</span>
        </div>

        {#if selection.length > 0}
                <ul class="sveltepoc-names">
                        <!-- keys are positional: editor labels are NOT unique
                             (two objects may share a label), so a name-keyed
                             each throws each_key_duplicate at runtime -->
                        {#each selection.slice(0, MAX_NAMES) as name, i (i)}
                                <li>{name}</li>
                        {/each}
                        {#if hiddenCount > 0}
                                <li class="sveltepoc-more">… +{hiddenCount} more</li>
                        {/if}
                </ul>
        {:else}
                <div class="sveltepoc-empty">Nothing selected — click an object in the scene or the Outline.</div>
        {/if}

        <div class="sveltepoc-row">
                <span class="sveltepoc-label">Project files</span>
                <span class="sveltepoc-value">{projectFiles ?? "…"}</span>
        </div>

        <div class="sveltepoc-row">
                <span class="sveltepoc-label">Bridge</span>
                <span class="sveltepoc-value sveltepoc-small">{bridgeInfo}</span>
        </div>

        <div class="sveltepoc-actions">
                <button onclick={() => runAction("focusOutline", actions.focusOutline)}>Focus Outline</button>
                <button onclick={() => runAction("selectAll", actions.selectAll)}>Select All Objects</button>
                <button onclick={() => runAction("benchmark", actions.benchmark)}>Benchmark ×1000</button>
        </div>

        {#if actionFeedback}
                <div class="sveltepoc-feedback">{actionFeedback}</div>
        {/if}

        <div class="sveltepoc-perf">
                <div class="sveltepoc-row">
                        <span class="sveltepoc-label">Mount time</span>
                        <span class="sveltepoc-value">{mountMs === null ? "…" : mountMs.toFixed(2) + " ms"}</span>
                </div>
                <div class="sveltepoc-row">
                        <span class="sveltepoc-label">Svelte updates processed</span>
                        <span class="sveltepoc-value">{updates}</span>
                </div>
                {#if bench}
                        <div class="sveltepoc-row">
                                <span class="sveltepoc-label">1000 selection events ({bench.throughWorkbench ? "full workbench path" : "panel-only path"})</span>
                                <span class="sveltepoc-value">{bench.totalMs.toFixed(2)} ms total · {bench.perEventUs.toFixed(1)} µs/event</span>
                        </div>
                        <div class="sveltepoc-row">
                                <span class="sveltepoc-label">Events that reached Svelte</span>
                                <span class="sveltepoc-value">{bench.processed} / 1000</span>
                        </div>
                {/if}
        </div>
</div>

<style>
        .sveltepoc-panel {
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 8px 10px;
                overflow: auto;
                font-family: Roboto, "Segoe UI", sans-serif;
                font-size: 12px;
                background: var(--sveltepoc-bg, #1f2126);
                color: var(--sveltepoc-fg, #e6e7ea);
        }

        .sveltepoc-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
        }

        .sveltepoc-title {
                font-weight: 600;
        }

        .sveltepoc-chip {
                font-size: 10px;
                padding: 1px 6px;
                border-radius: 8px;
                background: var(--sveltepoc-accent, #ff9d45);
                color: #10120f;
        }

        .sveltepoc-row {
                display: flex;
                gap: 6px;
                align-items: baseline;
        }

        .sveltepoc-label {
                flex: 0 0 auto;
                opacity: 0.75;
        }

        .sveltepoc-value {
                white-space: nowrap;
        }

        .sveltepoc-small {
                font-size: 11px;
                opacity: 0.85;
                overflow: hidden;
                text-overflow: ellipsis;
        }

        .sveltepoc-names {
                margin: 0;
                padding: 4px 0 4px 18px;
                border: 1px solid var(--sveltepoc-border, #ffffff14);
                border-radius: 4px;
                background: var(--sveltepoc-bg2, #26282e);
        }

        .sveltepoc-names li {
                margin: 1px 0;
        }

        .sveltepoc-more {
                opacity: 0.6;
        }

        .sveltepoc-empty {
                padding: 8px;
                border: 1px dashed var(--sveltepoc-border, #ffffff14);
                border-radius: 4px;
                opacity: 0.7;
        }

        .sveltepoc-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 2px;
        }

        .sveltepoc-actions button {
                font-size: 11px;
                padding: 3px 8px;
                border-radius: 4px;
                border: 1px solid var(--sveltepoc-border, #ffffff1c);
                background: var(--sveltepoc-btn, #2b2d34);
                color: inherit;
                cursor: pointer;
        }

        .sveltepoc-actions button:hover {
                border-color: var(--sveltepoc-accent, #ff9d45);
        }

        .sveltepoc-feedback {
                font-size: 11px;
                opacity: 0.8;
        }

        .sveltepoc-perf {
                margin-top: 4px;
                padding-top: 4px;
                border-top: 1px solid var(--sveltepoc-border, #ffffff14);
                display: flex;
                flex-direction: column;
                gap: 4px;
        }

        /* light-theme palette overrides, following the colibri theme convention
           (theme classes live on <html>: html.dark / html.light / html.lightBlue) */
        :global(html.light) .sveltepoc-panel,
        :global(html.lightBlue) .sveltepoc-panel {
                --sveltepoc-bg: #f5f6f8;
                --sveltepoc-bg2: #ffffff;
                --sveltepoc-border: #b8bcc4;
                --sveltepoc-btn: #eceef2;
        }
</style>
