/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXNormalToolsEditorSupport extends FXObjectEditorSupport<FXNormalTools> {

        constructor(obj: FXNormalTools, scene: Scene) {
            super(FXNormalToolsExtension.getInstance(), obj, scene);

            this.addComponent(new FXNormalToolsComponent(obj));
        }
    }
}
