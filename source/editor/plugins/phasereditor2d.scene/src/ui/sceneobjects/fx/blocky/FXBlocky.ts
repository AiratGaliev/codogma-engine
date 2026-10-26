/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A Blocky filter: it reduces the resolution of the image by filling
     * blocks of pixels with the color of their central pixel.
     *
     * In Phaser 4, Blocky.size and Blocky.offset are Vector2Like objects
     * ({x, y}), the editor exposes their components as single numbers.
     */
    export class FXBlocky extends FXObject {

        private _editorSupport: FXBlockyEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXBlockyExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addBlocky();

            this._editorSupport = new FXBlockyEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Blocky {

            return super.getPhaserFX() as Phaser.Filters.Blocky;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
