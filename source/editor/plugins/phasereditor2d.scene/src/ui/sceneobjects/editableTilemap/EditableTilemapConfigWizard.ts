namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class EditableTilemapConfigWizard extends controls.dialogs.WizardDialog {

        private _finishCallback: () => void;
        private _cancelCallback: () => void;
        private _page: EditableTilemapConfigPage;

        constructor() {
            super();

            this.setSize(undefined, 400, true);
        }

        create() {

            this._page = new EditableTilemapConfigPage();

            this.addPages(this._page);

            super.create();

            this.setTitle("New Editable Tilemap");
        }

        setFinishCallback(cb: () => void) {

            this._finishCallback = cb;
        }

        setCancelCallback(cb: () => void) {

            this._cancelCallback = cb;
        }

        finishButtonPressed() {

            this._finishCallback();
        }

        cancelButtonPressed() {

            this._cancelCallback();
        }

        getLabel() {

            return this._page.getLabel();
        }

        getColumns() {

            return this._page.getColumns();
        }

        getRows() {

            return this._page.getRows();
        }

        getTileWidth() {

            return this._page.getTileWidth();
        }

        getTileHeight() {

            return this._page.getTileHeight();
        }
    }

    class EditableTilemapConfigPage extends controls.dialogs.WizardPage {

        private _labelText: HTMLInputElement;
        private _columnsText: HTMLInputElement;
        private _rowsText: HTMLInputElement;
        private _tileWidthText: HTMLInputElement;
        private _tileHeightText: HTMLInputElement;

        constructor() {
            super("Tilemap", "Set the basic parameters of the tilemap.");
        }

        createElements(parent: HTMLElement) {

            const comp = document.createElement("div");

            comp.style.display = "grid";
            comp.style.gridTemplateColumns = "auto 1fr";
            comp.style.gap = "5px";
            comp.style.alignItems = "center";
            comp.style.padding = "5px";

            parent.appendChild(comp);

            const createText = (label: string, value: string, integer: boolean) => {

                const labelElement = document.createElement("label");
                labelElement.innerText = label;
                comp.appendChild(labelElement);

                const text = document.createElement("input");
                text.type = "text";
                text.value = value;
                comp.appendChild(text);

                text.addEventListener("change", () => {

                    if (integer) {

                        const n = Number.parseInt(text.value, 10);

                        if (Number.isNaN(n) || n <= 0) {

                            text.value = value;
                        }
                    }

                    this.getWizard().updateWizardButtons();
                });

                return text;
            };

            this._labelText = createText("Variable Name", "levelMap", false);

            this._columnsText = createText("Columns", "50", true);

            this._rowsText = createText("Rows", "30", true);

            this._tileWidthText = createText("Tile Width", "16", true);

            this._tileHeightText = createText("Tile Height", "16", true);

            this.getWizard().updateWizardButtons();
        }

        private readInt(text: HTMLInputElement, defValue: number) {

            const n = Number.parseInt(text.value, 10);

            return Number.isNaN(n) || n <= 0 ? defValue : n;
        }

        getLabel() {

            return this._labelText.value;
        }

        getColumns() {

            return this.readInt(this._columnsText, 50);
        }

        getRows() {

            return this.readInt(this._rowsText, 30);
        }

        getTileWidth() {

            return this.readInt(this._tileWidthText, 16);
        }

        getTileHeight() {

            return this.readInt(this._tileHeightText, 16);
        }

        canFinish() {

            return this.getLabel().trim().length > 0;
        }

        canGoNext() {

            return this.canFinish();
        }
    }
}
