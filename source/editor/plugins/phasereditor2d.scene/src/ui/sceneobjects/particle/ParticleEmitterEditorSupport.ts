/// <reference path="../GameObjectEditorSupport.ts" />
/// <reference path="./ParticleEmitterComponent.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterEditorSupport extends GameObjectEditorSupport<ParticleEmitter> {

        constructor(obj: ParticleEmitter, scene: Scene) {
            super(ParticleEmitterExtension.getInstance(), obj, scene);

            this.addComponent(
                new TransformComponent(obj as unknown as ITransformLikeObject),
                new VisibleComponent(obj as unknown as IVisibleLikeObject),
                new AlphaSingleComponent(obj as unknown as IAlphaSingleLikeObject),
                new ParticleEmitterComponent(obj)
            );
        }

        getCellRenderer(): controls.viewers.ICellRenderer {

            return new controls.viewers.IconImageCellRenderer(resources.getIcon(resources.ICON_PLAY));
        }

        setInteractive(): void {

            const obj = this.getObject();

            const self = obj as any;

            obj.setInteractive(
                new Phaser.Geom.Rectangle(0, 0, self.width || 32, self.height || 32),
                Phaser.Geom.Rectangle.Contains);
        }

        computeContentHash(): string {

            let hash = super.computeContentHash();

            hash += this.computeContentHashWithComponent(this.getObject(), ParticleEmitterComponent);

            return hash;
        }
    }
}
