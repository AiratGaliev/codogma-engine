/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGradientEditorSupport extends FXObjectEditorSupport<FXGradient> {

        constructor(obj: FXGradient, scene: Scene) {
            super(FXGradientExtension.getInstance(), obj, scene);
            this.addComponent(new FXGradientComponent(obj));
        }
    }
}