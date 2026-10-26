/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBokehComponent extends Component<FXBokeh> {

        // Limitation: the Tilt Shift variant (isTiltShift / blurX / blurY /
        // strength parameters of the Bokeh filter) is not exposed by the editor.

        static radius = FXProperty(SimpleProperty("radius", 0.5, "Radius", "phaser:Phaser.Filters.Bokeh.radius", false, undefined, 0.01, 0));
        static amount = FXProperty(SimpleProperty("amount", 1, "Amount", "phaser:Phaser.Filters.Bokeh.amount", false, undefined, 0.01, 0));
        static contrast = FXProperty(SimpleProperty("contrast", 0.2, "Contrast", "phaser:Phaser.Filters.Bokeh.contrast", false, undefined, 0.01));

        constructor(obj: FXBokeh) {
            super(obj, [
                FXBokehComponent.radius,
                FXBokehComponent.amount,
                FXBokehComponent.contrast
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXBokehComponent.radius,
                    FXBokehComponent.amount,
                    FXBokehComponent.contrast
                );
            }
        }
    }
}
