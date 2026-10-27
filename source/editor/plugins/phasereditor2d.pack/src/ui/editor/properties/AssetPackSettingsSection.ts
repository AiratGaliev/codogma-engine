namespace phasereditor2d.pack.ui.editor.properties {

    import controls = colibri.ui.controls;

    export class AssetPackSettingsSection extends controls.properties.PropertySection<core.AssetPack> {

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.editor.properties.PackSettings", "Asset Pack Settings", false, false);
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 2);

            const that = this;

            {
                // blocks view show all files in project

                const check = that.createCheckbox(comp, that.createLabel(comp, "Blocks View Shows All Files In Project"));

                check.addEventListener("change", () => {

                    that.getSelectionFirstElement().setShowAllFilesInBlocks(check.checked);

                    const editor = colibri.Platform.getWorkbench().getActiveEditor() as AssetPackEditor;

                    editor.refreshBlocks();
                    editor.setDirty(true);
                });

                that.addUpdater(() => {

                    check.checked = that.getSelectionFirstElement().isShowAllFilesInBlocks();
                });
            }

            {
                // pack visibility

                const check = that.createCheckbox(comp, that.createLabel(comp, "Asset Pack Visible"));

                check.addEventListener("change", () => {

                    that.getSelectionFirstElement().setVisible(check.checked);

                    const editor = colibri.Platform.getWorkbench().getActiveEditor() as AssetPackEditor;

                    editor.refreshBlocks();
                    editor.setDirty(true);
                });

                that.addUpdater(() => {

                    check.checked = that.getSelectionFirstElement().isVisible();
                });
            }
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof core.AssetPack;
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
