/// <reference path="../GameObjectEditorSupport.ts" />
/// <reference path="./VideoComponent.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class VideoEditorSupport extends GameObjectEditorSupport<Video> {

        constructor(obj: Video, scene: Scene) {
            super(VideoExtension.getInstance(), obj, scene);

            this.addComponent(
                new TransformComponent(obj as unknown as ITransformLikeObject),
                new OriginComponent(obj as unknown as IOriginLikeObject),
                new AlphaComponent(obj as unknown as IAlphaLikeObject),
                new VisibleComponent(obj as unknown as IVisibleLikeObject),
                new VideoComponent(obj)
            );
        }

        getCellRenderer(): controls.viewers.ICellRenderer {

            return new controls.viewers.IconImageCellRenderer(resources.getIcon(resources.ICON_FILE_VIDEO));
        }

        setInteractive(): void {

            this.getObject().setInteractive();
        }

        computeContentHash(): string {

            let hash = super.computeContentHash();

            hash += this.computeContentHashWithComponent(this.getObject(), VideoComponent);

            return hash;
        }
    }
}
