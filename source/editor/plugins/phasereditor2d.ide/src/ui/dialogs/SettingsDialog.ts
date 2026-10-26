namespace phasereditor2d.ide.ui.dialogs {

    import controls = colibri.ui.controls;
    import actions = phasereditor2d.ide.ui.actions;

    /**
     * Unified Settings dialog (official v5 Settings): a category list at the left and a
     * form at the right (same FormBuilder-like DOM structure of the MCPConfigDialog).
     *
     * All the values are persisted in the colibri global preferences, reusing the exact
     * keys of the existing features (MCPBridge, scene settings defaults, font size).
     */
    export class SettingsDialog extends controls.dialogs.Dialog {

        private _pageContainerElement: HTMLDivElement;
        private _categoryElements: HTMLButtonElement[] = [];
        private _pages: HTMLDivElement[] = [];

        constructor() {
            super("SettingsDialog");

            this.setSize(720, 520, true);
        }

        /**
         * Applies the persisted UI preferences (font size). Called at boot by IDEPlugin.
         */
        static applyGlobalPrefs() {

            try {

                const prefs = colibri.Platform.getWorkbench().getGlobalPreferences();

                SettingsDialog.applyFontSize(prefs.getValue("ide.settings.fontSize", 0));

            } catch (e) {
                // preferences not available yet
            }
        }

        static applyFontSize(size: number) {

            if (typeof size === "number" && size > 0) {

                document.body.style.fontSize = size + "px";

            } else {

                document.body.style.fontSize = "";
            }
        }

        private getPrefs(): colibri.core.preferences.Preferences {

            return colibri.Platform.getWorkbench().getGlobalPreferences();
        }

        protected createDialogArea() {

            const element = document.createElement("div");

            element.classList.add("DialogClientArea");

            element.style.display = "flex";
            element.style.flexDirection = "row";
            element.style.gap = "10px";
            element.style.flex = "1";
            element.style.minHeight = "0";

            const categoriesElement = document.createElement("div");

            categoriesElement.style.display = "flex";
            categoriesElement.style.flexDirection = "column";
            categoriesElement.style.gap = "2px";
            categoriesElement.style.minWidth = "150px";

            this._pageContainerElement = document.createElement("div");

            this._pageContainerElement.style.border = "1px solid";
            this._pageContainerElement.style.padding = "10px";
            this._pageContainerElement.style.overflow = "auto";
            this._pageContainerElement.style.flex = "1";
            this._pageContainerElement.style.display = "flex";
            this._pageContainerElement.style.flexDirection = "column";

            element.appendChild(categoriesElement);
            element.appendChild(this._pageContainerElement);

            this.getElement().appendChild(element);

            this.addCategory(categoriesElement, "Appearance", this.createAppearancePage());
            this.addCategory(categoriesElement, "Scene Editor", this.createSceneEditorPage());
            this.addCategory(categoriesElement, "AI & MCP", this.createAIMCPPage());
            this.addCategory(categoriesElement, "Updates", this.createUpdatesPage());

            this.selectPage(0);
        }

        private addCategory(parent: HTMLElement, title: string, page: HTMLDivElement) {

            const btn = document.createElement("button");

            btn.innerText = title;
            btn.style.textAlign = "left";

            const index = this._pages.length;

            btn.addEventListener("click", () => this.selectPage(index));

            parent.appendChild(btn);

            this._categoryElements.push(btn);
            this._pages.push(page);
            this._pageContainerElement.appendChild(page);
        }

        private selectPage(index: number) {

            for (let i = 0; i < this._pages.length; i++) {

                this._pages[i].style.display = i === index ? "flex" : "none";

                this._categoryElements[i].style.fontWeight = i === index ? "bold" : "normal";
            }
        }

        private createFormRow(parent: HTMLElement, labelText: string, tooltip: string): HTMLDivElement {

            const row = document.createElement("div");

            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "10px";

            const label = document.createElement("label");

            label.innerText = labelText;
            label.style.minWidth = "120px";

            if (tooltip) {

                label.title = tooltip;
            }

            row.appendChild(label);
            parent.appendChild(row);

            return row;
        }

        private createPageHeading(parent: HTMLElement, title: string, description: string) {

            const heading = document.createElement("p");

            heading.classList.add("Title");

            heading.innerHTML = `<b>${title}</b><br><small>${description}</small>`;

            parent.appendChild(heading);
        }

        private createAppearancePage(): HTMLDivElement {

            const page = document.createElement("div");

            page.style.flexDirection = "column";
            page.style.gap = "5px";

            this.createPageHeading(page, "Appearance",
                "Theme and UI font size of the editor.");

            // theme

            const themeRow = this.createFormRow(page, "Theme", "Select the color theme of the editor.");

            const themes = colibri.Platform
                .getExtensions<colibri.ui.ide.themes.ThemeExtension>(colibri.ui.ide.themes.ThemeExtension.POINT_ID)
                .map(ext => ext.getTheme())
                .sort((a, b) => a.displayName.localeCompare(b.displayName));

            const select = document.createElement("select");

            for (const theme of themes) {

                const option = document.createElement("option");

                option.value = theme.id;
                option.text = theme.displayName;

                select.appendChild(option);
            }

            select.value = controls.Controls.getTheme().id;

            select.addEventListener("change", () => {

                const theme = themes.find(theme => theme.id === select.value);

                if (theme) {

                    controls.Controls.setTheme(theme);
                }
            });

            themeRow.appendChild(select);

            // font size

            const fontRow = this.createFormRow(page, "Font size",
                "UI font size in pixels (0 = editor default).");

            const fontSize = document.createElement("input");

            fontSize.type = "number";
            fontSize.min = "8";
            fontSize.max = "32";
            fontSize.style.width = "60px";

            fontSize.value = String(this.getPrefs().getValue("ide.settings.fontSize", 0) || 0);

            fontSize.addEventListener("change", () => {

                const size = Number(fontSize.value);

                if (!Number.isFinite(size) || size < 0) {

                    fontSize.value = "0";

                    return;
                }

                SettingsDialog.applyFontSize(size);

                this.getPrefs().setValue("ide.settings.fontSize", size);
            });

            fontRow.appendChild(fontSize);

            return page;
        }

        private createSceneEditorPage(): HTMLDivElement {

            const page = document.createElement("div");

            page.style.flexDirection = "column";
            page.style.gap = "5px";

            this.createPageHeading(page, "Scene Editor",
                "Default snapping values, used as global defaults for the scene editors.");

            // snap to grid

            const snapRow = this.createFormRow(page, "Snap to grid", "Enable snapping by default.");

            const snapEnabled = document.createElement("input");

            snapEnabled.type = "checkbox";

            snapEnabled.checked = this.getPrefs().getValue("phasereditor2d.scene.settings.snapEnabled", false) === true;

            snapEnabled.addEventListener("change", () => {

                this.getPrefs().setValue("phasereditor2d.scene.settings.snapEnabled", snapEnabled.checked);
            });

            snapRow.appendChild(snapEnabled);

            // grid size

            const gridRow = this.createFormRow(page, "Grid size", "The snapping grid size in pixels.");

            const gridSize = document.createElement("input");

            gridSize.type = "number";
            gridSize.min = "1";
            gridSize.style.width = "60px";

            gridSize.value = String(this.getPrefs().getValue("phasereditor2d.scene.settings.gridSize", 16));

            gridSize.addEventListener("change", () => {

                const size = Number(gridSize.value);

                if (!Number.isFinite(size) || size < 1) {

                    gridSize.value = "16";

                    return;
                }

                this.getPrefs().setValue("phasereditor2d.scene.settings.gridSize", size);
            });

            gridRow.appendChild(gridSize);

            return page;
        }

        private createAIMCPPage(): HTMLDivElement {

            const page = document.createElement("div");

            page.style.flexDirection = "column";
            page.style.gap = "5px";

            this.createPageHeading(page, "AI & MCP",
                "Connection of the editor with the MCP bridge service "
                + "(same preferences as AI → MCP Server Configuration).");

            const bridge = core.mcp.MCPBridge.getInstance();

            // enabled

            const enabledRow = this.createFormRow(page, "Enabled",
                "Connect the editor with the MCP bridge service.");

            const enabled = document.createElement("input");

            enabled.type = "checkbox";

            enabled.checked = bridge.isEnabled();

            enabled.addEventListener("change", () => bridge.setEnabled(enabled.checked));

            enabledRow.appendChild(enabled);

            // host

            const hostRow = this.createFormRow(page, "Host", "The MCP bridge service host.");

            const host = document.createElement("input");

            host.type = "text";
            host.size = 16;
            host.spellcheck = false;

            host.value = bridge.getHost();

            host.addEventListener("change", () => {

                bridge.setHost(host.value.trim() || "127.0.0.1");

                host.value = bridge.getHost();
            });

            hostRow.appendChild(host);

            // port

            const portRow = this.createFormRow(page, "Port", "The MCP bridge service port.");

            const port = document.createElement("input");

            port.type = "number";
            port.style.width = "80px";

            port.value = String(bridge.getPort());

            port.addEventListener("change", () => {

                const value = Number(port.value);

                if (!Number.isFinite(value) || value <= 0) {

                    port.value = String(bridge.getPort());

                    return;
                }

                bridge.setPort(value);

                port.value = String(bridge.getPort());
            });

            portRow.appendChild(port);

            return page;
        }

        private createUpdatesPage(): HTMLDivElement {

            const page = document.createElement("div");

            page.style.flexDirection = "column";
            page.style.gap = "5px";

            this.createPageHeading(page, "Updates",
                "Check if a new version of Codogma Engine is available.");

            const versionRow = this.createFormRow(page, "Current version", "");

            const versionLabel = document.createElement("span");

            versionLabel.innerText = `v${actions.UpdateActions.getCurrentVersion()}`;

            versionRow.appendChild(versionLabel);

            const statusRow = this.createFormRow(page, "Latest version", "");

            const statusLabel = document.createElement("span");

            statusLabel.innerText = "(not checked yet)";

            statusRow.appendChild(statusLabel);

            const checkRow = this.createFormRow(page, "", "");

            const checkButton = document.createElement("button");

            checkButton.innerText = "Check now";

            checkButton.addEventListener("click", async () => {

                checkButton.disabled = true;

                statusLabel.innerText = "Checking...";

                try {

                    const result = await actions.UpdateActions.checkForUpdates();

                    statusLabel.innerHTML = actions.UpdateActions.getResultMessage(result);

                } catch (e) {

                    statusLabel.innerText =
                        `Could not check for updates. Current version: v${actions.UpdateActions.getCurrentVersion()}.`;
                }

                checkButton.disabled = false;
            });

            checkRow.appendChild(checkButton);

            return page;
        }

        create() {

            super.create();

            this.setTitle("Settings");

            this.addButton("Close", () => this.close());
        }
    }
}
