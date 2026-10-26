/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXVignette extends FXObject {

        private _editorSupport: FXVignetteEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXVignetteExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addVignette();

            this._editorSupport = new FXVignetteEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Vignette {

            return super.getPhaserFX() as Phaser.Filters.Vignette;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
