/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXPixelateEditorSupport extends FXObjectEditorSupport<FXPixelate> {

        constructor(obj: FXPixelate, scene: Scene) {
            super(FXPixelateExtension.getInstance(), obj, scene);

            this.addComponent(new FXPixelateComponent(obj));
        }
    }
}
