namespace phasereditor2d.ide.ui.actions {

    import controls = colibri.ui.controls;

    /**
     * The "AI" submenu of the main menu (official v5: the MCP server integration adds
     * a new AI main-menu with AI-related shortcuts).
     */
    export class AIMenu {

        static createMenu(): controls.Menu {

            const menu = new controls.Menu("AI");

            menu.addCommand(CMD_MCP_SERVER_CONFIG);

            {
                const bridge = core.mcp.MCPBridge.getInstance();

                menu.addCommand(CMD_TOGGLE_MCP_BRIDGE, {
                    text: bridge.isEnabled() ? "Disable MCP Bridge" : "Enable MCP Bridge"
                });
            }

            menu.addCommand(CMD_MCP_MESSAGE_LOG);

            return menu;
        }
    }
}
