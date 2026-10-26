/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlockyEditorSupport extends FXObjectEditorSupport<FXBlocky> {

        constructor(obj: FXBlocky, scene: Scene) {
            super(FXBlockyExtension.getInstance(), obj, scene);

            this.addComponent(new FXBlockyComponent(obj));
        }
    }
}
