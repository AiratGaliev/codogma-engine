namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class FXCombineColorMatrixCodeDOMBuilder extends FXObjectCodeDOMBuilder<Phaser.Filters.CombineColorMatrix> {

        constructor() {
            super("CombineColorMatrix");
        }

        buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: Phaser.Filters.CombineColorMatrix): void {

            // Phaser 4 signature: addCombineColorMatrix(texture)
            // Limitation: the color matrices (colorMatrixSelf / colorMatrixTransfer),
            // the additions / multiplications weights, and the setupAlphaTransfer()
            // preset are runtime-managed, nothing else is emitted here.
            const texture = FXGetTextureKey(fx, "texture", "");

            if (texture) {

                call.arg(JSON.stringify(texture));
            }
        }
    }
}
