namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The Rectangular Selection tool: select a region of the tilemap layer.
     *
     * - Delete: clear the cells of the region.
     * - Ctrl+C: copy the cells of the region into the brush and activate the Stamp tool.
     * - Ctrl+X: copy the cells of the region into the brush and clear the region.
     */
    export class TilemapRectSelectionTool extends EditableTilemapTool {

        static ID = "phasereditor2d.scene.ui.sceneobjects.TilemapRectSelectionTool";

        private _startCell: { tx: number, ty: number };
        private _currentCell: { tx: number, ty: number };
        private _region: { tx: number, ty: number, w: number, h: number };

        constructor() {
            super(TilemapRectSelectionTool.ID, editor.commands.CMD_EDIT_TILEMAP_RECT_SELECTION);
        }

        protected canStartOutsideLayer(): boolean {

            return true;
        }

        /**
         * The selected region, in tile coordinates of the painted layer.
         */
        getRegion() {

            return this._region ? { ...this._region } : null;
        }

        hasRegion() {

            return this._region !== null && this._region !== undefined;
        }

        private computeRegion(cell: { tx: number, ty: number }) {

            const a = this._startCell;
            const b = cell;

            this._region = {
                tx: Math.min(a.tx, b.tx),
                ty: Math.min(a.ty, b.ty),
                w: Math.abs(b.tx - a.tx) + 1,
                h: Math.abs(b.ty - a.ty) + 1
            };
        }

        protected onStrokeStart(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {

            this._startCell = { ...cell };
            this._currentCell = { ...cell };
            this._region = null;
        }

        protected onStrokeDrag(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, from: { tx: number, ty: number }, to: { tx: number, ty: number }) {

            this._currentCell = { ...to };

            args.editor.repaint();
        }

        protected onStrokeStop(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {

            if (this._startCell) {

                this.computeRegion(cell);
            }

            this._startCell = null;
            this._currentCell = null;

            args.editor.repaint();
        }

        /**
         * Clear the cells of the selected region.
         */
        private clearRegion(editor: editor.SceneEditor, layer: EditableTilemapLayer) {

            const region = this._region;

            if (!region || !layer) {

                return;
            }

            const op = new EditTilemapLayerDataOperation(editor, layer);

            for (let y = 0; y < region.h; y++) {

                for (let x = 0; x < region.w; x++) {

                    EditableTilemapToolUtils.setCellGid(layer, region.tx + x, region.ty + y, -1);
                }
            }

            editor.getUndoManager().add(op);

            editor.repaint();
        }

        /**
         * Copy the cells of the selected region into the brush.
         *
         * @param cut If the region cells must be cleared too.
         */
        copyRegionToBrush(editor: editor.SceneEditor, cut: boolean) {

            const layer = EditableTilemapToolUtils.getPaintLayer(editor);

            const region = this._region;

            if (!region || !layer) {

                return;
            }

            const info = layer.getLayerInfo();

            if (!info) {

                return;
            }

            const pattern: number[][] = [];

            for (let y = 0; y < region.h; y++) {

                const row: number[] = [];

                for (let x = 0; x < region.w; x++) {

                    const tx = region.tx + x;
                    const ty = region.ty + y;

                    row.push(EditableTilemapToolUtils.isInLayer(layer, tx, ty) ? info.data[ty][tx] : -1);
                }

                pattern.push(row);
            }

            EditableTilemapBrush.setPattern(pattern, region.tx, region.ty);

            if (cut) {

                this.clearRegion(editor, layer);
            }

            // activate the Stamp tool, with the selected tiles as brush

            editor.getToolsManager().activateTool(TilemapStampTool.ID);

            editor.repaint();
        }

        handleDeleteCommand(args: editor.tools.ISceneToolContextArgs): boolean {

            if (!EditableTilemapToolUtils.isEditingTilemap(args.editor)) {

                return false;
            }

            const layer = EditableTilemapToolUtils.getPaintLayer(args.editor);

            if (!layer || !this._region) {

                return false;
            }

            this.clearRegion(args.editor, layer);

            return true;
        }

        protected renderTool(args: editor.tools.ISceneToolRenderArgs, layer: EditableTilemapLayer) {

            if (!layer) {

                return;
            }

            const region = this._startCell && this._currentCell
                ? this.tempRegion(this._currentCell)
                : this._region;

            if (!region) {

                return;
            }

            const ctx = args.canvasContext;

            const p1 = EditableTilemapToolUtils.tileToScreen(args.editor, layer, region.tx, region.ty);
            const p2 = EditableTilemapToolUtils.tileToScreen(
                args.editor, layer, region.tx + region.w, region.ty + region.h);

            ctx.save();

            ctx.strokeStyle = "black";
            ctx.lineWidth = 4;

            ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);

            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);

            ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);

            ctx.restore();
        }

        private tempRegion(cell: { tx: number, ty: number }) {

            const a = this._startCell;
            const b = cell;

            return {
                tx: Math.min(a.tx, b.tx),
                ty: Math.min(a.ty, b.ty),
                w: Math.abs(b.tx - a.tx) + 1,
                h: Math.abs(b.ty - a.ty) + 1
            };
        }
    }
}
