namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class EditableTilemapSection extends editor.properties.BaseSceneSection<EditableTilemap> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.EditableTilemapSection";

        private _tilesetsArea: HTMLDivElement;
        private _layersArea: HTMLDivElement;

        constructor(page: controls.properties.PropertyPage) {
            super(page, EditableTilemapSection.SECTION_ID, "Editable Tilemap", false, false);
        }

        protected getSectionHelpPath() {

            return "scene-editor/editable-tilemap-object.html";
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 2);

            {
                // tile size info

                this.createLabel(comp, "Tile Size");

                const text = this.createText(comp, true);

                this.addUpdater(() => {

                    const tilemap = this.getSelectionFirstElement();

                    text.value = tilemap ? `${tilemap.getTileWidth()} x ${tilemap.getTileHeight()}` : "";
                });
            }

            {
                // tilesets

                const header = this.createGridElement(comp, 2);
                header.style.gridColumn = "1 / span 2";
                header.style.gridTemplateColumns = "1fr auto";

                this.createLabel(header, "TILE SETS");

                const addButton = this.createButton(header, "Add Tileset", () => this.addTileset());

                controls.Tooltip.tooltip(addButton, "Add a new tileset, picking an image or spritesheet asset.");

                comp.appendChild(header);

                this._tilesetsArea = this.createGridElement(comp, 1);
                this._tilesetsArea.style.gridColumn = "1 / span 2";
                this._tilesetsArea.style.gridTemplateColumns = "1fr auto auto";

                comp.appendChild(this._tilesetsArea);
            }

            {
                // layers

                const header = this.createGridElement(comp, 2);
                header.style.gridColumn = "1 / span 2";
                header.style.gridTemplateColumns = "1fr auto";

                this.createLabel(header, "LAYERS");

                const addButton = this.createButton(header, "Add Layer", () => this.addLayer());

                controls.Tooltip.tooltip(addButton, "Add a new layer to the map.");

                comp.appendChild(header);

                this._layersArea = this.createGridElement(comp, 1);
                this._layersArea.style.gridColumn = "1 / span 2";
                this._layersArea.style.gridTemplateColumns = "1fr auto auto";

                comp.appendChild(this._layersArea);
            }

            this.addUpdater(() => this.updateUI());
        }

        private updateUI() {

            const tilemap = this.getSelectionFirstElement();

            this.clearRows(this._tilesetsArea);
            this.clearRows(this._layersArea);

            if (!tilemap) {

                return;
            }

            for (const tileset of tilemap.getTilesets()) {

                const nameBtn = this.createButton(this._tilesetsArea, tileset.name, () => {

                    this.getEditor().setSelection([tileset]);
                });

                controls.Tooltip.tooltip(nameBtn, "Click to edit the tileset properties.");

                nameBtn.style.gridColumn = "1 / span 2";
                nameBtn.style.textAlign = "left";

                const delBtn = this.createIconButton(this._tilesetsArea,
                    colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_DELETE),
                    "Delete the tileset and update the ID of the tiles of every layer.",
                    () => this.deleteTileset(tileset));
            }

            for (const layer of tilemap.getLayers()) {

                const nameBtn = this.createButton(this._layersArea, layer.name, () => {

                    const layerObj = EditableTilemapLayer.findLayerObject(
                        this.getEditor().getScene(), tilemap, layer.name);

                    if (layerObj) {

                        this.getEditor().setSelection([layerObj]);
                    }
                });

                controls.Tooltip.tooltip(nameBtn, "Click to select the layer in the scene.");

                nameBtn.style.gridColumn = "1 / span 2";
                nameBtn.style.textAlign = "left";

                const delBtn = this.createIconButton(this._layersArea,
                    colibri.ColibriPlugin.getInstance().getIcon(colibri.ICON_DELETE),
                    "Delete the layer and its game object.",
                    () => this.deleteLayer(layer));
            }
        }

        private clearRows(area: HTMLDivElement) {

            while (area.children.length > 0) {

                area.children[0].remove();
            }
        }

        private createIconButton(parent: HTMLElement, icon: controls.IImage, tooltip: string, callback: () => void) {

            const btn = this.createButton(parent, icon, callback);

            controls.Tooltip.tooltip(btn, tooltip);

            return btn;
        }

        private snapshot(modification: () => void) {

            this.getUndoManager().add(
                new ui.editor.undo.SceneSnapshotOperation(this.getEditor(), async () => {

                    modification();
                }));
        }

        private async addTileset() {

            const editor = this.getEditor();

            const scene = editor.getScene();

            const tilemap = this.getSelectionFirstElement();

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

                // load the texture into the scene, so the layers can render it

                const loaderExt = ScenePlugin.getInstance().getLoaderUpdaterForAsset(asset);

                if (loaderExt) {

                    await loaderExt.updateLoader(scene, asset);
                }

                this.snapshot(() => {

                    let tileWidth = tilemap.getTileWidth();
                    let tileHeight = tilemap.getTileHeight();
                    let margin = 0;
                    let spacing = 0;

                    if (asset instanceof pack.core.SpritesheetAssetPackItem) {

                        // copy the parameters of the spritesheet

                        const frameConfig = (asset.getData().frameConfig ?? {}) as any;

                        tileWidth = frameConfig.frameWidth ?? tileWidth;
                        tileHeight = frameConfig.frameHeight ?? tileHeight;
                        margin = frameConfig.margin ?? 0;
                        spacing = frameConfig.spacing ?? 0;
                    }

                    let name = asset.getKey();

                    let i = 2;

                    while (tilemap.getTilesetByName(name)) {

                        name = asset.getKey() + i;
                        i++;
                    }

                    const tileset: IEditableTilesetInfo = {
                        name,
                        imageKey: asset.getKey(),
                        tileWidth,
                        tileHeight,
                        margin,
                        spacing,
                        firstgid: 1
                    };

                    EditableTilemap.markTilesetInfo(tileset);

                    EditableTilemap.updateTilesetsAndRebase(tilemap, () => {

                        tilemap.getTilesets().push(tileset);
                    });

                    editor.setSelection([tileset]);
                });
            });
        }

        private deleteTileset(tileset: IEditableTilesetInfo) {

            const tilemap = this.getSelectionFirstElement();

            this.snapshot(() => {

                EditableTilemap.updateTilesetsAndRebase(tilemap, () => {

                    const i = tilemap.getTilesets().indexOf(tileset);

                    if (i >= 0) {

                        tilemap.getTilesets().splice(i, 1);
                    }
                });

                this.getEditor().setSelection([tilemap]);
            });
        }

        private addLayer() {

            const editor = this.getEditor();

            const scene = editor.getScene();

            const tilemap = this.getSelectionFirstElement();

            this.snapshot(() => {

                const firstLayer = tilemap.getLayers()[0];

                const width = firstLayer ? firstLayer.width : 50;
                const height = firstLayer ? firstLayer.height : 30;

                let name = scene.makeNewName("layer");

                while (tilemap.getLayerInfoByName(name)) {

                    name = name + "2";
                }

                const data: number[][] = [];

                for (let y = 0; y < height; y++) {

                    data.push(new Array(width).fill(-1));
                }

                const layer: IEditableLayerInfo = {
                    id: Phaser.Utils.String.UUID(),
                    name,
                    width,
                    height,
                    data
                };

                tilemap.getLayers().push(layer);

                const layerObj = EditableTilemapLayerExtension.getInstance()
                    .createLayerObject(scene, tilemap, name);

                layerObj.getEditorSupport().setLabel(scene.makeNewName(name));

                editor.setSelection([layerObj]);
            });
        }

        private deleteLayer(layer: IEditableLayerInfo) {

            const editor = this.getEditor();

            const scene = editor.getScene();

            const tilemap = this.getSelectionFirstElement();

            this.snapshot(() => {

                const i = tilemap.getLayers().indexOf(layer);

                if (i >= 0) {

                    tilemap.getLayers().splice(i, 1);
                }

                const layerObj = EditableTilemapLayer.findLayerObject(scene, tilemap, layer.name);

                if (layerObj) {

                    layerObj.getEditorSupport().destroy();
                }

                editor.setSelection([tilemap]);
            });
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof EditableTilemap;
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }
}
