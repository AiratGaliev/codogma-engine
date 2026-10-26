namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * Shared helpers for the tilemap editing tools.
     */
    export class EditableTilemapToolUtils {

        /**
         * Check if the tilemap editing mode is active:
         * the selection contains an editable tilemap or an editable tilemap layer.
         */
        static isEditingTilemap(editor: editor.SceneEditor): boolean {

            return editor.getSelection().some(obj =>
                obj instanceof EditableTilemap
                || obj instanceof EditableTilemapLayer);
        }

        /**
         * The layer where the tools paint: the layer of the palette brush state,
         * or the selected editable tilemap layer.
         */
        static getPaintLayer(editor: editor.SceneEditor): EditableTilemapLayer {

            const scene = editor.getScene();

            const layer = EditableTilemapBrush.getTargetLayer(scene);

            if (layer) {

                return layer;
            }

            return editor.getSelection()
                .find(obj => obj instanceof EditableTilemapLayer) as EditableTilemapLayer
                ?? null;
        }

        /**
         * The size of a tile of the layer, in world units (it includes the layer scale).
         */
        static getTileSize(layer: EditableTilemapLayer) {

            return {
                tw: layer.layer.baseTileWidth * layer.scaleX,
                th: layer.layer.baseTileHeight * layer.scaleY
            };
        }

        /**
         * Convert a world point into the tile coordinates of the layer.
         */
        static worldToTile(layer: EditableTilemapLayer, worldX: number, worldY: number) {

            const { tw, th } = EditableTilemapToolUtils.getTileSize(layer);

            return {
                tx: Math.floor((worldX - layer.x) / tw),
                ty: Math.floor((worldY - layer.y) / th)
            };
        }

        /**
         * Convert a screen point into the tile coordinates of the layer.
         */
        static screenToTile(editor: editor.SceneEditor, layer: EditableTilemapLayer, screenX: number, screenY: number) {

            const worldPoint = editor.getScene().getCamera().getWorldPoint(screenX, screenY);

            return EditableTilemapToolUtils.worldToTile(layer, worldPoint.x, worldPoint.y);
        }

        /**
         * The screen point of the top-left corner of a cell of the layer.
         */
        static tileToScreen(editor: editor.SceneEditor, layer: EditableTilemapLayer, tx: number, ty: number) {

            const { tw, th } = EditableTilemapToolUtils.getTileSize(layer);

            return editor.getScene().getCamera().getScreenPoint(layer.x + tx * tw, layer.y + ty * th);
        }

        /**
         * Check if a tile point is within the bounds of the layer.
         */
        static isInLayer(layer: EditableTilemapLayer, tx: number, ty: number) {

            const info = layer.getLayerInfo();

            if (!info) {

                return false;
            }

            return tx >= 0 && ty >= 0 && tx < info.width && ty < info.height;
        }

        /**
         * Write a value into a cell of the layer data (the single source of truth)
         * and update the tile of the Phaser layer.
         *
         * @returns `true` if the data changed.
         */
        static setCellGid(layer: EditableTilemapLayer, tx: number, ty: number, gid: number): boolean {

            const info = layer.getLayerInfo();

            if (!info || !EditableTilemapToolUtils.isInLayer(layer, tx, ty)) {

                return false;
            }

            if (info.data[ty][tx] === gid) {

                return false;
            }

            info.data[ty][tx] = gid;

            if (gid >= 1) {

                layer.putTileAt(gid, tx, ty);

            } else {

                layer.removeTileAt(tx, ty);
            }

            return true;
        }

        /**
         * Write a brush pattern into the layer, anchored at the given cell.
         * The pattern cells with a gid of `-1` are ignored.
         *
         * @returns `true` if the data changed.
         */
        static applyPattern(layer: EditableTilemapLayer, pattern: number[][], tx0: number, ty0: number): boolean {

            let changed = false;

            for (let py = 0; py < pattern.length; py++) {

                for (let px = 0; px < pattern[py].length; px++) {

                    const gid = pattern[py][px];

                    if (gid < 0) {

                        continue;
                    }

                    changed = EditableTilemapToolUtils.setCellGid(layer, tx0 + px, ty0 + py, gid) || changed;
                }
            }

            return changed;
        }

        /**
         * The tile image of a global tile id, to be drawn in the tools overlay.
         */
        static getTileImage(scene: Scene, tilemap: EditableTilemap, gid: number): {
            image: HTMLImageElement | HTMLCanvasElement,
            sx: number, sy: number, sw: number, sh: number
        } {

            const info = EditableTilemap.getTileTextureRect(tilemap, gid);

            if (!info || !info.tileset.imageKey) {

                return null;
            }

            if (!scene.sys.textures.exists(info.tileset.imageKey)) {

                return null;
            }

            const texture = scene.sys.textures.get(info.tileset.imageKey);

            const sourceImage = texture.getSourceImage() as (HTMLImageElement | HTMLCanvasElement);

            if (!sourceImage) {

                return null;
            }

            const tileset = info.tileset;

            return {
                image: sourceImage,
                sx: tileset.margin + info.localX * (tileset.tileWidth + tileset.spacing),
                sy: tileset.margin + info.localY * (tileset.tileHeight + tileset.spacing),
                sw: tileset.tileWidth,
                sh: tileset.tileHeight
            };
        }

        /**
         * Render the "edit tilemap" mode: an orange border and the tile grid
         * around the painted layer.
         */
        static renderEditMode(editor: editor.SceneEditor, ctx: CanvasRenderingContext2D, layer: EditableTilemapLayer) {

            if (!layer) {

                return;
            }

            const camera = editor.getScene().getCamera();

            const a = camera.getScreenPoint(layer.x, layer.y);

            const b = camera.getScreenPoint(
                layer.x + layer.width * layer.scaleX,
                layer.y + layer.height * layer.scaleY);

            // border

            ctx.save();

            ctx.strokeStyle = "#ff8000";
            ctx.lineWidth = 3;

            ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);

            ctx.strokeStyle = "#00000060";
            ctx.lineWidth = 1;

            ctx.strokeRect(a.x - 1, a.y - 1, b.x - a.x + 2, b.y - a.y + 2);

            ctx.restore();

            // grid

            const info = layer.getLayerInfo();

            const tw = layer.getTilemap().getTileWidth();
            const th = layer.getTilemap().getTileHeight();

            if (!info || tw * camera.zoom < 8 || th * camera.zoom < 8) {

                return;
            }

            ctx.save();

            ctx.strokeStyle = "#00000040";
            ctx.lineWidth = 1;

            for (let x = 1; x < info.width; x++) {

                const p = camera.getScreenPoint(layer.x + x * tw, layer.y);

                ctx.beginPath();
                ctx.moveTo(p.x, a.y);
                ctx.lineTo(p.x, b.y);
                ctx.stroke();
            }

            for (let y = 1; y < info.height; y++) {

                const p = camera.getScreenPoint(layer.x, layer.y + y * th);

                ctx.beginPath();
                ctx.moveTo(a.x, p.y);
                ctx.lineTo(b.x, p.y);
                ctx.stroke();
            }

            ctx.restore();
        }

        /**
         * Render the preview of the brush pattern, anchored at the given cell.
         */
        static renderBrushPreview(editor: editor.SceneEditor, ctx: CanvasRenderingContext2D,
            layer: EditableTilemapLayer, tx: number, ty: number) {

            if (!layer) {

                return;
            }

            const scene = editor.getScene();

            const tilemap = layer.getTilemap();

            const pattern = EditableTilemapBrush.getPattern(scene);

            if (pattern.length === 0) {

                return;
            }

            ctx.save();

            ctx.globalAlpha = 0.7;

            for (let py = 0; py < pattern.length; py++) {

                for (let px = 0; px < pattern[py].length; px++) {

                    const gid = pattern[py][px];

                    if (gid < 0) {

                        continue;
                    }

                    const cell = EditableTilemapToolUtils.tileToScreen(editor, layer, tx + px, ty + py);

                    const next = EditableTilemapToolUtils.tileToScreen(editor, layer, tx + px + 1, ty + py + 1);

                    const tileImage = EditableTilemapToolUtils.getTileImage(scene, tilemap, gid);

                    if (tileImage) {

                        ctx.drawImage(tileImage.image,
                            tileImage.sx, tileImage.sy, tileImage.sw, tileImage.sh,
                            cell.x, cell.y, next.x - cell.x, next.y - cell.y);
                    }
                }
            }

            ctx.restore();
        }
    }
}
