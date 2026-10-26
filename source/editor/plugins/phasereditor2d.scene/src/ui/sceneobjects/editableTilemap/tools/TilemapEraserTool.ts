namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The Eraser tool: drag the mouse over the layer to delete all the cells
     * where the cursor passes. Hold the Shift key and click on a cell to delete
     * all the neighboring cells with the same tile id (bucket-fill algorithm).
     */
    export class TilemapEraserTool extends EditableTilemapTool {

        static ID = "phasereditor2d.scene.ui.sceneobjects.TilemapEraserTool";

        private _bucketErase: boolean;

        constructor() {
            super(TilemapEraserTool.ID, editor.commands.CMD_EDIT_TILEMAP_ERASER);
        }

        protected onStrokeStart(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {

            if (args.event.shiftKey) {

                // bucket-erase the connected cells with the same tile id

                this._bucketErase = true;

                this.floodFill(layer, cell.tx, cell.ty, true);

                return;
            }

            this._bucketErase = false;

            this.setCellGid(layer, cell.tx, cell.ty, -1);
        }

        protected onStrokeDrag(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, from: { tx: number, ty: number }, to: { tx: number, ty: number }) {

            if (this._bucketErase) {

                return;
            }

            this.forEachLineCell(from.tx, from.ty, to.tx, to.ty, (tx, ty) => {

                this.setCellGid(layer, tx, ty, -1);
            });
        }

        protected onStrokeStop(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {
            // nothing
        }
    }
}
