/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXBloom extends FXObject {
        private _editorSupport: FXBloomEditorSupport;
        threshold = 0.5;
        blurRadius = 2;
        blurSteps = 4;
        blurQuality = 0;
        blendAmount = 1;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXBloomExtension.getInstance().getTypeName(), parent, preFX);
            this._editorSupport = new FXBloomEditorSupport(this, scene);
            this.refreshFX();
        }

        refreshFX(): void {
            this.removeFX();
            const parent = this.getParent() as any;
            if (!parent) {
                return;
            }
            const effect = Phaser.Actions.AddEffectBloom(parent, {
                threshold: this.threshold,
                blurRadius: Math.max(0, this.blurRadius),
                blurSteps: Math.max(1, Math.round(this.blurSteps)),
                blurQuality: Math.max(0, Math.min(2, Math.round(this.blurQuality))),
                blendAmount: Math.max(0, this.blendAmount),
                useInternal: this.isPreFX()
            })[0];
            if (effect) {
                this.setFXCleanup(() => effect.parallelFilters.destroy());
            }
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}
