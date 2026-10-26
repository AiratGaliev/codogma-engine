/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXThresholdComponent extends Component<FXThreshold> {

        // In Phaser 4, Threshold.edge1 / edge2 / invert are arrays with one
        // entry per RGBA channel. The editor exposes them as single values,
        // applied to the 4 channels (like the Quantize steps/gamma properties).
        static edge1 = FXProperty({
            ...SimpleProperty("edge1", 0.5, "Edge 1", "phaser:Phaser.Filters.Threshold.edge1", false, undefined, 0.01, 0, 1),
            getValue: (fx: Phaser.Filters.Threshold) => fx.edge1[0],
            setValue: (fx: Phaser.Filters.Threshold, value: number) => {

                fx.edge1[0] = value;
                fx.edge1[1] = value;
                fx.edge1[2] = value;
                fx.edge1[3] = value;
            }
        });
        static edge2 = FXProperty({
            ...SimpleProperty("edge2", 0.5, "Edge 2", "phaser:Phaser.Filters.Threshold.edge2", false, undefined, 0.01, 0, 1),
            getValue: (fx: Phaser.Filters.Threshold) => fx.edge2[0],
            setValue: (fx: Phaser.Filters.Threshold, value: number) => {

                fx.edge2[0] = value;
                fx.edge2[1] = value;
                fx.edge2[2] = value;
                fx.edge2[3] = value;
            }
        });
        static invert = FXProperty({
            ...SimpleProperty("invert", false, "Invert", "phaser:Phaser.Filters.Threshold.invert"),
            getValue: (fx: Phaser.Filters.Threshold) => fx.invert[0],
            setValue: (fx: Phaser.Filters.Threshold, value: boolean) => {

                fx.invert[0] = value;
                fx.invert[1] = value;
                fx.invert[2] = value;
                fx.invert[3] = value;
            }
        });

        constructor(obj: FXThreshold) {
            super(obj, [
                FXThresholdComponent.edge1,
                FXThresholdComponent.edge2,
                FXThresholdComponent.invert
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                // The edges and invert flags are arrays in the Phaser filter,
                // they are only passed in the addThreshold() call.

                this.buildSetObjectPropertyCodeDOM_BooleanProperty(args,
                    FXThresholdComponent.invert
                );
            }
        }
    }
}
