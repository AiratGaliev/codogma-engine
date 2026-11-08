/// <reference path="../FXObjectExtension.ts" />
/// <reference path="FXBloom.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBloomExtension extends FXObjectExtension {

        private static _instance = new FXBloomExtension();

        static getInstance() {
            return this._instance;
        }

        constructor() {
            super({
                typeName: "Bloom",
                phaserTypeName: "Phaser.Filters.Controller",
                category: SCENE_OBJECT_FX_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_FX)
            });
        }

        createFXObject(scene: Scene, parent: ISceneGameObject, preFX: boolean): FXBloom {
            const obj = new FXBloom(scene, parent, preFX);
            scene.removeGameObject(obj);
            return obj;
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const data = args.data as IFXObjectData;

            const obj = new FXBloom(args.scene, args.parent, data.preFX ?? false);

            args.scene.removeGameObject(obj);

            obj.getEditorSupport().readJSON(args.data);

            return obj;
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {
            throw new Error("Method not supported.");
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {
            return new FXBloomCodeDOMBuilder();
        }
    }
}
