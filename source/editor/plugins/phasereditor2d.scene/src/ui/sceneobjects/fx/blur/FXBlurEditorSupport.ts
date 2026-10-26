/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlurEditorSupport extends FXObjectEditorSupport<FXBlur> {

        constructor(obj: FXBlur, scene: Scene) {
            super(FXBlurExtension.getInstance(), obj, scene);

            this.addComponent(new FXBlurComponent(obj));
        }
    }
}
