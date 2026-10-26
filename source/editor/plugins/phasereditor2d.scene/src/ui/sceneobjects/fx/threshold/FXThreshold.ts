/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXThreshold extends FXObject {

        private _editorSupport: FXThresholdEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXThresholdExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addThreshold();

            this._editorSupport = new FXThresholdEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Threshold {

            return super.getPhaserFX() as Phaser.Filters.Threshold;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
