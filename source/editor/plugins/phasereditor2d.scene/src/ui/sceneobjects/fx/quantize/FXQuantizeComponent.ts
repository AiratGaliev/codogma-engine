/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXQuantizeComponent extends Component<FXQuantize> {

        // In Phaser 4, Quantize.steps / gamma / offset are arrays of 4 numbers
        // (one per channel). The editor exposes them as single numbers,
        // applied to the 4 channels. The `offset` array is not exposed.
        static steps = FXProperty({
            ...SimpleProperty("steps", 8, "Steps", "phaser:Phaser.Filters.Quantize.steps", false, undefined, 1, 1),
            getValue: (fx: Phaser.Filters.Quantize) => fx.steps[0],
            setValue: (fx: Phaser.Filters.Quantize, value: number) => {

                fx.steps[0] = value;
                fx.steps[1] = value;
                fx.steps[2] = value;
                fx.steps[3] = value;
            }
        });
        static gamma = FXProperty({
            ...SimpleProperty("gamma", 1, "Gamma", "phaser:Phaser.Filters.Quantize.gamma", false, undefined, 0.01),
            getValue: (fx: Phaser.Filters.Quantize) => fx.gamma[0],
            setValue: (fx: Phaser.Filters.Quantize, value: number) => {

                fx.gamma[0] = value;
                fx.gamma[1] = value;
                fx.gamma[2] = value;
                fx.gamma[3] = value;
            }
        });
        static mode = FXEnumProperty(SimpleEnumProperty("mode", 0, [0, 1], ["RGBA", "HSVA"], "Mode", "phaser:Phaser.Filters.Quantize.mode"));
        static dither = FXProperty(SimpleProperty("dither", false, "Dither", "phaser:Phaser.Filters.Quantize.dither"));

        constructor(obj: FXQuantize) {
            super(obj, [
                FXQuantizeComponent.steps,
                FXQuantizeComponent.gamma,
                FXQuantizeComponent.mode,
                FXQuantizeComponent.dither
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                // steps and gamma are arrays in the Phaser filter,
                // they are only passed in the addQuantize() config object.

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXQuantizeComponent.mode
                );

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args,
                    FXQuantizeComponent.dither
                );
            }
        }
    }
}
