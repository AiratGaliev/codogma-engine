/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXSamplerEditorSupport extends FXObjectEditorSupport<FXSampler> {

        constructor(obj: FXSampler, scene: Scene) {
            super(FXSamplerExtension.getInstance(), obj, scene);

            this.addComponent(new FXSamplerComponent(obj));
        }
    }
}
