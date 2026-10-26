/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXWipe extends FXObject {

        private _editorSupport: FXWipeEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXWipeExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addWipe();

            this._editorSupport = new FXWipeEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Wipe {

            return super.getPhaserFX() as Phaser.Filters.Wipe;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
