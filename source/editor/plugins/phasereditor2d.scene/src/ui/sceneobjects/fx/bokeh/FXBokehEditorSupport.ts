/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBokehEditorSupport extends FXObjectEditorSupport<FXBokeh> {

        constructor(obj: FXBokeh, scene: Scene) {
            super(FXBokehExtension.getInstance(), obj, scene);

            this.addComponent(new FXBokehComponent(obj));
        }
    }
}
