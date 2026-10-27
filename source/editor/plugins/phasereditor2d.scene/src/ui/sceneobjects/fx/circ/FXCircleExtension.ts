/// <reference path="../FXObjectExtension.ts" />
/// <reference path="FXCircle.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCircleExtension extends FXObjectExtension {

        private static _instance = new FXCircleExtension();

        static getInstance() {
            return this._instance;
        }

        constructor() {
            super({
                typeName: "Circle",
                phaserTypeName: "Phaser.FX.Circle",
                category: SCENE_OBJECT_FX_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_FX)
            });
        }

        createFXObject(scene: Scene, parent: ISceneGameObject, preFX: boolean): FXCircle {
            const obj = new FXCircle(scene, parent, preFX);
            scene.removeGameObject(obj);
            return obj;
        }

        createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const data = args.data as IFXObjectData;

            const obj = new FXCircle(args.scene, args.parent, data.preFX ?? false);

            args.scene.removeGameObject(obj);

            obj.getEditorSupport().readJSON(args.data);

            return obj;
        }

        createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {
            throw new Error("Method not supported.");
        }

        getCodeDOMBuilder(): GameObjectCodeDOMBuilder {
            return new FXCircleCodeDOMBuilder();
        }
    }
}