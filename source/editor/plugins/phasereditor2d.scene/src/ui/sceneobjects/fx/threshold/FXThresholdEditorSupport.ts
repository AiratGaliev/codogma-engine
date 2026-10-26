/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXThresholdEditorSupport extends FXObjectEditorSupport<FXThreshold> {

        constructor(obj: FXThreshold, scene: Scene) {
            super(FXThresholdExtension.getInstance(), obj, scene);

            this.addComponent(new FXThresholdComponent(obj));
        }
    }
}
