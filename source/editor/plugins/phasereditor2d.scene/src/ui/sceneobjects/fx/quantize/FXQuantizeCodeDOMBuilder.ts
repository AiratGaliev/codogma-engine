namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXQuantizeCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Quantize> {

        constructor() {
            super("Quantize");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Quantize): void {

            // Phaser 4 signature: addQuantize(config)
            // The config is emitted as an object literal argument.
            // Limitation: the `offset` array is not exposed by the editor.
            call.arg(`{ steps: [${fx.steps.join(", ")}], gamma: [${fx.gamma.join(", ")}], mode: ${fx.mode}, dither: ${fx.dither} }`);
        }
    }
}
