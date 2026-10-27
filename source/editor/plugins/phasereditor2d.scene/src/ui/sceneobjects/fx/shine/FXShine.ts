/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXShine extends FXObject {
        private _editorSupport: FXShineEditorSupport;
        radius = 0.5;
        direction = 0.5;
        scale = 2;
        duration = 2000;
        reveal = false;
        yoyo = false;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXShineExtension.getInstance().getTypeName(), parent, preFX);
            this._editorSupport = new FXShineEditorSupport(this, scene);
            this.refreshFX();
        }

        refreshFX(): void {
            this.removeFX();
            const parent = this.getParent() as any;
            if (!parent) {
                return;
            }
            const before = typeof parent.listeners === "function" ? parent.listeners("destroy") : [];
            const effect = Phaser.Actions.AddEffectShine(parent, {
                radius: Math.max(0.01, this.radius),
                direction: this.direction,
                scale: Math.max(0.1, this.scale),
                duration: Math.max(1, this.duration),
                reveal: this.reveal,
                yoyo: this.yoyo,
                useExternal: !this.isPreFX()
            })[0];
            const after = typeof parent.listeners === "function" ? parent.listeners("destroy") : [];
            const actionListeners = after.filter((listener: any) => !before.includes(listener));
            const parentDestroyed = () => this.removeFX();
            parent.once("destroy", parentDestroyed);
            this.setFXCleanup(() => {
                actionListeners.forEach((listener: any) => parent.off("destroy", listener));
                parent.off("destroy", parentDestroyed);
                if (effect?.parallelFilters) {
                    effect.parallelFilters.destroy();
                } else {
                    effect?.blendFilter?.destroy();
                }
                effect?.tween?.destroy();
                effect?.dynamicTexture?.destroy();
            });
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}
