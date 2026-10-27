/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    // shortcut: Phaser 4.2.1 runtime does not include FXBloom (premium/Phaser Studio feature)
    // pipeline.addBloom() and Phaser.Filters.Bloom do not exist in open-source Phaser 4.2.1

    export class FXBloom extends FXObject {

        private _editorSupport: FXBloomEditorSupport;

        color = "#ffffff";
        offsetX = 1;
        offsetY = 1;
        blurStrength = 1;
        strength = 1;
        steps = 4;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXBloomExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            // shortcut: pipeline.addBloom() not available in Phaser 4.2.1 open-source

            this._editorSupport = new FXBloomEditorSupport(this, scene);
        }

        getPhaserFX() {
            return super.getPhaserFX();
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}