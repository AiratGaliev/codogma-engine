/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A mask filter backed by a static texture.
     *
     * Limitation: the editor only supports texture masks. The GameObject-based
     * mask features (`autoUpdate`, `viewCamera`, `viewTransform`, `needsUpdate`)
     * are not exposed, they only apply when the mask is a GameObject.
     * Use the ObjectMask filter for GameObject masks (also limited in the editor).
     */
    export class FXTextureMask extends FXObject {

        private _editorSupport: FXTextureMaskEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXTextureMaskExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            // The mask texture is applied by the component (cached key + setTexture()).
            this._phaserFX = pipeline.addMask();

            this._editorSupport = new FXTextureMaskEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Mask {

            return super.getPhaserFX() as Phaser.Filters.Mask;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
