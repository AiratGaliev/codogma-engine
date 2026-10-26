/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXVignetteEditorSupport extends FXObjectEditorSupport<FXVignette> {

        constructor(obj: FXVignette, scene: Scene) {
            super(FXVignetteExtension.getInstance(), obj, scene);

            this.addComponent(new FXVignetteComponent(obj));
        }
    }
}
