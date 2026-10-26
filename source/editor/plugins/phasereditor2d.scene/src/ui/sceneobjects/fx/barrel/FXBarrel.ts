/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXBarrel extends FXObject {

        private _editorSupport: FXBarrelEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXBarrelExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addBarrel();

            this._editorSupport = new FXBarrelEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Barrel {

            return super.getPhaserFX() as Phaser.Filters.Barrel;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
