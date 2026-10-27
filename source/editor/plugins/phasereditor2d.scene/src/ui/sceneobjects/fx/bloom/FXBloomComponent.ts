/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBloomComponent extends Component<FXBloom> {

        static color = FXProperty(NumberColorProperty("color", "#ffffff", "Color", "phaser:Phaser.FX.Bloom.color"));
        static offsetX = FXProperty(SimpleProperty("offsetX", 1, "Offset X", "phaser:Phaser.FX.Bloom.offsetX", false, undefined, 1));
        static offsetY = FXProperty(SimpleProperty("offsetY", 1, "Offset Y", "phaser:Phaser.FX.Bloom.offsetY", false, undefined, 1));
        static blurStrength = FXProperty(SimpleProperty("blurStrength", 1, "Blur Strength", "phaser:Phaser.FX.Bloom.blurStrength", false, undefined, 0.01));
        static strength = FXProperty(SimpleProperty("strength", 1, "Strength", "phaser:Phaser.FX.Bloom.strength", false, undefined, 0.01));
        static steps = FXProperty(SimpleProperty("steps", 4, "Steps", "phaser:Phaser.FX.Bloom.steps", false, undefined, 1));

        constructor(obj: FXBloom) {
            super(obj, [
                FXBloomComponent.color,
                FXBloomComponent.offsetX,
                FXBloomComponent.offsetY,
                FXBloomComponent.blurStrength,
                FXBloomComponent.strength,
                FXBloomComponent.steps
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXBloomComponent.color,
                    FXBloomComponent.offsetX,
                    FXBloomComponent.offsetY,
                    FXBloomComponent.blurStrength,
                    FXBloomComponent.strength,
                    FXBloomComponent.steps
                );
            }
        }
    }
}