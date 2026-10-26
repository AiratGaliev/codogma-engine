/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A Normal Tools filter: it manipulates the normals of a normal map
     * (rotate it, change how strongly the normals face the camera, or output
     * a grayscale facing-ratio texture).
     *
     * Limitation: the `viewMatrix` (3D rotation), the `rotationSource` and the
     * `ratioVector` are not exposed by the editor, they are managed in user code.
     */
    export class FXNormalTools extends FXObject {

        private _editorSupport: FXNormalToolsEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXNormalToolsExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addNormalTools({});

            this._editorSupport = new FXNormalToolsEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.NormalTools {

            return super.getPhaserFX() as Phaser.Filters.NormalTools;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
