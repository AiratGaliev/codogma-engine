/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXObjectMaskEditorSupport extends FXObjectEditorSupport<FXObjectMask> {

        constructor(obj: FXObjectMask, scene: Scene) {
            super(FXObjectMaskExtension.getInstance(), obj, scene);

            this.addComponent(new FXObjectMaskComponent(obj));
        }
    }
}
