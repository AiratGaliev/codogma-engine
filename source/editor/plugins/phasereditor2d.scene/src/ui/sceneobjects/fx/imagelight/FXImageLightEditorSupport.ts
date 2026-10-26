/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXImageLightEditorSupport extends FXObjectEditorSupport<FXImageLight> {

        constructor(obj: FXImageLight, scene: Scene) {
            super(FXImageLightExtension.getInstance(), obj, scene);

            this.addComponent(new FXImageLightComponent(obj));
        }
    }
}
