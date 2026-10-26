namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXBlurCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Blur> {

        constructor() {
            super("Blur");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Blur): void {

            // Phaser 4 signature: addBlur(quality, x, y, strength, color, steps)
            call.argInt(fx.quality);
            call.argFloat(fx.x);
            call.argFloat(fx.y);
            call.argFloat(fx.strength);
            call.argFloat(fx.color);
            call.argInt(fx.steps);
        }
    }
}
