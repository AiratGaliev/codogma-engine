/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXShineEditorSupport extends FXObjectEditorSupport<FXShine> {

        constructor(obj: FXShine, scene: Scene) {
            super(FXShineExtension.getInstance(), obj, scene);
            this.addComponent(new FXShineComponent(obj));
        }
    }
}