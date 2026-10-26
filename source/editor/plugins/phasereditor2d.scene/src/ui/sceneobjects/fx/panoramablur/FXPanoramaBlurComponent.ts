/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXPanoramaBlurComponent extends Component<FXPanoramaBlur> {

        // Altering the samples triggers a shader re-compile,
        // keep them as low as possible.
        static radius = FXProperty(SimpleProperty("radius", 1, "Radius", "phaser:Phaser.Filters.PanoramaBlur.radius", false, undefined, 0.01, 0, 1));
        static samplesX = FXProperty(SimpleProperty("samplesX", 32, "Samples X", "phaser:Phaser.Filters.PanoramaBlur.samplesX", false, undefined, 1, 1));
        static samplesY = FXProperty(SimpleProperty("samplesY", 16, "Samples Y", "phaser:Phaser.Filters.PanoramaBlur.samplesY", false, undefined, 1, 1));
        static power = FXProperty(SimpleProperty("power", 1, "Power", "phaser:Phaser.Filters.PanoramaBlur.power", false, undefined, 0.01));

        constructor(obj: FXPanoramaBlur) {
            super(obj, [
                FXPanoramaBlurComponent.radius,
                FXPanoramaBlurComponent.samplesX,
                FXPanoramaBlurComponent.samplesY,
                FXPanoramaBlurComponent.power
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const objES = this.getObject().getEditorSupport();

            if (objES.isNestedPrefabInstance()) {

                this.buildSetObjectPropertyCodeDOM_FloatProperty(args,
                    FXPanoramaBlurComponent.radius,
                    FXPanoramaBlurComponent.samplesX,
                    FXPanoramaBlurComponent.samplesY,
                    FXPanoramaBlurComponent.power
                );
            }
        }
    }
}
