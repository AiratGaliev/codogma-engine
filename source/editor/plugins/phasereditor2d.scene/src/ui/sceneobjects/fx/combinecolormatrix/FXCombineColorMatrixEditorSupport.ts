/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCombineColorMatrixEditorSupport extends FXObjectEditorSupport<FXCombineColorMatrix> {

        constructor(obj: FXCombineColorMatrix, scene: Scene) {
            super(FXCombineColorMatrixExtension.getInstance(), obj, scene);

            this.addComponent(new FXCombineColorMatrixComponent(obj));
        }
    }
}
