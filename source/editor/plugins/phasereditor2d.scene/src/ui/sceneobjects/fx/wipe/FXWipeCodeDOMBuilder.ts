namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXWipeCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Wipe> {

        constructor() {
            super("Wipe");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Wipe): void {

            // Phaser 4 signature: addWipe(wipeWidth, direction, axis, reveal, wipeTexture)
            // The `progress` value is not a constructor argument: it is driven at
            // runtime (e.g. with a Tween) and emitted as an assignment in the
            // nested prefab instances.
            call.argFloat(fx.wipeWidth);
            call.argInt(fx.direction);
            call.argInt(fx.axis);
            call.argFloat(fx.reveal);

            const texture = FXGetTextureKey(fx, "wipeTexture", "");

            call.arg(texture ? JSON.stringify(texture) : "undefined");
        }
    }
}
