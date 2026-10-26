/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXTextureMaskEditorSupport extends FXObjectEditorSupport<FXTextureMask> {

        constructor(obj: FXTextureMask, scene: Scene) {
            super(FXTextureMaskExtension.getInstance(), obj, scene);

            this.addComponent(new FXTextureMaskComponent(obj));
        }
    }
}
