/// <reference path="../FXObjectExtension.ts" />
/// <reference path="FXShine.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXShineExtension extends FXObjectExtension {

        private static _instance = new FXShineExtension();

        static getInstance() {
            return this._instance;
        }

        constructor() {
            super({
                typeName: "Shine",
                phaserTypeName: "Phaser.FX.Shine",
                category: SCENE_OBJECT_FX_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_FX)
            });
        }

        createFXObject(scene: Scene, parent: ISceneGameObject, preFX: boolean): FXShine {
            const obj = new FXShine(scene, parent, preFX);
            scene.removeGameObject(obj);
            return obj;
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const data = args.data as IFXObjectData;

            const obj = new FXShine(args.scene, args.parent, data.preFX ?? false);

            args.scene.removeGameObject(obj);

            obj.getEditorSupport().readJSON(args.data);

            return obj;
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {
            throw new Error("Method not supported.");
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {
            return new FXShineCodeDOMBuilder();
        }
    }
}