/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXDisplacementEditorSupport extends FXObjectEditorSupport<FXDisplacement> {

        constructor(obj: FXDisplacement, scene: Scene) {
            super(FXDisplacementExtension.getInstance(), obj, scene);

            this.addComponent(new FXDisplacementComponent(obj));
        }
    }
}
