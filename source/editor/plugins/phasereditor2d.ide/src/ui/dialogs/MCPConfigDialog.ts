namespace phasereditor2d.ide.ui.dialogs {

    import controls = colibri.ui.controls;

    /**
     * MCP Server Configuration dialog (main menu → AI → MCP Server Configuration).
     *
     * Shows the bridge connectivity status, the host/port of the bridge service, the
     * JSON config for the AI clients (that run the OFFICIAL `@phaserjs/editor-mcp-server`
     * npm package), and shortcuts to auto-configure Cursor and VS Code.
     */
    export class MCPConfigDialog extends controls.dialogs.Dialog {

        private _statusElement: HTMLDivElement;
        private _hostElement: HTMLInputElement;
        private _portElement: HTMLInputElement;

        constructor() {
            super("MCPConfigDialog");
        }

        createDialogArea() {

            const element = document.createElement("div");

            element.classList.add("DialogClientArea", "DialogSection");

            element.style.display = "flex";
            element.style.flexDirection = "column";
            element.style.gap = "5px";

            element.innerHTML = `
<p class="Title"><b>Codogma Engine MCP Server</b><br>
<small>AI clients run the official <code>@phaserjs/editor-mcp-server</code> package,
which connects with the editor through this MCP bridge.</small></p>
<div id="status" style="border:1px solid; padding:5px; font-family:monospace; white-space:pre-wrap;">Checking bridge status…</div>
<p>Bridge service endpoint (mini-services/phaser-editor-mcp):</p>
<div style="display:flex; gap:5px; align-items:center;">
    <label for="__mcpHost">Host</label>
    <input id="__mcpHost" type="text" size="16" spellcheck="false" />
    <label for="__mcpPort">Port</label>
    <input id="__mcpPort" type="number" size="6" spellcheck="false" />
</div>
<p>Put this JSON in the MCP configuration of your AI client
(Cursor: <code>.mcp.json</code> — VS Code: <code>.vscode/mcp.json</code> — Claude Desktop:
<code>claude_desktop_config.json</code>):</p>
<pre id="__mcpJson" style="border:1px solid; padding:5px; overflow:auto; max-height:150px;"></pre>
<p><small>Tool requests flow: AI host → official MCP server (stdio) → HTTP
<span class="mcpEndpoint"></span> → bridge → WebSocket → this editor.</small></p>
`;

            this.getElement().appendChild(element);

            this._statusElement = element.querySelector("#status");
            this._hostElement = element.querySelector("#__mcpHost");
            this._portElement = element.querySelector("#__mcpPort");

            const jsonElement = element.querySelector("#__mcpJson") as HTMLElement;

            const updateJson = () => {

                element.querySelectorAll(".mcpEndpoint").forEach(el => {

                    el.textContent = this.getBridge().getHttpUrl();
                });

                jsonElement.innerText = this.getConfigJson();
            };

            this._hostElement.value = this.getBridge().getHost();
            this._portElement.value = String(this.getBridge().getPort());

            this._hostElement.addEventListener("change", async () => {

                await this.getBridge().setHost(this._hostElement.value.trim() || "127.0.0.1");

                updateJson();
                this.refreshStatus();
            });

            this._portElement.addEventListener("change", async () => {

                const port = Number(this._portElement.value);

                if (Number.isFinite(port) && port > 0) {

                    await this.getBridge().setPort(port);
                }

                this._portElement.value = String(this.getBridge().getPort());

                updateJson();
                this.refreshStatus();
            });

            updateJson();

            this.refreshStatus();
        }

        private getBridge(): core.mcp.MCPBridge {

            return core.mcp.MCPBridge.getInstance();
        }

        private getConfigJson(): string {

            const bridge = this.getBridge();

            const config = {
                mcpServers: {
                    "phaser-editor": {
                        command: "npx",
                        args: ["@phaserjs/editor-mcp-server"],
                        env: {
                            "phaser-editor-mcp-hostname": bridge.getHost(),
                            "phaser-editor-mcp-port": String(bridge.getPort()),
                        }
                    }
                }
            };

            return JSON.stringify(config, null, 4);
        }

        private async refreshStatus() {

            this._statusElement.textContent = "Checking bridge status…";

            const status = await this.getBridge().requestStatus();

            const wsState = this.getBridge().isEnabled()
                ? (this.getBridge().isConnected() ? "connected" : "connecting…")
                : "disabled (AI → Enable MCP Bridge)";

            if (status.ok) {

                this._statusElement.style.color = "";
                this._statusElement.textContent =
                    `Bridge service: OK — ${status.clients} editor client(s) connected.\n`
                    + `Editor WebSocket: ${wsState}`;

            } else {

                this._statusElement.style.color = "red";
                this._statusElement.textContent =
                    `Bridge service: NOT REACHABLE.\n${status.error ?? ""}\n`
                    + `Editor WebSocket: ${wsState}`;
            }
        }

        private async copyToClipboard(text: string) {

            try {

                await navigator.clipboard.writeText(text);

            } catch (e) {

                // fallback

                const area = document.createElement("textarea");

                area.value = text;

                document.body.appendChild(area);

                area.select();

                document.execCommand("copy");

                area.remove();
            }
        }

        private async writeMCPConfigFile(fileName: string) {

            try {

                const utils = colibri.ui.ide.FileUtils;

                const root = utils.getRoot();

                let folder = root;

                const i = fileName.lastIndexOf("/");

                if (i > 0) {

                    // create the parent folders, if they don't exist

                    const parts = fileName.substring(0, i).split("/");

                    for (const part of parts) {

                        const child = folder.getFile(part);

                        if (child && child.isFolder()) {

                            folder = child;

                        } else {

                            folder = await utils.createFolder_async(folder, part);
                        }
                    }
                }

                await utils.createFile_async(
                    folder,
                    fileName.substring(i + 1),
                    this.getConfigJson());

                colibri.Platform.getWorkbench().showNotification(
                    `Created ${fileName} in the project root.`);

            } catch (e) {

                alert(`Cannot write ${fileName}: ${(e as Error).message}`);
            }
        }

        create() {

            super.create();

            this.setTitle("MCP Server Configuration");

            this.addButton("Copy JSON Config", () => this.copyToClipboard(this.getConfigJson()));

            this.addButton("Auto-configure Cursor",
                () => this.writeMCPConfigFile(".mcp.json"));

            this.addButton("Auto-configure VS Code",
                () => this.writeMCPConfigFile(".vscode/mcp.json"));

            this.addButton("Check Again", () => this.refreshStatus());

            this.addCancelButton();
        }
    }
}
