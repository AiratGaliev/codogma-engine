namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class VideoAssetCellRendererExtension extends phasereditor2d.pack.ui.AssetPackViewerExtension {

        acceptObject(obj: any): boolean {

            return obj instanceof phasereditor2d.pack.core.VideoAssetPackItem;
        }

        getLabel(obj: any): string {

            return obj.getKey();
        }

        getCellRenderer(asset: any): controls.viewers.ICellRenderer {

            return new VideoCellRenderer();
        }
    }
}