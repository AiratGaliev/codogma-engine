/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlend extends FXObject {

        private _editorSupport: FXBlendEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXBlendExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addBlend();

            this._editorSupport = new FXBlendEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Blend {

            return super.getPhaserFX() as Phaser.Filters.Blend;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
