namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXDisplacementCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Displacement> {

        constructor() {
            super("Displacement");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Displacement): void {

            // Phaser 4 signature: addDisplacement(texture, x, y)
            const texture = FXGetTextureKey(fx, "texture", "");

            call.arg(texture ? JSON.stringify(texture) : "undefined");

            call.argFloat(fx.x);
            call.argFloat(fx.y);
        }
    }
}
