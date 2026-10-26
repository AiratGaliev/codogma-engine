/// <reference path="../FXObjectExtension.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBarrelExtension extends FXObjectExtension {

        private static _instance = new FXBarrelExtension();

        static getInstance() {

            return this._instance;
        }

        constructor() {
            super({
                typeName: "Barrel",
                phaserTypeName: "Phaser.Filters.Barrel",
                category: SCENE_OBJECT_FX_CATEGORY,
                icon: resources.getIconDescriptor(resources.ICON_FX)
            });
        }

        override getCodeDOMBuilder(): GameObjectCodeDOMBuilder {

            return new FXBarrelCodeDOMBuilder();
        }

        override createFXObject(scene: Scene, parent: ISceneGameObject, preFX: boolean) {

            const obj = new FXBarrel(scene, parent, preFX);

            scene.removeGameObject(obj);

            return obj;
        }

        override createGameObjectWithData(args: ICreateWithDataArgs): ISceneGameObject {

            const data = args.data as IFXObjectData;

            const obj = new FXBarrel(args.scene, args.parent, data.preFX ?? false);

            args.scene.removeGameObject(obj);

            obj.getEditorSupport().readJSON(args.data);

            return obj;
        }

        override createDefaultSceneObject(args: ICreateDefaultArgs): ISceneObject[] {

            throw new Error("Method not supported.");
        }
    }
}
