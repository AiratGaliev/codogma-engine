/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXPanoramaBlurEditorSupport extends FXObjectEditorSupport<FXPanoramaBlur> {

        constructor(obj: FXPanoramaBlur, scene: Scene) {
            super(FXPanoramaBlurExtension.getInstance(), obj, scene);

            this.addComponent(new FXPanoramaBlurComponent(obj));
        }
    }
}
