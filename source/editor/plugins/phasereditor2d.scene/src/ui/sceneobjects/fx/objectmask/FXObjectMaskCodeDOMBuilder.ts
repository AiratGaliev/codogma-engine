namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXObjectMaskCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Mask> {

        constructor() {
            super("Mask");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Mask): void {

            // Phaser 4 signature: addMask(mask, invert, viewCamera, viewTransform, scaleFactor)
            // Limitation: the editor cannot pick the mask GameObject, so the mask
            // source is not emitted (user code should call filter.setGameObject()).
            // The `autoUpdate` value is not an addMask() parameter, it is only
            // emitted as a property assignment in nested prefab instances.
            call.argUndefined(); // mask source (not set by the editor)

            call.argBool(fx.invert);

            if (fx.scaleFactor !== 1) {

                call.argUndefined(); // viewCamera (GameObject masks only)
                call.argUndefined(); // viewTransform (GameObject masks only)

                call.argFloat(fx.scaleFactor);
            }
        }
    }
}
