namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The Rectangular Fill tool: drag a rectangle and fill it with the brush
     * pattern, tiled from the origin of the rectangle.
     */
    export class TilemapRectFillTool extends EditableTilemapTool {

        static ID = "phasereditor2d.scene.ui.sceneobjects.TilemapRectFillTool";

        private _startCell: { tx: number, ty: number };
        private _currentCell: { tx: number, ty: number };

        constructor() {
            super(TilemapRectFillTool.ID, editor.commands.CMD_EDIT_TILEMAP_RECT_FILL);
        }

        protected canStartOutsideLayer(): boolean {

            return true;
        }

        protected onStrokeStart(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {

            this._startCell = { ...cell };
            this._currentCell = { ...cell };
        }

        protected onStrokeDrag(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, from: { tx: number, ty: number }, to: { tx: number, ty: number }) {

            this._currentCell = { ...to };

            args.editor.repaint();
        }

        protected onStrokeStop(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number }) {

            if (!this._startCell) {

                return;
            }

            const a = this._startCell;
            const b = this._currentCell ?? cell;

            const tx = Math.min(a.tx, b.tx);
            const ty = Math.min(a.ty, b.ty);
            const w = Math.abs(b.tx - a.tx) + 1;
            const h = Math.abs(b.ty - a.ty) + 1;

            const pattern = EditableTilemapBrush.getPattern(layer.getTilemap().getScene());

            if (pattern.length === 0) {

                this._startCell = null;

                return;
            }

            for (let y = 0; y < h; y++) {

                for (let x = 0; x < w; x++) {

                    const gid = pattern[y % pattern.length][x % pattern[0].length];

                    if (gid >= 0) {

                        this.setCellGid(layer, tx + x, ty + y, gid);
                    }
                }
            }

            this._startCell = null;
            this._currentCell = null;
        }

        protected renderTool(args: editor.tools.ISceneToolRenderArgs, layer: EditableTilemapLayer) {

            if (!this._startCell || !layer) {

                return;
            }

            const ctx = args.canvasContext;

            const a = this._startCell;
            const b = this._currentCell ?? a;

            const tx = Math.min(a.tx, b.tx);
            const ty = Math.min(a.ty, b.ty);
            const w = Math.abs(b.tx - a.tx) + 1;
            const h = Math.abs(b.ty - a.ty) + 1;

            const p1 = EditableTilemapToolUtils.tileToScreen(args.editor, layer, tx, ty);
            const p2 = EditableTilemapToolUtils.tileToScreen(args.editor, layer, tx + w, ty + h);

            ctx.save();

            ctx.strokeStyle = "#29adff";
            ctx.fillStyle = "#29adff30";
            ctx.lineWidth = 2;

            ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);

            ctx.restore();
        }
    }
}
