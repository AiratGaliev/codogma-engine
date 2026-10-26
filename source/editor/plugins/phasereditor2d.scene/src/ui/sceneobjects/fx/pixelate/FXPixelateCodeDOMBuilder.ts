namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXPixelateCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Pixelate> {

        constructor() {
            super("Pixelate");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Pixelate): void {

            // Phaser 4 signature: addPixelate(amount)
            call.argFloat(fx.amount);
        }
    }
}
