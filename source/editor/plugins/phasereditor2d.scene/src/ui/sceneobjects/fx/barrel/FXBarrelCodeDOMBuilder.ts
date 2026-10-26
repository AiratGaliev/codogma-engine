namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXBarrelCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Barrel> {

        constructor() {
            super("Barrel");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Barrel): void {

            // Phaser 4 signature: addBarrel(amount)
            call.argFloat(fx.amount);
        }
    }
}
