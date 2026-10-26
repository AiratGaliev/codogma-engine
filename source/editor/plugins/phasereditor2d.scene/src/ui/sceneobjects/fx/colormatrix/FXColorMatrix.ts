/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A Color Matrix filter: it transforms the colors of the image with a
     * mathematical matrix (hue, saturation, brightness, contrast, ...).
     *
     * Limitation: the color transformations are applied to the internal
     * `Phaser.Display.ColorMatrix` instance (e.g. `filter.colorMatrix.sepia()`),
     * they are not exposed by the editor: it only emits the filter creation.
     * The matrix can be configured in user code.
     */
    export class FXColorMatrix extends FXObject {

        private _editorSupport: FXColorMatrixEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXColorMatrixExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addColorMatrix();

            this._editorSupport = new FXColorMatrixEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.ColorMatrix {

            return super.getPhaserFX() as Phaser.Filters.ColorMatrix;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
