namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class EditableTilesetSection extends editor.properties.BaseSceneSection<IEditableTilesetInfo> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.EditableTilesetSection";

        constructor(page: controls.properties.PropertyPage) {
            super(page, EditableTilesetSection.SECTION_ID, "Tileset", false, false);
        }

        protected getSectionHelpPath() {

            return "scene-editor/editable-tilemap-object.html";
        }

        private getTileset() {

            return this.getSelectionFirstElement() as IEditableTilesetInfo;
        }

        private getTilemap(): EditableTilemap {

            const tileset = this.getTileset();

            if (!tileset) {

                return null;
            }

            for (const obj of this.getEditor().getScene().getPlainObjects()) {

                if (obj instanceof EditableTilemap && obj.getTilesets().indexOf(tileset) >= 0) {

                    return obj;
                }
            }

            return null;
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 2);

            {
                // Name

                this.createLabel(comp, "Name");

                const text = this.createText(comp);

                text.addEventListener("change", () => {

                    this.snapshot(() => {

                        const tileset = this.getTileset();

                        const tilemap = this.getTilemap();

                        if (tileset && tilemap && text.value && !tilemap.getTilesetByName(text.value)) {

                            tileset.name = text.value;
                        }
                    });
                });

                this.addUpdater(() => {

                    const tileset = this.getTileset();

                    text.value = tileset ? tileset.name : "";
                });
            }

            {
                // Image

                this.createLabel(comp, "Image");

                const btn = this.createButton(comp, "", () => this.selectImage());

                this.addUpdater(() => {

                    let textValue = "Select Image...";

                    const tileset = this.getTileset();

                    if (tileset?.imageKey) {

                        textValue = tileset.imageKey;
                    }

                    btn.textContent = textValue;
                });

                controls.Tooltip.tooltip(btn, "Select the image or spritesheet asset of the tileset.");
            }

            this.createIntField(comp, "Tile Width", "tileWidth");

            this.createIntField(comp, "Tile Height", "tileHeight");

            this.createIntField(comp, "Margin", "margin");

            this.createIntField(comp, "Spacing", "spacing");

            {
                // Edit Map

                this.createLabel(comp, "");

                const btn = this.createButton(comp, "Edit Map", () => {

                    const tilemap = this.getTilemap();

                    if (tilemap) {

                        this.getEditor().setSelection([tilemap]);
                    }
                });

                controls.Tooltip.tooltip(btn, "Go back to editing the tilemap.");

                btn.style.gridColumn = "2";
            }

            this.addUpdater(() => {

                // the section is updated with the selection
            });
        }

        private createIntField(comp: HTMLElement, label: string, prop: "tileWidth" | "tileHeight" | "margin" | "spacing") {

            this.createLabel(comp, label);

            const text = this.createText(comp);

            text.addEventListener("change", () => {

                const value = Number.parseInt(text.value, 10);

                if (Number.isNaN(value) || value < 0) {

                    return;
                }

                this.snapshot(() => {

                    const tileset = this.getTileset();

                    if (tileset && tileset[prop] !== value) {

                        const tilemap = this.getTilemap();

                        EditableTilemap.updateTilesetsAndRebase(tilemap, () => {

                            tileset[prop] = value;
                        });
                    }
                });
            });

            this.addUpdater(() => {

                const tileset = this.getTileset();

                text.value = tileset ? tileset[prop].toString() : "";
            });
        }

        private snapshot(modification: () => void) {

            this.getUndoManager().add(
                new ui.editor.undo.SceneSnapshotOperation(this.getEditor(), async () => {

                    modification();
                }));
        }

        private async selectImage() {

            const editor = this.getEditor();

            const scene = editor.getScene();

            const tileset = this.getTileset();

            const tilemap = this.getTilemap();

            if (!tileset || !tilemap) {

                return;
            }

            const finder = new pack.core.PackFinder();

            await finder.preload();

            const dlg = new pack.ui.dialogs.AssetSelectionDialog("tree");

            dlg.create();

            dlg.getViewer().setInput(finder.getAssets(
                i => i instanceof pack.core.ImageAssetPackItem
                    || i instanceof pack.core.SpritesheetAssetPackItem));

            dlg.setSelectionCallback(async (sel) => {

                const asset = sel[0] as (pack.core.ImageAssetPackItem | pack.core.SpritesheetAssetPackItem);

                if (!asset) {

                    return;
                }

                const loaderExt = ScenePlugin.getInstance().getLoaderUpdaterForAsset(asset);

                if (loaderExt) {

                    await loaderExt.updateLoader(scene, asset);
                }

                this.snapshot(() => {

                    EditableTilemap.updateTilesetsAndRebase(tilemap, () => {

                        tileset.imageKey = asset.getKey();
                    });
                });
            });
        }

        canEdit(obj: any, n: number): boolean {

            return EditableTilemap.isTilesetInfo(obj);
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
