namespace phasereditor2d.ide.ui.dialogs {

    import controls = colibri.ui.controls;
    import io = colibri.core.io;

    export interface IGoToItem {

        label: string;
        detail: string;
        file: io.FilePath;
    }

    /**
     * Quick open dialog (official v5 "Go to File..."): fuzzy search over all the project
     * files and the asset pack entries.
     *
     * The asset pack entries are accessed through the runtime global namespace
     * (`window["phasereditor2d"]["pack"]`), because the ide plugin cannot reference the
     * pack plugin (circular project references). If the pack plugin is not loaded, the
     * dialog works in files-only mode.
     */
    export class GoToFileDialog extends controls.dialogs.Dialog {

        private _inputElement: HTMLInputElement;
        private _listElement: HTMLDivElement;
        private _items: IGoToItem[];
        private _filteredItems: IGoToItem[];
        private _selectedItemIndex: number;

        constructor() {
            super("GoToFileDialog");

            this._items = [];
            this._filteredItems = [];
            this._selectedItemIndex = 0;

            this.setSize(650, 550, true);
        }

        /**
         * All the project files + the asset pack entries.
         */
        static async getItems(): Promise<IGoToItem[]> {

            const items: IGoToItem[] = [];

            for (const file of colibri.ui.ide.FileUtils.getAllFiles()) {

                if (!file.isFile()) {

                    continue;
                }

                let folder = file.getParent() ? file.getParent().getProjectRelativeName() : "";

                if (folder.startsWith("/")) {

                    folder = folder.substring(1);
                }

                items.push({
                    label: file.getName(),
                    detail: folder,
                    file: file
                });
            }

            // asset pack entries (pack plugin accessed through the runtime global namespace)

            try {

                const packCore = (window as any)["phasereditor2d"]?.["pack"]?.["core"];

                if (packCore?.["AssetPackUtils"]?.["getAllPacks"]) {

                    const packs: any[] = await packCore["AssetPackUtils"]["getAllPacks"]();

                    for (const pack of packs) {

                        const packName = pack.getFile() ? pack.getFile().getFullName() : "";

                        for (const item of pack.getItems()) {

                            items.push({
                                label: String(item.getKey()),
                                detail: `${item.getType()} — ${packName}`,
                                file: pack.getFile()
                            });
                        }
                    }
                }

            } catch (e) {
                // pack plugin not available, work in files-only mode
            }

            return items;
        }

        /**
         * Case-insensitive subsequence fuzzy matching. Returns a score >= 0, or -1 when
         * the text does not match the query.
         */
        static fuzzyScore(query: string, text: string): number {

            if (query.length === 0) {

                return 0;
            }

            const textLower = text.toLowerCase();

            let score = 0;
            let searchIndex = 0;
            let previousIndex = -1;

            for (const c of query.toLowerCase()) {

                const i = textLower.indexOf(c, searchIndex);

                if (i < 0) {

                    return -1;
                }

                searchIndex = i + 1;

                score += 1;

                if (i === previousIndex + 1) {

                    // consecutive match

                    score += 5;
                }

                if (i === 0 || "/._ -".indexOf(textLower[i - 1]) >= 0) {

                    // word boundary match

                    score += 8;
                }

                previousIndex = i;
            }

            // prefer shorter names

            score += Math.max(0, 20 - text.length / 4);

            return score;
        }

        protected createDialogArea() {

            const element = document.createElement("div");

            element.classList.add("DialogClientArea", "DialogSection");

            element.style.display = "flex";
            element.style.flexDirection = "column";
            element.style.gap = "5px";

            this._inputElement = document.createElement("input");

            this._inputElement.type = "text";
            this._inputElement.spellcheck = false;
            this._inputElement.placeholder = "Search files and asset keys...";

            this._inputElement.addEventListener("input", () => this.updateList());

            this._inputElement.addEventListener("keydown", e => {

                if (e.key === "ArrowDown") {

                    e.preventDefault();

                    this.moveSelection(1);

                } else if (e.key === "ArrowUp") {

                    e.preventDefault();

                    this.moveSelection(-1);

                } else if (e.key === "Enter") {

                    e.preventDefault();

                    this.openItem(this._filteredItems[this._selectedItemIndex]);
                }
            });

            this._listElement = document.createElement("div");

            this._listElement.style.border = "1px solid";
            this._listElement.style.padding = "5px";
            this._listElement.style.overflow = "auto";
            this._listElement.style.flex = "1";
            this._listElement.style.display = "flex";
            this._listElement.style.flexDirection = "column";
            this._listElement.style.gap = "2px";

            element.appendChild(this._inputElement);
            element.appendChild(this._listElement);

            this.getElement().appendChild(element);

            setTimeout(() => this._inputElement.focus(), 10);

            this.updateList();

            this.loadItems();
        }

        private async loadItems() {

            let items: IGoToItem[];

            try {

                items = await GoToFileDialog.getItems();

            } catch (e) {

                // project not ready, work with an empty list

                items = [];
            }

            if (this.isClosed()) {

                return;
            }

            this._items = items;

            this.updateList();
        }

        private updateList() {

            if (this.isClosed()) {

                return;
            }

            const query = this._inputElement.value.trim();

            const scored: { item: IGoToItem, score: number }[] = [];

            for (const item of this._items) {

                const score = GoToFileDialog.fuzzyScore(query, item.label + " " + item.detail);

                if (score >= 0) {

                    scored.push({ item, score });
                }
            }

            scored.sort((a, b) => {

                if (a.score !== b.score) {

                    return b.score - a.score;
                }

                return (b.item.file?.getModTime() ?? 0) - (a.item.file?.getModTime() ?? 0);
            });

            this._filteredItems = scored.map(entry => entry.item);

            this._selectedItemIndex = 0;

            this.renderList();
        }

        private renderList() {

            const theme = controls.Controls.getTheme();

            this._listElement.innerHTML = "";

            if (this._filteredItems.length === 0) {

                this._listElement.textContent = "No matches.";

                return;
            }

            const max = Math.min(this._filteredItems.length, 50);

            for (let i = 0; i < max; i++) {

                const item = this._filteredItems[i];

                const row = document.createElement("div");

                row.style.display = "flex";
                row.style.justifyContent = "space-between";
                row.style.cursor = "pointer";
                row.style.padding = "2px 5px";

                if (i === this._selectedItemIndex) {

                    row.style.background = theme.viewerSelectionBackground;
                    row.style.color = theme.viewerSelectionForeground;
                }

                const labelElement = document.createElement("span");

                labelElement.innerText = item.label;

                const detailElement = document.createElement("span");

                detailElement.innerText = item.detail;
                detailElement.style.color = i === this._selectedItemIndex
                    ? theme.viewerSelectionForeground
                    : theme.viewerForeground + "90";

                row.appendChild(labelElement);
                row.appendChild(detailElement);

                row.addEventListener("click", () => this.openItem(item));

                this._listElement.appendChild(row);
            }
        }

        private moveSelection(delta: number) {

            if (this._filteredItems.length === 0) {

                return;
            }

            const max = Math.min(this._filteredItems.length, 50) - 1;

            this._selectedItemIndex = Math.min(Math.max(this._selectedItemIndex + delta, 0), max);

            this.renderList();
        }

        private openItem(item: IGoToItem) {

            if (!item || !item.file) {

                return;
            }

            this.close();

            colibri.Platform.getWorkbench().openEditor(item.file);
        }

        create() {

            super.create();

            this.setTitle("Go to File");

            this.addButton("Open", () => this.openItem(this._filteredItems[this._selectedItemIndex]));

            this.addCancelButton();
        }
    }
}
