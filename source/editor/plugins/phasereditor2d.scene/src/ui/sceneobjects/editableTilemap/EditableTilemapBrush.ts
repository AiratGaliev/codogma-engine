namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The state of the brush used by the tilemap editing tools.
     *
     * A brush is a rectangular portion of a tileset. The state is kept in a
     * session store (this static class), so the palette section and the tools
     * can share it.
     */
    export class EditableTilemapBrush {

        static _tilemapId: string;
        static _tilesetName: string;
        static _layerName: string;
        static _rect = { x: 0, y: 0, w: 1, h: 1 };

        /**
         * A brush pattern captured from the map (Rectangular Selection tool),
         * with the same shape of the layer data: rows of global tile ids.
         * When it is set, the pattern is used as brush, instead of the tileset rect.
         */
        static _pattern: number[][];
        static _patternOrigin = { x: 0, y: 0 };

        /**
         * The id of the tilemap plain object that is being edited.
         */
        static getTilemapId() {

            return this._tilemapId;
        }

        static setTilemapId(id: string) {

            this._tilemapId = id;
        }

        /**
         * The name of the tileset used as brush source.
         */
        static getTilesetName() {

            return this._tilesetName;
        }

        static setTilesetName(name: string) {

            this._tilesetName = name;
        }

        /**
         * The name of the layer where the tools paint.
         */
        static getLayerName() {

            return this._layerName;
        }

        static setLayerName(name: string) {

            this._layerName = name;
        }

        /**
         * The brush rect, in tile coordinates of the tileset.
         */
        static getRect() {

            return { ...this._rect };
        }

        static setRect(x: number, y: number, w: number, h: number) {

            this._rect = { x, y, w: Math.max(1, w), h: Math.max(1, h) };
        }

        /**
         * Get the tilemap of the state in the given scene.
         */
        static getTilemap(scene: Scene): EditableTilemap {

            if (!this._tilemapId) {

                return null;
            }

            const obj = scene.getPlainObjectById(this._tilemapId);

            return obj instanceof EditableTilemap ? obj : null;
        }

        /**
         * Get the tileset of the state.
         */
        static getTileset(tilemap: EditableTilemap): IEditableTilesetInfo {

            if (!tilemap || !this._tilesetName) {

                return null;
            }

            return tilemap.getTilesetByName(this._tilesetName);
        }

        /**
         * Get the layer game object where the tools paint.
         */
        static getTargetLayer(scene: Scene): EditableTilemapLayer {

            const tilemap = this.getTilemap(scene);

            if (!tilemap || !this._layerName) {

                return null;
            }

            return EditableTilemapLayer.findLayerObject(scene, tilemap, this._layerName);
        }

        /**
         * Set a brush pattern captured from the map cells (Rectangular Selection tool).
         * `null` clears the captured pattern, and the tileset rect is used again.
         */
        static setPattern(pattern: number[][], originX: number, originY: number) {

            this._pattern = pattern ? pattern.map(row => [...row]) : null;
            this._patternOrigin = { x: originX, y: originY };
        }

        static getPatternOverride() {

            return this._pattern;
        }

        /**
         * The brush pattern: a 2D array of global tile ids.
         *
         * It is the pattern captured from the map (if any), or the tiles
         * of the rect selected in the tileset of the palette.
         */
        static getPattern(scene: Scene): number[][] {

            if (this._pattern) {

                return this._pattern.map(row => [...row]);
            }

            const tilemap = this.getTilemap(scene);

            const tileset = this.getTileset(tilemap);

            if (!tilemap || !tileset || !tileset.imageKey) {

                return [];
            }

            const { imageWidth, imageHeight } = EditableTilemap.getTilesetImageSize(tileset, scene);

            const columns = Math.floor(
                (imageWidth - tileset.margin * 2 + tileset.spacing) / (tileset.tileWidth + tileset.spacing));

            const rows = Math.floor(
                (imageHeight - tileset.margin * 2 + tileset.spacing) / (tileset.tileHeight + tileset.spacing));

            if (columns <= 0 || rows <= 0) {

                return [];
            }

            const rect = this.getRect();

            const pattern: number[][] = [];

            for (let y = 0; y < rect.h; y++) {

                const row: number[] = [];

                for (let x = 0; x < rect.w; x++) {

                    const tileX = rect.x + x;
                    const tileY = rect.y + y;

                    let gid = -1;

                    if (tileX >= 0 && tileY >= 0 && tileX < columns && tileY < rows) {

                        gid = tileset.firstgid + tileY * columns + tileX;
                    }

                    row.push(gid);
                }

                pattern.push(row);
            }

            return pattern;
        }
    }
}
