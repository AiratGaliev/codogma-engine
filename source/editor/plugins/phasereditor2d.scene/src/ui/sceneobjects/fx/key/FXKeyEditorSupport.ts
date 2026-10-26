/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXKeyEditorSupport extends FXObjectEditorSupport<FXKey> {

        constructor(obj: FXKey, scene: Scene) {
            super(FXKeyExtension.getInstance(), obj, scene);

            this.addComponent(new FXKeyComponent(obj));
        }
    }
}
