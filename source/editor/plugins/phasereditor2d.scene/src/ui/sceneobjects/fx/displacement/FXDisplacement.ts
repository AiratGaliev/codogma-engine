/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXDisplacement extends FXObject {

        private _editorSupport: FXDisplacementEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXDisplacementExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addDisplacement();

            this._editorSupport = new FXDisplacementEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Displacement {

            return super.getPhaserFX() as Phaser.Filters.Displacement;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
