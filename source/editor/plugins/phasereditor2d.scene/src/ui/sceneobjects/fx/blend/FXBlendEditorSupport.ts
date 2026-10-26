/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlendEditorSupport extends FXObjectEditorSupport<FXBlend> {

        constructor(obj: FXBlend, scene: Scene) {
            super(FXBlendExtension.getInstance(), obj, scene);

            this.addComponent(new FXBlendComponent(obj));
        }
    }
}
