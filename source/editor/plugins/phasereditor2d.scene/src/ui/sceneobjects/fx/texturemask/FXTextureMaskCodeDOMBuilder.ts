namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXTextureMaskCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Mask> {

        constructor() {
            super("Mask");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Mask): void {

            // Phaser 4 signature: addMask(mask, invert, viewCamera, viewTransform, scaleFactor)
            // Limitation: the editor only supports texture masks, the `viewCamera`
            // and `viewTransform` parameters (for GameObject masks) are not emitted.
            const texture = FXGetTextureKey(fx, "texture", "");

            call.arg(texture ? JSON.stringify(texture) : "undefined");

            call.argBool(fx.invert);

            if (fx.scaleFactor !== 1) {

                call.argUndefined(); // viewCamera (GameObject masks only)
                call.argUndefined(); // viewTransform (GameObject masks only)

                call.argFloat(fx.scaleFactor);
            }
        }
    }
}
