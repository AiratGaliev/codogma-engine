/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXQuantize extends FXObject {

        private _editorSupport: FXQuantizeEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXQuantizeExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addQuantize();

            this._editorSupport = new FXQuantizeEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Quantize {

            return super.getPhaserFX() as Phaser.Filters.Quantize;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
