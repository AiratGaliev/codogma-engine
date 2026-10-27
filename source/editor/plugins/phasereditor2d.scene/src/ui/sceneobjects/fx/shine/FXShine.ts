/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    // shortcut: Phaser 4.2.1 runtime does not include FXShine (premium/Phaser Studio feature)
    // pipeline.addShine() and Phaser.Filters.Shine do not exist in open-source Phaser 4.2.1

    export class FXShine extends FXObject {

        private _editorSupport: FXShineEditorSupport;

        speed = 0.5;
        lineWidth = 0.5;
        gradient = 3;
        reveal = false;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXShineExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            // shortcut: pipeline.addShine() not available in Phaser 4.2.1 open-source

            this._editorSupport = new FXShineEditorSupport(this, scene);
        }

        getPhaserFX() {
            return super.getPhaserFX();
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}