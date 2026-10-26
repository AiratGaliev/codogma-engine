namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXNormalToolsCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.NormalTools> {

        constructor() {
            super("NormalTools");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.NormalTools): void {

            // Phaser 4 signature: addNormalTools(config)
            // The config is emitted as an object literal argument.
            // Limitation: the `viewMatrix` (3D rotation), the `rotationSource`
            // and the `ratioVector` are not exposed by the editor.
            call.arg(`{ rotation: ${fx.getRotation()}, facingPower: ${fx.facingPower}, outputRatio: ${fx.outputRatio}, ratioRadius: ${fx.ratioRadius} }`);
        }
    }
}
