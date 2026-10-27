/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXCircleComponent extends Component<FXCircle> {
        static shape = FXProperty(SimpleProperty("shape", "circle", "Mask Shape", "Phaser 4 supports circle, ellipse, square and rectangle."));
        static aspectRatio = FXProperty(SimpleProperty("aspectRatio", 1, "Aspect Ratio", "phaser:Phaser.Types.Actions.AddMaskShapeConfig.aspectRatio", false, undefined, 0.01, 0.01));
        static invert = FXProperty(SimpleProperty("invert", false, "Invert Mask", "phaser:Phaser.Types.Actions.AddMaskShapeConfig.invert"));
        static blurRadius = FXProperty(SimpleProperty("blurRadius", 0, "Blur Radius", "phaser:Phaser.Types.Actions.AddMaskShapeConfig.blurRadius", false, undefined, 0.1, 0));
        static blurSteps = FXProperty(SimpleProperty("blurSteps", 4, "Blur Steps", "phaser:Phaser.Types.Actions.AddMaskShapeConfig.blurSteps", false, undefined, 1, 1));
        static blurQuality = FXProperty(SimpleProperty("blurQuality", 0, "Blur Quality (0–2)", "phaser:Phaser.Types.Actions.AddMaskShapeConfig.blurQuality", false, undefined, 1, 0, 2));
        static scaleMode = FXProperty(SimpleProperty("scaleMode", 0, "Scale Mode (−1/0/1)", "phaser:Phaser.Types.Actions.AddMaskShapeConfig.scaleMode", false, undefined, 1, -1, 1));
        static padding = FXProperty(SimpleProperty("padding", 0, "Padding", "phaser:Phaser.Types.Actions.AddMaskShapeConfig.padding", false, undefined, 1, 0));

        constructor(obj: FXCircle) {
            super(obj, [
                FXCircleComponent.shape,
                FXCircleComponent.aspectRatio,
                FXCircleComponent.invert,
                FXCircleComponent.blurRadius,
                FXCircleComponent.blurSteps,
                FXCircleComponent.blurQuality,
                FXCircleComponent.scaleMode,
                FXCircleComponent.padding
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {
            // Конфигурация передаётся в Phaser.Actions.AddMaskShape при создании эффекта.
        }
    }
}
