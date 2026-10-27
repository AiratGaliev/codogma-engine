/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCircleComponent extends Component<FXCircle> {

        static thickness = FXProperty(SimpleProperty("thickness", 8, "Thickness", "phaser:Phaser.FX.Circle.thickness", false, undefined, 0.01, 0));
        static color = FXProperty(NumberColorProperty("color", "#ff33b2", "Color", "phaser:Phaser.FX.Circle.color"));
        static backgroundColor = FXProperty(NumberColorProperty("backgroundColor", "#ff0000", "Background Color", "phaser:Phaser.FX.Circle.backgroundColor"));
        static scale = FXProperty(SimpleProperty("scale", 1, "Scale", "phaser:Phaser.FX.Circle.scale", false, undefined, 0.01, 0));
        static feather = FXProperty(SimpleProperty("feather", 0.005, "Feather", "phaser:Phaser.FX.Circle.feather", false, undefined, 0.01, 0));

        constructor(obj: FXCircle) {
            super(obj, [
                FXCircleComponent.thickness,
                FXCircleComponent.color,
                FXCircleComponent.backgroundColor,
                FXCircleComponent.scale,
                FXCircleComponent.feather
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXCircleComponent.thickness,
                    FXCircleComponent.color,
                    FXCircleComponent.backgroundColor,
                    FXCircleComponent.scale,
                    FXCircleComponent.feather
                );
            }
        }
    }
}