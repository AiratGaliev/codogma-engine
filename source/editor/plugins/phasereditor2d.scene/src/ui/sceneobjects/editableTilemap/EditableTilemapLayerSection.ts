namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class EditableTilemapLayerSection extends editor.properties.BaseSceneSection<EditableTilemapLayer> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.EditableTilemapLayerSection";

        constructor(page: controls.properties.PropertyPage) {
            super(page, EditableTilemapLayerSection.SECTION_ID, "Editable Tilemap Layer", false, false);
        }

        protected getSectionHelpPath() {

            return "scene-editor/editable-tilemap-object.html";
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 2);

            {
                // Name

                this.createLabel(comp, "Name", "The name of the layer in the tilemap data.");

                const text = this.createText(comp);

                text.addEventListener("change", () => {

                    this.renameLayer(text.value);
                });

                this.addUpdater(() => {

                    const layer = this.getSelectionFirstElement();

                    text.value = layer ? layer.getLayerName() : "";
                });
            }

            {
                // Width

                this.createLabel(comp, "Width", "The width of the layer, in tiles.");

                const text = this.createText(comp);

                text.addEventListener("change", () => {

                    this.resizeLayer(Number.parseInt(text.value, 10), undefined);
                });

                this.addUpdater(() => {

                    const layer = this.getSelectionFirstElement();

                    const info = layer?.getLayerInfo();

                    text.value = info ? info.width.toString() : "";
                });
            }

            {
                // Height

                this.createLabel(comp, "Height", "The height of the layer, in tiles.");

                const text = this.createText(comp);

                text.addEventListener("change", () => {

                    this.resizeLayer(undefined, Number.parseInt(text.value, 10));
                });

                this.addUpdater(() => {

                    const layer = this.getSelectionFirstElement();

                    const info = layer?.getLayerInfo();

                    text.value = info ? info.height.toString() : "";
                });
            }

            {
                // Edit Map

                this.createLabel(comp, "");

                const btn = this.createButton(comp, "Edit Map", () => {

                    const layer = this.getSelectionFirstElement();

                    if (layer) {

                        this.getEditor().setSelection([layer.getTilemap()]);
                    }
                });

                controls.Tooltip.tooltip(btn, "Select the tilemap that owns this layer.");

                btn.style.gridColumn = "2";
            }

            this.addUpdater(() => {

                // the section is updated with the selection
            });
        }

        private snapshot(modification: () => void) {

            this.getUndoManager().add(
                new ui.editor.undo.SceneSnapshotOperation(this.getEditor(), async () => {

                    modification();
                }));
        }

        private renameLayer(newName: string) {

            const layer = this.getSelectionFirstElement();

            if (!layer) {

                return;
            }

            const layerInfo = layer.getLayerInfo();

            if (!layerInfo || !newName || newName === layerInfo.name) {

                return;
            }

            const tilemap = layer.getTilemap();

            if (tilemap.getLayerInfoByName(newName)) {

                alert("A layer with that name already exists.");

                return;
            }

            this.snapshot(() => {

                layerInfo.name = newName;

                layer.setLayerName(newName);

                layer.getEditorSupport().setLabel(newName);
            });
        }

        private resizeLayer(width: number | undefined, height: number | undefined) {

            const layer = this.getSelectionFirstElement();

            if (!layer) {

                return;
            }

            const layerInfo = layer.getLayerInfo();

            if (!layerInfo) {

                return;
            }

            const newWidth = width === undefined || Number.isNaN(width) ? layerInfo.width : Math.max(1, width);
            const newHeight = height === undefined || Number.isNaN(height) ? layerInfo.height : Math.max(1, height);

            if (newWidth === layerInfo.width && newHeight === layerInfo.height) {

                return;
            }

            this.snapshot(() => {

                EditableTilemap.resizeLayer(layerInfo, newWidth, newHeight);
            });
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof EditableTilemapLayer;
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
