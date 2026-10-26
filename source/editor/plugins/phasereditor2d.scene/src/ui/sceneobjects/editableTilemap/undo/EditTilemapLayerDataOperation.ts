namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * This operation edits the data of an editable tilemap layer (the single
     * source of truth, stored in the tilemap plain object).
     *
     * It is used by the tilemap tools: each pointer stroke is one operation.
     */
    export class EditTilemapLayerDataOperation extends editor.undo.SceneEditorOperation {

        private _tilemapId: string;
        private _layerName: string;
        private _before: number[][];
        private _after: number[][];

        constructor(editor: editor.SceneEditor, layer: EditableTilemapLayer) {
            super(editor);

            this._tilemapId = layer.getTilemap().getEditorSupport().getId();
            this._layerName = layer.getLayerName();

            const info = layer.getLayerInfo();

            this._before = info ? info.data.map(row => [...row]) : [];
        }

        private getLayerInfo(): IEditableLayerInfo {

            const tilemap = this.getScene().getPlainObjectById(this._tilemapId) as EditableTilemap;

            if (!tilemap) {

                return null;
            }

            return tilemap.getLayerInfoByName(this._layerName);
        }

        async execute() {

            const info = this.getLayerInfo();

            this._after = info ? info.data.map(row => [...row]) : [];

            this.getEditor().setDirty(true);
        }

        private restore(data: number[][]) {

            const info = this.getLayerInfo();

            if (!info) {

                return;
            }

            info.data = data.map(row => [...row]);

            const scene = this.getScene();

            const tilemap = scene.getPlainObjectById(this._tilemapId) as EditableTilemap;

            const layerObj = tilemap ? EditableTilemapLayer.findLayerObject(scene, tilemap, this._layerName) : null;

            if (layerObj) {

                layerObj.syncTilesFromData();
            }

            this.getEditor().setDirty(true);
            this.getEditor().repaint();
        }

        undo(): void {

            this.restore(this._before);
        }

        redo(): void {

            this.restore(this._after);
        }
    }
}
