namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXThresholdCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Threshold> {

        constructor() {
            super("Threshold");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Threshold): void {

            // Phaser 4 signature: addThreshold(edge1, edge2, invert)
            // The edges and invert flags are per-channel arrays in the Phaser
            // filter. The editor applies a single value to the 4 channels,
            // so a single number/boolean (the first channel) is emitted:
            // it is applied to all channels at runtime.
            call.argFloat(fx.edge1[0]);
            call.argFloat(fx.edge2[0]);
            call.argBool(fx.invert[0]);
        }
    }
}
