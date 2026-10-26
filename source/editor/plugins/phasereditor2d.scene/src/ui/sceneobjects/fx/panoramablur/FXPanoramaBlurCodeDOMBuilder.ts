namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXPanoramaBlurCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.PanoramaBlur> {

        constructor() {
            super("PanoramaBlur");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.PanoramaBlur): void {

            // Phaser 4 signature: addPanoramaBlur(config)
            // The config is emitted as an object literal argument.
            call.arg(`{ radius: ${fx.radius}, samplesX: ${fx.samplesX}, samplesY: ${fx.samplesY}, power: ${fx.power} }`);
        }
    }
}
