/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXColorMatrixEditorSupport extends FXObjectEditorSupport<FXColorMatrix> {

        constructor(obj: FXColorMatrix, scene: Scene) {
            super(FXColorMatrixExtension.getInstance(), obj, scene);

            this.addComponent(new FXColorMatrixComponent(obj));
        }
    }
}
