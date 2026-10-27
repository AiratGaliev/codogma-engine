/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCircleComponent extends Component<FXCircle> {

        static thickness = FXProperty(SimpleProperty("thickness", 8, "Thickness", "phaser:Phaser.FX.Circle.thickness", false, undefined, 0.01, 0));
        static color = FXProperty(NumberColorProperty("color", "#ff33b2", "Ring Color", "The colour of the circular outline."));
        static backgroundColor = FXProperty(NumberColorProperty("backgroundColor", "#ff0000", "Background Color", "The colour behind the clipped texture."));
        static scale = FXProperty(SimpleProperty("scale", 1, "Scale", "Circle size relative to the texture bounds.", false, undefined, 0.01, 0.01));
        static feather = FXProperty(SimpleProperty("feather", 0.005, "Feather", "Softness of the circle edge.", false, undefined, 0.001, 0));

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
            // Параметры Circle выдаются в кодогенераторе вместе с маской и объектами контура.
        }
    }
}
