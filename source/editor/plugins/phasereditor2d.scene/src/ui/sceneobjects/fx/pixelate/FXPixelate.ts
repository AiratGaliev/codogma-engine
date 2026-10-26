/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXPixelate extends FXObject {

        private _editorSupport: FXPixelateEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXPixelateExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addPixelate();

            this._editorSupport = new FXPixelateEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Pixelate {

            return super.getPhaserFX() as Phaser.Filters.Pixelate;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
