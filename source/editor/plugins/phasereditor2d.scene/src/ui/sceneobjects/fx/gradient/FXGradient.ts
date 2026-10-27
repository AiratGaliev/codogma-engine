/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    // shortcut: Phaser 4.2.1 runtime does not include FXGradient (premium/Phaser Studio feature)
    // pipeline.addGradient() and Phaser.Filters.Gradient do not exist in open-source Phaser 4.2.1

    export class FXGradient extends FXObject {

        private _editorSupport: FXGradientEditorSupport;

        color1 = "#ff0000";
        color2 = "#00ff00";
        alpha = 0.2;
        fromX = 0;
        fromY = 0;
        toX = 0;
        toY = 1;
        size = 0;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXGradientExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            // shortcut: pipeline.addGradient() not available in Phaser 4.2.1 open-source

            this._editorSupport = new FXGradientEditorSupport(this, scene);
        }

        getPhaserFX() {
            return super.getPhaserFX();
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}