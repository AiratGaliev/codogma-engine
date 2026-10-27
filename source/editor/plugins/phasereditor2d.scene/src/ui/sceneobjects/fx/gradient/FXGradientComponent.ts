/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGradientComponent extends Component<FXGradient> {

        static color1 = FXProperty(NumberColorProperty("color1", "#ff0000", "Color 1", "phaser:Phaser.FX.Gradient.color1"));
        static color2 = FXProperty(NumberColorProperty("color2", "#00ff00", "Color 2", "phaser:Phaser.FX.Gradient.color2"));
        static alpha = FXProperty(SimpleProperty("alpha", 0.2, "Alpha", "phaser:Phaser.FX.Gradient.alpha", false, undefined, 0.01, 0, 1));
        static fromX = FXProperty(SimpleProperty("fromX", 0, "From X", "phaser:Phaser.FX.Gradient.fromX", false, undefined, 0.01));
        static fromY = FXProperty(SimpleProperty("fromY", 0, "From Y", "phaser:Phaser.FX.Gradient.fromY", false, undefined, 0.01));
        static toX = FXProperty(SimpleProperty("toX", 0, "To X", "phaser:Phaser.FX.Gradient.toX", false, undefined, 0.01));
        static toY = FXProperty(SimpleProperty("toY", 1, "To Y", "phaser:Phaser.FX.Gradient.toY", false, undefined, 0.01));
        static size = FXProperty(SimpleProperty("size", 0, "Size", "phaser:Phaser.FX.Gradient.size", false, undefined, 0.01));

        constructor(obj: FXGradient) {
            super(obj, [
                FXGradientComponent.color1,
                FXGradientComponent.color2,
                FXGradientComponent.alpha,
                FXGradientComponent.fromX,
                FXGradientComponent.fromY,
                FXGradientComponent.toX,
                FXGradientComponent.toY,
                FXGradientComponent.size
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXGradientComponent.color1,
                    FXGradientComponent.color2,
                    FXGradientComponent.alpha,
                    FXGradientComponent.fromX,
                    FXGradientComponent.fromY,
                    FXGradientComponent.toX,
                    FXGradientComponent.toY,
                    FXGradientComponent.size
                );
            }
        }
    }
}