/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBarrelEditorSupport extends FXObjectEditorSupport<FXBarrel> {

        constructor(obj: FXBarrel, scene: Scene) {
            super(FXBarrelExtension.getInstance(), obj, scene);

            this.addComponent(new FXBarrelComponent(obj));
        }
    }
}
