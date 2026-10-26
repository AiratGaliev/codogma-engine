/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXGradientMap extends FXObject {

        private _editorSupport: FXGradientMapEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXGradientMapExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addGradientMap();

            this._editorSupport = new FXGradientMapEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.GradientMap {

            return super.getPhaserFX() as Phaser.Filters.GradientMap;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
