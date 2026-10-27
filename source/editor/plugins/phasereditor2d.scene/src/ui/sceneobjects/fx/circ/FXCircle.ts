/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    // shortcut: Phaser 4.2.1 runtime does not include FXCircle (premium/Phaser Studio feature)
    // pipeline.addCircle() and Phaser.Filters.Circle do not exist in open-source Phaser 4.2.1

    export class FXCircle extends FXObject {

        private _editorSupport: FXCircleEditorSupport;

        thickness = 8;
        color = "#ff33b2";
        backgroundColor = "#ff0000";
        scale = 1;
        feather = 0.005;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXCircleExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            // shortcut: pipeline.addCircle() not available in Phaser 4.2.1 open-source

            this._editorSupport = new FXCircleEditorSupport(this, scene);
        }

        getPhaserFX() {
            return super.getPhaserFX();
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}