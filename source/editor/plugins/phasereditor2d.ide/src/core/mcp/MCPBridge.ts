namespace phasereditor2d.ide.core.mcp {

    import controls = colibri.ui.controls;

    export interface IMCPLogEntry {
        time: string;
        tool: string;
        ok: boolean;
        detail: string;
    }

    export interface IMCPBridgeStatus {
        ok: boolean;
        clients?: number;
        error?: string;
    }

    /**
     * WebSocket client that connects the editor page with the
     * mini-services/phaser-editor-mcp bridge (HTTP :1902 ⇄ WebSocket ⇄ editor).
     *
     * Protocol (bridge ⇄ editor):
     *   bridge → editor: { id: string, tool: string, args: object }
     *   editor → bridge: { id: string, result: IMCPContentItem[] }
     *
     * The connection is lazy (only when enabled), auto-reconnects every 5 seconds and
     * the enabled flag is persisted in the colibri global preferences.
     */
    export class MCPBridge {

        private static _instance = new MCPBridge();

        static getInstance() {

            return this._instance;
        }

        public eventLog = new controls.ListenerList<IMCPLogEntry>();

        private _enabled: boolean;
        private _host: string;
        private _port: number;
        private _socket: WebSocket;
        private _connectTimer: any;
        private _log: IMCPLogEntry[];

        private constructor() {

            this._enabled = false;
            this._host = "127.0.0.1";
            this._port = 1902;
            this._socket = null;
            this._log = [];

            this.readPrefs();
        }

        private readPrefs() {

            try {

                const prefs = colibri.Platform.getWorkbench().getGlobalPreferences();

                this._enabled = prefs.getValue("mcpBridgeEnabled", false) === true;
                this._host = prefs.getValue("mcpBridgeHost", "127.0.0.1");
                this._port = prefs.getValue("mcpBridgePort", 1902);

            } catch (e) {
                // preferences not available yet
            }
        }

        private writePrefs() {

            try {

                const prefs = colibri.Platform.getWorkbench().getGlobalPreferences();

                prefs.setValue("mcpBridgeEnabled", this._enabled);
                prefs.setValue("mcpBridgeHost", this._host);
                prefs.setValue("mcpBridgePort", this._port);

            } catch (e) {
                // preferences not available
            }
        }

        isEnabled() {

            return this._enabled;
        }

        async setEnabled(enabled: boolean) {

            this._enabled = enabled;

            this.writePrefs();

            if (enabled) {

                this.connect();

            } else {

                this.disconnect();
            }
        }

        getHost() {

            return this._host;
        }

        async setHost(host: string) {

            this._host = host;

            this.writePrefs();

            if (this._enabled) {

                this.reconnect();
            }
        }

        getPort() {

            return this._port;
        }

        async setPort(port: number) {

            this._port = port;

            this.writePrefs();

            if (this._enabled) {

                this.reconnect();
            }
        }

        getWebSocketUrl() {

            return `ws://${this._host}:${this._port}/`;
        }

        getHttpUrl() {

            return `http://${this._host}:${this._port}/`;
        }

        isConnected() {

            return this._socket !== null && this._socket.readyState === WebSocket.OPEN;
        }

        /**
         * GET http://host:port/ — used by the MCP Server Configuration dialog to
         * verify the bridge connectivity.
         */
        async requestStatus(): Promise<IMCPBridgeStatus> {

            try {

                const controller = new AbortController();

                const timer = setTimeout(() => controller.abort(), 4000);

                const resp = await fetch(this.getHttpUrl(), {
                    method: "GET",
                    signal: controller.signal
                });

                clearTimeout(timer);

                const data = await resp.json();

                return {
                    ok: data?.status === "ok",
                    clients: data?.clients ?? 0,
                };

            } catch (e) {

                return {
                    ok: false,
                    error: `Cannot reach the MCP bridge at ${this.getHttpUrl()}. `
                        + `Start it with: cd mini-services/phaser-editor-mcp && npm run dev`
                };
            }
        }

        connect() {

            if (!this._enabled || this.isConnected()
                || (this._socket && this._socket.readyState === WebSocket.CONNECTING)) {

                return;
            }

            if (typeof WebSocket === "undefined") {

                return;
            }

            try {

                const socket = new WebSocket(this.getWebSocketUrl());

                this._socket = socket;

                socket.onopen = () => {

                    this.log("bridge", true, "Connected to the MCP bridge "
                        + this.getWebSocketUrl());
                };

                socket.onmessage = ev => this.onMessage(ev);

                socket.onclose = () => {

                    if (this._socket === socket) {

                        this._socket = null;
                    }

                    this.scheduleReconnect();
                };

                socket.onerror = () => {
                    // onclose fires right after
                };

            } catch (e) {

                this.log("bridge", false, `Cannot connect to ${this.getWebSocketUrl()}: `
                    + (e as Error).message);

                this.scheduleReconnect();
            }
        }

        private disconnect() {

            if (this._connectTimer) {

                clearTimeout(this._connectTimer);

                this._connectTimer = undefined;
            }

            if (this._socket) {

                const socket = this._socket;

                this._socket = null;

                try {

                    socket.close();

                } catch (e) {
                    // ignore
                }
            }
        }

        private reconnect() {

            this.disconnect();

            this.connect();
        }

        onProjectOpened() {

            if (this._enabled) {

                // give the workbench a moment to settle

                setTimeout(() => this.connect(), 500);
            }
        }

        private scheduleReconnect() {

            if (!this._enabled || this._connectTimer) {

                return;
            }

            this._connectTimer = setTimeout(() => {

                this._connectTimer = undefined;

                this.connect();

            }, 5000);
        }

        private async onMessage(ev: MessageEvent) {

            let msg: any;

            try {

                msg = JSON.parse(String(ev.data));

            } catch (e) {

                this.log("bridge", false, `Invalid message from bridge: ${String(ev.data).substring(0, 120)}`);

                return;
            }

            const { id, tool, args } = msg ?? {};

            if (typeof id !== "string" || typeof tool !== "string") {

                return;
            }

            const result = await MCPTools.getInstance().executeTool(tool, args);

            const error = result.find(item => typeof item.text === "string"
                && (item.text.startsWith("Tool '") && item.text.includes("error")));

            this.log(tool, !error, error?.text ?? this.summarize(result));

            try {

                this._socket.send(JSON.stringify({ id, result }));

            } catch (e) {

                this.log(tool, false, `Cannot answer the bridge: ${(e as Error).message}`);
            }
        }

        private summarize(result: IMCPContentItem[]) {

            const text = result.find(item => item.type === "text")?.text;

            if (text !== undefined) {

                return text.length > 120 ? text.substring(0, 120) + "…" : text;
            }

            if (result.find(item => item.type === "image")) {

                return "image/png screenshot";
            }

            return `${result.length} content item(s)`;
        }

        private log(tool: string, ok: boolean, detail: string) {

            const entry: IMCPLogEntry = {
                time: new Date().toLocaleTimeString(),
                tool,
                ok,
                detail,
            };

            this._log.unshift(entry);

            if (this._log.length > 200) {

                this._log.pop();
            }

            this.eventLog.fire(entry);
        }

        getLog(): IMCPLogEntry[] {

            return this._log;
        }

        clearLog() {

            this._log = [];

            this.eventLog.fire(null);
        }
    }
}
