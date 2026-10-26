/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A mask filter intended to be backed by a GameObject.
     *
     * Limitation: the editor cannot pick the mask GameObject (there is no object
     * picker for filters). The mask source defaults to the white texture
     * ('__WHITE'), so the filter is a pass-through until a GameObject or texture
     * is assigned in user code (`filter.setGameObject(obj)` / `filter.setTexture(key)`).
     * The `invert`, `autoUpdate` and `scaleFactor` properties are editable.
     */
    export class FXObjectMask extends FXObject {

        private _editorSupport: FXObjectMaskEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXObjectMaskExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addMask();

            this._editorSupport = new FXObjectMaskEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Mask {

            return super.getPhaserFX() as Phaser.Filters.Mask;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
