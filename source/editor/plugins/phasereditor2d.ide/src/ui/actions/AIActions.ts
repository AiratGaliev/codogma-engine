namespace phasereditor2d.ide.ui.actions {

    import controls = colibri.ui.controls;
    import commands = colibri.ui.ide.commands;

    export const CAT_AI = "phasereditor2d.ide.ui.actions.AICategory";
    export const CMD_MCP_SERVER_CONFIG = "phasereditor2d.ide.ui.actions.MCPServerConfiguration";
    export const CMD_TOGGLE_MCP_BRIDGE = "phasereditor2d.ide.ui.actions.EnableMCPBridge";
    export const CMD_MCP_MESSAGE_LOG = "phasereditor2d.ide.ui.actions.MCPMessageLog";

    /**
     * Commands of the AI main-menu (official v5 "AI" menu: MCP server shortcuts).
     */
    export class AIActions {

        static registerCommands(manager: commands.CommandManager) {

            manager.addCategory({
                id: CAT_AI,
                name: "AI"
            });

            // MCP Server Configuration dialog

            manager.add({
                command: {
                    id: CMD_MCP_SERVER_CONFIG,
                    category: CAT_AI,
                    name: "MCP Server Configuration",
                    tooltip: "Configure the Codogma Engine MCP server integration with AI clients."
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: args => {
                        new dialogs.MCPConfigDialog().create();
                    }
                }
            });

            // enable/disable the MCP bridge (WebSocket client)

            manager.add({
                command: {
                    id: CMD_TOGGLE_MCP_BRIDGE,
                    category: CAT_AI,
                    name: "Enable MCP Bridge",
                    tooltip: "Connect the editor with the MCP bridge service, "
                        + "so AI clients can run editor tools."
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: async args => {

                        const bridge = core.mcp.MCPBridge.getInstance();

                        const enabled = !bridge.isEnabled();

                        await bridge.setEnabled(enabled);

                        const wb = colibri.Platform.getWorkbench();

                        if (enabled) {

                            const status = await bridge.requestStatus();

                            if (status.ok) {

                                wb.showNotification("MCP Bridge enabled. "
                                    + `Connected to the bridge service (${status.clients} editor client(s)).`);

                            } else {

                                wb.showNotification("MCP Bridge enabled locally, but the bridge service "
                                    + "is not reachable: " + (status.error ?? ""));
                            }

                        } else {

                            wb.showNotification("MCP Bridge disabled.");
                        }
                    }
                }
            });

            // MCP message log dialog

            manager.add({
                command: {
                    id: CMD_MCP_MESSAGE_LOG,
                    category: CAT_AI,
                    name: "MCP Message Log",
                    tooltip: "Shows the recent messages of the MCP bridge."
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: args => {
                        new dialogs.MCPMessageLogDialog().create();
                    }
                }
            });
        }
    }
}
