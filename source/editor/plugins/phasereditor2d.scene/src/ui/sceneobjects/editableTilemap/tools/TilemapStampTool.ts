namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The Stamp tool: use the brush to stamp on the tilemap layer.
     *
     * Click to stamp the brush at the mouse position, or drag the mouse to
     * paint the entire stroke (the pattern is anchored at each cell of the stroke).
     */
    export class TilemapStampTool extends EditableTilemapTool {

        static ID = "phasereditor2d.scene.ui.sceneobjects.TilemapStampTool";

        constructor() {
            super(TilemapStampTool.ID, editor.commands.CMD_EDIT_TILEMAP_STAMP);
        }

        protected showBrushPreview(): boolean {

            return true;
        }

        protected onStrokeStart(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {

            this.applyPattern(layer, cell.tx, cell.ty);
        }

        protected onStrokeDrag(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, from: { tx: number, ty: number }, to: { tx: number, ty: number }) {

            this.forEachLineCell(from.tx, from.ty, to.tx, to.ty, (tx, ty) => {

                this.applyPattern(layer, tx, ty);
            });
        }

        protected onStrokeStop(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {
            // nothing, the stroke was painted in the start/drag events
        }
    }
}
