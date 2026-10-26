namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXKeyCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Key> {

        constructor() {
            super("Key");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Key): void {

            // Phaser 4 signature: addKey(config)
            // The config is emitted as an object literal argument.
            call.arg(`{ color: ${FXColorToCode(fx, "color", "#ffffff")}, isolate: ${fx.isolate}, threshold: ${fx.threshold}, feather: ${fx.feather} }`);
        }
    }
}
