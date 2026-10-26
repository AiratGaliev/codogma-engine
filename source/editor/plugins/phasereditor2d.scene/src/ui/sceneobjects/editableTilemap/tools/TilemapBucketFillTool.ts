namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The Bucket Fill tool: click to fill all the connected cells that have the
     * same tile id (or are empty) with the brush pattern, anchored at the click point.
     */
    export class TilemapBucketFillTool extends EditableTilemapTool {

        static ID = "phasereditor2d.scene.ui.sceneobjects.TilemapBucketFillTool";

        constructor() {
            super(TilemapBucketFillTool.ID, editor.commands.CMD_EDIT_TILEMAP_BUCKET_FILL);
        }

        protected showBrushPreview(): boolean {

            return true;
        }

        protected onStrokeStart(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {

            this.floodFill(layer, cell.tx, cell.ty, false);
        }

        protected onStrokeDrag(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, from: { tx: number, ty: number }, to: { tx: number, ty: number }) {
            // nothing, the bucket fill is applied on click
        }

        protected onStrokeStop(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {
            // nothing
        }
    }
}
