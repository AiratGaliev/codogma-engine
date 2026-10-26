/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A Panorama Blur filter: it blurs a panorama image treating a rectangular
     * map as a sphere. It is intended for environment maps (e.g. ImageLight).
     *
     * Altering the samples triggers a shader re-compile, keep them low.
     */
    export class FXPanoramaBlur extends FXObject {

        private _editorSupport: FXPanoramaBlurEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXPanoramaBlurExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addPanoramaBlur({});

            this._editorSupport = new FXPanoramaBlurEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.PanoramaBlur {

            return super.getPhaserFX() as Phaser.Filters.PanoramaBlur;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
