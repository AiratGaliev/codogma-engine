/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBokeh extends FXObject {

        private _editorSupport: FXBokehEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXBokehExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addBokeh();

            this._editorSupport = new FXBokehEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Bokeh {

            return super.getPhaserFX() as Phaser.Filters.Bokeh;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
