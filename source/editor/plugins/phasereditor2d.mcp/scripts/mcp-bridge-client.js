/**
 * Phaser Editor 2D — MCP bridge client + AI panel.
 *
 * Loaded as a plain-JS editor plugin (no build step required).
 *
 * Responsibilities:
 *  1. Connect the running editor to the server MCP Bridge (SSE) so that
 *     MCP tools which need the editor UI (open scene, active scene,
 *     screenshots) can be executed by AI agents.
 *  2. Provide the "AI" workbench features of Phaser Editor v5:
 *     - AI Chat panel (chat with an LLM that can call the editor MCP tools)
 *     - MCP Server Configuration dialog (main menu AI -> configuration info)
 */

/* global colibri, phasereditor2d */

(function () {

    "use strict";

    const MCP_BRIDGE_EVENTS = "/editor/mcp-bridge/events";
    const MCP_BRIDGE_RESULT = "/editor/mcp-bridge/result";
    const MCP_BRIDGE_ACTIVATE = "/editor/mcp-bridge/activate";

    let bridgeClientId = null;
    let bridgeActivationPending = false;

    const AI_CHAT_MAX_ATTACHMENTS = 8;

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    function workbench() {
        return colibri.Platform.getWorkbench();
    }

    function findFile(fullName) {

        const root = workbench().getProjectRoot();

        const parts = String(fullName).split("/").filter(Boolean);

        // full names may start with the project root folder name; consume it
        if (parts[0] === root.getName()) {
            parts.shift();
        }

        let f = root;

        for (const part of parts) {

            if (!f) return null;

            f = f.getFiles().find(x => x.getName() === part);
        }

        return f;
    }

    function getSceneEditors() {

        return workbench().getEditors().filter(e =>
            e instanceof phasereditor2d.scene.ui.editor.SceneEditor);
    }

    function sceneFileOf(editor) {

        const input = editor.getInput();

        return input ? input.getFullName() : null;
    }

    function samePath(a, b) {

        const strip = s => {
            const parts = String(s).split("/").filter(Boolean);
            if (parts[0] === workbench().getProjectRoot().getName()) parts.shift();
            return parts.join("/");
        };

        return strip(a) === strip(b);
    }

    function activateBridgeSession() {

        if (!bridgeClientId || bridgeActivationPending) return;

        bridgeActivationPending = true;

        fetch(MCP_BRIDGE_ACTIVATE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ clientId: bridgeClientId })
        })
            .catch(e => console.warn("[Phaser Editor AI] MCP session activation failed", e))
            .finally(() => { bridgeActivationPending = false; });
    }

    function postResult(id, result, clientId = bridgeClientId) {

        if (!clientId) return Promise.reject(new Error("MCP bridge session is not established."));

        return fetch(MCP_BRIDGE_RESULT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ id, clientId, result })
        }).then(response => {
            if (!response.ok) throw new Error(`MCP bridge result rejected (${response.status}).`);
            return response.json();
        });
    }

    // ------------------------------------------------------------------
    // UI command handlers
    // ------------------------------------------------------------------

    async function cmdGetActiveScene() {

        let editor = workbench().getActiveEditor();

        if (!editor || !(editor instanceof phasereditor2d.scene.ui.editor.SceneEditor)) {

            const anyScene = getSceneEditors()[0];

            if (!anyScene) {
                throw new Error("There is no scene editor open in the IDE.");
            }

            editor = anyScene;
        }

        const file = editor.getInput();

        const scene = editor.getScene();

        if (!scene || !scene.getSettings || !scene.getSettings()) {
            throw new Error("The scene editor is still loading. Retry in a moment.");
        }

        const settings = scene.getSettings();

        return {
            scenePath: file.getFullName(),
            sceneKey: settings.sceneKey,
            sceneId: scene.getId ? scene.getId() : undefined
        };
    }

    async function cmdOpenScene(args) {

        const file = findFile(args.scenePath);

        if (!file) {
            throw new Error(`Cannot find file '${args.scenePath}' in the project files. Reload the project or check the path.`);
        }

        await workbench().openEditor(file);

        return `Scene opened in the editor: ${args.scenePath}`;
    }

    async function cmdSaveScene(args) {

        const fullName = args.scenePath;

        const editor = getSceneEditors().find(e => samePath(sceneFileOf(e), fullName));

        if (!editor) {
            throw new Error(`The scene '${fullName}' is not open in the editor. Use ide-open-scene first.`);
        }

        await editor.save();

        return `Scene saved (code generated): ${fullName}`;
    }

    async function cmdSceneScreenshot(args) {

        let editor = getSceneEditors().find(e => samePath(sceneFileOf(e), args.scenePath));

        if (!editor) {

            await cmdOpenScene(args);

            await new Promise(res => setTimeout(res, 3000));

            editor = getSceneEditors().find(e => samePath(sceneFileOf(e), args.scenePath));

            if (!editor) {
                throw new Error(`Could not open the scene editor for '${args.scenePath}'.`);
            }
        }

        const scene = editor.getScene();

        if (!scene || !scene.game || !scene.game.renderer) {
            throw new Error("The scene renderer is not ready.");
        }

        const data = await snapshotScene(scene, args);

        return {
            __image: true,
            data,
            mimeType: "image/png"
        };
    }

    /**
     * Snapshot the scene through the Phaser renderer (works for WebGL).
     * x/y/width/height are world coordinates; the camera transform is applied.
     */
    function snapshotScene(scene, args) {

        return new Promise((resolve, reject) => {

            const cam = scene.cameras.main;

            const zoom = cam.zoom || 1;

            // Phaser camera transform: world -> screen (no rotation)
            const sx = ((args.x ?? 0) - (cam.scrollX || 0) - cam.width / 2) * zoom + cam.width / 2;
            const sy = ((args.y ?? 0) - (cam.scrollY || 0) - cam.height / 2) * zoom + cam.height / 2;
            const sw = Math.max(1, Math.round((args.width ?? 800) * zoom));
            const sh = Math.max(1, Math.round((args.height ?? 600) * zoom));

            try {

                let done = false;

                scene.game.renderer.snapshotArea(sx, sy, sw, sh, img => {

                    if (done) return;
                    done = true;

                    try {

                        const out = document.createElement("canvas");
                        out.width = sw;
                        out.height = sh;
                        out.getContext("2d").drawImage(img, 0, 0);

                        const url = out.toDataURL("image/png");

                        resolve(url.slice(url.indexOf(",") + 1));

                    } catch (e) {
                        reject(e);
                    }
                });

                // The editor renders on demand (the game loop may be idle),
                // so force frames until the scheduled snapshot completes.
                let steps = 0;

                const tick = () => {

                    if (done || steps > 20) {

                        if (!done) reject(new Error("Snapshot timed out (no frame rendered)."));
                        return;
                    }

                    steps++;

                    try {
                        scene.game.loop.step(performance.now());
                    } catch (e) { /* keep ticking */ }

                    setTimeout(tick, 60);
                };

                setTimeout(tick, 60);

            } catch (e) {
                reject(new Error(`Renderer snapshot failed: ${e.message}`));
            }
        });
    }

    /**
     * Render a Spine skin/animation through the editor's normal thumbnail renderer.
     * This preserves support for both JSON and binary Spine skeleton assets.
     */
    async function cmdSpineSkinImage(args) {

        const packCore = phasereditor2d.pack.core;
        const packs = await packCore.AssetPackUtils.getAllPacks();
        let spineAsset = null;
        let atlasAsset = null;

        for (const assetPack of packs) {

            for (const item of assetPack.getItems()) {

                if (!spineAsset && item instanceof packCore.SpineAssetPackItem && item.getKey() === args.dataKey) {
                    spineAsset = item;
                }

                if (!atlasAsset && item instanceof packCore.SpineAtlasAssetPackItem && item.getKey() === args.atlasKey) {
                    atlasAsset = item;
                }
            }
        }

        if (!spineAsset) {
            throw new Error(`Spine skeleton "${args.dataKey}" was not found in the asset packs.`);
        }

        if (!atlasAsset) {
            throw new Error(`Spine atlas "${args.atlasKey}" was not found in the asset packs.`);
        }

        await spineAsset.preload();

        const skeleton = spineAsset.buildSkeleton(atlasAsset);
        if (!skeleton) {
            throw new Error(`Could not build Spine skeleton "${args.dataKey}" with atlas "${args.atlasKey}".`);
        }

        const skinExists = skeleton.skins.some(skin => skin.name === args.skinName)
            || skeleton.defaultSkin?.name === args.skinName;
        if (!skinExists) {
            throw new Error(`Spine skin "${args.skinName}" does not exist in skeleton "${args.dataKey}".`);
        }

        if (!skeleton.animations.some(animation => animation.name === args.animationName)) {
            throw new Error(`Spine animation "${args.animationName}" does not exist in skeleton "${args.dataKey}".`);
        }

        const skinItem = new packCore.SpineSkinItem(spineAsset, atlasAsset, args.skinName);
        const thumbnail = phasereditor2d.scene.ScenePlugin.getInstance()
            .buildSpineSkinThumbnailImage(skinItem, args.animationName);

        await thumbnail.preload();

        const imageElement = thumbnail.getImageElement();
        if (!imageElement) {
            throw new Error("Spine thumbnail renderer returned no image.");
        }

        const width = Math.max(1, Math.ceil(thumbnail.getWidth()));
        const height = Math.max(1, Math.ceil(thumbnail.getHeight()));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Could not create a 2D canvas context for the Spine thumbnail.");
        }

        context.drawImage(imageElement, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/png");
        const comma = dataUrl.indexOf(",");
        if (comma < 0) {
            throw new Error("Spine thumbnail renderer returned an invalid PNG data URL.");
        }

        return {
            __image: true,
            data: dataUrl.slice(comma + 1),
            mimeType: "image/png"
        };
    }

    async function cmdTextureBBox(args) {

        const url = args.url ? ("./project/" + args.url + "?m=" + Date.now()) : null;

        if (!url) {
            throw new Error("No texture url provided.");
        }

        const img = await new Promise((resolve, reject) => {

            const image = new Image();

            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Cannot load texture image: ${args.url}`));

            image.src = url;
        });

        const w = img.naturalWidth, h = img.naturalHeight;

        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;

        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const data = ctx.getImageData(0, 0, w, h).data;

        let minX = w, minY = h, maxX = -1, maxY = -1;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }

    /**
     * scene-get-editable-tilemap-layer-selection-data
     *
     * Return the tile data of the editable tilemap layer selected in the editor:
     * the selected rectangular region (Tilemap Rect Selection tool), or the whole
     * layer data when nothing tile-selected. The tile ids are the global ids of
     * the layer data (same format as scene-write-editable-tilemap-layer-data).
     */
    async function cmdGetTilemapSelectionData(args) {

        let editor = getSceneEditors().find(e => samePath(sceneFileOf(e), args.scenePath));

        if (!editor) {

            await cmdOpenScene(args);

            await new Promise(res => setTimeout(res, 3000));

            editor = getSceneEditors().find(e => samePath(sceneFileOf(e), args.scenePath));

            if (!editor) {
                throw new Error(`Could not open the scene editor for '${args.scenePath}'.`);
            }
        }

        const sceneobjects = phasereditor2d.scene.ui.sceneobjects;

        const selection = editor.getSelection();

        let layer = selection.find(o => o instanceof sceneobjects.EditableTilemapLayer) || null;

        if (!layer) {

            // a whole tilemap is selected: use its first layer game object
            const tilemap = selection.find(o => o instanceof sceneobjects.EditableTilemap);

            if (tilemap) {

                const scene = editor.getScene();

                for (const info of tilemap.getLayers()) {

                    layer = sceneobjects.EditableTilemapLayer.findLayerObject(scene, tilemap, info.name);

                    if (layer) break;
                }
            }
        }

        if (!layer) {
            throw new Error("No editable tilemap layer is selected in the editor. Select a tilemap layer (or the tilemap) and retry.");
        }

        const info = layer.getLayerInfo();

        if (!info) {
            throw new Error(`The layer '${layer.getLayerName()}' has no data in its editable tilemap.`);
        }

        // the tile selection made with the Rect Selection tool, if any
        const tool = editor.getToolsManager().findTool(sceneobjects.TilemapRectSelectionTool.ID);

        const region = tool && tool.hasRegion() ? tool.getRegion() : null;

        let x, y, width, height, data;

        if (region) {

            x = region.tx;
            y = region.ty;
            width = region.w;
            height = region.h;

            data = [];

            for (let ry = 0; ry < height; ry++) {

                const row = [];

                for (let rx = 0; rx < width; rx++) {

                    const tx = x + rx;
                    const ty = y + ry;

                    const inside = tx >= 0 && ty >= 0
                        && tx < info.width && ty < info.height
                        && info.data[ty] && info.data[ty][tx] !== undefined;

                    row.push(inside ? info.data[ty][tx] : -1);
                }

                data.push(row);
            }

        } else {

            x = 0;
            y = 0;
            width = info.width;
            height = info.height;

            data = info.data.map(row => [...row]);
        }

        return {
            scenePath: sceneFileOf(editor),
            tilemapId: layer.getTilemap().getEditorSupport().getId(),
            layerId: layer.getEditorSupport().getId(),
            layerName: layer.getLayerName(),
            x,
            y,
            width,
            height,
            data
        };
    }

    const commandHandlers = {
        "ide-get-active-scene": cmdGetActiveScene,
        "ide-open-scene": cmdOpenScene,
        "ide-save-scene": cmdSaveScene,
        "scene-get-screenshot": cmdSceneScreenshot,
        "assets-get-texture-content-bounding-box": cmdTextureBBox,
        "assets-get-spine-skin-image": cmdSpineSkinImage,
        "scene-get-editable-tilemap-layer-selection-data": cmdGetTilemapSelectionData
    };

    // ------------------------------------------------------------------
    // SSE bridge
    // ------------------------------------------------------------------

    function connectBridge() {

        try {

            const url = new URL(MCP_BRIDGE_EVENTS, window.location.href);
            url.searchParams.set("clientType", "legacy");
            const es = new EventSource(url.pathname + url.search);

            es.addEventListener("connected", ev => {
                try {
                    const session = JSON.parse(ev.data);
                    if (typeof session.clientId !== "string") return;
                    bridgeClientId = session.clientId;
                    activateBridgeSession();
                    console.log("%c[Phaser Editor AI]%c MCP bridge session ready", "color:#ff9d45", "color:inherit");
                } catch (e) {
                    console.error("Invalid MCP bridge session event", e);
                }
            });

            es.addEventListener("command", ev => {

                let cmd;

                try {
                    cmd = JSON.parse(ev.data);
                } catch (e) {
                    return;
                }

                // A stale SSE connection must never execute or answer commands
                // owned by a newer editor session.
                if (!bridgeClientId || cmd.clientId !== bridgeClientId) return;

                const handler = commandHandlers[cmd.tool];

                const promise = handler
                    ? Promise.resolve().then(() => handler(cmd.args || {}))
                    : Promise.reject(new Error(`The editor client does not implement the command '${cmd.tool}'.`));

                promise
                    .then(result => postResult(cmd.id, result, cmd.clientId))
                    .catch(e => postResult(cmd.id, { __error: String(e.message || e) }, cmd.clientId))
                    .catch(e => console.error("MCP bridge command result failed", e));
            });

            es.addEventListener("files-changed", () => {

                setTimeout(() => {
                    try {
                        window.dispatchEvent(new FocusEvent("focus"));
                    } catch (e) { /* ignore */ }
                }, 300);
            });

            es.addEventListener("error", () => {

                es.close();
                bridgeClientId = null;
                bridgeActivationPending = false;
                setTimeout(connectBridge, 5000);
            });

        } catch (e) {

            console.error("MCP bridge connection failed", e);
            bridgeClientId = null;
            bridgeActivationPending = false;
            setTimeout(connectBridge, 5000);
        }
    }

    window.addEventListener("focus", activateBridgeSession);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") activateBridgeSession();
    });

    // ------------------------------------------------------------------
    // AI panel (chat) + MCP config dialog
    // ------------------------------------------------------------------

    function buildAiDialog() {

        if (document.getElementById("pe-ai-dialog")) {
            return document.getElementById("pe-ai-dialog");
        }

        const overlay = document.createElement("div");
        overlay.id = "pe-ai-dialog";
        overlay.className = "pe-ai-overlay";

        overlay.innerHTML = `
<div class="pe-ai-dialog">
    <div class="pe-ai-titlebar">
        <span class="pe-ai-title">AI Assistant</span>
        <span class="pe-ai-sub">Phaser 4.2.1 · MCP tools enabled</span>
        <button class="pe-ai-close" title="Close">✕</button>
    </div>
    <div class="pe-ai-messages"></div>
    <div class="pe-ai-trace"></div>
    <div class="pe-ai-attachbar"></div>
    <div class="pe-ai-inputrow">
        <button class="pe-ai-attach" title="Attach project files (scenes, prefabs, asset packs, code…)">+</button>
        <textarea class="pe-ai-input" rows="2" placeholder="Describe the game content to create… (Enter to send)"></textarea>
        <button class="pe-ai-send">Send</button>
    </div>
</div>`;

        document.body.appendChild(overlay);

        overlay.querySelector(".pe-ai-close").addEventListener("click", () => {
            overlay.style.display = "none";
        });

        overlay.addEventListener("mousedown", e => {
            if (e.target === overlay) overlay.style.display = "none";
        });

        const input = overlay.querySelector(".pe-ai-input");
        const sendBtn = overlay.querySelector(".pe-ai-send");
        const messages = overlay.querySelector(".pe-ai-messages");
        const trace = overlay.querySelector(".pe-ai-trace");
        const attachBar = overlay.querySelector(".pe-ai-attachbar");
        const attachBtn = overlay.querySelector(".pe-ai-attach");

        const chatHistory = [];

        // pending attachments: [{ name, rel }] — rel is relative to the project root
        const attachments = [];

        function renderAttachBar() {

            attachBar.innerHTML = "";

            if (attachments.length === 0) {
                attachBar.style.display = "none";
                attachBtn.disabled = false;
                attachBtn.title = "Attach project files (scenes, prefabs, asset packs, code…)";
                return;
            }

            attachBar.style.display = "flex";
            attachBar.style.flexWrap = "wrap";
            attachBar.style.rowGap = "5px";
            attachBar.style.padding = "8px 12px 0";

            for (let i = 0; i < attachments.length; i++) {

                const att = attachments[i];

                const chip = document.createElement("span");

                chip.style.display = "inline-flex";
                chip.style.alignItems = "center";
                chip.style.gap = "6px";
                chip.style.background = "rgba(128, 128, 128, 0.18)";
                chip.style.border = "1px solid rgba(128, 128, 128, 0.35)";
                chip.style.borderRadius = "12px";
                chip.style.padding = "2px 4px 2px 10px";
                chip.style.maxWidth = "240px";
                chip.style.font = "11px 'Segoe UI', system-ui, sans-serif";
                chip.title = att.rel;

                const label = document.createElement("span");
                label.textContent = "📎 " + att.name;
                label.style.overflow = "hidden";
                label.style.textOverflow = "ellipsis";
                label.style.whiteSpace = "nowrap";

                const remove = document.createElement("span");
                remove.textContent = "✕";
                remove.title = "Remove attachment";
                remove.style.cursor = "pointer";
                remove.style.opacity = "0.6";
                remove.style.padding = "0 5px";
                remove.addEventListener("click", () => {
                    attachments.splice(i, 1);
                    renderAttachBar();
                });

                chip.appendChild(label);
                chip.appendChild(remove);
                attachBar.appendChild(chip);
            }

            if (attachments.length >= AI_CHAT_MAX_ATTACHMENTS) {
                attachBtn.disabled = true;
                attachBtn.title = "Attachment limit reached (" + AI_CHAT_MAX_ATTACHMENTS + " files max)";
            }
        }

        function openAttachPicker() {

            const controls = typeof colibri !== "undefined" ? colibri.ui.controls : null;
            const filesUi = typeof phasereditor2d !== "undefined" && phasereditor2d.files
                ? phasereditor2d.files.ui : null;

            if (!controls || !controls.dialogs || !controls.dialogs.ViewerDialog
                || !controls.viewers || !controls.viewers.TreeViewer
                || !filesUi || !filesUi.viewers || !filesUi.viewers.FileTreeContentProvider) {

                addMsg("assistant", "⚠ The project file picker is not available in this editor build.");
                return;
            }

            const root = colibri.ui.ide.FileUtils.getRoot();

            const viewer = new controls.viewers.TreeViewer("phasereditor2d.mcp.AiChatAttachFileDialog");

            viewer.setLabelProvider(new filesUi.viewers.FileLabelProvider());
            viewer.setCellRendererProvider(new filesUi.viewers.FileCellRendererProvider("tree"));
            viewer.setContentProvider(new filesUi.viewers.FileTreeContentProvider(false));
            viewer.setInput(root);
            viewer.setExpanded(root, true);

            const dlg = new controls.dialogs.ViewerDialog(viewer, false);

            dlg.setSize(560, 460);

            dlg.create();

            dlg.setTitle("Attach Project Files");

            // addOpenButton: closes on click / double-click / Enter in the filter box,
            // disabled while the selection is empty
            const okBtn = dlg.addOpenButton("Attach", selection => {

                const files = selection.filter(f => f && f.isFile && f.isFile());

                for (const file of files) {

                    if (attachments.length >= AI_CHAT_MAX_ATTACHMENTS) break;

                    // getProjectRelativeName() returns "/main.ts" (leading slash) — strip it
                    const rel = file.getProjectRelativeName().replace(/^\/+/, "");

                    if (attachments.some(a => a.rel === rel)) continue;

                    attachments.push({ name: file.getName(), rel: rel });
                }

                renderAttachBar();
            });

            viewer.eventSelectionChanged.addListener(() => {

                const n = viewer.getSelection().filter(f => f && f.isFile && f.isFile()).length;

                okBtn.textContent = "Attach " + n + " File" + (n === 1 ? "" : "s");

                // only files can be attached (override the "any selection" enabled state)
                okBtn.disabled = n === 0;
            });

            dlg.addButton("Cancel", () => dlg.close());

            // keep the picker above the AI chat overlay (colibri dialogs use z-index 1000)
            dlg.getDialogBackgroundElement().style.zIndex = "10001";
            dlg.getElement().style.zIndex = "10002";

            dlg.eventDialogClose.addListener(() => {
                input.focus();
            });
        }

        attachBtn.addEventListener("click", openAttachPicker);

        function addMsg(role, text, attNames) {

            const div = document.createElement("div");
            div.className = "pe-ai-msg pe-ai-" + role;
            div.textContent = text;

            if (attNames && attNames.length > 0) {

                const files = document.createElement("div");
                files.style.whiteSpace = "normal";
                files.style.marginTop = "6px";

                for (const name of attNames) {

                    const chip = document.createElement("span");
                    chip.textContent = "📎 " + name;
                    chip.title = name;
                    chip.style.display = "inline-block";
                    chip.style.background = "rgba(128, 128, 128, 0.25)";
                    chip.style.borderRadius = "8px";
                    chip.style.padding = "1px 7px";
                    chip.style.margin = "2px 4px 0 0";
                    chip.style.font = "11px 'Segoe UI', system-ui, sans-serif";
                    chip.style.color = "#b9c2b9";

                    files.appendChild(chip);
                }

                div.appendChild(files);
            }

            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
            return div;
        }

        async function send() {

            const text = input.value.trim();

            if (!text && attachments.length === 0) return;

            input.value = "";

            const attNames = attachments.map(a => a.rel);

            addMsg("user", text, attNames);

            const pending = addMsg("assistant", "Thinking…");

            trace.textContent = "";

            try {

                const body = {
                    messages: chatHistory.concat([{ role: "user", content: text }])
                };

                if (attachments.length > 0) {
                    body.attachments = attachments.map(a => a.rel);
                }

                const resp = await fetch("/editor/ai-chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });

                const data = await resp.json();

                if (data.error) {
                    pending.textContent = "⚠ " + data.error;
                } else {
                    pending.textContent = data.reply || "(empty response)";
                    if (data.trace && data.trace.length) {
                        trace.textContent = "Tools: " + data.trace.join(" → ");
                    }
                    // keep the attachment names in the conversation history
                    chatHistory.push({
                        role: "user",
                        content: attNames.length > 0
                            ? text + "\n\n[Attached files: " + attNames.join(", ") + "]"
                            : text
                    });
                    chatHistory.push({ role: "assistant", content: data.reply || "" });

                    attachments.length = 0;
                    renderAttachBar();
                }

            } catch (e) {

                pending.textContent = "⚠ " + e.message;
            }

            messages.scrollTop = messages.scrollHeight;
        }

        sendBtn.addEventListener("click", send);

        input.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });

        return overlay;
    }

    function buildMcpDialog() {

        const overlay = document.createElement("div");
        overlay.id = "pe-mcp-dialog";
        overlay.className = "pe-ai-overlay";

        const config = JSON.stringify({
            mcpServers: {
                "phaser-editor": {
                    command: "npx",
                    args: ["@phaserjs/editor-mcp-server"],
                    "env": { "phaser-editor-mcp-port": "1902" }
                }
            }
        }, null, 2);

        overlay.innerHTML = `
<div class="pe-ai-dialog pe-ai-small">
    <div class="pe-ai-titlebar">
        <span class="pe-ai-title">MCP Server Configuration</span>
        <button class="pe-ai-close" title="Close">✕</button>
    </div>
    <div class="pe-ai-mcpbody">
        <p>The MCP Server connects AI agents (Claude Desktop, Cursor, VS Code, CLI agents) with this running instance of Phaser Editor. All project changes made by the agents are performed through the editor.</p>
        <h4>1 · Official stdio server (recommended)</h4>
        <p style="margin:4px 0">Uses the official <b>@phaserjs/editor-mcp-server</b> npm package. It forwards every tool call to this editor through the MCP bridge port <b>1902</b>:</p>
        <pre class="pe-ai-code" id="pe-mcp-json">${config}</pre>
        <button class="pe-ai-copy" data-copy="pe-mcp-json">Copy</button>
        <p style="margin:6px 0 2px">Inside this workspace you can also run it directly:</p>
        <code class="pe-ai-code">npm run mcp</code>
        <h4>2 · Streamable HTTP endpoint (built-in fallback)</h4>
        <code class="pe-ai-code" id="pe-mcp-url">/editor/mcp</code>
        <button class="pe-ai-copy" data-copy="pe-mcp-url">Copy</button>
        <h4>3 · Server status</h4>
        <div id="pe-mcp-status" class="pe-ai-status">checking…</div>
        <div id="pe-mcp-tools"></div>
    </div>
</div>`;

        document.body.appendChild(overlay);

        overlay.querySelector(".pe-ai-close").addEventListener("click", () => overlay.remove());

        overlay.addEventListener("mousedown", e => {
            if (e.target === overlay) overlay.remove();
        });

        for (const btn of overlay.querySelectorAll(".pe-ai-copy")) {
            btn.addEventListener("click", () => {
                const el = document.getElementById(btn.dataset.copy);
                navigator.clipboard.writeText(el.textContent.trim());
                btn.textContent = "Copied!";
                setTimeout(() => btn.textContent = "Copy", 1500);
            });
        }

        fetch("/editor/mcp-bridge-status")
            .then(r => r.json())
            .then(st => {

                const status = overlay.querySelector("#pe-mcp-status");

                status.innerHTML = st.connected
                    ? `● Editor bridge: <b>connected</b> — agents can control this editor`
                    : `● Editor bridge: <b>waiting for the editor…</b> (this page is the editor client)`;

                return fetch("/editor/mcp", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
                });
            })
            .then(r => r.json())
            .then(data => {

                const tools = (data.result && data.result.tools) || [];

                const div = overlay.querySelector("#pe-mcp-tools");

                div.innerHTML = `<b>${tools.length} tools</b> available: ` +
                    tools.map(t => `<code>${t.name}</code>`).join(" ");
            })
            .catch(() => { });

        return overlay;
    }

    // ------------------------------------------------------------------
    // toolbar buttons
    // ------------------------------------------------------------------

    function addToolbarButtons() {

        const toolbar = document.querySelector(".MainToolbarRightArea")
            || document.querySelector(".MainToolbar");

        if (!toolbar) {
            setTimeout(addToolbarButtons, 800);
            return;
        }

        if (toolbar.querySelector(".pe-toolbar-btn")) return;

        const mkBtn = (label, title, onclick) => {

            const btn = document.createElement("button");

            btn.className = "pe-toolbar-btn";
            btn.textContent = label;
            btn.title = title;
            btn.addEventListener("click", onclick);

            return btn;
        };

        toolbar.appendChild(mkBtn("AI", "AI Assistant (Phaser Editor v5 feature) — chat with an agent that can edit your game", () => {
            const dlg = buildAiDialog();
            dlg.style.display = "flex";
            dlg.querySelector(".pe-ai-input").focus();
        }));

        toolbar.appendChild(mkBtn("MCP", "MCP Server Configuration (connect AI agents to the editor)", () => {
            const dlg = buildMcpDialog();
            dlg.style.display = "flex";
        }));
    }

    // ------------------------------------------------------------------

    window.addEventListener("load", () => {

        connectBridge();

        addToolbarButtons();
    });

})();
