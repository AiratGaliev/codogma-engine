/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A Parallel Filters controller: it splits the input into two filter lists
     * (`top` and `bottom`), runs each list independently, and blends the results
     * with its `blend` controller (a Phaser.Filters.Blend).
     *
     * Limitation: the editor does not expose the filters of the `top` and
     * `bottom` lists, nor the `blend` configuration. They are managed in user
     * code (e.g. `filter.top.addBlur()`, `filter.blend.blendMode = ...`).
     */
    export class FXParallelFilters extends FXObject {

        private _editorSupport: FXParallelFiltersEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXParallelFiltersExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            this._phaserFX = pipeline.addParallelFilters();

            this._editorSupport = new FXParallelFiltersEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.ParallelFilters {

            return super.getPhaserFX() as Phaser.Filters.ParallelFilters;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
