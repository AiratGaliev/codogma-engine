/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXShineComponent extends Component<FXShine> {

        static speed = FXProperty(SimpleProperty("speed", 0.5, "Speed", "phaser:Phaser.FX.Shine.speed", false, undefined, 0.01));
        static lineWidth = FXProperty(SimpleProperty("lineWidth", 0.5, "Line Width", "phaser:Phaser.FX.Shine.lineWidth", false, undefined, 0.01));
        static gradient = FXProperty(SimpleProperty("gradient", 3, "Gradient", "phaser:Phaser.FX.Shine.gradient", false, undefined, 0.01));
        static reveal = FXProperty(SimpleProperty("reveal", false, "Reveal", "phaser:Phaser.FX.Shine.reveal"));

        constructor(obj: FXShine) {
            super(obj, [
                FXShineComponent.speed,
                FXShineComponent.lineWidth,
                FXShineComponent.gradient,
                FXShineComponent.reveal
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXShineComponent.speed,
                    FXShineComponent.lineWidth,
                    FXShineComponent.gradient
                );

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args, FXShineComponent.reveal);
            }
        }
    }
}