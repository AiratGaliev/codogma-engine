/// <reference path="../SceneGameObjectExtension.ts" />
/// <reference path="./ParticleEmitter.ts" />
/// <reference path="./ParticleEmitterComponent.ts" />
/// <reference path="./ParticleEmitterCodeDOMBuilder.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import json = core.json;
    import pack = phasereditor2d.pack.core;

    export class ParticleEmitterExtension extends SceneGameObjectExtension {

        private static _instance = new ParticleEmitterExtension();

        static getInstance() {

            return this._instance;
        }

        constructor() {
            super({
                typeName: "ParticleEmitter",
                phaserTypeName: "Phaser.GameObjects.Particles.ParticleEmitter",
                category: SCENE_OBJECT_PARTICLES_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_PLAY)
            });
        }

        acceptsDropData(data: any): boolean {

            return data instanceof pack.ImageFrameContainerAssetPackItem
                || data instanceof pack.AssetPackImageFrame;
        }

        createSceneObjectWithAsset(args: ICreateWithAssetArgs): ISceneGameObject {

            const { key, frame } = ParticleEmitterExtension.getKeyFrameFromAsset(args.asset);

            const emitter = new ParticleEmitter(args.scene, args.x, args.y, key);

            emitter.configTexture = key;
            emitter.configFrame = frame !== undefined ? [frame] : [];

            emitter.updateConfig();
            emitter.fastForward(emitter.previewAdvance);

            return emitter;
        }

        static getKeyFrameFromAsset(asset: any): { key?: string, frame?: string | number } {

            if (asset instanceof pack.ImageAssetPackItem) {

                return { key: asset.getKey() };
            }

            if (asset instanceof pack.AssetPackImageFrame) {

                return { key: asset.getPackItem().getKey(), frame: asset.getName() };
            }

            if (asset instanceof pack.ImageFrameContainerAssetPackItem) {

                return { key: asset.getKey() };
            }

            return {};
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const obj = new ParticleEmitter(args.scene, 0, 0);

            obj.getEditorSupport().readJSON(args.data as any);

            obj.fastForward(obj.previewAdvance);

            return obj;
        }

        createInitObjectDataFromChild(childData: json.IObjectData): json.IObjectData {

            // Yeah, we have to get all properties because the emitter is very particular...
            // If you create an "empty particle" then it gets a time to update the next configuration.

            const data = { ...childData };

            delete (data as any).list;

            return data;
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {

            let key: string = undefined;
            const frames: any[] = [];

            if (args.extraData) {

                for (const asset of args.extraData) {

                    const result = ParticleEmitterExtension.getKeyFrameFromAsset(asset);

                    key = result.key;

                    if (result.frame) {

                        frames.push(result.frame);
                    }
                }
            }

            const obj = new ParticleEmitter(args.scene, args.x, args.y, key);

            obj.configTexture = key;
            obj.configFrame = frames;

            obj.updateConfig();
            obj.fastForward(obj.previewAdvance);

            return [obj];
        }

        async collectExtraDataForCreateDefaultObject(editor: ui.editor.SceneEditor): Promise<ICreateExtraDataResult> {

            const selection = await TextureSelectionDialog.selectOneTexture(editor, [], "No Texture");

            if (!selection) {

                return { abort: true };
            }

            await this.updateSelectedAssetsLoader(editor, [selection]);

            return {
                data: [selection]
            };
        }

        private async updateSelectedAssetsLoader(editor: ui.editor.SceneEditor, selection: any[]) {

            for (const selected of selection) {

                const ext = ScenePlugin.getInstance().getLoaderUpdaterForAsset(selected);

                if (ext) {

                    await ext.updateLoader(editor.getScene(), selected);
                }
            }
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
