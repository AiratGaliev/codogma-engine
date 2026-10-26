namespace phasereditor2d.ide.ui.dialogs {

    import controls = colibri.ui.controls;
    import io = colibri.core.io;

    /**
     * Start Page (welcome dialog), like the official v5 start page.
     *
     * It is opened automatically (once per session) when a project is opened, unless the
     * global preference `ide.startPage.showOnLaunch` is false. It can be opened anytime
     * with the command `phasereditor2d.ide.OpenStartPage` (main menu → Start Page...).
     *
     * Because the ide plugin cannot reference the scene/pack plugins (circular project
     * references), the "New Scene" and "New Asset Pack" dialogs are accessed through the
     * runtime global namespace (`window["phasereditor2d"]["scene"|"pack"]`), like MCPTools does.
     */
    export class StartPageDialog extends controls.dialogs.Dialog {

        private static _shownInThisSession = false;

        private _showOnLaunchElement: HTMLInputElement;
        private _recentElement: HTMLDivElement;

        constructor() {
            super("StartPageDialog");

            this.setSize(620, 700, true);
        }

        static isShowOnLaunch(): boolean {

            try {

                const prefs = colibri.Platform.getWorkbench().getGlobalPreferences();

                return prefs.getValue("ide.startPage.showOnLaunch", true) === true;

            } catch (e) {

                return true;
            }
        }

        static setShowOnLaunch(showOnLaunch: boolean) {

            try {

                const prefs = colibri.Platform.getWorkbench().getGlobalPreferences();

                prefs.setValue("ide.startPage.showOnLaunch", showOnLaunch);

            } catch (e) {
                // preferences not available
            }
        }

        /**
         * Called by IDEPlugin when a project is opened. Shows this page once per session.
         */
        static onProjectOpened() {

            if (this._shownInThisSession) {

                return;
            }

            this._shownInThisSession = true;

            if (!this.isShowOnLaunch()) {

                return;
            }

            // give the workbench a moment to settle (like the MCP bridge hook)

            setTimeout(() => {

                new StartPageDialog().create();

            }, 400);
        }

        /**
         * The 8 most recently modified project files (.scene, .assetPack, .ts, .js and
         * .json files with the asset-pack content type).
         */
        static getRecentFiles(): io.FilePath[] {

            const files: io.FilePath[] = [];

            try {

                const reg = colibri.Platform.getWorkbench().getContentTypeRegistry();

                const recent = colibri.ui.ide.FileUtils.getAllFiles()

                    .filter(file => file.isFile())

                    .filter(file => {

                        const ext = file.getExtension();

                        if (ext === "scene" || ext === "assetPack" || ext === "ts" || ext === "js") {

                            return true;
                        }

                        // asset packs are ".json" files with the pack content type

                        if (ext === "json"
                            && reg.getCachedContentType(file) === "phasereditor2d.pack.core.AssetContentType") {

                            return true;
                        }

                        return false;
                    });

                recent.sort((a, b) => b.getModTime() - a.getModTime());

                files.push(...recent.slice(0, 8));

            } catch (e) {
                // project not ready, return an empty list
            }

            return files;
        }

        protected createDialogArea() {

            const element = document.createElement("div");

            element.classList.add("DialogClientArea", "DialogSection");

            element.style.display = "flex";
            element.style.flexDirection = "column";
            element.style.gap = "5px";

            element.innerHTML = `
<p class="Title" style="text-align:center; margin:10px 0 5px 0;">
<b style="font-size:1.4em;">Codogma Engine</b><br>
<small>v${colibri.PRODUCT_VERSION}</small><br>
<small><i>A friendly open-source IDE for HTML5 game development</i></small>
</p>
<div style="display:flex; flex-wrap:wrap; gap:5px; justify-content:center;">
    <button id="__newScene">New Scene</button>
    <button id="__newAssetPack">New Asset Pack</button>
    <button id="__openFile">Open File...</button>
    <button id="__settings">Settings...</button>
    <button id="__docs">Documentation</button>
</div>
<p style="margin-bottom:2px;"><b>Recent Files</b></p>
<div id="__recent" style="border:1px solid; padding:5px; overflow:auto; height:220px;
display:flex; flex-direction:column; gap:2px;"></div>
`;

            this.getElement().appendChild(element);

            this._recentElement = element.querySelector("#__recent");

            this._showOnLaunchElement = document.createElement("input");
            this._showOnLaunchElement.type = "checkbox";
            this._showOnLaunchElement.id = "__showOnLaunch";
            this._showOnLaunchElement.checked = StartPageDialog.isShowOnLaunch();

            this._showOnLaunchElement.addEventListener("change", () => {

                StartPageDialog.setShowOnLaunch(this._showOnLaunchElement.checked);
            });

            const showOnLaunchLabel = document.createElement("label");

            showOnLaunchLabel.htmlFor = "__showOnLaunch";
            showOnLaunchLabel.innerText = "Show on launch";
            showOnLaunchLabel.style.textAlign = "center";

            element.appendChild(this._showOnLaunchElement);
            element.appendChild(showOnLaunchLabel);

            element.querySelector("#__newScene").addEventListener("click", () => this.openNewSceneDialog());

            element.querySelector("#__newAssetPack").addEventListener("click", () => this.openNewAssetPackDialog());

            element.querySelector("#__openFile").addEventListener("click", () => this.openGoToFile());

            element.querySelector("#__settings").addEventListener("click", () => this.openSettings());

            element.querySelector("#__docs").addEventListener("click", () => this.openDocumentation());

            this.renderRecentFiles();
        }

        private renderRecentFiles() {

            const recent = StartPageDialog.getRecentFiles();

            if (recent.length === 0) {

                this._recentElement.textContent = "No recent files yet.";

                return;
            }

            this._recentElement.innerHTML = "";

            const theme = controls.Controls.getTheme();

            for (const file of recent) {

                const row = document.createElement("div");

                row.style.display = "flex";
                row.style.justifyContent = "space-between";
                row.style.cursor = "pointer";
                row.style.padding = "2px";

                const nameElement = document.createElement("span");

                nameElement.innerText = file.getName();

                const folderElement = document.createElement("span");

                let folder = file.getParent() ? file.getParent().getProjectRelativeName() : "";

                if (folder.startsWith("/")) {

                    folder = folder.substring(1);
                }

                folderElement.innerText = folder;
                folderElement.style.color = theme.viewerForeground + "90";

                row.appendChild(nameElement);
                row.appendChild(folderElement);

                row.addEventListener("click", () => this.openFile(file));

                this._recentElement.appendChild(row);
            }
        }

        private openFile(file: io.FilePath) {

            this.close();

            colibri.Platform.getWorkbench().openEditor(file);
        }

        /**
         * The New File dialogs of the scene/pack plugins, accessed through the runtime
         * global namespace (the ide plugin cannot reference those plugins). Fallback:
         * the generic New File dialog (files plugin).
         */
        private openNewFileDialog(extensionClassPath: string[], dialogName: string) {

            let ns: any = (window as any)["phasereditor2d"];

            for (const part of extensionClassPath) {

                ns = ns?.[part];
            }

            try {

                if (ns) {

                    const ext = new ns();

                    const dlg = ext.createDialog({
                        initialFileLocation: colibri.ui.ide.FileUtils.getRoot()
                    });

                    dlg.setTitle(`New ${ext.getDialogName() ?? dialogName}`);

                    return;
                }

            } catch (e) {
                // fall back to the generic New File dialog
            }

            // close this dialog first, so the New File command passes its context test

            this.close();

            colibri.Platform.getWorkbench().getCommandManager()
                .executeCommand("phasereditor2d.files.ui.actions.NewFile", true);
        }

        private openNewSceneDialog() {

            this.openNewFileDialog(
                ["scene", "ui", "dialogs", "NewSceneFileDialogExtension"], "Scene File");
        }

        private openNewAssetPackDialog() {

            this.openNewFileDialog(
                ["pack", "ui", "dialogs", "NewAssetPackFileWizardExtension"], "Asset Pack File");
        }

        private openGoToFile() {

            this.close();

            new GoToFileDialog().create();
        }

        private openSettings() {

            this.close();

            new SettingsDialog().create();
        }

        private openDocumentation() {

            IDEPlugin.getInstance().openBrowser("https://docs.phaser.io/phaser-editor/");
        }

        create() {

            super.create();

            this.setTitle("Welcome");

            this.addButton("Close", () => this.close());
        }
    }
}
