/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXQuantizeEditorSupport extends FXObjectEditorSupport<FXQuantize> {

        constructor(obj: FXQuantize, scene: Scene) {
            super(FXQuantizeExtension.getInstance(), obj, scene);

            this.addComponent(new FXQuantizeComponent(obj));
        }
    }
}
