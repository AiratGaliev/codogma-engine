namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXColorMatrixCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.ColorMatrix> {

        constructor() {
            super("ColorMatrix");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.ColorMatrix): void {

            // Phaser 4 signature: addColorMatrix()
            // Limitation: the color matrix is runtime-managed
            // (e.g. `filter.colorMatrix.sepia()`), nothing is emitted here.
        }
    }
}
