/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXWipeEditorSupport extends FXObjectEditorSupport<FXWipe> {

        constructor(obj: FXWipe, scene: Scene) {
            super(FXWipeExtension.getInstance(), obj, scene);

            this.addComponent(new FXWipeComponent(obj));
        }
    }
}
