/// <reference path="../FXProperty.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixComponent extends Component<FXColorMatrix> {

        // Limitation: the color transformations of the ColorMatrix
        // (sepia(), grayscale(), brightness(), contrast(), ... applied to the
        // internal Phaser.Display.ColorMatrix instance) are not exposed by
        // the editor, they are managed in user code
        // (e.g. `filter.colorMatrix.sepia()`).

        constructor(obj: FXColorMatrix) {
            super(obj, []);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {
            // Nothing to generate: the color matrix is runtime-managed
            // (see the limitation above).
        }
    }
}
