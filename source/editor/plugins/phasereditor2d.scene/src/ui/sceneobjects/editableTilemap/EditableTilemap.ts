namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * The info of a tileset of an editable tilemap.
     *
     * The `imageKey` is the key of an image or spritesheet asset of the project.
     * The `firstgid` is the global id of the first tile of the tileset,
     * following the Tiled semantics: the tilesets are concatenated and the
     * global tile ids are 1-based.
     */
    export interface IEditableTilesetInfo {

        name: string;
        imageKey?: string;
        tileWidth: number;
        tileHeight: number;
        margin: number;
        spacing: number;
        firstgid: number;
    }

    /**
     * The info of a layer of an editable tilemap.
     *
     * The `data` is the single source of truth of the tiles of the layer.
     * It is an array of rows of global tile ids: 1-based index within the
     * concatenated tilesets, `-1` = empty cell.
     * The layer game objects reference it by the tilemap's id + the layer name.
     */
    export interface IEditableLayerInfo {

        id: string;
        name: string;
        width: number;
        height: number;
        data: number[][];
    }

    export class EditableTilemap implements IScenePlainObject {

        private _scene: Scene;
        private _tileWidth: number;
        private _tileHeight: number;
        private _tilesets: IEditableTilesetInfo[];
        private _layers: IEditableLayerInfo[];
        private _editorSupport: EditableTilemapEditorSupport;

        constructor(scene: Scene, tileWidth: number, tileHeight: number) {

            this._scene = scene;
            this._tileWidth = tileWidth;
            this._tileHeight = tileHeight;
            this._tilesets = [];
            this._layers = [];
            this._editorSupport = new EditableTilemapEditorSupport(scene, this);
        }

        getScene() {

            return this._scene;
        }

        getTileWidth() {

            return this._tileWidth;
        }

        setTileWidth(tileWidth: number) {

            this._tileWidth = tileWidth;
        }

        getTileHeight() {

            return this._tileHeight;
        }

        setTileHeight(tileHeight: number) {

            this._tileHeight = tileHeight;
        }

        getTilesets() {

            return this._tilesets;
        }

        getLayers() {

            return this._layers;
        }

        getLayerInfoByName(name: string) {

            return this._layers.find(layer => layer.name === name);
        }

        getTilesetByName(name: string) {

            return this._tilesets.find(tileset => tileset.name === name);
        }

        getEditorSupport() {

            return this._editorSupport;
        }

        /**
         * Compute the number of tiles of a tileset, given the size of its image.
         */
        static computeTilesetTileCount(tileset: IEditableTilesetInfo, imageWidth: number, imageHeight: number) {

            if (!imageWidth || !imageHeight) {

                return 0;
            }

            const columns = Math.floor(
                (imageWidth - tileset.margin * 2 + tileset.spacing) / (tileset.tileWidth + tileset.spacing));

            const rows = Math.floor(
                (imageHeight - tileset.margin * 2 + tileset.spacing) / (tileset.tileHeight + tileset.spacing));

            if (columns <= 0 || rows <= 0) {

                return 0;
            }

            return columns * rows;
        }

        /**
         * Compute the number of tiles of a tileset, using the textures of the given scene.
         */
        static getTilesetTileCount(tileset: IEditableTilesetInfo, scene: Scene) {

            const { imageWidth, imageHeight } = EditableTilemap.getTilesetImageSize(tileset, scene);

            return EditableTilemap.computeTilesetTileCount(tileset, imageWidth, imageHeight);
        }

        /**
         * Get the size of the image of a tileset, looking it up in the textures of the scene.
         */
        static getTilesetImageSize(tileset: IEditableTilesetInfo, scene: Scene): { imageWidth: number, imageHeight: number } {

            if (tileset.imageKey && scene.sys.textures.exists(tileset.imageKey)) {

                const texture = scene.sys.textures.get(tileset.imageKey);

                const source = texture.source[0];

                if (source) {

                    return { imageWidth: source.width, imageHeight: source.height };
                }
            }

            return { imageWidth: 0, imageHeight: 0 };
        }

        /**
         * Recompute the `firstgid` of all the tilesets, following the Tiled semantics:
         * the firstgid of a tileset is `1` plus the sum of the tiles count of the previous tilesets.
         */
        static recomputeFirstGids(tilemap: EditableTilemap) {

            const scene = tilemap.getScene();

            let gid = 1;

            for (const tileset of tilemap.getTilesets()) {

                tileset.firstgid = gid;

                gid += EditableTilemap.getTilesetTileCount(tileset, scene);
            }
        }

        /**
         * Remap the tile ids of all the layers of the map, after a change in the tilesets
         * (a tileset was added, deleted, or its tiles count changed).
         *
         * The mapping is an array with one entry per NEW tileset layout:
         * the tiles in the range `[oldFirstgid, oldFirstgid + oldTileCount)` are moved
         * to the range starting at `newFirstgid`, or deleted when the entry is `undefined`.
         */
        static remapLayerTiles(tilemap: EditableTilemap,
            mapping: Array<{ oldFirstgid: number, oldTileCount: number, newFirstgid: number } | undefined>) {

            for (const layer of tilemap.getLayers()) {

                for (let y = 0; y < layer.height; y++) {

                    const row = layer.data[y];

                    if (!row) {

                        continue;
                    }

                    for (let x = 0; x < row.length; x++) {

                        const gid = row[x];

                        if (gid < 1) {

                            continue;
                        }

                        let newGid = -1;

                        for (const entry of mapping) {

                            if (entry
                                && gid >= entry.oldFirstgid
                                && gid < entry.oldFirstgid + entry.oldTileCount) {

                                newGid = entry.newFirstgid + (gid - entry.oldFirstgid);

                                break;
                            }
                        }

                        row[x] = newGid;
                    }
                }
            }
        }

        /**
         * Resize a layer, preserving the existing data.
         */
        static resizeLayer(layer: IEditableLayerInfo, width: number, height: number) {

            const newData: number[][] = [];

            for (let y = 0; y < height; y++) {

                const row: number[] = [];

                for (let x = 0; x < width; x++) {

                    const oldRow = layer.data[y];

                    row.push(oldRow && x < oldRow.length ? oldRow[x] : -1);
                }

                newData.push(row);
            }

            layer.width = width;
            layer.height = height;
            layer.data = newData;
        }

        /**
         * Flatten the rows of a layer data into a Tiled-format array (row-major).
         *
         * The internal representation uses `-1` for empty cells, but the Tiled format
         * uses `0` for empty cells, so the values are remapped here.
         */
        static flattenLayerData(layer: IEditableLayerInfo) {

            const flat: number[] = [];

            for (let y = 0; y < layer.height; y++) {

                const row = layer.data[y] ?? [];

                for (let x = 0; x < layer.width; x++) {

                    const gid = row[x] === undefined ? -1 : row[x];

                    flat.push(gid < 1 ? 0 : gid);
                }
            }

            return flat;
        }

        /**
         * Build the Tiled-format JSON of the tilemap, to be injected into the tilemap cache
         * or to be embedded into the generated code.
         *
         * The image size and tiles count of each tileset are computed from the textures
         * currently loaded in the scene. The tilesets with no (loaded) image are skipped.
         */
        static buildTiledJSON(tilemap: EditableTilemap) {

            const scene = tilemap.getScene();

            const tilesetsJSON = [];

            for (const tileset of tilemap.getTilesets()) {

                if (!tileset.imageKey) {

                    continue;
                }

                const { imageWidth, imageHeight } = EditableTilemap.getTilesetImageSize(tileset, scene);

                const tileCount = EditableTilemap.computeTilesetTileCount(tileset, imageWidth, imageHeight);

                if (tileCount === 0) {

                    continue;
                }

                tilesetsJSON.push({
                    columns: Math.floor(
                        (imageWidth - tileset.margin * 2 + tileset.spacing) / (tileset.tileWidth + tileset.spacing)),
                    margin: tileset.margin,
                    spacing: tileset.spacing,
                    tilewidth: tileset.tileWidth,
                    tileheight: tileset.tileHeight,
                    tilecount: tileCount,
                    firstgid: tileset.firstgid,
                    image: tileset.imageKey,
                    name: tileset.name,
                    imagewidth: imageWidth,
                    imageheight: imageHeight
                });
            }

            let width = 0;
            let height = 0;

            for (const layer of tilemap.getLayers()) {

                width = Math.max(width, layer.width);
                height = Math.max(height, layer.height);
            }

            const layersJSON = tilemap.getLayers().map(layer => ({
                type: "tilelayer",
                name: layer.name,
                width: layer.width,
                height: layer.height,
                opacity: 1,
                visible: true,
                data: EditableTilemap.flattenLayerData(layer)
            }));

            return {
                width,
                height,
                orientation: "orthogonal",
                tilewidth: tilemap.getTileWidth(),
                tileheight: tilemap.getTileHeight(),
                tilesets: tilesetsJSON,
                layers: layersJSON
            };
        }

        /**
         * Apply a change in the tilesets of the map (a tileset was added, deleted,
         * or its parameters changed), and update the ID of the tiles of every layer,
         * following the Tiled global-id semantics.
         *
         * The `mutate` callback must modify the tilesets of the map
         * (add, remove or change a tileset).
         */
        static updateTilesetsAndRebase(tilemap: EditableTilemap, mutate: () => void) {

            const scene = tilemap.getScene();

            const oldLayout = tilemap.getTilesets().map(ts => ({
                ts,
                oldFirstgid: ts.firstgid,
                oldTileCount: EditableTilemap.getTilesetTileCount(ts, scene)
            }));

            mutate();

            EditableTilemap.recomputeFirstGids(tilemap);

            const mapping = oldLayout.map(entry =>
                tilemap.getTilesets().indexOf(entry.ts) >= 0
                    ? {
                        oldFirstgid: entry.oldFirstgid,
                        oldTileCount: entry.oldTileCount,
                        newFirstgid: entry.ts.firstgid
                    }
                    : undefined);

            EditableTilemap.remapLayerTiles(tilemap, mapping);

            EditableTilemap.refreshLayerObjects(tilemap);
        }

        /**
         * Refresh the layer game objects of the tilemap (re-attach the tileset
         * textures and sync the tiles with the data), after a change in the tilesets.
         */
        static refreshLayerObjects(tilemap: EditableTilemap) {

            const scene = tilemap.getScene();

            for (const layer of tilemap.getLayers()) {

                const layerObj = EditableTilemapLayer.findLayerObject(scene, tilemap, layer.name);

                if (layerObj) {

                    layerObj.refresh();
                }
            }
        }

        /**
         * Get the tileset that contains the tile with the given global id.
         */
        static getTilesetForGid(tilemap: EditableTilemap, gid: number): IEditableTilesetInfo {

            if (gid < 1) {

                return null;
            }

            for (const tileset of tilemap.getTilesets()) {

                const count = EditableTilemap.getTilesetTileCount(tileset, tilemap.getScene());

                if (gid >= tileset.firstgid && gid < tileset.firstgid + count) {

                    return tileset;
                }
            }

            return null;
        }

        /**
         * The local coordinates of a tile (by global id) inside its tileset image.
         */
        static getTileTextureRect(tilemap: EditableTilemap, gid: number): {
            tileset: IEditableTilesetInfo,
            localX: number,
            localY: number
        } {

            const tileset = EditableTilemap.getTilesetForGid(tilemap, gid);

            if (!tileset) {

                return null;
            }

            const { imageWidth, imageHeight } = EditableTilemap.getTilesetImageSize(tileset, tilemap.getScene());

            const columns = Math.floor(
                (imageWidth - tileset.margin * 2 + tileset.spacing) / (tileset.tileWidth + tileset.spacing));

            if (columns <= 0) {

                return null;
            }

            const index = gid - tileset.firstgid;

            return {
                tileset,
                localX: index % columns,
                localY: Math.floor(index / columns)
            };
        }

        /**
         * Mark an object as a tileset info of an editable tilemap,
         * so the inspector sections can detect it when it is selected.
         * The flag is non-enumerable, so it is never serialized.
         */
        static markTilesetInfo(tileset: IEditableTilesetInfo) {

            Object.defineProperty(tileset, "__editableTilesetInfo", {
                value: true,
                enumerable: false,
                configurable: true,
                writable: true
            });
        }

        /**
         * Check if an object is a tileset info of an editable tilemap.
         */
        static isTilesetInfo(obj: any): boolean {

            return obj && obj["__editableTilesetInfo"] === true;
        }

        /**
         * The key of the tilemap data of this object in the tilemap cache of the scene.
         */
        static getCacheKey(tilemap: EditableTilemap) {

            return "__editable_" + tilemap.getEditorSupport().getId();
        }
    }
}
