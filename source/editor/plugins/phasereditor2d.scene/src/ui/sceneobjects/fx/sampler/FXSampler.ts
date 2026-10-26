/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    /**
     * A Sampler filter: it reads pixel data from the rendered output and passes
     * it to a callback. It does not alter the rendered image.
     *
     * Limitation: the editor provides a no-op callback (the Sampler would crash
     * at render time without one). In the generated code the callback is emitted
     * as a no-op placeholder too: user code should assign `filter.callback` to
     * receive the sampled data.
     */
    export class FXSampler extends FXObject {

        private _editorSupport: FXSamplerEditorSupport;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXSamplerExtension.getInstance().getTypeName(), parent, preFX);

            const pipeline = this.getPipeline();

            // The editor uses a no-op callback: the Sampler calls it on every
            // render, a missing callback would break the editor preview.
            this._phaserFX = pipeline.addSampler(() => {
                // editor placeholder callback
            });

            this._editorSupport = new FXSamplerEditorSupport(this, scene);
        }

        getPhaserFX(): Phaser.Filters.Sampler {

            return super.getPhaserFX() as Phaser.Filters.Sampler;
        }

        getEditorSupport() {

            return this._editorSupport;
        }
    }
}
