/// <reference path="../FXObject.ts" />
namespace phasereditor2d.scene.ui.sceneobjects {

    export class FXCircle extends FXObject {

        private _editorSupport: FXCircleEditorSupport;

        thickness = 8;
        color = "#ff33b2";
        backgroundColor = "#ff0000";
        scale = 1;
        feather = 0.005;

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

            const dimensions = () => ({
                width: Math.max(1, parent.width ?? parent.displayWidth ?? 128),
                height: Math.max(1, parent.height ?? parent.displayHeight ?? 128)
            });
            const { width, height } = dimensions();
            const circleScale = Math.max(0.01, this.scale);
            const circleWidth = width * circleScale;
            const circleHeight = height * circleScale;

            const mask = Phaser.Actions.AddMaskShape(parent, {
                shape: "circle",
                aspectRatio: 1,
                useInternal: true,
                region: new Phaser.Geom.Rectangle(
                    (width - circleWidth) / 2,
                    (height - circleHeight) / 2,
                    circleWidth,
                    circleHeight
                ),
                blurRadius: Math.max(0, this.feather * Math.max(width, height)),
                blurSteps: 4,
                blurQuality: 1,
                scaleMode: 0,
                padding: 0
            })[0];

            const background = this.scene.add.rectangle(
                parent.x ?? 0,
                parent.y ?? 0,
                width,
                height,
                parseInt(this.backgroundColor.replace("#", ""), 16),
                0.4
            );
            const ring = this.scene.add.graphics();
            let lastWidth = width;
            let lastHeight = height;

            const sync = () => {

                const target = this.getParent() as any;

                if (!target || !background.active || !ring.active) {
                    return;
                }

                const size = {
                    width: Math.max(1, target.width ?? target.displayWidth ?? 128),
                    height: Math.max(1, target.height ?? target.displayHeight ?? 128)
                };

                if (size.width !== lastWidth || size.height !== lastHeight) {
                    this.refreshFX();
                    return;
                }

                background.setPosition(target.x ?? 0, target.y ?? 0);
                background.setSize(size.width, size.height);
                background.setOrigin(target.originX ?? 0.5, target.originY ?? 0.5);
                background.setRotation(target.rotation ?? 0);
                background.setScale(target.scaleX ?? 1, target.scaleY ?? 1);
                background.setAlpha((target.alpha ?? 1) * 0.4);
                background.setVisible(target.active !== false && target.visible !== false);
                background.setDepth((target.depth ?? 0) - 0.001);
                background.setScrollFactor(target.scrollFactorX ?? 1, target.scrollFactorY ?? 1);

                const color = parseInt(this.color.replace("#", ""), 16);
                const originX = target.originX ?? 0.5;
                const originY = target.originY ?? 0.5;
                const x = -originX * size.width + (size.width - size.width * circleScale) / 2;
                const y = -originY * size.height + (size.height - size.height * circleScale) / 2;

                ring.clear();
                ring.lineStyle(Math.max(0.01, this.thickness), color, 1);
                ring.strokeEllipse(x, y, size.width * circleScale, size.height * circleScale);
                ring.setPosition(target.x ?? 0, target.y ?? 0);
                ring.setRotation(target.rotation ?? 0);
                ring.setScale(target.scaleX ?? 1, target.scaleY ?? 1);
                ring.setAlpha(target.alpha ?? 1);
                ring.setVisible(target.active !== false && target.visible !== false);
                ring.setDepth((target.depth ?? 0) + 0.001);
                ring.setScrollFactor(target.scrollFactorX ?? 1, target.scrollFactorY ?? 1);

                if (target.parentContainer) {
                    const container = target.parentContainer;
                    if (background.parentContainer !== container) {
                        container.addAt(background, Math.max(0, container.getIndex(target)));
                    }
                    if (ring.parentContainer !== container) {
                        container.addAt(ring, container.getIndex(target) + 1);
                    }
                }
            };

            const parentDestroyed = () => this.removeFX();

            this.scene.events.on("update", sync);
            parent.once("destroy", parentDestroyed);
            background.once("destroy", () => this.scene.events.off("update", sync));
            ring.once("destroy", () => this.scene.events.off("update", sync));

            this.setFXCleanup(() => {
                this.scene.events.off("update", sync);
                parent.off("destroy", parentDestroyed);
                if (parent.filters && mask) {
                    parent.filters.internal.remove(mask);
                }
                if (background.active) {
                    background.destroy();
                }
                if (ring.active) {
                    ring.destroy();
                }
            });

            sync();
        }

        getEditorSupport() {
            return this._editorSupport;
        }
    }
}
