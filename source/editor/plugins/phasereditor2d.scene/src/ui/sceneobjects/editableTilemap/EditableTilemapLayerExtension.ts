namespace phasereditor2d.scene.ui.sceneobjects {

    export class EditableTilemapLayerExtension extends SceneGameObjectExtension {

        private static _instance: EditableTilemapLayerExtension;

        static getInstance() {

            return this._instance ? this._instance : (this._instance = new EditableTilemapLayerExtension());
        }

        constructor() {
            super({
                icon: resources.getIconDescriptor(resources.ICON_TILEMAP_LAYER),
                phaserTypeName: "Phaser.Tilemaps.TilemapLayer",
                typeName: "EditableTilemapLayer",
                category: SCENE_OBJECT_TILEMAP_CATEGORY,
            });
        }

        createLayerObject(scene: Scene, tilemap: EditableTilemap, layerName: string) {

            return new EditableTilemapLayer(scene, tilemap, layerName);
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const data = args.data as IEditableTilemapLayerData;

            const scene = args.scene;

            const tilemap = scene.getPlainObjectById(data.tilemapId) as EditableTilemap;

            if (!tilemap) {

                throw new Error("Cannot find EditableTilemap with id " + data.tilemapId);
            }

            const layer = this.createLayerObject(scene, tilemap, data.layerName);

            layer.getEditorSupport().readJSON(data);

            return layer;
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {

            return new EditableTilemapLayerCodeDOMBuilder();
        }

        createDefaultSceneObject(args: ICreateDefaultArgs) {

            const tilemap = args.extraData.tilemap as EditableTilemap;
            const layerName = args.extraData.layerName as string;

            const layer = this.createLayerObject(args.scene, tilemap, layerName);

            layer.setPosition(args.x, args.y);

            return [layer];
        }

        acceptsDropData(data: any): boolean {

            return false;
        }

        createSceneObjectWithAsset(args: ICreateWithAssetArgs): ISceneGameObject {
            throw new Error("Method not implemented.");
        }

        async getAssetsFromObjectData(args: IGetAssetsFromObjectArgs): Promise<any[]> {

            const scene = args.scene;

            const data = args.serializer.getData() as IEditableTilemapLayerData;

            const tilemap = scene.getPlainObjectById(data.tilemapId) as EditableTilemap;

            if (!tilemap) {

                return [];
            }

            const finder = args.finder;

            const result = [];

            for (const tileset of tilemap.getTilesets()) {

                if (tileset.imageKey) {

                    const asset = finder.findAssetPackItem(tileset.imageKey);

                    if (asset instanceof pack.core.ImageAssetPackItem
                        || asset instanceof pack.core.SpritesheetAssetPackItem) {

                        result.push(asset);
                    }
                }
            }

            return result;
        }

        isAvailableAsPrefabElement() {

            return false;
        }
    }
}
