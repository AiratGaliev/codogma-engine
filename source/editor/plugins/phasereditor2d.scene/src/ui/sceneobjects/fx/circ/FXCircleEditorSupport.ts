/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCircleEditorSupport extends FXObjectEditorSupport<FXCircle> {

        constructor(obj: FXCircle, scene: Scene) {
            super(FXCircleExtension.getInstance(), obj, scene);
            this.addComponent(new FXCircleComponent(obj));
        }
    }
}