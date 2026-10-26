namespace phasereditor2d.scene.ui.sceneobjects {

    export class ParticleEmitterExtension extends SceneGameObjectExtension {

        private static _instance = new ParticleEmitterExtension();

        static getInstance() {

            return this._instance;
        }

        constructor() {
            super({
                phaserTypeName: "Phaser.GameObjects.Particles.ParticleEmitter",
                typeName: "ParticleEmitter",
                category: SCENE_OBJECT_IMAGE_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_PLAY)
            });
        }

        acceptsDropData(data: any): boolean {

            return false;
        }

        createSceneObjectWithAsset(args: ICreateWithAssetArgs): ISceneGameObject {

            return null;
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const obj = new ParticleEmitter(args.scene, 0, 0);

            obj.getEditorSupport().readJSON(args.data as any);

            return obj;
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {

            const obj = new ParticleEmitter(args.scene, args.x, args.y);

            return [obj];
        }

        async getAssetsFromObjectData(args: IGetAssetsFromObjectArgs): Promise<any[]> {

            const key = args.serializer.read(ParticleEmitterComponent.texture.name, "");

            const assets: any[] = [];

            if (key) {

                const item = args.finder.findAssetPackItem(key);

                if (item) {

                    assets.push(item);
                }
            }

            // Maybe it contains FX objects depending on textures

            const childrenAssets = await ContainerExtension.getAssetsFromNestedData(args);

            return [...assets, ...childrenAssets];
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {

            return new ParticleEmitterCodeDOMBuilder();
        }
    }
}
