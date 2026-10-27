/// <reference path="../FXObjectExtension.ts" />
/// <reference path="FXGradient.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGradientExtension extends FXObjectExtension {

        private static _instance = new FXGradientExtension();

        static getInstance() {
            return this._instance;
        }

        constructor() {
            super({
                typeName: "Gradient",
                phaserTypeName: "Phaser.FX.Gradient",
                category: SCENE_OBJECT_FX_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_FX)
            });
        }

        createFXObject(scene: Scene, parent: ISceneGameObject, preFX: boolean): FXGradient {
            const obj = new FXGradient(scene, parent, preFX);
            scene.removeGameObject(obj);
            return obj;
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const data = args.data as IFXObjectData;

            const obj = new FXGradient(args.scene, args.parent, data.preFX ?? false);

            args.scene.removeGameObject(obj);

            obj.getEditorSupport().readJSON(args.data);

            return obj;
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {
            throw new Error("Method not supported.");
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {
            return new FXGradientCodeDOMBuilder();
        }
    }
}