namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The base class of the tilemap editing tools (Stamp, Bucket Fill, Rect Fill,
     * Eraser, Rectangular Selection).
     *
     * These tools are active when an editable tilemap or an editable tilemap layer
     * is selected ("edit tilemap" mode), and paint on the layer selected in the
     * Tilemap Palette.
     *
     * Each pointer stroke is one undoable operation on the layer data.
     */
    export abstract class EditableTilemapTool extends editor.tools.SceneTool {

        protected _strokeOp: EditTilemapLayerDataOperation;
        protected _strokeLayer: EditableTilemapLayer;
        protected _strokeChanged: boolean;
        protected _lastCell: { tx: number, ty: number };

        constructor(toolId: string, commandId: string) {
            super({
                id: toolId,
                command: commandId
            });
        }

        isObjectTool() {

            return false;
        }

        requiresRepaintOnMouseMove() {

            return true;
        }

        canEdit(obj: unknown): boolean {

            return false;
        }

        canRender(obj: unknown): boolean {

            return false;
        }

        /**
         * If the tool shows the preview of the brush pattern at the mouse position.
         */
        protected showBrushPreview(): boolean {

            return false;
        }

        /**
         * If the stroke can start at a cell outside the bounds of the layer.
         */
        protected canStartOutsideLayer(): boolean {

            return false;
        }

        onStartDrag(args: editor.tools.ISceneToolDragEventArgs) {

            if (!EditableTilemapToolUtils.isEditingTilemap(args.editor)) {

                return;
            }

            const layer = EditableTilemapToolUtils.getPaintLayer(args.editor);

            if (!layer) {

                return;
            }

            const cell = EditableTilemapToolUtils.screenToTile(args.editor, layer, args.x, args.y);

            if (!EditableTilemapToolUtils.isInLayer(layer, cell.tx, cell.ty)
                && !this.canStartOutsideLayer()) {

                return;
            }

            this._strokeOp = new EditTilemapLayerDataOperation(args.editor, layer);
            this._strokeLayer = layer;
            this._strokeChanged = false;
            this._lastCell = cell;

            this.onStrokeStart(args, layer, cell);
        }

        onDrag(args: editor.tools.ISceneToolDragEventArgs) {

            if (!this._strokeOp) {

                return;
            }

            const cell = EditableTilemapToolUtils.screenToTile(args.editor, this._strokeLayer, args.x, args.y);

            if (this._lastCell && this._lastCell.tx === cell.tx && this._lastCell.ty === cell.ty) {

                return;
            }

            const from = this._lastCell ?? cell;

            this._lastCell = cell;

            this.onStrokeDrag(args, this._strokeLayer, from, cell);
        }

        onStopDrag(args: editor.tools.ISceneToolDragEventArgs) {

            if (!this._strokeOp) {

                return;
            }

            const cell = EditableTilemapToolUtils.screenToTile(args.editor, this._strokeLayer, args.x, args.y);

            this.onStrokeStop(args, this._strokeLayer, cell);

            if (this._strokeChanged) {

                args.editor.getUndoManager().add(this._strokeOp);
            }

            this._strokeOp = null;
            this._strokeLayer = null;
            this._lastCell = null;

            args.editor.repaint();
        }

        /**
         * Write a cell of the layer data, marking the stroke as changed.
         */
        protected setCellGid(layer: EditableTilemapLayer, tx: number, ty: number, gid: number) {

            const changed = EditableTilemapToolUtils.setCellGid(layer, tx, ty, gid);

            this._strokeChanged = this._strokeChanged || changed;

            return changed;
        }

        /**
         * Write a brush pattern into the layer, anchored at the given cell.
         */
        protected applyPattern(layer: EditableTilemapLayer, tx0: number, ty0: number) {

            const pattern = EditableTilemapBrush.getPattern(this.getScene());

            if (pattern.length === 0) {

                return false;
            }

            return this._applyPattern(layer, pattern, tx0, ty0);
        }

        /**
         * Write the given pattern into the layer, anchored at the given cell.
         */
        protected _applyPattern(layer: EditableTilemapLayer, pattern: number[][], tx0: number, ty0: number) {

            const changed = EditableTilemapToolUtils.applyPattern(layer, pattern, tx0, ty0);

            this._strokeChanged = this._strokeChanged || changed;

            return changed;
        }

        /**
         * The scene of the current stroke.
         */
        protected getScene(): Scene {

            return this._strokeLayer ? this._strokeLayer.scene as Scene : null;
        }

        /**
         * Walk the cells of the line between two points.
         */
        protected forEachLineCell(x0: number, y0: number, x1: number, y1: number,
            cb: (tx: number, ty: number) => void) {

            const dx = Math.abs(x1 - x0);
            const dy = Math.abs(y1 - y0);

            const sx = Math.sign(x1 - x0);
            const sy = Math.sign(y1 - y0);

            let err = dx - dy;

            let x = x0;
            let y = y0;

            for (; ;) {

                cb(x, y);

                if (x === x1 && y === y1) {

                    break;
                }

                const e2 = 2 * err;

                if (e2 > -dy) {

                    err -= dy;
                    x += sx;
                }

                if (e2 < dx) {

                    err += dx;
                    y += sy;
                }
            }
        }

        /**
         * Flood the connected cells with the same tile id, filling them with the
         * brush pattern, tiled from the given point.
         */
        protected floodFill(layer: EditableTilemapLayer, tx: number, ty: number, erase: boolean) {

            const info = layer.getLayerInfo();

            if (!info || !EditableTilemapToolUtils.isInLayer(layer, tx, ty)) {

                return;
            }

            const pattern = erase ? null : EditableTilemapBrush.getPattern(this.getScene());

            if (!erase && pattern.length === 0) {

                return;
            }

            const target = info.data[ty][tx];

            const pw = pattern ? pattern[0].length : 1;
            const ph = pattern ? pattern.length : 1;

            const visited = new Set<number>();

            const stack: Array<{ tx: number, ty: number }> = [{ tx, ty }];

            while (stack.length > 0) {

                const cell = stack.pop();

                if (!EditableTilemapToolUtils.isInLayer(layer, cell.tx, cell.ty)) {

                    continue;
                }

                const key = cell.ty * info.width + cell.tx;

                if (visited.has(key)) {

                    continue;
                }

                visited.add(key);

                if (info.data[cell.ty][cell.tx] !== target) {

                    continue;
                }

                if (erase) {

                    this.setCellGid(layer, cell.tx, cell.ty, -1);

                } else {

                    const px = ((cell.tx - tx) % pw + pw) % pw;
                    const py = ((cell.ty - ty) % ph + ph) % ph;

                    const gid = pattern[py][px];

                    if (gid >= 0) {

                        this.setCellGid(layer, cell.tx, cell.ty, gid);
                    }
                }

                stack.push(
                    { tx: cell.tx + 1, ty: cell.ty },
                    { tx: cell.tx - 1, ty: cell.ty },
                    { tx: cell.tx, ty: cell.ty + 1 },
                    { tx: cell.tx, ty: cell.ty - 1 });
            }
        }

        render(args: editor.tools.ISceneToolRenderArgs) {

            if (!EditableTilemapToolUtils.isEditingTilemap(args.editor)) {

                return;
            }

            const layer = EditableTilemapToolUtils.getPaintLayer(args.editor);

            EditableTilemapToolUtils.renderEditMode(args.editor, args.canvasContext, layer);

            if (this.showBrushPreview() && layer) {

                const mouse = args.editor.getMouseManager().getMousePosition();

                const cell = EditableTilemapToolUtils.screenToTile(args.editor, layer, mouse.x, mouse.y);

                EditableTilemapToolUtils.renderBrushPreview(
                    args.editor, args.canvasContext, layer, cell.tx, cell.ty);
            }

            this.renderTool(args, layer);
        }

        /**
         * Render the tool-specific overlay.
         */
        protected renderTool(args: editor.tools.ISceneToolRenderArgs, layer: EditableTilemapLayer) {
            // nothing by default
        }

        protected abstract onStrokeStart(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number });

        protected abstract onStrokeDrag(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, from: { tx: number, ty: number }, to: { tx: number, ty: number });

        protected abstract onStrokeStop(args: editor.tools.ISceneToolDragEventArgs,
            layer: EditableTilemapLayer, cell: { tx: number, ty: number });
    }
}
