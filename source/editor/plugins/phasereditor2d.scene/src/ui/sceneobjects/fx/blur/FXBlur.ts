/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBlur extends FXObject {

        private _editorSupport: FXBlurEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXBlurExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addBlur();

            this._editorSupport = new FXBlurEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Blur {

            return super.getPhaserFX() as Phaser.Filters.Blur;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
