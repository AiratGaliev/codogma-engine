/// <reference path="../FXObjectExtension.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixExtension extends FXObjectExtension {

        private static _instance = new FXColorMatrixExtension();

        static getInstance() {

            return this._instance;
        }

        constructor() {
            super({
                typeName: "ColorMatrix",
                phaserTypeName: "Phaser.Filters.ColorMatrix",
                category: SCENE_OBJECT_FX_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_FX)
            });
        }

        override getCodeDOMBuilder(): GameObjectCodeDOMBuilder {

            return new FXColorMatrixCodeDOMBuilder();
        }

        override createFXObject(scene: Scene, parent: ISceneGameObject, preFX: boolean) {

            const obj = new FXColorMatrix(scene, parent, preFX);

            scene.removeGameObject(obj);

            return obj;
        }

        override createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const data = args.data as IFXObjectData;

            const obj = new FXColorMatrix(args.scene, args.parent, data.preFX ?? false);

            args.scene.removeGameObject(obj);

            obj.getEditorSupport().readJSON(args.data);

            return obj;
        }

        override createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {

            throw new Error("Method not supported.");
        }
    }
}
