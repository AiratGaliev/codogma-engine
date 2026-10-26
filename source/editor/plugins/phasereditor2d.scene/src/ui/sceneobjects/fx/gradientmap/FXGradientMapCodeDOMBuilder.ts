namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXGradientMapCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.GradientMap> {

        constructor() {
            super("GradientMap");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.GradientMap): void {

            // Phaser 4 signature: addGradientMap(config)
            // The config is emitted as an object literal argument.
            // Limitation: the `ramp`, `color` and `colorFactor` config options
            // are not exposed by the editor.
            call.arg(`{ alpha: ${fx.alpha}, dither: ${fx.dither}, unpremultiply: ${fx.unpremultiply} }`);
        }
    }
}
