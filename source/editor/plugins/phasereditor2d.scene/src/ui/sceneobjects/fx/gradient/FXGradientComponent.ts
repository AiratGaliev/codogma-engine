/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXGradientComponent extends Component<FXGradient> {
        static color1 = FXProperty(NumberColorProperty("color1", "#ff0000", "Start Color", "Phaser.GameObjects.Gradient color band start."));
        static color2 = FXProperty(NumberColorProperty("color2", "#00ff00", "End Color", "Phaser.GameObjects.Gradient color band end."));
        static alpha = FXProperty(SimpleProperty("alpha", 0.2, "Alpha", "Gradient opacity", false, undefined, 0.01, 0, 1));
        static fromX = FXProperty(SimpleProperty("fromX", 0, "Start X", "Normalized gradient start X", false, undefined, 0.01, 0, 1));
        static fromY = FXProperty(SimpleProperty("fromY", 0, "Start Y", "Normalized gradient start Y", false, undefined, 0.01, 0, 1));
        static toX = FXProperty(SimpleProperty("toX", 0, "End X", "Normalized gradient end X", false, undefined, 0.01, 0, 1));
        static toY = FXProperty(SimpleProperty("toY", 1, "End Y", "Normalized gradient end Y", false, undefined, 0.01, 0, 1));
        static size = FXProperty(SimpleProperty("size", 0, "Band Size", "Gradient band size; zero uses the full ramp", false, undefined, 0.01, 0));

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
            // Параметры Gradient передаются в scene.add.gradient при создании объекта.
        }
    }
}
