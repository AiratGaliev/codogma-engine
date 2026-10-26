/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A Combine Color Matrix filter: it combines color channels from two
     * textures (the base input and a transfer texture), each transformed by
     * its own ColorMatrix.
     *
     * Limitation: the color matrices (`colorMatrixSelf`, `colorMatrixTransfer`),
     * the `additions` / `multiplications` weights, and the `setupAlphaTransfer()`
     * preset are not exposed by the editor: they are managed in user code.
     * Only the transfer texture is editable.
     */
    export class FXCombineColorMatrix extends FXObject {

        private _editorSupport: FXCombineColorMatrixEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXCombineColorMatrixExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            // The transfer texture is applied by the component (cached key + setTexture()).
            this._phaserFX = pipeline.addCombineColorMatrix();

            this._editorSupport = new FXCombineColorMatrixEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.CombineColorMatrix {

            return super.getPhaserFX() as Phaser.Filters.CombineColorMatrix;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
