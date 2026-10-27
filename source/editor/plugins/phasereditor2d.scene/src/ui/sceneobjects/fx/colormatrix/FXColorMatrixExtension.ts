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

        override getFXObjectFactories(): IFXObjectFactory[] {

            const makePresetFactory = (constantName: string): IFXObjectFactory => ({

                extension: this,

                factoryName: this.getFactoryName(constantName),

                createFXObject: (scene: Scene, parent: ISceneGameObject, preFX: boolean) => {

                    const obj = this.createFXObject(scene, parent, preFX);

                    obj.getEditorSupport().setLabel(constantName.toLowerCase());
                    obj.operationType = ColorMatrixOperationType.SET_MATRIX;

                    // shortcut: official v4 stores the raw matrix array; we
                    // store the constant name (see FXColorMatrixComponent).
                    obj.matrixPreset = constantName;

                    return obj;
                }
            });

            const makeMethodFactory = (factoryName: string, op: ColorMatrixOperationType, apply: (obj: FXColorMatrix) => void): IFXObjectFactory => ({

                extension: this,

                factoryName,

                createFXObject: (scene: Scene, parent: ISceneGameObject, preFX: boolean) => {

                    const obj = this.createFXObject(scene, parent, preFX);

                    obj.getEditorSupport().setLabel(factoryName.toLowerCase());
                    obj.operationType = op;
                    apply(obj);

                    return obj;
                }
            });

            const methods = [
                makeMethodFactory("Brightness", ColorMatrixOperationType.SET_BRIGHTNESS, obj => obj.brightness = 1),
                makeMethodFactory("Saturate", ColorMatrixOperationType.SET_SATURATE, obj => obj.saturate = 1),
                makeMethodFactory("Hue", ColorMatrixOperationType.SET_HUE, obj => obj.hueRotation = 1),
                makeMethodFactory("Grayscale", ColorMatrixOperationType.SET_GRAYSCALE, obj => obj.grayscale = 1),
                makeMethodFactory("Contrast", ColorMatrixOperationType.SET_CONTRAST, obj => obj.contrast = 0),
                makeMethodFactory("Night", ColorMatrixOperationType.SET_NIGHT, obj => obj.nightIntensity = 0.1),
            ];

            return [...methods, ...FXColorMatrixComponent.MATRIX_PRESETS_NAMES.map(makePresetFactory)];
        }

        private getFactoryName(name: string): string {

            return name.split("_")
                .map(part => part[0] + part.substring(1).toLowerCase())
                .join(" ");
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
