namespace phasereditor2d.scene.ui.sceneobjects {

    export class VideoExtension extends SceneGameObjectExtension {

        private static _instance = new VideoExtension();

        static getInstance() {

            return this._instance;
        }

        constructor() {
            super({
                phaserTypeName: "Phaser.GameObjects.Video",
                typeName: "Video",
                category: SCENE_OBJECT_IMAGE_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_FILE_VIDEO)
            });
        }

        acceptsDropData(data: any): boolean {

            return false;
        }

        createSceneObjectWithAsset(args: ICreateWithAssetArgs): ISceneGameObject {

            return null;
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const obj = new Video(args.scene, 0, 0);

            obj.getEditorSupport().readJSON(args.data as any);

            return obj;
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {

            const obj = new Video(args.scene, args.x, args.y);

            return [obj];
        }

        async getAssetsFromObjectData(args: IGetAssetsFromObjectArgs): Promise<any[]> {

            const url = args.serializer.read(VideoComponent.url.name, "");

            if (url && !VideoComponent.isURL(url)) {

                // the url is the key of a video asset in an asset pack

                const item = args.finder.findAssetPackItem(url);

                if (item) {

                    return [item];
                }
            }

            return [];
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {

            return new VideoCodeDOMBuilder();
        }
    }
}
