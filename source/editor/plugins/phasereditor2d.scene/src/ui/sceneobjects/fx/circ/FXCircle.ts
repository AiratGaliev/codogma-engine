/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXCircle extends FXObject {
        private _editorSupport: FXCircleEditorSupport;
        shape = "circle";
        aspectRatio = 1;
        invert = false;
        blurRadius = 0;
        blurSteps = 4;
        blurQuality = 0;
        scaleMode = 0;
        padding = 0;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXCircleExtension.getInstance().getTypeName(), parent, preFX);
            this._editorSupport = new FXCircleEditorSupport(this, scene);
            this.refreshFX();
        }

        refreshFX(): void {
            this.removeFX();
            const parent = this.getParent() as any;
            if (!parent) {
                return;
            }
            const mask = Phaser.Actions.AddMaskShape(parent, {
                shape: this.shape,
                aspectRatio: this.aspectRatio,
                invert: this.invert,
                useInternal: this.isPreFX(),
                blurRadius: Math.max(0, this.blurRadius),
                blurSteps: Math.max(1, Math.round(this.blurSteps)),
                blurQuality: Math.max(0, Math.min(2, Math.round(this.blurQuality))),
                scaleMode: this.scaleMode,
                padding: Math.max(0, this.padding)
            })[0];
            this.setFXCleanup(() => {
                const target = this.getParent() as any;
                if (target && target.filters && mask) {
                    (this.isPreFX() ? target.filters.internal : target.filters.external).remove(mask);
                }
            });
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}
