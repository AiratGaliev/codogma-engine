namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXVignetteCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Vignette> {

        constructor() {
            super("Vignette");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Vignette): void {

            // Phaser 4 signature: addVignette(x, y, radius, strength, color, blendMode)
            // Only NORMAL, ADD, MULTIPLY, and SCREEN blend modes are supported.
            call.argFloat(fx.x);
            call.argFloat(fx.y);
            call.argFloat(fx.radius);
            call.argFloat(fx.strength);
            call.argFloat(FXColorToCode(fx, "color", "#000000"));
            call.argFloat(fx.blendMode);
        }
    }
}
