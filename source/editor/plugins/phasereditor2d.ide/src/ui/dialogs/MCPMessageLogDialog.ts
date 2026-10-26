namespace phasereditor2d.ide.ui.dialogs {

    import controls = colibri.ui.controls;

    /**
     * MCP Message Log dialog (main menu → AI → MCP Message Log).
     *
     * Lists the recent messages of the MCP bridge (tool name, time, ok/error).
     * Implemented as a dialog (not a workbench view) so no colibri view-registration
     * changes are required.
     */
    export class MCPMessageLogDialog extends controls.dialogs.Dialog {

        private _listElement: HTMLDivElement;
        private _listener: (entry: core.mcp.IMCPLogEntry) => void;

        constructor() {
            super("MCPMessageLogDialog");
        }

        createDialogArea() {

            const element = document.createElement("div");

            element.classList.add("DialogClientArea", "DialogSection");

            element.style.display = "flex";
            element.style.flexDirection = "column";
            element.style.gap = "5px";

            element.innerHTML = `
<p class="Title"><b>MCP Message Log</b><br>
<small>Recent messages between the editor and the MCP bridge.
Enable the bridge with <b>AI → Enable MCP Bridge</b>.</small></p>
<div class="__log" style="border:1px solid; padding:5px; overflow:auto;
max-height:400px; min-height:120px; font-family:monospace; font-size:12px;"></div>
`;

            this.getElement().appendChild(element);

            this._listElement = element.querySelector(".__log");

            this.renderLog();

            this._listener = () => this.renderLog();

            core.mcp.MCPBridge.getInstance().eventLog.addListener(this._listener);
        }

        private renderLog() {

            const log = core.mcp.MCPBridge.getInstance().getLog();

            if (log.length === 0) {

                this._listElement.textContent = "No messages yet.";

                return;
            }

            this._listElement.innerHTML = "";

            for (const entry of log) {

                const row = document.createElement("div");

                row.style.whiteSpace = "pre-wrap";

                row.textContent =
                    `${entry.time}  ${entry.ok ? "OK   " : "ERROR"}  ${entry.tool}  `
                    + `${entry.detail ?? ""}`;

                if (!entry.ok) {

                    row.style.color = "red";
                }

                this._listElement.appendChild(row);
            }
        }

        create() {

            super.create();

            this.setTitle("MCP Message Log");

            this.addButton("Clear", () => core.mcp.MCPBridge.getInstance().clearLog());

            this.addCancelButton();
        }

        close() {

            core.mcp.MCPBridge.getInstance().eventLog.removeListener(this._listener);

            super.close();
        }

        protected resize() {

            this.setBounds({
                x: window.innerWidth / 4,
                y: window.innerHeight / 5,
                width: window.innerWidth / 2,
                height: window.innerHeight / 2
            });
        }
    }
}
