/// <reference path="../FXObjectEditorSupport.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBloomEditorSupport extends FXObjectEditorSupport<FXBloom> {

        constructor(obj: FXBloom, scene: Scene) {
            super(FXBloomExtension.getInstance(), obj, scene);
            this.addComponent(new FXBloomComponent(obj));
        }
    }
}