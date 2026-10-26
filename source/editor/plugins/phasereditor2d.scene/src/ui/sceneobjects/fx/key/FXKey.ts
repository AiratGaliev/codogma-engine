/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXKey extends FXObject {

        private _editorSupport: FXKeyEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXKeyExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addKey();

            this._editorSupport = new FXKeyEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Key {

            return super.getPhaserFX() as Phaser.Filters.Key;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
