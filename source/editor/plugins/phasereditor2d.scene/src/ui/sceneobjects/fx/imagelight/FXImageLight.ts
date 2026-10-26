/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXImageLight extends FXObject {

        private _editorSupport: FXImageLightEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXImageLightExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            // The ImageLight constructor requires a config object,
            // the texture keys are applied by the component (cached keys).
            this._phaserFX = pipeline.addImageLight({});

            this._editorSupport = new FXImageLightEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.ImageLight {

            return super.getPhaserFX() as Phaser.Filters.ImageLight;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
