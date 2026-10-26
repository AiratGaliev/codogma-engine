namespace phasereditor2d.scene.ui.sceneobjects {

    export class EditableTilemapLayer extends Phaser.Tilemaps.TilemapLayer implements ISceneGameObject {

        private _editableTilemap: EditableTilemap;
        private _layerName: string;
        private _editorSupport: EditableTilemapLayerEditorSupport;

        constructor(scene: Scene, tilemap: EditableTilemap, layerName: string) {

            const phaserTilemap = EditableTilemapLayer.buildPhaserTilemap(scene, tilemap);

            const layerIndex = phaserTilemap.getLayerIndex(layerName) ?? 0;

            super(scene, phaserTilemap, layerIndex, phaserTilemap.tilesets, 0, 0);

            this.setRenderOrder(phaserTilemap.renderOrder);

            this.setOrigin(0, 0);

            // we do this to prevent a wrong culling when the camera is scrolled and zoomed.
            this.setCullPadding(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

            this._editableTilemap = tilemap;
            this._layerName = layerName;
            this._editorSupport = new EditableTilemapLayerEditorSupport(this, scene);
        }

        getTilemap() {

            return this._editableTilemap;
        }

        getLayerName() {

            return this._layerName;
        }

        setLayerName(layerName: string) {

            this._layerName = layerName;
        }

        /**
         * The info of the layer in the tilemap plain object.
         */
        getLayerInfo(): IEditableLayerInfo {

            return this._editableTilemap.getLayerInfoByName(this._layerName);
        }

        getEditorSupport(): EditableTilemapLayerEditorSupport {

            return this._editorSupport;
        }

        /**
         * Find the layer game object of a tilemap with the given layer name.
         */
        static findLayerObject(scene: Scene, tilemap: EditableTilemap, layerName: string): EditableTilemapLayer {

            let found: EditableTilemapLayer = null;

            scene.visitAll(obj => {

                if (found) {

                    return;
                }

                if (obj instanceof EditableTilemapLayer) {

                    const es = obj.getEditorSupport ? obj.getEditorSupport() : null;

                    if (es && obj.getTilemap() === tilemap && obj.getLayerName() === layerName) {

                        found = obj;
                    }
                }
            });

            return found;
        }

        /**
         * Build (or rebuild) the Phaser.Tilemaps.Tilemap of the editable tilemap,
         * injecting its Tiled-format data into the tilemap cache of the scene.
         */
        static buildPhaserTilemap(scene: Scene, tilemap: EditableTilemap): Phaser.Tilemaps.Tilemap {

            const key = EditableTilemap.getCacheKey(tilemap);

            const cache = scene.cache.tilemap;

            if (cache.exists(key)) {

                cache.remove(key);
            }

            cache.add(key, {
                format: Phaser.Tilemaps.Formats.TILED_JSON,
                data: EditableTilemap.buildTiledJSON(tilemap) as any
            });

            const map = scene.make.tilemap({ key });

            EditableTilemapLayer.attachTilesetTextures(scene, tilemap, map);

            return map;
        }

        /**
         * Attach the textures of the tilesets of the editable tilemap
         * to the given Phaser tilemap, so the tiles are rendered.
         */
        static attachTilesetTextures(scene: Scene, tilemap: EditableTilemap, map: Phaser.Tilemaps.Tilemap) {

            for (const tileset of tilemap.getTilesets()) {

                if (tileset.imageKey && scene.sys.textures.exists(tileset.imageKey)) {

                    map.addTilesetImage(tileset.name, tileset.imageKey);
                }
            }
        }

        /**
         * Rebuild the underlying Phaser tilemap (its Tiled-format data, with the
         * current tilesets) and rebind this layer to it, then sync the tiles.
         *
         * It is called when the tilesets of the map change (add, remove, edit).
         * We rebuild instead of just calling `addTilesetImage` because Phaser
         * rejects tileset names that are not present in the parsed Tiled data.
         */
        refresh() {

            const scene = this.scene as Scene;

            const tilemap = this.getTilemap();

            const newMap = EditableTilemapLayer.buildPhaserTilemap(scene, tilemap);

            const layerIndex = newMap.getLayerIndex(this.getLayerName()) ?? 0;

            // rebind the Phaser layer internals to the fresh map

            this.tilemap = newMap;

            this.layerIndex = layerIndex;

            this.layer = newMap.layers[layerIndex];

            if (this.layer) {

                this.layer.tilemapLayer = this;
            }

            // setTilesets is public at runtime, but not declared in the Phaser types.

            (this as any).setTilesets(newMap.tilesets);

            this.syncTilesFromData();
        }

        /**
         * Update the tiles of this layer to match the data of the layer info
         * (the single source of truth, in the tilemap plain object).
         */
        syncTilesFromData() {

            const layerInfo = this.getLayerInfo();

            if (!layerInfo) {

                return;
            }

            for (let y = 0; y < layerInfo.height; y++) {

                for (let x = 0; x < layerInfo.width; x++) {

                    const gid = layerInfo.data[y] && layerInfo.data[y][x] !== undefined ? layerInfo.data[y][x] : -1;

                    const tile = this.getTileAt(x, y);

                    if (gid >= 1) {

                        if (!tile || tile.index !== gid) {

                            this.putTileAt(gid, x, y);
                        }

                    } else if (tile) {

                        this.removeTileAt(x, y);
                    }
                }
            }
        }

        destroy() {

            super.destroy(true);
        }
    }
}
