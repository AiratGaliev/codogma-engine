namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXBlockyCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Blocky> {

        constructor() {
            super("Blocky");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Blocky): void {

            // Phaser 4 signature: addBlocky(config)
            // The config is emitted as an object literal argument.
            call.arg(`{ size: { x: ${fx.size["x"]}, y: ${fx.size["y"]} }, offset: { x: ${fx.offset["x"]}, y: ${fx.offset["y"]} } }`);
        }
    }
}
