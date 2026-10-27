/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {
    export class FXGradient extends FXObject {
        private _editorSupport: FXGradientEditorSupport;
        color1 = "#ff0000";
        color2 = "#00ff00";
        alpha = 0.2;
        fromX = 0;
        fromY = 0;
        toX = 0;
        toY = 1;
        size = 0;

        constructor(scene: Scene, parent: ISceneGameObject, preFX: boolean) {
            super(scene, FXGradientExtension.getInstance().getTypeName(), parent, preFX);
            this._editorSupport = new FXGradientEditorSupport(this, scene);
            this.refreshFX();
        }

        private colorToRGBA(value: string): [number, number, number, number] {

            const color = parseInt(value.replace("#", ""), 16);

            return [
                ((color >> 16) & 0xff) / 255,
                ((color >> 8) & 0xff) / 255,
                (color & 0xff) / 255,
                this.alpha
            ];
        }

        private getGradientConfig(): any {
            return {
                bands: [{
                    colorStart: this.colorToRGBA(this.color1),
                    colorEnd: this.colorToRGBA(this.color2),
                    size: this.size > 0 ? this.size : 1
                }],
                start: { x: this.fromX, y: this.fromY },
                shape: { x: this.toX - this.fromX, y: this.toY - this.fromY },
                dither: true
            };
        }

        refreshFX(): void {
            this.removeFX();
            const parent = this.getParent() as any;
            if (!parent) {
                return;
            }
            const gradient = this.scene.add.gradient(
                this.getGradientConfig(),
                parent.x ?? 0,
                parent.y ?? 0,
                Math.max(1, parent.width ?? parent.displayWidth ?? 128),
                Math.max(1, parent.height ?? parent.displayHeight ?? 128)
            );
            const sync = () => {
                const target = this.getParent() as any;
                if (!target || !gradient.active) {
                    return;
                }
                gradient.setPosition(target.x ?? 0, target.y ?? 0);
                gradient.setSize(
                    Math.max(1, target.width ?? target.displayWidth ?? 128),
                    Math.max(1, target.height ?? target.displayHeight ?? 128)
                );
                gradient.setOrigin(target.originX ?? 0.5, target.originY ?? 0.5);
                gradient.setRotation(target.rotation ?? 0);
                gradient.setScale(target.scaleX ?? 1, target.scaleY ?? 1);
                gradient.setVisible(target.active !== false && target.visible !== false);
                gradient.setScrollFactor(target.scrollFactorX ?? 1, target.scrollFactorY ?? 1);
                gradient.setDepth((target.depth ?? 0) + 0.001);
                if (target.parentContainer && gradient.parentContainer !== target.parentContainer) {
                    const container = target.parentContainer;
                    // Keep the gradient adjacent to its parent, rather than
                    // appending it above every other child in the container.
                    container.addAt(gradient, Math.max(0, container.getIndex(target) + 1));
                }
            };
            const parentDestroyed = () => this.removeFX();
            this.scene.events.on("update", sync);
            parent.once("destroy", parentDestroyed);
            gradient.once("destroy", () => this.scene.events.off("update", sync));
            this.setFXCleanup(() => {
                this.scene.events.off("update", sync);
                parent.off("destroy", parentDestroyed);
                if (gradient.active) {
                    gradient.destroy();
                }
            });
            sync();
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}
