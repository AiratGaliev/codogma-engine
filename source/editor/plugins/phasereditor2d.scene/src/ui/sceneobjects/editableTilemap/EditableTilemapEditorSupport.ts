namespace phasereditor2d.scene.ui.sceneobjects {

    export interface IEditableTilemapData extends core.json.IScenePlainObjectData {

        data: {
            tileWidth: number;
            tileHeight: number;
            tilesets: IEditableTilesetInfo[];
            layers: IEditableLayerInfo[];
        };
    }

    export class EditableTilemapEditorSupport extends ScenePlainObjectEditorSupport<EditableTilemap> {

        constructor(scene: Scene, obj: EditableTilemap) {
            super(EditableTilemapExtension.getInstance(), obj, scene);
        }

        writeJSON(data: IEditableTilemapData) {

            super.writeJSON(data);

            const tilemap = this.getObject();

            data.data = {
                tileWidth: tilemap.getTileWidth(),
                tileHeight: tilemap.getTileHeight(),
                tilesets: tilemap.getTilesets().map(tileset => ({ ...tileset })),
                layers: tilemap.getLayers().map(layer => ({
                    id: layer.id,
                    name: layer.name,
                    width: layer.width,
                    height: layer.height,
                    data: layer.data.map(row => [...row])
                }))
            };
        }

        readJSON(data: IEditableTilemapData) {

            super.readJSON(data);

            const tilemap = this.getObject();

            const mapData = data.data ?? {} as any;

            tilemap.setTileWidth(mapData.tileWidth ?? 16);
            tilemap.setTileHeight(mapData.tileHeight ?? 16);

            tilemap.getTilesets().splice(0, tilemap.getTilesets().length,
                ...(mapData.tilesets ?? []).map(tileset => {

                    const copy = { ...tileset };

                    EditableTilemap.markTilesetInfo(copy);

                    return copy;
                }));

            tilemap.getLayers().splice(0, tilemap.getLayers().length,
                ...(mapData.layers ?? []).map(layer => ({
                    id: layer.id,
                    name: layer.name,
                    width: layer.width,
                    height: layer.height,
                    data: layer.data.map(row => [...row])
                })));
        }

        destroy() {

            const scene = this.getScene();

            const tilemap = this.getObject();

            // destroy the layer game objects of this tilemap

            const layers: EditableTilemapLayer[] = [];

            scene.visitAll(obj => {

                if (obj instanceof EditableTilemapLayer) {

                    if (obj.getTilemap() === tilemap) {

                        layers.push(obj);
                    }
                }
            });

            for (const layer of layers) {

                layer.getEditorSupport().destroy();
            }

            // remove the tilemap data from the cache

            const key = EditableTilemap.getCacheKey(tilemap);

            if (scene.cache.tilemap.exists(key)) {

                scene.cache.tilemap.remove(key);
            }
        }

        async buildDependencyHash(args: IBuildDependencyHashArgs) {

            const finder = new pack.core.PackFinder();

            for (const tileset of this.getObject().getTilesets()) {

                if (tileset.imageKey) {

                    const asset = finder.findAssetPackItem(tileset.imageKey);

                    if (asset) {

                        args.builder.addPartialToken(asset.getKey() + ":" + asset.computeHash());
                    }
                }
            }
        }
    }
}
