/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGradientMapEditorSupport extends FXObjectEditorSupport<FXGradientMap> {

        constructor(obj: FXGradientMap, scene: Scene) {
            super(FXGradientMapExtension.getInstance(), obj, scene);

            this.addComponent(new FXGradientMapComponent(obj));
        }
    }
}
