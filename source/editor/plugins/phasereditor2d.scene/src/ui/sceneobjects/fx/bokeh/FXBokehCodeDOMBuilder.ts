namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXBokehCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.Bokeh> {

        constructor() {
            super("Bokeh");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.Bokeh): void {

            // Phaser 4 signature: addBokeh(radius, amount, contrast)
            // Limitation: the Tilt Shift variant (isTiltShift / blurX / blurY /
            // strength parameters) is not exposed by the editor.
            call.argFloat(fx.radius);
            call.argFloat(fx.amount);
            call.argFloat(fx.contrast);
        }
    }
}
