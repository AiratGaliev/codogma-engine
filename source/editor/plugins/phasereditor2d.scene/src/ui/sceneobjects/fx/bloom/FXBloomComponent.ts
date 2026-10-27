/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXBloomComponent extends Component<FXBloom> {
        static threshold = FXProperty(SimpleProperty("threshold", 0.5, "Threshold", "phaser:Phaser.Types.Actions.AddEffectBloomConfig.threshold", false, undefined, 0.01, 0, 1));
        static blurRadius = FXProperty(SimpleProperty("blurRadius", 2, "Blur Radius", "phaser:Phaser.Types.Actions.AddEffectBloomConfig.blurRadius", false, undefined, 0.1, 0));
        static blurSteps = FXProperty(SimpleProperty("blurSteps", 4, "Blur Steps", "phaser:Phaser.Types.Actions.AddEffectBloomConfig.blurSteps", false, undefined, 1, 1));
        static blurQuality = FXProperty(SimpleProperty("blurQuality", 0, "Blur Quality (0–2)", "phaser:Phaser.Types.Actions.AddEffectBloomConfig.blurQuality", false, undefined, 1, 0, 2));
        static blendAmount = FXProperty(SimpleProperty("blendAmount", 1, "Blend Amount", "phaser:Phaser.Types.Actions.AddEffectBloomConfig.blendAmount", false, undefined, 0.05, 0));

        constructor(obj: FXBloom) {
            super(obj, [
                FXBloomComponent.threshold,
                FXBloomComponent.blurRadius,
                FXBloomComponent.blurSteps,
                FXBloomComponent.blurQuality,
                FXBloomComponent.blendAmount
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {
            // Конфигурация передаётся в Phaser.Actions.AddEffectBloom при создании эффекта.
        }
    }
}
